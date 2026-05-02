// Phase 2 retrieval regression-test harness. Runs a fixed 12-query set
// (6 failing-from-prior-phases + 6 passing-from-prior-phases) against the
// current retrieval pipeline and emits a human-readable md report.
//
// Re-run after each Phase 2 layer enable (baseline → L1 → L1+L2 → all-three)
// to measure failing-query gains and passing-query regressions.
//
// One-off, NOT in package.json. Invoke via:
//   tsx --env-file=.env.local scripts/retrieval-regression-test.ts
//
// Optional CLI flags:
//   --label=<baseline|layer1|layer1-2|final>   suffix in output filename
//   --date=<YYYY-MM-DD>                        override date in output filename
//   --theme-rerank=<true|false>                Layer-1 theme-overlap rerank
//                                              (default: env RAG_LAYER_THEME_RERANK
//                                              or false at the harness layer to
//                                              keep baseline reproducible)
//   --candidates-k=<int>                       candidates fetched before rerank
//                                              (default 30)
//   --theme-weight=<float>                     theme overlap weight (default 0.3)
//
// Imports the production retrieval pipeline (fetchCandidates +
// rerankByTheme + classifyQueryThemes) so the harness exercises the SAME
// code path as /api/chat/route.ts, not a parallel implementation.

import fs from "node:fs";
import {
  fetchCandidates,
  fetchCandidatesMultiQuery,
  rerankByTheme,
  applyDiversityBoost,
  type VerseHit,
} from "../src/lib/verses";
import { classifyQueryThemes, rewriteQuery } from "../src/lib/queryThemes";

type Source = "gita" | "mahabharata" | "bhagavata" | "unknown";
type Hit = VerseHit;

type SourceCounts = { gita: number; mahabharata: number; bhagavata: number };

// Phase 2 query set. Failing queries: prior-phase quality-gate outputs
// where Bhagavata/MBh expected but Gita dominated top-5. Passing queries:
// prior-phase outputs where the expected source already wins; the Phase 2
// regression criterion is "no source count drops below baseline" (not
// top-1 identity — see Step 2.0a founder note).
//
// `baseline_source_counts` is the top-5 source distribution observed on
// the 2026-05-02 baseline run (no Phase 2 layers enabled). Phase 2 layer
// runs are scored against these floors:
//   - PASSING_QUERIES: each_source_count >= baseline → no regression
//   - FAILING_QUERIES: bhagavata/mbh sum > baseline sum → improvement
const FAILING_QUERIES = [
  // Phase 1.5
  { id: "Q1.5.1", query: "मैं अकेला सही पक्ष में हूँ",                expect_source_gain: ["mahabharata", "bhagavata"] as Source[], baseline_source_counts: { gita: 3, mahabharata: 2, bhagavata: 0 } as SourceCounts },
  { id: "Q1.5.2", query: "I'm angry at someone close",                  expect_source_gain: ["mahabharata"] as Source[],                baseline_source_counts: { gita: 3, mahabharata: 2, bhagavata: 0 } as SourceCounts },
  // Phase 1.6
  { id: "Q1.6.1", query: "मैं छोटी सी ख़ुशी महसूस कर रहा हूँ",         expect_source_gain: ["bhagavata"] as Source[],                  baseline_source_counts: { gita: 4, mahabharata: 1, bhagavata: 0 } as SourceCounts },
  { id: "Q1.6.2", query: "I'm overwhelmed and want to surrender",       expect_source_gain: ["bhagavata", "mahabharata"] as Source[], baseline_source_counts: { gita: 5, mahabharata: 0, bhagavata: 0 } as SourceCounts },
  // Phase 1.7
  { id: "Q1.7.1", query: "I want to surrender but don't know how",      expect_source_gain: ["bhagavata"] as Source[],                  baseline_source_counts: { gita: 5, mahabharata: 0, bhagavata: 0 } as SourceCounts },
  { id: "Q1.7.2", query: "What is real renunciation?",                  expect_source_gain: ["bhagavata"] as Source[],                  baseline_source_counts: { gita: 5, mahabharata: 0, bhagavata: 0 } as SourceCounts },
];

