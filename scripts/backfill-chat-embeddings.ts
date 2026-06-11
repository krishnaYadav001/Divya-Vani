/**
 * Phase 8.x — one-off backfill: embed existing chat_logs rows for memory
 * layer #4 (semantic retrieval — src/lib/chatMemory.ts). New turns are
 * embedded at write time by logChatTurn; this covers everything logged before
 * the feature shipped, so old conversations are retrievable too.
 *
 * Resume-safe: selects only rows WHERE embedding IS NULL, so re-running after
 * an interruption picks up where it left off. Per-row failures are logged and
 * skipped — a later re-run retries them.
 *
 * Prereq: the founder has pasted docs/sql-chat-memory-retrieval.sql (the
 * embedding column must exist).
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/backfill-chat-embeddings.ts
 *   npx tsx --env-file=.env.local scripts/backfill-chat-embeddings.ts --dry-run
 *
 * NOT in package.json — invoke via tsx directly (matches the other one-offs).
 */

import { createClient } from "@supabase/supabase-js";
import { embedChatTurn } from "../src/lib/chatMemory";

const DRY_RUN = process.argv.includes("--dry-run");
const PAGE_SIZE = 100;
const INTER_CALL_DELAY_MS = 250; // gentle on the Gemini embed quota

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — run with --env-file=.env.local");
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY missing — run with --env-file=.env.local");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  let done = 0;
  let failed = 0;

  for (;;) {
    // Always re-query page 0 of the IS NULL set — each successful update
    // removes the row from the set, so this walks the backlog without offsets.
    const { data, error } = await db
      .from("chat_logs")
      .select("id, user_message, reply_text")
      .is("embedding", null)
      .order("turn_at", { ascending: true })
      .limit(PAGE_SIZE);
    if (error) {
      console.error("select failed (embedding column missing? paste the SQL first):", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    if (DRY_RUN) {
      console.log(`[dry-run] would embed ${data.length}+ rows (first page shown); exiting.`);
      return;
    }

    let pageFailures = 0;
    for (const row of data) {
      const embedding = await embedChatTurn(row.user_message ?? "", row.reply_text ?? "");
      if (!embedding) {
        failed++;
        pageFailures++;
        console.warn(`  ✗ embed failed for ${row.id} — skipped (re-run to retry)`);
        continue;
      }
      const { error: upErr } = await db
        .from("chat_logs")
        .update({ embedding })
        .eq("id", row.id);
      if (upErr) {
        failed++;
        pageFailures++;
        console.warn(`  ✗ update failed for ${row.id}: ${upErr.message}`);
      } else {
        done++;
        if (done % 25 === 0) console.log(`  …${done} embedded`);
      }
      await sleep(INTER_CALL_DELAY_MS);
    }

    // Every row in the page failed → the IS NULL re-query would return the
    // same page forever. Stop instead of spinning.
    if (pageFailures === data.length) {
      console.error("entire page failed — aborting (fix the cause, then re-run).");
      break;
    }
  }

  console.log(`\nBackfill complete: ${done} embedded, ${failed} failed${failed ? " (re-run to retry)" : ""}.`);
}

main().catch((e) => {
  console.error("Unexpected error:", e instanceof Error ? e.message : e);
  process.exit(1);
});

export {};
