// Diya (दीया) — clay-bowl oil lamp with flame, used as the trigger
// icon for the Diya Seva Panel in the chat header. Recognisable at
// 24px: tapered flame above an elliptical bowl on a small base.
// Single-colour via currentColor so consumers can tint via text-*
// classes (Phase 5.4 default: text-devotional warm-amber for "lit").
//
// Decorative-by-default. The Step F trigger button supplies its own
// aria-label ("Seva · सेवा"), so the icon is aria-hidden inside.
// Pass `title` for non-decorative use (e.g. design-system catalog).
//
// Out of scope (Phase 6+ polish): subtle flame-flicker animation.

type Props = {
  className?: string;
  title?: string;
};

export default function DiyaIcon({ className, title }: Props) {
  const decorative = title === undefined;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
    >
      {!decorative && <title>{title}</title>}
      {/* Flame — tapered teardrop */}
      <path
        d="M 12 14 Q 8 12, 9 9 Q 10 5, 12 4 Q 14 5, 15 9 Q 16 12, 12 14 Z"
        fill="currentColor"
      />
      {/* Bowl — flat ellipse */}
      <ellipse cx="12" cy="16.5" rx="8" ry="2.5" fill="currentColor" />
      {/* Foot — small trapezoid base */}
      <path
        d="M 9 19 L 15 19 L 13.5 21 L 10.5 21 Z"
        fill="currentColor"
        fillOpacity="0.6"
      />
    </svg>
  );
}
