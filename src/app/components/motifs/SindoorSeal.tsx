// Sindoor seal — Dawn Aarti redesign (2026-05-18).
// The vermillion stamp that signs identity-/trust-bearing surfaces
// (landing disclaimer, the privacy "what we never do" card). Ported
// from the handoff (dawn-styles.css → .seal): a domed vermillion
// disc with a dashed inner ring. Decorative by default; pass `title`
// for a labelled rendering (e.g. an accessibility-meaningful stamp).

type Props = {
  size?: number;
  className?: string;
  title?: string;
};

export default function SindoorSeal({ size = 56, className, title }: Props) {
  const decorative = title === undefined;
  const ring = Math.max(4, Math.round(size * 0.11));
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={title}
      className={`relative inline-block shrink-0 rounded-full ${
        className ?? ""
      }`}
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle at 35% 35%, oklch(60% 0.2 30) 0%, oklch(45% 0.18 25) 60%, oklch(35% 0.14 25) 100%)",
        boxShadow: "0 2px 8px -2px oklch(40% 0.18 25 / 0.4)",
      }}
    >
      <span
        aria-hidden="true"
        className="absolute rounded-full"
        style={{
          inset: ring,
          border: "1px dashed oklch(94% 0.03 60 / 0.6)",
        }}
      />
    </span>
  );
}
