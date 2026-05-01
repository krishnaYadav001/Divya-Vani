// Bhagavata quality gate — structure reusable across Phase 1.6+ Bhagavata
// ingests (Canto 10 = Phase 1.6, Canto 11.6–29 = Phase 1.7, future cantos as
// added). One-off, NOT in package.json.
//
// Runs the two acceptance gates from the Phase 1.6 implementation plan:
//   A. 5-query retrieval test (Phase 1.6 threshold ≥4/5; Phase 1.7
//      threshold ≥3/5 — Uddhava-Gita is a small corpus competing against
//      ~3,200 rows of Gita + Mahabharata + Canto 10 content).
//   B. 20-chunk stratified spot-check across register groups, manual
//      review of Hindi text against 9 criteria + 9b narrator-name + 9c
//      narrator-tag-form-consistency (added Phase 1.7 to track बोले vs
//      ने कहा drift; if >5/20 mixed, trigger v1.2 addendum lock).
// Plus the row-count sanity check.
//
// Per-phase customization (edit inline before each run; CLI parameterization
// deferred until a third Bhagavata phase shows it earning its keep):
//   * TEST_QUERIES — replace with the active phase's query set.
//   * Acceptance threshold in the retrieval-gate `passing >= 4` line —
//     match the phase's threshold (1.6 = 4, 1.7 = 3).
//   * pickStratified register groups — match the phase's chapter ranges.
//   * Input JSON path in pickStratified — point at the active phase's
//     cleaned corpus (Phase 1.6 = data/bhagavata-regenerated-cleaned.json;
//     Phase 1.7 = data/bhagavata-canto11-regenerated-cleaned.json).
//   * Spot-check report path at the bottom of main().
//
// Invocation:
//   tsx --env-file=.env.local scripts/bhagavata-quality-gate.ts

import fs from "node:fs";
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!SUPABASE_URL) throw new Error("SUPABASE_URL missing");
if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const embedModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

const TEST_QUERIES = [
  { query: "बारिश में चाय पी, बहुत अच्छा लगा", expect: "Vrindavan-mood / Bal Krishna joy" },
  { query: "I miss someone deeply", expect: "gopi-virahā (separation), flute themes" },
  { query: "मैं छोटी सी ख़ुशी महसूस कर रहा हूँ", expect: "Bal Krishna mischief episodes" },
  { query: "I'm overwhelmed and want to surrender", expect: "Bhagavata-mode surrender verses" },
  { query: "I want to be playful, not serious", expect: "Bal Krishna butter-stealing / mud-eating" },
];

function sourceFromRef(ref: string): "gita" | "mahabharata" | "bhagavata" | "unknown" {
  if (ref.startsWith("gita_")) return "gita";
  if (ref.startsWith("mb_")) return "mahabharata";
  if (ref.startsWith("bhagavata_")) return "bhagavata";
  return "unknown";
}

async function search(query: string, k = 5) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await embedModel.embedContent({
    content: { role: "user", parts: [{ text: query }] },
    taskType: TaskType.RETRIEVAL_QUERY,
    outputDimensionality: 768,
  } as any);
  const { data, error } = await supabase.rpc("match_verses", {
    query_embedding: r.embedding.values,
    match_count: k,
  });
  if (error) throw new Error(`match_verses RPC: ${error.message}`);
  return (data ?? []) as Array<{
    reference: string;
    chapter: number;
    verse_number: number;
    hindi: string;
    english: string;
    similarity: number;
  }>;
}

async function rowCounts() {
  const out: Record<string, number> = {};
  for (const src of ["gita", "mahabharata", "bhagavata"]) {
    const { count, error } = await supabase
      .from("verses")
      .select("*", { count: "exact", head: true })
      .eq("source", src);
    if (error) throw new Error(`count ${src}: ${error.message}`);
    out[src] = count ?? 0;
  }
  return out;
}

function pickStratified() {
  const data = JSON.parse(fs.readFileSync("data/bhagavata-regenerated-cleaned.json", "utf8"));
  const groups = [
    { label: "Bal-vatsalya", filter: (c: any) => c.chapter >= 1 && c.chapter <= 14 },
    { label: "Vrindavan-mādhurya/strength", filter: (c: any) => c.chapter >= 15 && c.chapter <= 28 },
    { label: "Vrindavan-mādhurya/longing", filter: (c: any) => c.chapter >= 29 && c.chapter <= 35 },
    { label: "Vrindavan-viraha + Mathura", filter: (c: any) => c.chapter >= 36 && c.chapter <= 55 },
    { label: "Householder", filter: (c: any) => c.chapter >= 56 && c.chapter <= 90 },
  ];
  const out: Array<{ label: string; chunk: any }> = [];
  for (const g of groups) {
    const candidates = data.filter(g.filter).filter((c: any) => c.wordCount >= 150);
    // Sample 4 evenly across the group
    const step = Math.max(1, Math.floor(candidates.length / 4));
    for (let i = 0; i < 4 && i * step < candidates.length; i++) {
      out.push({ label: g.label, chunk: candidates[i * step] });
    }
  }
  // Ensure at least one सुदामा chunk is included (per decisions.md flag)
  const sudamaIncluded = out.some(s => /सुदामा/.test(s.chunk.hindi));
  if (!sudamaIncluded) {
    const sudamaChunk = data.find((c: any) => /सुदामा/.test(c.hindi));
    if (sudamaChunk) {
      // Replace last Householder sample with the Sudama chunk
      const lastHouseholderIdx = out.findIndex(s => s.label === "Householder");
      if (lastHouseholderIdx >= 0) {
        const replaceIdx = out.length - 1;  // replace last entry which should be Householder
        out[replaceIdx] = { label: "Householder (सुदामा-bearing)", chunk: sudamaChunk };
      }
    }
  }
  return out;
}

