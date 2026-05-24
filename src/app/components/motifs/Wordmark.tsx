// Wordmark — Dawn Aarti redesign (2026-05-18; mark added 2026-05-24).
// Bilingual logo: the Sudarshan Chakra brand mark + दिव्य वाणी (Tiro
// Devanagari) over / beside DIVYA VANI (Marcellus small-caps,
// wide-tracked). Ported from the handoff (logo/ + dawn-motifs.jsx →
// Wordmark). Sizes + stack direction match the prototype scale
// (sm/md/lg/xl; hi 22/36/72/112px, en 12/14/16/20px).
//
// The chakra mark (public/logo-mark-{light,dark}.svg) renders as a small
// decorative glyph (aria-hidden — the text already names the brand). Set
// `tone="dark"` for night surfaces (the /voice page) so the mark + text
// flip to ivory; default "light" suits the pastel headers. `showMark`
// can drop the glyph for text-only contexts.
//
// Renders as a semantic heading when `as="h1"` (landing); otherwise a
// plain div (header chrome). The Devanagari line is the primary brand
// mark; the Latin line is a quiet caption beneath/beside it.

import { BRAND } from "@/lib/brand";

type Size = "sm" | "md" | "lg" | "xl";

type Props = {
  size?: Size;
  stack?: "vertical" | "horizontal";
  as?: "div" | "h1";
  /** Show the chakra mark glyph. Default true. */
  showMark?: boolean;
  /** "light" for pastel surfaces, "dark" for night surfaces (ivory text). */
  tone?: "light" | "dark";
  className?: string;
};

const SIZES: Record<
  Size,
  { hi: string; en: string; gap: string; hGap: string; mark: number }
> = {
  sm: { hi: "text-[22px]", en: "text-[12px]", gap: "gap-0.5", hGap: "gap-2.5", mark: 28 },
  md: { hi: "text-[36px]", en: "text-[14px]", gap: "gap-1", hGap: "gap-2.5", mark: 40 },
  lg: { hi: "text-[72px]", en: "text-[16px]", gap: "gap-2", hGap: "gap-2.5", mark: 64 },
  xl: { hi: "text-[112px]", en: "text-[20px]", gap: "gap-3", hGap: "gap-2.5", mark: 92 },
};

export default function Wordmark({
  size = "lg",
  stack = "vertical",
  as = "div",
  showMark = true,
  tone = "light",
  className,
}: Props) {
  const s = SIZES[size];
  const Tag = as;
  const isDark = tone === "dark";

  const text = (
    <span
      className={`flex ${
        stack === "vertical"
          ? `flex-col items-center ${s.gap}`
          : `flex-row items-baseline ${s.hGap}`
      }`}
    >
      <span
        className={`font-[family-name:var(--font-devanagari)] leading-none tracking-[0.01em] ${
          isDark ? "text-[oklch(95%_0.025_70)]" : "text-ink"
        } ${s.hi}`}
      >
        {BRAND.name.hi}
      </span>
      <span
        className={`font-[family-name:var(--font-display)] uppercase tracking-[0.32em] ${
          isDark ? "text-[oklch(82%_0.025_70)]" : "text-ink-soft"
        } ${s.en}`}
      >
        {BRAND.name.en}
      </span>
    </span>
  );

  return (
    <Tag
      className={`flex ${
        stack === "vertical"
          ? `flex-col items-center ${s.gap}`
          : `flex-row items-center ${s.hGap}`
      } ${className ?? ""}`}
    >
      {showMark && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={isDark ? "/logo-mark-dark.svg" : "/logo-mark-light.svg"}
          alt=""
          aria-hidden="true"
          width={s.mark}
          height={s.mark}
          draggable={false}
          className="shrink-0 select-none"
          style={{ width: s.mark, height: s.mark }}
        />
      )}
      {text}
    </Tag>
  );
}
