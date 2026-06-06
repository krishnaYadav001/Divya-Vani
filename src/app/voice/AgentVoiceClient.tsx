"use client";

// Phase 11.3 — /voice top-level client on the ElevenAgents React SDK
// (@elevenlabs/react). The SDK owns mic capture + audio playback; we own the
// Dawn Aarti view, identity/paywall, the helpline overlay, and the transcript.
//
// UX model (Gemini-assistant style, founder-chosen 2026-05-23):
//   • During the call → orb ONLY (no transcript). Immersive; nothing grows to
//     push the controls off-screen.
//   • After the call ends → show the full conversation transcript with
//     Start-again / Back-to-chat actions.
//
// Orb states map from the SDK: connecting / listening (recording you) /
// thinking (your turn ended, Krishna processing) / speaking. Soft, soothing
// chimes mark the turn edges: a gentle ascending swell when listening (re)starts
// — your turn — and a soft descending settle when he stops listening and begins
// replying. The orb's recording pulse + REC dot make "I'm listening" vs "I've
// stopped" legible.
//
// Engine wiring:
//   • ConversationProvider holds the (public) agent id.
//   • useConversation → startSession/endSession + status/isSpeaking + amplitude
//     analysers + event callbacks.
//   • useConversationClientTool("show_helpline_card") → helpline overlay.
//   • Identity: user_id from /api/voice/bootstrap → dynamicVariables (the agent
//     declares user_id; customLlmExtraBody is rejected by this agent).
//   • Transport: connectionType "websocket" (WebRTC data channels failed).
//
// The always-visible bilingual identity disclaimer (Locked Decision #1) lives in
// the Zone-2 strip and is never conditionally hidden.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ConversationProvider,
  useConversation,
  useConversationClientTool,
} from "@elevenlabs/react";
import { BRAND } from "@/lib/brand";
import { useLanguage } from "../providers/LanguageProvider";
import { loadTranscript, saveTranscript } from "@/lib/voiceTranscriptStorage";
import AgentOrb, { type AgentOrbState } from "./AgentOrb";
import HelplineOverlay from "./HelplineOverlay";
import SevaHubModal from "../components/SevaHubModal";
import PeacockFeather from "../components/motifs/PeacockFeather";

// Phase 11.6 env-var candidate (NEXT_PUBLIC_ELEVENLABS_AGENT_ID). Hardcoded for
// now — this is the "Krishna-Voice-Test" agent wired to /api/agent-llm.
const AGENT_ID = "agent_3001ks8hkawgf5cb5k7fy8gwxsme";

const C = BRAND.voiceCopy;

type Bilingual = { hi: string; en: string };
type HelplineState = { flag: "self_harm" | "harm_others"; userLang: "hi" | "en" } | null;
type TranscriptTurn = { role: "user" | "agent"; text: string };

// ── error mapping ────────────────────────────────────────────────────────────
function mapError(message: string): { code: string; copy: Bilingual } {
  const m = (message ?? "").toLowerCase();
  if (/(payment|paywall|402)/.test(m)) {
    return { code: "paywall", copy: { hi: C.paywall.hi, en: C.paywall.en } };
  }
  if (/(permission|notallowed|denied|not-allowed)/.test(m)) {
    return { code: "permission_denied", copy: C.errors.permission_denied };
  }
  if (/(notfound|no microphone|no audio|hardware|device)/.test(m)) {
    return { code: "no_hardware", copy: C.errors.no_hardware };
  }
  if (/(not supported|unsupported|notsupported)/.test(m)) {
    return { code: "unsupported_browser", copy: C.errors.unsupported_browser };
  }
  if (/(network|connection|websocket|disconnect|timeout)/.test(m)) {
    return { code: "network", copy: C.errors.network };
  }
  return { code: "generic", copy: C.errors.generic };
}

