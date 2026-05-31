"use client";

import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import type { Message, SafetyCard } from "@/lib/messages";
import { findBannedWord } from "@/lib/badWordFilter";
import { detectLang } from "@/lib/detectLang";
import { clearSession, loadSession, saveSession } from "@/lib/chatStorage";
import { BRAND } from "@/lib/brand";
import { track } from "@/lib/tracking";

// Phase 6.9.1 — split-color brand spans derive their text from BRAND
// rather than hardcoding "Divya" / "Vani". The brand name is a 2-word
// string; if a future rename produces a different word count, the
// rest.join(" ") fallback still renders the full name (just with all
// non-first words sharing the second color).
const [BRAND_HEAD, ...BRAND_TAIL] = BRAND.name.en.split(" ");
import SevaPaywall from "./SevaPaywall";
import SevaHubModal from "./SevaHubModal";
import MorningQuoteCard from "./MorningQuoteCard";
import { VerseCardList } from "./VerseCard";
import Flute from "./motifs/Flute";
import Bansuri from "./motifs/Bansuri";
import DiyaIcon from "./motifs/DiyaIcon";
import PeacockFeather from "./motifs/PeacockFeather";
import Atmosphere from "./Atmosphere";
import { useLanguage } from "../providers/LanguageProvider";


export default function ChatUI() {
  // Phase 12 — UI-chrome language (placeholder + empty-state heading only).
  // Krishna's replies are NOT switched here; they follow the user's input.
  const { lang, t } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState<boolean | null>(null);
  // Phase 7.0 server-side moderation — surfaces the bilingual warning
  // when /api/chat returns 400 {error:"moderation"}. Cleared on the
  // next keystroke (see textarea onChange below). Same visual treatment
  // as the client-side bannedWord notice — single shared row in inputBlock.
  const [serverModerationWarning, setServerModerationWarning] =
    useState<string | null>(null);
  // Phase 8.0 voice-input — Sarvam STT + Silero VAD chunked-REST.
  //
  // Replaces the Phase 7.0 MediaRecorder + Gemini batch flow and its
  // Web Speech "live preview" layer. The VAD library (@ricky0123/vad-web)
  // runs Silero VAD in-browser via ONNX Runtime / WebAssembly + an
  // AudioWorklet, captures the mic, and emits each detected utterance
  // as a Float32Array. Each utterance is encoded as WAV PCM16 16kHz
  // mono and POSTed to /api/transcribe (Sarvam Saaras V3), which keeps
  // the API key server-only. Transcribed chunks append to the textarea
  // in arrival order via a serial promise queue.
  //
  // mediaSupported gates the mic button (very rare to be false; all
  // modern browsers ship getUserMedia + WebAssembly). isListening
  // drives the recording visual state; isTranscribing turns on briefly
  // while a chunk is in flight. Both can be true at once during a
  // session — the chip prefers listening as the dominant state.
  //
  // micVadRef holds the active MicVAD instance, sessionEndTimerRef
  // holds the silence timer (5s after the last onSpeechEnd auto-stops
  // the session; 60s safety cap also rides on it as the outer bound),
  // transcribeQueueRef serializes /api/transcribe POSTs so chunk text
  // appends in onSpeechEnd order even when Sarvam round-trips overlap.
  // transcriptPrefixRef holds the user's pre-mic typed text plus all
  // chunks transcribed so far — it is the source of truth for the
  // textarea value during a session. compositionActiveRef + pendingTextRef
  // honor the IME safety invariant: if a chunk arrives while the user
  // is mid-Devanagari-composition, buffer the new value until
  // onCompositionEnd before pushing to setInput.
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [mediaSupported, setMediaSupported] = useState(false);
  const micVadRef = useRef<{ destroy: () => void } | null>(null);
  const sessionEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const transcribeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const transcriptPrefixRef = useRef<string>("");
  const compositionActiveRef = useRef<boolean>(false);
  const pendingTextRef = useRef<string>("");
  // Phase 8.0 mic-error chip — five failure modes (permission denied,
  // no hardware, unsupported browser, VAD load failed, Sarvam
  // transcription failed) surface as a bilingual parchment chip
  // instead of silently swallowing to console.error. Source: a
  // production tester (founder's brother) tapped the mic when his
  // browser had denied permission; nothing happened, no feedback,
  // he gave up. micErrorTimerRef holds the 8s auto-dismiss timer
  // so it can be cleared on manual dismiss or mic retap.
  type MicErrorType =
    | "permission_denied"
    | "no_hardware"
    | "unsupported_browser"
    | "vad_load_failed"
    | "transcription_failed";
  const [micError, setMicError] = useState<{
    type: MicErrorType;
    detail?: string;
  } | null>(null);
  const micErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // Phase 5.4 — seva counter state. Seeds from /api/me on mount and updates
  // from each chat response's message_count + seva_balance (streaming meta
  // frames + plain-JSON). The header seva trigger now links to /settings#seva
  // (payment moved off the header to declutter mobile, founder 2026-05-24),
  // so the value is no longer rendered here — kept updated for parity with
  // the server (and any future in-header counter).
  const [, setCounterState] = useState<{
    message_count: number;
    seva_balance: number;
  }>({ message_count: 0, seva_balance: 0 });
  // Phase 6.x — disclaimer starts expanded on mount, auto-collapses to a
  // chip after 5s. Re-arms whenever the user re-expands by tapping the
  // chip, so each expansion gets its own 5s read window before collapsing.
  // Locked decision #1 ("permanent visible disclaimer bar near avatar")
  // is satisfied by the chip — the disclaimer surface stays present, just
  // compacted; tap surfaces the full text in the same position.
  const [disclaimerExpanded, setDisclaimerExpanded] = useState(true);
  // Phase 9 — the seva/plans hub modal (opened from the header diya icon).
  const [hubOpen, setHubOpen] = useState(false);
  // Morning-quote opt-in card. Shows after 5 messages to engaged users.
  // mqEligible is set once from localStorage on mount; stays false if the
  // user already subscribed or dismissed within the last 7 days.
  const [mqEligible, setMqEligible] = useState(false);
  // Phase 6.8 — userId comes from /api/me on mount and scopes the
  // localStorage chat-history key. The god_messenger_uid cookie itself
  // is HttpOnly so the value has to round-trip through the server to
  // become readable here. priorUserIdRef catches the rare case of cookie
  // rotation (different identity returned on a later /api/me call) so
  // the previous identity's history doesn't bleed into the new session.
  // sentryReportedRef ensures we capture localStorage write failures
  // at most once per session — the persistence effect runs frequently
  // and we don't want to spam Sentry on a quota-bound device.
  const [userId, setUserId] = useState<string | null>(null);
  const priorUserIdRef = useRef<string | null>(null);
  const sentryReportedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Phase 5.5 — auto-grow the chat textarea up to ~6 lines, then scroll
  // internally past that. height: auto on every change resets layout so
  // scrollHeight reflects content size; we then clamp + toggle overflow.
  // Caps at 144px (~6 × 24px line-height for text-base + leading-normal).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 144;
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [input]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  // Phase 6.x — re-arm the auto-collapse timer every time disclaimerExpanded
  // flips back to true. Mount fires once with true → 5s → false. Tapping the
  // chip flips back to true → another 5s → false. Cleanup clears the pending
  // timer if state changes (or component unmounts) before it fires.
  useEffect(() => {
    if (!disclaimerExpanded) return;
    const t = setTimeout(() => setDisclaimerExpanded(false), 5000);
    return () => clearTimeout(t);
  }, [disclaimerExpanded]);

  // Morning-quote card eligibility — checked once on mount from localStorage.
  // Card suppressed if user already subscribed or dismissed < 7 days ago.
  useEffect(() => {
    try {
      if (localStorage.getItem("dv_mq_subscribed") === "true") return;
      const dismissedUntil = parseInt(
        localStorage.getItem("dv_mq_dismissed_until") ?? "0",
        10,
      );
      if (Date.now() < dismissedUntil) return;
      setMqEligible(true);
    } catch {
      // localStorage unavailable (private browsing) — skip card silently
    }
  }, []);

  function handleMqSubscribed() {
    try {
      localStorage.setItem("dv_mq_subscribed", "true");
    } catch { /* ignore */ }
    setMqEligible(false);
  }

  function handleMqDismiss() {
    try {
      localStorage.setItem(
        "dv_mq_dismissed_until",
        String(Date.now() + 7 * 24 * 60 * 60 * 1000),
      );
    } catch { /* ignore */ }
    setMqEligible(false);
  }

  // Phase 8.0 voice-input — one-time check that the browser supports
  // the APIs VAD needs: getUserMedia for the mic, AudioWorklet for
  // real-time audio processing, and WebAssembly for the Silero ONNX
  // model. All three are universal across modern Chromium/Firefox/
  // Safari; the check just hides the mic button on very old browsers.
  // The actual permission prompt happens at startSession() time.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function" &&
      typeof window.AudioWorklet !== "undefined" &&
      typeof window.WebAssembly !== "undefined";
    setMediaSupported(supported);
  }, []);

  // Release the mic + cancel timers if the component unmounts during a
  // recording session (e.g. user navigates away). vad.destroy() releases
  // the underlying MediaStream tracks and terminates the AudioWorklet so
  // the browser's mic indicator clears. The Web Speech preview layer
  // from Phase 7.0 was removed in Phase 8.0 — Sarvam chunks arrive fast
  // enough that the preview is no longer needed.
  useEffect(() => {
    return () => {
      const vad = micVadRef.current;
      if (vad) {
        try {
          vad.destroy();
        } catch {
          /* ignore */
        }
      }
      if (sessionEndTimerRef.current) {
        clearTimeout(sessionEndTimerRef.current);
      }
      if (micErrorTimerRef.current) {
        clearTimeout(micErrorTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    fetch("/api/onboarding-state")
      .then((r) => r.json())
      .then((d) => setIsFirstTime(d.isFirstTime === true))
      .catch(() => setIsFirstTime(false));
  }, []);

  // Phase 5.4 — seed the counter on mount so the diya panel shows the
  // right number before any chat turn lands. /api/me silent-fails to
  // {0, 0, 10} for fresh visitors, so this is safe even pre-cookie.
  //
  // Phase 6.8 — also captures user_id (added to /api/me response) and
  // hydrates the message list from localStorage scoped to that id.
  // Hydration only fires once on mount; persistence is handled by a
  // separate effect below that listens to [messages, isSending, userId].
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (
          typeof d.message_count === "number" &&
          typeof d.seva_balance === "number"
        ) {
          setCounterState({
            message_count: d.message_count,
            seva_balance: d.seva_balance,
          });
        }
        const incomingId: string | null =
          typeof d.user_id === "string" ? d.user_id : null;
        if (incomingId) {
          // Cookie rotation guard: if a different identity comes back,
          // wipe the previous identity's persisted history before the
          // new hydrate. Practically never fires — cookie is 1y with
          // no rotation logic — but cheap insurance.
          if (
            priorUserIdRef.current &&
            priorUserIdRef.current !== incomingId
          ) {
            clearSession(priorUserIdRef.current);
          }
          priorUserIdRef.current = incomingId;
          setUserId(incomingId);
          const restored = loadSession(incomingId);
          if (restored && restored.length > 0) {
            setMessages(restored);
          }
        }
      })
      .catch(() => {
        /* silent — counter stays at 0/0 until first chat response */
      });
  }, []);

  // Phase 6.8 — persist messages to localStorage on turn boundaries.
  // The isSending guard skips writes during streaming (a 100-delta turn
  // would otherwise produce 100 stringify+write cycles); we only persist
  // once a turn fully lands. saveSession itself silent-fails on quota /
  // private-browsing / security-policy errors; we capture once per session
  // via Sentry if it throws (sentryReportedRef avoids spamming).
  useEffect(() => {
    if (!userId) return;
    if (isSending) return;
    if (messages.length === 0) return;
    try {
      saveSession(userId, messages);
    } catch (e) {
      if (!sentryReportedRef.current) {
        sentryReportedRef.current = true;
        import("@sentry/nextjs")
          .then((Sentry) => Sentry.captureException(e))
          .catch(() => {
            /* swallow — Sentry import failure shouldn't surface */
          });
      }
    }
  }, [messages, isSending, userId]);

  async function sendMessage(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || isSending) return;
    if (findBannedWord(text)) return; // defense in depth — submit is also disabled in UI
    if (messages.length === 0) track("first_message_sent");

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    // assistantId is allocated up-front so error/abort handlers can
    // check whether a placeholder was already pushed (by reading
    // prev.find(m=>m.id===assistantId) inside a setMessages updater)
    // and append, rather than orphaning a partial reply with a fresh id.
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSending(true);
    if (isFirstTime) setIsFirstTime(false);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Negotiates the NDJSON streaming response shape from
          // /api/chat. Server falls back to plain JSON for any
          // caller that does not send this header (test scripts,
          // playwright mock). See DUAL-MODE RESPONSE CONTRACT block
          // at the top of src/app/api/chat/route.ts.
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        // Phase 7.0 — 400 {error:"moderation"} from the server-side
        // moderation gate (Path A word filter OR Path B Haiku). Roll
        // back the optimistic user-message append, restore the typed
        // text so the user can edit it, and surface the bilingual
        // warning above the input. `finally` clears isSending on return.
        if (res.status === 400) {
          let errBody:
            | { error?: string; message?: string; flag?: string }
            | null = null;
          try {
            errBody = await res.json();
          } catch {
            /* non-JSON 400 falls through to the generic throw */
          }
          if (errBody?.error === "moderation") {
            setMessages((prev) =>
              prev.filter((m) => m.id !== userMessage.id),
            );
            setInput(text);
            setServerModerationWarning(
              errBody.message ?? t.chat.moderationWarning,
            );
            return;
          }
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const contentType = res.headers.get("content-type") ?? "";
      const isStream =
        contentType.includes("application/x-ndjson") && res.body !== null;

      if (isStream) {
        // ── Streaming branch ──────────────────────────────────────
        // Read response.body as NDJSON. Three frame types:
        //   {type:"text",delta} — append to assistant content
        //   {type:"meta",verses,paywall,safety_card} — final metadata
        //   {type:"error",message} — mid-stream failure; render
        //                            partial reply + inline affordance
        //
        // All state changes go through setMessages((prev) => ...)
        // updaters that derive next-state from prev. No `let`
        // mutations across closure boundaries — keeps the React-19
        // / Next-16 immutability lint rule happy and avoids stale
        // captures in the streaming loop.
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Split on \n; the final element may be a partial line
          // (no trailing newline yet) — keep it in the buffer for
          // the next read.
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            let frame: Record<string, unknown>;
            try {
              frame = JSON.parse(line) as Record<string, unknown>;
            } catch {
              // Malformed line — skip rather than crash the stream.
              continue;
            }
            // Phase 5.4 — surface message_count + seva_balance from
            // meta frames into counterState in lockstep with the message
            // list update below. Kept here (not inside applyFrameToMessages)
            // so the module-scope helper stays single-purpose.
            if (frame.type === "meta") {
              const mc = frame.message_count;
              const sb = frame.seva_balance;
              if (typeof mc === "number" && typeof sb === "number") {
                setCounterState({ message_count: mc, seva_balance: sb });
              }
            }
            applyFrameToMessages(setMessages, assistantId, frame);
          }
        }
      } else {
        // ── Plain-JSON branch ────────────────────────────────────
        // Hit when server returned application/json — e.g. paywall
        // (no AI call), screenshot mock, or any non-streaming path.
        // Same shape as pre-Phase-3.9.
        const data = await res.json();
        // Phase 5.4 — counter update mirrors the streaming meta-frame
        // path so the diya panel stays in sync regardless of mode.
        if (
          typeof data.message_count === "number" &&
          typeof data.seva_balance === "number"
        ) {
          setCounterState({
            message_count: data.message_count,
            seva_balance: data.seva_balance,
          });
        }
        const reply: string = data.reply ?? "Something went quiet. Try again.";
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: reply,
            paywall: data.paywall === true,
            tiers: Array.isArray(data.tiers) ? data.tiers : undefined,
            verses: Array.isArray(data.verses) ? data.verses : undefined,
            safety_card:
              data.safety_card && typeof data.safety_card === "object"
                ? (data.safety_card as SafetyCard)
                : undefined,
          },
        ]);
      }
    } catch {
      // Network failure or non-2xx response. Read whether a partial
      // reply already exists in state (placeholder pushed mid-stream)
      // and either append a "connection dropped" affordance to it,
      // or render a fresh generic error reply.
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === assistantId);
        const errLine =
          "_connection dropped — please send your message again._";
        if (idx >= 0) {
          const next = [...prev];
          const cur = next[idx].content;
          next[idx] = {
            ...next[idx],
            content: cur ? `${cur}\n\n${errLine}` : errLine,
          };
          return next;
        }
        return [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: "I couldn't reach the guide. Please try again.",
          },
        ];
      });
    } finally {
      setIsSending(false);
    }
  }

  function handlePaywallSuccess(messageId: string) {
    setMessages((prev) => [
      ...prev.map((m) =>
        m.id === messageId ? { ...m, paywall: false, tiers: undefined } : m,
      ),
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "तुम्हारी सेवा स्वीकार है, मित्र।\nजब मन में जो उठे, फिर से कहो — मैं यहीं हूँ।",
      },
    ]);
  }

  const isEmpty = messages.length === 0 && !isSending;
  const bannedWord = findBannedWord(input);

  // Phase 8.0 voice-input — VAD session with chunked /api/transcribe POSTs.
  //
  // No fixed time cap. The session ends when any of:
  //   - User taps the mic button again (manual stop)
  //   - 5 seconds of detected silence elapse after the most recent
  //     utterance (SESSION_END_SILENCE_MS — armed in onSpeechEnd,
  //     cancelled in onSpeechStart)
  //   - The 60s outer safety cap fires (SAFETY_CAP_MS) — protects
  //     against a runaway VAD that never detected silence, e.g. the
  //     model getting confused by sustained background noise
  //
  // Each VAD utterance triggers onSpeechEnd with a Float32Array of
  // 16kHz mono PCM. We encode it as a WAV blob and POST it through
  // the transcribeQueue. The queue is a serial promise chain so chunk
  // text appends to the textarea in utterance order even if Sarvam
  // round-trips finish out of order.
  const SESSION_END_SILENCE_MS = 5_000;
  const SAFETY_CAP_MS = 60_000;

  // Phase 8.0 mic-error helpers. showMicError + dismissMicError share
  // a single 8-second auto-dismiss timer (micErrorTimerRef). Each
  // showMicError clears the prior timer before starting a fresh one,
  // so back-to-back errors don't race or leak.
  function showMicError(type: MicErrorType, detail?: string) {
    if (micErrorTimerRef.current) {
      clearTimeout(micErrorTimerRef.current);
    }
    setMicError({ type, detail });
    micErrorTimerRef.current = setTimeout(() => {
      setMicError(null);
      micErrorTimerRef.current = null;
    }, 8000);
  }

  function dismissMicError() {
    if (micErrorTimerRef.current) {
      clearTimeout(micErrorTimerRef.current);
      micErrorTimerRef.current = null;
    }
    setMicError(null);
  }

  async function startSession() {
    // Belt-and-suspenders browser-support check. The mediaSupported
    // effect at mount already gates the mic button's rendering, but
    // this defends against the rare case of MediaRecorder/getUserMedia
    // being unavailable at click time (e.g., browser extension or
    // policy disabled it after mount).
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof window.AudioWorklet === "undefined" ||
      typeof window.WebAssembly === "undefined"
    ) {
      showMicError("unsupported_browser");
      return;
    }

    try {
      // Dynamic import keeps the ~17MB VAD WASM/ONNX assets out of the
      // initial page bundle. First-time mic use triggers an async
      // fetch from /public/vad/; subsequent uses are cached.
      const { MicVAD, utils } = await import("@ricky0123/vad-web");

      // Capture pre-mic typed text as the running prefix. All
      // transcribed chunks append after it. Cleared when the user
      // sends or clears manually.
      transcriptPrefixRef.current = input.trim();

      // Audio cue — short Web Audio sine ping signals "listening".
      // Runs from a user-gesture click handler so AudioContext is not
      // auto-suspended. Failures swallowed (sound is best-effort).
      playStartTone();

      const vad = await MicVAD.new({
        // Local asset paths — files copied into public/vad/ from
        // node_modules/@ricky0123/vad-web/dist/ and
        // node_modules/onnxruntime-web/dist/. Self-hosted so we don't
        // depend on a third-party CDN at runtime.
        baseAssetPath: "/vad/",
        onnxWASMBasePath: "/vad/",
        model: "v5",
        // Per-utterance silence threshold. Brief breath-pauses (<700ms)
        // should NOT split a sentence into two chunks. The 5s session-
        // end silence timer (sessionEndTimerRef) is a SEPARATE rule
        // layered on top — it ends the whole session, not an utterance.
        redemptionMs: 700,
        minSpeechMs: 250,
        preSpeechPadMs: 200,
        // When the user manually stops mid-speech, still emit the
        // currently-buffered audio as a final onSpeechEnd.
        submitUserSpeechOnPause: true,

        onSpeechStart: () => {
          // User started speaking again — cancel the pending session-
          // end timer. It will be re-armed when this utterance ends.
          if (sessionEndTimerRef.current) {
            clearTimeout(sessionEndTimerRef.current);
            sessionEndTimerRef.current = null;
          }
        },

        onSpeechEnd: (audio: Float32Array) => {
          // Encode 16kHz mono PCM16 WAV and queue for transcription.
          // ArrayBuffer → base64 via the library's own helper (no
          // FileReader async needed; we're already on the main thread).
          const wavBuffer = utils.encodeWAV(audio);
          const base64 = utils.arrayBufferToBase64(wavBuffer);
          queueTranscribe(base64);

          // Arm/re-arm the session-end timer. 5s of silence after the
          // last utterance auto-stops the session. The safety cap
          // (60s) is a separate timer set once at start; this one
          // tracks "silence since last speech".
          if (sessionEndTimerRef.current) {
            clearTimeout(sessionEndTimerRef.current);
          }
          sessionEndTimerRef.current = setTimeout(() => {
            stopSession();
          }, SESSION_END_SILENCE_MS);
        },
      });

      micVadRef.current = vad;
      vad.start();
      setIsListening(true);

      // Outer safety cap. Independent of the per-silence timer above:
      // if the silence detector ever fails (continuous noise, model
      // bug), this absolute upper bound still releases the mic. We
      // intentionally reuse sessionEndTimerRef — onSpeechEnd will
      // overwrite it once the first utterance lands, which is the
      // desired behavior (session-end-silence beats safety-cap once
      // we have real speech signal).
      sessionEndTimerRef.current = setTimeout(() => {
        stopSession();
      }, SAFETY_CAP_MS);
    } catch (e) {
      console.error("[chat] VAD init failed:", e);
      setIsListening(false);
      // Classify by DOMException name. MicVAD.new() internally calls
      // getUserMedia, so permission/hardware errors propagate up with
      // their original DOMException name preserved. Anything else
      // (asset 404, ONNX init failure, network) is bucketed as
      // vad_load_failed — the user-facing message is "try again in
      // a moment" which fits both retryable network failures and
      // transient asset-serving issues.
      const name =
        e instanceof Error ? (e as Error & { name?: string }).name : "";
      const detail = e instanceof Error ? e.message : String(e);
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        showMicError("permission_denied");
      } else if (
        name === "NotFoundError" ||
        name === "DevicesNotFoundError"
      ) {
        showMicError("no_hardware");
      } else if (name === "NotSupportedError") {
        showMicError("unsupported_browser", detail);
      } else {
        showMicError("vad_load_failed", detail);
      }
    }
  }

  function stopSession() {
    if (sessionEndTimerRef.current) {
      clearTimeout(sessionEndTimerRef.current);
      sessionEndTimerRef.current = null;
    }
    const vad = micVadRef.current;
    if (vad) {
      try {
        // destroy() releases the underlying MediaStream tracks and
        // terminates the AudioWorklet — the browser's mic indicator
        // clears immediately. Pending in-flight transcribeQueue
        // promises continue to resolve and append their chunks; the
        // queue is intentionally NOT cancelled on stop because the
        // user expects their final utterance to land in the textarea.
        vad.destroy();
      } catch (e) {
        console.error("[chat] VAD destroy failed:", e);
      }
      micVadRef.current = null;
    }
    setIsListening(false);
  }

  // Serial transcription queue. Each chunk's POST starts only after
  // the previous chunk's POST resolves — this preserves utterance
  // order in the textarea regardless of Sarvam round-trip jitter.
  function queueTranscribe(base64Wav: string) {
    transcribeQueueRef.current = transcribeQueueRef.current.then(
      async () => {
        setIsTranscribing(true);
        try {
          const res = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: base64Wav, mimeType: "audio/wav" }),
          });
          if (!res.ok) {
            throw new Error(`transcribe HTTP ${res.status}`);
          }
          const data = (await res.json()) as { text?: string };
          const text = (data.text ?? "").trim();
          if (text) appendTranscribedChunk(text);
        } catch (e) {
          console.error("[chat] transcription chunk failed:", e);
          // Phase 8.0 — surface to the user as well, not just console.
          // The session keeps recording (VAD is independent of chunk
          // transcription) so the user can keep speaking; the chip
          // tells them the LAST chunk didn't land.
          showMicError(
            "transcription_failed",
            e instanceof Error ? e.message : String(e),
          );
        } finally {
          setIsTranscribing(false);
        }
      },
    );
  }

  function appendTranscribedChunk(text: string) {
    const prefix = transcriptPrefixRef.current;
    const next = prefix ? `${prefix} ${text}` : text;
    transcriptPrefixRef.current = next;

    // IME safety: if the user is mid-Devanagari composition on an
    // on-screen keyboard (unlikely but possible — they could be
    // typing while mic continues to record), buffer the value and
    // flush at onCompositionEnd. Honors the persona-invariants
    // "Devanagari typing must continue to work after voice input".
    if (compositionActiveRef.current) {
      pendingTextRef.current = next;
      return;
    }
    setInput(next);
    if (serverModerationWarning) setServerModerationWarning(null);
  }

  const toggleMic = () => {
    if (isListening) {
      stopSession();
    } else {
      // Clear any prior error before retrying — the user has signaled
      // intent to try again (e.g., they granted permission in browser
      // settings and came back).
      dismissMicError();
      startSession();
    }
  };

  // Phase 7.0 production-test fix — shared input form rendered in BOTH
  // the centered empty-state and the bottom footer. Defined inline here
  // (rather than as a separate component) so all handlers / refs close
  // over the existing component state without a prop-drilling layer.
  // Both layout branches mount the SAME JSX node, so the textarea ref
  // + autogrow effect + IME composition stay continuous as the layout
  // flips at first message.
  const inputBlock = (
    <div className="mx-auto w-full max-w-[600px]">
      {(bannedWord || serverModerationWarning) && (
        <p
          role="status"
          className={`mb-2 text-center text-xs text-sacred ${
            lang === "hi"
              ? "font-devanagari"
              : "font-[family-name:var(--font-serif)] italic"
          }`}
        >
          {serverModerationWarning ?? t.chat.moderationWarning}
        </p>
      )}
      {/* Phase 8.0 mic-error chip — five failure modes (permission,
          hardware, browser support, VAD assets, Sarvam transcription)
          surface here. Sacred border conveys gravity without bright-
          red SaaS-alert aesthetics. Auto-dismisses after 8s; user can
          dismiss earlier via × (separate 44×44 touch target sibling
          element so the chip pill itself stays compact). */}
      {micError && (
        <div
          role="alert"
          aria-live="assertive"
          className="fade-up mb-3 flex items-center justify-center gap-1 [animation-delay:0ms] [animation-fill-mode:backwards]"
        >
          <span className="inline-flex max-w-[88%] items-center gap-2 rounded-full border border-sacred/60 bg-parchment px-4 py-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <AlertTriangleIcon className="h-4 w-4 shrink-0 text-sacred" />
            <span
              className={`text-sm leading-snug text-krishna ${
                lang === "hi" ? "font-devanagari" : "font-serif italic"
              }`}
            >
              {t.chat.micErrors[micError.type]}
            </span>
          </span>
          <button
            type="button"
            onClick={dismissMicError}
            aria-label={t.chat.ariaDismiss}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-krishna/50 transition-colors hover:bg-sacred/10 hover:text-krishna focus:outline-none focus:ring-2 focus:ring-sacred/40"
          >
            <span aria-hidden className="text-lg leading-none">
              ×
            </span>
          </button>
        </div>
      )}
      {/* Phase 7.0 voice-input — prominent listening / transcribing
          status chip above the form. Mirrors the disclaimer chip
          vocabulary (rounded-full + brass border + parchment fill)
          and uses bilingual text so the state is unambiguous. The
          fade-up animation gives it a soft entry, not a hard cut. */}
      {(isListening || isTranscribing) && (
        <div
          role="status"
          aria-live="polite"
          className="fade-up mb-3 flex items-center justify-center"
        >
          {isListening ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-brass/40 bg-parchment px-4 py-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <span aria-hidden className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass [animation-delay:300ms]" />
              </span>
              <span
                className={`text-sm text-brass-dark ${
                  lang === "hi" ? "font-devanagari" : "font-serif italic"
                }`}
              >
                {t.chat.listening}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-devotional/40 bg-parchment px-4 py-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <span
                aria-hidden
                className="h-3 w-3 animate-spin rounded-full border-2 border-devotional/30 border-t-devotional"
              />
              <span
                className={`text-sm italic text-devotional-dark ${
                  lang === "hi" ? "font-devanagari" : "font-serif"
                }`}
              >
                {t.chat.transcribing}
              </span>
            </span>
          )}
        </div>
      )}
      {/* Form row + sibling suggestion card. Both are width-capped by
          the outer max-w-[600px] container above. Mobile reality (~360px
          Android) made the prior nested-inside-the-textarea-column
          layout cramped: Bansuri is hidden on mobile, so the textarea
          column shrank to fit between left edge and mic + Send, and
          the suggestion list inherited that squeezed width — each Hindi
          option wrapped to two lines. Lifting the list out keeps it
          full-width while leaving the form row clean. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
        className="flex items-start gap-2"
      >
        <Bansuri className="hidden h-12 w-auto shrink-0 sm:block" />
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // User edited the textarea directly — break the running
            // transcript prefix so the NEXT voice chunk doesn't
            // overwrite their manual edits.
            transcriptPrefixRef.current = e.target.value;
            if (serverModerationWarning) setServerModerationWarning(null);
          }}
          onCompositionStart={() => {
            compositionActiveRef.current = true;
          }}
          onCompositionEnd={() => {
            compositionActiveRef.current = false;
            if (pendingTextRef.current) {
              setInput(pendingTextRef.current);
              pendingTextRef.current = "";
            }
          }}
          onKeyDown={(e) => {
            // Desktop (fine pointer): Enter submits, Shift+Enter inserts
            // newline — ChatGPT/Slack/WhatsApp-web convention.
            // Mobile (coarse pointer): Enter falls through to default
            // browser behavior = newline insertion. Send button submits.
            // Mirrors WhatsApp / Instagram DMs / ChatGPT-mobile so users
            // can author multi-paragraph messages on touch keyboards
            // (real user screenshot showed Enter wiping their draft).
            // matchMedia runs inside the handler — client-only, no SSR
            // concern. Composition / send-in-progress / empty-input
            // guards still hold at the Send button + sendMessage entry.
            if (e.key === "Enter" && !e.shiftKey) {
              const isMobile =
                typeof window !== "undefined" &&
                window.matchMedia("(pointer: coarse)").matches;
              if (!isMobile) {
                e.preventDefault();
                sendMessage();
              }
            }
          }}
          placeholder={t.chat.placeholder}
          disabled={isSending}
          aria-invalid={bannedWord !== null}
          className="flex-1 resize-none overflow-hidden rounded-3xl border border-gold/25 bg-ink2/65 px-6 py-4 font-devanagari text-base leading-normal text-ivory shadow-[0_1px_0_rgba(0,0,0,0.4)_inset] placeholder:text-ivory/30 focus:border-gold focus:shadow-[0_0_0_4px_rgba(212,162,74,0.08)] focus:outline-none disabled:opacity-60 aria-[invalid=true]:border-red-seal"
        />
        {mediaSupported && (
          <div className="relative flex shrink-0 items-center justify-center">
            {/* Phase 7.0 voice-input — sonar rings emanate outward
                from the mic when active. Two pings at staggered
                phases (0s, 0.8s offset) give a continuous "alive"
                feel without being so busy it competes with the
                meditative palette. pointer-events-none so the
                actual button stays clickable through them. */}
            {isListening && (
              <>
                <span
                  aria-hidden
                  className="sonar-ring pointer-events-none absolute inset-0 rounded-full bg-brass/35"
                />
                <span
                  aria-hidden
                  className="sonar-ring-delayed pointer-events-none absolute inset-0 rounded-full bg-brass/35"
                />
              </>
            )}
            <button
              type="button"
              onClick={toggleMic}
              // Phase 8.0 — manual stop must work even while a chunk
              // POST is in flight (the user has finished speaking and
              // wants to send). Only block clicks during the brief
              // post-stop window when listening is false but a chunk
              // is still resolving — in that case neither start nor
              // stop is meaningful.
              disabled={!isListening && isTranscribing}
              aria-label={
                !isListening && isTranscribing
                  ? t.chat.ariaMicTranscribing
                  : isListening
                    ? t.chat.ariaMicStop
                    : t.chat.ariaMicStart
              }
              aria-pressed={isListening}
              className={`relative z-10 flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 transition-all focus:outline-none focus:ring-2 focus:ring-devotional/40 ${
                isListening
                  ? "scale-110 bg-brass text-parchment shadow-[0_0_0_3px_rgba(176,141,76,0.25)]"
                  : isTranscribing
                    ? "bg-devotional/10 text-devotional/70 cursor-wait"
                    : "text-krishna/60 hover:bg-devotional/10 hover:text-krishna"
              }`}
            >
              <MicIcon className="h-5 w-5" />
            </button>
          </div>
        )}
        {/* Send button — icon-only 44×44 circle on mobile so the
            textarea can use the freed horizontal space; text "Send"
            button on sm:+ keeps the existing desktop affordance.
            sm:min-w-0 cancels the mobile min-width so the desktop
            text variant sizes to content. */}
        <button
          type="submit"
          disabled={isSending || !input.trim() || bannedWord !== null}
          aria-label={t.chat.ariaSend}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-gold bg-linear-to-b from-gold to-gold-dim p-2 font-[family-name:var(--font-display)] text-sm text-ink0 shadow-[0_0_30px_rgba(212,162,74,0.25),0_12px_30px_rgba(0,0,0,0.5)] transition-transform hover:-translate-y-px disabled:opacity-45 sm:min-h-12 sm:min-w-0 sm:px-6"
        >
          <SendIcon className="h-5 w-5 sm:hidden" />
          <span
            className={`hidden sm:inline ${
              lang === "hi" ? "font-devanagari" : ""
            }`}
          >
            {t.chat.sendButton}
          </span>
        </button>
      </form>
      {/* Phase 7.0 onboarding-suggestion redesign — replaced the 8
          clickable emotional-state pills (ONBOARDING_OPTIONS) with
          static informational text. Beta-tester feedback: first-time
          users tapped pills like "मन थोड़ा भारी है आज" out of
          curiosity without being in those states, and Krishna
          responded to phantom emotion with deep acknowledge-first
          reflection — register mismatch. Static text shows what
          users CAN DO without forcing an emotional framing; the user
          defines their register by what they type. Shown on every
          empty-state (no longer gated on isFirstTime — informational
          context is useful for returning users too). */}
      {isEmpty && (
        <div className="mt-2 flex w-full flex-col items-center gap-5 text-center">
          <h2
            className={`text-2xl font-normal leading-snug text-ivory sm:text-3xl ${
              lang === "hi"
                ? "font-devanagari"
                : "font-[family-name:var(--font-display)]"
            }`}
          >
            {t.chat.promptLead}{" "}
            <span className="text-gold">{t.chat.promptAccent}</span>
          </h2>
          <div
            aria-hidden
            className="flex items-center gap-2.5 text-gold-mute"
          >
            <span className="h-px w-12 bg-linear-to-r from-transparent to-gold-mute" />
            <span className="h-[5px] w-[5px] rotate-45 bg-gold" />
            <span className="h-px w-12 bg-linear-to-l from-transparent to-gold-mute" />
          </div>
          <div
            className={`flex flex-col gap-2.5 text-base leading-relaxed text-ivory/70 ${
              lang === "hi"
                ? "font-devanagari"
                : "font-[family-name:var(--font-serif)] italic"
            }`}
          >
            {t.chat.suggestions.map((s, i) => (
              <span key={i}>{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <main className="relative flex h-full flex-1 flex-col">
      {/* Phase 8 cinematic-dark redesign — Krishna atmospheric vignette
          replaces the Phase 2.5 lotus-mandala watermark as the z-0
          background. Empty state uses the softer 'chat' crop; once the
          conversation is live it recedes to 'deep' so message text
          stays the focus. pointer-events-none + aria-hidden (inside
          Atmosphere) so it never intercepts clicks or screen readers,
          and the disclaimer/identity layers stay stacked above it
          (Locked Decision #1 intact). */}
      <div className="absolute inset-0 z-0">
        <Atmosphere mode={isEmpty ? "chat" : "deep"} intensity={1} vignette={1} />
      </div>

      <header className="relative z-20 border-b border-brass/30 bg-parchment/70 px-4 pt-[calc(1rem_+_env(safe-area-inset-top,0px))] pb-4 backdrop-blur sm:px-6 sm:pt-[calc(1.25rem_+_env(safe-area-inset-top,0px))] sm:pb-5">
        {/* Phase 8 launch-eve mobile fix — was a centred title with an
            `absolute right-3 top-3` controls overlay, which collided
            with the title on ~360px. Now an in-flow 2-zone flex:
            the feather+title group takes the slack (flex-1, centred
            within its zone) and the controls sit at the far right as
            a shrink-0 sibling, so they can never crowd the title.
            min-w-0 lets the title wrap instead of forcing overflow. */}
        <div className="mx-auto flex max-w-[600px] items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
            <PeacockFeather
              className="h-10 w-auto shrink-0 sm:h-12"
              width={48}
              height={48}
              priority
            />
            <div className="min-w-0 text-center">
              <h1 className="whitespace-nowrap font-[family-name:var(--font-display)] text-xl font-normal leading-none tracking-[0.02em] text-ivory sm:text-3xl">
                <span>{BRAND_HEAD}</span>
                <span> {BRAND_TAIL.join(" ")}</span>
              </h1>
              {/* Subtitle hidden on mobile — at ~360px it stacked one word
                  per line beside the icon cluster (founder 2026-05-25). */}
              <p
                className={`mt-1 hidden text-xs leading-snug text-gold-dim sm:block sm:text-sm ${
                  lang === "hi"
                    ? "font-devanagari"
                    : "font-[family-name:var(--font-serif)] italic"
                }`}
              >
                {t.chat.subtitle}
              </p>
            </div>
          </div>
          {/* Phase 5.4 — diya seva trigger + panel. Phase 8 — Settings
              gear sibling (because /chat is fullscreen, the layout
              footer's Settings link is below the fold; this gives
              /settings a first-class reach point from the main UI).
              Phase 8 launch-eve — moved out of the absolute corner
              overlay into this in-flow `relative` wrapper so it no
              longer overlaps the centred title on small viewports.
              The wrapper stays `relative` (positioned), so
              DiyaSevaPanel's `absolute right-0 top-full` still anchors
              and slides down directly under the diya icon exactly as
              before — no seva-flow behaviour change. */}
          <div className="relative flex shrink-0 items-center gap-1">
            {/* Disclaimer collapsed → permanent labelled ⓘ control,
                here in the identity header beside the avatar/wordmark
                (Locked Decision #1: "permanent disclaimer near the
                avatar" — the full bar still auto-shows every mount;
                this is the always-present re-open affordance). Only
                rendered while collapsed, mirroring the prior chip's
                conditional. Rose tone marks it as the identity cue vs
                the gold utility icons; same min-h/min-w box so the
                cluster stays aligned. aria-label + title keep it
                discoverable with no visible text, per founder request
                2026-05-17. */}
            {!disclaimerExpanded && (
              <button
                type="button"
                onClick={() => setDisclaimerExpanded(true)}
                aria-label={t.chat.ariaDisclaimer}
                title={t.chat.ariaDisclaimer}
                aria-expanded={disclaimerExpanded}
                aria-controls="dv-disclaimer"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-[#d49a8e] transition-colors hover:bg-red-seal/15 focus:outline-none focus:ring-2 focus:ring-red-seal/40"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-5 w-5"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5A5.5 5.5 0 1 1 8 2.5a5.5 5.5 0 0 1 0 11zM8 6.5a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 8 6.5zm0-2a.875.875 0 1 0 0 1.75A.875.875 0 0 0 8 4.5z" />
                </svg>
              </button>
            )}
            {/* Phase 10.5 — /voice link. Icon-only sound-wave glyph in
                gold-leaf (text-devotional) opening voice-to-voice mode.
                44×44 tap target; sits beside the /demo affordance in the
                header cluster. */}
            <Link
              href="/voice"
              aria-label={t.chat.ariaVoiceMode}
              title={t.chat.ariaVoiceMode}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-devotional transition-colors hover:bg-devotional/10 focus:outline-none focus:ring-2 focus:ring-devotional/40"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <line x1="4" y1="10" x2="4" y2="14" />
                <line x1="8" y1="6" x2="8" y2="18" />
                <line x1="12" y1="9" x2="12" y2="15" />
                <line x1="16" y1="4" x2="16" y2="20" />
                <line x1="20" y1="10" x2="20" y2="14" />
              </svg>
            </Link>
            {/* /demo "examples" affordance moved into /settings (founder
                2026-05-25) to declutter the header — it lives there as the
                "See examples" section now. */}
            <Link
              href="/settings"
              aria-label={t.chat.ariaSettings}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-devotional transition-colors hover:bg-devotional/10 focus:outline-none focus:ring-2 focus:ring-devotional/40"
            >
              <SettingsIcon className="h-6 w-6" />
            </Link>
            {/* Seva / Plans — the single monetization hub (Phase 9, founder
                2026-05-27). Opens the SevaHubModal (Plans + Seva tabs); all
                payment lives here now, not in Settings. The in-chat SevaPaywall
                (free pool exhausted) is unchanged. */}
            <button
              type="button"
              onClick={() => setHubOpen(true)}
              aria-label={t.chat.ariaSeva}
              title={t.chat.ariaSeva}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-devotional transition-colors hover:bg-devotional/10 focus:outline-none focus:ring-2 focus:ring-devotional/40"
            >
              <DiyaIcon className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Phase 9 — seva/plans hub (portals to body; open state above). Opens
          on the Seva tab by default (it's the diya/seva icon); the user can
          switch to Plans inside. */}
      <SevaHubModal
        open={hubOpen}
        onClose={() => setHubOpen(false)}
        initialTab="seva"
      />

      {/* Disclaimer — full bilingual bar auto-shows on every mount for
          5s (the legally load-bearing exposure — UNCHANGED), then the
          whole band animates to zero height + sheds its chrome so it
          occupies NO space. The permanent re-open affordance is now the
          labelled ⓘ in the header icon cluster (above), beside the
          avatar/wordmark. Locked Decision #1 still satisfied: the
          disclaimer is shown in full every session and a permanent,
          labelled disclaimer control sits directly next to the avatar;
          collapsed no longer eats a horizontal band (founder request
          2026-05-17). transition-all on the wrapper fades the
          border/bg with the grid-rows+opacity collapse for a smooth,
          professional close — no hard cut, no residual strip. */}
      <div
        id="dv-disclaimer"
        className={`relative z-10 overflow-hidden transition-all duration-500 ease-in-out ${
          disclaimerExpanded
            ? "border-y border-gold/15 bg-parchment/40 backdrop-blur"
            : "border-y-0"
        }`}
      >
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-500 ease-in-out ${
            disclaimerExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <p
              className={`mx-auto max-w-[600px] px-4 py-2 text-center text-xs leading-tight text-brass-dark ${
                lang === "hi"
                  ? "font-devanagari"
                  : "font-[family-name:var(--font-serif)] italic"
              }`}
            >
              {BRAND.disclaimer[lang]}
            </p>
          </div>
        </div>
      </div>

      {/* Phase 7.0 production-test fix — empty-state ChatGPT-style layout.
          When isEmpty, the input box + flute + 3 suggestion pills render
          centered vertically in the messages-area's space (no bottom
          footer). After the first message lands, isEmpty flips to false
          and the layout snaps to the standard messages-scroll + bottom-
          footer-input shape. The {inputBlock} JSX is shared so both
          branches use one form, one set of handlers, one autogrow effect. */}
      {isEmpty ? (
        <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-8">
          {/* Orchestrated page-load — single high-impact moment per
              Anthropic's frontend-design skill ("one well-orchestrated
              page load with staggered reveals creates more delight than
              scattered micro-interactions"). Greeting → input → suggestion
              list cascade in sequence on first paint. animation-fill-mode
              backwards holds each child at its pre-animation state during
              the delay so there's no flash-then-fade. */}
          <div className="flex w-full max-w-[600px] flex-col items-center gap-6">
            {/* Dawn Aarti — a quietly floating bansuri above the
                greeting (handoff empty-state spec). dawn-float is
                CSS-only + reduced-motion-safe (globals.css). */}
            <Flute className="fade-up dawn-float h-8 w-auto opacity-80 [animation-delay:0ms] [animation-fill-mode:backwards]" />
            {/* Copy unchanged (product-locked); Devanagari now rendered
                in Tiro — Cormorant has no Devanagari glyphs, so the
                prior font-serif greeting was silently falling back. */}
            <p
              className={`fade-up text-center text-base leading-relaxed text-ink-soft [animation-delay:120ms] [animation-fill-mode:backwards] ${
                lang === "hi"
                  ? "font-[family-name:var(--font-devanagari)]"
                  : "font-[family-name:var(--font-serif)] italic"
              }`}
            >
              {t.chat.greeting}
            </p>
            {/* Phase 8 pre-launch — value-prop subtitle for cold-acquired
                users (Reddit/X/Product Hunt) who land on /chat with no
                context of what Divya Vani is. font-devanagari (not
                font-serif/Cormorant — Cormorant has no Devanagari glyphs;
                this matches the greeting above + the whole Hindi chat
                surface) at text-sm so it stays subordinate to the
                greeting. brass-dark is the AA-safe text token on parchment
                (full-saturation --devotional is not AA). Staggered at 90ms
                — a breath between greeting (0ms) and input (180ms). */}
            <p
              className={`fade-up max-w-[460px] text-center text-sm leading-relaxed text-ink-faint [animation-delay:220ms] [animation-fill-mode:backwards] ${
                lang === "hi"
                  ? "font-devanagari"
                  : "font-[family-name:var(--font-serif)] italic"
              }`}
            >
              {t.chat.valueProp}
            </p>
            <div className="fade-up w-full [animation-delay:340ms] [animation-fill-mode:backwards]">
              {inputBlock}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="relative z-10 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
            <div className="mx-auto flex w-full max-w-[600px] flex-col gap-4">
              {messages.map((m, i) => (
                <MessageCard
                  key={m.id}
                  message={m}
                  userLang={resolveUserLang(messages, i)}
                  onPaywallSuccess={() => handlePaywallSuccess(m.id)}
                />
              ))}
              {isSending && messages[messages.length - 1]?.role === "user" && (
                // Spinner shows from submit until the assistant placeholder
                // is pushed (first text delta in streaming mode, or full
                // response in plain-JSON mode). Once Krishna's bubble appears
                // the bubble itself becomes the "thinking" indicator as it
                // grows token-by-token. The shimmer + breathing dots
                // (dv-thinking-*, globals.css) keep it visibly alive so a
                // slow first token never reads as a frozen UI.
                <p
                  role="status"
                  className={`fade-up flex items-center justify-center gap-1.5 text-center text-sm italic ${
                    lang === "hi"
                      ? "font-devanagari"
                      : "font-[family-name:var(--font-serif)]"
                  }`}
                >
                  <span className="dv-thinking-shimmer">{t.chat.thinking}</span>
                  <span aria-hidden className="dv-thinking-dots">
                    <span className="dv-thinking-dot" />
                    <span className="dv-thinking-dot" />
                    <span className="dv-thinking-dot" />
                  </span>
                </p>
              )}
              {mqEligible && messages.length >= 5 && (
                <MorningQuoteCard
                  onSubscribed={handleMqSubscribed}
                  onDismiss={handleMqDismiss}
                />
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="relative z-10 border-t border-brass/30 bg-parchment/70 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
            {inputBlock}
          </div>
        </>
      )}
    </main>
  );
}

// Walk back from index `i` to the most recent user message and
// detect its language. Used to label verse cards in the language
// the user wrote in (locked decision #12 — Krishna replies match
// user's input language, so the verse cards should too).
//
// Phase 5.5 — sticky-language: if the most recent user message is
// short/ambiguous (single English word like a name), inherit the
// previous user message's language rather than flipping. detectLang's
// new priorLang arg encodes the threshold.
function resolveUserLang(
  messages: Message[],
  i: number,
): "hi" | "en" {
  let mostRecent = -1;
  for (let j = i; j >= 0; j--) {
    if (messages[j].role === "user") {
      mostRecent = j;
      break;
    }
  }
  if (mostRecent === -1) return "hi"; // no user messages yet

  let priorLang: "hi" | "en" | undefined;
  for (let k = mostRecent - 1; k >= 0; k--) {
    if (messages[k].role === "user") {
      priorLang = detectLang(messages[k].content);
      break;
    }
  }
  return detectLang(messages[mostRecent].content, priorLang);
}

function MessageCard({
  message,
  userLang,
  onPaywallSuccess,
}: {
  message: Message;
  userLang: "hi" | "en";
  onPaywallSuccess: () => void;
}) {
  const isUser = message.role === "user";
  const hasVerses =
    !isUser && Array.isArray(message.verses) && message.verses.length > 0;
  const showPaywall =
    !isUser &&
    message.paywall === true &&
    Array.isArray(message.tiers) &&
    message.tiers.length > 0;
  // Pick font from this message's OWN content language. Krishna's
  // first-time greeting is always Hindi even when the user wrote
  // English, so userLang (used for verse-card labels) is the wrong
  // signal for the body font.
  const contentLang = detectLang(message.content);
  // Phase 8 cinematic-dark redesign — aligned avatar bubbles per the
  // Claude Design handoff: user right-aligned in a gold-tinted bubble,
  // Krishna left-aligned beside a peacock-feather avatar in a dark
  // glass bubble (the Bansuri in-bubble motif is replaced by the
  // design's avatar). Purely presentational — every data binding
  // (message.content, contentLang/userLang font + label routing,
  // VerseCardList, SafetyCardView, SevaPaywall + onPaywallSuccess) is
  // preserved unchanged. The "You" label text is kept verbatim; no
  // text is added (Krishna's identity reads from the avatar, not a
  // new label string).
  return (
    <div
      className={
        "fade-up flex " +
        (isUser ? "flex-col items-end" : "items-start gap-3")
      }
    >
      {!isUser && (
        <PeacockFeather
          className="mt-1 h-5 w-auto shrink-0"
          width={20}
          height={20}
        />
      )}
      <div
        className={
          isUser
            ? "flex max-w-[82%] flex-col items-end"
            : "min-w-0 max-w-[84%] flex-1"
        }
      >
        {isUser && (
          <span className="mb-1.5 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-[0.14em] text-gold-dim">
            You
          </span>
        )}
        <div
          className={
            "border px-5 py-3.5 text-lg leading-relaxed text-ivory shadow-[0_4px_16px_rgba(0,0,0,0.35)] " +
            (isUser
              ? "rounded-[18px_18px_4px_18px] border-gold/30 bg-linear-to-b from-gold/20 to-gold-dim/15"
              : "rounded-[18px_18px_18px_4px] border-gold-faint bg-ink2/70 backdrop-blur-sm")
          }
        >
          <p
            className={
              "whitespace-pre-wrap leading-relaxed " +
              (contentLang === "hi"
                ? "font-normal font-devanagari"
                : "font-medium font-serif")
            }
          >
            {message.content}
          </p>
        </div>
        {hasVerses && (
          <div className="mt-2.5 w-full">
            <VerseCardList verses={message.verses!} lang={userLang} />
          </div>
        )}
        {!isUser && message.safety_card && (
          <SafetyCardView card={message.safety_card} />
        )}
        {showPaywall && (
          <SevaPaywall tiers={message.tiers!} onSuccess={onPaywallSuccess} />
        )}
      </div>
    </div>
  );
}

// Phase 3.9 streaming-frame dispatcher. Called per NDJSON line during
// the streaming branch of sendMessage. Module-scope helper so React
// doesn't re-allocate it on every render and the immutability lint
// rule sees a clean pure-function shape — every state mutation flows
// through setMessages((prev) => next) updaters that derive next from
// prev, never from a captured `let` variable.
function applyFrameToMessages(
  setMessages: Dispatch<SetStateAction<Message[]>>,
  assistantId: string,
  frame: Record<string, unknown>,
): void {
  const type = frame.type;

  if (type === "text" && typeof frame.delta === "string") {
    const delta = frame.delta;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === assistantId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          content: next[idx].content + delta,
        };
        return next;
      }
      // First delta — push the assistant bubble. The "सोच रहा हूँ..."
      // spinner stops as soon as this lands (it gates on last
      // message.role === "user").
      return [
        ...prev,
        { id: assistantId, role: "assistant", content: delta },
      ];
    });
    return;
  }

  if (type === "meta") {
    setMessages((prev) => {
      const updates: Partial<Message> = {
        paywall: frame.paywall === true,
        verses: Array.isArray(frame.verses)
          ? (frame.verses as Message["verses"])
          : undefined,
        safety_card:
          frame.safety_card && typeof frame.safety_card === "object"
            ? (frame.safety_card as SafetyCard)
            : undefined,
      };
      const idx = prev.findIndex((m) => m.id === assistantId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...updates };
        return next;
      }
      // Edge case: meta arrived without any preceding text (model
      // produced no text content). Push a placeholder anyway so
      // verses/safety_card still render.
      return [
        ...prev,
        { id: assistantId, role: "assistant", content: "", ...updates },
      ];
    });
    return;
  }

  if (type === "error") {
    const errMsg =
      typeof frame.message === "string"
        ? frame.message
        : "connection dropped — please send your message again.";
    const errLine = `_${errMsg}_`;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === assistantId);
      if (idx >= 0) {
        const next = [...prev];
        const cur = next[idx].content;
        next[idx] = {
          ...next[idx],
          content: cur ? `${cur}\n\n${errLine}` : errLine,
        };
        return next;
      }
      return [
        ...prev,
        { id: assistantId, role: "assistant", content: errLine },
      ];
    });
    return;
  }

  // Unknown frame type — silently skip (forward compat: future frame
  // types added server-side won't crash old clients).
}

