// Phase 1.5 parser — Roy/Ganguli plain-text Mahabharata → structured chunks.
//
// First-pass scope: parse one volume, find section boundaries with header+footer
// agreement, chunk prose at ~300 words, emit JSON. Vol 04 (Virata + Udyoga) used
// for the initial 5-sample run; will generalize to all 10 needed volumes after
// sample review.
//
// Usage:
//   tsx scripts/parse-mahabharata.ts data/mahabharata-raw/ganguli/roy-vol04.txt --sample
//   tsx scripts/parse-mahabharata.ts data/mahabharata-raw/ganguli/roy-vol04.txt --parva=udyoga --out=data/mahabharata-vol04.json

import fs from "node:fs";

// ============================================================================
// Constants & types
// ============================================================================

// Fuzzy parva-name patterns — tolerate OCR substitutions (8 for S, 0 for O,
// 1 for I, B for R, etc.) seen in the actual archive.org djvu_txt dumps.
const PARVA_NAME_PATTERNS: Record<string, RegExp> = {
  adi:            /^AD[I1L]\s+PARVA\b/i,
  sabha:          /^SAB[H8]A\s+PARVA\b/i,
  vana:           /^VA[N0]A\s+PARVA\b/i,
  virata:         /^VIRATA?\s+PARVA\b/i,
  udyoga:         /^UD[Y]?[O0]GA\s+PARVA\b/i,
  bhishma:        /^B[H8]ISH?MA\s+PARVA\b/i,
  drona:          /^DR[O0]NA\s+PARVA\b/i,
  // KARNA + OCR variant KABNA (B-for-R substitution)
  karna:          /^KA[BR][N0]A\s+PARVA\b/i,
  shalya:         /^S[A8]LYA\s+PARVA\b/i,
  sauptika:       /^S[A8][U0]PTIKA\s+PARVA\b/i,
  // STREE (Roy spelling, with double-E) and STRI / STR1
  stri:           /^STR[I1E][I1E]?[I1E]?\s+PARVA\b/i,
  shanti:         /^S[A8]NT[I1]\s+PARVA\b/i,
  anushasana:     /^AN[U0O][D8]?[B8]?[A8]?[B8]?[S8]?[A8]?NA\s+PARVA\b/i,
  // ASWAMEDHA (Roy spelling, no -IKA suffix) + ASHVAMEDHIKA standard
  ashvamedhika:   /^A[SW][HW]?[VW]?A?MED[H8]?[I1]?KA?\s+PARVA\b/i,
  // ASRAMAVASIKA + OCR variant ASEAMAVASIKA (R-for-E substitution)
  asramavasika:   /^A[SE][RHE]?[A8]MAVASIKA\s+PARVA\b/i,
  // MAUSALA + OCR variants: I1AUSALA (M-as-I1 substitution), NAUSALA
  mausala:        /^(?:MA|I1A|NA)[U0]SALA?\s+PARVA\b/i,
  mahaprasthanika:/^MA[H8]APRA[SE][TH8]HAN[I1L]?KA?\s+PARVA\b/i,
  // SVARGAROHANA + OCR variants SWARGAROHANIKA, SWABGABOHANIKA, SWARQAROHANIKA
  svargarohana:   /^[SW][WV]?[AB][BR]?GA[RB][O0]HAN[I1L]?KA?\s+PARVA\b/i,
};

// Section header — tolerate single OCR'd junk char between "SECTION" and
// the numeral (we've seen "SECTION j LXXII" in actual data). Junk char is
// restricted to lowercase letters or punctuation — must NOT include
// uppercase Roman-numeral letters (I, V, X, L, C, D, M) or the regex would
// over-eagerly consume the first letter of the actual numeral.
// O is included in the numeral class because OCR sometimes substitutes O
// for C (e.g. "OXOIII" → CXCIII / 193); romanToInt's loose mode resolves it.
const SECTION_HEADER =
  /^SECTION\s+(?:[a-z.,;:!?|]\s+)?([IVXLCDMO\d]+)\.?\s*$/;

// Section footer ("Thus ends the Nth section in the X Parva of the Y Parva.")
// NOTE: present only in some parvas — Virata uses them, Udyoga doesn't (Roy
// editorial convention, not OCR). Treat absence as informational warning,
// not as boundary-detection failure. Boundary integrity comes from headers.
const SECTION_FOOTER =
  /thus\s+ends\s+the\s+.{1,80}?\s+section\s+(?:in|of)\s+the\s+.{1,80}?\s+p[ar]{1,3}va/i;

type RawSection = {
  parva: string;
  section: number;
  rawText: string;
  hasFooter: boolean;
  startLine: number;
};

export type Chunk = {
  reference: string;
  parva: string;
  section: number;
  chunkN: number;
  english: string;
  wordCount: number;
  warnings: string[];
};

