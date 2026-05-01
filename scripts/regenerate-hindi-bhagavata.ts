// Phase 1.6 Hindi regeneration for the Bhagavata Purana Canto 10 corpus.
// Sibling to scripts/regenerate-hindi-mahabharata.ts (Phase 1.5).
//
// Input:  data/bhagavata.json (633 chunks emitted by parse-bhagavata.ts)
// Output: data/bhagavata-regenerated.json (each chunk gets a `hindi` field)
//
// SYSTEM_PROMPT = v3 base (regenerate-hindi.ts:55-72) softened to
// "Sanskrit scripture (Bhagavad Gita, Mahabharata, and Bhagavata Purana)"
// + Bhagavata addendum v1.1 (3 bullets, locked 2026-05-01 in decisions.md;
// full text in project memory project_phase16_bhagavata_source.md). The MB
// single-line prose addendum is REPLACED entirely — bullet 1 of v1.1 covers
// the same Sanskrit-absent ground.
//
// Differences from MB regen:
//   - INPUT_PATH / OUTPUT_PATH point to bhagavata files
//   - MAX_TOKENS = 1800 (up from MB's 1500) — Bhagavata Hindi expansion is
//     25–35% (vs MB's 20–30%); pressure-test 2026-05-01 truncated 2/6 at 800
//   - Chunk type uses canto/chapter/verseStart/verseEnd/fallbackChunkN
//   - userPrompt frames "Bhagavata Purana Canto N passage" + verse-range
//     clause only when verseStart is non-null
//   - Dry-run picker selects 5 chunks by chapter (one per register) instead
//     of MB's by-parva picker
//   - Consistency-check report → test-results/phase1.6-regen-discrepancy.md
//
// Invocation:
//   npm run regen:hindi:bhagavata          # full ~633-chunk run
//   npm run regen:hindi:bhagavata:dry      # 5-chunk sample, no file write
//   tsx --env-file=.env.local scripts/regenerate-hindi-bhagavata.ts [--dry-run|--resume]

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import pLimit from "p-limit";

const INPUT_PATH = "data/bhagavata.json";
const OUTPUT_PATH = "data/bhagavata-regenerated.json";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1800; // Up from MB's 1500. Bhagavata Hindi expansion is
                         // 25–35% over English (pressure-test 2026-05-01,
                         // 6 sample registers; 2 of 6 at MAX_TOKENS=800 hit
                         // mid-word truncation). 1800 leaves margin on
                         // 300-word source paragraphs after expansion.
const TEMPERATURE = 0.4;

// Sonnet 4.6 pricing (USD per 1M tokens). Cache tiers per Anthropic 2026 schedule.
const PRICE_INPUT_PER_M       = 3.00;   // standard (non-cached) input
const PRICE_CACHE_WRITE_PER_M = 3.75;   // cache creation: 1.25x standard
const PRICE_CACHE_READ_PER_M  = 0.30;   // cache read: 0.10x standard (90% off)
const PRICE_OUTPUT_PER_M      = 15.00;
const USD_TO_INR              = 83;

const DRY_RUN = process.argv.includes("--dry-run");
const RESUME = process.argv.includes("--resume");
const DRY_RUN_LIMIT = 5;
const PROGRESS_EVERY = 50;
const SAVE_EVERY = 50;
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;
// Concurrent in-flight messages.create() calls. Same as MB regen — within
// Sonnet 4.6 tier-1 RPM and gives ~3× wall-time speedup vs sequential.
const CONCURRENCY = 3;

type Chunk = {
  reference: string;
  canto: number;
  chapter: number;
  verseStart: number | null;
  verseEnd: number | null;
  fallbackChunkN: number | null;
  english: string;
  wordCount: number;
  warnings: string[];
  hindi?: string;
};

