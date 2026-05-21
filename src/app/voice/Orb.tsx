"use client";

// Phase 10.5 — the /voice orb. The single interaction surface: a circular,
// layered, animated form with four live states (idle / listening / thinking /
// speaking) plus an error state. Pure presentation — no session logic, no
// fetches. The parent (VoiceClient) drives it two ways:
//
//   • `state`     — discrete; selects colors + which animations run.
//   • `--orb-amp` — a 0..1 CSS variable the parent sets IMPERATIVELY on the
//                   forwarded root ref (~30 Hz) so mic / TTS amplitude can
//                   pulse the ring + flute WITHOUT a React re-render per tick.
//
// Three layers per the spec: an outer gold-leaf ring, an inner mist→pastel
// radial fill, and Krishna's bansuri (the inline-SVG `Flute` motif) at the
// core. Halo rings (sonar) emanate on listening/speaking; a conic sweep
// rotates on thinking.
//
// Keyframes live INLINE here (globals.css is locked for this work). Every
// animation has a `prefers-reduced-motion: reduce` off-switch — when motion
// is reduced the orb still changes COLOR per state (so the user knows what's
// happening) but drops all pulses, halos, rotations, and drift.

import { forwardRef } from "react";
import type { CSSProperties } from "react";
import Flute from "../components/motifs/Flute";

export type OrbState =
  | "idle"
  | "starting"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";

const ARIA_LABEL: Record<OrbState, string> = {
  idle: "Krishna voice — ready",
  starting: "Krishna voice — getting ready",
  listening: "Krishna voice — listening",
  transcribing: "Krishna voice — hearing you",
  thinking: "Krishna voice — thinking",
  speaking: "Krishna voice — Krishna is speaking",
  error: "Krishna voice — something went wrong",
};

const Orb = forwardRef<HTMLDivElement, { state: OrbState; amplitude?: number }>(
  function Orb({ state, amplitude = 0 }, ref) {
    // transcribing + starting share the thinking treatment (a processing
    // moment); the orb only renders five visual buckets.
    const visual =
      state === "transcribing" || state === "starting" ? "thinking" : state;
    const showHalo = visual === "listening" || visual === "speaking";
    return (
      <div
        ref={ref}
        role="img"
        aria-label={ARIA_LABEL[state]}
        data-state={visual}
        style={{ "--orb-amp": amplitude } as CSSProperties}
        className="dv-orb relative h-[220px] w-[220px] select-none sm:h-[280px] sm:w-[280px]"
      >
        {/* Halo rings — sonar pulses on listening / speaking only. */}
        {showHalo && (
          <>
            <span aria-hidden className="dv-orb__halo dv-orb__halo--1" />
            <span aria-hidden className="dv-orb__halo dv-orb__halo--2" />
          </>
        )}

        {/* Rotating conic sweep — the thinking indicator. */}
        <span aria-hidden className="dv-orb__sweep" />

        {/* Outer gold-leaf ring. */}
        <span aria-hidden className="dv-orb__ring" />

        {/* Inner radial fill (mist → pastel edge per state). */}
        <span aria-hidden className="dv-orb__fill" />

        {/* Core bansuri glyph (inline-SVG Flute motif). */}
        <Flute className="dv-orb__flute" />

        {/* Error glyph overlay. */}
        {state === "error" && (
          <span aria-hidden className="dv-orb__warn">
            ⚠️
          </span>
        )}

        <style>{ORB_CSS}</style>
      </div>
    );
  },
);

export default Orb;

