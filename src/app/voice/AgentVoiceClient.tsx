"use client";

// Phase 11.3 — /voice top-level client, rebuilt on the ElevenAgents React SDK
// (@elevenlabs/react). Replaces the Phase-10.5 VoiceClient + voiceSession.ts
// loop (Sarvam STT → Sonnet → ElevenLabs TTS) with the SDK's managed real-time
// conversation. The SDK owns mic capture + audio playback; we own the Dawn
// Aarti view, identity/paywall, transcript, and the helpline overlay.
//
// Engine wiring:
//   • ConversationProvider holds the (public) agent id.
//   • useConversation gives startSession/endSession + status/isSpeaking +
//     amplitude analysers, and registers our event callbacks.
//   • useConversationClientTool("show_helpline_card", …) renders the helpline
//     overlay when the backend emits that tool_call (Locked Decision #7).
//   • Identity: user_id from /api/voice/bootstrap → ElevenAgents via BOTH
//     dynamicVariables.user_id (the agent declares user_id, so it's required at
//     init AND forwards to the LLM) and customLlmExtraBody.user_id (→ body.user_id).
//     resolveUserId() on the backend reads both. NB: the agent MUST have user_id
//     declared (run scripts/setup-elevenlabs-agent.ts) or the call aborts.
//   • Paywall: bootstrap's hasAccess gates Begin; the backend 402 is a backstop.
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
import Link from "next/link";
import {
  ConversationProvider,
  useConversation,
  useConversationClientTool,
} from "@elevenlabs/react";
import { BRAND } from "@/lib/brand";
import { getTiersInOrder } from "@/lib/seva";
import AgentOrb, { type AgentOrbState } from "./AgentOrb";
import HelplineOverlay from "./HelplineOverlay";
import DiyaSevaPanel from "../components/DiyaSevaPanel";

// Phase 11.6 env-var candidate (NEXT_PUBLIC_ELEVENLABS_AGENT_ID). Hardcoded for
// now — this is the "Krishna-Voice-Test" agent wired to /api/agent-llm.
const AGENT_ID = "agent_3001ks8hkawgf5cb5k7fy8gwxsme";

const C = BRAND.voiceCopy;
const TIERS = getTiersInOrder();

type Bilingual = { hi: string; en: string };
type HelplineState = { flag: "self_harm" | "harm_others"; userLang: "hi" | "en" } | null;
type TranscriptTurn = { role: "user" | "agent"; text: string };

