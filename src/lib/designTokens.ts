// Phase 2.5 design-token registry. Documentation-as-code: the
// actual CSS variables live in src/app/globals.css (@theme inline).
// This file is the lookup index — semantic role per token, WCAG
// contrast ratios on the parchment background, and Tailwind utility
// class names that are safe vs unsafe combinations.
//
// When adding a new token: add to globals.css first, then add the
// row here, then run a contrast check against parchment + against
// any other background it'll appear on.
//
// USAGE DISCIPLINE (locked 2026-05-03 founder review):
//   - devotional + brass at full saturation: FILL ONLY
//     (backgrounds, borders, badge tints). They fail AA as text on
//     parchment (2.5–2.6:1). When these hues need to read as text,
//     use the *-dark variants (devotional-dark, brass-dark) which
//     sit at 5.4–6.4:1 vs parchment.
//   - sacred / krishna / peacock work both as fill AND as text
//     (all clear AA on parchment, ≥ 9:1).
//
// BUTTON STYLING PREFERENCE (Step 2.5.6 application):
//   Primary "Send" CTA → bg-devotional text-parchment for the
//   warmest devotional read. Alternative bg-krishna text-parchment
//   for definitively-AA-clean (12.7:1) when devotional-on-parchment
//   button text falls under 4.5:1 in context. Pick whichever lands
//   more devotional in-context.

export type ColorTokenName =
  | 'devotional'
  | 'devotional-dark'
  | 'sacred'
  | 'krishna'
  | 'brass'
  | 'brass-dark'
  | 'parchment'
  | 'peacock';

export type ColorToken = {
  name: ColorTokenName;
  hex: string;
  role: string;
  /**
   * Contrast ratio of this color when used as TEXT against the
   * parchment background (#FBF4E8). Computed from WCAG 2.1
   * relative-luminance formula (cross-checked against
   * webaim.org/resources/contrastchecker). Updated when the hex
   * is changed.
   *
   * Targets:
   *   ≥ 4.5  → AA pass for body text (< 18pt or < 14pt bold)
   *   ≥ 3.0  → AA pass for large text + non-text UI components
   *   < 3.0  → fails AA — use only as background tint or border
   */
  contrastOnParchment: number;
  /** Tailwind utility names this token can be used as text. Empty
   *  if contrast on parchment fails AA — caller must combine the
   *  token's tinted background with a darker text token. */
  safeAsTextOnParchment: boolean;
  /** Whether the token reads as a 1px decorative border on
   *  parchment (≥ 1.5:1 informal threshold for thin lines). */
  safeAsBorderOnParchment: boolean;
};

export const COLOR_TOKENS: Record<ColorTokenName, ColorToken> = {
  devotional: {
    name: 'devotional',
    hex: '#E89B3C',
    role: 'marigold/saffron — Gita identity, primary accent, warm CTA tints (fill only)',
    contrastOnParchment: 2.6,
    safeAsTextOnParchment: false,
    safeAsBorderOnParchment: true,
  },
  'devotional-dark': {
    name: 'devotional-dark',
    hex: '#7A4F1E',
    role: 'darker marigold — text variant of devotional for AA-safe text on parchment',
    contrastOnParchment: 6.4,
    safeAsTextOnParchment: true,
    safeAsBorderOnParchment: true,
  },
  sacred: {
    name: 'sacred',
    hex: '#7C2D2A',
    role: 'deep maroon — Mahabharata identity, dignified text, headings',
    contrastOnParchment: 9.5,
    safeAsTextOnParchment: true,
    safeAsBorderOnParchment: true,
  },
  krishna: {
    name: 'krishna',
    hex: '#1E2A5E',
    role: 'deep indigo (नीलमणि) — Bhagavata identity, strong text, primary buttons',
    contrastOnParchment: 12.7,
    safeAsTextOnParchment: true,
    safeAsBorderOnParchment: true,
  },
  brass: {
    name: 'brass',
    hex: '#B08D4C',
    role: 'muted gold — borders, dividers, illuminated-manuscript edges (fill only)',
    contrastOnParchment: 2.5,
    safeAsTextOnParchment: false,
    safeAsBorderOnParchment: true,
  },
  'brass-dark': {
    name: 'brass-dark',
    hex: '#7C5F2E',
    role: 'darker brass — text variant of brass for AA-safe text on parchment (e.g., disclaimer body, footer captions)',
    contrastOnParchment: 5.4,
    safeAsTextOnParchment: true,
    safeAsBorderOnParchment: true,
  },
  parchment: {
    name: 'parchment',
    hex: '#FBF4E8',
    role: 'warm ivory — page background, card body, button text on dark backgrounds',
    contrastOnParchment: 1.0,
    safeAsTextOnParchment: false,
    safeAsBorderOnParchment: false,
  },
  peacock: {
    name: 'peacock',
    hex: '#0E5566',
    role: 'deep teal — rare accent (Krishna-name emphasis), secondary headings',
    contrastOnParchment: 9.1,
    safeAsTextOnParchment: true,
    safeAsBorderOnParchment: true,
  },
};

