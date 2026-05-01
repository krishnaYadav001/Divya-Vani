// Phase 1.6 parser — Sanyal English Bhagavata Purana → structured chunks.
//
// Scope: Canto 10 only. Vol 4 covers chapters 1–61, Vol 5 covers 62–90.
// Beyond chapter 90 in Vol 5 begins Canto 11 (BOOK XI), which is Phase 1.7
// scope and is excluded here.
//
// Invocation:
//   npm run parse:bhagavata
//   tsx --env-file=.env.local scripts/parse-bhagavata.ts
//
// Output:
//   data/bhagavata.json — array of Chunk
//
// Schema (from plan, locked 2026-05-01):
//   reference is "bhagavata_10.<ch>.<verseStart>" when Sanyal's "(N—M)"
//   parenthetical is present (anchored, dot separator), else
//   "bhagavata_10.<ch>_<fallbackChunkN>" (fallback, underscore separator).
//   verse_number int in DB = verseStart (anchored) or fallbackChunkN (fallback).

import fs from "node:fs";

// ============================================================================
// Constants & types
// ============================================================================

const VOL4_PATH = "data/bhagavata-raw/sanyal/vol4_djvu.txt";
const VOL5_PATH = "data/bhagavata-raw/sanyal/vol5_djvu.txt";
const OUTPUT_PATH = "data/bhagavata.json";

const CANTO = 10;
const CANTO_LAST_CHAPTER = 90;
const MAX_WORDS = 300;        // matches MB parser target
const MIN_WORDS = 30;         // matches MB MIN_WORDS — drop sub-30-word fragments unless speaker present

// Chapter heading: tolerate up to 3 chars of OCR junk before "CHAPTER"
// (seen in actual data: "_ CHAPTER XLVI", "q CHAPTER XXXI", "t CHAPTER LII",
// "| CHAPTER IIL"), an optional comma/period between CHAPTER and the numeral
// ("CHAPTER, LIX"), and any trailing junk after the roman numeral
// ("CHAPTER XIII | ", "CHAPTER XXXIV.", "CHAPTER YV", "CHAPTER XLV ie", etc.).
// The captured numeral group is sanitized below before passing to romanToInt.
// Plural "CHAPTERS" (TOC table header) is rejected via the \s+ requirement
// after CHAPTER, since "CHAPTERS" has S where the whitespace would be.
const CHAPTER_HEADER = /^.{0,3}CHAPTER[,.]?\s+([A-Za-z0-9]+)/;

// Cut-off marker for Vol 5: "BOOK XI" begins Canto 11 (Phase 1.7 scope).
const BOOK_XI = /^BOOK\s+XI\b/;

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

