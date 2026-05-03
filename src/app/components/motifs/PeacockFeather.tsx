// Peacock feather (मोरपंख) — Krishna's most universally recognized
// devotional symbol. Founder-supplied photographic asset at
// public/krishna-peacock-feather.png (500×500, ~72 KB, transparent
// PNG). Was inline SVG until 2026-05-03; switched to a real
// photograph for richer header presence.
//
// Performance: served via Next/Image, which auto-converts to
// WebP/AVIF, generates responsive srcSets, and lazy-loads
// non-priority instances. Pass priority={true} only above the fold
// (the chat-page header) — Next preloads priority images and skips
// lazy-loading them.
//
// Accessibility: aria-hidden by default — Krishna's name in
// adjacent text already carries semantic identity for screen
// readers, so the feather is decorative-only. Pass `title` to
// switch to a non-decorative <Image alt={title}> rendering for
// the design-system reference page.
//
// Sister motifs (Bansuri, LotusMandala) intentionally remain
// inline SVG — performance discipline keeps raster only where
// the founder explicitly opted in.

import Image from 'next/image';

type Props = {
  className?: string;
  /** Provide for non-decorative renderings (e.g. design-system
   *  catalog). Omit for header / decorative use → aria-hidden. */
  title?: string;
  /** Intrinsic width Next/Image reserves for layout. Defaults to
   *  96 — covers the design-system "medium" + "large" cases.
   *  CSS className still controls visual rendered size. */
  width?: number;
  /** Intrinsic height. Mirror of width for the 1:1 source asset. */
  height?: number;
  /** Set true above the fold (header). Tells Next to preload and
   *  skip lazy-loading. */
  priority?: boolean;
};

export default function PeacockFeather({
  className,
  title,
  width = 96,
  height = 96,
  priority = false,
}: Props) {
  const decorative = title === undefined;
  return (
    <Image
      src="/krishna-peacock-feather.png"
      alt={title ?? ''}
      aria-hidden={decorative}
      width={width}
      height={height}
      priority={priority}
      className={className}
    />
  );
}