export type RawSectionExport = {
  parva: string;
  section: number;
  rawText: string;
  hasFooter: boolean;
  startLine: number;
};

// ============================================================================
// Helpers
// ============================================================================

function romanToIntStrict(roman: string): number {
  // Tolerate OCR: 1→I, 0 in 'O' position handled separately.
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

// Loose Roman parser — handles OCR substitutions seen in Roy plain-text dumps:
//   L→X (e.g. "CLC" should be CXC=190; "CLCI" → CXCI=191)
//   O→C (e.g. "OXOIII" should be CXCIII=193)
// Strategy: try strict first; if result <= prevSection (suggesting backwards
// jump), try variants and pick the smallest result > prevSection.
function romanToInt(roman: string, prevSection: number = 0): number {
  const strict = romanToIntStrict(roman);
  if (strict > prevSection && strict > 0 && strict <= 1000) return strict;

  // Try OCR-substitution variants
  const candidates = new Set<number>();
  const variants = [
    roman.replace(/L/gi, "X"),
    roman.replace(/O/gi, "C"),
    roman.replace(/L/gi, "X").replace(/O/gi, "C"),
  ];
  for (const v of variants) {
    const n = romanToIntStrict(v);
    if (n > prevSection && n > 0 && n <= 1000) candidates.add(n);
  }

  if (candidates.size > 0) {
    // Smallest result > prevSection (closest sequential successor)
    return Math.min(...candidates);
  }
  return strict; // give up and return strict result (caller decides)
}

function detectParva(line: string): string | null {
  const trimmed = line.trim();
  // Skip lines that have trailing digits (running page header like "DRONA PARVA 263")
  if (/\d{1,4}\s*$/.test(trimmed)) return null;
  for (const [slug, pattern] of Object.entries(PARVA_NAME_PATTERNS)) {
    if (pattern.test(trimmed)) return slug;
  }
  return null;
}

const PAGE_HEADER_PATTERNS = [
  // MAHABHARATA + OCR variants: B↔R, B↔8, A↔H. Examples seen: MAHABHABATA, MAHABRARATA.
  /^(THE\s+)?MAHA[BR8H]A[BR8H]ARATA\b/i,
  /^MAHA[BR8H][HBA]?A[BR8H]ATA\b/i,
];

function isPageHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (PAGE_HEADER_PATTERNS.some(p => p.test(trimmed))) return true;
  // Running parva header with page number — tolerate OCR variants:
  //   "ANUSASANA PARVA 263", "UDYOGA PABVA 161", "UDYOGA PARVA SIT" (OCR'd 287→SIT)
  if (/^[A-Z][A-Z0-9 ]{2,30}\s+PA[BREU]?[VR][A]\s+(\d+|[A-Z]{1,5})\s*$/i.test(trimmed)) return true;
  // Bare parva running header, no number: "UDYOGA   PARVA" (extra spaces)
  if (/^[A-Z][A-Z]{2,30}\s+PA[BREU]?[VR][A]\s*$/i.test(trimmed)) return true;
  return false;
}

function cleanSectionText(raw: string): string {
  const lines = raw.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (isPageHeader(line)) continue;
    kept.push(line);
  }
  // Re-join, then collapse whitespace within paragraphs but preserve paragraph breaks
  const text = kept.join("\n");
  return text
    .replace(/[ \t]+/g, " ")           // collapse intra-line whitespace
    .replace(/\n{3,}/g, "\n\n")        // cap blank-line runs at 2
    .replace(/^\s+|\s+$/g, "")         // trim
    // Common OCR fixes
    .replace(/\b([Ii])t\b/g, "It")
    .replace(/Bbima/g, "Bhima");
}

// ============================================================================
// TOC detection
// ============================================================================

function findRealSectionStart(lines: string[]): number {
  // TOC pages have SECTION markers crowded together. Real sections have
  // ~30+ lines of prose between SECTION markers.
  // Strategy: find first SECTION marker where next 50 lines have <2 SECTION markers.
  for (let i = 0; i < Math.min(lines.length, 2000); i++) {
    if (!SECTION_HEADER.test(lines[i])) continue;

    let nextHeaderCount = 0;
    let nextHeaderLine = -1;
    for (let j = i + 1; j < Math.min(lines.length, i + 50); j++) {
      if (SECTION_HEADER.test(lines[j])) {
        nextHeaderCount++;
        if (nextHeaderLine === -1) nextHeaderLine = j;
      }
    }

    // Real section: next SECTION marker is far away, OR no other markers in window
    if (nextHeaderCount === 0 || (nextHeaderLine - i) > 30) {
      return i;
    }
  }
  return 0;
}

// ============================================================================
// Volume parsing
// ============================================================================

