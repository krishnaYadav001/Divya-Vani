// Phase 10.5 — /voice voice-to-voice orchestrator (client singleton).
//
// Runs the continuous voice loop as a finite-state machine and coordinates
// the EXISTING backend pieces — it changes none of them:
//
//   mic → @ricky0123/vad-web (Silero v5, same assets as ChatUI's mic)
//       → POST /api/transcribe (Sarvam Saaras V3)
//       → POST /api/chat       (NDJSON stream; Sonnet reply, cookie-scoped
//                               server-side history — no conversationId in
//                               the contract, continuity rides the cookie)
//       → voiceClient.playVoice(replyId, text) → POST /api/tts (ElevenLabs)
//
// State machine:
//   idle → starting → listening ⇄ transcribing → thinking → speaking → …
//   any → error (recoverable / fatal)   any → ended (terminal)
//
// Two Web-Audio analysers feed the orb amplitude (published 0..1 via the
// subscriber): the LISTENING amplitude comes from the VAD's own
// onFrameProcessed frames (RMS) so we never open a second mic stream; the
// SPEAKING amplitude comes from an AnalyserNode tapped onto the shared
// <audio> element that voiceClient plays through.
//
// Pure module — no React, no JSX. All browser APIs are touched only inside
// functions (never at module top level) so an SSR import is harmless. A
// single module-level instance backs the exported functions, matching the
// voiceClient singleton pattern this app already uses.
//
// NOTE on /api/tts: this module does not fetch it directly — it delegates
// to voiceClient.playVoice (which owns the /api/tts fetch, content-addressed
// cache, blob lifecycle, and the shared <audio> element). We only react to
// voiceClient's published playback state to drive speaking → listening.

import type { SafetyCard } from "@/lib/messages";
import {
  playVoice,
  stopVoice,
  subscribe as subscribeVoiceClient,
  type VoiceState as PlaybackState,
} from "@/lib/voiceClient";

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

// VAD config — mirrors ChatUI's Sarvam mic exactly (Phase 8.0). The
// per-utterance silence (redemptionMs) ends an UTTERANCE; in voice mode one
// utterance == one conversational turn (speak → end → transcribe → reply).
//
// The VAD runs CONTINUOUSLY for the whole session — we do NOT pause/start it
// per turn. The library's pause() calls track.stop() and start() re-acquires
// the mic via getUserMedia, so per-turn pause/start would (a) churn the mic
// indicator + add latency every turn and (b) float an un-awaitable
// getUserMedia that can reject with AbortError. Instead we GATE onSpeechEnd +
// amplitude by state: utterances detected while not "listening" (e.g. the
// mic catching Krishna's own voice) are ignored — no barge-in (edge case 8).
// The library's getUserMedia sets echoCancellation:true, which suppresses the
// speaker output from the mic input during speaking. Only background
// pause/resume touches the mic, and those are awaited + abort-swallowed.
const VAD_OPTIONS = {
  baseAssetPath: "/vad/",
  onnxWASMBasePath: "/vad/",
  model: "v5" as const,
  redemptionMs: 700,
  minSpeechMs: 250,
  preSpeechPadMs: 200,
  submitUserSpeechOnPause: true,
};

// Outer per-utterance safety bound (matches ChatUI). If the silence detector
// never fires (sustained noise), this releases the turn anyway.
const SAFETY_CAP_MS = 60_000;
// Breath gap between Krishna finishing and the mic re-opening.
const BREATH_GAP_MS = 400;

