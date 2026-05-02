// Phase 2 Step 2.1b — classification-model validation. Run BOTH
// claude-haiku-4-5 and claude-sonnet-4-6 against 30 sampled chunks
// from the locked taxonomy (Decision #17, 34 tags). Output a side-by-
// side md so the founder can pick the model for full-corpus tagging
// (Step 2.2).
//
// Sampling: 24 stratified-random across the 3 sources (8 each) + 6
// MUST_INCLUDE caution-likely refs to ensure each Group-C tag has a
// candidate in the validation set. MUST_INCLUDE refs are resolved via
// `LIKE prefix%` against Supabase at startup; missing candidates are
// logged and skipped (we still get the natural 24 + however many
// MUST_INCLUDE actually exist).
//
// One-off, NOT in package.json. Invoke via:
//   tsx --env-file=.env.local scripts/tag-classifier-validation.ts
//
// Cost expectation: ~₹3-8 (30 chunks × 2 models × ~600 in / ~50 out).

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL) throw new Error("SUPABASE_URL missing");
if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY missing — invoke with `tsx --env-file=.env.local`");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const client = new Anthropic();

const HAIKU = "claude-haiku-4-5";
const SONNET = "claude-sonnet-4-6";

const PRICE_HAIKU_IN_PER_M = 0.80;
const PRICE_HAIKU_OUT_PER_M = 4.00;
const PRICE_SONNET_IN_PER_M = 3.00;
const PRICE_SONNET_OUT_PER_M = 15.00;
const USD_TO_INR = 83;

const TARGET_PER_SOURCE = 8;          // stratified random
const TOTAL_TARGET = 30;              // 24 stratified + 6 MUST_INCLUDE

// Decision #17 taxonomy — verbatim. Embedded as the system prompt for
// both models. 34 tags total: 15 Group A + 15 Group B + 4 Group C.
const SYSTEM_PROMPT = `You are tagging a verse from a Sanskrit/Hindi/English scripture (Bhagavad Gita, Mahabharata, or Bhagavata Purana) for thematic retrieval in an AI roleplaying Krishna-persona chat app.

Apply 3-7 tags from this fixed taxonomy. Do NOT invent new tags.

GROUP A — Emotional / state (15):
loneliness, anger, fear, grief, jealousy, doubt, despair, attachment, longing, joy, gratitude, surrender, devotion, forgiveness, equanimity

GROUP B — Relational / dharmic (15):
duty, betrayal, family-conflict, friendship, marriage, parent-child, teacher-student, ruler-subject, action, inaction, decision, sacrifice, renunciation, householder, ascetic

GROUP C — Caution tags (4) — apply ONLY when the passage genuinely warrants the caveat described:
- caution_devotional_intimacy — rasa-lila, vastra-harana, Krishna's multiple wives. Devotionally legitimate but easily misread by a casual modern reader.
- caution_violence — Kamsa-vadha, Aristhasura, demon-slayings, named-warrior killings. Krishna acts as warrior; persona must contextualize, not glorify.
- caution_complex_dharma — Krishna's strategic actions, Yudhishthira's half-truth, Bhima's vow against Dushasana. Cases where literal-rule ethics fail and the text models a higher-order calculus.
- caution_renunciation_extreme — passages mis-readable as endorsing self-harm or extreme withdrawal.

Respond with ONLY a JSON object: { "themes": ["tag1", "tag2", ...] }
No prose, no preamble, no explanation. 3 to 7 tags. Tags must come from the taxonomy above.`;

type Chunk = {
  source: string;
  reference: string;
  english: string;
  hindi: string;
  themes: string[] | null;
};

type ModelResult = {
  themes: string[];
  raw: string;
  latencyMs: number;
  inTokens: number;
  outTokens: number;
  parseError: string | null;
};

type SampleResult = {
  chunk: Chunk;
  bucket: "stratified" | "must_include";
  expected_caution?: string;       // for MUST_INCLUDE entries
  haiku: ModelResult;
  sonnet: ModelResult;
  agreement: { intersect: string[]; haikuOnly: string[]; sonnetOnly: string[]; jaccard: number };
};

function userPromptFor(c: Chunk): string {
  return `Verse:
  Source: ${c.source}
  Reference: ${c.reference}
  English: ${c.english.slice(0, 1500)}
  Hindi: ${c.hindi.slice(0, 1500)}

Respond with the JSON object now.`;
}

