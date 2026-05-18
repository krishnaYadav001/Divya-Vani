"use client";

import { useState } from "react";
import type { VerseCitation } from "@/lib/messages";
import {
  SOURCE_BADGE_CLASSES,
  SOURCE_BADGE_LABEL,
} from "@/lib/designTokens";
import {
  formatReferenceLabel,
  tryParseReference,
} from "@/lib/referenceParser";

// VerseCardList + VerseCard — Dawn Aarti rebuild (2026-05-18) to the
// handoff verse-leaf mock (dawn-chat.jsx → ChatVerse): a tone-tinted
// collapsed chip ("GITA 2.14 ↓") that inflates into a paper "leaf" —
// label small-caps + sindoor dot, Sanskrit (Tiro), hairline,
// transliteration, Hindi gloss, English italic, then a "TAP TO
// COLLAPSE" row. ALL behaviour preserved (expand state, reference
// parsing, per-source badge, lang routing, empty-Sanskrit caveat) —
// only presentational classes changed. The mock's SAVE / SHARE
// affordances have no backend in this app and are intentionally NOT
// rendered as dead controls.

export function VerseCardList({
  verses,
  lang,
}: {
  verses: VerseCitation[];
  lang: "hi" | "en";
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {verses.map((v) => (
        <VerseCard key={v.reference} verse={v} lang={lang} />
      ))}
    </div>
  );
}

function VerseCard({
  verse,
  lang,
}: {
  verse: VerseCitation;
  lang: "hi" | "en";
}) {
  const [expanded, setExpanded] = useState(false);
  const parsed = tryParseReference(verse.reference);
  const source = parsed?.source ?? null;
  const label = parsed
    ? formatReferenceLabel(parsed, lang)
    : verse.reference;
  const badgeClasses = source ? SOURCE_BADGE_CLASSES[source] : "";
  const badgeText = source ? SOURCE_BADGE_LABEL[source].short[lang] : "";
  const ariaLabel = source ? SOURCE_BADGE_LABEL[source].aria : "Verse";
  const hasSanskrit = verse.sanskrit.trim().length > 0;
  const hiFont = "font-[family-name:var(--font-devanagari)]";
  const enFont = "font-[family-name:var(--font-serif)]";
  const footerCaveat =
    lang === "hi"
      ? "संस्कृत संरेखण: फेज 9+ ऑडिट लंबित"
      : "Sanskrit alignment: Phase 9+ audit pending";

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        aria-label={`${ariaLabel}: ${label}`}
        className={
          "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs tracking-[0.06em] shadow-[0_1px_2px_oklch(40%_0.04_30_/_0.08)] transition-transform hover:-translate-y-0.5 " +
          (badgeClasses || "border-[oklch(86%_0.04_70)] bg-white/70 text-ink")
        }
      >
        <span
          className={`uppercase ${lang === "hi" ? hiFont : enFont} ${
            lang === "hi" ? "" : "not-italic"
          }`}
        >
          {label}
        </span>
        <span aria-hidden className="text-ink-faint">
          ↓
        </span>
      </button>
    );
  }

  return (
    <div className="mt-1 w-full overflow-hidden rounded-xl border border-[oklch(86%_0.04_70)] bg-linear-to-b from-[oklch(98%_0.012_80)] to-[oklch(95%_0.025_60)] shadow-[0_1px_3px_oklch(40%_0.04_30_/_0.06)]">
      {/* Gold hairline at the very top of the leaf */}
      <div
        aria-hidden
        className="h-px w-full bg-linear-to-r from-transparent via-[oklch(76%_0.12_80_/_0.5)] to-transparent"
      />
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <p
            className={`font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.28em] text-ink-soft ${
              lang === "hi" ? hiFont : ""
            }`}
            aria-label={ariaLabel}
          >
            {badgeText ? `${badgeText} · ` : ""}
            {label}
          </p>
          <span
            aria-hidden
            className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 35% 35%, oklch(60% 0.2 30), oklch(45% 0.18 25))",
            }}
          />
        </div>

        <div className="mt-3 space-y-3 leading-relaxed">
          {hasSanskrit && (
            <p
              className={`whitespace-pre-wrap ${hiFont} text-[15px] leading-[1.7] text-ink`}
            >
              {verse.sanskrit}
            </p>
          )}
          {hasSanskrit && verse.transliteration && (
            <p
              className={`whitespace-pre-wrap border-t border-[oklch(88%_0.03_70)] pt-3 ${enFont} text-xs italic text-ink-faint`}
            >
              {verse.transliteration}
            </p>
          )}
          <p
            className={`whitespace-pre-wrap ${hiFont} text-[13px] leading-[1.7] text-ink`}
          >
            {verse.hindi}
          </p>
          <p
            className={`whitespace-pre-wrap ${enFont} text-sm italic leading-relaxed text-ink-soft`}
          >
            {verse.english}
          </p>
        </div>

        {!hasSanskrit && (
          <p
            className={`mt-3 border-t border-[oklch(88%_0.03_70)] pt-2 text-[11px] italic text-ink-faint ${
              lang === "hi" ? hiFont : enFont
            }`}
          >
            {footerCaveat}
          </p>
        )}

        <div className="mt-4 border-t border-[oklch(88%_0.03_70)] pt-3">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-expanded={true}
            aria-label="Collapse verse"
            className="inline-flex min-h-8 items-center gap-1.5 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.24em] text-ink-faint transition-colors hover:text-ink"
          >
            <span aria-hidden>↑</span> Tap to collapse
          </button>
        </div>
      </div>
    </div>
  );
}
