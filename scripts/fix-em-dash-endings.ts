// Phase 1.5 post-process repair for em-dash chunk-boundary artifacts.
//
// Problem: 140 of 1,844 chunks in data/mahabharata-regenerated.json end
// on a trailing em-dash where the following chunk continues the same
// sentence. CLAUDE.md forbids non-terminal endings, but the simple fix
// "replace — with ।" terminates sentences mid-clause for ~7 of 10 cases.
// Root cause is the upstream chunker (scripts/parse-mahabharata.ts) which
// split sections at the original Ganguli edition's line endings, sometimes
// mid-sentence. This script merges those split pairs back into single
// chunks, restoring the original sentence boundaries.
//
// Also strips translator-citation footnotes ("— T.", "— Tr.", "— टी.") that
// appear after a properly terminated sentence and add nothing to retrieval.
//
// Reads:  data/mahabharata-regenerated.json  (untouched)
// Writes: data/mahabharata-regenerated-cleaned.json
//
// Invocation:
//   tsx scripts/fix-em-dash-endings.ts --dry-run    # preview; no writes
//   tsx scripts/fix-em-dash-endings.ts               # full run

import fs from "node:fs";

const INPUT_PATH = "data/mahabharata-regenerated.json";
const OUTPUT_PATH = "data/mahabharata-regenerated-cleaned.json";

const DRY_RUN = process.argv.includes("--dry-run");
const DRY_RUN_PREVIEW = 20;
const MAX_CHAIN_DEPTH = 5;
const OVERSIZE_THRESHOLD = 600;

// Footnote suffix variants. User spec gave the ASCII form; widened to also
// match Devanagari टी. since the regenerated Hindi uses Devanagari for the
// translator initial (2 chunks observed in this corpus, 0 ASCII matches).
// Both forms appear AFTER a properly terminated sentence (ending in । etc.)
// so removal is safe — they are bibliographic, not narrative.
const FOOTNOTE_RE_ASCII = /\s*— ?[T][rT.]?\.\s*$/;
const FOOTNOTE_RE_DEVANAGARI = /\s*— ?टी\s*\.?\s*$/;

// Trailing decoration (whitespace + closing quotes/parens) that doesn't
// affect terminal-punctuation classification but must be stripped before
// inspecting the final glyph.
const TRAILING_DECOR_RE = /[\s"'‘’“”)\]\}]+$/;

// Em-dash family — model occasionally emits en-dash or hyphen at terminal
// position; treat any of them as the same artifact.
const DASH_CHARS = new Set(["—", "–", "-"]);

// Valid terminal marks per CLAUDE.md ("। ! ?") plus "॥" (Sanskrit double
// danda used at parva/section closes — observed once in mb_mausala_8_5).
const VALID_TERMINAL = new Set(["।", "!", "?", "॥"]);

type Chunk = {
  reference: string;
  parva: string;
  section: number;
  chunkN: number;
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

// Strip trailing dash + adjacent whitespace/quote decoration. Used at the
// merge seam: prev.hindi ends in " —", next chunk continues the sentence,
// so we drop the dangling dash before joining.
function stripTrailingDash(s: string): string {
  return s.replace(/[\s"'‘’“”)\]\}—–-]+$/, "").trimEnd();
}

// Merged-chunk reference: keep the base ref; drop sub-chunk letter suffix
// (e.g. "mb_adi_223_1b" → "mb_adi_223_1") since the merge re-unifies what
// the chunker had split. Refs without a letter suffix are left as-is.
//
// Collision guard: in two sections of the corpus (drona 40, bhishma 108)
// the upstream parser produced both an unsuffixed `_N` chunk AND suffixed
// `_Na`/`_Nb` siblings — likely a parser artifact where a re-detected
// section header reset chunkN mid-section. If our suffix-drop would
// collide with an existing ref, fall back to keeping the suffixed form.
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
  console.log();

  // ===== Pass 1: footnote strip =====
  // Done first so a hypothetical chunk with both a footnote AND an em-dash
  // continuation gets the footnote removed before the em-dash merge logic
  // sees it. (Not observed in current corpus, but defensive per spec.)
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
  // Track which refs are currently in use so the suffix-drop step can
  // fall back when it would create a duplicate ref.
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

      // Defensive: refuse to merge across parva boundaries. (Empirically zero
      // such cases in this corpus, but a categorical error if it ever happens.)
      if (next.parva !== cur.parva) break;

      const mergedHindi = stripTrailingDash(cur.hindi) + " " + next.hindi;
      const mergedEnglish = stripTrailingDash(cur.english) + " " + next.english;
      const mergedWarnings = Array.from(new Set([...(cur.warnings || []), ...(next.warnings || [])]));
      const newRef = dropSubChunkSuffix(cur.reference, refsInUse);

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
  // Chunks that still don't end on a valid terminal mark after this fix.
  // These are mid-word/ellipsis truncations and are out of scope here.
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
      `# Em-dash merge — oversize (>${OVERSIZE_THRESHOLD}w) flagged for manual review`,
      ``,
      `**Generated:** ${new Date().toISOString()}`,
      `**Total flagged:** ${flaggedOversize.length}`,
      ``,
      `These merged chunks exceeded ${OVERSIZE_THRESHOLD} words. Review for whether the merge is sensible or whether the chunks should be split for embedding quality.`,
      ``,
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
    fs.writeFileSync("test-results/merges-flagged-oversize.md", lines.join("\n"), "utf8");
    console.log(`Wrote oversize flags: test-results/merges-flagged-oversize.md`);
  }

  if (flaggedDeep.length > 0) {
    const lines: string[] = [
      `# Em-dash merge — deep chains (≥${MAX_CHAIN_DEPTH}) flagged for manual review`,
      ``,
      `**Generated:** ${new Date().toISOString()}`,
      `**Total flagged:** ${flaggedDeep.length}`,
      ``,
      `These chains hit the depth cap of ${MAX_CHAIN_DEPTH} merges without reaching a valid terminal mark. Likely indicates a deeper chunker artifact (e.g. a long enumerated list spread across many chunks).`,
      ``,
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
    fs.writeFileSync("test-results/merges-flagged-deep.md", lines.join("\n"), "utf8");
    console.log(`Wrote deep-chain flags: test-results/merges-flagged-deep.md`);
  }
}

main();