// SYSTEM_PROMPT — v3 base verbatim from scripts/regenerate-hindi.ts:55-72
// (and scripts/regenerate-hindi-mahabharata.ts:68-86), with two changes:
//   1. Opening line scope softened to include Bhagavata Purana.
//   2. MB single-line prose addendum REMOVED entirely.
// Plus the Bhagavata addendum v1.1 appended (3 bullets, locked 2026-05-01).
//
// CRITICAL: do not edit SYSTEM_PROMPT during a run — any change invalidates
// the prompt cache and forces a full re-write at 1.25x standard input price.
const SYSTEM_PROMPT = `You are a translator producing modern Hindi translations of Sanskrit scripture (Bhagavad Gita, Mahabharata, and Bhagavata Purana) with scriptural dignity. Your audience: Hindi-speaking devotees who expect the text to retain dignity while remaining accessible.

Style guidelines:
- Use modern Hindi with scriptural dignity. Not Sanskritized/literary, but not casual blog-style either. Vocabulary leans formal: prefer "पुत्र" (not "बेटे") for sons of named figures; "वचन" or "कहा" (use "बात" sparingly, only when truly conversational); "इच्छा" or "अभिलाषा" (not "चाहत"). Vocabulary should feel slightly elevated to preserve the verse's gravity.
- Clean modern Hindi grammar, short sentences, clear structure.
- Keep philosophical terms in Sanskrit form: dharma (धर्म), yoga (योग), karma (कर्म), atman (आत्मा), brahman (ब्रह्म), moksha (मोक्ष), maya (माया), bhakti (भक्ति), guru (गुरु), purusha (पुरुष), prakriti (प्रकृति), gunas (गुण), jnana (ज्ञान), sannyasa (संन्यास).
- Preserve meaning, not Sanskrit word order.
- Use the English translation as a meaning reference, not as a literal source for translation.
- Use classical Devanagari spelling with conjunct consonants throughout: पाण्डु (not पांडु), कुन्ती (not कुंती), गान्धार (not गांधार), पाण्डव (not पांडव), कुन्तिभोज (not कुंतिभोज). This is consistent with scriptural editions and signals authenticity.
- For dialogue passages (e.g., "Arjuna said:", "Krishna said:"), write the speaker indicator inline separated by em-dash, on the same line as the rest of the verse. Example: "धृतराष्ट्र ने कहा — हे सञ्जय, ..." (NOT "धृतराष्ट्र ने कहा:\\n\\nहे सञ्जय, ..." with a blank line; NOT a colon followed by a paragraph break).
- Maintain consistency across passages: the same Sanskrit term maps to the same Hindi term. "पुत्र" always renders as "पुत्र" (never alternating with "बेटे"); "सेना" always as "सेना" (not "सैन्य"/"फौज"). When a Sanskrit term recurs, use the same Hindi rendering each time.
- Every passage must end with proper Hindi terminal punctuation: "।" for declarative statements, "?" for questions, "!" for exclamations. Never end on an em-dash, comma, semicolon, or any non-terminal punctuation. If the English source ends on an em-dash construction (e.g., "Saibya—the best of men"), either restructure the Hindi to close cleanly with a verb and "।", or convert the em-dash content into a parenthetical clause that ends properly.

- Sanskrit may be partial or absent. Sanyal's English translation is literary prose rendered from Sanskrit verses; the parallel Sanskrit is not attached at this stage (alignment is a Phase 9+ audit). Translate based on the English; preserve Sanskrit philosophical and devotional terms wherever they appear inline.

- The Bhagavata Canto 10 voice is lyrical and devotional — Krishna's lila in Vrindavan: Yashoda's maternal love, gopi longing, butter-stealing, the rasa-lila, flute under the kadamba tree. Preserve this warmth and intimacy while maintaining scriptural register. The voice is tender, never casual; reverent, never distant. Where the English source is rhythmic or lyrical, mirror that rhythm in Hindi (short clauses, concrete imagery — moonlight, Yamuna, peacock feather, calves, butter pots) rather than retreating to abstract Sanskritic compounds.

- Bhagavata-specific glossary, locked across the corpus (same Hindi form every time the term recurs):
    Names: यशोदा, नन्द, देवकी, वसुदेव, कंस, बलराम, उद्धव, रुक्मिणी, सत्यभामा, सुदामा।
    Places: वृन्दावन, गोकुल, मथुरा, द्वारका, यमुना, गोवर्धन।
    Devotional terms (Sanskrit form): लीला, भक्ति, प्रेम, रस, गोपी।
    Cowherd / cowherd-boy: गोप uniformly (do not alternate with ग्वाला).
    Krishna's third-person names stay in Sanskrit form: गोविन्द, माधव, हरि, मुरारि, श्याम, घनश्याम — the same name in the English source maps to the same Devanagari rendering throughout.

Output format:
- ONLY the Hindi translation in Devanagari.
- No English, no romanization, no commentary, no preamble.
- No quotation marks around the translation, no headers.
- Just the translation text, ready to display.`;

