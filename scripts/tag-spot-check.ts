// Phase 2 Step 2.2 follow-up: 20-chunk spot-check for founder review.
// Picks 5 random tagged chunks per source + 5 random chunks with ≥1 caution
// tag (across all sources). Outputs an md file with chunk content + tags
// so the founder can verify Sonnet's tagging matches content.
//
// One-off, NOT in package.json. Invoke via:
//   tsx --env-file=.env.local scripts/tag-spot-check.ts

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("env missing");

const s = createClient(SUPABASE_URL, SUPABASE_KEY);

type Source = "gita" | "mahabharata" | "bhagavata";

const CAUTION_TAGS = new Set([
  "caution_devotional_intimacy", "caution_violence",
  "caution_complex_dharma", "caution_renunciation_extreme",
]);

type Row = { source: Source; reference: string; english: string; hindi: string; themes: string[] };

async function fetchAllTagged(): Promise<Row[]> {
  const out: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await s
      .from("verses")
      .select("source, reference, english, hindi, themes")
      .order("source")
      .order("reference")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`fetch from=${from}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const r = row as Row;
      if (r.themes && r.themes.length > 0) out.push(r);
    }
    if (data.length < PAGE) break;
  }
  return out;
}

// Deterministic seeded shuffle so the spot-check is reproducible across runs.
function seededShuffle<T>(arr: T[], seed = 42): T[] {
  const out = [...arr];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function main() {
  console.log("Fetching tagged chunks…");
  const all = await fetchAllTagged();
  console.log(`Total tagged: ${all.length}`);

  const bySource: Record<Source, Row[]> = { gita: [], mahabharata: [], bhagavata: [] };
  const cautionPool: Row[] = [];
  for (const r of all) {
    bySource[r.source].push(r);
    if (r.themes.some(t => CAUTION_TAGS.has(t))) cautionPool.push(r);
  }

  const samples: Array<{ bucket: string; row: Row }> = [];

  for (const src of ["gita", "mahabharata", "bhagavata"] as const) {
    const shuffled = seededShuffle(bySource[src], 42);
    for (let i = 0; i < 5 && i < shuffled.length; i++) {
      samples.push({ bucket: `${src} (random)`, row: shuffled[i] });
    }
  }

  // 5 caution chunks — pick across the 4 caution categories so each
  // category has at least one rep in the spot-check.
  const cautionByCategory: Record<string, Row[]> = {
    caution_devotional_intimacy: [],
    caution_violence: [],
    caution_complex_dharma: [],
    caution_renunciation_extreme: [],
  };
  for (const r of cautionPool) {
    for (const t of r.themes) {
      if (CAUTION_TAGS.has(t)) cautionByCategory[t].push(r);
    }
  }
  // Take 1 from each of the 4 categories (different chunks), then 1 random
  // from any caution chunk, totalling 5.
  const seen = new Set<string>();
  for (const cat of Object.keys(cautionByCategory)) {
    const shuffled = seededShuffle(cautionByCategory[cat], 99);
    const pick = shuffled.find(r => !seen.has(r.reference));
    if (pick) {
      samples.push({ bucket: `caution (${cat})`, row: pick });
      seen.add(pick.reference);
    }
  }
  // 5th caution: any random caution chunk not already picked
  const cautionShuffled = seededShuffle(cautionPool, 7);
  const fifth = cautionShuffled.find(r => !seen.has(r.reference));
  if (fifth) samples.push({ bucket: "caution (random)", row: fifth });

  // Build md
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# Phase 2 tag spot-check (20 chunks)`);
  lines.push(``);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Sample: 5 random per source × 3 + 5 caution chunks (1 from each of the 4 caution categories + 1 random caution).`);
  lines.push(`Seeded shuffle (deterministic) — re-running will produce the same sample.`);
  lines.push(``);
  lines.push(`Founder-review goal: verify that Sonnet's applied tags match the content. Look for:`);
  lines.push(`- Wrong tags (a tag that doesn't fit the chunk's theme).`);
  lines.push(`- Missing tags (an obvious theme that isn't tagged).`);
  lines.push(`- Caution mistakes (a caution tag that doesn't apply, or a passage that should have a caution tag but doesn't).`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const r = s.row;
    lines.push(`## ${i + 1}. [${s.bucket}] \`${r.reference}\``);
    lines.push(``);
    lines.push(`**Tags:** ${r.themes.map(t => `\`${t}\``).join(", ")}`);
    lines.push(``);
    lines.push(`**English:**`);
    lines.push(``);
    lines.push((r.english || "").slice(0, 1200) + (r.english && r.english.length > 1200 ? "…" : ""));
    lines.push(``);
    lines.push(`**Hindi:**`);
    lines.push(``);
    lines.push((r.hindi || "").slice(0, 1200) + (r.hindi && r.hindi.length > 1200 ? "…" : ""));
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  fs.mkdirSync("test-results", { recursive: true });
  const path = `test-results/phase2-tag-spot-check-${date}.md`;
  fs.writeFileSync(path, lines.join("\n"), "utf8");

  console.log(`\nSpot-check written: ${path}`);
  console.log(`Sample count: ${samples.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
