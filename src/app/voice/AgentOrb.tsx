// Phase 11.x — the /voice orb, NIGHT mode (Dawn Aarti handoff →
// dawn-voice.jsx NightOrb + MusicParticles). The voice page is the night
// counterpart of the Dawn pastel system: this orb is a luminous
// blue/violet nebula at the terminus of Krishna's music ribbon, ringed in
// gold leaf, sitting over the flute painting. Pure presentation — no SDK
// logic. The parent (AgentVoiceClient) drives it two ways:
//
//   • `state`     — discrete; selects glow speed, particle behaviour, and
//                   which sub-animations run. Mapped from the SDK status:
//                   disconnected / connecting / listening / thinking
//                   (user turn ended, Krishna processing) / speaking / error.
//   • `--orb-amp` — a 0..1 CSS var the parent sets IMPERATIVELY (~frame
//                   rate) from mic / TTS amplitude, so the gold ring reacts
//                   to the live voice while listening + speaking — without a
//                   React re-render per tick.
//
// State legibility (UX goal): the three live states read very differently —
//   listening  → music particles flow INWARD (you → Krishna); ring brightens.
//   thinking   → particles ORBIT the orb, cooler cast + a rotating sweep —
//                the cue that listening has STOPPED.
//   speaking   → gold sonar rings + particles burst OUTWARD (Krishna → you).
//
// Keyframes are global (globals.css night block: night-orb-* + ribbon-*);
// per-state usage + the reduced-motion off-switch are scoped to `.dvn`
// here (state still reads by COLOR with motion reduced).

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

const PARTICLE_STATES: AgentOrbState[] = [
  "disconnected",
  "connecting",
  "listening",
  "thinking",
  "speaking",
];

const DOT: Record<string, string> = {
  cyan: "radial-gradient(circle at 30% 30%, oklch(95% 0.04 220), oklch(75% 0.15 220))",
  rose: "radial-gradient(circle at 30% 30%, oklch(95% 0.04 12), oklch(75% 0.14 12))",
  gold: "radial-gradient(circle at 30% 30%, oklch(96% 0.05 80), oklch(78% 0.16 80))",
};

// Endpoints + per-state animation for the luminous music particles.
function buildParticles(state: AgentOrbState) {
  const count = state === "speaking" ? 12 : state === "thinking" ? 9 : 8;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    const r = state === "thinking" ? 64 : 130 + (i % 3) * 30;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * 0.7 - (state === "listening" ? 40 : 0);
    const hue = i % 3 === 0 ? "cyan" : i % 3 === 1 ? "rose" : "gold";
    const delay = (i * 0.18).toFixed(2);
    let animation: string;
    if (state === "thinking") {
      animation = `ribbon-swirl ${(3.5 + (i % 3) * 0.6).toFixed(2)}s linear ${delay}s infinite`;
    } else if (state === "speaking") {
      animation = `ribbon-flow-in 2.4s ease-out ${delay}s infinite`;
    } else {
      // listening / connecting / disconnected — particles flow inward
      animation = `ribbon-flow-out ${state === "disconnected" ? 6 : 3.2}s ease-in ${delay}s infinite`;
    }
    return {
      i,
      size: 6 + (i % 3) * 2,
      hue,
      animation,
      opacity: state === "disconnected" ? 0.4 : 1,
      px: `${x.toFixed(1)}px`,
      py: `${y.toFixed(1)}px`,
    };
  });
}

const AgentOrb = forwardRef<
  HTMLDivElement,
  { state: AgentOrbState; amplitude?: number }