// Average a byte-frequency buffer to a ~0..1 amplitude for the orb glow.
function amplitudeOf(data: Uint8Array | undefined): number {
  if (!data || data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  return Math.min(1, sum / data.length / 128);
}

export default function AgentVoiceClient() {
  // The provider must wrap any component that uses the conversation hooks.
  return (
    <ConversationProvider agentId={AGENT_ID}>
      <VoiceInner />
    </ConversationProvider>
  );
}

function VoiceInner() {
  const router = useRouter();
  // UI-language toggle (Phase 12) — the night-scene chrome (titles, state
  // strip, disclaimer, paywall, action buttons) now follows the EN/हिन्दी
  // choice instead of always stacking both. Krishna's spoken reply (the SDK
  // TTS) and the transcript CONTENT are untouched — only screen chrome.
  const { lang } = useLanguage();
  const orbRef = useRef<HTMLDivElement>(null);
  const beginRef = useRef<HTMLButtonElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // identity / access (from /api/voice/bootstrap)
  const [bootstrapped, setBootstrapped] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [counter, setCounter] = useState({ messageCount: 0, sevaBalance: 0 });
  const userIdRef = useRef<string | null>(null);

  // view state
  const [started, setStarted] = useState(false); // user pressed Begin this session
  const [ended, setEnded] = useState(false); // conversation finished → show transcript
  const [userTurnEnded, setUserTurnEnded] = useState(false); // user spoke; Krishna processing
  const [error, setError] = useState<{ code: string; copy: Bilingual } | null>(null);
  const [helpline, setHelpline] = useState<HelplineState>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [isSevaOpen, setIsSevaOpen] = useState(false);
  const [hasConnected, setHasConnected] = useState(false);

  // Soft chimes (founder 2026-05-25) — calm, soothing earcons in the spirit of a
  // modern voice assistant's "ready" sound (an ORIGINAL tone, not Google's
  // proprietary Gemini asset). Each note layers a warm sine fundamental + a quiet
  // octave + a faintly DETUNED twin that beats gently for an ethereal shimmer,
  // in a low/warm register through a soft lowpass. The SLOW bloom attack (a swell,
  // not a percussive strike) + long fade is what makes it soothing rather than a
  // notification beep.
  //   • listening  → a gentle ascending perfect-fifth swell, A4 → E5 (your turn).
  //   • responding → a soft descending settle, E5 → A4, shorter so it doesn't sit
  //                  on top of Krishna's first words.
  // The AudioContext is created/resumed inside the Begin click (a user gesture)
  // to satisfy autoplay policy; both chimes reuse it.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playChime = useCallback(
    (notes: Array<{ freq: number; at: number }>, dur: number, attack: number) => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        // Soft, warm lowpass keeps the swell rounded and mellow, never tinny.
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 2400;
        lp.connect(ctx.destination);
        for (const n of notes) {
          const t = now + n.at;
          // Three voices per note: sine fundamental + a quiet octave for glassy
          // warmth + a faintly detuned twin (+7 cents) whose slow beating reads
          // as a soothing shimmer. Peaks kept low so overlap never clips.
          for (const v of [
            { mult: 1, peak: 0.22, detune: 0 },
            { mult: 2, peak: 0.05, detune: 0 },
            { mult: 1, peak: 0.1, detune: 7 },
          ]) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = n.freq * v.mult;
            osc.detune.value = v.detune;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(v.peak, t + attack); // slow bloom
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dur); // long gentle fade
            osc.connect(gain).connect(lp);
            osc.start(t);
            osc.stop(t + dur + 0.05);
          }
        }
      } catch {
        /* tone is best-effort — never let it break the session */
      }
    },
    [],
  );
  // Gentle ascending A4 → E5 (a calm perfect fifth), slow bloom: "your turn".
  const playListeningTone = useCallback(
    () =>
      playChime(
        [
          { freq: 440, at: 0 },
          { freq: 659.25, at: 0.16 },
        ],
        1.1,
        0.05,
      ),
    [playChime],
  );
  // Soft descending E5 → A4 settle, shorter + softer: "replying now".
  const playRespondingTone = useCallback(
    () =>
      playChime(
        [
          { freq: 659.25, at: 0 },
          { freq: 440, at: 0.14 },
        ],
        0.9,
        0.045,
      ),
    [playChime],
  );

  // Parse + apply the helpline tool parameters defensively (edge B6.12).
  const applyHelplineParams = useCallback((rawParams: unknown) => {
    let params: Record<string, unknown> = {};
    try {
      params =
        typeof rawParams === "string"
          ? JSON.parse(rawParams)
          : rawParams && typeof rawParams === "object"
            ? (rawParams as Record<string, unknown>)
            : {};
    } catch {
      params = {}; // malformed JSON → generic self_harm overlay
    }
    const flag = params.flag === "harm_others" ? "harm_others" : "self_harm";
    const userLang = params.user_lang === "en" ? "en" : "hi";
    setHelpline({ flag, userLang });
  }, []);

  // Phase 9 voice metering — wall-clock start of the live session, set on
  // connect and read once on disconnect to bill elapsed seconds (pool → wallet).
  const voiceSessionStartRef = useRef<number | null>(null);

  // ── SDK conversation ──────────────────────────────────────────────────────
  const conversation = useConversation({
    onConnect: () => {
      voiceSessionStartRef.current = Date.now();
      setHasConnected(true);
      setError(null);
      setUserTurnEnded(false);
    },
    onDisconnect: (details) => {
      // Meter the finished session (fire-and-forget; keepalive so it survives a
      // tab close). Debits the subscription voice pool then the wallet server-
      // side. A metering miss is acceptable; entry was already gated.
      const startedAt = voiceSessionStartRef.current;
      voiceSessionStartRef.current = null;
      if (startedAt) {
        const seconds = Math.round((Date.now() - startedAt) / 1000);
        if (seconds > 0) {
          void fetch("/api/voice/usage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seconds }),
            keepalive: true,
          }).catch(() => {});
        }
      }
      console.warn("[voice] disconnected:", details);
      if (details?.reason === "error") {
        setError(mapError(details.message ?? ""));
      } else {
        // Normal end → show the transcript afterwards (Gemini-style). The render
        // only shows the ended view if there are turns to show.
        setEnded(true);
      }
      setStarted(false);
      setHasConnected(false);
      setUserTurnEnded(false);
    },
    onError: (message, context) => {
      console.error("[voice] error:", message, context);
      const mapped = mapError(message);
      setError(mapped);
      if (mapped.code === "paywall") setIsSevaOpen(true); // edge B6.2
    },
    onMessage: ({ message, role }) => {
      if (!message) return;
      // Rolling transcript: replace the last entry when the same role keeps
      // streaming (tentative → final), else append a new turn.
      setTranscript((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === role) {
          return [...prev.slice(0, -1), { role, text: message }];
        }
        return [...prev, { role, text: message }];
      });
      // A user message = the user's turn ended → Krishna is now processing
      // (thinking). An agent message clears it. This drives the orb's
      // listening → thinking → speaking progression so the user sees when
      // listening has STOPPED.
      if (role === "user") setUserTurnEnded(true);
      else setUserTurnEnded(false);
    },
    // edge B6.13: safety net for an unregistered/mismatched client tool.
    onUnhandledClientToolCall: (call) => {
      if (call?.tool_name === "show_helpline_card") {
        applyHelplineParams(call?.parameters);
        return;
      }
      console.warn("[voice] unhandled client tool:", call?.tool_name);
    },
  });

  const { status, isSpeaking, startSession, endSession } = conversation;

  // Fresh ref to the conversation so the amplitude loop calls the latest
  // analyser getters without re-subscribing every render.
  const conversationRef = useRef(conversation);
  useEffect(() => {
    conversationRef.current = conversation;
  });

  // Register the helpline client tool (name MUST match the agent config).
  useConversationClientTool("show_helpline_card", (params: Record<string, unknown>) => {
    applyHelplineParams(params);
  });

  // ── bootstrap identity + access on mount ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetch("/api/voice/bootstrap")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const uid = typeof d.userId === "string" ? d.userId : null;
        userIdRef.current = uid;
        setHasAccess(d.hasAccess === true);
        setCounter({
          messageCount: typeof d.messageCount === "number" ? d.messageCount : 0,
          sevaBalance: typeof d.sevaBalance === "number" ? d.sevaBalance : 0,
        });
        // Restore the persisted voice transcript (its own localStorage key,
        // separate from chat) so a returning user sees their past voice
        // conversation — it is never wiped (founder 2026-05-26).
        if (uid) {
          const saved = loadTranscript(uid);
          if (saved && saved.length > 0) setTranscript(saved);
        }
      })
      .catch(() => {
        if (!cancelled) setHasAccess(false); // fail closed → paywall
      })
      .finally(() => {
        if (!cancelled) setBootstrapped(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── persist the voice transcript on every change (separate localStorage key
  // from chat, founder 2026-05-26) so it survives reload/revisit and is never
  // lost. saveTranscript silent-fails + skips empty, so this is safe to run on
  // each turn. ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const uid = userIdRef.current;
    if (uid && transcript.length > 0) saveTranscript(uid, transcript);
  }, [transcript]);

  // ── cleanup on unmount (edge B6.4: navigating away ends the session) ──────
  useEffect(() => {
    return () => {
      void endSession();
      void audioCtxRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── amplitude → --orb-amp (imperative, no re-render per frame) ────────────
  useEffect(() => {
    if (status !== "connected") return;
    const el = orbRef.current;
    let raf = 0;
    const tick = () => {
      try {
        const conv = conversationRef.current;
        const data = isSpeaking
          ? conv.getOutputByteFrequencyData()
          : conv.getInputByteFrequencyData();
        el?.style.setProperty("--orb-amp", amplitudeOf(data).toFixed(3));
      } catch {
        /* analyser not ready — ignore this frame */
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el?.style.setProperty("--orb-amp", "0");
    };
  }, [status, isSpeaking]);

  // Focus the primary action once bootstrap resolves (a11y entry point).
  useEffect(() => {
    if (bootstrapped && status === "disconnected" && !started && !ended) {
      beginRef.current?.focus();
    }
  }, [bootstrapped, status, started, ended]);

  // Keep the (post-call) transcript scrolled to the latest turn.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, ended]);

  // ── derived view state ────────────────────────────────────────────────────
  // SDK ConversationStatus: "disconnected" | "connecting" | "connected" | "error".
  const orbState: AgentOrbState = useMemo(() => {
    if (status === "error" || (error && status === "disconnected")) return "error";
    if (status === "connected") {
      if (isSpeaking) return "speaking";
      if (userTurnEnded) return "thinking"; // user turn ended, Krishna processing
      return "listening";
    }
    if (status === "connecting") return "connecting";
    return "disconnected";
  }, [status, isSpeaking, error, userTurnEnded]);

  const isReconnecting = status === "connecting" && hasConnected;
  const isActive = started && (status === "connecting" || status === "connected");
  // Show the transcript whenever we're NOT in a live call AND there is history —
  // covers both "a call just ended" and "returning user with persisted history"
  // (founder 2026-05-26: the transcript is never wiped). During a live call the
  // orb takes over (immersive). Name kept as `showEndedView` to avoid churn
  // across its references; it now means "the transcript view is showing".
  const showEndedView = !isActive && transcript.length > 0;

  // Play the chimes on orb-state edges (Gemini-style open/close earcons):
  //  • RISING tone on the edge INTO listening — first connect + after each
  //    Krishna reply ("your turn").
  //  • FALLING tone on the edge OUT of listening into thinking/speaking — the
  //    moment Krishna stops listening and begins replying. Gated to those two
  //    targets so ending the call (→ disconnected/error) never chimes.
  const prevOrbRef = useRef<AgentOrbState>("disconnected");
  useEffect(() => {
    const prev = prevOrbRef.current;
    if (orbState === "listening" && prev !== "listening") {
      playListeningTone();
    } else if (
      prev === "listening" &&
      (orbState === "thinking" || orbState === "speaking")
    ) {
      playRespondingTone();
    }
    prevOrbRef.current = orbState;
  }, [orbState, playListeningTone, playRespondingTone]);

  const strip: Bilingual = useMemo(() => {
    if (error) return error.copy;
    if (showEndedView) return C.states.ended;
    if (status === "error") return C.errors.generic;
    if (status === "connected") {
      if (isSpeaking) return C.states.speaking;
      if (userTurnEnded) return C.states.thinking;
      return C.states.listening;
    }
    if (status === "connecting") {
      return isReconnecting
        ? { hi: "फिर से जुड़ रहा हूँ…", en: "Reconnecting…" }
        : C.states.starting;
    }
    return C.states.idle;
  }, [status, isSpeaking, error, isReconnecting, userTurnEnded, showEndedView]);

  const showPaywallOverlay = bootstrapped && !hasAccess && !isActive && !showEndedView;
  const beginLabel = bootstrapped && !hasAccess ? C.paywall.openSeva : C.begin;
  const showBegin = !isActive && !showEndedView;

  // ── gesture handlers ──────────────────────────────────────────────────────
  const ensureAudioCtx = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (Ctor) audioCtxRef.current = new Ctor();
      }
      void audioCtxRef.current?.resume();
    } catch {
      /* tone is optional */
    }
  }, []);

  const startConversation = useCallback(() => {
    setError(null);
    setHelpline(null);
    setUserTurnEnded(false);
    setStarted(true);
    ensureAudioCtx();
    const userId = userIdRef.current ?? undefined;
    // Identity: the cookie UUID must reach /api/agent-llm so Krishna loads the
    // right per-user memory. A live diagnostic (2026-05-26) proved
    // dynamicVariables are NOT forwarded to the custom-LLM body — the request
    // arrived with no user_id at all. The channel ElevenLabs DOES merge into the
    // request body is customLlmExtraBody (it lands at body.user_id), gated by
    // platform_settings.overrides.custom_llm_extra_body=true on the agent (set in
    // setup-elevenlabs-agent.ts). Also send the SDK's userId (ElevenLabs end-user
    // mapping) and keep dynamicVariables as a harmless secondary. WebSocket
    // transport (WebRTC data channels failed).
    startSession({
      connectionType: "websocket",
      ...(userId ? { userId } : {}),
      ...(userId ? { customLlmExtraBody: { user_id: userId } } : {}),
      ...(userId ? { dynamicVariables: { user_id: userId } } : {}),
    });
  }, [ensureAudioCtx, startSession]);

  const handleBegin = useCallback(() => {
    if (!bootstrapped) return;
    if (!hasAccess) {
      setIsSevaOpen(true); // gate before any SDK / mic / credit cost
      return;
    }
    startConversation();
  }, [bootstrapped, hasAccess, startConversation]);

  const handleEnd = useCallback(() => {
    void endSession(); // → onDisconnect sets ended (shows transcript)
    setStarted(false);
  }, [endSession]);

  // "Continue" — resume talking WITHOUT wiping the transcript (founder
  // 2026-05-26, replaces "Start again"). The existing transcript stays on
  // screen + in storage; the new call's turns append to it, and shared
  // users_memory keeps Krishna's recollection continuous.
  const handleContinue = useCallback(() => {
    setEnded(false);
    if (!hasAccess) {
      setIsSevaOpen(true);
      return;
    }
    startConversation();
  }, [hasAccess, startConversation]);

  const handleBackToChat = useCallback(() => {
    void endSession();
    router.push("/chat");
  }, [endSession, router]);

  // After the SevaHubModal closes, re-check voice access via bootstrap so a
  // freshly-completed wallet top-up or subscription grants access immediately.
  const handleHubClose = useCallback(() => {
    setIsSevaOpen(false);
    fetch("/api/voice/bootstrap")
      .then((r) => r.json())
      .then((d) => {
        if (d.hasAccess === true) {
          setHasAccess(true);
          setError((e) => (e?.code === "paywall" ? null : e));
        }
      })
      .catch(() => {});
  }, []);

  // Bilingual transcript row (night ivory ramp).
  const renderTurn = (t: TranscriptTurn, i: number) => (
    <p
      key={`${i}-${t.role}`}
      className={
        "text-sm leading-snug " +
        (t.role === "user"
          ? "ivory-soft text-right"
          : "ivory font-devanagari text-left")
      }
    >
      <span className="ivory-faint mr-1 text-[10px] uppercase tracking-wide">
        {t.role === "user" ? C.youLabel.hi : C.krishnaLabel.hi}
      </span>
      {t.text}
    </p>
  );

  // Dim the Krishna-flute backdrop when the orb isn't the focus (post-call
  // transcript, paywall, or an error) so overlaid text stays legible.
  const backdropDim = showEndedView || showPaywallOverlay || !!error;

  return (
    <>
      {/* ── Krishna-flute painting backdrop (z-1, above the starfield) ── */}
      <KrishnaBackdrop dim={backdropDim} />

      {/* ── Zone 1: top bar — borderless + transparent (founder 2026-05-24).
          Just the centred logo (peacock feather + wordmark) floating over
          the night scene; the top scrim of the painting backdrop is the
          legibility backing. Back-to-chat (left) + exit/seva (right) stay
          as bare floating icons — no bar. ───────────────────────────── */}
      <header className="relative z-30 shrink-0 px-3 pt-[calc(0.75rem_+_env(safe-area-inset-top,0px))] pb-3 sm:px-4 sm:pt-[calc(1rem_+_env(safe-area-inset-top,0px))] sm:pb-4">
        <div className="mx-auto flex max-w-[600px] items-center gap-2">
          {/* back to chat (left) */}
          <Link
            href="/chat"
            onClick={() => void endSession()}
            aria-label={C.backToChat[lang]}
            className="ivory-soft flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-gold-leaf/10 hover:text-[oklch(95%_0.025_70)] focus:outline-none focus:ring-2 focus:ring-gold-leaf/40 [filter:drop-shadow(0_1px_4px_oklch(8%_0.05_260/0.7))]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>

          {/* centred brand group — peacock feather + wordmark only */}
          <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
            <PeacockFeather
              className="h-9 w-auto shrink-0 [filter:drop-shadow(0_2px_6px_oklch(8%_0.05_260/0.6))] sm:h-11"
              width={44}
              height={44}
              priority
            />
            <h1
              className="ivory min-w-0 truncate font-[family-name:var(--font-display)] text-2xl font-normal leading-none tracking-[0.02em] sm:text-3xl"
              style={{ textShadow: "0 2px 8px oklch(8% 0.05 260 / 0.7)" }}
            >
              {BRAND.name.en}
            </h1>
          </div>

          {/* exit — X only during an active call */}
          <div className="flex h-11 w-11 shrink-0 items-center justify-center">
            {isActive && (
              <button
                type="button"
                onClick={handleEnd}
                aria-label={C.exit[lang]}
                className="ivory-soft flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-vermillion/15 hover:text-[oklch(72%_0.16_28)] focus:outline-none focus:ring-2 focus:ring-vermillion/40 [filter:drop-shadow(0_1px_4px_oklch(8%_0.05_260/0.7))]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Zone 2: identity disclaimer (Locked Decision #1) — borderless +
          transparent like the header (founder 2026-05-24); just the text
          floating over the scene, with a shadow for legibility. ──────── */}
      <p
        className={`ivory-faint relative z-20 shrink-0 px-4 py-1 text-center text-[11px] leading-tight ${
          lang === "hi" ? "font-devanagari" : "font-serif italic"
        }`}
        style={{ textShadow: "0 1px 4px oklch(8% 0.05 260 / 0.7)" }}
      >
        {C.disclaimer[lang]}
      </p>

      {/* ── Zone 3: hero — orb DURING the call, transcript AFTER it ──── */}
      {/* overflow-hidden + min-h-0 guarantee the Zone 4/5 controls below never
          get covered or pushed off, regardless of viewport height. */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center overflow-hidden px-5">
        {showEndedView ? (
          /* Post-call transcript (Gemini-style) — the full conversation. */
          <div className="flex min-h-0 w-full max-w-[480px] flex-1 flex-col py-4">
            <p className="shrink-0 pb-3 text-center">
              <span
                className={`ivory block text-xl ${
                  lang === "hi"
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-display)]"
                }`}
              >
                {ended ? C.states.ended[lang] : C.title[lang]}
              </span>
            </p>
            <div
              ref={transcriptRef}
              className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-2xl border border-gold-leaf/25 px-4 py-3 backdrop-blur"
              style={{ background: "oklch(15% 0.04 260 / 0.55)" }}
            >
              {transcript.map(renderTurn)}
            </div>
          </div>
        ) : (
          /* During the call (or idle): orb + title only — no transcript. */
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
            <p
              className={
                "mb-6 text-center transition-opacity duration-500 " +
                (isActive ? "opacity-60" : "opacity-100")
              }
              style={{ textShadow: "0 2px 8px oklch(10% 0.05 260 / 0.6)" }}
            >
              <span
                className={`ivory block text-2xl sm:text-3xl ${
                  lang === "hi"
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-display)]"
                }`}
              >
                {C.title[lang]}
              </span>
            </p>

            <AgentOrb ref={orbRef} state={orbState} amplitude={0} />
          </div>
        )}

        {/* Paywall overlay — voice is paid-seva only. */}
        {showPaywallOverlay && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center px-6 backdrop-blur-sm"
            style={{ background: "oklch(15% 0.04 260 / 0.55)" }}
          >
            <div
              className="fade-up max-w-[360px] rounded-3xl border border-gold-leaf/40 px-6 py-6 text-center shadow-[0_24px_48px_-18px_oklch(8%_0.06_280_/_0.7)] backdrop-blur"
              style={{ background: "oklch(15% 0.04 260 / 0.85)" }}
            >
              <p
                className={`ivory text-lg ${
                  lang === "hi"
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-display)]"
                }`}
              >
                {C.paywall[lang]}
              </p>
              <p
                className={`ivory-soft mt-3 text-sm leading-relaxed ${
                  lang === "hi" ? "font-devanagari" : "font-serif italic"
                }`}
              >
                {C.paywall.body[lang]}
              </p>
              <button
                type="button"
                onClick={() => setIsSevaOpen(true)}
                className={`mt-5 inline-flex min-h-12 items-center justify-center rounded-full border border-gold-leaf px-7 py-3 text-[15px] shadow-[0_1px_0_rgba(255,255,255,.4)_inset] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-leaf motion-reduce:hover:translate-y-0 ${
                  lang === "hi"
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-display)]"
                }`}
                style={{
                  background:
                    "linear-gradient(180deg, oklch(72% 0.13 80), oklch(55% 0.14 70))",
                  color: "oklch(18% 0.04 60)",
                }}
              >
                {C.paywall.openSeva[lang]}
              </button>
            </div>
          </div>
        )}

        {/* Helpline overlay (Locked Decision #7) — informational, non-blocking. */}
        {helpline && (
          <HelplineOverlay
            flag={helpline.flag}
            userLang={helpline.userLang}
            onDismiss={() => setHelpline(null)}
          />
        )}
      </div>

      {/* ── Zone 4: state-indicator strip ───────────────────────────── */}
      <p
        role="status"
        aria-live="polite"
        className="relative z-10 flex shrink-0 items-center justify-center gap-2 px-4 py-2 text-center text-sm"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold-leaf shadow-[0_0_10px_oklch(82%_0.12_80)]" />
        <span
          className={`ivory ${
            lang === "hi" ? "font-devanagari" : "font-serif italic"
          }`}
        >
          {strip[lang]}
        </span>
      </p>

      {/* ── Zone 5: bottom action row ───────────────────────────────── */}
      <div className="relative z-20 flex shrink-0 flex-wrap items-center justify-center gap-3 px-5 pb-[calc(1.5rem_+_env(safe-area-inset-bottom,0px))] pt-1">
        {showBegin && (
          <button
            ref={beginRef}
            type="button"
            onClick={handleBegin}
            disabled={!bootstrapped}
            aria-label={
              error && error.code !== "paywall"
                ? C.retry[lang]
                : beginLabel[lang]
            }
            className={`inline-flex min-h-14 items-center justify-center rounded-full border border-gold-leaf px-12 py-4 text-lg shadow-[0_1px_0_rgba(255,255,255,.4)_inset,0_14px_32px_-10px_oklch(60%_0.16_70_/_0.55),0_0_28px_oklch(76%_0.14_80_/_0.35)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-leaf disabled:opacity-50 motion-reduce:hover:translate-y-0 ${
              lang === "hi"
                ? "font-[family-name:var(--font-devanagari)]"
                : "font-[family-name:var(--font-display)]"
            }`}
            style={{
              background:
                "linear-gradient(180deg, oklch(72% 0.13 80), oklch(55% 0.14 70))",
              color: "oklch(18% 0.04 60)",
            }}
          >
            {error && error.code !== "paywall" ? C.retry[lang] : beginLabel[lang]}
          </button>
        )}

        {isActive && (
          <button
            type="button"
            onClick={handleEnd}
            aria-label={C.exit[lang]}
            className={`ivory-soft inline-flex min-h-12 items-center justify-center rounded-full border border-gold-leaf/30 px-7 py-3 text-base backdrop-blur transition-colors hover:border-gold-leaf/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-leaf/40 ${
              lang === "hi"
                ? "font-[family-name:var(--font-devanagari)]"
                : "font-[family-name:var(--font-display)]"
            }`}
            style={{ background: "oklch(25% 0.05 260 / 0.55)" }}
          >
            {C.exit[lang]}
          </button>
        )}

        {showEndedView && (
          <>
            <button
              type="button"
              onClick={handleContinue}
              className={`inline-flex min-h-12 items-center justify-center rounded-full border border-gold-leaf px-8 py-3 text-base shadow-[0_1px_0_rgba(255,255,255,.4)_inset,0_0_22px_oklch(76%_0.14_80_/_0.3)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-leaf motion-reduce:hover:translate-y-0 ${
                lang === "hi"
                  ? "font-[family-name:var(--font-devanagari)]"
                  : "font-[family-name:var(--font-display)]"
              }`}
              style={{
                background:
                  "linear-gradient(180deg, oklch(72% 0.13 80), oklch(55% 0.14 70))",
                color: "oklch(18% 0.04 60)",
              }}
            >
              {lang === "hi" ? "जारी रखो" : "Continue"}
            </button>
            <button
              type="button"
              onClick={handleBackToChat}
              className={`ivory-soft inline-flex min-h-12 items-center justify-center rounded-full border border-gold-leaf/30 px-7 py-3 text-base backdrop-blur transition-colors hover:border-gold-leaf/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-leaf/40 ${
                lang === "hi"
                  ? "font-[family-name:var(--font-devanagari)]"
                  : "font-[family-name:var(--font-display)]"
              }`}
              style={{ background: "oklch(25% 0.05 260 / 0.55)" }}
            >
              {C.backToChat[lang]}
            </button>
          </>
        )}
      </div>

      {/* Voice-specific monetization hub — wallet (voice minutes) + plans
          (Krishna Voice / Premium subscriptions). NOT the chat seva panel. */}
      <SevaHubModal
        open={isSevaOpen}
        onClose={handleHubClose}
        initialTab="wallet"
      />
    </>
  );
}

// ── Krishna-flute painting backdrop ──────────────────────────────────────
// The night scene: the founder's Krishna-with-flute painting sits behind the
// orb (the orb is where the music ribbon resolves). Responsive crops — a
// landscape image on desktop, the portrait crop on mobile — both object-cover
// so nothing important is lost. Dimmed + blurred when the orb isn't the focus.
// If an image 404s the container is still dark (bg-night under it), so the page
// never goes blank (edge: fresco-load fallback).
function KrishnaBackdrop({ dim }: { dim: boolean }) {
  // Shimmer animates `filter`, so it would cancel the dim blur — only run
  // it when the painting is the focus (not dimmed).
  const imgBase = `absolute inset-0 h-full w-full object-cover transition-[opacity,filter] duration-500 ${
    dim ? "" : "voice-painting"
  }`;
  const dimCls = dim
    ? "opacity-30 blur-[2px] saturate-[.8]"
    : "opacity-90";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      {/* desktop / wide */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/krishna-flute-night.jpg"
        alt=""
        className={`${imgBase} hidden object-[20%_center] sm:block ${dimCls}`}
      />
      {/* mobile portrait */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/krishna-flute-mobile.jpg"
        alt=""
        className={`${imgBase} object-top sm:hidden ${dim ? "opacity-30 blur-[2px] saturate-[.8]" : "opacity-95"}`}
      />
      {/* top scrim — a gentle veil; the header is now borderless/transparent,
          so this is the legibility backing for the floating logo + icons */}
      <div
        className="absolute inset-x-0 top-0 h-32"
        style={{
          background:
            "linear-gradient(180deg, oklch(15% 0.04 260 / 0.65) 0%, oklch(15% 0.04 260 / 0.28) 55%, transparent 100%)",
        }}
      />
      {/* bottom scrim — anchors the state strip + buttons on a dark base but
          turns transparent sooner so more of the painting stays visible */}
      <div
        className="absolute inset-x-0 bottom-0 h-52"
        style={{
          background:
            "linear-gradient(0deg, oklch(15% 0.04 260 / 0.92) 0%, oklch(15% 0.04 260 / 0.45) 35%, transparent 100%)",
        }}
      />
      {/* soft cyan glow where the music ribbon resolves (behind the orb) */}
      <div
        className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, oklch(75% 0.15 220 / 0.22) 0%, transparent 65%)",
          mixBlendMode: "screen",
        }}
      />
    </div>
  );
}
