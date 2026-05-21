"use client";

// Phase 10.5 — /voice top-level client. Owns the session lifecycle and the
// five-zone layout (top bar / identity strip / orb hero / state strip / action
// row), plus the paywall, helpline, resume-after-background, ended, and
// transcript overlays. All loop mechanics live in src/lib/voiceSession.ts;
// this component is the view + the gesture entry points.
//
// Audio: it mounts ONE dedicated hidden <audio>. Phase 10.6 — voiceSession
// drives playback directly (filler clip → real reply, with mode:"voice"), so
// the element is handed to voiceSession via primeAudio()/startSession() rather
// than registered with the locked Phase-10.2 voiceClient.
//
// Paywall note: /api/me does not expose a lifetime "ever paid" flag (the
// authoritative signal is the server-side payments table via
// hasVoiceAccess()). The closest client-readable proxy is seva_balance > 0 —
// which is CONSERVATIVE: it can only ever DENY a paid-but-depleted user (who
// genuinely needs to top up to have a voice turn, since each turn spends a
// pool message), never GRANT voice to someone /api/tts would 402. The
// authoritative gate stays server-side: /api/tts → 402 and /api/chat →
// paywall both route here to open the seva panel (edge cases 12 + 20).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { getTiersInOrder } from "@/lib/seva";
import type { SafetyCard } from "@/lib/messages";
import * as voice from "@/lib/voiceSession";
import type { VoiceState, VoiceError } from "@/lib/voiceSession";
import Orb, { type OrbState } from "./Orb";
import TranscriptModal from "./TranscriptModal";
import DiyaSevaPanel from "../components/DiyaSevaPanel";

const C = BRAND.voiceCopy;
const TIERS = getTiersInOrder();

function errorCopy(code: string): { hi: string; en: string } {
  const e = C.errors;
  switch (code) {
    case "permission_denied":
      return e.permission_denied;
    case "no_hardware":
      return e.no_hardware;
    case "unsupported_browser":
      return e.unsupported_browser;
    case "vad_load_failed":
      return e.vad_load_failed;
    case "transcribe_failed":
      return e.transcribe_failed;
    case "network":
      return e.network;
    case "tts_failed":
      return e.tts_failed;
    case "audio_failed":
      return e.audio_failed;
    default:
      return e.generic;
  }
}

function stateStrip(
  state: VoiceState,
  error: VoiceError | null,
  needsResume: boolean,
  isFiller: boolean,
): { hi: string; en: string } {
  if (state === "error") {
    return error?.code === "paywall"
      ? { hi: C.paywall.hi, en: C.paywall.en }
      : errorCopy(error?.code ?? "generic");
  }
  if (state === "starting" && needsResume) {
    return { hi: C.backgrounded.hi, en: C.backgrounded.en };
  }
  // While a filler clip plays we're technically "speaking" but it's not yet
  // Krishna's real reply — show a quieter "थोड़ा रुको…" indicator.
  if (state === "speaking" && isFiller) {
    return { hi: C.fillerWait.hi, en: C.fillerWait.en };
  }
  return C.states[state] ?? C.states.idle;
}

