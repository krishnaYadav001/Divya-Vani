// Diya (दीया) — Dawn Aarti redesign (2026-05-18).
// Tiny painted oil-lamp with a softly breathing flame. Ported from
// the handoff (dawn-seva.jsx → Diya); used in the sevā tier cards.
// The flame + glow breathe via the `breathe` keyframe (globals.css);
// reduced-motion disables it there. Decorative (aria-hidden).
//
// `tone="peacock"` switches the lamp body to the light fill used on
// the dark peacock-tinted card; default is the warm pastel fill.

type Props = {
  tone?: "peacock" | "warm";
  className?: string;
};

export default function Diya({ tone = "warm", className }: Props) {
  const isDark = tone === "peacock";
  const baseFill = isDark ? "oklch(96% 0.02 60)" : "oklch(50% 0.06 30)";
  const rimFill = isDark ? "oklch(94% 0.04 80)" : "oklch(60% 0.08 30)";
  const wickFill = isDark ? "oklch(94% 0.04 80)" : "oklch(35% 0.06 30)";
  const fid = `dv-flame-${tone}`;
  const gid = `dv-glow-${tone}`;
  return (
    <svg
      viewBox="0 0 200 130"
      className={className}
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={fid} cx="50%" cy="80%" r="60%">
          <stop offset="0%" stopColor="oklch(95% 0.05 80)" />
          <stop offset="40%" stopColor="oklch(80% 0.18 70)" />
          <stop offset="80%" stopColor="oklch(60% 0.2 40)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="oklch(60% 0.2 40)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={gid} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="oklch(95% 0.1 80 / 0.6)" />
          <stop offset="100%" stopColor="oklch(95% 0.1 80 / 0)" />
        </radialGradient>
      </defs>
      <ellipse
        cx="100"
        cy="60"
        rx="80"
        ry="50"
        fill={`url(#${gid})`}
        className="dawn-breathe"
        style={{ transformOrigin: "100px 60px", animationDuration: "3.4s" }}
      />
      <path
        d="M 50 105 Q 100 95 150 105 L 140 120 Q 100 128 60 120 Z"
        fill={baseFill}
        opacity="0.85"
      />
      <ellipse cx="100" cy="103" rx="50" ry="5" fill={rimFill} opacity="0.7" />
      <rect x="98" y="80" width="4" height="22" fill={wickFill} />
      <g
        className="dawn-breathe"
        style={{ transformOrigin: "100px 80px" }}
      >
        <path d="M 100 30 Q 90 60 100 82 Q 110 60 100 30 Z" fill={`url(#${fid})`} />
        <ellipse cx="100" cy="72" rx="5" ry="10" fill="oklch(95% 0.05 80)" />
      </g>
    </svg>
  );
}