// Try several JSON-extraction strategies. Models may wrap the object
// in code fences or add a sentence; be tolerant.
function parseThemes(raw: string): { themes: string[]; error: string | null } {
  const tryParse = (s: string): string[] | null => {
    try {
      const obj = JSON.parse(s);
      if (Array.isArray(obj?.themes)) {
        return obj.themes.filter((x: unknown) => typeof x === "string");
      }
    } catch { /* fall through */ }
    return null;
  };

  const direct = tryParse(raw.trim());
  if (direct) return { themes: direct, error: null };

  // Try fenced ```json ... ``` block
  const fence = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fence) {
    const fenced = tryParse(fence[1]);
    if (fenced) return { themes: fenced, error: null };
  }

  // Try first {...} substring
  const obj = raw.match(/\{[\s\S]*\}/);
  if (obj) {
    const sub = tryParse(obj[0]);
    if (sub) return { themes: sub, error: null };
  }

  return { themes: [], error: `Could not parse JSON from response (first 200 chars): ${raw.slice(0, 200)}` };
}

async function classify(model: string, chunk: Chunk): Promise<ModelResult> {
  const start = Date.now();
  const r = await client.messages.create({
    model,
    max_tokens: 200,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPromptFor(chunk) }],
  });
  const elapsed = Date.now() - start;
  const textBlock = r.content.find(b => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const parsed = parseThemes(raw);
  return {
    themes: parsed.themes,
    raw,
    latencyMs: elapsed,
    inTokens: r.usage.input_tokens ?? 0,
    outTokens: r.usage.output_tokens ?? 0,
    parseError: parsed.error,
  };
}

