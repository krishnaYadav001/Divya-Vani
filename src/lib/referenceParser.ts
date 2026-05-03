// Phase 2.5 verse-reference parser. Converts the four reference
// formats produced by the corpus ingest scripts into a typed
// object that downstream UI can format. Parse-only — no display
// logic here (formatReferenceLabel lands in Step 2.5.2).
//
// Supported reference shapes:
//   - gita_<chapter>.<verse>            e.g. "gita_2.47"
//   - gita_<chapter>.<v1>_<v2>          e.g. "gita_18.78_79"  (split-verse form)
//   - mb_<parva>_<section>_<chunkN>     e.g. "mb_drona_38_1"
//                                       sub-letter suffixed:    "mb_drona_38_1a"
//   - bhagavata_<canto>.<ch>.<vStart>   e.g. "bhagavata_10.29.7" (anchored)
//   - bhagavata_<canto>.<ch>_<chunkN>   e.g. "bhagavata_10.55_3" (fallback)
//
// The bhagavata anchored vs fallback distinction is significant:
// anchored uses a DOT before the verse number (preserved from
// Sanyal's "(N—M)" parenthetical); fallback uses an UNDERSCORE
// because the source paragraph had no verse-range marker. The UI
// formats them differently — see designTokens / Step 2.5.2.
//
// MBh sub-letter suffixes (`_1a`, `_1b`) are upstream parser
// disambiguation when a section was split mid-flow. They are not
// user-meaningful; verseStart captures the integer chunk number
// only, and `raw` preserves the original for diagnostics.

export type Source = 'gita' | 'mahabharata' | 'bhagavata';

export type ParsedReference = {
  source: Source;
  /** Bhagavata only — the canto number (10, 11, ...). */
  canto?: number;
  /** Mahabharata only — the parva slug, lowercase (e.g. 'drona'). */
  parva?: string;
  /** Section / chapter within the source. For MBh this is the section
   *  number within the parva; for Gita + Bhagavata it's the chapter. */
  chapter: number;
  /** For anchored refs: the verse number. For Bhagavata fallback
   *  refs: equals fallbackN (mirrors the verse_number column in
   *  Supabase, which stores chunkN when the parenthetical was absent). */
  verseStart: number;
  /** Gita split-verse form only — the closing verse of the range. */
  verseEnd?: number;
  /** True only for Bhagavata fallback refs (underscore separator). */
  isFallback: boolean;
  /** Bhagavata fallback only — the upstream chunk number. Equals
   *  verseStart by construction; surfaced separately for clarity at
   *  the format-label call site. */
  fallbackN?: number;
  /** The original reference string, preserved for diagnostics. */
  raw: string;
};

const GITA_RE = /^gita_(\d+)\.(\d+)(?:_(\d+))?$/;
// MBh: parva slug is lowercase letters only; section + chunk are
// digits; an optional trailing letter on the chunk captures the
// sub-letter disambiguation (`_1a`, `_3b`, ...).
const MB_RE = /^mb_([a-z]+)_(\d+)_(\d+)([a-z]?)$/;
const BHAGAVATA_ANCHORED_RE = /^bhagavata_(\d+)\.(\d+)\.(\d+)$/;
const BHAGAVATA_FALLBACK_RE = /^bhagavata_(\d+)\.(\d+)_(\d+)$/;

/**
 * Parse a verse reference string. Throws an Error with a
 * diagnostic message on unrecognized input — callers should not
 * silently fall through to the raw string.
 */
export function parseReference(reference: string): ParsedReference {
  if (typeof reference !== 'string') {
    throw new Error(`parseReference: expected string, got ${typeof reference}`);
  }
  const trimmed = reference.trim();
  if (trimmed.length === 0) {
    throw new Error('parseReference: empty reference');
  }

  let m = GITA_RE.exec(trimmed);
  if (m) {
    const [, chapter, verseStart, verseEnd] = m;
    const parsed: ParsedReference = {
      source: 'gita',
      chapter: Number(chapter),
      verseStart: Number(verseStart),
      isFallback: false,
      raw: trimmed,
    };
    if (verseEnd !== undefined) parsed.verseEnd = Number(verseEnd);
    return parsed;
  }

  m = MB_RE.exec(trimmed);
  if (m) {
    const [, parva, section, chunkN /*, subLetter */] = m;
    return {
      source: 'mahabharata',
      parva,
      chapter: Number(section),
      verseStart: Number(chunkN),
      isFallback: false,
      raw: trimmed,
    };
  }

  m = BHAGAVATA_ANCHORED_RE.exec(trimmed);
  if (m) {
    const [, canto, chapter, verseStart] = m;
    return {
      source: 'bhagavata',
      canto: Number(canto),
      chapter: Number(chapter),
      verseStart: Number(verseStart),
      isFallback: false,
      raw: trimmed,
    };
  }

  m = BHAGAVATA_FALLBACK_RE.exec(trimmed);
  if (m) {
    const [, canto, chapter, chunkN] = m;
    const n = Number(chunkN);
    return {
      source: 'bhagavata',
      canto: Number(canto),
      chapter: Number(chapter),
      verseStart: n,
      isFallback: true,
      fallbackN: n,
      raw: trimmed,
    };
  }

  throw new Error(`parseReference: unrecognized reference "${reference}"`);
}

