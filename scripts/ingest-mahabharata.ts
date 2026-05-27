// Phase 1.5 ingest: Mahabharata corpus → Supabase verses table.
// Sibling to scripts/ingest-gita.ts (Phase 1 Gita); shares the same embedding
// model, chunking strategy, and table schema.
//
// Reads:  data/mahabharata-regenerated-cleaned.json (1,704 chunks post-merge)
// Writes: Supabase `verses` table, source='mahabharata'
//
// Field mapping vs CLAUDE.md schema:
//   source           = 'mahabharata'
//   reference        = chunk.reference (e.g. 'mb_udyoga_92_3')
//   chapter          = canonical parva number (e.g. 5 for Udyoga)
//   verse_number     = chunk.section
//   sanskrit         = '' (Sanskrit alignment is a separate gate, deferred)
//   sanskrit_source  = null
//   transliteration  = ''
//   hindi            = chunk.hindi
//   english          = chunk.english
//   themes           = chunk.themes ?? []
//   embedding        = Gemini gemini-embedding-001 @ 768d, RETRIEVAL_DOCUMENT
//
// Embedding text is `english\n\nhindi` — same as Gita ingest. Excludes
// Sanskrit (none attached at this phase) and the chunkN/wordCount metadata
// (would dilute the semantic signal).
//
// Resume-safe: queries existing mahabharata refs at startup and skips them.
// Idempotent in any case via upsert(onConflict='reference'). The --resume
// flag is accepted as a documented no-op for muscle-memory consistency
// with other resume-aware scripts in this repo.
//
// Retry coverage:
//   - 429 / RESOURCE_EXHAUSTED → 60s/120s/240s/480s/960s backoff
//   - fetch failed / ECONNRESET / ETIMEDOUT / socket hang up → 5s/15s/30s/60s/120s
// Inter-call delay of 500ms keeps us at ~40 RPM, well under Tier-1's
// 3000-RPM ceiling and below any per-second burst cap.
//
// Invocation:
//   npm run ingest:mahabharata             # full run, resume-safe
//   npm run ingest:mahabharata -- --dry-run # 5-chunk preview, no writes
//   npx tsx --env-file=.env.local scripts/ingest-mahabharata.ts

import fs from "node:fs";
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
// --resume is a documented no-op (resume is always automatic via Supabase
// ref check at startup). Flag accepted to match conventions of sibling
// scripts in this repo.
const RESUME_FLAG = process.argv.includes("--resume");
const INPUT_PATH = "data/mahabharata-regenerated-cleaned.json";
const SOURCE_NAME = "mahabharata";

// Same embedding model as Gita ingest. Native dim 3072; truncated to 768 via
// outputDimensionality to match the verses.embedding vector(768) column.
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768;
const DRY_RUN_LIMIT = 5;
const PROGRESS_EVERY = 50;

// Retry strategy. Two schedules per error kind:
//   - rate_limit (HTTP 429 / RESOURCE_EXHAUSTED): 60/120/240/480/960s.
//     First step matches Google's per-minute window reset; later steps
//     cover sustained-pressure throttles. Should be a no-op on Tier-1
//     paid (3000 RPM ceiling) but kept for tier transitions and
//     shared-project quota bursts.
//   - network (fetch failed / ECONNRESET / ETIMEDOUT / socket hang up):
//     5/15/30/60/120s. Network blips usually resolve in seconds, so the
//     first step is short — Phase 1.5 ingest hit a sustained 51-chunk
//     fetch-failed window late in the run that this would have absorbed.
const MAX_RETRIES = 5;
const RETRY_BACKOFF_RATE_LIMIT_MS = [60_000, 120_000, 240_000, 480_000, 960_000];
const RETRY_BACKOFF_NETWORK_MS    = [ 5_000,  15_000,  30_000,  60_000, 120_000];

// Inter-call pacing. Tier 1 ceiling is 3000 RPM = 50 RPS. We run at ~40 RPM
// (1 call + 500ms delay) which is well under the documented limit and below
// any undocumented per-second burst smoothing.
const INTER_CALL_DELAY_MS = 500;