async function fetchAllRowsForSource(source: string): Promise<Chunk[]> {
  // Supabase paginates at 1000 — Mahabharata has 1,704 rows so we need
  // multiple page fetches. Same pattern as scripts/ingest-bhagavata.ts.
  const all: Chunk[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("verses")
      .select("source, reference, english, hindi, themes")
      .eq("source", source)
      .order("reference", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`fetch ${source} (from=${from}): ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as Chunk[]));
    if (data.length < PAGE) break;
  }
  return all;
}

// Pick `n` evenly distributed indices from `list`. Deterministic.
function evenStratify<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list.slice();
  const out: T[] = [];
  const step = list.length / n;
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(i * step);
    out.push(list[idx]);
  }
  return out;
}

async function findFirstMatching(prefix: string): Promise<Chunk | null> {
  const { data, error } = await supabase
    .from("verses")
    .select("source, reference, english, hindi, themes")
    .like("reference", `${prefix}%`)
    .order("reference", { ascending: true })
    .limit(1);
  if (error) throw new Error(`find ${prefix}: ${error.message}`);
  return (data?.[0] as Chunk | undefined) ?? null;
}

async function buildSamples(): Promise<SampleResult[] /* with empty haiku/sonnet to be filled */> {
  // Stratified random per source (deterministic via even-step picks).
  const samples: Array<{ chunk: Chunk; bucket: "stratified" | "must_include"; expected_caution?: string }> = [];

  for (const src of ["gita", "mahabharata", "bhagavata"] as const) {
    const all = await fetchAllRowsForSource(src);
    console.log(`[sample] ${src}: ${all.length} rows total → picking ${TARGET_PER_SOURCE} stratified`);
    const picks = evenStratify(all, TARGET_PER_SOURCE);
    for (const p of picks) samples.push({ chunk: p, bucket: "stratified" });
  }

  // MUST_INCLUDE: caution-likely refs by prefix. Resolve to the first
  // matching DB row; skip + warn if no match.
  const MUST_INCLUDE: Array<{ prefix: string; expected_caution: string; note: string }> = [
    { prefix: "bhagavata_10.29.",  expected_caution: "caution_devotional_intimacy", note: "rasa-lila opening" },
    { prefix: "bhagavata_10.22.",  expected_caution: "caution_devotional_intimacy", note: "vastra-harana cover (Sanyal)" },
    { prefix: "bhagavata_10.43.",  expected_caution: "caution_violence",            note: "Kamsa-vadha" },
    { prefix: "mb_drona_190",      expected_caution: "caution_complex_dharma",       note: "Yudhishthira's half-truth about Ashvatthama" },
    { prefix: "mb_sabha_67",       expected_caution: "caution_complex_dharma",       note: "Bhima's vow re Dushasana" },
    { prefix: "bhagavata_11.23.",  expected_caution: "caution_renunciation_extreme", note: "theoretical gunas / extreme detachment" },
  ];

  const seenRefs = new Set(samples.map(s => s.chunk.reference));
  for (const m of MUST_INCLUDE) {
    const c = await findFirstMatching(m.prefix);
    if (!c) {
      console.warn(`[sample] MUST_INCLUDE prefix ${m.prefix} (${m.note}) — no match in DB, skipping`);
      continue;
    }
    if (seenRefs.has(c.reference)) {
      console.log(`[sample] MUST_INCLUDE ${c.reference} already in stratified set — re-tagging bucket`);
      // Promote it to must_include bucket so report shows expected_caution
      const existing = samples.find(s => s.chunk.reference === c.reference)!;
      existing.bucket = "must_include";
      existing.expected_caution = m.expected_caution;
      continue;
    }
    samples.push({ chunk: c, bucket: "must_include", expected_caution: m.expected_caution });
    seenRefs.add(c.reference);
    console.log(`[sample] MUST_INCLUDE ${c.reference} (${m.note}) → expected ${m.expected_caution}`);
  }

  // Trim to TOTAL_TARGET if we overshot (shouldn't, but be safe).
  if (samples.length > TOTAL_TARGET) {
    samples.length = TOTAL_TARGET;
  }

  return samples.map(s => ({
    chunk: s.chunk,
    bucket: s.bucket,
    expected_caution: s.expected_caution,
    haiku: { themes: [], raw: "", latencyMs: 0, inTokens: 0, outTokens: 0, parseError: null },
    sonnet: { themes: [], raw: "", latencyMs: 0, inTokens: 0, outTokens: 0, parseError: null },
    agreement: { intersect: [], haikuOnly: [], sonnetOnly: [], jaccard: 0 },
  }));
}

function computeAgreement(haiku: string[], sonnet: string[]) {
  const h = new Set(haiku);
  const s = new Set(sonnet);
  const intersect = [...h].filter(x => s.has(x));
  const haikuOnly = [...h].filter(x => !s.has(x));
  const sonnetOnly = [...s].filter(x => !h.has(x));
  const union = new Set([...h, ...s]);
  const jaccard = union.size > 0 ? intersect.length / union.size : 1;
  return { intersect, haikuOnly, sonnetOnly, jaccard };
}

function preview(text: string, n = 100): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, n);
}

async function main() {
  console.log("=== Phase 2 tag-classifier validation ===");
  console.log("Building sample set...");
  const samples = await buildSamples();
  console.log(`Total samples: ${samples.length} (target ${TOTAL_TARGET})`);
  console.log("");

  let haikuIn = 0, haikuOut = 0, sonnetIn = 0, sonnetOut = 0;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const c = s.chunk;
    process.stdout.write(`[${i + 1}/${samples.length}] ${c.reference} (${c.source})\n`);

    process.stdout.write(`  Haiku  ... `);
    s.haiku = await classify(HAIKU, c);
    haikuIn += s.haiku.inTokens;
    haikuOut += s.haiku.outTokens;
    process.stdout.write(`${s.haiku.themes.length} tags · ${s.haiku.latencyMs}ms · ${s.haiku.parseError ? "PARSE_ERROR" : "ok"}\n`);

    process.stdout.write(`  Sonnet ... `);
    s.sonnet = await classify(SONNET, c);
    sonnetIn += s.sonnet.inTokens;
    sonnetOut += s.sonnet.outTokens;
    process.stdout.write(`${s.sonnet.themes.length} tags · ${s.sonnet.latencyMs}ms · ${s.sonnet.parseError ? "PARSE_ERROR" : "ok"}\n`);

    s.agreement = computeAgreement(s.haiku.themes, s.sonnet.themes);
    process.stdout.write(`  agreement: jaccard=${s.agreement.jaccard.toFixed(2)} intersect=[${s.agreement.intersect.join(", ")}]\n`);
  }

  // Cost
  const haikuUsd = (haikuIn / 1e6) * PRICE_HAIKU_IN_PER_M + (haikuOut / 1e6) * PRICE_HAIKU_OUT_PER_M;
  const sonnetUsd = (sonnetIn / 1e6) * PRICE_SONNET_IN_PER_M + (sonnetOut / 1e6) * PRICE_SONNET_OUT_PER_M;
  const haikuInr = haikuUsd * USD_TO_INR;
  const sonnetInr = sonnetUsd * USD_TO_INR;

  // Aggregate metrics
  const haikuParseErrors = samples.filter(s => s.haiku.parseError).length;
  const sonnetParseErrors = samples.filter(s => s.sonnet.parseError).length;
  const haikuOutOfBand = samples.filter(s => s.haiku.themes.length < 3 || s.haiku.themes.length > 7).length;
  const sonnetOutOfBand = samples.filter(s => s.sonnet.themes.length < 3 || s.sonnet.themes.length > 7).length;
  const avgJaccard = samples.reduce((a, s) => a + s.agreement.jaccard, 0) / samples.length;
  const avgHaikuLatency = samples.reduce((a, s) => a + s.haiku.latencyMs, 0) / samples.length;
  const avgSonnetLatency = samples.reduce((a, s) => a + s.sonnet.latencyMs, 0) / samples.length;

  // MUST_INCLUDE coverage
  const mustIncludeRows = samples.filter(s => s.bucket === "must_include");
  const haikuCautionHits = mustIncludeRows.filter(s => s.expected_caution && s.haiku.themes.includes(s.expected_caution)).length;
  const sonnetCautionHits = mustIncludeRows.filter(s => s.expected_caution && s.sonnet.themes.includes(s.expected_caution)).length;

  // Build md
  const lines: string[] = [];
  lines.push(`# Phase 2 tag-classifier validation`);
  lines.push(``);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Sample size: ${samples.length} (target ${TOTAL_TARGET}: ${TARGET_PER_SOURCE} stratified per source × 3 + 6 MUST_INCLUDE caution-likely refs).`);
  lines.push(`Models: \`${HAIKU}\` vs \`${SONNET}\` — same SYSTEM_PROMPT, same user-prompt template, temperature 0.`);
  lines.push(`Taxonomy: locked Decision #17 (15 Group A + 15 Group B + 4 Group C = 34 tags).`);
  lines.push(``);
  lines.push(`## Aggregate metrics`);
  lines.push(``);
  lines.push(`| metric | Haiku 4.5 | Sonnet 4.6 |`);
  lines.push(`|---|---|---|`);
  lines.push(`| Avg latency / call | ${avgHaikuLatency.toFixed(0)}ms | ${avgSonnetLatency.toFixed(0)}ms |`);
  lines.push(`| Total tokens (in/out) | ${haikuIn} / ${haikuOut} | ${sonnetIn} / ${sonnetOut} |`);
  lines.push(`| Cost USD | $${haikuUsd.toFixed(4)} | $${sonnetUsd.toFixed(4)} |`);
  lines.push(`| Cost INR | ₹${haikuInr.toFixed(2)} | ₹${sonnetInr.toFixed(2)} |`);
  lines.push(`| Parse errors | ${haikuParseErrors}/${samples.length} | ${sonnetParseErrors}/${samples.length} |`);
  lines.push(`| Tag-count out of 3-7 band | ${haikuOutOfBand}/${samples.length} | ${sonnetOutOfBand}/${samples.length} |`);
  lines.push(`| Caution hits on MUST_INCLUDE refs | ${haikuCautionHits}/${mustIncludeRows.length} | ${sonnetCautionHits}/${mustIncludeRows.length} |`);
  lines.push(``);
  lines.push(`Avg Haiku-Sonnet Jaccard agreement (intersect / union of tag sets): **${avgJaccard.toFixed(3)}** (1.0 = identical tag sets across all samples; 0.0 = disjoint).`);
  lines.push(``);
  lines.push(`Phase 2 full-corpus tagging cost projection (3,132 rows):`);
  const factor = 3132 / samples.length;
  const haikuCorpusInr = haikuInr * factor;
  const sonnetCorpusInr = sonnetInr * factor;
  lines.push(`- Haiku-only:  ~₹${haikuCorpusInr.toFixed(0)}`);
  lines.push(`- Sonnet-only: ~₹${sonnetCorpusInr.toFixed(0)}`);
  lines.push(`- Hybrid (Haiku-first, Sonnet re-classify on parse error / out-of-band): ~₹${haikuCorpusInr.toFixed(0)} + ~₹${(sonnetCorpusInr * (haikuParseErrors + haikuOutOfBand) / samples.length).toFixed(0)} fallback budget = ~₹${(haikuCorpusInr + sonnetCorpusInr * (haikuParseErrors + haikuOutOfBand) / samples.length).toFixed(0)}`);
  lines.push(``);

  // Per-sample side-by-side
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Per-sample side-by-side`);
  lines.push(``);
  lines.push(`Tag-set legend: \`★\` = appears in BOTH models. \`H\` = Haiku only. \`S\` = Sonnet only.`);
  lines.push(``);
  lines.push(`| # | bucket | source | reference | haiku tags | sonnet tags | jaccard | preview |`);
  lines.push(`|---|---|---|---|---|---|---|---|`);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const c = s.chunk;
    const hSet = new Set(s.haiku.themes);
    const sSet = new Set(s.sonnet.themes);
    const fmt = (set: Set<string>, other: Set<string>) =>
      [...set].map(t => other.has(t) ? `★${t}` : t).join(", ");
    const haikuFmt = fmt(hSet, sSet);
    const sonnetFmt = fmt(sSet, hSet);
    const text = c.english && c.english.trim() ? c.english : c.hindi;
    const bucketLabel = s.bucket === "must_include"
      ? `must_include\\n(expect ${s.expected_caution})`
      : "stratified";
    lines.push(`| ${i + 1} | ${bucketLabel} | ${c.source} | ${c.reference} | ${haikuFmt} | ${sonnetFmt} | ${s.agreement.jaccard.toFixed(2)} | ${preview(text, 100).replace(/\|/g, "\\|")} |`);
  }
  lines.push(``);

  // Detailed errors / out-of-band
  if (haikuParseErrors + sonnetParseErrors + haikuOutOfBand + sonnetOutOfBand > 0) {
    lines.push(`---`);
    lines.push(``);
    lines.push(`## Errors / out-of-band detail`);
    lines.push(``);
    for (const s of samples) {
      const issues: string[] = [];
      if (s.haiku.parseError) issues.push(`Haiku parse error: ${s.haiku.parseError.slice(0, 120)}`);
      if (s.sonnet.parseError) issues.push(`Sonnet parse error: ${s.sonnet.parseError.slice(0, 120)}`);
      if (s.haiku.themes.length < 3 || s.haiku.themes.length > 7) issues.push(`Haiku tag count: ${s.haiku.themes.length}`);
      if (s.sonnet.themes.length < 3 || s.sonnet.themes.length > 7) issues.push(`Sonnet tag count: ${s.sonnet.themes.length}`);
      if (issues.length > 0) {
        lines.push(`### ${s.chunk.reference}`);
        for (const x of issues) lines.push(`- ${x}`);
        lines.push(``);
      }
    }
  }

  // MUST_INCLUDE coverage detail
  if (mustIncludeRows.length > 0) {
    lines.push(`---`);
    lines.push(``);
    lines.push(`## MUST_INCLUDE caution-tag coverage`);
    lines.push(``);
    lines.push(`| reference | expected | haiku hit | sonnet hit |`);
    lines.push(`|---|---|---|---|`);
    for (const s of mustIncludeRows) {
      const expected = s.expected_caution!;
      const hHit = s.haiku.themes.includes(expected) ? "✓" : "✗";
      const sHit = s.sonnet.themes.includes(expected) ? "✓" : "✗";
      lines.push(`| ${s.chunk.reference} | ${expected} | ${hHit} | ${sHit} |`);
    }
    lines.push(``);
  }

  fs.mkdirSync("test-results", { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const out = `test-results/phase2-classification-validation-${date}.md`;
  fs.writeFileSync(out, lines.join("\n"), "utf8");

  console.log("\n=== Summary ===");
  console.log(`Avg Jaccard agreement: ${avgJaccard.toFixed(3)}`);
  console.log(`Haiku  cost: $${haikuUsd.toFixed(4)} (~₹${haikuInr.toFixed(2)})`);
  console.log(`Sonnet cost: $${sonnetUsd.toFixed(4)} (~₹${sonnetInr.toFixed(2)})`);
  console.log(`Parse errors — Haiku: ${haikuParseErrors}, Sonnet: ${sonnetParseErrors}`);
  console.log(`Out-of-band tag count — Haiku: ${haikuOutOfBand}, Sonnet: ${sonnetOutOfBand}`);
  console.log(`MUST_INCLUDE caution hits — Haiku: ${haikuCautionHits}/${mustIncludeRows.length}, Sonnet: ${sonnetCautionHits}/${mustIncludeRows.length}`);
  console.log(`Report: ${out}`);
}

main().catch(e => { console.error(e); process.exit(1); });
