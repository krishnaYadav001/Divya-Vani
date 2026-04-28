// Phase 1.5 prep — regenerate Gita Hindi via Claude Sonnet 4.6.
//
// Why: the Hindi translation in data/gita.json is Swami Tejomayananda's
// (b. 1942, alive — active copyright). github.com/gita/gita's Unlicense
// claim doesn't bind the original translator. For commercial use we
// drop it and replace with LLM-generated Hindi from Sanskrit + Sivananda
// English context. Sanskrit / transliteration / English stay as-is.
//
// Invocation:
//   npm run regen:hindi:dry            # 5-verse sample, no file write
//   npm run regen:hindi                # full 701-verse run
//   npm run regen:hindi -- --resume    # resume from data/gita-regenerated.json
//
// Or directly:
//   tsx --env-file=.env.local scripts/regenerate-hindi.ts [--dry-run|--resume]
//
// Writes data/gita-regenerated.json. NEVER overwrites data/gita.json —
// that swap is a separate manual step (Task 4) after sample approval.

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const INPUT_PATH = "data/gita.json";
const OUTPUT_PATH = "data/gita-regenerated.json";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 600;
const TEMPERATURE = 0.4;

// Sonnet 4.6 pricing (USD per 1M tokens). Update if Anthropic changes prices.
const PRICE_INPUT_PER_M = 3;
const PRICE_OUTPUT_PER_M = 15;
// USD → INR conversion for cost reporting only (rough, not authoritative).
const USD_TO_INR = 83;

const DRY_RUN = process.argv.includes("--dry-run");
const RESUME = process.argv.includes("--resume");
const DRY_RUN_LIMIT = 5;
const PROGRESS_EVERY = 50;
const SAVE_EVERY = 50;
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;

type Verse = {
  reference: string;
  chapter: number;
  verse_number: number;
  sanskrit: string;
  transliteration: string;
  hindi: string;
  english: string;
  themes: string[];
};

const SYSTEM_PROMPT = `You are a translator producing modern Hindi translations of Sanskrit verses from the Bhagavad Gita with scriptural dignity. Your audience: Hindi-speaking devotees who expect verse text to retain dignity while remaining accessible.

Style guidelines:
- Use modern Hindi with scriptural dignity. Not Sanskritized/literary, but not casual blog-style either. Vocabulary leans formal: prefer "पुत्र" (not "बेटे") for sons of named figures; "वचन" or "कहा" (use "बात" sparingly, only when truly conversational); "इच्छा" or "अभिलाषा" (not "चाहत"). Vocabulary should feel slightly elevated to preserve the verse's gravity.
- Clean modern Hindi grammar, short sentences, clear structure.
- Keep philosophical terms in Sanskrit form: dharma (धर्म), yoga (योग), karma (कर्म), atman (आत्मा), brahman (ब्रह्म), moksha (मोक्ष), maya (माया), bhakti (भक्ति), guru (गुरु), purusha (पुरुष), prakriti (प्रकृति), gunas (गुण), jnana (ज्ञान), sannyasa (संन्यास).
- Preserve meaning, not Sanskrit word order.
- Use the English translation as a meaning reference, not as a literal source for translation.
- Use classical Devanagari spelling with conjunct consonants throughout: पाण्डु (not पांडु), कुन्ती (not कुंती), गान्धार (not गांधार), पाण्डव (not पांडव), कुन्तिभोज (not कुंतिभोज). This is consistent with scriptural editions and signals authenticity.
- For dialogue verses (e.g., "Arjuna said:", "Krishna said:"), write the speaker indicator inline separated by em-dash, on the same line as the rest of the verse. Example: "धृतराष्ट्र ने कहा — हे सञ्जय, ..." (NOT "धृतराष्ट्र ने कहा:\\n\\nहे सञ्जय, ..." with a blank line; NOT a colon followed by a paragraph break).
- Maintain consistency across verses: the same Sanskrit term maps to the same Hindi term. "पुत्र" always renders as "पुत्र" (never alternating with "बेटे"); "सेना" always as "सेना" (not "सैन्य"/"फौज"). When a Sanskrit term recurs, use the same Hindi rendering each time.
- Every verse must end with proper Hindi terminal punctuation: "।" for declarative statements, "?" for questions, "!" for exclamations. Never end a verse on an em-dash, comma, semicolon, or any non-terminal punctuation. If the English source ends on an em-dash construction (e.g., "Saibya—the best of men"), either restructure the Hindi to close cleanly with a verb and "।", or convert the em-dash content into a parenthetical clause that ends properly.

Output format:
- ONLY the Hindi translation in Devanagari.
- No English, no romanization, no commentary, no preamble.
- No quotation marks around the translation, no headers.
- Just the translation text, ready to display.`;

function userPrompt(sanskrit: string, english: string): string {
  return `Translate this Bhagavad Gita verse to natural conversational Hindi.

Sanskrit:
${sanskrit}

English (for meaning reference):
${english}

Hindi (Devanagari only):`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}
function fmtInr(n: number): string {
  return `₹${n.toFixed(2)}`;
}