const PASSING_QUERIES = [
  { id: "Q1.5.3", query: "I'm being mistreated unfairly",                          baseline_source_counts: { gita: 0, mahabharata: 5, bhagavata: 0 } as SourceCounts },
  { id: "Q1.6.3", query: "बारिश में चाय पी, बहुत अच्छा लगा",                    baseline_source_counts: { gita: 0, mahabharata: 0, bhagavata: 5 } as SourceCounts },
  { id: "Q1.6.4", query: "I miss someone deeply",                                  baseline_source_counts: { gita: 1, mahabharata: 3, bhagavata: 1 } as SourceCounts },
  { id: "Q1.7.3", query: "मुझे रोज़मर्रा की ज़िंदगी में भक्ति कैसे करनी है?",   baseline_source_counts: { gita: 2, mahabharata: 0, bhagavata: 3 } as SourceCounts },
  { id: "Q1.7.4", query: "I learn from everything around me",                      baseline_source_counts: { gita: 1, mahabharata: 1, bhagavata: 3 } as SourceCounts },
  { id: "Q1.7.5", query: "मुझे संसार से वैराग्य हो गया है",                       baseline_source_counts: { gita: 2, mahabharata: 1, bhagavata: 2 } as SourceCounts },
];

function sourceFromRef(ref: string): Source {
  if (ref.startsWith("gita_")) return "gita";
  if (ref.startsWith("mb_")) return "mahabharata";
  if (ref.startsWith("bhagavata_")) return "bhagavata";
  return "unknown";
}

// Per-query retrieval mirroring the production pipeline:
//   0. rewriteQuery + fetchCandidatesMultiQuery (if --query-rewrite=true)
//   1. fetchCandidates(query, candidatesK) — single-query path otherwise
//   2. rerankByTheme (if --theme-rerank=true)
//   3. applyDiversityBoost (if --source-diversity=true)
// With all flags off this is straight cosine top-k from match_verses.
async function search(
  query: string,
  k: number,
  opts: {
    themeRerank: boolean;
    sourceDiversity: boolean;
    queryRewrite: boolean;
    candidatesK: number;
    themeWeight: number;
    diversityCosineThreshold: number;
    diversityScopeK: number;
    rewriteVariants: number;
    rewritePerVariantK: number;
  },
): Promise<{ hits: Hit[]; queryThemes: string[]; variants: string[] }> {
  const wantWidePool = opts.themeRerank || opts.sourceDiversity || opts.queryRewrite;
  const fetchK = wantWidePool ? opts.candidatesK : k;

  // Run the Haiku classifier (Layer 1 input) in parallel with the
  // candidate fetch (which itself may include Layer-3 rewrite-Haiku).
  // Total wall-clock is bounded by the slowest leg.
  const classifierPromise = opts.themeRerank
    ? classifyQueryThemes(query)
    : Promise.resolve<string[]>([]);

  async function gatherCandidates(): Promise<{ hits: VerseHit[]; variants: string[] }> {
    if (!opts.queryRewrite) {
      const hits = await fetchCandidates(query, fetchK);
      return { hits, variants: [query] };
    }
    const variants = await rewriteQuery(query, opts.rewriteVariants);
    const hits = await fetchCandidatesMultiQuery(variants, fetchK, opts.rewritePerVariantK);
    return { hits, variants };
  }

  const [queryThemes, gathered] = await Promise.all([
    classifierPromise,
    gatherCandidates(),
  ]);
  const candidates = gathered.hits;

  let reranked = candidates;
  if (opts.themeRerank && queryThemes.length > 0) {
    reranked = rerankByTheme(candidates, queryThemes, opts.themeWeight);
  }

  let hits: Hit[];
  if (opts.sourceDiversity) {
    hits = applyDiversityBoost(reranked, k, opts.diversityCosineThreshold, opts.diversityScopeK);
  } else {
    hits = reranked.slice(0, k);
  }
  return { hits, queryThemes, variants: gathered.variants };
}

function preview(text: string, n = 80): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, n);
}

function diversityScore(sources: Source[]): number {
  const distinct = new Set(sources.filter(s => s !== "unknown")).size;
  return distinct / 3;
}

function sourceCounts(sources: Source[]): SourceCounts {
  return {
    gita: sources.filter(s => s === "gita").length,
    mahabharata: sources.filter(s => s === "mahabharata").length,
    bhagavata: sources.filter(s => s === "bhagavata").length,
  };
}

// Compute per-source deltas (current − baseline). Negative = drop = regression.
function deltaCounts(current: SourceCounts, baseline: SourceCounts): SourceCounts {
  return {
    gita: current.gita - baseline.gita,
    mahabharata: current.mahabharata - baseline.mahabharata,
    bhagavata: current.bhagavata - baseline.bhagavata,
  };
}

