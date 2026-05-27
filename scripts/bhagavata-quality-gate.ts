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

// Phase 1.7 query set (Uddhava-Gita arc). Sourced from build-roadmap.md
// line 162 + Cowork's 5th query (संसार वैराग्य). Acceptance threshold
// lowered from Phase 1.6's ≥4/5 to ≥3/5 because Phase 1.7's 159-chunk
// corpus competes against ~3,200 rows of Gita + Mahabharata + Canto 10.
const TEST_QUERIES = [
  { query: "मुझे रोज़मर्रा की ज़िंदगी में भक्ति कैसे करनी है?", expect: "practical bhakti chapters (Uddhava-Gita didactic yoga 14–21)" },
  { query: "I learn from everything around me",                 expect: "avadhūta-24-gurus passages (Sanyal IX speeches; chs 11–13 philosophical conclusions)" },
  { query: "I want to surrender but don't know how",            expect: "surrender-path Uddhava dialogues (devotional climax 26–29)" },
  { query: "What is real renunciation?",                        expect: "renunciation-vs-engagement verses (theoretical guṇas / yoga 22–25)" },
  { query: "मुझे संसार से वैराग्य हो गया है",                    expect: "saṁsāra-vairāgya (transitional 6–7 + theoretical 22–25)" },
];

function sourceFromRef(ref: string): "gita" | "mahabharata" | "bhagavata" | "unknown" {
  if (ref.startsWith("gita_")) return "gita";
  if (ref.startsWith("mb_")) return "mahabharata";
  if (ref.startsWith("bhagavata_")) return "bhagavata";
  return "unknown";
}

