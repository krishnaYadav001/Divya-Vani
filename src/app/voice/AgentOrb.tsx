"use client";

// Phase 11.3 — the ElevenAgents /voice orb. A fresh, smaller, focused Dawn
// Aarti orb (NOT the Phase-10.5 Orb.tsx, which is being retired in 11.6). Pure
// presentation — no SDK logic, no fetches. The parent (AgentVoiceClient) drives
// it two ways:
//
//   • `state`     — discrete; selects colors + which animations run. Mapped
//                   from the SDK status/mode (disconnected/connecting/listening/
//                   speaking/error).
//   • `--orb-amp` — a 0..1 CSS var the parent sets IMPERATIVELY on the forwarded
//                   root ref (~animation-frame rate) from mic / TTS amplitude,
//                   so the ring glow + orb scale react WITHOUT a React re-render
//                   per tick.
//
// Layers: a slowly-drifting peach→lavender→sky gradient fill, a gold-leaf accent
// ring, a vermillion sindoor dot at the crown, and (speaking only) radiating
// gold sonar rings. Keyframes are scoped INLINE to `.dv-aorb` so they can't
// leak. Every animation has a prefers-reduced-motion off-switch — with motion
// reduced the orb still changes COLOR per state so the state stays legible.
//
// Mobile-first: the orb sizes with clamp() and is verified at a 360px viewport.

import { forwardRef } from "react";
import type { CSSProperties } from "react";

export type AgentOrbState =
  | "disconnected"
  | "connecting"
  | "listening"
  | "speaking"
  | "error";

const ARIA_LABEL: Record<AgentOrbState, string> = {
  disconnected: "Krishna voice — ready",
  connecting: "Krishna voice — connecting",
  listening: "Krishna voice — listening",
  speaking: "Krishna voice — Krishna is speaking",
  error: "Krishna voice — something went wrong",
};

const AgentOrb = forwardRef<
  HTMLDivElement,
  { state: AgentOrbState; amplitude?: number }
>(function AgentOrb({ state, amplitude = 0 }, ref) {
  const showSonar = state === "speaking";
  return (
    <div
      ref={ref}
      role="img"
      aria-label={ARIA_LABEL[state]}
      data-state={state}
      style={{ "--orb-amp": amplitude } as CSSProperties}
      className="dv-aorb relative select-none"
    >
      {/* Radiating gold sonar rings — speaking only. */}
      {showSonar && (
        <>
          <span aria-hidden className="dv-aorb__sonar dv-aorb__sonar--1" />
          <span aria-hidden className="dv-aorb__sonar dv-aorb__sonar--2" />
        </>
      )}

      {/* Gold-leaf accent ring. */}
      <span aria-hidden className="dv-aorb__ring" />

      {/* Drifting peach → lavender → sky gradient fill. */}
      <span aria-hidden className="dv-aorb__fill" />

      {/* Vermillion sindoor dot at the crown. */}
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

// Scoped to `.dv-aorb`. Colors reference Dawn Aarti tokens already in
// globals.css (peach / rose / lavender / sky / gold-leaf / vermillion / mist) —
// no NEW tokens introduced.
const ORB_CSS = `
.dv-aorb {
  width: clamp(190px, 56vw, 280px);
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

/* ── gold-leaf ring (glow scales with amplitude on active states) ────── */
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
  box-shadow: 0 0 calc(10px + var(--orb-amp, 0) * 40px) oklch(76% 0.12 80 / 0.45),
              0 12px 44px -14px oklch(50% 0.1 30 / 0.28);
}
.dv-aorb[data-state="error"] .dv-aorb__ring {
  border-color: oklch(53% 0.19 28 / 0.5);
}

/* ── vermillion sindoor dot at the crown ────────────────────────────── */
.dv-aorb__sindoor {
  position: absolute; top: -2px; left: 50%; transform: translateX(-50%);
  width: clamp(11px, 3.5vw, 15px); aspect-ratio: 1 / 1; border-radius: 9999px;
  background: radial-gradient(circle at 40% 35%, oklch(64% 0.2 28), var(--color-vermillion));
  box-shadow: 0 0 10px oklch(53% 0.19 28 / 0.5), 0 1px 2px oklch(30% 0.1 28 / 0.4);
  z-index: 2;
}

/* ── radiating sonar rings (speaking) ───────────────────────────────── */
.dv-aorb__sonar {
  position: absolute; inset: 0; border-radius: 9999px;
  border: 2px solid oklch(76% 0.12 80 / 0.5);
  animation: dv-aorb-sonar 1.8s ease-out infinite;
}
.dv-aorb__sonar--2 { animation-delay: 0.9s; }

/* ── per-state whole-orb motion (mutually exclusive states) ─────────── */
.dv-aorb[data-state="connecting"] { animation: dv-aorb-breathe 2.2s ease-in-out infinite; }
.dv-aorb[data-state="listening"]  { animation: dv-aorb-pulse 1.6s ease-in-out infinite; }
.dv-aorb[data-state="speaking"]   { transform: scale(calc(1 + var(--orb-amp, 0) * 0.03)); }

/* ── error glyph ────────────────────────────────────────────────────── */
.dv-aorb__warn {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%); font-size: clamp(28px, 9vw, 40px); line-height: 1;
}

@keyframes dv-aorb-drift  { to { transform: rotate(360deg); } }
@keyframes dv-aorb-sonar  { 0% { transform: scale(1); opacity: 0.55; } 100% { transform: scale(1.6); opacity: 0; } }
@keyframes dv-aorb-pulse  { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes dv-aorb-breathe{ 0%, 100% { transform: scale(0.98); opacity: 0.85; } 50% { transform: scale(1.01); opacity: 1; } }

/* ── reduced motion: drop pulses/sonar/drift/scale; keep COLOR per state ─ */
@media (prefers-reduced-motion: reduce) {
  .dv-aorb,
  .dv-aorb__fill,
  .dv-aorb__sonar {
    animation: none !important;
  }
  .dv-aorb[data-state="speaking"] { transform: none !important; }
}
`;