export function parseVolume(filePath: string, defaultParva: string | null = null): RawSection[] {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split("\n");

  // Pre-scan the ENTIRE file (including title page before TOC) to find which
  // parvas the volume contains. Title-page headers like "DRONA PARVA" often
  // live in lines 1-50, which TOC-skip would miss.
  const titlePageParvas: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 200); i++) {
    const slug = detectParva(lines[i]);
    if (slug && !titlePageParvas.includes(slug)) titlePageParvas.push(slug);
  }
  if (titlePageParvas.length > 0) {
    console.error(`[parse] Title-page parvas detected: ${titlePageParvas.join(", ")}`);
  }

  const realStart = findRealSectionStart(lines);
  console.error(`[parse] TOC ends at line ${realStart}; real content starts here.`);

  const sections: RawSection[] = [];
  let currentSection: RawSection | null = null;
  // Default the parva to either the explicit CLI override, or the FIRST
  // parva detected in the title page (single-parva volumes), or null.
  let currentParva: string | null =
    defaultParva || (titlePageParvas.length === 1 ? titlePageParvas[0] : null);
  // Per-parva last successful section number, for OCR-recovery context
  const lastSectionByParva: Record<string, number> = {};

  for (let i = realStart; i < lines.length; i++) {
    const line = lines[i];

    // Parva boundary detection (only on lines with no trailing digits)
    const parvaSlug = detectParva(line);
    if (parvaSlug) {
      currentParva = parvaSlug;
      continue;
    }

    // Section header detection
    const m = line.match(SECTION_HEADER);
    if (m) {
      if (currentSection) sections.push(currentSection);
      const parvaKey = currentParva || "unknown";
      const prevSec = lastSectionByParva[parvaKey] || 0;
      const sectionNum = romanToInt(m[1], prevSec);
      if (sectionNum < 0 || sectionNum > 1000) {
        console.error(`[parse] Skipping invalid section ${m[1]} at line ${i + 1}`);
        currentSection = null;
        continue;
      }
      // Detect parva-sequence reset (section drops back to 1) — used by Vol 12
      // to switch from ashvamedhika → asramavasika → mausala → mahaprasthanika
      // → svargarohana when Roy uses no body parva headers for some.
      if (sectionNum < prevSec && sectionNum === 1) {
        // Caller should set this via parva detection. No-op here; just reset.
        lastSectionByParva[parvaKey] = 0;
      }
      lastSectionByParva[parvaKey] = sectionNum;
      currentSection = {
        parva: parvaKey,
        section: sectionNum,
        rawText: "",
        hasFooter: false,
        startLine: i + 1,
      };
      continue;
    }

    // Append to current section body
    if (currentSection) {
      currentSection.rawText += line + "\n";
      if (SECTION_FOOTER.test(line)) currentSection.hasFooter = true;
    }
  }

  if (currentSection) sections.push(currentSection);
  return sections;
}

// ============================================================================
// Chunking
// ============================================================================