// Cost tracking — gemini-embedding-001 is priced at $0.025 per 1M input
// tokens. We estimate tokens from char count (mixed English+Devanagari
// averages ~3 chars/token). Cost is reported as estimate, not exact.
const PRICE_PER_M_TOKENS_USD = 0.025;
const CHARS_PER_TOKEN_EST = 3;
const USD_TO_INR = 83;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Classify an error as retryable and identify its kind. The Gemini SDK
// doesn't expose a structured status; substring matching is stable across
// the relevant SDK versions. Two retryable classes:
//   - "rate_limit" — Google quota throttling (long backoff appropriate)
//   - "network"    — TCP-layer / fetch-layer transient blips (short backoff)
type RetryKind = "rate_limit" | "network";
function isRetryableError(e: unknown): { retryable: boolean; kind: RetryKind | null } {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("[429") || msg.includes("RESOURCE_EXHAUSTED")) {
    return { retryable: true, kind: "rate_limit" };
  }
  if (
    msg.includes("fetch failed") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("socket hang up")
  ) {
    return { retryable: true, kind: "network" };
  }
  return { retryable: false, kind: null };
}

function estimateInr(totalChars: number): number {
  const tokens = totalChars / CHARS_PER_TOKEN_EST;
  return (tokens / 1_000_000) * PRICE_PER_M_TOKENS_USD * USD_TO_INR;
}

// Canonical Mahabharata parva numbering (1–18 in classical order). Our corpus
// covers 13 of the 18: missing virata (4), anushasana (13), ashramavasika (15),
// mahaprasthanika (17), svargarohanika (18). Those parvas are intentionally
// out of scope for v1 — see CLAUDE.md "Build phase reference" Phase 1.5.
// Throwing on an unknown parva at startup keeps a future corpus expansion
// honest about adding the mapping rather than silently writing chapter=0.
const PARVA_NUMBER: Record<string, number> = {
  adi: 1,
  sabha: 2,
  vana: 3,
  // virata: 4 — not in corpus
  udyoga: 5,
  bhishma: 6,
  drona: 7,
  karna: 8,
  shalya: 9,
  sauptika: 10,
  stri: 11,
  shanti: 12,
  // anushasana: 13 — not in corpus
  ashvamedhika: 14,
  // ashramavasika: 15 — not in corpus
  mausala: 16,
  // mahaprasthanika: 17, svargarohanika: 18 — not in corpus
};

type Chunk = {
  reference: string;
  parva: string;
  section: number;
  chunkN: number;
  english: string;
  hindi: string;
  wordCount: number;
  warnings: string[];
  themes?: string[];
};

