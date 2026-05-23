"use client";

// Phase 11.3 — the ElevenAgents /voice orb. A fresh, focused Dawn Aarti orb
// (NOT the Phase-10.5 Orb.tsx). Pure presentation — no SDK logic. The parent
// (AgentVoiceClient) drives it two ways:
//
//   • `state`     — discrete; selects colors + which animations run. Mapped from
//                   the SDK status/mode: disconnected / connecting / listening /
//                   thinking (user turn ended, Krishna processing) / speaking /
//                   error.
//   • `--orb-amp` — a 0..1 CSS var the parent sets IMPERATIVELY (~frame rate)
//                   from mic / TTS amplitude, so the ring + a "recording" pulse
//                   react to the user's VOICE while listening — without a React
//                   re-render per tick.
//
// State legibility (a deliberate UX goal): the three live states read very
// differently so the user always knows what's happening —
//   listening  → warm peach/rose, a pulsing vermillion REC dot, ring reacts to
//                your voice ("I'm recording you").
//   thinking   → cooler lavender/sky, a rotating sweep, REC dot off ("I've
//                stopped listening, I'm thinking") — the cue that listening ENDED.
//   speaking   → radiating gold sonar ("Krishna is speaking").
//
// Sizing is height-responsive (`min(…, svh)`) so the orb shrinks on short
// viewports and never pushes the controls off-screen. Keyframes are scoped
// INLINE to `.dv-aorb`. Every animation has a prefers-reduced-motion off-switch
// (state still reads by COLOR with motion reduced).

import { forwardRef } from "react";
import type { CSSProperties } from "react";

export type AgentOrbState =
  | "disconnected"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

const ARIA_LABEL: Record<AgentOrbState, string> = {
  disconnected: "Krishna voice — ready",
  connecting: "Krishna voice — connecting",
  listening: "Krishna voice — listening to you",
  thinking: "Krishna voice — thinking",
  speaking: "Krishna voice — Krishna is speaking",
  error: "Krishna voice — something went wrong",
};

const AgentOrb = forwardRef<
  HTMLDivElement,
  { state: AgentOrbState; amplitude?: number }
>(function AgentOrb({ state, amplitude = 0 }, ref) {
  return (
    <div
      ref={ref}
      role="img"
      aria-label={ARIA_LABEL[state]}
      data-state={state}
      style={{ "--orb-amp": amplitude } as CSSProperties}
      className="dv-aorb relative select-none"
    >
      {/* Radiating gold sonar rings — speaking only (shown via CSS). */}
      <span aria-hidden className="dv-aorb__sonar dv-aorb__sonar--1" />
      <span aria-hidden className="dv-aorb__sonar dv-aorb__sonar--2" />

      {/* Rotating processing sweep — thinking only (shown via CSS). */}
      <span aria-hidden className="dv-aorb__sweep" />

      {/* Gold-leaf accent ring. */}
      <span aria-hidden className="dv-aorb__ring" />

      {/* Drifting peach → lavender → sky gradient fill. */}
      <span aria-hidden className="dv-aorb__fill" />

      {/* Vermillion sindoor dot — doubles as the REC light while listening. */}
      <span aria-hidden className="dv-aorb__sindoor" />

      {/* Error glyph overlay. */}
      {state === "error" && (
        <span aria-hidden className="dv-aorb__warn">
          ⚠️
        </span>
      )}

      <style>{ORB_CSS}</style>
    </div>
  );
});

export default AgentOrb;

