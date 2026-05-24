// Ambient night starfield for /voice — quiet twinkles + two slow
// meteors, ported from the Dawn Aarti handoff (dawn-voice.jsx →
// StarField). The voice page is the night counterpart of the Dawn
// pastel system; this is its z-0 atmosphere.
//
// Positions are DETERMINISTIC (a sine-seeded PRNG) so the server and
// client render byte-identical markup — no hydration mismatch, and the
// field never reshuffles between renders. Pure presentation, no hooks,
// CSS-only animation via the global .voice-star / .voice-meteor classes
// (both reduced-motion-aware in globals.css).

import type { CSSProperties } from "react";

type Props = { count?: number; meteors?: boolean; className?: string };

// Deterministic [0,1) — same seed every render.
function seeded(i: number): number {
  const x = Math.sin(2024 + i * 47.7) * 10000;
  return x - Math.floor(x);
}

export default function StarField({
  count = 64,
  meteors = true,
  className,
}: Props) {
  const stars = Array.from({ length: count }, (_, i) => ({
    left: seeded(i) * 100,
    top: seeded(i + 100) * 100,
    size: 1 + seeded(i + 200) * 2,
    delay: -(seeded(i + 300) * 6),
    dur: 3 + seeded(i + 400) * 4,
  }));

  const meteorStyle = (
    top: string,
    left: string,
    w: number,
    h: number,
    dur: string,
    delay: string,
  ): CSSProperties =>
    ({
      top,
      left,
      width: w,
      height: h,
      opacity: 0, // hidden at rest → invisible when reduced-motion stops the animation
      background:
        "linear-gradient(90deg, transparent, oklch(95% 0.05 80), transparent)",
      transform: "rotate(-25deg)",
      "--meteor-dur": dur,
      "--meteor-delay": delay,
    }) as CSSProperties;

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}
    >
      {stars.map((s, i) => (
        <span
          key={i}
          className="voice-star absolute rounded-full"
          style={
            {
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.size,
              height: s.size,
              background: "oklch(95% 0.03 80)",
              boxShadow: `0 0 ${s.size * 2}px oklch(85% 0.1 80 / .7)`,
              "--star-delay": `${s.delay}s`,
              "--star-dur": `${s.dur}s`,
            } as CSSProperties
          }
        />
      ))}
      {meteors && (
        <>
          <span
            className="voice-meteor absolute"
            style={meteorStyle("12%", "42%", 80, 1.5, "7s", "1s")}
          />
          <span
            className="voice-meteor absolute"
            style={meteorStyle("22%", "60%", 60, 1, "9s", "4s")}
          />
        </>
      )}
    </div>
  );
}
