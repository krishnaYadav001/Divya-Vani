// Phase 1.6 ingest: Bhagavata Purana Canto 10 corpus → Supabase verses table.
// Sibling to scripts/ingest-mahabharata.ts (Phase 1.5); shares the same
// embedding model, retry strategy, and table schema.
//
// Reads:  data/bhagavata-regenerated-cleaned.json (568 chunks post-em-dash-merge)
// Writes: Supabase `verses` table, source='bhagavata'
//
// Field mapping vs CLAUDE.md schema:
//   source           = 'bhagavata'
//   reference        = chunk.reference (e.g. 'bhagavata_10.29.7' anchored
//                      or 'bhagavata_10.55_3' fallback — dot vs underscore
//                      separator distinguishes)
//   chapter          = chunk.chapter (1–90 within Canto 10)
//   verse_number     = chunk.verseStart (anchored) OR chunk.fallbackChunkN
//                      (fallback). Schema invariant: exactly one is non-null.
//   sanskrit         = '' (Sanskrit alignment is Phase 9+)
//   sanskrit_source  = null
//   transliteration  = ''
//   hindi            = chunk.hindi
//   english          = chunk.english
//   themes           = chunk.themes ?? []
//   embedding        = Gemini gemini-embedding-001 @ 768d, RETRIEVAL_DOCUMENT
//
// Embedding text is `english\n\nhindi` — same as MB and Gita ingest. Excludes
// Sanskrit (none attached at this phase).
//
// Resume-safe: queries existing bhagavata refs at startup and skips them.
// Idempotent via upsert(onConflict='reference').
//
// Retry coverage (verbatim from MB ingest):
//   - 429 / RESOURCE_EXHAUSTED → 60s/120s/240s/480s/960s backoff
//   - fetch failed / ECONNRESET / ETIMEDOUT / socket hang up → 5s/15s/30s/60s/120s
// Inter-call delay 500ms keeps us at ~40 RPM.
//
// Invocation:
//   npm run ingest:bhagavata             # full run, resume-safe
//   npm run ingest:bhagavata:dry         # 5-chunk preview, no writes

import fs from "node:fs";
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
const RESUME_FLAG = process.argv.includes("--resume");
const INPUT_PATH = "data/bhagavata-regenerated-cleaned.json";
const SOURCE_NAME = "bhagavata";

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768;
const DRY_RUN_LIMIT = 5;
const PROGRESS_EVERY = 50;

const MAX_RETRIES = 5;
const RETRY_BACKOFF_RATE_LIMIT_MS = [60_000, 120_000, 240_000, 480_000, 960_000];
const RETRY_BACKOFF_NETWORK_MS    = [ 5_000,  15_000,  30_000,  60_000, 120_000];

const INTER_CALL_DELAY_MS = 500;

const PRICE_PER_M_TOKENS_USD = 0.025;
const CHARS_PER_TOKEN_EST = 3;
const USD_TO_INR = 83;

// Bhagavata Canto 10 has 90 chapters. Validation: every chunk's chapter must
// be in [1, CANTO_LAST_CHAPTER]. Throwing on out-of-range at startup keeps
// future Phase 1.7 (Canto 11.6–29) honest about updating this constant rather
// than silently writing chapter=99.
const CANTO = 10;
const CANTO_LAST_CHAPTER = 90;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

type Chunk = {
  reference: string;
  canto: number;
  chapter: number;
  verseStart: number | null;
  verseEnd: number | null;
  fallbackChunkN: number | null;
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

  // Validate input shape up front. Mirror MB's "throw on unknown parva"
  // discipline — surface schema violations BEFORE any embedding spend.
  const distinctChapters = [...new Set(chunks.map((c) => c.chapter))];
  const oor = distinctChapters.filter((ch) => ch < 1 || ch > CANTO_LAST_CHAPTER);
  if (oor.length > 0) {
    throw new Error(`Out-of-range chapters (expected 1–${CANTO_LAST_CHAPTER}): ${oor.join(", ")}`);
  }
  const wrongCanto = chunks.filter((c) => c.canto !== CANTO);
  if (wrongCanto.length > 0) {
    throw new Error(`Found ${wrongCanto.length} chunks with canto != ${CANTO} — Phase 1.6 should be Canto 10 only.`);
  }
  // Schema invariant: exactly one of verseStart / fallbackChunkN is non-null.
  const broken = chunks.filter(
    (c) => (c.verseStart == null) === (c.fallbackChunkN == null)
  );
  if (broken.length > 0) {
    throw new Error(
      `Schema invariant violated on ${broken.length} chunks: exactly one of verseStart / fallbackChunkN must be non-null. First: ${broken[0].reference}`
    );
  }
  console.log(
    `Chapter coverage: ${distinctChapters.length} chapters (range ${Math.min(...distinctChapters)}–${Math.max(...distinctChapters)}).`
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const embedModel = genAI.getGenerativeModel({ model: EMBED_MODEL });

  // Resume-safe: paginate over already-ingested refs (Supabase JS client
  // caps .select() at 1000 rows; without pagination, refs beyond row 1000
  // are mis-treated as not-yet-ingested and re-embedded — Phase 1.5 burned
  // ~₹1 / 653 phantom re-embeds before this fix landed).
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
  let apiCallCount = 0;
  let retryCount = 0;
  let totalChars = 0;
  const failures: Array<{ ref: string; reason: string }> = [];
  const startTime = Date.now();

  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    const text = `${c.english}\n\n${c.hindi}`.trim();

    try {
      let embedding: number[] | null = null;
      let attempt = 0;
      while (attempt <= MAX_RETRIES) {
        try {
          apiCallCount++;
          // SDK v0.24 types don't include outputDimensionality on EmbedContentRequest,
          // but the v1beta API accepts it. Cast bypasses the stale type.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // Resolve verse_number per the schema invariant: verseStart for anchored
      // chunks, fallbackChunkN for fallback chunks. Validation above guaranteed
      // exactly one is non-null.
      const verseNumber = c.verseStart ?? c.fallbackChunkN;
      if (verseNumber == null) throw new Error(`Schema invariant: ${c.reference} has neither verseStart nor fallbackChunkN`);

      if (DRY_RUN) {
        const preview = embedding.slice(0, 3).map((n) => n.toFixed(4)).join(", ");
        const anchorTag = c.verseStart != null
          ? `vv. ${c.verseStart}${c.verseEnd != null && c.verseEnd !== c.verseStart ? `–${c.verseEnd}` : ""}`
          : `fallback chunk ${c.fallbackChunkN}`;
        console.log(
          `  [${c.reference}] ch=${c.chapter} ${anchorTag}  embed dim=${embedding.length} first3=[${preview}]  text_len=${text.length}`,
        );
      } else {
        const { error } = await supabase
          .from("verses")
          .upsert(
            {
              source: SOURCE_NAME,
              reference: c.reference,
              chapter: c.chapter,
              verse_number: verseNumber,
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
