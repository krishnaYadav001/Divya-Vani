// Phase 10.5 — /voice voice-to-voice orchestrator (client singleton).
// Phase 10.6 — owns audio playback directly + low-latency voice TTS.
// Phase 10.6.1 — filler clips REMOVED (sounded weird); plain thinking → reply.
//
// Runs the continuous voice loop as a finite-state machine and coordinates
// the EXISTING backend endpoints — it changes none of them:
//
//   mic → @ricky0123/vad-web (Silero v5, same assets as ChatUI's mic)
//       → POST /api/transcribe (Sarvam Saaras V3)
//       → POST /api/chat       (NDJSON stream; Sonnet reply, cookie-scoped
//                               server-side history — no conversationId in
//                               the contract, continuity rides the cookie)
//       → POST /api/tts         (ElevenLabs, body { text, mode: "voice" } →
//                               MP3; low-latency path: skips Haiku, 60-word
//                               cap) → played on the shared <audio> element
//                               this module drives directly.
//
// State machine:
//   idle → starting → listening → transcribing → thinking → speaking →
//          listening → …
//   any → error (recoverable / fatal)   any → ended (terminal)
//
// Listening amplitude comes from the VAD's onFrameProcessed frames (RMS — no
// second mic stream); speaking amplitude comes from an AnalyserNode tapped
// onto the <audio> element.
//
// Pure module — no React, no JSX. All browser APIs are touched only inside
// functions (never at module top level) so an SSR import is harmless.

import type { SafetyCard } from "@/lib/messages";

export type VoiceState =
  | "idle"
  | "starting"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error"
  | "ended";

export interface VoiceError {
  /** machine code, e.g. permission_denied | network | paywall | tts_failed */
  code: string;
  /** raw detail for logging (never shown verbatim — UI maps code → copy). */
  message: string;
  /** true → a Retry affordance makes sense; false → user must fix + reload. */
  recoverable: boolean;
}

export interface VoiceContext {
  /** 0..1 — present on listening (mic RMS) and speaking (TTS RMS) ticks. */
  amplitude?: number;
  /** present when the loop drops to the error state. */
  error?: VoiceError;
  /** present when a turn tripped the safety classifier (helpline overlay). */
  safety?: SafetyCard;
}

type Listener = (s: VoiceState, ctx?: VoiceContext) => void;

interface TranscriptTurn {
  role: "user" | "assistant";
  content: string;
}

// ── voice-turn timing instrumentation (diagnostic) ─────────────────────────
// One console line per pipeline step so a single voice turn's latency can be
// reconstructed from the browser console. Pure timing — NEVER logs the
// transcript, reply text, audio bytes, or user_id (telemetry covers PII
// separately). `lastStepAt` is module state, reset to turnStart whenever a
// `turn_start` step is logged, so per-step deltas are scoped to one turn (the
// loop is strictly sequential — at most one turn is in flight at a time).
let lastStepAt = 0;
function logTiming(turnId: string, turnStart: number, step: string): void {
  if (step === "turn_start") lastStepAt = turnStart;
  const now = performance.now();
  const elapsed_ms = Math.round(now - lastStepAt);
  const total_ms = Math.round(now - turnStart);
  console.log(
    `[voice-timing-client] req_id=${turnId} step=${step} elapsed_ms=${elapsed_ms} total_ms=${total_ms}`,
  );
  lastStepAt = now;
}

// VAD config — mirrors ChatUI's Sarvam mic (Phase 8.0), EXCEPT redemptionMs,
// which is intentionally much longer here (see below). The VAD runs
// CONTINUOUSLY for the whole session (Phase 10.5 fix); onSpeechEnd + amplitude
// are gated by state so utterances detected while not "listening" (e.g. the
// mic catching Krishna's own voice) are ignored — no barge-in (edge case 8).
const VAD_OPTIONS = {
  baseAssetPath: "/vad/",
  onnxWASMBasePath: "/vad/",
  model: "v5" as const,
  // End-of-speech grace: 3000ms of silence before the turn is declared over.
  // A natural mid-sentence pause to think must NOT cut the user off in a
  // hands-free voice loop (production bug). Founder accepts the added
  // end-of-turn latency for this; do not lower without product sign-off.
  redemptionMs: 3000,
  minSpeechMs: 250,
  preSpeechPadMs: 200,
  submitUserSpeechOnPause: true,
};