// Phase 7.0 voice-input audio cue — short Web Audio sine "ping" played
// when the user activates the mic. Runs on a fresh AudioContext each
// call so the browser doesn't keep one hanging around; closes it after
// ~300 ms to release the audio device. Wrapped in try/catch since the
// sound is a nice-to-have, not load-bearing — older browsers without
// AudioContext or users with autoplay restrictions just get the
// visual feedback.
function playStartTone() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx: AudioContext = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.value = 880; // A5 — soft, devotional-feeling chime
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.16);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.17);
    setTimeout(() => {
      ctx.close().catch(() => {
        /* ignore */
      });
    }, 300);
  } catch {
    /* silent — sound is best-effort */
  }
}

// Phase 7.0 voice-input — inline microphone icon. Feather/Lucide-style
// 24×24 outline at strokeWidth 2 with currentColor stroke + className
// API, matching the rest of the project's line-art icons (DiyaIcon,
// peacock-feather geometry). aria-hidden because the parent button
// already carries the bilingual aria-label.
function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

// Phase 7.0 mobile-layout — inline send icon. Feather/Lucide-style
// paper-plane outline, same vocabulary as MicIcon (currentColor stroke
// at strokeWidth 2, 24×24 viewBox, className API, aria-hidden). Shown
// on mobile only — the desktop button still renders the "Send" word
// directly via responsive Tailwind utilities.
function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

