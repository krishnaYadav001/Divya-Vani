"use client";

import { useState } from "react";
import { useLanguage } from "../providers/LanguageProvider";

// Lightweight YouTube embed: render a static thumbnail + play affordance,
// only mount the iframe on first click. youtube-nocookie.com defers all
// tracking cookies until the user actually presses play (privacy +
// keeps the page Lighthouse-fast / no 700KB iframe on initial paint).
// Placeholder IDs (anything starting with "PLACEHOLDER_ID_") render a
// "coming soon" tile instead of attempting an embed.

type Props = {
  id: string;
  titleHi: string;
  titleEn: string;
  short?: boolean;
};

function isPlaceholder(id: string) {
  return id.startsWith("PLACEHOLDER_ID_");
}

export default function YouTubeFacade({ id, titleHi, titleEn, short }: Props) {
  const { lang } = useLanguage();
  const [playing, setPlaying] = useState(false);
  const placeholder = isPlaceholder(id);
  const title = lang === "hi" ? titleHi : titleEn;
  const aspect = short ? "9 / 16" : "16 / 9";

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-[oklch(86%_0.04_70)] bg-[var(--color-mist-2)] shadow-[0_8px_24px_-16px_oklch(40%_0.08_30_/_0.25)]"
      style={{ aspectRatio: aspect }}
    >
      {placeholder ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-linear-to-br from-[var(--color-buttermilk)] to-[var(--color-peach)] px-4 text-center">
          <span
            aria-hidden
            className="text-lg text-[var(--color-gold-leaf)]"
          >
            ✦
          </span>
          <p
            className={`text-sm leading-relaxed text-ink ${
              lang === "hi"
                ? "font-[family-name:var(--font-devanagari)]"
                : "font-[family-name:var(--font-serif)] italic"
            }`}
          >
            {title}
          </p>
        </div>
      ) : playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`${title} — play`}
          className="group absolute inset-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)]"
        >
          <img
            src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span
            aria-hidden
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/85 shadow-[0_4px_14px_-4px_oklch(30%_0.05_30_/_0.4)] backdrop-blur transition-transform group-hover:scale-105"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="ml-0.5 h-6 w-6 text-[var(--color-vermillion)]"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}