const SAFETY_CAP_MS = 60_000;
const BREATH_GAP_MS = 400;

interface MicVadInstance {
  start: () => Promise<void> | void;
  pause: () => Promise<void> | void;
  destroy: () => Promise<void> | void;
}

// Which clip is currently on the <audio> element this turn.
type PlayingPhase = "none" | "real";

class VoiceSession {
  private state: VoiceState = "idle";
  private listeners = new Set<Listener>();
  private turns: TranscriptTurn[] = [];

  // per-turn timing diagnostics — new id + clock each turn (see runPipeline T0)
  private turnId = "";
  private turnStart = 0;

  // mic / VAD
  private vad: MicVadInstance | null = null;
  private vadUtils: {
    encodeWAV: (samples: Float32Array) => ArrayBuffer;
    arrayBufferToBase64: (buf: ArrayBuffer) => string;
  } | null = null;
  private safetyCapTimer: ReturnType<typeof setTimeout> | null = null;

  // per-turn network cancellation (transcribe + chat + tts).
  private turnAbort: AbortController | null = null;

  // audio element + playback analyser (TTS amplitude)
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private speakingRaf: number | null = null;
  private audioListenersBound = false;

  // reply-audio bookkeeping
  private playingPhase: PlayingPhase = "none";
  private turnRealUrl: string | null = null; // this turn's reply blob URL
  private lastRealUrl: string | null = null; // for revoke on replace / teardown

  // safety: hold the loop after a flagged reply until the user dismisses
  private safetyHeld = false;
  private awaitingSafetyAck = false;
  // background pause bookkeeping
  private pausedFromBackground = false;

