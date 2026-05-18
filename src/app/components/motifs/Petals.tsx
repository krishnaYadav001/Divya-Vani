// Petals + sparkles — Dawn Aarti redesign (2026-05-18).
// The living atmospheric layer: rose/peach/lavender petals drifting
// down + gold sparkle motes twinkling in place. Ported from the
// handoff (dawn-motifs.jsx → Atmosphere/Petal/Sparkle).
//
// Positions use a deterministic seeded PRNG (same seed every render)
// so the layer is SSR-safe — server and client produce byte-identical
// markup, no hydration mismatch — and it doesn't reshuffle on
// re-render. All motion is CSS (`drift-down` / `twinkle` keyframes via
// the `.dawn-petal` / `.dawn-sparkle` helpers); reduced-motion is
// disabled globally in globals.css. Decorative + pointer-events-none.
//
// Used inside <Atmosphere>; `density` (0–100) scales petal/sparkle
// counts (handoff: 22 petals / 36 sparkles at density 100).

type Props = {
  density?: number;
  petals?: boolean;
  sparkles?: boolean;
  className?: string;
};

const PETAL_COLOR: Record<string, string> = {
  rose: "oklch(80% 0.10 12)",
  peach: "oklch(85% 0.09 50)",
  lavender: "oklch(78% 0.08 305)",
};

function seededItems(density: number, petals: boolean, sparkles: boolean) {
  const seed = 1337;
  const rand = (i: number) => {
    const x = Math.sin(seed + i * 99.1) * 10000;
    return x - Math.floor(x);
  };
  const out: Array<Record<string, number | string>> = [];
  if (petals) {
    const petalCount = Math.round((density / 100) * 22);
    for (let i = 0; i < petalCount; i++) {
      out.push({
        kind: "petal",
        left: rand(i) * 100,
        delay: rand(i + 11) * -22,
        duration: 18 + rand(i + 22) * 14,
        size: 8 + rand(i + 33) * 8,
        driftX: (rand(i + 44) - 0.5) * 140,
        driftD: 700 + rand(i + 55) * 400,
        rot: rand(i + 66) * 360,
        hue:
          rand(i + 77) > 0.5
            ? "rose"
            : rand(i + 88) > 0.5
              ? "peach"
              : "lavender",
      });
    }
  }
  if (sparkles) {
    const sparkleCount = Math.round((density / 100) * 36);
    for (let i = 0; i < sparkleCount; i++) {
      out.push({
        kind: "sparkle",
        left: rand(i + 100) * 100,
        top: rand(i + 200) * 100,
        delay: rand(i + 300) * -6,
        duration: 3 + rand(i + 400) * 4,
        size: 2 + rand(i + 500) * 3,
      });
    }
  }
  return out;
}

export default function Petals({
  density = 60,
  petals = true,
  sparkles = true,
  className,
}: Props) {
  const items = seededItems(density, petals, sparkles);
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${
        className ?? ""
      }`}
    >
      {items.map((it, idx) =>
        it.kind === "petal" ? (
          <div
            key={idx}
            className="dawn-petal absolute top-0"
            style={{
              left: `${it.left as number}%`,
              width: it.size as number,
              height: it.size as number,
              animationDuration: `${it.duration as number}s`,
              animationDelay: `${it.delay as number}s`,
              ["--drift-x" as string]: `${it.driftX as number}px`,
              ["--drift-d" as string]: `${it.driftD as number}px`,
              ["--drift-r" as string]: `${it.rot as number}deg`,
            }}
          >
            <svg viewBox="0 0 20 20" width="100%" height="100%">
              <path
                d="M10 1 C 16 4, 18 12, 10 19 C 2 12, 4 4, 10 1 Z"
                fill={PETAL_COLOR[it.hue as string]}
                opacity="0.85"
              />
              <path
                d="M10 4 C 12 8, 12 14, 10 18"
                stroke={PETAL_COLOR[it.hue as string]}
                strokeOpacity="0.5"
                strokeWidth="0.4"
                fill="none"
              />
            </svg>
          </div>
        ) : (
          <div
            key={idx}
            className="dawn-sparkle absolute rounded-full"
            style={{
              top: `${it.top as number}%`,
              left: `${it.left as number}%`,
              width: it.size as number,
              height: it.size as number,
              background: "oklch(94% 0.06 80)",
              boxShadow: `0 0 ${(it.size as number) * 2}px oklch(85% 0.12 80 / .8)`,
              animationDuration: `${it.duration as number}s`,
              animationDelay: `${it.delay as number}s`,
            }}
          />
        ),
      )}
    </div>
  );
}