async function main() {
  console.log("=== Row-count sanity ===");
  const counts = await rowCounts();
  console.log(`gita:        ${counts.gita}`);
  console.log(`mahabharata: ${counts.mahabharata}`);
  console.log(`bhagavata:   ${counts.bhagavata}`);
  console.log(`total:       ${counts.gita + counts.mahabharata + counts.bhagavata}`);
  console.log();

  console.log("=== A. 5-query retrieval test ===");
  let passing = 0;
  const retrievalReport: string[] = [];
  for (const t of TEST_QUERIES) {
    const hits = await search(t.query, 5);
    const sources = hits.map(h => sourceFromRef(h.reference));
    const bhagavataInTop5 = sources.includes("bhagavata");
    const ok = bhagavataInTop5 ? "PASS" : "FAIL";
    if (bhagavataInTop5) passing++;
    console.log(`\n[${ok}] "${t.query}"`);
    console.log(`        expect: ${t.expect}`);
    console.log(`        top-5 sources: ${sources.join(", ")}`);
    hits.forEach((h, i) => {
      const src = sourceFromRef(h.reference);
      const sim = h.similarity.toFixed(3);
      const tail = h.english.replace(/\s+/g, " ").slice(0, 100);
      console.log(`        ${i + 1}. [${src}] ${h.reference} (sim ${sim}) — ${tail}...`);
    });
    retrievalReport.push(JSON.stringify({ query: t.query, expect: t.expect, hits: hits.map(h => ({ ref: h.reference, src: sourceFromRef(h.reference), sim: h.similarity })) }));
  }
  console.log(`\n=== Retrieval gate: ${passing}/5 queries returned a Bhagavata chunk in top-5 ===`);
  console.log(`Acceptance threshold: ≥4/5. Result: ${passing >= 4 ? "PASS" : "FAIL"}`);

  console.log("\n=== B. 20-chunk stratified spot-check ===");
  const samples = pickStratified();
  console.log(`Selected ${samples.length} samples (4 per register group):\n`);
  // Save spot-check file for manual review
  const lines: string[] = [
    `# Phase 1.6 quality-gate spot-check`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Source: data/bhagavata-regenerated-cleaned.json (568 chunks)`,
    `Sampled: ${samples.length} chunks across 5 register groups`,
    ``,
    `## Acceptance criteria (9 from plan + 9b narrator-name)`,
    ``,
    `1. Hindi reads naturally with scriptural dignity`,
    `2. Sanskrit philosophical terms preserved in Devanagari`,
    `3. Classical conjunct consonants used`,
    `4. Speaker indicators inline with em-dash (no colon + paragraph break)`,
    `5. Vocabulary consistency (पुत्र not बेटे; गोप not ग्वाला)`,
    `6. Proper terminal punctuation (। / ! / ? / ॥)`,
    `7. No modern colloquialism intrusions`,
    `8. English source meaning preserved`,
    `9. Register-mode appropriateness`,
    `9b. Narrator-name consistency (Sukadeva → शुकदेव/श्रीशुकदेव; not सूत unless source says Suta)`,
    ``,
    `Acceptance gate: ≥17/20 PASS.`,
    ``,
    `---`,
    ``,
  ];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const c = s.chunk;
    const anchorTag = c.verseStart != null
      ? `vv. ${c.verseStart}${c.verseEnd != null && c.verseEnd !== c.verseStart ? `–${c.verseEnd}` : ""}`
      : `fallback chunk ${c.fallbackChunkN}`;
    lines.push(`## ${i + 1}. [${s.label}] ${c.reference} (ch ${c.chapter}, ${anchorTag}, ${c.wordCount}w)`);
    lines.push(``);
    lines.push(`### English`);
    lines.push(``);
    lines.push(c.english);
    lines.push(``);
    lines.push(`### Hindi`);
    lines.push(``);
    lines.push(c.hindi);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
    console.log(`  ${i+1}. [${s.label}] ${c.reference} ch=${c.chapter} ${anchorTag} ${c.wordCount}w`);
  }
  fs.mkdirSync("test-results", { recursive: true });
  const reportPath = "test-results/phase1.6-bhagavata-spotcheck-2026-05-01.md";
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
  console.log(`\nSpot-check chunks written to: ${reportPath}`);
  console.log(`(Manual reviewer reads this file and tallies PASS/FAIL per chunk.)`);

  console.log("\n=== Summary ===");
  console.log(`Row count (Supabase verses, source=bhagavata): ${counts.bhagavata}`);
  console.log(`Retrieval gate: ${passing}/5 (threshold ≥4)`);
  console.log(`Spot-check: ${samples.length} samples written for manual review`);
}

main().catch(e => { console.error(e); process.exit(1); });