  // ── subscription ─────────────────────────────────────────────────────
  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.state);
    return () => {
      this.listeners.delete(cb);
    };
  }

  getState(): VoiceState {
    return this.state;
  }

  // "Did the user exit?" — a METHOD (not a direct field comparison) so an
  // earlier `if (this.state === "ended") return` doesn't narrow "ended" out of
  // the field for a later post-await re-check (TS can't see emit() mutating it).
  private isEnded(): boolean {
    return this.state === "ended";
  }

  getTranscript(): TranscriptTurn[] {
    return [...this.turns];
  }

  private emit(state: VoiceState, ctx?: VoiceContext): void {
    this.state = state;
    for (const cb of this.listeners) cb(state, ctx);
  }

  /** Amplitude-only tick — keeps the current state, never forces a re-render
   *  of discrete UI (subscribers compare state and skip equal transitions). */
  private emitAmplitude(amp: number): void {
    const clamped = amp < 0 ? 0 : amp > 1 ? 1 : amp;
    for (const cb of this.listeners) cb(this.state, { amplitude: clamped });
  }

  /** Surface a safety card without changing the discrete state (the helpline
   *  overlay can appear over the reply audio). */
  private surfaceSafety(card: SafetyCard): void {
    for (const cb of this.listeners) cb(this.state, { safety: card });
  }

  // Diagnostic trace of the loop (mirrors the [chat]/[tts] log style). Lets a
  // stuck session be pinpointed: speech-end fired? transcript empty? chat
  // reply empty? tts ok? playback started/ended?
  private dbg(...args: unknown[]): void {
    console.log("[voice]", ...args);
  }

  /** Emit one [voice-timing-client] line for the current turn. No-op until a
   *  turnId is assigned at T0 (so stray events between turns don't log). */
  private timing(step: string): void {
    if (this.turnId) logTiming(this.turnId, this.turnStart, step);
  }

  // ── audio element listeners ───────────────────────────────────────────
  private onAudioEnded = (): void => {
    if (this.isEnded()) return;
    if (this.playingPhase === "real") {
      this.timing("turn_end");
      // Krishna's reply finished.
      this.dbg("reply audio ended → breath → listening");
      this.playingPhase = "none";
      this.stopSpeakingAnalyser();
      this.revokeLastReal();
      this.turnRealUrl = null;
      if (this.safetyHeld) {
        // hold (mic off) until the user dismisses the helpline (acknowledgeSafety)
        this.awaitingSafetyAck = true;
        this.emit("thinking");
        return;
      }
      this.breatheThenListen();
    }
    // playingPhase "none" (e.g. the silent-WAV unlock clip ended) → ignore.
  };

  private onAudioError = (): void => {
    if (this.isEnded()) return;
    if (this.playingPhase === "real") {
      this.fail("audio_failed", "audio element error", true);
    }
  };

  // Fires when the element actually starts producing sound — the user-audible
  // moment. Gated to the real reply (the silent unlock clip plays with
  // playingPhase "none" and must not log).
  private onAudioPlaying = (): void => {
    if (this.playingPhase === "real") this.timing("audio_audible");
  };

  private bindAudioListeners(el: HTMLAudioElement): void {
    if (this.audioListenersBound) return;
    el.addEventListener("ended", this.onAudioEnded);
    el.addEventListener("error", this.onAudioError);
    el.addEventListener("playing", this.onAudioPlaying);
    this.audioListenersBound = true;
  }

  private unbindAudioListeners(): void {
    if (this.audioEl && this.audioListenersBound) {
      this.audioEl.removeEventListener("ended", this.onAudioEnded);
      this.audioEl.removeEventListener("error", this.onAudioError);
      this.audioEl.removeEventListener("playing", this.onAudioPlaying);
    }
    this.audioListenersBound = false;
  }

  // ── audio unlock (must run inside the start-button gesture) ────────────
  //
  // iOS Safari grants the autoplay token only when play() / AudioContext are
  // touched synchronously inside a user gesture (edge cases 3 + 17). The
  // VoiceClient calls primeAudio() directly from the Begin onClick BEFORE any
  // await, so this whole method runs within the gesture's synchronous frame.
  primeAudio(el: HTMLAudioElement): void {
    this.audioEl = el;
    this.bindAudioListeners(el);
    try {
      if (!this.audioCtx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (Ctor) this.audioCtx = new Ctor();
      }
      this.audioCtx?.resume().catch(() => {});

      // Tap the element output exactly once — a media element can only ever
      // back one MediaElementSourceNode. source → analyser → destination so
      // the TTS is BOTH audible and analysable.
      if (this.audioCtx && !this.mediaSource) {
        this.mediaSource = this.audioCtx.createMediaElementSource(el);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.6;
        this.mediaSource.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
      }
    } catch (e) {
      console.error("[voiceSession] audio analyser setup failed:", e);
      this.mediaSource = null;
      this.analyser = null;
    }

    // 1-byte silent buffer play — the actual gesture-unlock for the element.
    try {
      el.src = silentWav();
      el.muted = false;
      void el.play().catch(() => {});
    } catch {
      /* ignore — the real play() will surface failures */
    }
  }

  // ── lifecycle ──────────────────────────────────────────────────────────
  async startSession(opts?: { audioEl?: HTMLAudioElement }): Promise<void> {
    const startable = this.state === "idle";
    if (!startable) return;
    if (opts?.audioEl && this.audioEl !== opts.audioEl) {
      this.audioEl = opts.audioEl;
      this.bindAudioListeners(opts.audioEl);
    }
    this.emit("starting");

    // Browser-support guard (mirrors ChatUI.startSession).
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof window.AudioWorklet === "undefined" ||
      typeof window.WebAssembly === "undefined"
    ) {
      this.fail("unsupported_browser", "missing media APIs", false);
      return;
    }

    try {
      const { MicVAD, utils } = await import("@ricky0123/vad-web");
      this.vadUtils = utils;
      if (this.isEnded()) return;

      const vad = await MicVAD.new({
        ...VAD_OPTIONS,
        onSpeechStart: () => {
          this.clearSafetyCap();
        },
        onFrameProcessed: (_probs: unknown, frame: Float32Array) => {
          if (this.state !== "listening") return;
          this.emitAmplitude(rms(frame));
        },
        onSpeechEnd: (audio: Float32Array) => {
          // One utterance == one turn; only count utterances while listening
          // (no barge-in). The floated promise is caught so an abort/teardown
          // never becomes an unhandled rejection.
          this.dbg(
            `onSpeechEnd: state=${this.state} samples=${audio.length}`,
          );
          if (this.state !== "listening") return;
          this.handleUtterance(audio).catch((e) => {
            if (!isAbortError(e)) console.error("[voiceSession] turn failed:", e);
          });
        },
      });

      if (this.isEnded()) {
        try {
          await vad.destroy();
        } catch {
          /* ignore */
        }
        return;
      }

      this.vad = vad as unknown as MicVadInstance;
      await this.startVad();
      this.emit("listening", { amplitude: 0 });
    } catch (e) {
      const name =
        e instanceof Error ? (e as Error & { name?: string }).name : "";
      const detail = e instanceof Error ? e.message : String(e);
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        this.fail("permission_denied", detail, false);
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        this.fail("no_hardware", detail, false);
      } else if (name === "NotSupportedError") {
        this.fail("unsupported_browser", detail, false);
      } else {
        this.fail("vad_load_failed", detail, true);
      }
    }
  }

  // ── one conversational turn ──────────────────────────────────────────
  private handleUtterance(audio: Float32Array): Promise<void> {
    this.clearSafetyCap();
    this.emit("transcribing");
    return this.runPipeline(audio);
  }

  private async runPipeline(audio: Float32Array): Promise<void> {
    this.turnAbort = new AbortController();
    const signal = this.turnAbort.signal;
    this.playingPhase = "none";
    this.turnRealUrl = null;
    this.revokeLastReal();

    // 1. transcribe (Sarvam)
    let transcript = "";
    try {
      if (!this.vadUtils) throw new Error("vad utils missing");
      const wav = this.vadUtils.encodeWAV(audio);
      const base64 = this.vadUtils.arrayBufferToBase64(wav);
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64, mimeType: "audio/wav" }),
        signal,
      });
      if (this.isEnded()) return;
      if (!res.ok) throw new Error(`transcribe HTTP ${res.status}`);
      const data = (await res.json()) as { text?: string };
      transcript = (data.text ?? "").trim();
      this.dbg(`transcript (${transcript.length} chars): ${JSON.stringify(transcript.slice(0, 80))}`);
    } catch (e) {
      if (this.aborted(signal) || isAbortError(e)) return;
      this.fail("transcribe_failed", e instanceof Error ? e.message : String(e), true);
      return;
    }

    // Nothing parseable → quietly re-open the mic.
    if (!transcript) {
      this.dbg("empty transcript → back to listening");
      this.resumeListening();
      return;
    }
    this.turns.push({ role: "user", content: transcript });

    // T0 — the post-STT turn clock starts here. New id per turn; propagated to
    // /api/chat + /api/tts via X-Voice-Turn-Id so the server logs correlate.
    this.turnId = Math.random().toString(16).slice(2, 10);
    this.turnStart = performance.now();
    this.timing("turn_start");
    this.emit("thinking");

    // 2. chat (Sonnet)
    let reply = "";
    let safety: SafetyCard | undefined;
    try {
      this.timing("chat_request_fired");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
          "X-Voice-Turn-Id": this.turnId,
        },
        body: JSON.stringify({ message: transcript }),
        signal,
      });
      if (this.isEnded()) return;
      if (!res.ok) {
        if (res.status === 400) {
          this.fail("transcribe_failed", "moderation", true);
          return;
        }
        throw new Error(`chat HTTP ${res.status}`);
      }
      const ct = res.headers.get("content-type") ?? "";
      const isStream = ct.includes("application/x-ndjson") && res.body !== null;
      if (isStream) {
        const parsed = await this.readChatStream(res.body!, signal);
        if (this.isEnded()) return;
        reply = parsed.reply;
        safety = parsed.safety;
        this.timing("chat_stream_complete");
      } else {
        const data = (await res.json()) as {
          reply?: string;
          paywall?: boolean;
          safety_card?: SafetyCard | null;
        };
        if (data.paywall === true) {
          this.fail("paywall", "chat paywall", true);
          return;
        }
        reply = (data.reply ?? "").trim();
        safety = data.safety_card ?? undefined;
      }
    } catch (e) {
      if (this.aborted(signal) || isAbortError(e)) return;
      this.fail("network", e instanceof Error ? e.message : String(e), true);
      return;
    }

    this.dbg(`chat reply: ${reply.length} chars, safety=${!!safety}`);
    if (!reply) {
      this.dbg("empty reply → back to listening");
      this.resumeListening();
      return;
    }
    this.turns.push({ role: "assistant", content: reply });

    // Safety: surface the helpline overlay NOW (Locked Decision #7 — visible in
    // voice mode, never skipped). Krishna still voices his compassionate reply;
    // the loop holds after playback until the user dismisses (acknowledgeSafety).
    if (safety) {
      this.safetyHeld = true;
      this.surfaceSafety(safety);
    }

    // 3. tts (low-latency voice path — POST /api/tts with mode: "voice").
    //    State stays "thinking" until the reply audio starts playing.
    try {
      this.timing("tts_request_fired");
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Voice-Turn-Id": this.turnId,
        },
        body: JSON.stringify({ text: reply, mode: "voice" }),
        signal,
      });
      if (this.isEnded()) return;
      if (!res.ok) {
        this.fail(
          res.status === 402 ? "paywall" : "tts_failed",
          `tts HTTP ${res.status}`,
          true,
        );
        return;
      }
      // fetch resolves on response headers ≈ first byte of the TTS response.
      this.timing("tts_first_byte_received");
      const blob = await res.blob();
      if (this.isEnded()) return;
      const url = URL.createObjectURL(blob);
      this.timing("audio_buffered");
      this.dbg(`tts ok: ${(blob.size / 1024).toFixed(1)} KB → playing reply`);
      this.onRealReady(url);
    } catch (e) {
      if (this.aborted(signal) || isAbortError(e)) return;
      this.fail("tts_failed", e instanceof Error ? e.message : String(e), true);
    }
  }

  // The reply audio is fetched + ready → play it.
  private onRealReady(url: string): void {
    if (this.isEnded()) {
      URL.revokeObjectURL(url);
      return;
    }
    this.revokeLastReal();
    this.lastRealUrl = url;
    this.turnRealUrl = url;
    this.playReal();
  }

  private playReal(): void {
    if (!this.turnRealUrl || !this.audioEl) return;
    this.playingPhase = "real";
    const ctx = this.audioCtx;
    this.dbg(`playReal: ctx=${ctx?.state ?? "none"}`);

    const start = () => {
      if (this.isEnded() || !this.audioEl || !this.turnRealUrl) return;
      try {
        this.audioEl.src = this.turnRealUrl;
        this.audioEl.currentTime = 0;
        void this.audioEl.play().catch((e) => {
          if (!isAbortError(e)) this.fail("audio_failed", "play rejected", true);
        });
        this.timing("audio_play_called");
      } catch {
        this.fail("audio_failed", "play threw", true);
        return;
      }
      this.emit("speaking", { amplitude: 0 });
      this.startSpeakingAnalyser();
    };

    // The element is routed through the AudioContext graph for the amplitude
    // analyser, so a SUSPENDED context plays the reply silently. The gesture
    // resume can lapse during a long pipeline wait (cold dev compile, slow
    // backend), so resume BEFORE playing to guarantee the reply is audible.
    if (ctx && ctx.state === "suspended") {
      ctx.resume().then(start).catch(start);
    } else {
      start();
    }
  }

  private async readChatStream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): Promise<{ reply: string; safety?: SafetyCard }> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let reply = "";
    let firstToken = true;
    let safety: SafetyCard | undefined;
    try {
      for (;;) {
        if (signal.aborted) break;
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let frame: Record<string, unknown>;
          try {
            frame = JSON.parse(line) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (frame.type === "text" && typeof frame.delta === "string") {
            if (firstToken) {
              firstToken = false;
              this.timing("chat_first_token_received");
            }
            reply += frame.delta;
          } else if (frame.type === "meta") {
            if (frame.safety_card && typeof frame.safety_card === "object") {
              safety = frame.safety_card as SafetyCard;
            }
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
    }
    return { reply: reply.trim(), safety };
  }

  private breatheThenListen(): void {
    window.setTimeout(() => {
      if (this.state === "ended" || this.state === "error") return;
      this.resumeListening();
    }, BREATH_GAP_MS);
  }

  /** Called by VoiceClient once the user dismisses the helpline overlay. */
  acknowledgeSafety(): void {
    if (!this.safetyHeld && !this.awaitingSafetyAck) return;
    this.safetyHeld = false;
    if (this.state === "ended" || this.state === "error") {
      this.awaitingSafetyAck = false;
      return;
    }
    if (this.state === "speaking") {
      this.awaitingSafetyAck = false;
      return;
    }
    this.awaitingSafetyAck = false;
    this.resumeListening();
  }

  // ── speaking analyser (reply TTS amplitude) ───────────────────────────
  private startSpeakingAnalyser(): void {
    this.audioCtx?.resume().catch(() => {});
    if (!this.analyser) {
      this.startSyntheticSpeaking();
      return;
    }
    const analyser = this.analyser;
    const data = new Uint8Array(analyser.fftSize);
    let last = 0;
    const tick = () => {
      if (this.state !== "speaking") return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const amp = Math.sqrt(sum / data.length);
      last = last * 0.6 + Math.min(1, amp * 2.2) * 0.4;
      this.emitAmplitude(last);
      this.speakingRaf = requestAnimationFrame(tick);
    };
    this.speakingRaf = requestAnimationFrame(tick);
  }

  private startSyntheticSpeaking(): void {
    const start = Date.now();
    const tick = () => {
      if (this.state !== "speaking") return;
      const t = (Date.now() - start) / 1000;
      const amp = 0.35 + 0.25 * (Math.sin(t * 6) * 0.5 + 0.5);
      this.emitAmplitude(amp);
      this.speakingRaf = requestAnimationFrame(tick);
    };
    this.speakingRaf = requestAnimationFrame(tick);
  }

  private stopSpeakingAnalyser(): void {
    if (this.speakingRaf !== null) {
      cancelAnimationFrame(this.speakingRaf);
      this.speakingRaf = null;
    }
    this.emitAmplitude(0);
  }

  // ── VAD helpers ──────────────────────────────────────────────────────
  private resumeListening(): void {
    if (this.state === "ended" || this.state === "error") return;
    this.abortTurn();
    this.playingPhase = "none";
    this.turnRealUrl = null;
    this.armSafetyCap();
    this.emit("listening", { amplitude: 0 });
  }

  private async startVad(): Promise<void> {
    if (!this.vad) return;
    try {
      await this.vad.start();
    } catch (e) {
      if (!isAbortError(e)) console.error("[voiceSession] vad start failed:", e);
    }
  }

  private async pauseVad(): Promise<void> {
    if (!this.vad) return;
    try {
      await this.vad.pause();
    } catch (e) {
      if (!isAbortError(e)) console.error("[voiceSession] vad pause failed:", e);
    }
  }

  private armSafetyCap(): void {
    this.clearSafetyCap();
    this.safetyCapTimer = setTimeout(() => {
      if (this.state === "listening") this.resumeListening();
    }, SAFETY_CAP_MS);
  }

  private clearSafetyCap(): void {
    if (this.safetyCapTimer) {
      clearTimeout(this.safetyCapTimer);
      this.safetyCapTimer = null;
    }
  }

  // Pause the <audio> element. pause() never fires 'ended'.
  private stopAudio(): void {
    if (this.audioEl) {
      try {
        this.audioEl.pause();
      } catch {
        /* ignore */
      }
    }
    this.playingPhase = "none";
  }

  private revokeLastReal(): void {
    if (this.lastRealUrl) {
      URL.revokeObjectURL(this.lastRealUrl);
      this.lastRealUrl = null;
    }
  }

  // ── background pause / resume (edge case 10) ──────────────────────────
  pauseForBackground(): void {
    if (
      this.state === "idle" ||
      this.state === "ended" ||
      this.state === "error"
    )
      return;
    this.pausedFromBackground = true;
    void this.pauseVad();
    this.abortTurn();
    this.stopAudio();
    this.stopSpeakingAnalyser();
    this.clearSafetyCap();
    this.emit("starting");
  }

  /** Resume after a background pause. MUST be called from a user gesture so
   *  mobile re-grants the autoplay token (we replay the silent unlock). */
  async resumeFromBackground(): Promise<void> {
    if (!this.pausedFromBackground) return;
    this.pausedFromBackground = false;
    this.audioCtx?.resume().catch(() => {});
    if (this.audioEl) {
      try {
        this.audioEl.src = silentWav();
        void this.audioEl.play().catch(() => {});
      } catch {
        /* ignore */
      }
    }
    await this.startVad();
    this.resumeListening();
  }

  isPausedFromBackground(): boolean {
    return this.pausedFromBackground;
  }

  /** Retry from the error state — re-open the mic in the existing context. */
  retry(): void {
    if (this.state !== "error") return;
    if (!this.vad) {
      this.state = "idle";
      void this.startSession();
      return;
    }
    this.resumeListening();
  }

  // ── teardown ─────────────────────────────────────────────────────────
  async endSession(): Promise<void> {
    if (this.state === "ended") return;
    this.emit("ended");
    this.abortTurn();
    this.clearSafetyCap();
    this.stopSpeakingAnalyser();
    this.stopAudio();
    this.revokeLastReal();
    this.safetyHeld = false;
    this.awaitingSafetyAck = false;
    this.pausedFromBackground = false;
    this.playingPhase = "none";
    this.turnRealUrl = null;

    if (this.vad) {
      try {
        await this.vad.destroy();
      } catch (e) {
        if (!isAbortError(e)) {
          console.error("[voiceSession] vad destroy failed:", e);
        }
      }
      this.vad = null;
    }
  }

  /** Tear down the Web-Audio graph + revoke blob URLs. Called by VoiceClient
   *  on UNMOUNT so a remount (fresh <audio> element) can build a new
   *  MediaElementSourceNode — an element can only ever back one source. */
  disposeAudio(): void {
    this.stopSpeakingAnalyser();
    this.unbindAudioListeners();
    try {
      this.mediaSource?.disconnect();
      this.analyser?.disconnect();
    } catch {
      /* ignore */
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
    }
    this.audioCtx = null;
    this.analyser = null;
    this.mediaSource = null;
    this.audioEl = null;
    this.revokeLastReal();
  }

  /** Full reset so a new session can begin (after exit, "start again"). */
  reset(): void {
    this.turns = [];
    this.state = "idle";
    this.safetyHeld = false;
    this.awaitingSafetyAck = false;
    this.pausedFromBackground = false;
    this.playingPhase = "none";
    this.turnRealUrl = null;
    this.emit("idle");
  }

  // ── internals ────────────────────────────────────────────────────────
  private abortTurn(): void {
    if (this.turnAbort) {
      this.turnAbort.abort();
      this.turnAbort = null;
    }
  }

  private aborted(signal: AbortSignal): boolean {
    return signal.aborted || this.state === "ended";
  }

  private fail(code: string, message: string, recoverable: boolean): void {
    this.dbg(`error: code=${code} recoverable=${recoverable} — ${message}`);
    this.stopAudio();
    this.stopSpeakingAnalyser();
    this.clearSafetyCap();
    this.emit("error", { error: { code, message, recoverable } });
  }
}

// ── module-level helpers ─────────────────────────────────────────────────
function isAbortError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { name?: string }).name === "AbortError"
  );
}

