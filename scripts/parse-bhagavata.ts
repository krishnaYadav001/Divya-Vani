// Bhagavata parser — Sanyal English Bhagavata Purana → structured chunks.
//
// Scope:
//   * Canto 10 (Phase 1.6, default): Vol 4 covers chs 1–61, Vol 5 covers
//     chs 62–90. Vol 5 BOOK XI body marker (occurrence 2 in the file)
//     terminates the read.
//   * Canto 11 (Phase 1.7+, --canto=11): Vol 5 only. Slice between the
//     BOOK XI body marker (occurrence 2) and the BOOK XII body marker
//     (occurrence 2). Sanyal Book XI = 31 chapters, 1:1 with standard
//     Canto 11 (verified at Ch VI = std 11.6 boundary 2026-05-01).
//
// CLI flags:
//   --canto=<N>          Canto number. Defaults to 10. Configured cantos
//                        are listed in CANTO_CONFIGS; add an entry to
//                        extend.
//   --chapters=<A>-<B>   Inclusive chapter range filter. Phase 1.7 uses
//                        --chapters=6-29 to scope to the Uddhava-Gita and
//                        skip the Yadu-curse / Nimi-Yogendras prelude
//                        (chs 1–5) and the Mausala / Krishna-departure
//                        coda (chs 30–31). Default: no filter, full canto.
//   --output=<path>      Override default output path. Default for
//                        canto=10 is data/bhagavata.json (Phase 1.6
//                        backcompat); for other cantos defaults to
//                        data/bhagavata-canto<N>.json.
//
// Invocation:
//   # Phase 1.6 default (Canto 10):
//   npm run parse:bhagavata
//   tsx --env-file=.env.local scripts/parse-bhagavata.ts
//   # Phase 1.7 (Canto 11, Uddhava-Gita scope):
//   tsx scripts/parse-bhagavata.ts --canto=11 --chapters=6-29
//
// Schema (locked 2026-05-01, applies across all cantos):
//   reference is "bhagavata_<canto>.<ch>.<verseStart>" when Sanyal's
//   "(N—M)" parenthetical is present (anchored, dot separator), else
//   "bhagavata_<canto>.<ch>_<fallbackChunkN>" (fallback, underscore
//   separator). verse_number int in DB = verseStart (anchored) or
//   fallbackChunkN (fallback). canto info lives in the reference text
//   only (no schema column).

import fs from "node:fs";

// ============================================================================
// Constants & types
// ============================================================================

const VOL4_PATH = "data/bhagavata-raw/sanyal/vol4_djvu.txt";
const VOL5_PATH = "data/bhagavata-raw/sanyal/vol5_djvu.txt";

const MAX_WORDS = 300;        // matches MB parser target
const MIN_WORDS = 30;         // matches MB MIN_WORDS — drop sub-30-word fragments unless speaker present

// ============================================================================
// Per-canto configuration
// ============================================================================
//
// Sanyal's 5-volume Srimad-Bhagavatam edition layout in the data/ raw files:
//   Vol 3: Books VII–IX (deferred, see CLAUDE.md Phase 1.6 notes)
//   Vol 4: Canto 10 chs 1–61 (BOOK X start)
//   Vol 5: Canto 10 chs 62–90, BOOK XI (Canto 11) chs 1–31, BOOK XII front
//   matter
//
// Each volume's djvu_txt has both a TOC (early) and body (later) with the
// same BOOK X / XI / XII markers. The TOC's BOOK markers are occurrence 1;
// the body markers are occurrence 2. We slice the volume text by
// occurrence-counting the markers — no fragile "wait until first chapter
// is seen" interlock needed (replaces the Phase 1.6 firstChapterSeen gate).
//
// To extend to Canto 12 in a future phase, add a CANTO_CONFIGS[12] entry
// using { startMarker: BOOK_XII occ 2, stopMarker: <none — Vol 5 ends> }.

type VolumeConfig = {
  path: string;
  label: string;
  startMarker?: { regex: RegExp; occurrence: number };
  stopMarker?: { regex: RegExp; occurrence: number };
};

type CantoConfig = {
  lastChapter: number;
  volumes: VolumeConfig[];
};

