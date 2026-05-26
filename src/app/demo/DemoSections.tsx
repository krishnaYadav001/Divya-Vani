"use client";

import { useState } from "react";
import { useLanguage } from "../providers/LanguageProvider";

// Tile for one /demo screenshot. Renders a plain <img> (NOT next/image)
// so a missing /public/demo/placeholder-N.png swaps to a soft "coming
// soon" frame via onError instead of throwing at build / hydration.
// next/image would either need width/height baked in or throw on a 404;
// the founder will add real screenshots later, and the page must keep
// rendering until then.

type ScreenshotTileProps = {
  src: string;
  altHi: string;
  altEn: string;
};

export function ScreenshotTile({
  src,
  altHi,
  altEn,
}: ScreenshotTileProps) {
  const { lang, t } = useLanguage();
  const [failed, setFailed] = useState(false);
  const alt = lang === "hi" ? altHi : altEn;

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-[oklch(86%_0.04_70)] bg-[var(--color-mist-2)] shadow-[0_8px_24px_-16px_oklch(40%_0.08_30_/_0.25)]"
      style={{ aspectRatio: "9 / 16" }}
    >
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-linear-to-br from-[var(--color-rose)] to-[var(--color-lavender)] px-3 text-center">
          <span aria-hidden className="text-base text-[var(--color-gold-leaf)]">
            ✦
          </span>
          <p
            className={`text-xs leading-relaxed text-ink ${
              lang === "hi"
                ? "font-[family-name:var(--font-devanagari)]"
                : "font-[family-name:var(--font-serif)] italic"
            }`}
          >
            {t.demo.comingSoon}
          </p>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          aria-label={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}