function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  const value = Math.sqrt(sum / frame.length);
  return Math.min(1, value * 4);
}

// A ~10ms silent 16-bit mono WAV, generated once (lazily, browser-only).
let SILENT_WAV_CACHE: string | null = null;
function buildSilentWav(): string {
  const sampleRate = 8000;
  const numSamples = 80;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return "data:audio/wav;base64," + btoa(binary);
}

function silentWav(): string {
  if (SILENT_WAV_CACHE === null) SILENT_WAV_CACHE = buildSilentWav();
  return SILENT_WAV_CACHE;
}

// ── public singleton API ─────────────────────────────────────────────────
const session = new VoiceSession();

export function subscribe(cb: Listener): () => void {
  return session.subscribe(cb);
}
export function primeAudio(el: HTMLAudioElement): void {
  session.primeAudio(el);
}
export function startSession(opts?: {
  audioEl?: HTMLAudioElement;
}): Promise<void> {
  return session.startSession(opts);
}
export function endSession(): Promise<void> {
  return session.endSession();
}
export function acknowledgeSafety(): void {
  session.acknowledgeSafety();
}
export function retry(): void {
  session.retry();
}
export function reset(): void {
  session.reset();
}
export function pauseForBackground(): void {
  session.pauseForBackground();
}
export function resumeFromBackground(): Promise<void> {
  return session.resumeFromBackground();
}
export function isPausedFromBackground(): boolean {
  return session.isPausedFromBackground();
}
export function getState(): VoiceState {
  return session.getState();
}
export function getTranscript(): TranscriptTurn[] {
  return session.getTranscript();
}
export function disposeAudio(): void {
  session.disposeAudio();
}
export type { TranscriptTurn };