// Scoped to `.dv-aorb`. Colors reference Dawn Aarti tokens in globals.css —
// no NEW tokens introduced.
const ORB_CSS = `
.dv-aorb {
  width: clamp(150px, 50vw, 240px);
  width: min(clamp(150px, 50vw, 240px), 40svh); /* height-aware: shrinks on short viewports */
  aspect-ratio: 1 / 1;
  border-radius: 9999px;
  isolation: isolate;
}

/* ── drifting gradient fill ─────────────────────────────────────────── */
.dv-aorb__fill {
  position: absolute; inset: 6px; border-radius: 9999px;
  background:
    radial-gradient(circle at 38% 30%, oklch(100% 0 0 / 0.5), transparent 46%),
    conic-gradient(from 200deg,
      var(--color-peach), var(--color-lavender),
      var(--color-sky), var(--color-rose), var(--color-peach));
  box-shadow: inset 0 2px 16px oklch(100% 0 0 / 0.55),
              inset 0 -14px 30px oklch(76% 0.12 80 / 0.10);
  transition: opacity 500ms ease, filter 500ms ease;
  animation: dv-aorb-drift 16s linear infinite;
}
.dv-aorb[data-state="disconnected"] .dv-aorb__fill { opacity: 0.62; filter: saturate(0.7); }
.dv-aorb[data-state="error"] .dv-aorb__fill { filter: saturate(0.55) brightness(0.98); }
/* thinking: cooler cast + faster drift so it reads as "processing", not listening */
.dv-aorb[data-state="thinking"] .dv-aorb__fill {
  filter: saturate(0.85) hue-rotate(-12deg);
  animation-duration: 7s;
}

/* ── gold-leaf ring (glow reacts to amplitude on listening + speaking) ── */
.dv-aorb__ring {
  position: absolute; inset: 0; border-radius: 9999px;
  border: 2px solid oklch(76% 0.12 80 / 0.5);
  box-shadow: 0 0 0 1px oklch(85% 0.07 80 / 0.3),
              0 12px 44px -14px oklch(50% 0.1 30 / 0.28);
  transition: border-color 300ms ease, box-shadow 160ms ease, border-width 300ms ease;
}
.dv-aorb[data-state="listening"] .dv-aorb__ring,
.dv-aorb[data-state="speaking"] .dv-aorb__ring {
  border-width: 3px;
  border-color: oklch(78% 0.12 80 / calc(0.55 + var(--orb-amp, 0) * 0.4));
  box-shadow: 0 0 calc(10px + var(--orb-amp, 0) * 44px) oklch(76% 0.12 80 / 0.45),
              0 12px 44px -14px oklch(50% 0.1 30 / 0.28);
}
.dv-aorb[data-state="error"] .dv-aorb__ring {
  border-color: oklch(53% 0.19 28 / 0.5);
}

/* ── vermillion sindoor dot — also the REC light while listening ──────── */
.dv-aorb__sindoor {
  position: absolute; top: -2px; left: 50%; transform: translateX(-50%);
  width: clamp(11px, 3.5vw, 15px); aspect-ratio: 1 / 1; border-radius: 9999px;
  background: radial-gradient(circle at 40% 35%, oklch(64% 0.2 28), var(--color-vermillion));
  box-shadow: 0 0 10px oklch(53% 0.19 28 / 0.5), 0 1px 2px oklch(30% 0.1 28 / 0.4);
  transition: opacity 300ms ease;
  z-index: 2;
}
/* listening: the dot pulses like a recording light */
.dv-aorb[data-state="listening"] .dv-aorb__sindoor {
  animation: dv-aorb-rec 1.1s ease-in-out infinite;
}
/* thinking/disconnected: REC light off so the user sees listening has stopped */
.dv-aorb[data-state="thinking"] .dv-aorb__sindoor,
.dv-aorb[data-state="disconnected"] .dv-aorb__sindoor { opacity: 0.35; }

/* ── radiating sonar rings (speaking) ───────────────────────────────── */
.dv-aorb__sonar {
  position: absolute; inset: 0; border-radius: 9999px; opacity: 0;
  border: 2px solid oklch(76% 0.12 80 / 0.5);
}
.dv-aorb[data-state="speaking"] .dv-aorb__sonar {
  animation: dv-aorb-sonar 1.8s ease-out infinite;
}
.dv-aorb[data-state="speaking"] .dv-aorb__sonar--2 { animation-delay: 0.9s; }

/* ── rotating processing sweep (thinking) ───────────────────────────── */
.dv-aorb__sweep {
  position: absolute; inset: -2px; border-radius: 9999px; opacity: 0;
  background: conic-gradient(from 0deg,
    transparent 0deg, oklch(86% 0.045 305 / 0.85) 60deg, transparent 150deg,
    oklch(52% 0.13 205 / 0.6) 240deg, transparent 360deg);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px));
  transition: opacity 300ms ease;
}
.dv-aorb[data-state="thinking"] .dv-aorb__sweep {
  opacity: 1; animation: dv-aorb-spin 2.2s linear infinite;
}

/* ── per-state whole-orb motion (mutually exclusive states) ─────────── */
.dv-aorb[data-state="connecting"] { animation: dv-aorb-breathe 2.2s ease-in-out infinite; }
/* listening: a gentle base breathe; the ring (above) carries the voice react */
.dv-aorb[data-state="listening"]  { animation: dv-aorb-pulse 2s ease-in-out infinite; }
.dv-aorb[data-state="thinking"]   { transform: scale(0.97); }
.dv-aorb[data-state="speaking"]   { transform: scale(calc(1 + var(--orb-amp, 0) * 0.03)); }

/* ── error glyph ────────────────────────────────────────────────────── */
.dv-aorb__warn {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%); font-size: clamp(28px, 9vw, 40px); line-height: 1;
}

@keyframes dv-aorb-drift  { to { transform: rotate(360deg); } }
@keyframes dv-aorb-spin   { to { transform: rotate(360deg); } }
@keyframes dv-aorb-sonar  { 0% { transform: scale(1); opacity: 0.55; } 100% { transform: scale(1.6); opacity: 0; } }
@keyframes dv-aorb-pulse  { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
@keyframes dv-aorb-breathe{ 0%, 100% { transform: scale(0.98); opacity: 0.85; } 50% { transform: scale(1.01); opacity: 1; } }
@keyframes dv-aorb-rec    { 0%, 100% { opacity: 1; box-shadow: 0 0 14px oklch(53% 0.19 28 / 0.85), 0 1px 2px oklch(30% 0.1 28 / 0.4); }
                            50%       { opacity: 0.55; box-shadow: 0 0 6px oklch(53% 0.19 28 / 0.4), 0 1px 2px oklch(30% 0.1 28 / 0.4); } }

/* ── reduced motion: drop pulses/sonar/sweep/drift/scale; keep COLOR + the
   static REC dot so each state still reads ──────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .dv-aorb,
  .dv-aorb__fill,
  .dv-aorb__sonar,
  .dv-aorb__sweep,
  .dv-aorb__sindoor {
    animation: none !important;
  }
  .dv-aorb[data-state="speaking"],
  .dv-aorb[data-state="thinking"] { transform: none !important; }
  /* thinking sweep stays as a static arc so the processing state still reads */
  .dv-aorb[data-state="thinking"] .dv-aorb__sweep { opacity: 1; }
}
`;