function fmtCounts(c: SourceCounts): string {
  return `gita=${c.gita}, mbh=${c.mahabharata}, bhagavata=${c.bhagavata}`;
}

function fmtDeltas(d: SourceCounts): string {
  const part = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  return `Δgita=${part(d.gita)}, Δmbh=${part(d.mahabharata)}, Δbhagavata=${part(d.bhagavata)}`;
}

// A passing query regresses if ANY source count drops below baseline.
function isPassingRegression(d: SourceCounts): boolean {
  return d.gita < 0 || d.mahabharata < 0 || d.bhagavata < 0;
}

type Args = {
  label: string;
  date: string;
  themeRerank: boolean;
  candidatesK: number;
  themeWeight: number;
  sourceDiversity: boolean;
  diversityCosineThreshold: number;
  diversityScopeK: number;
  queryRewrite: boolean;
  rewriteVariants: number;
  rewritePerVariantK: number;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let label = "baseline";
  let date = new Date().toISOString().slice(0, 10);
  // Default: harness baseline is cosine-only. Override via CLI or env.
  let themeRerank =
    (process.env.RAG_LAYER_THEME_RERANK ?? "false").toLowerCase() === "true";
  let sourceDiversity =
    (process.env.RAG_LAYER_SOURCE_DIVERSITY ?? "false").toLowerCase() === "true";
  let queryRewrite =
    (process.env.RAG_LAYER_QUERY_REWRITE ?? "false").toLowerCase() === "true";
  let rewriteVariants = (() => {
    const raw = process.env.RAG_REWRITE_VARIANTS;
    if (!raw) return 3;
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) && n >= 1 && n <= 6 ? n : 3;
  })();
  let rewritePerVariantK = (() => {
    const raw = process.env.RAG_REWRITE_PER_VARIANT_K;
    if (!raw) return 10;
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 10;
  })();
  let candidatesK = (() => {
    const raw = process.env.RAG_CANDIDATES_K;
    if (!raw) return 30;
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) && n >= 1 && n <= 200 ? n : 30;
  })();
  let themeWeight = (() => {
    const raw = process.env.RAG_THEME_WEIGHT;
    if (!raw) return 0.3;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.3;
  })();
  let diversityCosineThreshold = (() => {
    const raw = process.env.RAG_DIVERSITY_COSINE_THRESHOLD;
    if (!raw) return 0.65;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.65;
  })();
  let diversityScopeK = (() => {
    const raw = process.env.RAG_DIVERSITY_SCOPE_K;
    if (!raw) return 10;
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) && n >= 1 && n <= 200 ? n : 10;
  })();
  for (const a of args) {
    if (a.startsWith("--label=")) label = a.slice("--label=".length);
    else if (a.startsWith("--date=")) date = a.slice("--date=".length);
    else if (a.startsWith("--theme-rerank=")) {
      themeRerank = a.slice("--theme-rerank=".length).toLowerCase() === "true";
    } else if (a.startsWith("--source-diversity=")) {
      sourceDiversity = a.slice("--source-diversity=".length).toLowerCase() === "true";
    } else if (a.startsWith("--candidates-k=")) {
      const n = Number.parseInt(a.slice("--candidates-k=".length), 10);
      if (Number.isInteger(n) && n >= 1 && n <= 200) candidatesK = n;
    } else if (a.startsWith("--theme-weight=")) {
      const n = Number.parseFloat(a.slice("--theme-weight=".length));
      if (Number.isFinite(n) && n >= 0 && n <= 1) themeWeight = n;
    } else if (a.startsWith("--diversity-threshold=")) {
      const n = Number.parseFloat(a.slice("--diversity-threshold=".length));
      if (Number.isFinite(n) && n >= 0 && n <= 1) diversityCosineThreshold = n;
    } else if (a.startsWith("--diversity-scope-k=")) {
      const n = Number.parseInt(a.slice("--diversity-scope-k=".length), 10);
      if (Number.isInteger(n) && n >= 1 && n <= 200) diversityScopeK = n;
    } else if (a.startsWith("--query-rewrite=")) {
      queryRewrite = a.slice("--query-rewrite=".length).toLowerCase() === "true";
    } else if (a.startsWith("--rewrite-variants=")) {
      const n = Number.parseInt(a.slice("--rewrite-variants=".length), 10);
      if (Number.isInteger(n) && n >= 1 && n <= 6) rewriteVariants = n;
    } else if (a.startsWith("--rewrite-per-variant-k=")) {
      const n = Number.parseInt(a.slice("--rewrite-per-variant-k=".length), 10);
      if (Number.isInteger(n) && n >= 1 && n <= 100) rewritePerVariantK = n;
    }
  }
  return {
    label, date,
    themeRerank, candidatesK, themeWeight,
    sourceDiversity, diversityCosineThreshold, diversityScopeK,
    queryRewrite, rewriteVariants, rewritePerVariantK,
  };
}

