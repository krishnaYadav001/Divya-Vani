// Hindi regeneration for the Bhagavata Purana corpus.
// Reusable across Phase 1.6 (Canto 10) and Phase 1.7+ (Canto 11.6–29 Uddhava
// Gita, future cantos). Sibling to scripts/regenerate-hindi-mahabharata.ts.
//
// CLI flags (added Phase 1.7):
//   --input=<path>    Input chunks JSON. Default data/bhagavata.json (Canto
//                     10 backcompat). Phase 1.7: data/bhagavata-canto11.json.
//   --output=<path>   Output JSON with `hindi` field added to each chunk.
//                     Default data/bhagavata-regenerated.json (Canto 10
//                     backcompat). Phase 1.7:
//                     data/bhagavata-canto11-regenerated.json.
//   --dry-run         5-chunk sample across the canto's register list, no
//                     file write. Picks one chunk per register entry.
//   --resume          Resume from existing OUTPUT_PATH (skip already-
//                     regenerated refs). Default for full runs.
//
// Canto-aware behavior (auto-detected from chunks[0].canto):
//   - DRY_RUN_REGISTERS[canto] picks the dry-run sample chapters + labels.
//     Canto 10 is the Phase 1.6 picker (Bal-vatsalya / mādhurya / viraha /
//     householder); Canto 11 is the Phase 1.7 Uddhava-Gita picker
//     (transitional / philosophical / didactic / theoretical / devotional-
//     climax).
//   - Discrepancy report path becomes
//     test-results/bhagavata-canto<N>-regen-discrepancy.md.
//
// SYSTEM_PROMPT = v3 base softened to include "Bhagavata Purana" + Bhagavata
// addendum v1.1 (3 bullets, locked 2026-05-01 in decisions.md). The
// SYSTEM_PROMPT constant below is the canonical source-of-truth for the
// addendum text per CLAUDE.md "Phase 1.6 corpus sources". v1.1's "Canto 10
// voice is lyrical" framing is retained verbatim across the Phase 1.7
// dry-run as the test of whether a v1.2 register addition is needed for
// Uddhava-Gita philosophical content.
//
// Phase 1.6 differences from MB regen carry forward unchanged:
//   - MAX_TOKENS = 1800 (Bhagavata expansion 25–35% vs MB 20–30%)
//   - Chunk type carries canto/chapter/verseStart/verseEnd/fallbackChunkN
//   - userPrompt frames "Bhagavata Purana Canto N passage" + verse-range
//     clause only when verseStart is non-null
//
// Invocation:
//   # Phase 1.6 default (Canto 10):
//   npm run regen:hindi:bhagavata          # full run
//   npm run regen:hindi:bhagavata:dry      # 5-chunk sample
//   # Phase 1.7 (Canto 11.6–29):
//   npm run regen:hindi:bhagavata:canto11
//   npm run regen:hindi:bhagavata:canto11:dry
//   # Direct invocation:
//   tsx --env-file=.env.local scripts/regenerate-hindi-bhagavata.ts \
//     --input=data/bhagavata-canto11.json \
//     --output=data/bhagavata-canto11-regenerated.json [--dry-run|--resume]

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import pLimit from "p-limit";

// CLI parsing — mirrors parse-bhagavata.ts. Defaults preserve Phase 1.6
// behavior (no-args run reads/writes Canto 10 paths). Phase 1.7+ runs pass
// --input + --output explicitly via the canto-specific npm aliases.
function parseCli() {
  const args = process.argv.slice(2);
  const get = (name: string): string | null => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.slice(`--${name}=`.length) : null;
  };
  return {
    inputPath: get("input") ?? "data/bhagavata.json",
    outputPath: get("output") ?? "data/bhagavata-regenerated.json",
    dryRun: args.includes("--dry-run"),
    resume: args.includes("--resume"),
  };
}
const CLI = parseCli();
const INPUT_PATH = CLI.inputPath;
const OUTPUT_PATH = CLI.outputPath;

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

const DRY_RUN = CLI.dryRun;
const RESUME = CLI.resume;
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

// Per-canto dry-run register list — picks one chunk per row for the 5-chunk
// dry-run sample. Each entry: { chapter: <Sanyal-numbered>, label: <register> }.
// To extend to a new canto, add an entry here.
type DryRunRegister = { chapter: number; label: string };
const DRY_RUN_REGISTERS: Record<number, DryRunRegister[]> = {
  10: [
    // Phase 1.6 register set (same chapters as the original Phase 1.6 picker).
    { chapter: 9,  label: "Bal-vatsalya"        },  // Yashoda binds Krishna to mortar
    { chapter: 25, label: "Vrindavan-strength"  },  // Govardhana lifting
    { chapter: 29, label: "Vrindavan-longing"   },  // rāsa-līlā opening
    { chapter: 47, label: "Vrindavan-viraha"    },  // Bhramara-gītā
    { chapter: 80, label: "Householder"         },  // Sudāmā arrives at Dvārakā
  ],
  11: [
    // Phase 1.7 Uddhava-Gita register set. Chapters chosen 2026-05-02 to
    // span the arc: farewell → philosophical opener → didactic comparison →
    // theoretical → devotional climax. If v1.1 addendum produces register
    // mismatches on this set, propose v1.2 with a "philosophical-didactic"
    // register addition before the full run.
    { chapter: 6,  label: "transitional (Yadu farewell)"           },
    { chapter: 11, label: "philosophical (avadhūta-saṁvāda intro)" },
    { chapter: 20, label: "didactic (yoga-jñāna-bhakti)"           },
    { chapter: 25, label: "theoretical (guṇas)"                    },
    { chapter: 29, label: "devotional-climax (final teaching)"     },
  ],
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

  // Auto-detect canto. All chunks must share the same canto — surfaces parser
  // misconfiguration before any API spend.
  if (chunks.length === 0) throw new Error(`No chunks in ${INPUT_PATH}`);
  const detectedCanto = chunks[0].canto;
  const stragglers = chunks.filter(c => c.canto !== detectedCanto);
  if (stragglers.length > 0) {
    throw new Error(
      `Mixed-canto input: ${stragglers.length} chunks have canto != ${detectedCanto} (first: ${stragglers[0].reference}).`,
    );
  }
  console.log(`Detected canto: ${detectedCanto}`);

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

    const registers = DRY_RUN_REGISTERS[detectedCanto];
    if (!registers) {
      throw new Error(
        `No DRY_RUN_REGISTERS entry for canto ${detectedCanto}. Add one in regenerate-hindi-bhagavata.ts.`,
      );
    }
    const samples = registers
      .map(r => pickInChapter(r.chapter))
      .filter((c): c is Chunk => c !== null);

    if (samples.length < DRY_RUN_LIMIT) {
      console.warn(`Only ${samples.length} dry-run samples found; expected ${DRY_RUN_LIMIT}.`);
    }

    for (let i = 0; i < samples.length; i++) {
      const c = samples[i];
      const label = registers[i]?.label ?? "?";
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
      const reportPath = `test-results/bhagavata-canto${detectedCanto}-regen-discrepancy.md`;
      const report = [
        `# Bhagavata Canto ${detectedCanto} regen disk-vs-memory consistency check FAILED`,
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
      fs.writeFileSync(reportPath, report, "utf8");
      console.error(`\n!!! DISK-VS-MEMORY CONSISTENCY CHECK FAILED !!!`);
      console.error(`In-memory: ${processed.length}, on-disk: ${onDisk.length}`);
      console.error(`Wrote ${reportPath}`);
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
