// Lotus mandala (कमल यंत्र) — Dawn Aarti redesign (2026-05-18).
// Inline SVG ported from the handoff (dawn-motifs.jsx → LotusMandala):
// a 12-petal outer ring + 8-petal inner ring + gold-leaf seed.
// Replaces the Phase 2.5 currentColor line-mandala; used as the chat
// empty-state ornament (via LotusBackground) + design-system page.
//
// Prop-compatible with the prior component (`className`, `title`) so
// existing consumers keep type-checking. Decorative (aria-hidden) by
// default; pass `title` for a labelled rendering.

type Props = {
  className?: string;
  title?: string;
};

export default function LotusMandala({ className, title }: Props) {
  const decorative = title === undefined;
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
    >
      {!decorative && <title>{title}</title>}
      <g
        transform="translate(50 50)"
        fill="none"
        stroke="oklch(70% 0.1 80)"
        strokeWidth="0.6"
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <ellipse
            key={i}
            cx="0"
            cy="-22"
            rx="6"
            ry="22"
            transform={`rotate(${i * 30})`}
          />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <ellipse
            key={i}
            cx="0"
            cy="-12"
            rx="3"
            ry="12"
            transform={`rotate(${i * 45 + 22.5})`}
            fill="oklch(85% 0.06 80 / 0.4)"
          />
        ))}
        <circle cx="0" cy="0" r="4" fill="oklch(60% 0.15 30)" stroke="none" />
        <circle cx="0" cy="0" r="1.5" fill="oklch(95% 0.04 80)" stroke="none" />
      </g>
    </svg>
  );
}