function userPrompt(chunk: Chunk): string {
  // Verse-range clause only when chunk is anchored. Fallback chunks
  // (no parenthetical in source) get just chapter framing.
  let where = `chapter ${chunk.chapter}`;
  if (chunk.verseStart != null) {
    if (chunk.verseEnd != null && chunk.verseEnd > chunk.verseStart) {
      where = `chapter ${chunk.chapter}, verses ${chunk.verseStart}–${chunk.verseEnd}`;
    } else {
      where = `chapter ${chunk.chapter}, verse ${chunk.verseStart}`;
    }
  }
  return `Translate this Bhagavata Purana Canto ${chunk.canto} passage (Sanyal English, ${where}) to natural Hindi with scriptural dignity.

English:
${chunk.english}

Hindi (Devanagari only):`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function fmtUsd(n: number): string { return `$${n.toFixed(4)}`; }
function fmtInr(n: number): string { return `₹${n.toFixed(2)}`; }

type TokenCounts = {
  input: number;          // standard non-cached input (user message portion)
  cacheCreate: number;    // tokens written to cache (first call to a fresh prompt)
  cacheRead: number;      // tokens read from cache (subsequent calls within 5 min)
  output: number;
};

function totalCost(t: TokenCounts): { usd: number; inr: number } {
  const usd =
    (t.input        / 1_000_000) * PRICE_INPUT_PER_M       +
    (t.cacheCreate  / 1_000_000) * PRICE_CACHE_WRITE_PER_M +
    (t.cacheRead    / 1_000_000) * PRICE_CACHE_READ_PER_M  +
    (t.output       / 1_000_000) * PRICE_OUTPUT_PER_M;
  return { usd, inr: usd * USD_TO_INR };
}

// What the same call would have cost without prompt caching: cache_create
// and cache_read tokens are counted as standard input.
function uncachedBaseline(t: TokenCounts): { usd: number; inr: number } {
  const totalInputAsStandard = t.input + t.cacheCreate + t.cacheRead;
  const usd =
    (totalInputAsStandard / 1_000_000) * PRICE_INPUT_PER_M +
    (t.output             / 1_000_000) * PRICE_OUTPUT_PER_M;
  return { usd, inr: usd * USD_TO_INR };
}

function oneLine(s: string): string { return s.replace(/\s+/g, " ").trim(); }

type CallStats = {
  hindi: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
};

async function regenerateOne(client: Anthropic, chunk: Chunk): Promise<CallStats> {
  let attempt = 0;
  let lastErr: unknown = null;
  while (attempt < MAX_RETRIES) {
    try {
      const r = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        // System prompt wrapped with cache_control: 'ephemeral' for 5-min
        // prompt caching. First call writes the SYSTEM_PROMPT to cache
        // (~1100 tokens for v1.1 — heavier than MB's ~700 due to the longer
        // 3-bullet addendum) at 1.25x standard input price; subsequent calls
        // within 5 min read from cache at 0.10x standard input price.
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userPrompt(chunk) }],
      });
      const text = r.content.find(b => b.type === "text")?.text?.trim() ?? "";
      if (!text) throw new Error("empty response from model");
      return {
        hindi: text,
        inputTokens: r.usage.input_tokens ?? 0,
        outputTokens: r.usage.output_tokens ?? 0,
        cacheCreationTokens: r.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: r.usage.cache_read_input_tokens ?? 0,
      };
    } catch (e: unknown) {
      lastErr = e;
      const isRetryable =
        (e instanceof Anthropic.APIError &&
          (e.status === 429 || (typeof e.status === "number" && e.status >= 500)))
        || (e instanceof Anthropic.APIConnectionError)
        || (e instanceof Anthropic.APIConnectionTimeoutError);
      if (!isRetryable) break;
      const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
      const status = e instanceof Anthropic.APIError ? String(e.status) : "unknown";
      console.warn(`  [${chunk.reference}] retry ${attempt + 1}/${MAX_RETRIES} after ${backoff}ms (status=${status})`);
      await sleep(backoff);
      attempt++;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY missing. Run with: tsx --env-file=.env.local scripts/regenerate-hindi-bhagavata.ts");
  }

  const chunks: Chunk[] = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
  console.log(`Loaded ${chunks.length} chunks from ${INPUT_PATH}`);

  let processed: Chunk[] = [];

  if (RESUME && !DRY_RUN) {
    if (fs.existsSync(OUTPUT_PATH)) {
      processed = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
      console.log(`Resuming: ${processed.length} chunks already in ${OUTPUT_PATH}`);
    } else {
      console.log(`No existing ${OUTPUT_PATH} — starting fresh.`);
    }
  } else if (DRY_RUN) {
    console.log(`[DRY-RUN] 5 diverse chunks across registers, no file write.\n`);
  }

  const client = new Anthropic();
  const startTime = Date.now();
  const tokens: TokenCounts = { input: 0, cacheCreate: 0, cacheRead: 0, output: 0 };
  let okCount = 0;
  let failCount = 0;

  // ===== DRY RUN — sequential for clean side-by-side output =====
  if (DRY_RUN) {
    // Pick one chunk per register, by chapter. Prefer anchored chunks for
    // cleanest test-output presentation. minWords filters out tiny
    // intro/dialogue fragments; maxWords keeps prompts readable.
    const pickInChapter = (ch: number, minWords = 150, maxWords = 320): Chunk | null => {
      const candidates = chunks.filter(c => c.chapter === ch && c.wordCount >= minWords && c.wordCount <= maxWords);
      if (candidates.length === 0) return chunks.find(c => c.chapter === ch) ?? null;
      // Prefer anchored chunks; fall back to any candidate
      return candidates.find(c => c.verseStart != null) ?? candidates[0];
    };
    const samples = [
      pickInChapter(9),    // Bal-vatsalya — Yashoda binding Krishna to mortar
      pickInChapter(25),   // Vrindavan-strength — Govardhana lifting
      pickInChapter(29),   // Vrindavan-longing — rasa-lila opening
      pickInChapter(47),   // Vrindavan-viraha — Bhramara-gita
      pickInChapter(80),   // Householder — Sudama arrives at Dvaraka
    ].filter((c): c is Chunk => c !== null);

    if (samples.length < DRY_RUN_LIMIT) {
      console.warn(`Only ${samples.length} dry-run samples found; expected ${DRY_RUN_LIMIT}.`);
    }

    const registerLabels = ["Bal-vatsalya", "Vrindavan-strength", "Vrindavan-longing", "Vrindavan-viraha", "Householder"];

    for (let i = 0; i < samples.length; i++) {
      const c = samples[i];
      const label = registerLabels[i] ?? "?";
      try {
        const stats = await regenerateOne(client, c);
        tokens.input       += stats.inputTokens;
        tokens.output      += stats.outputTokens;
        tokens.cacheCreate += stats.cacheCreationTokens;
        tokens.cacheRead   += stats.cacheReadTokens;
        const cacheNote =
          stats.cacheCreationTokens > 0 ? ` [cache write: ${stats.cacheCreationTokens}t]` :
          stats.cacheReadTokens > 0     ? ` [cache read: ${stats.cacheReadTokens}t]`     : "";
        const anchorTag = c.verseStart != null
          ? `vv. ${c.verseStart}${c.verseEnd != null && c.verseEnd !== c.verseStart ? `–${c.verseEnd}` : ""}`
          : `fallback chunk ${c.fallbackChunkN}`;
        console.log(`\n=== [${label}] ${c.reference} (ch ${c.chapter}, ${anchorTag}, ${c.wordCount}w)${cacheNote} ===`);
        console.log(`ENGLISH:\n${oneLine(c.english).slice(0, 700)}${c.english.length > 700 ? "…" : ""}`);
        console.log(`\nHINDI:\n${stats.hindi}`);
        console.log("---");
        okCount++;
      } catch (e) {
        failCount++;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  [${c.reference}] FAILED: ${msg}`);
      }
    }
  }
  // ===== FULL RUN — pLimit(3) bounded concurrency =====
  else {
    const limit = pLimit(CONCURRENCY);
    const processedRefs = new Set(processed.map(c => c.reference));
    const todo = chunks.filter(c => !processedRefs.has(c.reference));
    console.log(`Concurrency: ${CONCURRENCY}. Todo: ${todo.length} of ${chunks.length} chunks.`);
    if (todo.length === 0) {
      console.log("All chunks already regenerated. Nothing to do.");
    }

    // Push order — references in the order their messages.create() resolved
    // this run. Used by the post-run disk-vs-memory consistency check below
    // to surface the most recent in-flight chunks if disk and memory diverge.
    const processOrder: string[] = [];

    // Map for sorting `processed` back into input order before each save.
    const inputOrder = new Map(chunks.map((c, i) => [c.reference, i]));
    let lastSaveAt = processed.length;
    let lastProgressAt = processed.length;

    const flushSave = () => {
      processed.sort((a, b) =>
        (inputOrder.get(a.reference) ?? 0) - (inputOrder.get(b.reference) ?? 0)
      );
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(processed, null, 2), "utf8");
      lastSaveAt = processed.length;
    };

    const logProgress = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const cost = totalCost(tokens);
      const baseline = uncachedBaseline(tokens);
      const saved = baseline.inr - cost.inr;
      const cacheTotal = tokens.cacheRead + tokens.cacheCreate;
      const hitRate = cacheTotal > 0 ? (100 * tokens.cacheRead / cacheTotal).toFixed(0) : "0";
      const remaining = todo.length - okCount;
      const ratePerSec = okCount / elapsed;
      const etaMin = ratePerSec > 0 ? Math.ceil(remaining / ratePerSec / 60) : 0;
      console.log(
        `  [${processed.length}/${chunks.length}] ${elapsed.toFixed(0)}s | cost: ${fmtInr(cost.inr)} | ` +
        `cache writes: ${tokens.cacheCreate.toLocaleString()}t | ` +
        `cache reads: ${tokens.cacheRead.toLocaleString()}t | ` +
        `hit rate: ${hitRate}% | saved: ${fmtInr(saved)} | ETA: ${etaMin}min`
      );
      lastProgressAt = processed.length;
    };

    await Promise.all(
      todo.map(c => limit(async () => {
        try {
          const stats = await regenerateOne(client, c);
          tokens.input       += stats.inputTokens;
          tokens.output      += stats.outputTokens;
          tokens.cacheCreate += stats.cacheCreationTokens;
          tokens.cacheRead   += stats.cacheReadTokens;
          processed.push({ ...c, hindi: stats.hindi });
          processOrder.push(c.reference);
          okCount++;

          // Save / progress checkpoints — use delta-from-last to tolerate
          // concurrency races (modulo-50 might miss with 3 in-flight).
          if (processed.length - lastSaveAt >= SAVE_EVERY) flushSave();
          if (processed.length - lastProgressAt >= PROGRESS_EVERY) logProgress();
        } catch (e) {
          failCount++;
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`  [${c.reference}] FAILED: ${msg}`);
        }
      }))
    );

    // Final save (catches any tail < SAVE_EVERY since last checkpoint)
    flushSave();

    // Disk-vs-memory consistency check. Mirrors the Phase 1.5 invariant —
    // catches the dual-write/last-writer-wins class of bug. After flushSave,
    // the file on disk MUST contain exactly the same number of entries as
    // the in-memory `processed` array.
    const onDiskRaw = fs.readFileSync(OUTPUT_PATH, "utf8");
    const onDisk = JSON.parse(onDiskRaw) as Chunk[];
    if (onDisk.length !== processed.length) {
      const ts = new Date().toISOString();
      const report = [
        `# Phase 1.6 disk-vs-memory consistency check FAILED`,
        ``,
        `**Generated:** ${ts}`,
        ``,
        `## Counts`,
        `- In-memory processed.length: ${processed.length}`,
        `- On-disk entry count:        ${onDisk.length}`,
        `- Delta (memory − disk):      ${processed.length - onDisk.length}`,
        ``,
        `## This-run stats at exit`,
        `- okCount:   ${okCount}`,
        `- failCount: ${failCount}`,
        `- todo:      ${todo.length}`,
        ``,
        `## Last 50 chunks processed in this run (push order)`,
        ``,
        ...processOrder.slice(-50).map(r => `- ${r}`),
        ``,
        `## Action required`,
        `Stop and review before re-running. Do not assume disk and memory match.`,
        ``,
      ].join("\n");
      fs.mkdirSync("test-results", { recursive: true });
      fs.writeFileSync("test-results/phase1.6-regen-discrepancy.md", report, "utf8");
      console.error(`\n!!! DISK-VS-MEMORY CONSISTENCY CHECK FAILED !!!`);
      console.error(`In-memory: ${processed.length}, on-disk: ${onDisk.length}`);
      console.error(`Wrote test-results/phase1.6-regen-discrepancy.md`);
      process.exit(2);
    }
    console.log(`Disk-vs-memory consistency check: OK (both = ${processed.length})`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const cost = totalCost(tokens);
  const baseline = uncachedBaseline(tokens);
  const saved = baseline.inr - cost.inr;
  const cacheTotal = tokens.cacheRead + tokens.cacheCreate;
  const hitRate = cacheTotal > 0 ? (100 * tokens.cacheRead / cacheTotal).toFixed(1) : "0.0";
  console.log("\n=== Final stats ===");
  console.log(`Chunks processed: ${okCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Input tokens (standard):     ${tokens.input.toLocaleString()}`);
  console.log(`Cache creation tokens:       ${tokens.cacheCreate.toLocaleString()}`);
  console.log(`Cache read tokens:           ${tokens.cacheRead.toLocaleString()}`);
  console.log(`Output tokens:               ${tokens.output.toLocaleString()}`);
  console.log(`Cache hit rate:              ${hitRate}%`);
  console.log(`Cost (with caching):         ${fmtUsd(cost.usd)} ≈ ${fmtInr(cost.inr)}`);
  console.log(`Cost (uncached baseline):    ${fmtUsd(baseline.usd)} ≈ ${fmtInr(baseline.inr)}`);
  console.log(`Savings:                     ${fmtInr(saved)} (${baseline.inr > 0 ? (100 * saved / baseline.inr).toFixed(1) : "0"}%)`);
  console.log(`Runtime: ${totalTime}s`);
  if (!DRY_RUN) console.log(`Wrote: ${OUTPUT_PATH}`);

  if (failCount > 0) process.exit(1);
}

main().catch(e => {
  console.error("Fatal:", e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