// Phase 12 (i18n) — mic-error chip prose now lives in the UI dictionary
// (t.chat.micErrors), keyed by the same five failure-mode names, so it
// follows the EN/हिन्दी toggle like the rest of the chat chrome.

// Phase 8.0 mic-error chip — inline alert-triangle icon. Feather/
// Lucide-style outline, same vocabulary as MicIcon + SendIcon
// (currentColor stroke at strokeWidth 2, 24×24 viewBox, className
// API, aria-hidden). Used inside the error chip with text-sacred.
function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// Phase 8 pre-launch — inline settings (cog) icon for the chat header.
// Feather/Lucide-style outline, same vocabulary as MicIcon + SendIcon
// (currentColor stroke at strokeWidth 2, 24×24 viewBox, className API,
// aria-hidden). Routes the user to /settings, where the conversation-
// review opt-out toggle and delete-my-data button live.
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SafetyCardView({ card }: { card: SafetyCard }) {
  return (
    <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 leading-relaxed text-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Support · सहारा
      </p>
      <p className="mb-2 text-sm font-medium text-zinc-900">{card.title}</p>
      <p className="mb-3 text-sm text-zinc-700">{card.body}</p>
      <div className="flex flex-wrap gap-2">
        {card.helplines.map((h) => (
          <a
            key={h.number}
            href={`tel:${h.number.replace(/[^0-9+]/g, "")}`}
            className="inline-flex items-center gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-all hover:bg-stone-100 hover:shadow-[0_2px_6px_rgba(0,0,0,0.1)]"
          >
            <span aria-hidden className="text-lg leading-none">📞</span>
            <span className="flex flex-col leading-tight">
              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                {h.label}
              </span>
              <span className="text-base font-semibold text-zinc-900">
                {h.number}
              </span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