// Scoped to `.dv-orb` so it can't leak. Colors reference the Dawn Aarti
// tokens already defined in globals.css (gold-leaf / peach / rose / lavender
// / sky / mist / vermillion / ink) — no NEW tokens introduced.
const ORB_CSS = `
.dv-orb { border-radius: 9999px; isolation: isolate; }

/* ── inner fill ─────────────────────────────────────────────────────── */
.dv-orb__fill {
  position: absolute; inset: 7px; border-radius: 9999px;
  background: radial-gradient(circle at 50% 38%,
    var(--color-mist) 0%, var(--color-buttermilk) 70%, var(--color-peach) 100%);
  box-shadow: inset 0 2px 14px oklch(100% 0 0 / 0.6),
              inset 0 -10px 26px oklch(76% 0.12 80 / 0.10);
  transition: background 400ms ease, box-shadow 400ms ease,
              transform 400ms ease;
  transform: scale(calc(1 + var(--orb-amp, 0) * 0.015));
}
.dv-orb[data-state="listening"] .dv-orb__fill {
  background: radial-gradient(circle at 50% 40%,
    var(--color-mist) 0%, var(--color-peach) 78%, var(--color-rose) 100%);
}
.dv-orb[data-state="thinking"] .dv-orb__fill {
  background: radial-gradient(circle at 50% 42%,
    var(--color-mist) 0%, var(--color-lavender) 72%, var(--color-sky) 100%);
}
.dv-orb[data-state="speaking"] .dv-orb__fill {
  background: radial-gradient(circle at 50% 38%,
    var(--color-mist) 0%, var(--color-peach) 62%, var(--color-rose) 100%);
  box-shadow: inset 0 2px 14px oklch(100% 0 0 / 0.6),
              inset 0 -10px 30px oklch(89% 0.06 12 / 0.30),
              0 0 calc(18px + var(--orb-amp, 0) * 44px) oklch(76% 0.12 80 / 0.28);
  transform: scale(calc(1 + var(--orb-amp, 0) * 0.03));
}
.dv-orb[data-state="error"] .dv-orb__fill {
  background: radial-gradient(circle at 50% 40%,
    var(--color-mist) 0%, var(--color-buttermilk) 72%,
    oklch(53% 0.19 28 / 0.16) 100%);
}

/* ── outer gold-leaf ring ───────────────────────────────────────────── */
.dv-orb__ring {
  position: absolute; inset: 0; border-radius: 9999px;
  border: 2px solid oklch(76% 0.12 80 / 0.55);
  box-shadow: 0 0 0 1px oklch(85% 0.07 80 / 0.35),
              0 10px 40px -12px oklch(50% 0.1 30 / 0.25);
  transition: border-color 400ms ease, box-shadow 400ms ease,
              transform 400ms ease;
}
.dv-orb[data-state="listening"] .dv-orb__ring {
  border-color: oklch(76% 0.12 80 / calc(0.55 + var(--orb-amp, 0) * 0.4));
  border-width: 3px;
  box-shadow: 0 0 calc(8px + var(--orb-amp, 0) * 26px) oklch(76% 0.12 80 / 0.4),
              0 10px 40px -12px oklch(50% 0.1 30 / 0.25);
  transform: scale(calc(1 + var(--orb-amp, 0) * 0.02));
}
.dv-orb[data-state="speaking"] .dv-orb__ring {
  border-color: oklch(80% 0.13 82 / 0.9);
  border-width: 3px;
  box-shadow: 0 0 calc(14px + var(--orb-amp, 0) * 40px) oklch(78% 0.12 80 / 0.5),
              0 10px 40px -12px oklch(50% 0.1 30 / 0.25);
}
.dv-orb[data-state="error"] .dv-orb__ring {
  border-color: oklch(53% 0.19 28 / 0.5);
  box-shadow: 0 10px 40px -14px oklch(50% 0.1 30 / 0.2);
}

/* ── rotating conic sweep (thinking) ────────────────────────────────── */
.dv-orb__sweep {
  position: absolute; inset: -1px; border-radius: 9999px; opacity: 0;
  background: conic-gradient(from 0deg,
    transparent 0deg, oklch(76% 0.12 80 / 0.85) 70deg, transparent 170deg,
    oklch(52% 0.13 205 / 0.7) 250deg, transparent 360deg);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px));
  transition: opacity 400ms ease;
}
.dv-orb[data-state="thinking"] .dv-orb__sweep {
  opacity: 1; animation: dv-orb-rotate 2.4s linear infinite;
}

/* ── halo rings (listening + speaking) ──────────────────────────────── */
.dv-orb__halo {
  position: absolute; inset: 0; border-radius: 9999px;
  border: 2px solid oklch(76% 0.12 80 / 0.45);
  animation: dv-orb-halo 1.8s ease-out infinite;
}
.dv-orb__halo--2 { animation-delay: 0.9s; }
.dv-orb[data-state="speaking"] .dv-orb__halo {
  border-color: oklch(89% 0.06 12 / 0.5);
}

/* ── core flute ─────────────────────────────────────────────────────── */
.dv-orb__flute {
  position: absolute; left: 50%; top: 50%; width: 46%; height: auto;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 1px 2px oklch(50% 0.1 30 / 0.25));
  transition: opacity 400ms ease, transform 200ms ease;
}
.dv-orb[data-state="listening"] .dv-orb__flute {
  animation: dv-orb-flute-drift 6s ease-in-out infinite;
}
.dv-orb[data-state="thinking"] .dv-orb__flute { opacity: 0.5; }
.dv-orb[data-state="speaking"] .dv-orb__flute {
  transform: translate(-50%, -50%) scale(calc(1 + var(--orb-amp, 0) * 0.22));
}
.dv-orb[data-state="error"] .dv-orb__flute { opacity: 0.35; }

/* idle breathing of the whole orb */
.dv-orb[data-state="idle"] { animation: dv-orb-breathe 3.4s ease-in-out infinite; }

/* ── error glyph ────────────────────────────────────────────────────── */
.dv-orb__warn {
  position: absolute; left: 50%; top: 64%;
  transform: translate(-50%, -50%); font-size: 22px; line-height: 1;
}

@keyframes dv-orb-rotate { to { transform: rotate(360deg); } }
@keyframes dv-orb-halo {
  0%   { transform: scale(1);    opacity: 0.5; }
  100% { transform: scale(1.55); opacity: 0;   }
}
@keyframes dv-orb-breathe {
  0%, 100% { transform: scale(1);     }
  50%      { transform: scale(1.025); }
}
@keyframes dv-orb-flute-drift {
  0%, 100% { transform: translate(-50%, -52%); }
  50%      { transform: translate(-50%, -48%); }
}

/* ── reduced motion: kill pulses/halos/rotations/drift; keep COLOR ──── */
@media (prefers-reduced-motion: reduce) {
  .dv-orb[data-state="idle"],
  .dv-orb[data-state="thinking"] .dv-orb__sweep,
  .dv-orb__halo,
  .dv-orb[data-state="listening"] .dv-orb__flute {
    animation: none !important;
  }
  .dv-orb__fill, .dv-orb__ring, .dv-orb__flute { transform: none !important; }
  .dv-orb[data-state="speaking"] .dv-orb__flute,
  .dv-orb[data-state="listening"] .dv-orb__fill { transform: none !important; }
  /* the thinking sweep still shows as a static gold arc so the state reads */
  .dv-orb[data-state="thinking"] .dv-orb__sweep { opacity: 1; }
}
`;
