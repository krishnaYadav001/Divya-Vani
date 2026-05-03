// Bansuri silhouette (बांसुरी) — Krishna's flute. Used as input-area
// accent: "Krishna is listening through this voice." Six-finger-hole
// transverse bamboo flute, the canonical North-Indian form.

type Props = {
  className?: string;
  title?: string;
};

export default function Bansuri({ className, title }: Props) {
  const decorative = title === undefined;
  return (
    <svg
      className={className}
      viewBox="0 0 80 16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
    >
      {!decorative && <title>{title}</title>}
      {/* Body of the flute — capsule shape */}
      <rect
        x="3"
        y="6"
        width="74"
        height="4.5"
        rx="2.25"
        ry="2.25"
        strokeWidth="1.1"
        fill="currentColor"
        fillOpacity="0.08"
      />
      {/* Mouthpiece (closed end, left) */}
      <line x1="9" y1="5.5" x2="9" y2="11" strokeWidth="0.9" />
      {/* Six finger holes evenly spaced toward the right half */}
      <circle cx="32" cy="8.25" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="40" cy="8.25" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="48" cy="8.25" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="56" cy="8.25" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="64" cy="8.25" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="72" cy="8.25" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