// Chapter heading: tolerate up to 3 chars of OCR junk before "CHAPTER"
// (seen in actual data: "_ CHAPTER XLVI", "q CHAPTER XXXI", "t CHAPTER LII",
// "| CHAPTER IIL"), an optional comma/period between CHAPTER and the numeral
// ("CHAPTER, LIX"), and any trailing junk after the roman numeral
// ("CHAPTER XIII | ", "CHAPTER XXXIV.", "CHAPTER YV", "CHAPTER XLV ie", etc.).
// The captured numeral group is sanitized below before passing to romanToInt.
// Plural "CHAPTERS" (TOC table header) is rejected via the \s+ requirement
// after CHAPTER, since "CHAPTERS" has S where the whitespace would be.
const CHAPTER_HEADER = /^.{0,3}CHAPTER[,.]?\s+([A-Za-z0-9]+)/;

// Book markers in Vol 5. Each appears twice: once in the TOC (occurrence 1)
// and once at the body-content boundary (occurrence 2). \b after the roman
// numeral prevents BOOK XI from greedily matching BOOK XII (the next char
// 'I' in "XII" follows another word char 'I' in "XI", so \b fails — verified
// empirically). BOOK_XII matches both "BOOK XII" and tolerates any trailing
// text including a continuing alphabetic char only if it's word-boundary-
// terminated, which "BOOK XII " with trailing space satisfies.
const BOOK_XI = /^BOOK\s+XI\b/;
const BOOK_XII = /^BOOK\s+XII\b/;

// Verse-range parenthetical placed AFTER the prose paragraph it labels.
// Forms seen: "(14—24)", "(26—30)", "(17—29).", "(45—50).". Em-dash,
// en-dash, hyphen, or tilde (rare OCR substitution: "(38 ~41)" in Vol 5).
// Optional trailing period. Optional trailing whitespace. Two regex forms:
// VERSE_RANGE_END    — matches AT end-of-string (used on last line of paragraph)
// VERSE_RANGE_INLINE — matches anywhere (fallback when OCR ate the paragraph
//                      break and the parenthetical is mid-chunk)
const VERSE_RANGE_END = /\((\d+)\s*[—–\-~]\s*(\d+)\)\s*\.?\s*$/;
const VERSE_RANGE_INLINE = /\((\d+)\s*[—–\-~]\s*(\d+)\)/;

// Page-header / footer / digitization-line patterns. These appear standalone
// on their own lines in the djvu_txt and must be stripped before chunking.
//
// SRIMAD-BHAGAVATAM running headers come in two layouts seen in Vol 4/5:
//   "110 SRIMAD-BHAGAVATAM"  (page number prefix)  ← most common
//   "SRIMAD-BHAGABATAM 39"   (page number suffix)
// Both with possible trailing OCR junk like "|", "i ". A single check covers
// both: short line containing all-caps SRIMAD-BHAGA{V,B}ATAM is a page header.
const RUNNING_HEADER = /\bSRIMAD[- ]?BHAGA[BV]ATAM\b/;

const PAGE_HEADER_PATTERNS: RegExp[] = [
  /^CC[-_]?\d.*Public\s+Domain/i,    // CC0 footer
  /^Digitized\s+by\s+Sarayu/i,       // digitization note
  /^UP\s+State\s+Museum/i,           // museum line
  /^Hazratganj/i,                    // location (sometimes alone)
  /^Lucknow\s*$/i,                   // location
];

// Speaker markers — short fragments are kept if they contain one of these.
const SPEAKER_RE = /\b(said|continued|replied|asked|inquired|answered|exclaimed|spoke|hymn(ed)?)\b/i;

// Per-canto registry. Add an entry here to support a new canto.
const CANTO_CONFIGS: Record<number, CantoConfig> = {
  10: {
    lastChapter: 90,
    volumes: [
      { path: VOL4_PATH, label: "Vol 4" },
      // Stop at the BOOK XI body marker (occurrence 2). The TOC's BOOK XI
      // (occurrence 1) is bypassed.
      { path: VOL5_PATH, label: "Vol 5", stopMarker: { regex: BOOK_XI, occurrence: 2 } },
    ],
  },
  11: {
    lastChapter: 31,  // Sanyal Book XI = standard Canto 11, 31 chapters
    volumes: [
      {
        path: VOL5_PATH,
        label: "Vol 5",
        startMarker: { regex: BOOK_XI, occurrence: 2 },   // skip TOC, start at body
        stopMarker: { regex: BOOK_XII, occurrence: 2 },   // skip TOC, stop at body BOOK XII
      },
    ],
  },
};

// ============================================================================
// CLI parsing
// ============================================================================