async function main() {
  const args = parseArgs();
  const {
    label, date,
    themeRerank, candidatesK, themeWeight,
    sourceDiversity, diversityCosineThreshold, diversityScopeK,
    queryRewrite, rewriteVariants, rewritePerVariantK,
  } = args;
  const opts = {
    themeRerank, candidatesK, themeWeight,
    sourceDiversity, diversityCosineThreshold, diversityScopeK,
    queryRewrite, rewriteVariants, rewritePerVariantK,
  };
  const lines: string[] = [];
  const startedAt = Date.now();

  lines.push(`# Phase 2 retrieval regression — ${label}`);
  lines.push(``);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Label: \`${label}\``);
  lines.push(`Corpus row counts (per .claude/rules/schema.md as of 2026-05-02): 701 gita + 1,704 mahabharata + 727 bhagavata = 3,132.`);
  lines.push(``);
  lines.push(`**Pipeline configuration:**`);
  lines.push(`- theme-rerank: \`${themeRerank}\``);
  lines.push(`- source-diversity: \`${sourceDiversity}\``);
  lines.push(`- query-rewrite: \`${queryRewrite}\``);
  if (themeRerank || sourceDiversity || queryRewrite) {
    lines.push(`- candidates-k: \`${candidatesK}\` (final cosine pool size)`);
  }
  if (themeRerank) {
    lines.push(`- theme-weight: \`${themeWeight}\` (score = cosine·${(1 - themeWeight).toFixed(2)} + theme_overlap·${themeWeight.toFixed(2)})`);
  }
  if (sourceDiversity) {
    lines.push(`- diversity-cosine-threshold: \`${diversityCosineThreshold}\` (force-include threshold)`);
    lines.push(`- diversity-scope-k: \`${diversityScopeK}\` (rerank window checked for missing sources)`);
  }
  if (queryRewrite) {
    lines.push(`- rewrite-variants: \`${rewriteVariants}\` (paraphrases generated per query)`);
    lines.push(`- rewrite-per-variant-k: \`${rewritePerVariantK}\` (cosine top-k fetched per variant before union/dedupe)`);
  }
  lines.push(``);
  lines.push(`Failing queries (${FAILING_QUERIES.length}): each must show \`Δbhagavata + Δmbh ≥ 1\` vs baseline.`);
  lines.push(`Passing queries (${PASSING_QUERIES.length}): no source count may drop below baseline.`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // Run all queries; collect per-query data for the per-section md + the
  // aggregate-metrics block at the end.
  type Row = {
    id: string;
    query: string;
    sources: Source[];
    hits: Hit[];
    counts: SourceCounts;
    baseline: SourceCounts;
    deltas: SourceCounts;
    diversity: number;
    queryThemes: string[];
  };
  const failingRows: Row[] = [];
  const passingRows: Row[] = [];

  console.log("=== Failing queries ===");
  lines.push(`## Failing queries`);
  lines.push(``);
  lines.push(`Improvement criterion: \`bhagavata + mbh\` count in top-5 must rise vs baseline (per Step 2.0a + Phase 2 acceptance: ≥5/6 failing queries with ≥1 added Bhagavata/MBh chunk).`);
  lines.push(``);
  for (const t of FAILING_QUERIES) {
    const { hits, queryThemes, variants } = await search(t.query, 5, opts);
    const sources = hits.map(h => sourceFromRef(h.reference));
    const counts = sourceCounts(sources);
    const deltas = deltaCounts(counts, t.baseline_source_counts);
    const diversity = diversityScore(sources);
    failingRows.push({ id: t.id, query: t.query, sources, hits, counts, baseline: t.baseline_source_counts, deltas, diversity, queryThemes });

    const expect = t.expect_source_gain.join(", ");
    console.log(`\n[${t.id}] "${t.query}"`);
    console.log(`        expect-gain-from: ${expect}`);
    if (themeRerank) console.log(`        query_themes: [${queryThemes.join(", ")}]`);
    if (queryRewrite && variants.length > 1) {
      variants.slice(1).forEach((v, i) => console.log(`        variant ${i + 1}: "${v}"`));
    }
    console.log(`        baseline: ${fmtCounts(t.baseline_source_counts)}`);
    console.log(`        current : ${fmtCounts(counts)}   (${fmtDeltas(deltas)})`);
    console.log(`        diversity=${diversity.toFixed(2)}`);
    hits.forEach((h, i) => {
      const src = sourceFromRef(h.reference);
      console.log(`        ${i + 1}. [${src}] ${h.reference} (sim ${h.similarity.toFixed(3)}) — ${preview(h.english, 80)}…`);
    });

    lines.push(`### ${t.id} — "${t.query}"`);
    lines.push(``);
    lines.push(`Expected gain from: **${expect}**`);
    if (themeRerank) {
      lines.push(`Query themes (Haiku-classified): \`[${queryThemes.join(", ")}]\``);
    }
    if (queryRewrite && variants.length > 1) {
      lines.push(`Query variants (Haiku-rewritten):`);
      variants.slice(1).forEach((v, i) => lines.push(`  ${i + 1}. \`${v.replace(/`/g, "'")}\``));
    }
    lines.push(``);
    lines.push(`Baseline: \`${fmtCounts(t.baseline_source_counts)}\``);
    lines.push(`Current : \`${fmtCounts(counts)}\` · \`${fmtDeltas(deltas)}\` · Diversity: ${diversity.toFixed(2)}`);
    lines.push(``);
    lines.push(`| # | source | reference | cosine | preview |`);
    lines.push(`|---|---|---|---|---|`);
    hits.forEach((h, i) => {
      const src = sourceFromRef(h.reference);
      const text = h.english && h.english.trim() ? h.english : h.hindi;
      lines.push(`| ${i + 1} | ${src} | ${h.reference} | ${h.similarity.toFixed(3)} | ${preview(text, 80).replace(/\|/g, "\\|")} |`);
    });
    lines.push(``);
  }

  console.log("\n=== Passing queries ===");
  lines.push(`## Passing queries`);
  lines.push(``);
  lines.push(`Regression criterion (Step 2.0a founder note): a passing query regresses if **any** source count in top-5 drops below baseline. Top-1 source identity flips alone do NOT count as regressions — the quality signal is per-source presence count.`);
  lines.push(``);
  for (const t of PASSING_QUERIES) {
    const { hits, queryThemes, variants } = await search(t.query, 5, opts);
    const sources = hits.map(h => sourceFromRef(h.reference));
    const counts = sourceCounts(sources);
    const deltas = deltaCounts(counts, t.baseline_source_counts);
    const diversity = diversityScore(sources);
    const regressed = isPassingRegression(deltas);
    passingRows.push({ id: t.id, query: t.query, sources, hits, counts, baseline: t.baseline_source_counts, deltas, diversity, queryThemes });

    const verdict = regressed ? "REGRESSED" : "ok";

    console.log(`\n[${t.id}] "${t.query}"`);
    if (themeRerank) console.log(`        query_themes: [${queryThemes.join(", ")}]`);
    if (queryRewrite && variants.length > 1) {
      variants.slice(1).forEach((v, i) => console.log(`        variant ${i + 1}: "${v}"`));
    }
    console.log(`        baseline: ${fmtCounts(t.baseline_source_counts)}`);
    console.log(`        current : ${fmtCounts(counts)}   (${fmtDeltas(deltas)}) → ${verdict}`);
    console.log(`        diversity=${diversity.toFixed(2)}`);
    hits.forEach((h, i) => {
      const src = sourceFromRef(h.reference);
      console.log(`        ${i + 1}. [${src}] ${h.reference} (sim ${h.similarity.toFixed(3)}) — ${preview(h.english, 80)}…`);
    });

    lines.push(`### ${t.id} — "${t.query}" — ${verdict}`);
    lines.push(``);
    if (themeRerank) {
      lines.push(`Query themes (Haiku-classified): \`[${queryThemes.join(", ")}]\``);
    }
    if (queryRewrite && variants.length > 1) {
      lines.push(`Query variants (Haiku-rewritten):`);
      variants.slice(1).forEach((v, i) => lines.push(`  ${i + 1}. \`${v.replace(/`/g, "'")}\``));
    }
    lines.push(``);
    lines.push(`Baseline: \`${fmtCounts(t.baseline_source_counts)}\``);
    lines.push(`Current : \`${fmtCounts(counts)}\` · \`${fmtDeltas(deltas)}\` · Diversity: ${diversity.toFixed(2)}`);
    lines.push(``);
    lines.push(`| # | source | reference | cosine | preview |`);
    lines.push(`|---|---|---|---|---|`);
    hits.forEach((h, i) => {
      const src = sourceFromRef(h.reference);
      const text = h.english && h.english.trim() ? h.english : h.hindi;
      lines.push(`| ${i + 1} | ${src} | ${h.reference} | ${h.similarity.toFixed(3)} | ${preview(text, 80).replace(/\|/g, "\\|")} |`);
    });
    lines.push(``);
  }

  // Aggregate metrics
  // Failing-query gain: sum of (Δbhagavata + Δmbh) across failing queries.
  // 0 at baseline; positive after Phase 2 layers improve coverage.
  const failingGainSum = failingRows.reduce((s, r) => s + r.deltas.bhagavata + r.deltas.mahabharata, 0);
  // Failing-query absolute count (Bhagavata + MBh in top-5, summed) — keeps
  // legacy reporting useful for cross-baseline comparison.
  const failingAbsoluteCount = failingRows.reduce((s, r) => s + r.counts.bhagavata + r.counts.mahabharata, 0);
  // Failing-query "improved" tally: queries with at least 1 added Bhagavata/MBh.
  const failingImprovedCount = failingRows.filter(r => (r.deltas.bhagavata + r.deltas.mahabharata) >= 1).length;
  const passingRegressionCount = passingRows.filter(r => isPassingRegression(r.deltas)).length;
  const allDiversity = [...failingRows, ...passingRows].map(r => r.diversity);
  const avgDiversity = allDiversity.reduce((a, b) => a + b, 0) / allDiversity.length;
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log("\n=== Aggregate metrics ===");
  console.log(`Failing-query gain sum (Δbhagavata + Δmbh across 6): ${failingGainSum}`);
  console.log(`Failing-query improved count (queries with Δbhagavata+Δmbh ≥1): ${failingImprovedCount}/${FAILING_QUERIES.length}`);
  console.log(`Failing-query absolute count (Bhagavata + MBh in top-5, summed): ${failingAbsoluteCount}`);
  console.log(`Passing-query regression count (any source dropped below baseline): ${passingRegressionCount}/${PASSING_QUERIES.length}`);
  console.log(`Avg diversity (distinct-sources / 3 across all 12 queries): ${avgDiversity.toFixed(3)}`);
  console.log(`Elapsed: ${elapsedSec}s`);

  lines.push(`---`);
  lines.push(``);
  lines.push(`## Aggregate metrics`);
  lines.push(``);
  lines.push(`| metric | value |`);
  lines.push(`|---|---|`);
  lines.push(`| Failing-query gain sum (Δbhagavata + Δmbh, summed across ${FAILING_QUERIES.length}) | **${failingGainSum}** |`);
  lines.push(`| Failing-query improved count (queries with Δbhagavata+Δmbh ≥1) | **${failingImprovedCount}/${FAILING_QUERIES.length}** |`);
  lines.push(`| Failing-query absolute count (Bhagavata + MBh in top-5, summed) | **${failingAbsoluteCount}** |`);
  lines.push(`| Passing-query regression count (any source dropped below baseline) | **${passingRegressionCount}/${PASSING_QUERIES.length}** |`);
  lines.push(`| Avg diversity score (distinct sources in top-5 / 3, averaged across ${FAILING_QUERIES.length + PASSING_QUERIES.length}) | **${avgDiversity.toFixed(3)}** |`);
  lines.push(`| Elapsed | ${elapsedSec}s |`);
  lines.push(``);
  lines.push(`## Acceptance reminders`);
  lines.push(``);
  lines.push(`- ≥5/6 failing queries must improve (each with Δbhagavata+Δmbh ≥1 in top-5 vs baseline).`);
  lines.push(`- 0 passing queries may regress (no source count may drop below its baseline).`);
  lines.push(`- Compare \`Failing-query improved count\` and \`Passing-query regression count\` across the four runs (baseline / layer1 / layer1-2 / final). At baseline, both should equal zero.`);
  lines.push(``);

  fs.mkdirSync("test-results", { recursive: true });
  const outPath = `test-results/phase2-regression-${label}-${date}.md`;
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`\nReport written: ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
