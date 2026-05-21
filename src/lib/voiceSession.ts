// Phase 10.5 — /voice voice-to-voice orchestrator (client singleton).
// Phase 10.6 — owns audio playback directly (filler clips + low-latency TTS).
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
//                               MP3; low-latency path) → played on the shared
//                               <audio> element this module drives directly.
//
// Phase 10.6 perceived-latency mask: the instant the VAD detects end-of-speech
// we play a short pre-recorded FILLER clip ("हाँ…", "सुनो…") over the orb while
// the transcribe→chat→tts pipeline runs in parallel. When Krishna's real reply
// audio is ready we queue it: it plays after the filler finishes (no abrupt
// cut). This module owns the <audio> element + its 'ended'/'error' listeners,
// the filler/real swap, and the /api/tts fetch — it no longer delegates to
// voiceClient (which can neither pass `mode` nor queue a filler).
//
// State machine:
//   idle → starting → listening → speaking{isFiller:true} (filler) →
//          speaking{isFiller:false} (real) → listening → …
//   any → error (recoverable / fatal)   any → ended (terminal)
//
// Listening amplitude comes from the VAD's onFrameProcessed frames (RMS — no
// second mic stream); speaking amplitude (real reply only) comes from an
// AnalyserNode tapped onto the <audio> element.
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
  /** true while a filler clip is playing (orb shows a quieter indicator);
   *  false when the real reply audio takes over. Only meaningful in the
   *  "speaking" state. */
  isFiller?: boolean;
}

type Listener = (s: VoiceState, ctx?: VoiceContext) => void;

interface TranscriptTurn {
  role: "user" | "assistant";
  content: string;
}

// VAD config — mirrors ChatUI's Sarvam mic exactly (Phase 8.0). The VAD runs
// CONTINUOUSLY for the whole session (Phase 10.5 fix); onSpeechEnd + amplitude
// are gated by state so utterances detected while not "listening" (e.g. the
// mic catching Krishna's own voice) are ignored — no barge-in (edge case 8).
const VAD_OPTIONS = {
  baseAssetPath: "/vad/",
  onnxWASMBasePath: "/vad/",
  model: "v5" as const,
  redemptionMs: 700,
  minSpeechMs: 250,
  preSpeechPadMs: 200,
  submitUserSpeechOnPause: true,
};

const SAFETY_CAP_MS = 60_000;
const BREATH_GAP_MS = 400;
// Phase 10.6 — 5 pre-recorded filler clips (founder-generated, committed at
// public/voice/fillers/filler-1.mp3 … filler-5.mp3). Missing files just 404
// and degrade to a silent transition (edge case 1).
const FILLER_COUNT = 5;
// A filler may loop AT MOST once if the real reply isn't ready when it ends;
// after that we wait silently (edge case 3 — never 3+ loops, sounds broken).
const MAX_FILLER_LOOPS = 1;

interface MicVadInstance {
  start: () => Promise<void> | void;
  pause: () => Promise<void> | void;
  destroy: () => Promise<void> | void;
}

// Which clip is currently on the <audio> element this turn.
type PlayingPhase = "none" | "filler" | "real";

class VoiceSession {
  private state: VoiceState = "idle";
  private listeners = new Set<Listener>();
  private turns: TranscriptTurn[] = [];

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

  // Phase 10.6 — filler + real-reply playback bookkeeping
  private fillerBlobs: string[] = [];
  private currentFillerUrl: string | null = null;
  private fillerLoopsUsed = 0;
  private playingPhase: PlayingPhase = "none";
  private waitingForReal = false; // filler done (or none), real not yet ready
  private turnRealUrl: string | null = null; // this turn's real reply blob URL
  private lastRealUrl: string | null = null; // for revoke on replace / teardown
  private turnRealError: VoiceError | null = null; // pipeline failure during filler

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