type Cli = {
  canto: number;
  chapterRange: { from: number; to: number } | null;
  outputPath: string;
};

function parseCli(): Cli {
  const args = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.slice(`--${name}=`.length) : undefined;
  };

  const cantoStr = get("canto") ?? "10";
  const canto = parseInt(cantoStr, 10);
  if (!Number.isFinite(canto) || !(canto in CANTO_CONFIGS)) {
    throw new Error(
      `--canto=${cantoStr} not configured. Configured cantos: ${Object.keys(CANTO_CONFIGS).join(", ")}.`,
    );
  }

  const chaptersRaw = get("chapters");
  let chapterRange: { from: number; to: number } | null = null;
  if (chaptersRaw) {
    const m = chaptersRaw.match(/^(\d+)-(\d+)$/);
    if (!m) throw new Error(`--chapters must be of form A-B (got: ${chaptersRaw})`);
    const from = parseInt(m[1], 10);
    const to = parseInt(m[2], 10);
    if (from < 1 || to < from) throw new Error(`--chapters range invalid: ${chaptersRaw}`);
    chapterRange = { from, to };
  }

  const defaultOutput = canto === 10 ? "data/bhagavata.json" : `data/bhagavata-canto${canto}.json`;
  const outputPath = get("output") ?? defaultOutput;

  return { canto, chapterRange, outputPath };
}

// ============================================================================
// Volume slicing — find the body-content window of a Sanyal volume.
// ============================================================================
//
// Counts marker occurrences from the start of the FULL text (not relative to
// any prior slice). For Canto 10 Vol 5, stopMarker BOOK_XI occurrence 2 lands
// at the body marker, with the TOC marker (occurrence 1) bypassed. For
// Canto 11 Vol 5, startMarker BOOK_XI occurrence 2 starts the slice at the
// body, and stopMarker BOOK_XII occurrence 2 ends it at the next book.

function sliceVolume(text: string, vol: VolumeConfig): string {
  const lines = text.split("\n");
  let startIdx = 0;
  let endIdx = lines.length;

  if (vol.startMarker) {
    let count = 0;
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (vol.startMarker.regex.test(lines[i].trim())) {
        count++;
        if (count === vol.startMarker.occurrence) {
          startIdx = i + 1;  // start AFTER the marker line
          found = true;
          break;
        }
      }
    }
    if (!found) {
      throw new Error(
        `${vol.label}: start marker ${vol.startMarker.regex} occurrence ${vol.startMarker.occurrence} not found (saw ${count})`,
      );
    }
  }

  if (vol.stopMarker) {
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (vol.stopMarker.regex.test(lines[i].trim())) {
        count++;
        if (count === vol.stopMarker.occurrence && i > startIdx) {
          endIdx = i;
          break;
        }
      }
    }
    // If stopMarker not found, endIdx stays at lines.length (read to EOF).
    // This is acceptable — Vol 5 BOOK XII appearing only once would still
    // be caught at i > startIdx since both the start and stop markers are
    // counted from the file head; the i > startIdx guard prevents accepting
    // a stop marker that appears before the start.
  }

  return lines.slice(startIdx, endIdx).join("\n");
}

export type Chunk = {
  reference: string;
  canto: number;
  chapter: number;
  verseStart: number | null;
  verseEnd: number | null;
  fallbackChunkN: number | null;  // null when verseStart is set
  english: string;
  wordCount: number;
  warnings: string[];
};

type RawChapter = {
  chapter: number;
  rawHeading: string;       // the line that detected the chapter (for debug)
  rawTitle: string | null;  // the next non-empty line, typically the ALL-CAPS title
  rawText: string;          // body content
  startLine: number;        // for debug
};

// ============================================================================
// Helpers
// ============================================================================

function romanToIntStrict(roman: string): number {
  const cleaned = roman.replace(/1/g, "I").toUpperCase();
  if (/^\d+$/.test(roman)) return parseInt(roman, 10);
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let prev = 0;
  for (let i = cleaned.length - 1; i >= 0; i--) {
    const v = map[cleaned[i]];
    if (!v) return -1;
    if (v < prev) total -= v;
    else total += v;
    prev = v;
  }
  return total;
}

// Sanitize OCR-garbled roman: drop any char NOT in the strict roman set.
// Examples handled: "YV"→"V" (5), "LViI"→"LVII" (57), "XXXIVa"→"XXXIV" (34).
function sanitizeRoman(raw: string): string {
  return raw.toUpperCase().replace(/[^IVXLCDM]/g, "");
}