>(function AgentOrb({ state, amplitude = 0 }, ref) {
  const particles = PARTICLE_STATES.includes(state)
    ? buildParticles(state)
    : [];

  return (
    <div
      ref={ref}
      role="img"
      aria-label={ARIA_LABEL[state]}
      data-state={state}
      style={{ "--orb-amp": amplitude } as CSSProperties}
      className="dvn relative select-none"
    >
      {/* Music particles — drift behaviour set per state. */}
      {particles.length > 0 && (
        <div aria-hidden className="dvn__particles">
          {particles.map((p) => (
            <span
              key={p.i}
              className="dvn__p"
              style={
                {
                  width: p.size,
                  height: p.size,
                  background: DOT[p.hue],
                  opacity: p.opacity,
                  animation: p.animation,
                  "--p-x": p.px,
                  "--p-y": p.py,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}

      {/* Outer luminous glow. */}
      <span aria-hidden className="dvn__glow" />

      {/* Radiating gold sonar rings — speaking only (shown via CSS). */}
      <span aria-hidden className="dvn__sonar dvn__sonar--1" />
      <span aria-hidden className="dvn__sonar dvn__sonar--2" />

      {/* Nebula core. */}
      <span aria-hidden className="dvn__core" />

      {/* Rotating processing sweep — thinking only (shown via CSS). */}
      <span aria-hidden className="dvn__sweep" />

      {/* Gold-leaf ring (glow reacts to amplitude while listening/speaking). */}
      <span aria-hidden className="dvn__ring" />

      {/* Error glyph overlay. */}
      {state === "error" && (
        <span aria-hidden className="dvn__warn">
          ⚠️
        </span>
      )}

      <style>{ORB_CSS}</style>
    </div>
  );
});

export default AgentOrb;

// Scoped to `.dvn`. Keyframes (night-orb-* + ribbon-*) live in globals.css.
const ORB_CSS = `
.dvn {
  width: clamp(150px, 50vw, 240px);
  width: min(clamp(150px, 50vw, 240px), 40svh); /* shrinks on short viewports */
  aspect-ratio: 1 / 1;
  border-radius: 9999px;
  isolation: isolate;
  transition: transform .3s ease;
}
.dvn[data-state="speaking"] { transform: scale(calc(1 + var(--orb-amp, 0) * 0.04)); }
.dvn[data-state="thinking"]  { transform: scale(0.97); }

/* ── music particles ────────────────────────────────────────────────── */
.dvn__particles { position: absolute; inset: 0; pointer-events: none; z-index: 4; }
.dvn__p {
  position: absolute; top: 50%; left: 50%;
  border-radius: 9999px;
  box-shadow: 0 0 12px oklch(90% 0.1 220 / .7);
  transform-origin: center;
}

/* ── outer glow ─────────────────────────────────────────────────────── */
.dvn__glow {
  position: absolute; inset: -10px; border-radius: 9999px;
  background: radial-gradient(circle, oklch(75% 0.18 220 / .35) 0%, transparent 65%);
  animation: night-orb-pulse 4.5s ease-in-out infinite;
}
.dvn[data-state="listening"] .dvn__glow { animation-duration: 2s; }
.dvn[data-state="speaking"]  .dvn__glow { animation-duration: 1.4s; }
.dvn[data-state="error"]     .dvn__glow { filter: saturate(0.4); }

/* ── nebula core ────────────────────────────────────────────────────── */
.dvn__core {
  position: absolute; inset: 4px; border-radius: 9999px; overflow: hidden;
  background:
    radial-gradient(circle at 38% 30%, oklch(98% 0.02 80 / .75) 0%, transparent 35%),
    radial-gradient(circle at 65% 65%, oklch(72% 0.16 280 / .8) 0%, transparent 55%),
    radial-gradient(circle at 30% 70%, oklch(78% 0.14 220 / .85) 0%, transparent 55%),
    conic-gradient(from 220deg, oklch(40% 0.1 240), oklch(35% 0.12 290), oklch(45% 0.08 220), oklch(40% 0.1 240));
  box-shadow: inset 0 2px 20px rgba(255,255,255,.45), inset 0 -10px 30px oklch(20% 0.1 280 / .6);
  animation: night-orb-drift 16s linear infinite;
}
.dvn[data-state="thinking"] .dvn__core { filter: saturate(0.85) hue-rotate(15deg); animation-duration: 7s; }
.dvn[data-state="error"]    .dvn__core { filter: saturate(0.4) brightness(0.7); }

/* ── rotating processing sweep (thinking) ───────────────────────────── */
.dvn__sweep {
  position: absolute; inset: -2px; border-radius: 9999px; opacity: 0;
  background: conic-gradient(from 0deg,
    transparent 0deg, oklch(80% 0.13 305 / .8) 60deg, transparent 150deg,
    oklch(75% 0.14 220 / .7) 240deg, transparent 360deg);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px));
}
.dvn[data-state="thinking"] .dvn__sweep { opacity: 1; animation: night-orb-spin 2.2s linear infinite; }

/* ── gold-leaf ring ─────────────────────────────────────────────────── */
.dvn__ring {
  position: absolute; inset: 0; border-radius: 9999px; z-index: 5;
  border: 1.5px solid oklch(76% 0.12 80 / .6);
  box-shadow: 0 0 14px oklch(76% 0.12 80 / .3);
  transition: border-color .3s ease, box-shadow .16s ease, border-width .3s ease;
}
.dvn[data-state="listening"] .dvn__ring,
.dvn[data-state="speaking"]  .dvn__ring {
  border-width: 2.5px;
  border-color: oklch(82% 0.12 80 / calc(.55 + var(--orb-amp, 0) * 0.4));
  box-shadow: 0 0 calc(10px + var(--orb-amp, 0) * 36px) oklch(76% 0.14 80 / .55);
}
.dvn[data-state="error"] .dvn__ring { border-color: oklch(53% 0.19 28 / .6); }

/* ── radiating sonar rings (speaking) ───────────────────────────────── */
.dvn__sonar {
  position: absolute; inset: 0; border-radius: 9999px; opacity: 0; z-index: 5;
  border: 2px solid oklch(80% 0.13 220 / .5);
}
.dvn[data-state="speaking"] .dvn__sonar { animation: night-orb-sonar 1.8s ease-out infinite; }
.dvn[data-state="speaking"] .dvn__sonar--2 { animation-delay: .9s; }

/* ── error glyph ────────────────────────────────────────────────────── */
.dvn__warn {
  position: absolute; left: 50%; top: 50%; z-index: 6;
  transform: translate(-50%, -50%); font-size: clamp(28px, 9vw, 40px); line-height: 1;
}

/* ── reduced motion: drop drift/pulse/sonar/sweep/particles + scale; keep
   COLOR so each state still reads. The thinking sweep stays as a static
   arc. ──────────────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .dvn__p,
  .dvn__glow,
  .dvn__sonar,
  .dvn__sweep,
  .dvn__core {
    animation: none !important;
  }
  .dvn[data-state="speaking"],
  .dvn[data-state="thinking"] { transform: none !important; }
  .dvn[data-state="thinking"] .dvn__sweep { opacity: 1; }
  /* particles at rest would clump at the centre — hide them with motion off */
  .dvn__p { opacity: 0 !important; }
}
`;