  // "Did the user exit?" — a METHOD (not a direct field comparison) so that an
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
   *  overlay can appear over the filler / real audio). */
  private surfaceSafety(card: SafetyCard): void {
    for (const cb of this.listeners) cb(this.state, { safety: card });
  }

  // Phase 10.6 — diagnostic trace of the loop (mirrors the [chat]/[tts] log
  // style). Lets a stuck session be pinpointed: speech-end fired? transcript
  // empty? chat reply empty? tts ok? playback started/ended?
  private dbg(...args: unknown[]): void {
    console.log("[voice]", ...args);
  }

  // ── audio element listeners ───────────────────────────────────────────
  private onAudioEnded = (): void => {
    if (this.isEnded()) return;
    if (this.playingPhase === "filler") {
      this.advanceFromFiller();
      return;
    }
    if (this.playingPhase === "real") {
      // Krishna's real reply finished.
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
    // A filler that fails to play is non-fatal — advance as if it ended
    // (edge case 1). A real-reply playback failure is a real error (edge 11).
    if (this.playingPhase === "filler") {
      this.advanceFromFiller();
      return;
    }
    if (this.playingPhase === "real") {
      this.fail("audio_failed", "audio element error", true);
    }
  };

  private bindAudioListeners(el: HTMLAudioElement): void {
    if (this.audioListenersBound) return;
    el.addEventListener("ended", this.onAudioEnded);
    el.addEventListener("error", this.onAudioError);
    this.audioListenersBound = true;
  }

  private unbindAudioListeners(): void {
    if (this.audioEl && this.audioListenersBound) {
      this.audioEl.removeEventListener("ended", this.onAudioEnded);
      this.audioEl.removeEventListener("error", this.onAudioError);
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

    // Pre-load the filler clips (Blob-URL cached). Non-blocking — by the time
    // the user finishes their first sentence these are usually ready; if not,
    // startFiller() degrades to a silent transition (edge case 1).
    void this.preloadFillers();

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

  // Pre-load the 5 filler MP3s as Blob URLs. Idempotent within a mount.
  private async preloadFillers(): Promise<void> {
    if (this.fillerBlobs.length > 0) return;
    const urls: string[] = [];
    for (let i = 1; i <= FILLER_COUNT; i++) {
      try {
        const res = await fetch(`/voice/fillers/filler-${i}.mp3`);
        if (!res.ok) continue;
        const blob = await res.blob();
        if (blob.size === 0) continue;
        urls.push(URL.createObjectURL(blob));
      } catch {
        /* skip — silent transition fallback (edge case 1) */
      }
    }
    if (this.isEnded()) {
      for (const u of urls) URL.revokeObjectURL(u);
      return;
    }
    this.fillerBlobs = urls;
  }

  // ── one conversational turn ──────────────────────────────────────────
  private handleUtterance(audio: Float32Array): Promise<void> {
    this.clearSafetyCap();
    this.beginTurnAudio(); // start the filler immediately (perceived latency mask)
    return this.runPipeline(audio);
  }

  // Reset per-turn audio state + kick off the filler.
  private beginTurnAudio(): void {
    this.turnRealError = null;
    this.turnRealUrl = null;
    this.revokeLastReal();
    this.fillerLoopsUsed = 0;
    this.waitingForReal = false;
    this.startFiller();
  }

  private startFiller(): void {
    if (this.fillerBlobs.length === 0 || !this.audioEl) {
      // No fillers available → silent "thinking" until the real reply arrives.
      this.currentFillerUrl = null;
      this.playingPhase = "none";
      this.waitingForReal = true;
      this.emit("thinking");
      return;
    }
    const url = this.fillerBlobs[Math.floor(Math.random() * this.fillerBlobs.length)];
    this.currentFillerUrl = url;
    this.playingPhase = "filler";
    // Quieter "speaking" — no analyser during the filler, so the orb stays
    // calm (amplitude 0); VoiceClient shows the "थोड़ा रुको…" indicator.
    this.emit("speaking", { isFiller: true, amplitude: 0 });
    this.playFillerUrl(url);
  }

  private playFillerUrl(url: string): void {
    if (!this.audioEl) {
      this.advanceFromFiller();
      return;
    }
    try {
      this.audioEl.src = url;
      this.audioEl.currentTime = 0;
      void this.audioEl.play().catch((e) => {
        if (isAbortError(e)) return; // superseded by a new load — ignore
        this.advanceFromFiller(); // filler couldn't play → continue (edge 1)
      });
    } catch {
      this.advanceFromFiller();
    }
  }

  // Decide what happens when a filler clip ends (or fails).
  private advanceFromFiller(): void {
    if (this.isEnded()) return;
    if (this.turnRealError) {
      const err = this.turnRealError;
      this.turnRealError = null;
      this.failError(err); // pipeline failed during the filler (edge 2)
      return;
    }
    if (this.turnRealUrl) {
      this.playReal(); // real reply ready → smooth swap, no cut
      return;
    }
    if (this.fillerLoopsUsed < MAX_FILLER_LOOPS && this.currentFillerUrl) {
      this.fillerLoopsUsed++;
      this.playFillerUrl(this.currentFillerUrl); // loop once
      return;
    }
    // Looped once, still not ready → wait silently with a thinking indicator
    // (edge case 3 — avoid 3+ filler loops).
    this.playingPhase = "none";
    this.waitingForReal = true;
    this.stopSpeakingAnalyser();
    this.emit("thinking");
  }

  // The real reply audio is fetched + ready.
  private onRealReady(url: string): void {
    if (this.isEnded()) {
      URL.revokeObjectURL(url);
      return;
    }
    this.revokeLastReal();
    this.lastRealUrl = url;
    this.turnRealUrl = url;
    if (this.playingPhase === "filler") {
      // Filler still playing → let it finish; onAudioEnded swaps to real.
      return;
    }
    // Filler already finished (waiting) or none played → play now.
    this.playReal();
  }

  private playReal(): void {
    if (!this.turnRealUrl || !this.audioEl) return;
    this.playingPhase = "real";
    this.waitingForReal = false;
    this.dbg(`playReal: ctx=${this.audioCtx?.state ?? "none"}`);
    try {
      this.audioEl.src = this.turnRealUrl;
      this.audioEl.currentTime = 0;
      void this.audioEl.play().catch((e) => {
        if (!isAbortError(e)) this.fail("audio_failed", "play rejected", true);
      });
    } catch {
      this.fail("audio_failed", "play threw", true);
      return;
    }
    this.emit("speaking", { isFiller: false, amplitude: 0 });
    this.startSpeakingAnalyser();
  }

  private async runPipeline(audio: Float32Array): Promise<void> {
    this.turnAbort = new AbortController();
    const signal = this.turnAbort.signal;

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
      this.setTurnError(
        "transcribe_failed",
        e instanceof Error ? e.message : String(e),
        true,
      );
      return;
    }

    // Nothing parseable → quietly stop the filler and re-open the mic.
    if (!transcript) {
      this.dbg("empty transcript → back to listening");
      this.cancelTurnToListening();
      return;
    }
    this.turns.push({ role: "user", content: transcript });

    // 2. chat (Sonnet)
    let reply = "";
    let safety: SafetyCard | undefined;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify({ message: transcript }),
        signal,
      });
      if (this.isEnded()) return;
      if (!res.ok) {
        if (res.status === 400) {
          this.setTurnError("transcribe_failed", "moderation", true);
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
      } else {
        const data = (await res.json()) as {
          reply?: string;
          paywall?: boolean;
          safety_card?: SafetyCard | null;
        };
        if (data.paywall === true) {
          this.setTurnError("paywall", "chat paywall", true);
          return;
        }
        reply = (data.reply ?? "").trim();
        safety = data.safety_card ?? undefined;
      }
    } catch (e) {
      if (this.aborted(signal) || isAbortError(e)) return;
      this.setTurnError("network", e instanceof Error ? e.message : String(e), true);
      return;
    }

    this.dbg(`chat reply: ${reply.length} chars, safety=${!!safety}`);
    if (!reply) {
      this.dbg("empty reply → back to listening");
      this.cancelTurnToListening();
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

    // 3. tts (low-latency voice path — POST /api/tts with mode: "voice")
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply, mode: "voice" }),
        signal,
      });
      if (this.isEnded()) return;
      if (!res.ok) {
        this.setTurnError(
          res.status === 402 ? "paywall" : "tts_failed",
          `tts HTTP ${res.status}`,
          true,
        );
        return;
      }
      const blob = await res.blob();
      if (this.isEnded()) return;
      const url = URL.createObjectURL(blob);
      this.dbg(`tts ok: ${(blob.size / 1024).toFixed(1)} KB → queueing reply audio`);
      this.onRealReady(url);
    } catch (e) {
      if (this.aborted(signal) || isAbortError(e)) return;
      this.setTurnError("tts_failed", e instanceof Error ? e.message : String(e), true);
    }
  }

  // Record a pipeline error. If a filler is still playing we DEFER surfacing it
  // until the filler ends (edge case 2 — no dead silence mid-filler); otherwise
  // (silent wait, or no filler) we surface it now.
  private setTurnError(code: string, message: string, recoverable: boolean): void {
    const err: VoiceError = { code, message, recoverable };
    if (this.playingPhase === "filler") {
      this.turnRealError = err;
      return;
    }
    this.waitingForReal = false;
    this.failError(err);
  }

  // Empty transcript / empty reply → stop the filler and re-open the mic.
  private cancelTurnToListening(): void {
    this.stopAudio();
    this.stopSpeakingAnalyser();
    this.resumeListening();
  }

  private async readChatStream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): Promise<{ reply: string; safety?: SafetyCard }> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let reply = "";
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
      // audio still playing — breatheThenListen runs when it ends
      this.awaitingSafetyAck = false;
      return;
    }
    this.awaitingSafetyAck = false;
    this.resumeListening();
  }

  // ── speaking analyser (real-reply TTS amplitude) ──────────────────────
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
    this.resetTurnPlayback();
    this.armSafetyCap();
    this.emit("listening", { amplitude: 0 });
  }

  private resetTurnPlayback(): void {
    this.playingPhase = "none";
    this.waitingForReal = false;
    this.turnRealError = null;
    this.turnRealUrl = null;
    this.currentFillerUrl = null;
    this.fillerLoopsUsed = 0;
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

  // Pause the <audio> element (filler or real). pause() never fires 'ended'.
  private stopAudio(): void {
    if (this.audioEl) {
      try {
        this.audioEl.pause();
      } catch {
        /* ignore */
      }
    }
    this.playingPhase = "none";
    this.waitingForReal = false;
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
    this.resetTurnPlayback();

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

  /** Tear down the Web-Audio graph + revoke all blob URLs. Called by
   *  VoiceClient on UNMOUNT so a remount (fresh <audio> element) can build a
   *  new MediaElementSourceNode — an element can only ever back one source. */
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
    for (const url of this.fillerBlobs) URL.revokeObjectURL(url);
    this.fillerBlobs = [];
    this.currentFillerUrl = null;
  }

  /** Full reset so a new session can begin (after exit, "start again"). */
  reset(): void {
    this.turns = [];
    this.state = "idle";
    this.safetyHeld = false;
    this.awaitingSafetyAck = false;
    this.pausedFromBackground = false;
    this.resetTurnPlayback();
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
    this.failError({ code, message, recoverable });
  }

  private failError(err: VoiceError): void {
    this.dbg(`error: code=${err.code} recoverable=${err.recoverable} — ${err.message}`);
    this.stopAudio();
    this.stopSpeakingAnalyser();
    this.clearSafetyCap();
    this.emit("error", { error: err });
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
