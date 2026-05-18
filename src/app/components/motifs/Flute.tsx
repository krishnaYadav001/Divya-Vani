// Flute / bansuri (बांसुरी) — Dawn Aarti redesign (2026-05-18).
// Inline painted SVG ported from the handoff (dawn-motifs.jsx →
// Flute). New component (the Phase 2.5 `Bansuri` stays for surfaces
// not yet migrated). Decorative by default; pass `title` to label it.
//
// `className` controls rendered size (the SVG is a 10:1 ribbon —
// pair with e.g. `h-10 w-auto` or `w-56 h-auto`).

type Props = {
  className?: string;
  title?: string;
};

export default function Flute({ className, title }: Props) {
  const decorative = title === undefined;
  return (
    <svg
      viewBox="0 0 400 40"
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
    >
      {!decorative && <title>{title}</title>}
      <defs>
        <linearGradient id="dv-bansuri" x1="0" x2="1">
          <stop offset="0%" stopColor="oklch(72% 0.08 70)" />
          <stop offset="50%" stopColor="oklch(78% 0.1 80)" />
          <stop offset="100%" stopColor="oklch(65% 0.07 60)" />
        </linearGradient>
      </defs>
      <rect x="6" y="13" width="388" height="14" rx="7" fill="url(#dv-bansuri)" />
      <rect
        x="6"
        y="13"
        width="388"
        height="3"
        rx="2"
        fill="oklch(95% 0.04 80 / 0.7)"
      />
      {[60, 110, 145, 175, 205, 235, 270].map((cx) => (
        <circle key={cx} cx={cx} cy="20" r="2.6" fill="oklch(30% 0.04 50)" />
      ))}
      <circle cx="6" cy="20" r="6" fill="oklch(55% 0.06 50)" />
      <circle cx="394" cy="20" r="6" fill="oklch(55% 0.06 50)" />
    </svg>
  );
}
