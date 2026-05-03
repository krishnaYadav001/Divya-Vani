// Eight-petal lotus mandala (कमल यंत्र) — sacred-geometry watermark.
// Used as low-opacity background motif on the chat page (≤ 8%):
// devotional symbology without competing with content. Eight petals
// is the Vedic/Tantric standard (अष्टदल कमल).

type Props = {
  className?: string;
  title?: string;
};

export default function LotusMandala({ className, title }: Props) {
  const decorative = title === undefined;
  // Generate 8 petals at 45° intervals around centre.
  const petals = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * 360) / 8;
    return (
      <path
        key={i}
        d="M 100 100 Q 110 70, 100 30 Q 90 70, 100 100 Z"
        transform={`rotate(${angle} 100 100)`}
        fill="currentColor"
        fillOpacity="0.45"
        stroke="currentColor"
        strokeWidth="0.6"
      />
    );
  });

  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
    >
      {!decorative && <title>{title}</title>}
      {/* Outer guide ring */}
      <circle
        cx="100"
        cy="100"
        r="92"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeOpacity="0.5"
      />
      {/* Petals */}
      <g>{petals}</g>
      {/* Inner ring */}
      <circle
        cx="100"
        cy="100"
        r="22"
        fill="currentColor"
        fillOpacity="0.25"
        stroke="currentColor"
        strokeWidth="0.6"
      />
      {/* Bindu (centre point) */}
      <circle cx="100" cy="100" r="3" fill="currentColor" />
    </svg>
  );
}