// Minimal MicVAD surface we rely on (the library types its instance, but the
// dynamic import is loosely shaped, so we narrow to what we call). The library
// methods are async; we always await them with an abort-swallowing catch.
interface MicVadInstance {
  start: () => Promise<void> | void;
  pause: () => Promise<void> | void;
  destroy: () => Promise<void> | void;
}

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

  // per-turn network cancellation (transcribe + chat). /api/tts cancellation
  // is owned by voiceClient.stopVoice().
  private turnAbort: AbortController | null = null;

  // playback analyser (TTS amplitude)
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private speakingRaf: number | null = null;

  // voiceClient subscription + the reply we are currently voicing
  private unsubVoiceClient: (() => void) | null = null;
  private activeReplyId: string | null = null;

  // safety: hold the loop after a flagged reply until the user dismisses
  private safetyHeld = false;
  // set when playback finished but the helpline is still up — we park in a
  // mic-off hold and resume only on acknowledgeSafety().
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

  // "Did the user exit?" — checked at every post-await checkpoint in the
  // async loop. A METHOD (not a direct field comparison) is used on purpose:
  // an early `if (this.state === "ended") return` would narrow "ended" out of
  // the field for the rest of the method, making a later identical re-check
  // (after an await, where the user may have exited and emit() mutated the
  // field) look impossible to TS. Comparing a boolean method result instead
  // keeps every checkpoint valid.
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

  // ── audio unlock (must run inside the start-button gesture) ────────────
  //
  // iOS Safari grants the autoplay token only when play() / AudioContext are
  // touched synchronously inside a user gesture (edge cases 3 + 17). The
  // VoiceClient calls primeAudio() directly from the Begin onClick BEFORE any
  // await, so this whole method runs within the gesture's synchronous frame.
  primeAudio(el: HTMLAudioElement): void {
    this.audioEl = el;
    try {
      if (!this.audioCtx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (Ctor) this.audioCtx = new Ctor();
      }
      // Resume synchronously (returns a promise we don't need to await).
      this.audioCtx?.resume().catch(() => {});

      // Tap the element output exactly once. A given media element can only
      // ever back one MediaElementSourceNode; creating it again throws.
      if (this.audioCtx && !this.mediaSource) {
        this.mediaSource = this.audioCtx.createMediaElementSource(el);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.6;
        // source → analyser → destination so the TTS is BOTH audible and
        // analysable. If this graph were left unconnected the element would
        // play silently — hence the connect to destination is essential.
        this.mediaSource.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
      }
    } catch (e) {
      // Analyser is a nice-to-have; never let it break playback. If the graph
      // failed to build, fall back to silent (amplitude stays 0) and let the
      // element play normally on its own.
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
      /* ignore — voiceClient's own play() will surface real failures */
    }
  }

  // ── lifecycle ──────────────────────────────────────────────────────────
  async startSession(opts?: { audioEl?: HTMLAudioElement }): Promise<void> {
    // Debounce: only a fresh idle session can start (edge case 9). Guard via a
    // boolean so TS does not narrow `this.state` to "idle" for the rest of the
    // method — it can't see emit() mutating the field across the awaits below,
    // and we genuinely re-check for "ended" (user exited mid-init).
    const startable = this.state === "idle";
    if (!startable) return;
    if (opts?.audioEl && this.audioEl !== opts.audioEl) {
      this.audioEl = opts.audioEl;
    }
    this.emit("starting");

    // Subscribe to voiceClient ONCE so we observe playback transitions
    // (playing → speaking; ended → listening; error → error/paywall).
    if (!this.unsubVoiceClient) {
      this.unsubVoiceClient = subscribeVoiceClient((vs) =>
        this.onPlaybackState(vs),
      );
    }
    // Defensive: clear any residual playback carried over from /chat.
    try {
      stopVoice();
    } catch {
      /* ignore */
    }

    // Browser-support guard (mirrors ChatUI.startSession). The page also
    // gates entry, but a policy/extension can disable APIs after mount.
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
      // If the user bailed during the async import, abort cleanly.
      if (this.isEnded()) return;

      const vad = await MicVAD.new({
        ...VAD_OPTIONS,
        onSpeechStart: () => {
          // user resumed speaking — cancel the outer safety cap for now
          this.clearSafetyCap();
        },
        onFrameProcessed: (_probs: unknown, frame: Float32Array) => {
          // Listening amplitude — RMS of the raw frame, only while listening.
          if (this.state !== "listening") return;
          this.emitAmplitude(rms(frame));
        },
        onSpeechEnd: (audio: Float32Array) => {
          // One utterance == one turn. Only utterances detected while
          // listening count; ignore anything in another state (e.g. mic
          // catching Krishna's own voice — no barge-in, edge 8). The floated
          // promise is caught so an abort/teardown never becomes an unhandled
          // rejection (which Next's dev overlay would surface).
          if (this.state !== "listening") return;
          this.handleUtterance(audio).catch((e) => {
            if (!isAbortError(e)) console.error("[voiceSession] turn failed:", e);
          });
        },
      });

      if (this.isEnded()) {
        // user exited while VAD was initialising
        try {
          await vad.destroy();
        } catch {
          /* ignore */
        }
        return;
      }

      this.vad = vad as unknown as MicVadInstance;
      // startOnLoad already begins listening; this awaited start() is a
      // no-op-if-already-listening that we await + catch so nothing floats.
      await this.startVad();
      this.emit("listening", { amplitude: 0 });
    } catch (e) {
      // MicVAD.new() calls getUserMedia internally — permission / hardware
      // DOMExceptions propagate up with their name intact (same mapping as
      // ChatUI). Permission + hardware + unsupported are NOT recoverable in
      // place (the user must change a setting and reload); asset/init
      // failures are recoverable (retry).
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
  private async handleUtterance(audio: Float32Array): Promise<void> {
    // The VAD keeps running; leaving "listening" gates further onSpeechEnd +
    // amplitude (no barge-in). echoCancellation suppresses the upcoming TTS
    // from re-triggering the VAD through the speakers.
    this.clearSafetyCap();
    this.emit("transcribing");

    this.turnAbort = new AbortController();
    const signal = this.turnAbort.signal;

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
    } catch (e) {
      if (this.aborted(signal) || isAbortError(e)) return;
      this.fail(
        "transcribe_failed",
        e instanceof Error ? e.message : String(e),
        true,
      );
      return;
    }

    // Sarvam returned only silence / noise — quietly re-open the mic rather
    // than surfacing an error (the user just didn't say anything parseable).
    if (!transcript) {
      this.resumeListening();
      return;
    }

    this.turns.push({ role: "user", content: transcript });
    this.emit("thinking");
    await this.runChatTurn(transcript, signal);
  }

  private async runChatTurn(
    transcript: string,
    signal: AbortSignal,
  ): Promise<void> {
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
        // 400 == server moderation gate (rare on transcribed speech). Treat
        // as a recoverable hiccup — re-open the mic so the user can rephrase.
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
      } else {
        // Plain JSON — the paywall guard and the safety path both land here
        // (both bypass streaming server-side).
        const data = (await res.json()) as {
          reply?: string;
          paywall?: boolean;
          safety_card?: SafetyCard | null;
        };
        if (data.paywall === true) {
          // Out of seva pool (edge cases 12 + 20). Surface as a paywall
          // signal — VoiceClient opens the DiyaSevaPanel.
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

    if (!reply) {
      // Model produced no text — nothing to voice; re-open the mic.
      this.resumeListening();
      return;
    }

    this.turns.push({ role: "assistant", content: reply });

    // Safety: surface the helpline overlay NOW (Locked Decision #7 — the
    // card must be visible in voice mode, never skipped). Krishna still
    // speaks his compassionate reply; the loop holds after playback until
    // the user dismisses the card (acknowledgeSafety()).
    if (safety) {
      this.safetyHeld = true;
      this.emit("thinking", { safety });
    }

    // Hand the reply to voiceClient → /api/tts → shared <audio>. We stay in
    // "thinking" until voiceClient reports "playing" (TTS fetch + decode),
    // then onPlaybackState flips us to "speaking".
    this.activeReplyId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `voice-${Date.now()}`;
    void playVoice(this.activeReplyId, reply);
  }

  // Read the NDJSON stream, collecting text deltas + the final meta frame.
  // (meta.safety_card is always null on the streaming path — safety forces
  // the JSON path server-side — but we read it defensively.)
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
          // "error" frames: leave the partial reply; the empty/short result
          // is handled by the caller (no reply → re-open mic).
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

  // ── voiceClient playback transitions ─────────────────────────────────
  private onPlaybackState(vs: PlaybackState): void {
    if (this.state === "ended") return;
    // Ignore events for any reply that isn't the one we're currently voicing
    // (residual /chat state, or a superseded reply).
    if (vs.replyId !== this.activeReplyId) return;

    if (vs.status === "playing") {
      if (this.state !== "speaking") {
        this.emit("speaking", { amplitude: 0 });
        this.startSpeakingAnalyser();
      }
      return;
    }
    if (vs.status === "error") {
      this.stopSpeakingAnalyser();
      const code = vs.errorCode === "paywall" ? "paywall" : "tts_failed";
      this.fail(code, `tts ${vs.errorCode ?? "error"}`, true);
      return;
    }
    if (vs.status === "idle" && this.state === "speaking") {
      // Krishna finished. If the helpline is still up, park in a mic-off hold
      // (state "thinking", no listening) until acknowledgeSafety(); otherwise
      // breathe and re-open the mic.
      this.stopSpeakingAnalyser();
      this.activeReplyId = null;
      if (this.safetyHeld) {
        this.awaitingSafetyAck = true;
        this.emit("thinking");
        return;
      }
      this.breatheThenListen();
    }
  }

  private breatheThenListen(): void {
    window.setTimeout(() => {
      if (this.state === "ended" || this.state === "error") return;
      this.resumeListening();
    }, BREATH_GAP_MS);
  }

  /** Called by VoiceClient once the user dismisses the helpline overlay. The
   *  user can dismiss while Krishna is still speaking OR after — both are
   *  handled: if still speaking we just clear the hold and let playback finish
   *  (it breathes → listens on its own); if playback already ended we re-open
   *  the mic now. */
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

  // ── speaking analyser (TTS amplitude) ─────────────────────────────────
  private startSpeakingAnalyser(): void {
    this.audioCtx?.resume().catch(() => {});
    if (!this.analyser) {
      // No analyser graph available — emit a gentle synthetic shimmer so the
      // orb still feels alive while Krishna speaks.
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
      // light low-pass so the orb breathes rather than jitters
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
  // The VAD runs continuously, so resuming the loop is purely a state flip —
  // the mic is already live and gating does the rest.
  private resumeListening(): void {
    if (this.state === "ended" || this.state === "error") return;
    this.abortTurn();
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
      // Runaway listening (continuous noise, no silence) — force-close the
      // turn by treating it as nothing said and re-opening cleanly.
      if (this.state === "listening") this.resumeListening();
    }, SAFETY_CAP_MS);
  }

  private clearSafetyCap(): void {
    if (this.safetyCapTimer) {
      clearTimeout(this.safetyCapTimer);
      this.safetyCapTimer = null;
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
    try {
      stopVoice();
    } catch {
      /* ignore */
    }
    this.stopSpeakingAnalyser();
    this.clearSafetyCap();
    this.activeReplyId = null;
    // park in starting so the UI can show a "resume?" affordance
    this.emit("starting");
  }

  /** Resume after a background pause. MUST be called from a user gesture so
   *  mobile re-grants the autoplay token (we replay the silent unlock). The
   *  VAD was paused (mic released) when backgrounded, so we re-acquire it here
   *  — awaited + abort-swallowed, never floated. */
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
      // VAD never came up (e.g. asset load failed). Restart from scratch.
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
    this.safetyHeld = false;
    this.awaitingSafetyAck = false;
    this.pausedFromBackground = false;
    this.activeReplyId = null;

    try {
      stopVoice();
    } catch {
      /* ignore */
    }

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

    if (this.unsubVoiceClient) {
      this.unsubVoiceClient();
      this.unsubVoiceClient = null;
    }
  }

  /** Tear down the Web-Audio graph. Called by VoiceClient on UNMOUNT so a
   *  later remount (which creates a fresh <audio> element) can build a new
   *  MediaElementSourceNode — a given element can only ever back one source,
   *  so the stale refs must be dropped with the element. */
  disposeAudio(): void {
    this.stopSpeakingAnalyser();
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
  }

  /** Full reset so a new session can begin (after exit, "start again"). */
  reset(): void {
    this.turns = [];
    this.state = "idle";
    this.safetyHeld = false;
    this.awaitingSafetyAck = false;
    this.pausedFromBackground = false;
    this.activeReplyId = null;
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
    // VAD keeps running; the "error" state gates onSpeechEnd so nothing is
    // processed until retry flips back to "listening".
    this.stopSpeakingAnalyser();
    this.clearSafetyCap();
    this.emit("error", { error: { code, message, recoverable } });
  }
}

// ── module-level helpers ─────────────────────────────────────────────────
// Aborts (fetch cancellation, mic re-acquire interruption, worklet teardown)
// are expected control flow during exit / background — never surface them.
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
  // VAD frames are quiet; scale into a perceptual 0..1 for the orb.
  return Math.min(1, value * 4);
}

// A ~10ms silent 16-bit mono WAV, generated once (lazily, browser-only) so
// there is no giant base64 literal and no top-level browser API touch.
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
  // sample bytes are already zero == silence
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return "data:audio/wav;base64," + btoa(binary);
}

// Hoisted accessor (function declarations hoist, so the class methods above
// can call this even though it's defined here). Builds the silent WAV once,
// lazily, browser-only — no top-level browser API touch, SSR-safe.
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
