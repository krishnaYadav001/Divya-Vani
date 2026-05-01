// Phase 1.7 post-ingest sanity check. Counts rows in `verses` table by
// source, and within bhagavata splits by canto prefix. One-off, NOT in
// package.json.
import { createClient } from "@supabase/supabase-js";

async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const sources = ["gita", "mahabharata", "bhagavata"] as const;
  let total = 0;
  for (const src of sources) {
    const { count, error } = await sb
      .from("verses")
      .select("*", { count: "exact", head: true })
      .eq("source", src);
    if (error) throw error;
    console.log(`${src.padEnd(12)} ${count}`);
    total += count ?? 0;
  }
  console.log(`${"total".padEnd(12)} ${total}`);

  // Bhagavata canto split (paginated to handle >1000 rows).
  const allRefs: string[] = [];
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await sb
      .from("verses")
      .select("reference")
      .eq("source", "bhagavata")
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) allRefs.push(row.reference);
    if (data.length < 1000) break;
  }
  const c10 = allRefs.filter(r => r.startsWith("bhagavata_10")).length;
  const c11 = allRefs.filter(r => r.startsWith("bhagavata_11")).length;
  console.log();
  console.log(`bhagavata_10 ${c10}`);
  console.log(`bhagavata_11 ${c11}`);
  console.log(`other        ${allRefs.length - c10 - c11}`);
}

main().catch(e => { console.error(e); process.exit(1); });
