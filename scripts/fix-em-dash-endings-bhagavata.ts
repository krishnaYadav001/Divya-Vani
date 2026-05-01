// Bhagavata em-dash chunk-boundary repair. Reusable across Phase 1.6
// (Canto 10) and Phase 1.7+ (Canto 11.6–29 Uddhava Gita).
// Sibling to scripts/fix-em-dash-endings.ts (Phase 1.5).
//
// Problem (carried forward from Phase 1.6): some regenerated chunks end on
// a trailing em-dash where the following chunk continues the same sentence
// (CLAUDE.md forbids non-terminal endings). Root cause is the parser's
// paragraph batching cutting at dialogue-intro lines like "X said —" with
// the actual quoted speech in the next chunk. This script merges split
// pairs back, restoring the original sentence boundaries.
//
// Phase 1.6 evidence: 63 of 633 chunks merged → 568 final chunks (62
// resolved cleanly, 1 unresolved deep chain, 2 oversize merges flagged).
//
// Inherited Phase 1.6 behaviors:
//   - Chunk type uses canto/chapter/verseStart/verseEnd/fallbackChunkN
//   - Merge boundary: refuse to merge across CHAPTER (not parva)
//   - Reference suffix-drop: handles both anchored (dot) and fallback
//     (underscore) reference forms
//   - Translator-footnote strip retained from MB (will likely match 0
//     in Sanyal source, kept defensively)
//
// CLI flags (added Phase 1.7):
//   --input=<path>    Regenerated chunks JSON. Default
//                     data/bhagavata-regenerated.json (Canto 10 backcompat).
//                     Phase 1.7: data/bhagavata-canto11-regenerated.json.
//   --output=<path>   Cleaned chunks JSON. Default
//                     data/bhagavata-regenerated-cleaned.json.
//                     Phase 1.7: data/bhagavata-canto11-regenerated-cleaned.json.
//   --dry-run         Preview merges + footnote strips, no files written.
//
// Canto-aware: flagged-merge report paths auto-derive from chunks[0].canto:
//   test-results/bhagavata-canto<N>-merges-flagged-{oversize,deep}.md.
//
// Invocation:
//   # Phase 1.6 default (Canto 10):
//   npm run fix:bhagavata-em-dash:dry  # preview
//   npm run fix:bhagavata-em-dash       # full run
//   # Phase 1.7 (Canto 11.6–29):
//   npm run fix:bhagavata-em-dash:canto11:dry
//   npm run fix:bhagavata-em-dash:canto11

import fs from "node:fs";

function parseCli() {
  const args = process.argv.slice(2);
  const get = (name: string): string | null => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.slice(`--${name}=`.length) : null;
  };
  return {
    inputPath: get("input") ?? "data/bhagavata-regenerated.json",
    outputPath: get("output") ?? "data/bhagavata-regenerated-cleaned.json",
    dryRun: args.includes("--dry-run"),
  };
}
const CLI = parseCli();
const INPUT_PATH = CLI.inputPath;
const OUTPUT_PATH = CLI.outputPath;
const DRY_RUN = CLI.dryRun;
const DRY_RUN_PREVIEW = 20;
const MAX_CHAIN_DEPTH = 5;
const OVERSIZE_THRESHOLD = 600;

// Footnote suffix variants — kept from MB defensively. Sanyal djvu_txt
// shows no translator-citation footnotes in spot checks; expected matches: 0.
const FOOTNOTE_RE_ASCII = /\s*— ?[T][rT.]?\.\s*$/;
const FOOTNOTE_RE_DEVANAGARI = /\s*— ?टी\s*\.?\s*$/;