// Split an oversize paragraph at sentence boundaries (period + space + capital).
// Greedy: pack sentences into ~maxWords-sized buckets; never crosses a
// sentence boundary mid-stream.
function splitOversizeParagraph(para: string, maxWords: number): string[] {
  const words = para.split(/\s+/).filter(Boolean).length;
  if (words <= maxWords) return [para];

  // Sentence boundary: period/!/? followed by whitespace then a capital letter
  // OR the literal Hindi-script ending punctuation. Roy is English so just .!?
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

// Speaker label heuristic — preserve "X said,—" or "X replied,—" at chunk start
// when a long paragraph is split, so retrieval surfaces speaker context.
function findSpeakerPrefix(text: string): string | null {
  const m = text.match(/^("?[A-Z][a-zA-Z\- ]{1,40}\s+(?:said|replied|continued|asked|answered),\s*[—-])/);
  return m ? m[1] : null;
}

export function chunkProse(section: RawSection, maxWords = 300): Chunk[] {
  const cleaned = cleanSectionText(section.rawText);
  const paragraphs = cleaned.split(/\n\n+/).filter(p => p.trim().length > 0);

  // Section-level warnings (informational, not blocking)
  const sectionWarnings: string[] = [];
  if (!section.hasFooter) sectionWarnings.push("no-footer");
  // Sections in parvas where no footers exist anywhere (e.g., Udyoga in Roy
  // editing) — this is by design. Don't double-warn.

  const chunks: Chunk[] = [];
  let buf: string[] = [];
  let bufWords = 0;
  let chunkN = 1;
  let speakerCtx: string | null = null;

  // Speaker markers — chunks below the size threshold are kept ONLY if they
  // contain one of these (i.e. they're a legitimate short dialogue fragment,
  // not footnote/page-header detritus).
  const SPEAKER_RE = /\b(said|replied|continued|inquired|asked|answered|exclaimed|spoke)\b/i;
  const MIN_WORDS = 30;

  const flush = () => {
    if (buf.length === 0) return;
    const text = buf.join("\n\n").trim();
    const wc = text.split(/\s+/).filter(Boolean).length;
    if (wc < MIN_WORDS && !SPEAKER_RE.test(text)) {
      // Drop sub-30-word fragments that lack speaker markers — these are
      // footnotes, page-header leaks, or OCR debris the cleaner missed.
      buf = [];
      bufWords = 0;
      return;
    }
    if (wc < 5) {
      buf = [];
      bufWords = 0;
      return;
    }
    chunks.push({
      reference: `mb_${section.parva}_${section.section}_${chunkN}`,
      parva: section.parva,
      section: section.section,
      chunkN,
      english: text,
      wordCount: wc,
      warnings: [...sectionWarnings],
    });
    chunkN++;
    buf = [];
    bufWords = 0;
  };

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).filter(Boolean).length;

    // Track current speaker context for downstream use in oversize splits
    const sp = findSpeakerPrefix(para);
    if (sp) speakerCtx = sp;

    if (paraWords > maxWords) {
      // Flush current buf first
      flush();
      // Split oversize paragraph mid-sentence
      const pieces = splitOversizeParagraph(para, maxWords);
      pieces.forEach((piece, i) => {
        // Continuation pieces get speaker prefix re-attached for retrieval context
        const text =
          i === 0 || !speakerCtx || piece.startsWith(speakerCtx)
            ? piece
            : `${speakerCtx} (continued) ${piece}`;
        const wc = text.split(/\s+/).filter(Boolean).length;
        if (wc < 5) return;
        chunks.push({
          reference: `mb_${section.parva}_${section.section}_${chunkN}${String.fromCharCode(97 + i)}`,
          parva: section.parva,
          section: section.section,
          chunkN,
          english: text,
          wordCount: wc,
          warnings: [...sectionWarnings, "split-oversize-paragraph"],
        });
      });
      chunkN++;
      continue;
    }

    if (bufWords + paraWords > maxWords && buf.length > 0) {
      flush();
    }
    buf.push(para);
    bufWords += paraWords;
  }

  flush();
  return chunks;
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find(a => a.endsWith(".txt"));
  const sampleMode = args.includes("--sample");
  const parvaFilter = args.find(a => a.startsWith("--parva="))?.split("=")[1];
  const defaultParva = args.find(a => a.startsWith("--default-parva="))?.split("=")[1] || null;
  const sectionsArg = args.find(a => a.startsWith("--sections="))?.split("=")[1];
  const sectionFilter = sectionsArg
    ? sectionsArg.split(",").map(n => parseInt(n, 10))
    : null;

  if (!filePath) {
    console.error("Usage: parse-mahabharata.ts <vol.txt> [--sample] [--parva=udyoga] [--default-parva=drona] [--sections=71,92,130]");
    process.exit(1);
  }

  console.error(`\n=== Parsing ${filePath} ===\n`);
  const sections = parseVolume(filePath, defaultParva);
  console.error(`Total sections found: ${sections.length}`);

  // Per-parva summary
  const byParva: Record<string, RawSection[]> = {};
  for (const s of sections) {
    (byParva[s.parva] ||= []).push(s);
  }
  for (const [parva, list] of Object.entries(byParva)) {
    const nums = list.map(s => s.section).sort((a, b) => a - b);
    const footers = list.filter(s => s.hasFooter).length;
    console.error(
      `  ${parva}: ${list.length} sections (${nums[0]}–${nums[nums.length - 1]}), footer-agreement ${footers}/${list.length}`
    );
  }

  let work = sections;
  if (parvaFilter) work = work.filter(s => s.parva === parvaFilter);
  if (sectionFilter) work = work.filter(s => sectionFilter.includes(s.section));

  if (sampleMode) {
    console.error(`\n=== Sample chunk preview (${work.length} sections selected) ===\n`);
    let allChunks: Chunk[] = [];
    for (const s of work) {
      allChunks = allChunks.concat(chunkProse(s, 300));
    }
    const samples = allChunks.slice(0, 5);
    console.log(JSON.stringify(samples, null, 2));
    console.error(`\n${samples.length} sample chunks emitted.`);
    return;
  }

  // Full output mode
  const allChunks: Chunk[] = [];
  for (const s of work) {
    allChunks.push(...chunkProse(s, 300));
  }
  console.log(JSON.stringify(allChunks, null, 2));
  console.error(`\n${allChunks.length} chunks emitted.`);
}

// Only run main() when invoked directly (not when imported).
const invokedDirectly =
  typeof process.argv[1] === "string" &&
  /parse-mahabharata\.[tj]s$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch(e => {
    console.error("Fatal:", e);
    process.exit(1);
  });
}