function romanToInt(raw: string, prevChapter: number, cantoLastChapter: number): number {
  const sanitized = sanitizeRoman(raw);
  const strict = romanToIntStrict(sanitized);
  if (strict <= 0 || strict > cantoLastChapter) return -1;

  // Sequential or near-sequential: definitive accept of strict reading.
  if (strict === prevChapter + 1) return strict;
  if (strict > prevChapter && strict <= prevChapter + 5) return strict;

  // Wide jump from prevChapter — strict reading might be wrong.
  // Try OCR-substitution variants and prefer one that lands near prevChapter + 1.
  // Real-world example: line 1160 "IIL" parses as 50 (L=50), but the true
  // chapter is III=3 (final L is OCR-mangled I). For a wide jump, try L→I.
  // Crucially: only override strict if a variant lands within prevChapter+5
  // (sequential window). Otherwise keep strict — Vol 5's first real chapter
  // LXII (=62) is a legitimate wide jump from prevChapter=0 (Canto 10 only;
  // for Canto 11, the slice starts after BOOK XI so chapters begin at I=1
  // and this branch is rarely taken).
  const variants = new Set<number>();
  const tryVariant = (s: string) => {
    const n = romanToIntStrict(sanitizeRoman(s));
    if (n > 0 && n <= cantoLastChapter) variants.add(n);
  };
  tryVariant(sanitized.replace(/L$/, "I"));   // trailing L → I
  tryVariant(sanitized.replace(/L/g, "I"));   // all L → I

  if (variants.has(prevChapter + 1)) return prevChapter + 1;
  const sequentialVariants = [...variants].filter(n => n > prevChapter && n <= prevChapter + 5);
  if (sequentialVariants.length > 0) return Math.min(...sequentialVariants);

  // No near-sequential variant — accept strict (legitimate wide jump or true gap).
  return strict;
}

function isPageHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Short line containing the SRIMAD-BHAGAVATAM running header (either
  // page-number-prefix or -suffix layout) — strip.
  if (trimmed.length < 60 && RUNNING_HEADER.test(trimmed)) return true;
  if (PAGE_HEADER_PATTERNS.some(p => p.test(trimmed))) return true;
  // Bare page number: "39", "  127  "
  if (/^\d{1,4}\s*$/.test(trimmed)) return true;
  return false;
}

function cleanChapterText(raw: string): string {
  const lines = raw.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (isPageHeader(line)) continue;
    kept.push(line);
  }
  let text = kept.join("\n");
  // Common Sanyal OCR fixes (cosmetic, retrieval-affecting standardizations).
  text = text
    .replace(/\bBHAGABATAM\b/g, "BHAGAVATAM")  // standardize for grep/QA, not user-visible (page-headers stripped already)
    .replace(/[ \t]+/g, " ")                    // collapse intra-line whitespace
    .replace(/\n{3,}/g, "\n\n")                 // cap blank-line runs at 2
    .replace(/^\s+|\s+$/g, "");                  // trim
  return text;
}