export default function VoiceClient() {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const beginRef = useRef<HTMLButtonElement>(null);
  const stateRef = useRef<VoiceState>("idle");

  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<VoiceError | null>(null);
  const [safety, setSafety] = useState<SafetyCard | null>(null);
  const [needsResume, setNeedsResume] = useState(false);
  // Phase 10.6 — true while a filler clip plays (quieter orb + indicator).
  const [isFiller, setIsFiller] = useState(false);

  const [accessChecked, setAccessChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [counter, setCounter] = useState({ message_count: 0, seva_balance: 0 });

  const [isSevaOpen, setIsSevaOpen] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState<voice.TranscriptTurn[]>([]);

  // ── session subscription + lifecycle ──────────────────────────────────
  useEffect(() => {
    const unsub = voice.subscribe((s, ctx) => {
      // High-frequency amplitude → drive the orb CSS var imperatively (no
      // React re-render per tick).
      if (ctx?.amplitude !== undefined) {
        orbRef.current?.style.setProperty(
          "--orb-amp",
          ctx.amplitude.toFixed(3),
        );
      }
      if (ctx?.error) setError(ctx.error);
      if (ctx?.safety) setSafety(ctx.safety);
      // Filler ↔ real toggle (only present on "speaking" emits).
      if (ctx?.isFiller !== undefined) setIsFiller(ctx.isFiller);

      // Discrete state transitions only.
      if (s !== stateRef.current) {
        stateRef.current = s;
        setState(s);
        if (s !== "error") setError(null);
        if (s !== "speaking") setIsFiller(false);
        setNeedsResume(s === "starting" && voice.isPausedFromBackground());
      }
    });

    // Fresh idle session for this mount (clears any prior session's turns).
    voice.reset();

    // Paywall pre-check (best-effort; see header note on the seva_balance
    // proxy). Free / unpaid users see the paywall overlay before speaking.
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        const mc = typeof d.message_count === "number" ? d.message_count : 0;
        const sb = typeof d.seva_balance === "number" ? d.seva_balance : 0;
        setCounter({ message_count: mc, seva_balance: sb });
        setHasAccess(sb > 0);
      })
      .catch(() => {
        setHasAccess(false);
      })
      .finally(() => setAccessChecked(true));

    // Background pause (edge case 10): never auto-resume — mobile autoplay
    // restrictions return after backgrounding, so we require a fresh gesture.
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        const st = voice.getState();
        if (st !== "idle" && st !== "ended" && st !== "error") {
          voice.pauseForBackground();
        }
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      unsub();
      void voice.endSession();
      voice.disposeAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the seva panel reflects a fresh purchase, an error("paywall") clears
  // its overlay flavour but the seva overlay stays openable.
  const onPurchaseSuccess = useCallback((newBalance: number) => {
    setCounter((p) => ({ ...p, seva_balance: newBalance }));
    if (newBalance > 0) {
      setHasAccess(true);
      setError((e) => (e?.code === "paywall" ? null : e));
    }
  }, []);

  // Focus the primary action when idle (accessibility entry point).
  useEffect(() => {
    if (accessChecked && state === "idle") beginRef.current?.focus();
  }, [accessChecked, state]);

  // ── gesture handlers ───────────────────────────────────────────────────
  const handleBegin = useCallback(() => {
    if (!accessChecked) return;
    if (!hasAccess) {
      setIsSevaOpen(true);
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    // iOS gesture token — prime the AudioContext + element synchronously,
    // INSIDE this click, BEFORE any await (edge cases 3 + 17).
    voice.primeAudio(el);
    void voice.startSession({ audioEl: el });
  }, [accessChecked, hasAccess]);

  const handleExit = useCallback(() => {
    setTranscript(voice.getTranscript());
    void voice.endSession();
  }, []);

  const handleBackToChat = useCallback(() => {
    void voice.endSession();
    router.push("/chat");
  }, [router]);

  const handleRetry = useCallback(() => {
    const el = audioRef.current;
    if (el) voice.primeAudio(el);
    voice.retry();
  }, []);

  const handleResume = useCallback(() => {
    void voice.resumeFromBackground();
    setNeedsResume(false);
  }, []);

  const handleStartAgain = useCallback(() => {
    voice.reset();
    setSafety(null);
    setError(null);
    // re-prime within this gesture, then start
    const el = audioRef.current;
    if (!el) return;
    voice.primeAudio(el);
    void voice.startSession({ audioEl: el });
  }, []);

  const dismissSafety = useCallback(() => {
    setSafety(null);
    voice.acknowledgeSafety();
  }, []);

  // ── derived view state ─────────────────────────────────────────────────
  // While a filler clip plays the loop is in "speaking" but it's not Krishna's
  // real reply yet — render the calmer "thinking" orb (not the full speaking
  // animation) per the filler spec.
  const orbState: OrbState =
    state === "ended"
      ? "idle"
      : state === "speaking" && isFiller
        ? "thinking"
        : state;
  const isActive =
    state === "starting" ||
    state === "listening" ||
    state === "transcribing" ||
    state === "thinking" ||
    state === "speaking";
  const showPaywallOverlay = accessChecked && !hasAccess && state === "idle";
  const isPaywallError = state === "error" && error?.code === "paywall";
  const strip = useMemo(
    () => stateStrip(state, error, needsResume, isFiller),
    [state, error, needsResume, isFiller],
  );
  const transcriptTurns = state === "ended" ? transcript : [];

  return (
    <>
      {/* TTS + filler audio element — driven directly by voiceSession. */}
      <audio ref={audioRef} className="hidden" preload="auto" aria-hidden />

      {/* ── Zone 1: top bar ─────────────────────────────────────────── */}
      <header className="relative z-30 flex shrink-0 items-center justify-between gap-2 border-b border-gold-leaf/20 bg-mist/70 px-3 py-2.5 backdrop-blur">
        <Link
          href="/chat"
          onClick={() => void voice.endSession()}
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
            onClick={handleExit}
            aria-label={`${C.exit.hi} · ${C.exit.en}`}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-vermillion/10 hover:text-vermillion focus:outline-none focus:ring-2 focus:ring-vermillion/40"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
          {/* Seva panel — anchored under this top-right cluster (relative). */}
          <DiyaSevaPanel
            isOpen={isSevaOpen}
            onClose={() => setIsSevaOpen(false)}
            messageCount={counter.message_count}
            sevaBalance={counter.seva_balance}
            tiers={TIERS}
            onPurchaseSuccess={onPurchaseSuccess}
          />
        </div>
      </header>

      {/* ── Zone 2: identity disclaimer strip (Locked Decision #1) ──── */}
      <p className="relative z-20 shrink-0 border-b border-gold-leaf/10 bg-mist/40 px-4 py-1 text-center text-[11px] leading-tight text-ink-faint backdrop-blur">
        <span className="font-devanagari">{C.disclaimer.hi}</span>
        <span aria-hidden className="mx-1.5 text-gold-leaf/70">
          ·
        </span>
        <span className="font-serif italic">{C.disclaimer.en}</span>
      </p>

      {/* ── Zone 3: orb hero ─────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5">
        <p
          className={
            "mb-8 text-center transition-opacity duration-500 " +
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

        <Orb ref={orbRef} state={orbState} amplitude={0} />

        {/* Paywall overlay — voice is paid-seva only. */}
        {(showPaywallOverlay || isPaywallError) && (
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

        {/* Helpline overlay (Locked Decision #7) — visible, never hidden under
            the orb. role=alert + assertive so screen readers announce it. */}
        {safety && (
          <div
            role="alert"
            aria-live="assertive"
            className="absolute inset-0 z-30 flex items-center justify-center bg-ink/30 px-5 backdrop-blur-sm"
          >
            <div className="fade-up w-full max-w-[400px] rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4 leading-relaxed text-zinc-800 shadow-[0_18px_48px_-16px_rgba(0,0,0,0.35)]">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Support · सहारा
              </p>
              <p className="mb-2 text-sm font-medium text-zinc-900">
                {safety.title}
              </p>
              <p className="mb-3 text-sm text-zinc-700">{safety.body}</p>
              <div className="flex flex-wrap gap-2">
                {safety.helplines.map((h) => (
                  <a
                    key={h.number}
                    href={`tel:${h.number.replace(/[^0-9+]/g, "")}`}
                    className="inline-flex items-center gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-all hover:bg-stone-100"
                  >
                    <span aria-hidden className="text-lg leading-none">
                      📞
                    </span>
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
              <button
                type="button"
                onClick={dismissSafety}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-5 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
              >
                <span className="font-devanagari">समझ गया</span>
                <span aria-hidden className="mx-1.5 text-zinc-400">
                  ·
                </span>
                <span>Continue</span>
              </button>
            </div>
          </div>
        )}

        {/* Ended overlay — post-exit affordances. */}
        {state === "ended" && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-mist/65 px-6 backdrop-blur-sm">
            <div className="fade-up max-w-[360px] rounded-3xl border border-gold-leaf/40 bg-cloud/90 px-6 py-6 text-center shadow-[0_18px_48px_-16px_oklch(40%_0.08_30_/_0.4)]">
              <p className="font-[family-name:var(--font-display)] text-lg text-ink">
                {C.states.ended.hi}
              </p>
              <p className="mt-1 font-serif text-sm italic text-ink-soft">
                {C.states.ended.en}
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                {transcript.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowTranscript(true)}
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-gold-leaf/50 bg-white/60 px-5 py-2.5 font-[family-name:var(--font-devanagari)] text-sm text-ink transition-colors hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-leaf"
                  >
                    {C.readTranscript.hi}
                    <span className="ml-2 font-serif text-xs italic text-ink-soft">
                      · {C.readTranscript.en}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleStartAgain}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-gold-leaf/50 bg-white/60 px-5 py-2.5 font-[family-name:var(--font-devanagari)] text-sm text-ink transition-colors hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-leaf"
                >
                  {C.startNew.hi}
                  <span className="ml-2 font-serif text-xs italic text-ink-soft">
                    · {C.startNew.en}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleBackToChat}
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-gold-leaf bg-linear-to-b from-buttermilk to-peach px-7 py-3 font-[family-name:var(--font-devanagari)] text-[15px] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-leaf"
                >
                  {C.backToChat.hi}
                  <span className="ml-2 font-serif text-sm italic text-ink-soft">
                    · {C.backToChat.en}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Zone 4: state-indicator strip ───────────────────────────── */}
      <p
        role="status"
        aria-live="polite"
        className="relative z-10 flex shrink-0 items-center justify-center gap-2 px-4 py-2 text-center text-sm"
      >
        <span className="font-devanagari text-ink-soft">{strip.hi}</span>
        <span aria-hidden className="text-gold-leaf/60">
          ·
        </span>
        <span className="font-serif italic text-ink-faint">{strip.en}</span>
      </p>

      {/* ── Zone 5: bottom action row ───────────────────────────────── */}
      <div className="relative z-20 flex shrink-0 items-center justify-center gap-3 px-5 pb-6 pt-1">
        {state === "idle" && (
          <button
            ref={beginRef}
            type="button"
            onClick={handleBegin}
            disabled={!accessChecked}
            aria-label={
              hasAccess
                ? `${C.begin.hi} · ${C.begin.en}`
                : `${C.paywall.openSeva.hi} · ${C.paywall.openSeva.en}`
            }
            className="inline-flex min-h-14 items-center justify-center rounded-full border border-gold-leaf bg-linear-to-b from-buttermilk to-peach px-12 py-4 font-[family-name:var(--font-devanagari)] text-lg text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_10px_28px_-10px_oklch(50%_0.1_30_/_0.35)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-leaf disabled:opacity-50"
          >
            {accessChecked && !hasAccess ? C.paywall.openSeva.hi : C.begin.hi}
            <span className="ml-2 font-serif text-base italic text-ink-soft">
              · {accessChecked && !hasAccess ? C.paywall.openSeva.en : C.begin.en}
            </span>
          </button>
        )}

        {state === "starting" && needsResume && (
          <button
            type="button"
            onClick={handleResume}
            className="inline-flex min-h-14 items-center justify-center rounded-full border border-gold-leaf bg-linear-to-b from-buttermilk to-peach px-10 py-4 font-[family-name:var(--font-devanagari)] text-lg text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-leaf"
          >
            {C.resume.hi}
            <span className="ml-2 font-serif text-base italic text-ink-soft">
              · {C.resume.en}
            </span>
          </button>
        )}

        {state === "error" && error?.recoverable && !isPaywallError && (
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-gold-leaf bg-linear-to-b from-buttermilk to-peach px-8 py-3 font-[family-name:var(--font-devanagari)] text-base text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-leaf"
          >
            {C.retry.hi}
            <span className="ml-2 font-serif text-sm italic text-ink-soft">
              · {C.retry.en}
            </span>
          </button>
        )}

        {/* Quiet Exit — present in every active / error phase. Hidden in idle
            (Begin is the action) and ended (overlay owns the actions). */}
        {(isActive || state === "error") && (
          <button
            type="button"
            onClick={handleExit}
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

      <TranscriptModal
        isOpen={showTranscript}
        onClose={() => setShowTranscript(false)}
        turns={transcriptTurns}
      />
    </>
  );
}
