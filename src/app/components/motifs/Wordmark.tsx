// Wordmark — Dawn Aarti redesign (2026-05-18).
// Bilingual logo: दिव्य वाणी (Tiro Devanagari) over DIVYA VANI
// (Marcellus small-caps, wide-tracked). Ported from the handoff
// (dawn-motifs.jsx → Wordmark). Sizes + stack direction match the
// prototype scale (sm/md/lg/xl; hi 22/36/72/112px, en 12/14/16/20px).
//
// Renders as a semantic heading when `as="h1"` (landing); otherwise a
// plain div (header chrome). The Devanagari line is the primary
// brand mark; the Latin line is a quiet caption beneath/beside it.

import { BRAND } from "@/lib/brand";

type Size = "sm" | "md" | "lg" | "xl";

type Props = {
  size?: Size;
  stack?: "vertical" | "horizontal";
  as?: "div" | "h1";
  className?: string;
};

const SIZES: Record<
  Size,
  { hi: string; en: string; gap: string; hGap: string }
> = {
  sm: { hi: "text-[22px]", en: "text-[12px]", gap: "gap-0.5", hGap: "gap-2.5" },
  md: { hi: "text-[36px]", en: "text-[14px]", gap: "gap-1", hGap: "gap-2.5" },
  lg: { hi: "text-[72px]", en: "text-[16px]", gap: "gap-2", hGap: "gap-2.5" },
  xl: { hi: "text-[112px]", en: "text-[20px]", gap: "gap-3", hGap: "gap-2.5" },
};

export default function Wordmark({
  size = "lg",
  stack = "vertical",
  as = "div",
  className,
}: Props) {
  const s = SIZES[size];
  const Tag = as;
  return (
    <Tag
      className={`flex ${
        stack === "vertical"
          ? `flex-col items-center ${s.gap}`
          : `flex-row items-baseline ${s.hGap}`
      } ${className ?? ""}`}
    >
      <span
        className={`font-[family-name:var(--font-devanagari)] leading-none tracking-[0.01em] text-ink ${s.hi}`}
      >
        {BRAND.name.hi}
      </span>
      <span
        className={`font-[family-name:var(--font-display)] uppercase tracking-[0.32em] text-ink-soft ${s.en}`}
      >
        {BRAND.name.en}
      </span>
    </Tag>
  );
}
