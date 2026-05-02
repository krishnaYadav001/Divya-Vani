// Phase 2 Step 2.2 follow-up: emit a full-corpus tag-distribution report
// from the live Supabase state. tag-themes.ts emits per-run distributions
// (only chunks tagged in that run); this script reads ALL tagged chunks
// regardless of when they were tagged. Use this for the founder spot-check
// + the close-out documentation.
//
// One-off, NOT in package.json. Invoke via:
//   tsx --env-file=.env.local scripts/tag-distribution-report.ts

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("env missing");

const s = createClient(SUPABASE_URL, SUPABASE_KEY);

type Source = "gita" | "mahabharata" | "bhagavata";

const VALID_TAGS = new Set([
  // Group A
  "loneliness", "anger", "fear", "grief", "jealousy", "doubt", "despair",
  "attachment", "longing", "joy", "gratitude", "surrender", "devotion",
  "forgiveness", "equanimity",
  // Group B
  "duty", "betrayal", "family-conflict", "friendship", "marriage",
  "parent-child", "teacher-student", "ruler-subject", "action", "inaction",
  "decision", "sacrifice", "renunciation", "householder", "ascetic",
  // Group C
  "caution_devotional_intimacy", "caution_violence", "caution_complex_dharma",
  "caution_renunciation_extreme",
]);

const CAUTION_TAGS = new Set([
  "caution_devotional_intimacy", "caution_violence",
  "caution_complex_dharma", "caution_renunciation_extreme",
]);

