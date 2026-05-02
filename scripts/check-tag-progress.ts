// One-off: check how many verses have themes populated vs empty.
// Used to decide whether to resume tag-themes after a crash.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("env missing");

const s = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  for (const src of ["gita", "mahabharata", "bhagavata"]) {
    const { count: total } = await s
      .from("verses")
      .select("*", { count: "exact", head: true })
      .eq("source", src);
    const { count: empty } = await s
      .from("verses")
      .select("*", { count: "exact", head: true })
      .eq("source", src)
      .or("themes.is.null,themes.eq.{}");
    const tagged = (total ?? 0) - (empty ?? 0);
    console.log(`${src}: total=${total} tagged=${tagged} empty=${empty}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