async function search(query: string, k = 5) {
   
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
  // Phase 1.7 customization: input path → canto11 cleaned, register groups
  // → Uddhava-Gita arc, MUST-INCLUDE refs → the two pre-existing
  // non-terminal chunks (verify they're Phase 1.6-class residual, not a
  // Phase 1.7 regression), avadhūta-bias in the philosophical/avadhūta
  // group to stress-test criterion 9d (Sanskrit-philosophical-term
  // preservation).
  const data = JSON.parse(fs.readFileSync("data/bhagavata-canto11-regenerated-cleaned.json", "utf8"));
  const groups = [
    { label: "transitional",            filter: (c: any) => c.chapter >= 6  && c.chapter <= 7  },
    { label: "philosophical/avadhūta",  filter: (c: any) => c.chapter >= 11 && c.chapter <= 13 },
    { label: "didactic yoga",           filter: (c: any) => c.chapter >= 14 && c.chapter <= 21 },
    { label: "theoretical guṇas",       filter: (c: any) => c.chapter >= 22 && c.chapter <= 25 },
    { label: "devotional climax",       filter: (c: any) => c.chapter >= 26 && c.chapter <= 29 },
  ];

  // Avadhūta / 24-gurus / Sanskrit-philosophical-term markers used to bias
  // picks within the philosophical/avadhūta group toward criterion 9d
  // stress chunks. The list is empirical: terms appearing in dense clusters
  // in Sanyal's Brahmana-discourse content.
  const PHIL_TERMS = /(अवधूत|गुरु|आत्मा|ब्रह्म|माया|प्रकृति|पुरुष|गुण|अविद्या|विद्या|जीव|ईश्वर|मोक्ष|बन्धन)/g;

  // Manual-include refs to verify (must be present in the 20-sample). If
  // they happen to be picked by the even-step sampler in their group,
  // dedupe; otherwise displace the last sample of the matching group.
  const MUST_INCLUDE = new Set(["bhagavata_11.22.19", "bhagavata_11.29_4"]);

  const out: Array<{ label: string; chunk: any }> = [];

  for (const g of groups) {
    const candidates = data.filter(g.filter).filter((c: any) => c.wordCount >= 150);
    // Compute philosophical-term density per chunk (used only for the
    // philosophical/avadhūta group; other groups sample evenly).
    const scoreOf = (c: any) => {
      const hits = (c.hindi.match(PHIL_TERMS) ?? []).length;
      return hits;
    };
    let picks: any[];
    if (g.label === "philosophical/avadhūta") {
      // Sort descending by phil-term density, take top 4.
      picks = [...candidates].sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 4);
    } else {
      // Sample 4 evenly across the group.
      const step = Math.max(1, Math.floor(candidates.length / 4));
      picks = [];
      for (let i = 0; i < 4 && i * step < candidates.length; i++) {
        picks.push(candidates[i * step]);
      }
    }
    for (const c of picks) out.push({ label: g.label, chunk: c });
  }

  // Apply MUST_INCLUDE: ensure both refs are present. If a ref is already
  // in the picks, no-op. Otherwise, find the chunk in `data`, locate its
  // group, and replace the last existing sample of that group with it.
  for (const mustRef of MUST_INCLUDE) {
    if (out.some(s => s.chunk.reference === mustRef)) continue;
    const chunk = data.find((c: any) => c.reference === mustRef);
    if (!chunk) {
      console.warn(`[stratify] MUST_INCLUDE ref ${mustRef} not found in cleaned corpus — skipping injection`);
      continue;
    }
    const grp = groups.find(g => g.filter(chunk));
    if (!grp) {
      console.warn(`[stratify] MUST_INCLUDE ref ${mustRef} (ch ${chunk.chapter}) does not match any register group — skipping`);
      continue;
    }
    // Find last sample in that group; displace it.
    let replaceIdx = -1;
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].label === grp.label) { replaceIdx = i; break; }
    }
    if (replaceIdx >= 0) {
      out[replaceIdx] = { label: `${grp.label} (must-include: ${mustRef})`, chunk };
    } else {
      out.push({ label: `${grp.label} (must-include: ${mustRef})`, chunk });
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
  console.log(`Acceptance threshold: ≥3/5 (Phase 1.7). Result: ${passing >= 3 ? "PASS" : "FAIL"}`);

  console.log("\n=== B. 20-chunk stratified spot-check ===");
  const samples = pickStratified();
  console.log(`Selected ${samples.length} samples across 5 register groups:\n`);
  // Save spot-check file for manual review
  const lines: string[] = [
    `# Phase 1.7 quality-gate spot-check (Bhagavata Canto 11.6–29 Uddhava-Gita)`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Source: data/bhagavata-canto11-regenerated-cleaned.json (159 chunks)`,
    `Sampled: ${samples.length} chunks across 5 register groups`,
    `Register groups: transitional 6–7, philosophical/avadhūta 11–13, didactic yoga 14–21, theoretical guṇas 22–25, devotional climax 26–29.`,
    `Must-include refs: bhagavata_11.22.19, bhagavata_11.29_4 (verify pre-existing 1–2% non-terminal class is not a Phase 1.7 regression).`,
    `Philosophical/avadhūta picks biased by Sanskrit-philosophical-term density (criterion 9d stress-test).`,
    ``,
    `## Acceptance criteria (9 from plan + 9b/9c/9d added Phase 1.7)`,
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
    `9c. Narrator-tag form variation count: tally बोले vs ने कहा across all 20. >5 mixed → trigger v1.2 addendum lock for future cantos.`,
    `9d. Sanskrit philosophical-term preservation: terms like आत्मा / माया / ब्रह्म / गुण / अविद्या / विद्या / जीव / ईश्वर / प्रकृति / पुरुष / मोक्ष / बन्धन must remain in Sanskrit form (not translated to Hindi prose equivalents). Critical for the Uddhava-Gita's philosophical content; if a chunk dilutes a Sanskrit philosophical term to a vague Hindi gloss, FAIL.`,
    ``,
    `Acceptance gate: ≥17/20 PASS (spot-check) + ≥3/5 retrieval (lower than Phase 1.6 because the 159-chunk Phase 1.7 corpus competes against ~3,200 rows of Gita + Mahabharata + Canto 10).`,
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
  const reportPath = "test-results/phase1.7-bhagavata-spotcheck-2026-05-02.md";
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
  console.log(`\nSpot-check chunks written to: ${reportPath}`);
  console.log(`(Manual reviewer reads this file and tallies PASS/FAIL per chunk.)`);

  console.log("\n=== Summary ===");
  console.log(`Row count (Supabase verses, source=bhagavata): ${counts.bhagavata}`);
  console.log(`Retrieval gate: ${passing}/5 (threshold ≥3 for Phase 1.7)`);
  console.log(`Spot-check: ${samples.length} samples written for manual review`);
}

main().catch(e => { console.error(e); process.exit(1); });