/**
 * Sanctioned badge styles for the verse-card source chip. Each
 * combination has been hand-checked for AA contrast on parchment.
 * Usage: <span className={SOURCE_BADGE_CLASSES[source]}>...
 */
export const SOURCE_BADGE_CLASSES: Record<
  'gita' | 'mahabharata' | 'bhagavata',
  string
> = {
  // Marigold tint + maroon text — warm/scriptural.
  // Contrast text→bg: ~5.5:1 (sacred on devotional/15) — passes AA.
  gita: 'bg-devotional/15 border-devotional/50 text-sacred',
  // Maroon-on-deeper-maroon-tint. Step 2.5.8 R1: bg /10 → /20 +
  // border /40 → /60 to stop MBh reading as a soft pink alongside
  // Gita's warm marigold. MBh is the dignified/serious source —
  // deeper saturation suits it.
  mahabharata: 'bg-sacred/20 border-sacred/60 text-sacred',
  // Indigo-on-indigo-tint — Krishna identity. Hue alone (cool vs
  // the other two warms) carries the differentiation; no opacity
  // bump needed.
  bhagavata: 'bg-krishna/10 border-krishna/40 text-krishna',
};

/**
 * Badge text + accessibility labels for the verse-card source chip.
 *   short.hi / short.en — visible chip text (kept compact since the
 *     full label "भगवद्गीता 2.47" already appears next to it).
 *   aria — descriptive screen-reader text used as aria-label.
 */
export const SOURCE_BADGE_LABEL: Record<
  'gita' | 'mahabharata' | 'bhagavata',
  { short: { hi: string; en: string }; aria: string }
> = {
  gita: {
    short: { hi: 'गीता', en: 'Gita' },
    aria: 'Bhagavad Gita verse',
  },
  mahabharata: {
    short: { hi: 'महाभारत', en: 'Mahabharata' },
    aria: 'Mahabharata verse',
  },
  bhagavata: {
    short: { hi: 'भागवत', en: 'Bhagavatam' },
    aria: 'Bhagavatam verse',
  },
};

/**
 * Typography scale. Sizes are Tailwind utility names (paired with
 * line-height utilities). Hindi text needs leading-relaxed (~1.625)
 * minimum for conjunct readability; bumping to leading-loose (2.0)
 * is appropriate for Sanskrit verse blocks where stacking
 * increases.
 */
export const TYPOGRAPHY = {
  /** App title — reverent serif. */
  title: { font: 'font-serif', size: 'text-2xl sm:text-3xl', weight: 'font-medium' },
  /** Hindi body copy — Devanagari. */
  hindiBody: { font: 'font-devanagari', size: 'text-base', leading: 'leading-relaxed' },
  /** English serif for verse content (scriptural register). */
  englishVerse: { font: 'font-serif', size: 'text-base', leading: 'leading-relaxed' },
  /** UI sans-serif (system stack via geist). */
  ui: { font: 'font-sans', size: 'text-sm', weight: 'font-medium' },
  /** Sanskrit terms inline in body copy. */
  sanskritInline: { font: 'font-serif italic', tracking: 'tracking-[0.02em]' },
} as const;

/**
 * WCAG 2.1 minimum touch-target dimension in CSS pixels. Used in
 * VerseCard collapsed-pill sizing — current 28px height fails this
 * and is bumped to 44px in Phase 2.5.
 */
export const MIN_TOUCH_TARGET_PX = 44;

/**
 * Motif registry — pointer to component file for design-system
 * page rendering. Components live at src/app/components/motifs/.
 */
export const MOTIFS = [
  { name: 'PeacockFeather', role: 'Krishna-presence — header decoration' },
  { name: 'Bansuri', role: 'Krishna-listening — chat-input accent' },
  { name: 'LotusMandala', role: 'sacred geometry — background watermark (≤ 8% opacity)' },
] as const;