// ── error mapping ────────────────────────────────────────────────────────────
// The SDK surfaces errors as free-text strings; match defensively against the
// failure modes we have copy for, else fall back to the generic line.
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
  const [error, setError] = useState<{ code: string; copy: Bilingual } | null>(null);
  const [helpline, setHelpline] = useState<HelplineState>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [isSevaOpen, setIsSevaOpen] = useState(false);
  // Whether we've connected at least once this session — distinguishes a first
  // "connecting" from a "reconnecting". State (not a ref) since it drives render.
  const [hasConnected, setHasConnected] = useState(false);

  // Parse + apply the helpline tool parameters defensively (edge B6.12).
  // Declared before useConversation so the callbacks below can reference it.
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

  // ── SDK conversation ──────────────────────────────────────────────────────
  const conversation = useConversation({
    onConnect: () => {
      setHasConnected(true);
      setError(null);
    },
    onDisconnect: (details) => {
      // Log the full reason / close code so connection drops are diagnosable.
      console.warn("[voice] disconnected:", details);
      // reason "error" → surface it; "user"/"agent" → clean end (orb idles).
      if (details?.reason === "error") {
        setError(mapError(details.message ?? ""));
      }
      setStarted(false);
      setHasConnected(false);
    },
    onError: (message, context) => {
      console.error("[voice] error:", message, context);
      const mapped = mapError(message);
      setError(mapped);
      // edge B6.2: a payment failure routes to the seva paywall.
      if (mapped.code === "paywall") setIsSevaOpen(true);
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
    },
    // edge B6.13: a tool we don't recognise — log + ignore. The helpline tool is
    // handled by useConversationClientTool below; this is the safety net for a
    // mismatched name or an un-registered handler.
    onUnhandledClientToolCall: (call) => {
      if (call?.tool_name === "show_helpline_card") {
        applyHelplineParams(call?.parameters);
        return;
      }
      console.warn("[voice] unhandled client tool:", call?.tool_name);
    },
  });

  const { status, isSpeaking, startSession, endSession } = conversation;

  // Keep a fresh ref to the conversation so the amplitude RAF loop can call the
  // latest analyser getters without re-subscribing every render. Updated in an
  // effect (not during render) so the SDK object identity churn doesn't restart
  // the loop and we don't touch a ref mid-render.
  const conversationRef = useRef(conversation);
  useEffect(() => {
    conversationRef.current = conversation;
  });

  // Register the helpline client tool (name MUST match the agent config). The
  // SDK keeps this handler fresh via a ref, so referencing applyHelplineParams
  // is safe. Returning void = fire-and-forget (does not block the conversation).
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
        userIdRef.current = typeof d.userId === "string" ? d.userId : null;
        setHasAccess(d.hasAccess === true);
        setCounter({
          messageCount: typeof d.messageCount === "number" ? d.messageCount : 0,
          sevaBalance: typeof d.sevaBalance === "number" ? d.sevaBalance : 0,
        });
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

  // ── cleanup on unmount (edge B6.4: navigating away ends the session) ──────
  useEffect(() => {
    return () => {
      void endSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── amplitude → --orb-amp (imperative, no re-render per frame) ────────────
  useEffect(() => {
    if (status !== "connected") return;
    const el = orbRef.current; // capture the node for the cleanup reset
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
    if (bootstrapped && status === "disconnected" && !started) {
      beginRef.current?.focus();
    }
  }, [bootstrapped, status, started]);

  // Keep the transcript scrolled to the latest turn as the conversation grows.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  // ── gesture handlers ──────────────────────────────────────────────────────
  const handleBegin = useCallback(() => {
    if (!bootstrapped) return;
    if (!hasAccess) {
      setIsSevaOpen(true); // edge B6.2: gate before any SDK / mic / credit cost
      return;
    }
    setError(null);
    setStarted(true);
    const userId = userIdRef.current ?? undefined;
    // connectionType "websocket": the SDK defaults to WebRTC (LiveKit), whose
    // data channels were failing on the deployed site ("Unknown DataChannel
    // error … User-Initiated Abort") — the connection died at the transport
    // layer before a conversation ever registered (nothing showed in the
    // ElevenLabs dashboard). WebSocket avoids WebRTC data channels entirely and
    // is the robust public-agent transport (audio + tool calls ride the WS).
    //
    // Identity → ElevenAgents via dynamicVariables.user_id ONLY. The agent
    // DECLARES user_id, so ElevenLabs requires it at start, accepts it, and
    // makes it available to the turn. We do NOT send customLlmExtraBody:
    // ElevenLabs rejects it with close code 1008 ("Custom LLM extra body
    // override is not allowed for this AI agent") unless the agent explicitly
    // enables that override in its security settings — and dynamicVariables
    // already carries user_id. startSession requests the mic; a denial surfaces
    // via onError.
    startSession({
      connectionType: "websocket",
      dynamicVariables: userId ? { user_id: userId } : undefined,
    });
  }, [bootstrapped, hasAccess, startSession]);

  const handleEnd = useCallback(() => {
    void endSession();
    setStarted(false);
  }, [endSession]);

  const onPurchaseSuccess = useCallback((newBalance: number) => {
    setCounter((p) => ({ ...p, sevaBalance: newBalance }));
    if (newBalance > 0) {
      setHasAccess(true);
      setError((e) => (e?.code === "paywall" ? null : e));
    }
  }, []);

  // ── derived view state ────────────────────────────────────────────────────
  // SDK ConversationStatus: "disconnected" | "connecting" | "connected" | "error".
  const orbState: AgentOrbState = useMemo(() => {
    if (status === "error" || (error && status === "disconnected")) return "error";
    if (status === "connected") return isSpeaking ? "speaking" : "listening";
    if (status === "connecting") return "connecting";
    return "disconnected";
  }, [status, isSpeaking, error]);

  const isReconnecting = status === "connecting" && hasConnected;
  const isActive = started && (status === "connecting" || status === "connected");

  const strip: Bilingual = useMemo(() => {
    if (error) return error.copy;
    if (status === "error") return C.errors.generic;
    if (status === "connected") {
      return isSpeaking ? C.states.speaking : C.states.listening;
    }
    if (status === "connecting") {
      return isReconnecting
        ? { hi: "फिर से जुड़ रहा हूँ…", en: "Reconnecting…" }
        : C.states.starting;
    }
    return C.states.idle;
  }, [status, isSpeaking, error, isReconnecting]);

  const showPaywallOverlay = bootstrapped && !hasAccess && !isActive;
  const beginLabel = bootstrapped && !hasAccess ? C.paywall.openSeva : C.begin;

  return (
    <>
      {/* ── Zone 1: top bar ─────────────────────────────────────────── */}
      <header className="relative z-30 flex shrink-0 items-center justify-between gap-2 border-b border-gold-leaf/20 bg-mist/70 px-3 py-2.5 backdrop-blur">
        <Link
          href="/chat"
          onClick={() => void endSession()}
          aria-label="वापस चैट पर · Back to chat"
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-gold-leaf/10 hover:text-ink focus:outline-none focus:ring-2 focus:ring-gold-leaf/40"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>

        <span className="font-[family-name:var(--font-display)] text-sm tracking-[0.12em] text-ink">
          {BRAND.name.en}
        </span>

        <div className="relative flex shrink-0 items-center">
          <button
            type="button"
            onClick={handleEnd}
            aria-label={`${C.exit.hi} · ${C.exit.en}`}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-vermillion/10 hover:text-vermillion focus:outline-none focus:ring-2 focus:ring-vermillion/40"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
          <DiyaSevaPanel
            isOpen={isSevaOpen}
            onClose={() => setIsSevaOpen(false)}
            messageCount={counter.messageCount}
            sevaBalance={counter.sevaBalance}
            tiers={TIERS}
            onPurchaseSuccess={onPurchaseSuccess}
          />
        </div>
      </header>

      {/* ── Zone 2: identity disclaimer strip (Locked Decision #1) ──── */}
      <p className="relative z-20 shrink-0 border-b border-gold-leaf/10 bg-mist/40 px-4 py-1 text-center text-[11px] leading-tight text-ink-faint backdrop-blur">
        <span className="font-devanagari">{C.disclaimer.hi}</span>
        <span aria-hidden className="mx-1.5 text-gold-leaf/70">·</span>
        <span className="font-serif italic">{C.disclaimer.en}</span>
      </p>

      {/* ── Zone 3: orb hero ─────────────────────────────────────────── */}
      {/* min-h-0 lets this region shrink so the Zone 4/5 strip + Exit button
          below it stay on-screen no matter how long the transcript grows. */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center px-5">
        {/* Orb + title — centered in the available space; this inner region
            absorbs the slack so the transcript + Exit row never get pushed off. */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <p
            className={
              "mb-6 text-center transition-opacity duration-500 " +
              (isActive ? "opacity-60" : "opacity-100")
            }
          >
            <span className="block font-[family-name:var(--font-display)] text-2xl text-ink sm:text-3xl">
              {C.title.hi}
            </span>
            <span className="mt-1 block font-serif text-sm italic text-ink-soft">
              {C.title.en}
            </span>
          </p>

          <AgentOrb ref={orbRef} state={orbState} amplitude={0} />
        </div>

        {/* Transcript — the full conversation, bounded + scrollable. It scrolls
            WITHIN this region (auto-stuck to the latest turn; scroll up to read
            earlier turns) instead of growing the page and hiding the Exit
            button behind the browser bar. */}
        {transcript.length > 0 && isActive && (
          <div
            ref={transcriptRef}
            className="w-full max-w-[420px] shrink-0 overflow-y-auto pb-1"
            style={{ maxHeight: "26vh" }}
          >
            <div className="flex flex-col gap-1.5">
              {transcript.map((t, i) => (
                <p
                  key={`${i}-${t.role}`}
                  className={
                    "text-sm leading-snug " +
                    (t.role === "user"
                      ? "text-right text-ink-soft"
                      : "text-left font-devanagari text-ink")
                  }
                >
                  <span className="mr-1 text-[10px] uppercase tracking-wide text-ink-faint">
                    {t.role === "user" ? C.youLabel.hi : C.krishnaLabel.hi}
                  </span>
                  {t.text}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Paywall overlay — voice is paid-seva only. */}
        {showPaywallOverlay && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-mist/55 px-6 backdrop-blur-sm">
            <div className="fade-up max-w-[360px] rounded-3xl border border-gold-leaf/40 bg-cloud/90 px-6 py-6 text-center shadow-[0_18px_48px_-16px_oklch(40%_0.08_30_/_0.4)]">
              <p className="font-[family-name:var(--font-display)] text-lg text-ink">
                {C.paywall.hi}
              </p>
              <p className="mt-1 font-serif text-sm italic text-ink-soft">
                {C.paywall.en}
              </p>
              <p className="mt-3 font-devanagari text-sm leading-relaxed text-ink-soft">
                {C.paywall.body.hi}
              </p>
              <button
                type="button"
                onClick={() => setIsSevaOpen(true)}
                className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full border border-gold-leaf bg-linear-to-b from-buttermilk to-peach px-7 py-3 font-[family-name:var(--font-devanagari)] text-[15px] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-leaf"
              >
                {C.paywall.openSeva.hi}
                <span className="ml-2 font-serif text-sm italic text-ink-soft">
                  · {C.paywall.openSeva.en}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Helpline overlay (Locked Decision #7) — informational, non-blocking;
            the orb keeps running underneath while it is open. */}
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
        <span className="font-devanagari text-ink-soft">{strip.hi}</span>
        <span aria-hidden className="text-gold-leaf/60">·</span>
        <span className="font-serif italic text-ink-faint">{strip.en}</span>
      </p>

      {/* ── Zone 5: bottom action row ───────────────────────────────── */}
      <div className="relative z-20 flex shrink-0 items-center justify-center gap-3 px-5 pb-6 pt-1">
        {!isActive && (
          <button
            ref={beginRef}
            type="button"
            onClick={handleBegin}
            disabled={!bootstrapped}
            aria-label={`${beginLabel.hi} · ${beginLabel.en}`}
            className="inline-flex min-h-14 items-center justify-center rounded-full border border-gold-leaf bg-linear-to-b from-buttermilk to-peach px-12 py-4 font-[family-name:var(--font-devanagari)] text-lg text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_10px_28px_-10px_oklch(50%_0.1_30_/_0.35)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-leaf disabled:opacity-50"
          >
            {error && error.code !== "paywall" ? C.retry.hi : beginLabel.hi}
            <span className="ml-2 font-serif text-base italic text-ink-soft">
              · {error && error.code !== "paywall" ? C.retry.en : beginLabel.en}
            </span>
          </button>
        )}

        {isActive && (
          <button
            type="button"
            onClick={handleEnd}
            aria-label={`${C.exit.hi} · ${C.exit.en}`}
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-ink-line bg-white/40 px-7 py-3 font-[family-name:var(--font-devanagari)] text-base text-ink-soft backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-line"
          >
            {C.exit.hi}
            <span className="ml-2 font-serif text-sm italic text-ink-faint">
              · {C.exit.en}
            </span>
          </button>
        )}
      </div>
    </>
  );
}