async function main() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing in .env.local");
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL missing in .env.local");
  if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in .env.local");

  const chunks: Chunk[] = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
  console.log(`Loaded ${chunks.length} chunks from ${INPUT_PATH}`);
  if (RESUME_FLAG) console.log(`--resume flag accepted (resume is automatic; flag is a no-op).`);

  // Validate parva mapping up front. Failing here is much cheaper than
  // failing on row 1,400 of an in-flight ingest.
  const distinctParvas = [...new Set(chunks.map((c) => c.parva))];
  const unknown = distinctParvas.filter((p) => !(p in PARVA_NUMBER));
  if (unknown.length > 0) {
    throw new Error(`Unknown parva names (no number mapping): ${unknown.join(", ")}`);
  }
  console.log(`Parva coverage: ${distinctParvas.length} parvas, all mapped.`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const embedModel = genAI.getGenerativeModel({ model: EMBED_MODEL });

  // Resume-safe: fetch already-ingested refs so we don't re-embed.
  // Paginated via .range() because the Supabase JS client's .select()
  // caps responses at 1000 rows by default — without pagination, refs
  // beyond row 1000 are treated as not-yet-ingested and re-processed.
  // (Phase 1.5 burned ~₹1 / 653 phantom re-embeds before this fix.)
  const existingRefs = new Set<string>();
  if (!DRY_RUN) {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("verses")
        .select("reference")
        .eq("source", SOURCE_NAME)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Supabase select existing: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const row of data) existingRefs.add(row.reference);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    console.log(`Already ingested: ${existingRefs.size} chunks. Will skip these.`);
  }

  const work = DRY_RUN
    ? chunks.slice(0, DRY_RUN_LIMIT)
    : chunks.filter((c) => !existingRefs.has(c.reference));
  console.log(`To ingest: ${work.length} chunks${DRY_RUN ? " [DRY-RUN: no DB writes]" : ""}.\n`);

  if (work.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let okCount = 0;
  let failCount = 0;
  let apiCallCount = 0;   // every embedContent attempt, including retries
  let retryCount = 0;     // retries triggered by 429 or network errors
  let totalChars = 0;     // for cost estimation
  const failures: Array<{ ref: string; reason: string }> = [];
  const startTime = Date.now();

  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    const text = `${c.english}\n\n${c.hindi}`.trim();

    try {
      // Retry-aware embedding. Each call counts toward apiCallCount.
      let embedding: number[] | null = null;
      let attempt = 0;
      while (attempt <= MAX_RETRIES) {
        try {
          apiCallCount++;
          // SDK v0.24 types don't include outputDimensionality on EmbedContentRequest,
          // but the v1beta API accepts it. Cast bypasses the stale type. Same pattern
          // as ingest-gita.ts.
           
          const r = await embedModel.embedContent({
            content: { role: "user", parts: [{ text }] },
            taskType: TaskType.RETRIEVAL_DOCUMENT,
            outputDimensionality: EMBED_DIM,
          } as any);
          embedding = r.embedding.values;
          break;
        } catch (e) {
          const { retryable, kind } = isRetryableError(e);
          if (!retryable || attempt >= MAX_RETRIES) throw e;
          retryCount++;
          const schedule = kind === "rate_limit" ? RETRY_BACKOFF_RATE_LIMIT_MS : RETRY_BACKOFF_NETWORK_MS;
          const wait = schedule[attempt];
          const label = kind === "rate_limit" ? "429 / RESOURCE_EXHAUSTED" : "network (fetch failed)";
          console.warn(
            `  [${c.reference}] ${label} — backing off ${wait / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await sleep(wait);
          attempt++;
        }
      }
      if (!embedding) throw new Error("embed returned no value after retries");
      if (embedding.length !== EMBED_DIM) {
        throw new Error(`Embedding dim ${embedding.length} != expected ${EMBED_DIM}`);
      }
      totalChars += text.length;

      if (DRY_RUN) {
        const preview = embedding.slice(0, 3).map((n) => n.toFixed(4)).join(", ");
        console.log(
          `  [${c.reference}] parva=${c.parva}(ch=${PARVA_NUMBER[c.parva]}) verse=${c.section}  embed dim=${embedding.length} first3=[${preview}]  text_len=${text.length}`,
        );
      } else {
        const { error } = await supabase
          .from("verses")
          .upsert(
            {
              source: SOURCE_NAME,
              reference: c.reference,
              chapter: PARVA_NUMBER[c.parva],
              verse_number: c.section,
              sanskrit: "",
              sanskrit_source: null,
              transliteration: "",
              hindi: c.hindi,
              english: c.english,
              themes: c.themes ?? [],
              embedding,
            },
            { onConflict: "reference" },
          );
        if (error) throw new Error(`Supabase upsert: ${error.message}`);
      }
      okCount++;
    } catch (e) {
      failCount++;
      const reason = e instanceof Error ? e.message : String(e);
      failures.push({ ref: c.reference, reason });
      console.error(`  [${c.reference}] FAILED: ${reason}`);
    }

    if (!DRY_RUN && (i + 1) % PROGRESS_EVERY === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      const eta = rate > 0 ? Math.ceil((work.length - i - 1) / rate / 60) : 0;
      const cost = estimateInr(totalChars);
      console.log(
        `  Progress: ${i + 1}/${work.length}  (${elapsed.toFixed(0)}s, ok=${okCount} fail=${failCount}, calls=${apiCallCount} retries=${retryCount}, cost ~₹${cost.toFixed(2)}, ETA ${eta}min)`,
      );
    }

    // Inter-call pacing. Skip after the last chunk — no point waiting on exit.
    if (!DRY_RUN && i < work.length - 1) {
      await sleep(INTER_CALL_DELAY_MS);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Final stats ===`);
  console.log(`ok:           ${okCount}`);
  console.log(`fail:         ${failCount}`);
  console.log(`api calls:    ${apiCallCount}`);
  console.log(`retries:      ${retryCount}  (rate-limit + network combined)`);
  console.log(`chars sent:   ${totalChars.toLocaleString()}`);
  console.log(`cost (est):   ~₹${estimateInr(totalChars).toFixed(2)}`);
  console.log(`time:         ${totalTime}s`);
  if (failures.length > 0) {
    console.log(`\nFailures (${failures.length}):`);
    for (const f of failures.slice(0, 20)) console.log(`  ${f.ref}  ::  ${f.reason}`);
    if (failures.length > 20) console.log(`  …and ${failures.length - 20} more`);
  }
  if (DRY_RUN) console.log(`\n[DRY-RUN] No DB writes performed.`);
  if (failCount > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