const TRAILING_DECOR_RE = /[\s"'‘’“”)\]\}]+$/;
const DASH_CHARS = new Set(["—", "–", "-"]);
const VALID_TERMINAL = new Set(["।", "!", "?", "॥"]);

type Chunk = {
  reference: string;
  canto: number;
  chapter: number;
  verseStart: number | null;
  verseEnd: number | null;
  fallbackChunkN: number | null;
  english: string;
  wordCount: number;
  warnings: string[];
  hindi: string;
};

function endsOnDash(hindi: string): boolean {
  const stripped = hindi.replace(TRAILING_DECOR_RE, "");
  return DASH_CHARS.has(stripped.slice(-1));
}

function endsValidTerminal(hindi: string): boolean {
  const stripped = hindi.replace(TRAILING_DECOR_RE, "");
  return VALID_TERMINAL.has(stripped.slice(-1));
}

function stripTrailingDash(s: string): string {
  return s.replace(/[\s"'‘’“”)\]\}—–-]+$/, "").trimEnd();
}

// Merged-chunk reference: drop trailing letter suffix on the digit segment
// (e.g. "bhagavata_10.9.12a" → "bhagavata_10.9.12"). Same regex works for
// both anchored ("...12a") and fallback ("..._3a") forms — both end in
// digits + optional lowercase letters. If suffix-drop would collide with
// an existing ref, keep the suffixed form.
function dropSubChunkSuffix(ref: string, takenRefs: Set<string>): string {
  const candidate = ref.replace(/([0-9]+)[a-z]+$/, "$1");
  if (candidate !== ref && takenRefs.has(candidate)) return ref;
  return candidate;
}

function previewTail(s: string, n = 120): string {
  return s.replace(/\s+/g, " ").trim().slice(-n);
}

type MergeRecord = {
  base: string;
  chain: string[];
  chainDepth: number;
  mergedRef: string;
  mergedWordCount: number;
  hindiBefore: string;
  hindiAfter: string;
  englishBefore: string;
  englishAfter: string;
  resolvedToTerminal: boolean;
};

type FootnoteStrip = {
  ref: string;
  before: string;
  after: string;
  flavor: "ascii" | "devanagari";
};

function main() {
  const raw = fs.readFileSync(INPUT_PATH, "utf8");
  const data: Chunk[] = JSON.parse(raw);
  const chunksBefore = data.length;
  console.log(`Loaded ${chunksBefore} chunks from ${INPUT_PATH}`);
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "FULL (writes to " + OUTPUT_PATH + ")"}`);

  // Auto-detect canto. All chunks must share the same canto. Used to scope
  // flagged-merge report filenames per canto so Phase 1.6 and 1.7 reports
  // don't collide.
  if (data.length === 0) throw new Error(`No chunks in ${INPUT_PATH}`);
  const detectedCanto = data[0].canto;
  const stragglers = data.filter(c => c.canto !== detectedCanto);
  if (stragglers.length > 0) {
    throw new Error(
      `Mixed-canto input: ${stragglers.length} chunks have canto != ${detectedCanto} (first: ${stragglers[0].reference}).`,
    );
  }
  console.log(`Detected canto: ${detectedCanto}`);
  console.log();

  // ===== Pass 1: footnote strip (defensive; expected 0 in Sanyal source) =====
  const footnoteStrips: FootnoteStrip[] = [];
  for (const c of data) {
    let before = c.hindi;
    if (FOOTNOTE_RE_ASCII.test(c.hindi)) {
      c.hindi = c.hindi.replace(FOOTNOTE_RE_ASCII, "").trimEnd();
      footnoteStrips.push({ ref: c.reference, before, after: c.hindi, flavor: "ascii" });
      continue;
    }
    if (FOOTNOTE_RE_DEVANAGARI.test(c.hindi)) {
      c.hindi = c.hindi.replace(FOOTNOTE_RE_DEVANAGARI, "").trimEnd();
      footnoteStrips.push({ ref: c.reference, before, after: c.hindi, flavor: "devanagari" });
    }
  }

  // ===== Pass 2: em-dash merges (iterative chains) =====
  const merges: MergeRecord[] = [];
  const refsInUse = new Set<string>(data.map(c => c.reference));
  let i = 0;
  while (i < data.length - 1) {
    if (!endsOnDash(data[i].hindi)) { i++; continue; }

    const baseRef = data[i].reference;
    const baseHindi = data[i].hindi;
    const baseEnglish = data[i].english;
    const chain: string[] = [data[i].reference];

    let depth = 0;
    while (depth < MAX_CHAIN_DEPTH && i + 1 < data.length) {
      const cur = data[i];
      const next = data[i + 1];

      // Refuse to merge across chapter boundaries — chapter content is the
      // structural unit here, analogous to parva in MB. Empirically should
      // be zero such cases (chapter-final paragraphs are typically the
      // narrator's closing line, properly terminated).
      if (next.chapter !== cur.chapter) break;

      const mergedHindi = stripTrailingDash(cur.hindi) + " " + next.hindi;
      const mergedEnglish = stripTrailingDash(cur.english) + " " + next.english;
      const mergedWarnings = Array.from(new Set([...(cur.warnings || []), ...(next.warnings || [])]));
      const newRef = dropSubChunkSuffix(cur.reference, refsInUse);

      // Carry forward the anchor info from the merged-base chunk.
      // verseEnd extends to whichever non-null verseEnd exists in the pair
      // (next.verseEnd if set, else current's). fallbackChunkN: if base was
      // anchored, stays null; if base was fallback, keep its number.
      const newVerseEnd = next.verseEnd ?? cur.verseEnd;

      refsInUse.delete(cur.reference);
      refsInUse.delete(next.reference);
      refsInUse.add(newRef);

      data[i] = {
        ...cur,
        reference: newRef,
        hindi: mergedHindi,
        english: mergedEnglish,
        wordCount: cur.wordCount + next.wordCount,
        warnings: mergedWarnings,
        verseEnd: newVerseEnd,
      };
      chain.push(next.reference);
      data.splice(i + 1, 1);
      depth++;

      if (!endsOnDash(data[i].hindi)) break;
    }

    const merged = data[i];
    const resolved = !endsOnDash(merged.hindi);
    merges.push({
      base: baseRef,
      chain,
      chainDepth: depth,
      mergedRef: merged.reference,
      mergedWordCount: merged.wordCount,
      hindiBefore: baseHindi,
      hindiAfter: merged.hindi,
      englishBefore: baseEnglish,
      englishAfter: merged.english,
      resolvedToTerminal: resolved,
    });

    i++;
  }

  const flaggedOversize = merges.filter(m => m.mergedWordCount > OVERSIZE_THRESHOLD);
  const flaggedDeep = merges.filter(m => !m.resolvedToTerminal);

  // ===== Remaining quality issues (informational) =====
  const remaining: Array<{ ref: string; tail: string }> = [];
  for (const c of data) {
    if (!endsValidTerminal(c.hindi) && !endsOnDash(c.hindi)) {
      remaining.push({ ref: c.reference, tail: previewTail(c.hindi, 80) });
    }
  }

  // ===== Report =====
  console.log(`=== Summary ===`);
  console.log(`Footnote strips applied:       ${footnoteStrips.length}`);
  console.log(`  ascii ("— T."/"— Tr."):       ${footnoteStrips.filter(f => f.flavor === "ascii").length}`);
  console.log(`  devanagari ("— टी."):         ${footnoteStrips.filter(f => f.flavor === "devanagari").length}`);
  console.log(`Em-dash merges applied:        ${merges.length}`);
  console.log(`  resolved to terminal punct:  ${merges.filter(m => m.resolvedToTerminal).length}`);
  console.log(`  unresolved at depth ${MAX_CHAIN_DEPTH}:        ${flaggedDeep.length}`);
  console.log(`  oversize (>${OVERSIZE_THRESHOLD}w):              ${flaggedOversize.length}`);
  console.log();
  console.log(`Chunks before: ${chunksBefore}`);
  console.log(`Chunks after:  ${data.length}`);
  console.log(`Net delta:     ${data.length - chunksBefore}`);
  console.log();
  console.log(`Remaining non-terminal chunks (out of scope, informational): ${remaining.length}`);
  for (const r of remaining.slice(0, 5)) {
    console.log(`  ${r.ref}  ::  ...${r.tail}`);
  }
  if (remaining.length > 5) console.log(`  …and ${remaining.length - 5} more`);
  console.log();

  if (DRY_RUN) {
    console.log(`=== Dry-run preview: first ${DRY_RUN_PREVIEW} merges ===\n`);
    for (const m of merges.slice(0, DRY_RUN_PREVIEW)) {
      const status = m.resolvedToTerminal ? "RESOLVED" : `UNRESOLVED@${m.chainDepth}`;
      console.log(`── ${m.base} → ${m.mergedRef}  (depth ${m.chainDepth}, ${m.mergedWordCount}w, ${status}) ──`);
      console.log(`   chain:  ${m.chain.join(" + ")}`);
      console.log(`   BEFORE: ...${previewTail(m.hindiBefore)}`);
      console.log(`   AFTER:  ...${previewTail(m.hindiAfter)}`);
      console.log();
    }

    if (footnoteStrips.length > 0) {
      console.log(`=== Footnote strip preview (all ${footnoteStrips.length}) ===\n`);
      for (const s of footnoteStrips) {
        console.log(`   ${s.ref}  [${s.flavor}]`);
        console.log(`     BEFORE: ...${previewTail(s.before, 80)}`);
        console.log(`     AFTER:  ...${previewTail(s.after, 80)}`);
      }
    }
    console.log();
    console.log(`[DRY-RUN] No files written.`);
    return;
  }

  // ===== Persist =====
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), "utf8");
  console.log(`Wrote: ${OUTPUT_PATH}`);

  fs.mkdirSync("test-results", { recursive: true });

  if (flaggedOversize.length > 0) {
    const lines: string[] = [
      `# Bhagavata Canto ${detectedCanto} em-dash merge — oversize (>${OVERSIZE_THRESHOLD}w) flagged for manual review`,
      ``,
      `**Generated:** ${new Date().toISOString()}`,
      `**Total flagged:** ${flaggedOversize.length}`,
      ``,
    ];
    for (const m of flaggedOversize) {
      lines.push(`## ${m.mergedRef}  (${m.mergedWordCount}w, chain depth ${m.chainDepth})`);
      lines.push(``);
      lines.push(`**Chain:** ${m.chain.join(" + ")}`);
      lines.push(``);
      lines.push(`**Hindi (last 240 chars):**`);
      lines.push(``);
      lines.push(`> …${previewTail(m.hindiAfter, 240)}`);
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }
    const oversizePath = `test-results/bhagavata-canto${detectedCanto}-merges-flagged-oversize.md`;
    fs.writeFileSync(oversizePath, lines.join("\n"), "utf8");
    console.log(`Wrote oversize flags: ${oversizePath}`);
  }

  if (flaggedDeep.length > 0) {
    const lines: string[] = [
      `# Bhagavata Canto ${detectedCanto} em-dash merge — deep chains (≥${MAX_CHAIN_DEPTH}) flagged for manual review`,
      ``,
      `**Generated:** ${new Date().toISOString()}`,
      `**Total flagged:** ${flaggedDeep.length}`,
      ``,
    ];
    for (const m of flaggedDeep) {
      lines.push(`## ${m.mergedRef}  (${m.mergedWordCount}w, chain depth ${m.chainDepth})`);
      lines.push(``);
      lines.push(`**Chain:** ${m.chain.join(" + ")}`);
      lines.push(``);
      lines.push(`**Hindi (last 240 chars):**`);
      lines.push(``);
      lines.push(`> …${previewTail(m.hindiAfter, 240)}`);
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }
    const deepPath = `test-results/bhagavata-canto${detectedCanto}-merges-flagged-deep.md`;
    fs.writeFileSync(deepPath, lines.join("\n"), "utf8");
    console.log(`Wrote deep-chain flags: ${deepPath}`);
  }
}

main();