async function fetchAll(): Promise<Array<{ source: Source; reference: string; themes: string[] }>> {
  const out: Array<{ source: Source; reference: string; themes: string[] }> = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await s
      .from("verses")
      .select("source, reference, themes")
      .order("source", { ascending: true })
      .order("reference", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`fetch from=${from}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      out.push({
        source: (row as { source: Source }).source,
        reference: (row as { reference: string }).reference,
        themes: ((row as { themes: string[] | null }).themes ?? []),
      });
    }
    if (data.length < PAGE) break;
  }
  return out;
}

async function main() {
  console.log("Fetching all chunks…");
  const all = await fetchAll();
  console.log(`Total: ${all.length}`);

  const tagCount = new Map<string, number>();
  const tagsBySrc: Record<Source, Map<string, number>> = {
    gita: new Map(), mahabharata: new Map(), bhagavata: new Map(),
  };
  const sourceCount: Record<Source, number> = { gita: 0, mahabharata: 0, bhagavata: 0 };
  const cautionByChunk = new Map<string, string[]>();
  let untaggedChunks = 0;
  const tagCountsPerChunk: number[] = [];
  const overruns: Array<{ ref: string; tagCount: number; tags: string[] }> = [];
  const invalidTags = new Set<string>();

  for (const row of all) {
    sourceCount[row.source]++;
    if (row.themes.length === 0) {
      untaggedChunks++;
      continue;
    }
    tagCountsPerChunk.push(row.themes.length);
    if (row.themes.length > 7) {
      overruns.push({ ref: row.reference, tagCount: row.themes.length, tags: row.themes });
    }
    for (const t of row.themes) {
      if (!VALID_TAGS.has(t)) invalidTags.add(t);
      tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
      tagsBySrc[row.source].set(t, (tagsBySrc[row.source].get(t) ?? 0) + 1);
    }
    const cTags = row.themes.filter(t => CAUTION_TAGS.has(t));
    if (cTags.length > 0) cautionByChunk.set(row.reference, cTags);
  }

  const totalTagged = all.length - untaggedChunks;
  const avgTagsPerChunk = tagCountsPerChunk.reduce((a, b) => a + b, 0) / tagCountsPerChunk.length;
  const minTags = Math.min(...tagCountsPerChunk);
  const maxTags = Math.max(...tagCountsPerChunk);

  // Distribution thresholds: no single tag >30% of corpus, no tag <0.5%
  const overConcentrated: Array<{ tag: string; count: number; pct: number }> = [];
  const underUsed: Array<{ tag: string; count: number; pct: number }> = [];
  for (const [t, n] of tagCount) {
    const pct = 100 * n / totalTagged;
    if (pct > 30) overConcentrated.push({ tag: t, count: n, pct });
    if (pct < 0.5) underUsed.push({ tag: t, count: n, pct });
  }

  // Build markdown
  const date = new Date().toISOString().slice(0, 10);
  const path = `test-results/phase2-tag-distribution-full-corpus-${date}.md`;
  const lines: string[] = [];

  lines.push(`# Phase 2 tag distribution — full corpus (live Supabase state)`);
  lines.push(``);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total chunks: ${all.length} (gita ${sourceCount.gita} + mahabharata ${sourceCount.mahabharata} + bhagavata ${sourceCount.bhagavata})`);
  lines.push(`Tagged: ${totalTagged}/${all.length}`);
  lines.push(`Untagged: ${untaggedChunks}`);
  lines.push(``);
  lines.push(`Tags-per-chunk distribution: min=${minTags}, max=${maxTags}, avg=${avgTagsPerChunk.toFixed(2)}.`);
  lines.push(`Sanity-check thresholds (Phase 2 plan): no single tag >30% of corpus, no tag <0.5%.`);
  lines.push(``);
  if (overConcentrated.length > 0) {
    lines.push(`⚠️ **Over-concentrated tags (>30%):**`);
    for (const o of overConcentrated) lines.push(`- \`${o.tag}\` — ${o.count} (${o.pct.toFixed(1)}%)`);
    lines.push(``);
  } else {
    lines.push(`✓ No tag exceeds 30% of corpus.`);
    lines.push(``);
  }
  if (underUsed.length > 0) {
    lines.push(`Under-used tags (<0.5%):`);
    for (const u of underUsed) lines.push(`- \`${u.tag}\` — ${u.count} (${u.pct.toFixed(2)}%)`);
    lines.push(``);
  } else {
    lines.push(`✓ Every applied tag exceeds 0.5%.`);
    lines.push(``);
  }
  if (invalidTags.size > 0) {
    lines.push(`⚠️ **Invalid (out-of-taxonomy) tags found in DB:**`);
    for (const t of invalidTags) lines.push(`- \`${t}\``);
    lines.push(`(These should not be present — taxonomy filter in tag-themes.ts should have stripped them. Investigate.)`);
    lines.push(``);
  } else {
    lines.push(`✓ All applied tags are within the locked 34-tag taxonomy (no invented tags wrote through).`);
    lines.push(``);
  }

  lines.push(`## Corpus-wide tag distribution`);
  lines.push(``);
  lines.push(`| tag | group | count | % of tagged chunks |`);
  lines.push(`|---|---|---|---|`);
  function groupOf(t: string): string {
    if (CAUTION_TAGS.has(t)) return "C (caution)";
    const groupA = new Set(["loneliness","anger","fear","grief","jealousy","doubt","despair","attachment","longing","joy","gratitude","surrender","devotion","forgiveness","equanimity"]);
    const groupB = new Set(["duty","betrayal","family-conflict","friendship","marriage","parent-child","teacher-student","ruler-subject","action","inaction","decision","sacrifice","renunciation","householder","ascetic"]);
    if (groupA.has(t)) return "A (emotional)";
    if (groupB.has(t)) return "B (relational)";
    return "?";
  }
  const sortedAll = [...tagCount.entries()].sort((a, b) => b[1] - a[1]);
  for (const [t, n] of sortedAll) {
    lines.push(`| ${t} | ${groupOf(t)} | ${n} | ${(100 * n / totalTagged).toFixed(1)}% |`);
  }
  lines.push(``);

  lines.push(`## Caution tag distribution`);
  lines.push(``);
  lines.push(`| caution tag | count | % of corpus |`);
  lines.push(`|---|---|---|`);
  for (const t of CAUTION_TAGS) {
    const n = tagCount.get(t) ?? 0;
    lines.push(`| ${t} | ${n} | ${(100 * n / totalTagged).toFixed(1)}% |`);
  }
  lines.push(``);
  lines.push(`Total chunks with ≥1 caution tag: **${cautionByChunk.size}** of ${totalTagged} (${(100 * cautionByChunk.size / totalTagged).toFixed(1)}%).`);
  lines.push(``);

  lines.push(`## Per-source tag distribution`);
  lines.push(``);
  for (const src of ["gita", "mahabharata", "bhagavata"] as const) {
    const m = tagsBySrc[src];
    const srcTotal = sourceCount[src];
    lines.push(`### ${src} (${srcTotal} chunks)`);
    lines.push(``);
    lines.push(`| tag | count | % of source |`);
    lines.push(`|---|---|---|`);
    const sortedSrc = [...m.entries()].sort((a, b) => b[1] - a[1]);
    for (const [t, n] of sortedSrc) {
      lines.push(`| ${t} | ${n} | ${(100 * n / srcTotal).toFixed(1)}% |`);
    }
    lines.push(``);
  }

  if (overruns.length > 0) {
    lines.push(`## Overrun chunks (>7 tags applied)`);
    lines.push(``);
    lines.push(`| reference | tag count | tags |`);
    lines.push(`|---|---|---|`);
    for (const o of overruns) {
      lines.push(`| ${o.ref} | ${o.tagCount} | ${o.tags.join(", ")} |`);
    }
    lines.push(``);
  } else {
    lines.push(`✓ No chunks have >7 tags applied.`);
    lines.push(``);
  }

  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync(path, lines.join("\n"), "utf8");

  // Console summary
  console.log(`\nTotal tagged: ${totalTagged}/${all.length}`);
  console.log(`Avg tags/chunk: ${avgTagsPerChunk.toFixed(2)} (min=${minTags}, max=${maxTags})`);
  console.log(`Caution-tagged chunks: ${cautionByChunk.size} (${(100 * cautionByChunk.size / totalTagged).toFixed(1)}%)`);
  console.log(`Over-concentrated (>30%): ${overConcentrated.length}`);
  console.log(`Under-used (<0.5%): ${underUsed.length}`);
  console.log(`Invalid tags in DB: ${invalidTags.size}`);
  console.log(`Overrun chunks (>7 tags): ${overruns.length}`);
  console.log(`Report: ${path}`);
}

main().catch(e => { console.error(e); process.exit(1); });
