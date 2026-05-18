// Peacock feather (मोरपंख) — Krishna's most universally recognized
// devotional symbol. Founder-supplied photographic asset at
// public/krishna-peacock-feather.png (500×500, ~72 KB, transparent
// PNG).
//
// Dawn Aarti note (2026-05-18): the Dawn redesign briefly swapped
// this to an inline SVG; the founder asked for the original painted
// photograph back (it reads correctly in the chat header where the
// SVG rendered as a thin sliver). Restored verbatim — prop-compatible
// (className / title / width / height / priority) so every caller is
// unaffected.
//
// Performance: served via Next/Image, which auto-converts to
// WebP/AVIF, generates responsive srcSets, and lazy-loads
// non-priority instances. Pass priority={true} only above the fold.
//
// Accessibility: aria-hidden by default — Krishna's name in adjacent
// text already carries semantic identity. Pass `title` for a
// non-decorative rendering.

import Image from "next/image";

type Props = {
  className?: string;
  title?: string;
  width?: number;
  height?: number;
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
      alt={title ?? ""}
      aria-hidden={decorative}
      width={width}
      height={height}
      priority={priority}
      className={className}
    />
  );
}
