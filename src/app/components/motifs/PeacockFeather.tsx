// Peacock feather (मोरपंख) — Dawn Aarti redesign (2026-05-18).
// Replaces the photographic PNG wrapper with an inline painted SVG
// (handoff dawn-motifs.jsx → PeacockFeather). The PNG asset stays in
// public/ for surfaces that still want the photograph.
//
// Backward-compatible props: width/height/priority were used by the
// old next/image rendering and are kept in the type so existing
// callers (ChatUI header, design-system) keep type-checking; they are
// no-ops for the SVG (size is controlled by `className`). Decorative
// (aria-hidden) by default; pass `title` for a labelled rendering.

type Props = {
  className?: string;
  title?: string;
  /** Legacy next/image props — accepted for call-site compatibility,
   *  ignored by the SVG (size comes from className). */
  width?: number;
  height?: number;
  priority?: boolean;
};

export default function PeacockFeather({ className, title }: Props) {
  const decorative = title === undefined;
  return (
    <svg
      viewBox="0 0 200 600"
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={title}
    >
      <defs>
        <radialGradient id="dv-peacock-eye" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="oklch(35% 0.13 80)" />
          <stop offset="40%" stopColor="oklch(40% 0.15 200)" />
          <stop offset="70%" stopColor="oklch(55% 0.13 200)" />
          <stop offset="100%" stopColor="oklch(75% 0.08 130)" />
        </radialGradient>
        <linearGradient id="dv-peacock-stem" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(60% 0.05 110)" />
          <stop offset="100%" stopColor="oklch(75% 0.08 90)" />
        </linearGradient>
      </defs>
      <line
        x1="100"
        y1="160"
        x2="100"
        y2="590"
        stroke="url(#dv-peacock-stem)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {Array.from({ length: 80 }).map((_, i) => {
        const y = 165 + i * 5;
        const len = 28 + Math.sin(i * 0.3) * 8;
        return (
          <g key={i}>
            <line
              x1="100"
              y1={y}
              x2={100 - len}
              y2={y + 12}
              stroke="oklch(58% 0.13 130)"
              strokeWidth="0.7"
              opacity="0.55"
            />
            <line
              x1="100"
              y1={y}
              x2={100 + len}
              y2={y + 12}
              stroke="oklch(58% 0.13 130)"
              strokeWidth="0.7"
              opacity="0.55"
            />
          </g>
        );
      })}
      <ellipse cx="100" cy="100" rx="55" ry="78" fill="url(#dv-peacock-eye)" />
      <ellipse cx="100" cy="100" rx="40" ry="58" fill="oklch(60% 0.16 220)" />
      <ellipse cx="100" cy="95" rx="22" ry="36" fill="oklch(35% 0.14 240)" />
      <ellipse cx="100" cy="92" rx="11" ry="20" fill="oklch(25% 0.08 280)" />
      <ellipse cx="92" cy="80" rx="4" ry="8" fill="oklch(90% 0.08 90 / 0.6)" />
    </svg>
  );
}
