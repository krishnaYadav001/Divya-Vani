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

// VerseCardList + VerseCard — extracted from ChatUI.tsx in Phase 2.5.
// Phase 2.5 deliverables on this surface:
//   2.5.3 — source-tinted pill (acts as the badge in collapsed view)
//           + explicit badge chip in expanded header
//           + 44px touch target on the collapsed pill (was 28px, failed AA)
//   2.5.4 — formatReferenceLabel + Hindi/English label per user lang
//           (parent ChatUI computes lang from the most recent user
//           message and threads it down through MessageCard)
//   2.5.5 — empty-Sanskrit handling: omit Sanskrit + transliteration
//           panes; append a brass-toned footer caveat noting the
//           Phase 9+ Sanskrit-alignment audit is still pending
//           (MBh + Bhagavata rows have sanskrit = '')

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
  const footerCaveat =
    lang === "hi"
      ? "संस्कृत संरेखण: फेज 9+ ऑडिट लंबित"
      : "Sanskrit alignment: Phase 9+ audit pending";

  if (!expanded) {
    // Collapsed pill IS the badge. Source-tinted background + border
    // doubles as visual identifier; min-h-11 + py-2 puts the touch
    // target above the WCAG 44px minimum (was 28px, failed AA).
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        aria-label={`${ariaLabel}: ${label}`}
        className={
          "inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 py-2 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:brightness-95 " +
          (badgeClasses || "border-zinc-200 bg-white text-zinc-700")
        }
      >
        <span aria-hidden>📖</span>
        <span className={lang === "hi" ? "font-devanagari" : "font-serif"}>
          {label}
        </span>
      </button>
    );
  }

  return (
    <div className="mt-1 w-full rounded-2xl border border-brass/40 bg-parchment px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {source && (
            <span
              className={
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                badgeClasses
              }
              aria-label={ariaLabel}
            >
              {badgeText}
            </span>
          )}
          <p
            className={
              "text-xs text-krishna/80 " +
              (lang === "hi" ? "font-devanagari" : "font-serif")
            }
          >
            {label}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-expanded={true}
          aria-label="Close verse"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm text-krishna/50 hover:bg-brass/10 hover:text-krishna"
        >
          ✕
        </button>
      </div>
      <div className="mt-2 space-y-2 leading-relaxed">
        {hasSanskrit && (
          <p className="whitespace-pre-wrap font-serif text-base text-krishna">
            {verse.sanskrit}
          </p>
        )}
        {hasSanskrit && verse.transliteration && (
          <p className="whitespace-pre-wrap text-xs italic text-krishna/60">
            {verse.transliteration}
          </p>
        )}
        <p className="whitespace-pre-wrap font-devanagari text-sm leading-relaxed text-krishna">
          {verse.hindi}
        </p>
        <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-krishna/80">
          {verse.english}
        </p>
      </div>
      {!hasSanskrit && (
        <p
          className={
            "mt-3 border-t border-brass/30 pt-2 text-[11px] italic text-brass-dark/90 " +
            (lang === "hi" ? "font-devanagari" : "font-serif")
          }
        >
          {footerCaveat}
        </p>
      )}
    </div>
  );
}