/**
 * Soft-fail wrapper for callers that prefer to render a fallback
 * instead of crashing the React tree. Returns null on unrecognized
 * input. Use parseReference directly when you want errors to surface.
 */
export function tryParseReference(reference: string): ParsedReference | null {
  try {
    return parseReference(reference);
  } catch {
    return null;
  }
}

// Parva-name maps for Mahabharata label rendering. Co-located here
// (not a separate file) — small enough that splitting would be
// over-engineering. Both Hindi and English maps in the same place
// for easy 1:1 verification.
//
// Coverage = the 13 parvas in the Phase 1.5 corpus (per
// docs/decisions.md 2026-04-29 + .claude/rules/file-tree.md).
// Future parva additions: append to BOTH maps; otherwise the
// fallback below renders a Capitalized slug, which is informative
// but less authentic.

const PARVA_HI: Record<string, string> = {
  adi: 'आदि',
  sabha: 'सभा',
  vana: 'वन',
  udyoga: 'उद्योग',
  bhishma: 'भीष्म',
  drona: 'द्रोण',
  karna: 'कर्ण',
  shalya: 'शल्य',
  sauptika: 'सौप्तिक',
  stri: 'स्त्री',
  shanti: 'शान्ति',
  ashvamedhika: 'अश्वमेधिक',
  mausala: 'मौसल',
};

const PARVA_EN: Record<string, string> = {
  adi: 'Adi',
  sabha: 'Sabha',
  vana: 'Vana',
  udyoga: 'Udyoga',
  bhishma: 'Bhishma',
  drona: 'Drona',
  karna: 'Karna',
  shalya: 'Shalya',
  sauptika: 'Sauptika',
  stri: 'Stri',
  shanti: 'Shanti',
  ashvamedhika: 'Ashvamedhika',
  mausala: 'Mausala',
};

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * Format a parsed reference for visual display. Handles all 4
 * formats × 2 languages = 8 combinations:
 *
 *   gita anchored      → "भगवद्गीता 2.47"            / "Bhagavad Gita 2.47"
 *   gita split-verse   → "भगवद्गीता 18.78-79"        / "Bhagavad Gita 18.78-79"
 *   mahabharata        → "महाभारत द्रोण पर्व 38"     / "Mahabharata Drona Parva 38"
 *   bhagavata anchored → "श्रीमद्भागवत 10.29.7"      / "Srimad Bhagavatam 10.29.7"
 *   bhagavata fallback → "श्रीमद्भागवत 10.55 (अंश 3)"/ "Srimad Bhagavatam 10.55 (passage 3)"
 *
 * Krishna himself never speaks chapter:verse numbers (locked
 * decision #10) — only the verse-card UI uses these labels.
 */
export function formatReferenceLabel(
  parsed: ParsedReference,
  lang: 'hi' | 'en',
): string {
  if (parsed.source === 'gita') {
    const stem = lang === 'hi' ? 'भगवद्गीता' : 'Bhagavad Gita';
    if (parsed.verseEnd !== undefined) {
      return `${stem} ${parsed.chapter}.${parsed.verseStart}-${parsed.verseEnd}`;
    }
    return `${stem} ${parsed.chapter}.${parsed.verseStart}`;
  }

  if (parsed.source === 'mahabharata') {
    if (parsed.parva === undefined) {
      throw new Error(
        `formatReferenceLabel: mahabharata reference missing parva: ${parsed.raw}`,
      );
    }
    if (lang === 'hi') {
      const parvaHi = PARVA_HI[parsed.parva] ?? capitalize(parsed.parva);
      return `महाभारत ${parvaHi} पर्व ${parsed.chapter}`;
    }
    const parvaEn = PARVA_EN[parsed.parva] ?? capitalize(parsed.parva);
    return `Mahabharata ${parvaEn} Parva ${parsed.chapter}`;
  }

  // bhagavata
  if (parsed.canto === undefined) {
    throw new Error(
      `formatReferenceLabel: bhagavata reference missing canto: ${parsed.raw}`,
    );
  }
  const stem = lang === 'hi' ? 'श्रीमद्भागवत' : 'Srimad Bhagavatam';
  if (parsed.isFallback) {
    const n = parsed.fallbackN ?? parsed.verseStart;
    const passage = lang === 'hi' ? `अंश ${n}` : `passage ${n}`;
    return `${stem} ${parsed.canto}.${parsed.chapter} (${passage})`;
  }
  return `${stem} ${parsed.canto}.${parsed.chapter}.${parsed.verseStart}`;
}