function totalCost(input: number, output: number): { usd: number; inr: number } {
  const usd =
    (input / 1_000_000) * PRICE_INPUT_PER_M +
    (output / 1_000_000) * PRICE_OUTPUT_PER_M;
  return { usd, inr: usd * USD_TO_INR };
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

async function regenerateOne(
  client: Anthropic,
  verse: Verse,
): Promise<{ hindi: string; inputTokens: number; outputTokens: number }> {
  let attempt = 0;
  let lastErr: unknown = null;
  while (attempt < MAX_RETRIES) {
    try {
      const r = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: userPrompt(verse.sanskrit, verse.english) },
        ],
      });
      const text =
        r.content.find((b) => b.type === "text")?.text?.trim() ?? "";
      if (!text) throw new Error("empty response from model");
      return {
        hindi: text,
        inputTokens: r.usage.input_tokens ?? 0,
        outputTokens: r.usage.output_tokens ?? 0,
      };
    } catch (e: unknown) {
      lastErr = e;
      const isRetryable =
        e instanceof Anthropic.APIError &&
        (e.status === 429 || (typeof e.status === "number" && e.status >= 500));
      if (!isRetryable) break;
      const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
      const status =
        e instanceof Anthropic.APIError ? String(e.status) : "unknown";
      console.warn(
        `  [${verse.reference}] retry ${attempt + 1}/${MAX_RETRIES} after ${backoff}ms (status=${status})`,
      );
      await sleep(backoff);
      attempt++;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function printSampleDiffs(processed: Verse[], originals: Verse[]) {
  const n = Math.min(3, processed.length);
  if (n === 0) return;
  console.log("\nSample diffs (first 3):");
  for (let i = 0; i < n; i++) {
    const newV = processed[i];
    const oldV = originals.find((o) => o.reference === newV.reference);
    if (!oldV) continue;
    console.log(`  ${newV.reference}`);
    console.log(`    OLD: ${oneLine(oldV.hindi).slice(0, 160)}`);
    console.log(`    NEW: ${oneLine(newV.hindi).slice(0, 160)}`);
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY missing. Run with: tsx --env-file=.env.local scripts/regenerate-hindi.ts",
    );
  }

  const verses: Verse[] = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
  console.log(`Loaded ${verses.length} verses from ${INPUT_PATH}`);

  let processed: Verse[] = [];
  let startIndex = 0;

  if (RESUME && !DRY_RUN) {
    if (fs.existsSync(OUTPUT_PATH)) {
      processed = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
      startIndex = processed.length;
      console.log(`Resuming: ${startIndex} verses already in ${OUTPUT_PATH}`);
    } else {
      console.log(`No existing ${OUTPUT_PATH} — starting fresh.`);
    }
  } else if (DRY_RUN) {
    console.log(
      `[DRY-RUN] First ${DRY_RUN_LIMIT} verses, no file write.\n`,
    );
  }

  const work = DRY_RUN ? verses.slice(0, DRY_RUN_LIMIT) : verses.slice(startIndex);
  const total = DRY_RUN ? DRY_RUN_LIMIT : verses.length;

  const client = new Anthropic();
  const startTime = Date.now();
  let totalInput = 0;
  let totalOutput = 0;
  let okCount = 0;
  let failCount = 0;

  for (let i = 0; i < work.length; i++) {
    const v = work[i];
    const overall = startIndex + i + 1;

    try {
      const { hindi, inputTokens, outputTokens } = await regenerateOne(
        client,
        v,
      );
      totalInput += inputTokens;
      totalOutput += outputTokens;

      if (DRY_RUN) {
        console.log(`Verse: ${v.reference}`);
        console.log(`Sanskrit: ${oneLine(v.sanskrit)}`);
        console.log(`English: ${v.english}`);
        console.log(`OLD Hindi (Tejomayananda): ${v.hindi}`);
        console.log(`NEW Hindi (Sonnet 4.6): ${hindi}`);
        console.log("---");
      } else {
        processed.push({ ...v, hindi });
        if (processed.length % SAVE_EVERY === 0) {
          fs.writeFileSync(
            OUTPUT_PATH,
            JSON.stringify(processed, null, 2),
            "utf8",
          );
        }
      }
      okCount++;
    } catch (e) {
      failCount++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  [${v.reference}] FAILED: ${msg}`);
    }

    if (!DRY_RUN && (i + 1) % PROGRESS_EVERY === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const c = totalCost(totalInput, totalOutput);
      console.log(
        `  Progress: ${overall}/${total} (${elapsed}s, in=${totalInput} out=${totalOutput}, ${fmtUsd(c.usd)} ≈ ${fmtInr(c.inr)})`,
      );
    }
  }

  if (!DRY_RUN) {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(processed, null, 2), "utf8");
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const c = totalCost(totalInput, totalOutput);
  console.log("\n=== Final stats ===");
  console.log(`Verses processed: ${okCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Input tokens:  ${totalInput}`);
  console.log(`Output tokens: ${totalOutput}`);
  console.log(
    `Cost: ${fmtUsd(c.usd)} ≈ ${fmtInr(c.inr)} (USD→INR @ ${USD_TO_INR})`,
  );
  console.log(`Runtime: ${totalTime}s`);
  if (!DRY_RUN) console.log(`Wrote: ${OUTPUT_PATH}`);

  if (DRY_RUN) {
    // Build a synthetic processed list for the summary print.
    // We don't store dry-run results; reuse work + dummy hindi from logged output isn't tracked,
    // so just print first 3 originals' OLD hindi as reference. The full diffs are inline above.
  } else {
    printSampleDiffs(processed, verses);
  }

  if (failCount > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
