// Devotee silhouettes — Dawn Aarti redesign (2026-05-18).
// A quiet crowd-row that anchors the landing baseline (a gathered
// sangat before the mūrti). Ported from the handoff (dawn-motifs.jsx
// → DevoteeSilhouettes). Decorative; absolutely pinned to the bottom
// of its positioned ancestor by default.

type Props = {
  height?: number;
  opacity?: number;
  className?: string;
};

export default function DevoteeSilhouettes({
  height = 120,
  opacity = 0.32,
  className,
}: Props) {
  return (
    <svg
      viewBox="0 0 1440 120"
      width="100%"
      height={height}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      className={`pointer-events-none absolute bottom-0 left-0 ${
        className ?? ""
      }`}
      style={{ opacity }}
    >
      <defs>
        <linearGradient id="dv-silh" x1="0" x2="0" y1="0" y2="1">
          <stop
            offset="0%"
            stopColor="oklch(55% 0.04 280)"
            stopOpacity="0.55"
          />
          <stop
            offset="100%"
            stopColor="oklch(35% 0.04 280)"
            stopOpacity="0.85"
          />
        </linearGradient>
      </defs>
      {Array.from({ length: 28 }).map((_, i) => {
        const x = (i / 28) * 1440 + ((i % 3) - 1) * 12;
        const h = 70 + ((i * 13) % 30);
        const w = 28 + ((i * 7) % 14);
        return (
          <g key={i} fill="url(#dv-silh)">
            <ellipse cx={x} cy={120 - h + 12} rx={w * 0.32} ry={w * 0.32} />
            <path
              d={`M ${x - w / 2} 120 Q ${x - w / 2} ${120 - h * 0.7} ${
                x - w / 3
              } ${120 - h * 0.9} L ${x + w / 3} ${120 - h * 0.9} Q ${
                x + w / 2
              } ${120 - h * 0.7} ${x + w / 2} 120 Z`}
            />
          </g>
        );
      })}
    </svg>
  );
}