function romanToInt(raw: string, prevChapter: number): number {
  const sanitized = sanitizeRoman(raw);
  const strict = romanToIntStrict(sanitized);
  if (strict <= 0 || strict > CANTO_LAST_CHAPTER) return -1;

  // Sequential or near-sequential: definitive accept of strict reading.
  if (strict === prevChapter + 1) return strict;
  if (strict > prevChapter && strict <= prevChapter + 5) return strict;

  // Wide jump from prevChapter — strict reading might be wrong.
  // Try OCR-substitution variants and prefer one that lands near prevChapter + 1.
  // Real-world example: line 1160 "IIL" parses as 50 (L=50), but the true
  // chapter is III=3 (final L is OCR-mangled I). For a wide jump, try L→I.
  // Crucially: only override strict if a variant lands within prevChapter+5
  // (sequential window). Otherwise keep strict — Vol 5's first real chapter
  // LXII (=62) is a legitimate wide jump from prevChapter=0.
  const variants = new Set<number>();
  const tryVariant = (s: string) => {
    const n = romanToIntStrict(sanitizeRoman(s));
    if (n > 0 && n <= CANTO_LAST_CHAPTER) variants.add(n);
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
    let vEnd = parseInt(endMatch[2], 10);
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
    let vEnd = parseInt(inlineMatch[2], 10);
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

// Parse a volume's text into a list of RawChapter records.
// `volLabel` is for debug logging. `stopAtBookXI` short-circuits at the
// "BOOK XI" line (Vol 5 only — to skip Cantos 11–12).
function parseVolume(text: string, volLabel: string, stopAtBookXI: boolean): RawChapter[] {
  const lines = text.split("\n");
  const chapters: RawChapter[] = [];

  let current: RawChapter | null = null;
  let prevChapter = 0;
  let titleNeeded = false;  // true after a chapter heading is detected; next non-empty line is title
  let firstChapterSeen = false;  // gate the BOOK XI stop so TOC references don't trip it

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Vol 5 only: stop at the BOOK XI marker, BUT only after at least one chapter
    // has been detected. The TOC at the start of Vol 5 references BOOK XI / XII
    // which would otherwise short-circuit before any Canto 10 content.
    if (stopAtBookXI && firstChapterSeen && BOOK_XI.test(line.trim())) {
      console.error(`[parse] ${volLabel}: stopping at BOOK XI marker (line ${i + 1})`);
      break;
    }

    const m = line.match(CHAPTER_HEADER);
    if (m) {
      // Flush prior chapter
      if (current) chapters.push(current);

      const detectedChapter = romanToInt(m[1], prevChapter);
      if (detectedChapter <= 0 || detectedChapter > CANTO_LAST_CHAPTER) {
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
      firstChapterSeen = true;
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

function chunkChapter(ch: RawChapter): Chunk[] {
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
      reference = `bhagavata_${CANTO}.${ch.chapter}.${verseStart}${suffix}`;
      seenVerseStart.set(verseStart, dupCount + 1);
      if (dupCount > 0) warnings.push("duplicate-verse-anchor");
      if (verseEnd != null && verseEnd < verseStart) warnings.push("verse-range-non-monotonic");
    } else {
      chunkOrdinalFallback++;
      fallbackChunkN = chunkOrdinalFallback;
      reference = `bhagavata_${CANTO}.${ch.chapter}_${fallbackChunkN}`;
      warnings.push("no-verse-anchor");
    }

    chunks.push({
      reference,
      canto: CANTO,
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
          reference = `bhagavata_${CANTO}.${ch.chapter}.${verseStart}${String.fromCharCode(97 + i)}`;
        } else {
          chunkOrdinalFallback++;
          fallbackChunkN = chunkOrdinalFallback;
          reference = `bhagavata_${CANTO}.${ch.chapter}_${fallbackChunkN}`;
          warnings.unshift("no-verse-anchor");
        }
        chunks.push({
          reference,
          canto: CANTO,
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

function validateChapterSequence(chapters: RawChapter[]): string[] {
  const warnings: string[] = [];
  const seen = new Set<number>();
  for (const c of chapters) {
    if (seen.has(c.chapter)) {
      warnings.push(`duplicate-chapter-${c.chapter}`);
    }
    seen.add(c.chapter);
  }
  for (let n = 1; n <= CANTO_LAST_CHAPTER; n++) {
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
  if (!fs.existsSync(VOL4_PATH)) throw new Error(`Vol 4 djvu_txt missing at ${VOL4_PATH}`);
  if (!fs.existsSync(VOL5_PATH)) throw new Error(`Vol 5 djvu_txt missing at ${VOL5_PATH}`);

  console.error(`=== parse-bhagavata: Canto ${CANTO} ===`);

  const vol4Text = fs.readFileSync(VOL4_PATH, "utf8");
  const vol5Text = fs.readFileSync(VOL5_PATH, "utf8");

  const vol4Chapters = parseVolume(vol4Text, "Vol 4", false);
  const vol5Chapters = parseVolume(vol5Text, "Vol 5", true);

  const allChapters = [...vol4Chapters, ...vol5Chapters];
  console.error(`Detected ${allChapters.length} chapters across both volumes (${vol4Chapters.length} from Vol 4, ${vol5Chapters.length} from Vol 5)`);

  const sequenceWarnings = validateChapterSequence(allChapters);
  if (sequenceWarnings.length > 0) {
    console.error(`Chapter-sequence warnings: ${sequenceWarnings.length}`);
    for (const w of sequenceWarnings) console.error(`  - ${w}`);
  }

  let allChunks: Chunk[] = [];
  let anchoredCount = 0;
  let fallbackCount = 0;
  for (const c of allChapters) {
    const cs = chunkChapter(c);
    allChunks = allChunks.concat(cs);
    for (const chunk of cs) {
      if (chunk.verseStart != null) anchoredCount++;
      else fallbackCount++;
    }
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

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allChunks, null, 2), "utf8");

  const total = allChunks.length;
  const anchorPct = total > 0 ? ((anchoredCount / total) * 100).toFixed(1) : "0.0";
  const wcAvg = total > 0 ? Math.round(allChunks.reduce((s, c) => s + c.wordCount, 0) / total) : 0;

  console.error(`\n=== Summary ===`);
  console.error(`Total chunks:          ${total}`);
  console.error(`Anchored (dot ref):    ${anchoredCount} (${anchorPct}%)`);
  console.error(`Fallback (underscore): ${fallbackCount}`);
  console.error(`Avg word count:        ${wcAvg}`);
  console.error(`Sequence warnings:     ${sequenceWarnings.length}`);
  console.error(`Wrote: ${OUTPUT_PATH}`);
}

main();