// Split an oversize paragraph at sentence boundaries — copy of MB
// splitOversizeParagraph (parse-mahabharata.ts:303-326).
function splitOversizeParagraph(para: string, maxWords: number): string[] {
  const words = para.split(/\s+/).filter(Boolean).length;
  if (words <= maxWords) return [para];
  const sentences = para.split(/(?<=[.!?])\s+(?=[A-Z"'])/);
  const out: string[] = [];
  let buf: string[] = [];
  let bufWords = 0;
  for (const s of sentences) {
    const w = s.split(/\s+/).filter(Boolean).length;
    if (bufWords + w > maxWords && buf.length > 0) {
      out.push(buf.join(" ").trim());
      buf = [];
      bufWords = 0;
    }
    buf.push(s);
    bufWords += w;
  }
  if (buf.length > 0) out.push(buf.join(" ").trim());
  return out;
}

// Speaker label heuristic — copy of MB findSpeakerPrefix (parse-mahabharata.ts:330-333).
function findSpeakerPrefix(text: string): string | null {
  const m = text.match(/^("?[A-Z][a-zA-Z\- ]{1,40}\s+(?:said|replied|continued|asked|answered),\s*[—-])/);
  return m ? m[1] : null;
}

// OCR-correct a verse-range parenthetical. Sanyal scans suffer from a
// systematic 3 → 8 misread in printed numerals. The signature is:
// vStart > vEnd AND vStart starts with '8'. If replacing the leading 8
// with 3 yields a monotonic range, accept the correction.
// Examples seen in source:
//   (81—36) → (31—36)   ✓ monotonic after fix
//   (86—42) → (36—42)   ✓
//   (88—40) → (38—40)   ✓
//   (83—17) → (33—17)   ✗ still backwards; bail out
function ocrCorrectRange(vStart: number, vEnd: number): { vStart: number; vEnd: number; corrected: boolean } {
  if (vStart <= vEnd) return { vStart, vEnd, corrected: false };
  const startStr = vStart.toString();
  if (startStr[0] !== "8") return { vStart, vEnd, corrected: false };
  const fixed = parseInt("3" + startStr.slice(1), 10);
  if (fixed > 0 && fixed <= vEnd) return { vStart: fixed, vEnd, corrected: true };
  return { vStart, vEnd, corrected: false };
}

// Extract verse-range parenthetical from a paragraph.
//
// Two strategies in order:
//   1. Match VERSE_RANGE_END on the LAST non-empty line — preferred. This is
//      Sanyal's intended layout (parenthetical at end of verse-translation
//      paragraph, before the paragraph break).
//   2. If end-of-line match fails, fall back to VERSE_RANGE_INLINE scanning
//      the whole paragraph. OCR sometimes ate the paragraph break, merging
//      two source paragraphs into one and burying the parenthetical mid-text
//      (e.g., chunk 5 of original ch 42 had "(11—24)," mid-paragraph).
//
// Each match also runs through ocrCorrectRange to handle the leading 3→8
// digit OCR artefact.
//
// Returns the chunk-anchor info plus a `stripped` text (with end-of-paragraph
// parenthetical removed for cleanliness — inline parentheticals are KEPT
// in the text since stripping them mid-prose would chop sentences).
function extractVerseRange(para: string): {
  verseStart: number | null;
  verseEnd: number | null;
  stripped: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const lines = para.split("\n");
  let lastIdx = lines.length - 1;
  while (lastIdx >= 0 && lines[lastIdx].trim() === "") lastIdx--;
  if (lastIdx < 0) return { verseStart: null, verseEnd: null, stripped: para, warnings };

  // Strategy 1: end-of-paragraph parenthetical
  const lastLine = lines[lastIdx];
  const endMatch = lastLine.match(VERSE_RANGE_END);
  if (endMatch) {
    let vStart = parseInt(endMatch[1], 10);
    const vEnd = parseInt(endMatch[2], 10);
    const corr = ocrCorrectRange(vStart, vEnd);
    if (corr.corrected) {
      vStart = corr.vStart;
      warnings.push("ocr-corrected-verse-start");
    }
    lines[lastIdx] = lastLine.replace(VERSE_RANGE_END, "").trim();
    if (lines[lastIdx] === "") lines.splice(lastIdx, 1);
    return { verseStart: vStart, verseEnd: vEnd, stripped: lines.join("\n").trim(), warnings };
  }

  // Strategy 2: inline parenthetical fallback (OCR-merged paragraph)
  const inlineMatch = para.match(VERSE_RANGE_INLINE);
  if (inlineMatch) {
    let vStart = parseInt(inlineMatch[1], 10);
    const vEnd = parseInt(inlineMatch[2], 10);
    const corr = ocrCorrectRange(vStart, vEnd);
    if (corr.corrected) {
      vStart = corr.vStart;
      warnings.push("ocr-corrected-verse-start");
    }
    warnings.push("inline-parenthetical-recovered");
    return { verseStart: vStart, verseEnd: vEnd, stripped: para, warnings };
  }

  return { verseStart: null, verseEnd: null, stripped: para, warnings };
}

// ============================================================================
// Volume parsing
// ============================================================================

// Parse a (pre-sliced) volume's text into a list of RawChapter records.
// The volume text passed in here is already trimmed to the canto's body
// window by sliceVolume — no BOOK marker handling is needed in this loop.
function parseVolume(text: string, volLabel: string, cantoLastChapter: number): RawChapter[] {
  const lines = text.split("\n");
  const chapters: RawChapter[] = [];

  let current: RawChapter | null = null;
  let prevChapter = 0;
  let titleNeeded = false;  // true after a chapter heading is detected; next non-empty line is title

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const m = line.match(CHAPTER_HEADER);
    if (m) {
      // Flush prior chapter
      if (current) chapters.push(current);

      const detectedChapter = romanToInt(m[1], prevChapter, cantoLastChapter);
      if (detectedChapter <= 0 || detectedChapter > cantoLastChapter) {
        console.error(`[parse] ${volLabel} line ${i + 1}: unparseable chapter heading '${line.trim()}' (raw='${m[1]}', sanitized='${sanitizeRoman(m[1])}')`);
        current = null;
        continue;
      }

      current = {
        chapter: detectedChapter,
        rawHeading: line.trim(),
        rawTitle: null,
        rawText: "",
        startLine: i + 1,
      };
      prevChapter = detectedChapter;
      titleNeeded = true;
      continue;
    }

    if (!current) continue;

    if (titleNeeded && line.trim() !== "") {
      // First non-empty line after CHAPTER X is the title
      current.rawTitle = line.trim();
      titleNeeded = false;
      continue;
    }

    current.rawText += line + "\n";
  }

  if (current) chapters.push(current);
  return chapters;
}

// ============================================================================
// Chunking
// ============================================================================

function chunkChapter(ch: RawChapter, canto: number): Chunk[] {
  const cleaned = cleanChapterText(ch.rawText);
  const paragraphs = cleaned.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);

  // Per-paragraph metadata: extract trailing parenthetical, get stripped text + verseStart/verseEnd.
  const paraData = paragraphs.map(extractVerseRange);

  const chunks: Chunk[] = [];
  let buf: typeof paraData = [];
  let bufWords = 0;
  let chunkOrdinalAnchored = 0;   // for anchored chunks within this chapter
  let chunkOrdinalFallback = 0;   // for fallback chunks within this chapter
  let speakerCtx: string | null = null;
  // Per-chapter dedup: when two distinct chunks share the same verseStart
  // (Sanyal occasionally labels two prose paragraphs with overlapping ranges,
  // or OCR captures a "(48—…)" parenthetical mid-paragraph alongside a real
  // one), append a/b/c letter suffix to keep references unique.
  const seenVerseStart = new Map<number, number>();

  const flush = (): void => {
    if (buf.length === 0) return;
    const text = buf.map(p => p.stripped).join("\n\n").trim();
    const wc = text.split(/\s+/).filter(Boolean).length;

    // Drop sub-MIN_WORDS fragments unless they have a speaker marker
    if (wc < MIN_WORDS && !SPEAKER_RE.test(text)) {
      buf = [];
      bufWords = 0;
      return;
    }
    if (wc < 5) {
      buf = [];
      bufWords = 0;
      return;
    }

    // Determine anchoring: chunk is anchored if ANY paragraph in it has a verseStart.
    // verseStart = first paragraph's verseStart that's non-null;
    // verseEnd = last paragraph's verseEnd that's non-null.
    const firstAnchored = buf.find(p => p.verseStart != null);
    const lastAnchored = [...buf].reverse().find(p => p.verseEnd != null);
    const verseStart = firstAnchored?.verseStart ?? null;
    const verseEnd = lastAnchored?.verseEnd ?? null;

    // Aggregate per-paragraph warnings (deduplicated) into chunk-level warnings.
    const warnings: string[] = [];
    const seenWarn = new Set<string>();
    for (const p of buf) {
      for (const w of p.warnings) {
        if (!seenWarn.has(w)) { seenWarn.add(w); warnings.push(w); }
      }
    }
    let reference: string;
    let fallbackChunkN: number | null = null;

    if (verseStart != null) {
      chunkOrdinalAnchored++;
      const dupCount = seenVerseStart.get(verseStart) ?? 0;
      const suffix = dupCount === 0 ? "" : String.fromCharCode(96 + dupCount);  // "a","b","c"...
      reference = `bhagavata_${canto}.${ch.chapter}.${verseStart}${suffix}`;
      seenVerseStart.set(verseStart, dupCount + 1);
      if (dupCount > 0) warnings.push("duplicate-verse-anchor");
      if (verseEnd != null && verseEnd < verseStart) warnings.push("verse-range-non-monotonic");
    } else {
      chunkOrdinalFallback++;
      fallbackChunkN = chunkOrdinalFallback;
      reference = `bhagavata_${canto}.${ch.chapter}_${fallbackChunkN}`;
      warnings.push("no-verse-anchor");
    }

    chunks.push({
      reference,
      canto,
      chapter: ch.chapter,
      verseStart,
      verseEnd,
      fallbackChunkN,
      english: text,
      wordCount: wc,
      warnings,
    });
    buf = [];
    bufWords = 0;
  };

  for (const p of paraData) {
    const paraWords = p.stripped.split(/\s+/).filter(Boolean).length;

    const sp = findSpeakerPrefix(p.stripped);
    if (sp) speakerCtx = sp;

    if (paraWords > MAX_WORDS) {
      flush();
      const pieces = splitOversizeParagraph(p.stripped, MAX_WORDS);
      pieces.forEach((piece, i) => {
        const text =
          i === 0 || !speakerCtx || piece.startsWith(speakerCtx)
            ? piece
            : `${speakerCtx} (continued) ${piece}`;
        const wc = text.split(/\s+/).filter(Boolean).length;
        if (wc < 5) return;

        const warnings: string[] = ["split-oversize-paragraph", ...p.warnings];
        let reference: string;
        let fallbackChunkN: number | null = null;
        const verseStart = p.verseStart;
        const verseEnd = p.verseEnd;
        if (verseStart != null) {
          chunkOrdinalAnchored++;
          // Append a/b/c suffix when split (matches MB convention)
          reference = `bhagavata_${canto}.${ch.chapter}.${verseStart}${String.fromCharCode(97 + i)}`;
        } else {
          chunkOrdinalFallback++;
          fallbackChunkN = chunkOrdinalFallback;
          reference = `bhagavata_${canto}.${ch.chapter}_${fallbackChunkN}`;
          warnings.unshift("no-verse-anchor");
        }
        chunks.push({
          reference,
          canto,
          chapter: ch.chapter,
          verseStart,
          verseEnd,
          fallbackChunkN,
          english: text,
          wordCount: wc,
          warnings,
        });
      });
      continue;
    }

    if (bufWords + paraWords > MAX_WORDS && buf.length > 0) {
      flush();
    }
    buf.push(p);
    bufWords += paraWords;
  }

  flush();
  return chunks;
}

// ============================================================================
// Sequence validation
// ============================================================================

// Validate chapter sequence within the expected range. With a chapter-range
// filter set (Phase 1.7+ scope-narrowed runs), validate only the filtered
// range. Without a filter (Phase 1.6 default), validate the full canto.
function validateChapterSequence(
  chapters: RawChapter[],
  cantoLastChapter: number,
  chapterRange: { from: number; to: number } | null,
): string[] {
  const warnings: string[] = [];
  const seen = new Set<number>();
  for (const c of chapters) {
    if (seen.has(c.chapter)) {
      warnings.push(`duplicate-chapter-${c.chapter}`);
    }
    seen.add(c.chapter);
  }
  const from = chapterRange?.from ?? 1;
  const to = chapterRange?.to ?? cantoLastChapter;
  for (let n = from; n <= to; n++) {
    if (!seen.has(n)) {
      warnings.push(`missing-chapter-${n}`);
    }
  }
  return warnings;
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const cli = parseCli();
  const cfg = CANTO_CONFIGS[cli.canto];

  for (const v of cfg.volumes) {
    if (!fs.existsSync(v.path)) throw new Error(`${v.label} djvu_txt missing at ${v.path}`);
  }

  const rangeStr = cli.chapterRange ? ` chs ${cli.chapterRange.from}–${cli.chapterRange.to}` : "";
  console.error(`=== parse-bhagavata: Canto ${cli.canto}${rangeStr} ===`);

  // Slice + parse each configured volume.
  const allRawChapters: RawChapter[] = [];
  const perVolStats: string[] = [];
  for (const v of cfg.volumes) {
    const text = fs.readFileSync(v.path, "utf8");
    const sliced = sliceVolume(text, v);
    const totalLines = text.split("\n").length;
    const slicedLines = sliced.split("\n").length;
    console.error(`[parse] ${v.label}: sliced ${slicedLines}/${totalLines} lines (${((slicedLines / totalLines) * 100).toFixed(1)}%)`);
    const volChapters = parseVolume(sliced, v.label, cfg.lastChapter);
    perVolStats.push(`${volChapters.length} from ${v.label}`);
    allRawChapters.push(...volChapters);
  }

  console.error(`Detected ${allRawChapters.length} chapters across ${cfg.volumes.length} volume(s) (${perVolStats.join(", ")})`);

  // Apply chapter-range filter BEFORE chunking — saves work on out-of-scope
  // chapters and prevents their references from leaking into the output file.
  const inRange = (n: number): boolean =>
    cli.chapterRange == null || (n >= cli.chapterRange.from && n <= cli.chapterRange.to);
  const filteredChapters = allRawChapters.filter(c => inRange(c.chapter));
  if (cli.chapterRange) {
    console.error(`After --chapters=${cli.chapterRange.from}-${cli.chapterRange.to} filter: ${filteredChapters.length} chapters retained (dropped ${allRawChapters.length - filteredChapters.length})`);
  }

  const sequenceWarnings = validateChapterSequence(filteredChapters, cfg.lastChapter, cli.chapterRange);
  if (sequenceWarnings.length > 0) {
    console.error(`Chapter-sequence warnings: ${sequenceWarnings.length}`);
    for (const w of sequenceWarnings) console.error(`  - ${w}`);
  }

  let allChunks: Chunk[] = [];
  let anchoredCount = 0;
  let fallbackCount = 0;
  // Per-chapter chunk-count breakdown (printed at end for the founder report).
  const perChapterCounts = new Map<number, { total: number; anchored: number; fallback: number; words: number }>();
  for (const c of filteredChapters) {
    const cs = chunkChapter(c, cli.canto);
    allChunks = allChunks.concat(cs);
    let chAnchored = 0;
    let chFallback = 0;
    let chWords = 0;
    for (const chunk of cs) {
      if (chunk.verseStart != null) {
        anchoredCount++;
        chAnchored++;
      } else {
        fallbackCount++;
        chFallback++;
      }
      chWords += chunk.wordCount;
    }
    perChapterCounts.set(c.chapter, { total: cs.length, anchored: chAnchored, fallback: chFallback, words: chWords });
  }

  // Post-process: enforce reference uniqueness across the corpus. If any
  // duplicates remain after per-chapter dedup (e.g., oversize-split letter
  // suffix happens to collide with a non-split letter suffix), append _dup2,
  // _dup3 etc. to the second-and-later occurrences and tag warning.
  const seenRefs = new Map<string, number>();
  for (const c of allChunks) {
    const n = (seenRefs.get(c.reference) ?? 0) + 1;
    seenRefs.set(c.reference, n);
    if (n > 1) {
      c.reference = `${c.reference}_dup${n}`;
      c.warnings.push("ref-collision-resolved");
    }
  }

  // Tag missing-chapter warnings on whatever chunk lands at the prior chapter.
  // (When chapter N is unmarked in OCR, its content gets attributed to chapter N-1.
  // This warning surfaces it for the quality gate.)
  const missingChapters = sequenceWarnings
    .filter(w => w.startsWith("missing-chapter-"))
    .map(w => parseInt(w.slice("missing-chapter-".length), 10));
  for (const missing of missingChapters) {
    const priorChapter = missing - 1;
    const tagOn = allChunks.filter(c => c.chapter === priorChapter);
    for (const t of tagOn) t.warnings.push(`adjacent-chapter-${missing}-unmarked-in-source`);
  }

  fs.writeFileSync(cli.outputPath, JSON.stringify(allChunks, null, 2), "utf8");

  const total = allChunks.length;
  const anchorPct = total > 0 ? ((anchoredCount / total) * 100).toFixed(1) : "0.0";
  const wcAvg = total > 0 ? Math.round(allChunks.reduce((s, c) => s + c.wordCount, 0) / total) : 0;

  console.error(`\n=== Per-chapter breakdown ===`);
  for (const [ch, s] of [...perChapterCounts.entries()].sort((a, b) => a[0] - b[0])) {
    const anchorPctCh = s.total > 0 ? ((s.anchored / s.total) * 100).toFixed(0) : "0";
    console.error(`  Ch ${String(ch).padStart(2)}: ${String(s.total).padStart(3)} chunks  (${String(s.anchored).padStart(3)} anchored, ${String(s.fallback).padStart(2)} fallback — ${anchorPctCh.padStart(3)}%)  ${s.words}w`);
  }

  console.error(`\n=== Summary ===`);
  console.error(`Canto:                 ${cli.canto}${rangeStr}`);
  console.error(`Total chunks:          ${total}`);
  console.error(`Anchored (dot ref):    ${anchoredCount} (${anchorPct}%)`);
  console.error(`Fallback (underscore): ${fallbackCount}`);
  console.error(`Avg word count:        ${wcAvg}`);
  console.error(`Sequence warnings:     ${sequenceWarnings.length}`);
  console.error(`Wrote: ${cli.outputPath}`);
}

main();
