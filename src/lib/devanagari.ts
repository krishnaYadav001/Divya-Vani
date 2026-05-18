// Dawn Aarti — per-string script detection for mixed Hindi/English
// chips, labels, and quotes. Codified here (handoff edge case) so the
// font-branching rule isn't reinvented at every call site.
//
// Distinct from detectLang.ts: that classifies a whole user message
// 'hi' | 'en' by Devanagari *dominance* (>30%) for verse-card label
// routing. This is a presentational "does this string contain ANY
// Devanagari → render it in Tiro" test for chip/label typography.

const DEVANAGARI = /[ऀ-ॿ]/;

/** True if the string contains any Devanagari (U+0900–U+097F). */
export function hasDevanagari(s: string): boolean {
  return DEVANAGARI.test(s);
}

/**
 * Tailwind font-family class for a mixed-script string: Tiro
 * Devanagari Hindi for any Devanagari content, else Cormorant
 * Garamond italic (the English body face). Pair with an explicit
 * `leading-*` at call sites that stack matras (handoff: Devanagari
 * needs line-height ≥ 1.55).
 */
export function scriptFontClass(s: string): string {
  return hasDevanagari(s)
    ? "font-[family-name:var(--font-devanagari)]"
    : "font-[family-name:var(--font-serif)] italic";
}
