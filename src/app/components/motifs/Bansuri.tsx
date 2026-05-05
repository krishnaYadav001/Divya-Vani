// Bansuri (बांसुरी) — Krishna's flute. Used as input-area accent:
// "Krishna is listening through this voice." Founder-supplied
// photographic asset at public/flute1.png (383×280, ~46 KB,
// transparent PNG) — bamboo flute with the canonical mor-pankh
// (peacock feather) tied at the mouthpiece and a small bead-tassel
// hanging below. Was inline SVG until 2026-05-05; switched to a
// real image so the peacock-feather attachment reads at a glance.
//
// Performance: served via Next/Image, which auto-converts to
// WebP/AVIF, generates responsive srcSets, and lazy-loads
// non-priority instances.
//
// Accessibility: aria-hidden by default — the input placeholder
// already conveys intent for screen readers, so the flute is
// decorative-only. Pass `title` to switch to a non-decorative
// <Image alt={title}> rendering for the design-system catalog.

import Image from 'next/image';

type Props = {
  className?: string;
  /** Provide for non-decorative renderings (e.g. design-system
   *  catalog). Omit for chat-input / decorative use → aria-hidden. */
  title?: string;
  /** Intrinsic width Next/Image reserves for layout. Defaults to
   *  the source asset's native 383px. CSS className still controls
   *  visual rendered size. */
  width?: number;
  /** Intrinsic height. Defaults to the source asset's native 280px. */
  height?: number;
  /** Set true above the fold. Tells Next to preload and skip
   *  lazy-loading. */
  priority?: boolean;
};

export default function Bansuri({
  className,
  title,
  width = 383,
  height = 280,
  priority = false,
}: Props) {
  const decorative = title === undefined;
  return (
    <Image
      src="/flute1.png"
      alt={title ?? ''}
      aria-hidden={decorative}
      width={width}
      height={height}
      priority={priority}
      className={className}
    />
  );
}
