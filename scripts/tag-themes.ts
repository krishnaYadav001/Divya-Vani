// Phase 2 Step 2.2 — full-corpus theme tagging via claude-sonnet-4-6
// against the locked Decision #17 taxonomy (34 tags). Writes themes
// directly to verses.themes for all 3,132 rows where themes IS NULL OR
// array_length(themes,1) = 0. Resume-safe.
//
// Refinements per Step 2.1b founder pick + Step 2.2 kickoff:
//   - max_tokens: 400 (avoids the truncated-JSON pattern Sonnet exhibited
//     on 7-tag outputs at 200 tokens during validation).
//   - Parse-error retry: ONE retry per chunk on parse error before
//     logging as skip. Reduces false skip-list entries.
//   - Acceptance: ≥1 valid tag per chunk (taxonomy-rejection filter).
//     Log overruns at >7 for founder review (do NOT reject — Sonnet may
//     legitimately tag dense chunks higher).
//   - Cost-tracking: total ₹+USD, per-source breakdown, caution-tag
//     distribution surfaced inline.
//
// One-off, NOT in package.json. Invoke via:
//   tsx --env-file=.env.local scripts/tag-themes.ts [--dry-run]
//                                                  [--source=<gita|mahabharata|bhagavata>]
//
// Resume-safe via the WHERE-clause: a re-run skips already-tagged rows.
// Idempotent — running twice with identical state writes the same data.
//
// Wall-time projection at concurrency 3 + 500ms inter-call delay:
//   3,132 chunks / (3 workers × 1 call per ~2.2s) ≈ ~38 min minimum
//   (real-world expect 1.5-2 hr including retries + Anthropic backoff).
//
// Cost projection (per Step 2.1b validation): ~₹1,187 Sonnet-only.

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL) throw new Error("SUPABASE_URL missing");
if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY missing — invoke with `tsx --env-file=.env.local`");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const client = new Anthropic();

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 400;
const TEMPERATURE = 0;

const CONCURRENCY = 3;
const INTER_CALL_DELAY_MS = 500;

const PROGRESS_EVERY = 50;

const PRICE_INPUT_PER_M_USD = 3.00;
const PRICE_OUTPUT_PER_M_USD = 15.00;
const USD_TO_INR = 83;

const MAX_RETRIES = 5;
const RETRY_BACKOFF_RATE_LIMIT_MS = [60_000, 120_000, 240_000, 480_000, 960_000];
const RETRY_BACKOFF_NETWORK_MS    = [ 5_000,  15_000,  30_000,  60_000, 120_000];

// Decision #17 — locked 34-tag taxonomy. Used both as the SYSTEM_PROMPT
// reference list AND the post-response validation filter (anything not
// in this set gets rejected as an invented tag).
const VALID_TAGS = new Set([
  // Group A (15 emotional/state)
  "loneliness", "anger", "fear", "grief", "jealousy", "doubt", "despair",
  "attachment", "longing", "joy", "gratitude", "surrender", "devotion",
  "forgiveness", "equanimity",
  // Group B (15 relational/dharmic)
  "duty", "betrayal", "family-conflict", "friendship", "marriage",
  "parent-child", "teacher-student", "ruler-subject", "action", "inaction",
  "decision", "sacrifice", "renunciation", "householder", "ascetic",
  // Group C (4 caution)
  "caution_devotional_intimacy", "caution_violence", "caution_complex_dharma",
  "caution_renunciation_extreme",
]);

const CAUTION_TAGS = new Set([
  "caution_devotional_intimacy", "caution_violence",
  "caution_complex_dharma", "caution_renunciation_extreme",
]);

const SYSTEM_PROMPT = `You are tagging a verse from a Sanskrit/Hindi/English scripture (Bhagavad Gita, Mahabharata, or Bhagavata Purana) for thematic retrieval in an AI roleplaying Krishna-persona chat app.

Apply 3-7 tags from this fixed taxonomy. Do NOT invent new tags.

GROUP A — Emotional / state (15):
loneliness, anger, fear, grief, jealousy, doubt, despair, attachment, longing, joy, gratitude, surrender, devotion, forgiveness, equanimity

GROUP B — Relational / dharmic (15):
duty, betrayal, family-conflict, friendship, marriage, parent-child, teacher-student, ruler-subject, action, inaction, decision, sacrifice, renunciation, householder, ascetic

GROUP C — Caution tags (4) — apply ONLY when the passage genuinely warrants the caveat described:
- caution_devotional_intimacy — rasa-lila, vastra-harana, Krishna's multiple wives. Devotionally legitimate but easily misread by a casual modern reader.
- caution_violence — Kamsa-vadha, Aristhasura, demon-slayings, named-warrior killings. Krishna acts as warrior; persona must contextualize, not glorify.
- caution_complex_dharma — Krishna's strategic actions, Yudhishthira's half-truth, Bhima's vow against Dushasana. Cases where literal-rule ethics fail and the text models a higher-order calculus.
- caution_renunciation_extreme — passages mis-readable as endorsing self-harm or extreme withdrawal.

Respond with ONLY a JSON object: { "themes": ["tag1", "tag2", ...] }
No prose, no preamble, no explanation. 3 to 7 tags. Tags must come from the taxonomy above.`;

type Source = "gita" | "mahabharata" | "bhagavata";

type Chunk = {
  id: string;
  source: Source;
  reference: string;
  english: string;
  hindi: string;
};

type Cli = {
  dryRun: boolean;
  source: Source | null;
};

function parseCli(): Cli {
  const args = process.argv.slice(2);
  const get = (name: string): string | null => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.slice(`--${name}=`.length) : null;
  };
  const sourceArg = get("source");
  if (sourceArg && !["gita", "mahabharata", "bhagavata"].includes(sourceArg)) {
    throw new Error(`--source must be gita | mahabharata | bhagavata (got '${sourceArg}')`);
  }
  return {
    dryRun: args.includes("--dry-run"),
    source: (sourceArg as Source | null) ?? null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type RetryKind = "rate_limit" | "network";
function isRetryableError(e: unknown): { retryable: boolean; kind: RetryKind | null } {
  const msg = e instanceof Error ? e.message : String(e);
  // Anthropic SDK surfaces 429s with status_code 429 or via "rate_limit_error"
  // and "529 overloaded" patterns. Be liberal.
  if (
    msg.includes("429") ||
    msg.includes("rate_limit") ||
    msg.includes("overloaded") ||
    msg.includes("529") ||
    msg.includes("RESOURCE_EXHAUSTED")
  ) {
    return { retryable: true, kind: "rate_limit" };
  }
  if (
    msg.includes("fetch failed") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("socket hang up") ||
    msg.includes("EAI_AGAIN")
  ) {
    return { retryable: true, kind: "network" };
  }
  return { retryable: false, kind: null };
}

function userPromptFor(c: Chunk): string {
  return `Verse:
  Source: ${c.source}
  Reference: ${c.reference}
  English: ${c.english.slice(0, 1500)}
  Hindi: ${c.hindi.slice(0, 1500)}

Respond with the JSON object now.`;
}

function parseThemesRaw(raw: string): string[] | null {
  const tryParse = (s: string): string[] | null => {
    try {
      const obj = JSON.parse(s);
      if (Array.isArray(obj?.themes)) {
        return obj.themes.filter((x: unknown) => typeof x === "string");
      }
    } catch { /* fall through */ }
    return null;
  };

  const direct = tryParse(raw.trim());
  if (direct) return direct;

  const fence = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fence) {
    const fenced = tryParse(fence[1]);
    if (fenced) return fenced;
  }

  // Find ALL `{...}` substrings (non-nested; themes is a flat object).
  // Sonnet sometimes emits TWO JSON objects: the first with an invented tag,
  // then a "Wait, X is not in taxonomy" reasoning aside, then a corrected
  // JSON. We want the corrected one (last successfully-parsing match).
  const allMatches = raw.match(/\{[^{}]*\}/g) ?? [];
  for (let i = allMatches.length - 1; i >= 0; i--) {
    const sub = tryParse(allMatches[i]);
    if (sub) return sub;
  }

  // Fallback: greedy match (handles legitimate single-block responses with
  // unusual whitespace that the non-nested regex misses).
  const greedy = raw.match(/\{[\s\S]*\}/);
  if (greedy) {
    const sub = tryParse(greedy[0]);
    if (sub) return sub;
  }

  return null;
}

type ClassifyResult = {
  themes: string[];        // valid + filtered (taxonomy-rejected stripped)
  rejected: string[];      // tags returned but not in VALID_TAGS
  rawTagCount: number;     // before validation
  inTokens: number;
  outTokens: number;
};

async function classifyOnce(chunk: Chunk): Promise<{ ok: true; result: ClassifyResult } | { ok: false; reason: "parse_error" | string; raw: string; inTokens: number; outTokens: number }> {
  const r = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPromptFor(chunk) }],
  });
  const inT = r.usage.input_tokens ?? 0;
  const outT = r.usage.output_tokens ?? 0;
  const textBlock = r.content.find(b => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";

  const parsed = parseThemesRaw(raw);
  if (!parsed) {
    return { ok: false, reason: "parse_error", raw, inTokens: inT, outTokens: outT };
  }
  const valid = parsed.filter(t => VALID_TAGS.has(t));
  const rejected = parsed.filter(t => !VALID_TAGS.has(t));
  return {
    ok: true,
    result: {
      themes: valid,
      rejected,
      rawTagCount: parsed.length,
      inTokens: inT,
      outTokens: outT,
    },
  };
}

async function classifyWithRetries(chunk: Chunk, state: SharedState): Promise<ClassifyResult | null> {
  // Outer retry handles 429 + network. Inner ONE retry handles parse-error.
  let parseRetried = false;
  let networkAttempt = 0;
  while (true) {
    try {
      const r = await classifyOnce(chunk);
      if (r.ok) {
        return r.result;
      }
      // parse error path
      state.parseErrorsTotal++;
      if (!parseRetried) {
        parseRetried = true;
        state.parseRetries++;
        console.warn(`  [${chunk.reference}] parse_error — retrying once (raw start: ${r.raw.slice(0, 80).replace(/\n/g, " ")})`);
        // Give the API a tiny breath before the parse retry
        await sleep(500);
        continue;
      }
      // already retried once → log + skip
      state.failures.push({ ref: chunk.reference, reason: `parse_error (twice). Raw: ${r.raw.slice(0, 200)}` });
      // Account tokens for the failed call so cost reflects spend.
      state.totalIn += r.inTokens;
      state.totalOut += r.outTokens;
      state.bySrcIn[chunk.source] += r.inTokens;
      state.bySrcOut[chunk.source] += r.outTokens;
      return null;
    } catch (e) {
      const { retryable, kind } = isRetryableError(e);
      if (!retryable || networkAttempt >= MAX_RETRIES) {
        const reason = e instanceof Error ? e.message : String(e);
        state.failures.push({ ref: chunk.reference, reason: `unretryable / max retries: ${reason.slice(0, 200)}` });
        return null;
      }
      state.retries++;
      const schedule = kind === "rate_limit" ? RETRY_BACKOFF_RATE_LIMIT_MS : RETRY_BACKOFF_NETWORK_MS;
      const wait = schedule[networkAttempt];
      console.warn(`  [${chunk.reference}] ${kind} — backing off ${wait / 1000}s (attempt ${networkAttempt + 1}/${MAX_RETRIES})`);
      await sleep(wait);
      networkAttempt++;
    }
  }
}

type SharedState = {
  ok: number;
  fail: number;
  totalIn: number;
  totalOut: number;
  bySrcIn: Record<Source, number>;
  bySrcOut: Record<Source, number>;
  retries: number;
  parseRetries: number;
  parseErrorsTotal: number;        // includes successfully-retried
  rejectedTagCount: number;        // tags filtered by taxonomy
  rejectedTagSamples: Map<string, number>;  // invented tag -> count
  overruns: Array<{ ref: string; tagCount: number; tags: string[] }>;
  perChunkResults: Array<{ chunk: Chunk; result: ClassifyResult }>;
  failures: Array<{ ref: string; reason: string }>;
  startTime: number;
};

async function fetchAllNeedingTags(sourceFilter: Source | null): Promise<Chunk[]> {
  const all: Chunk[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("verses")
      .select("id, source, reference, english, hindi, themes")
      .order("source", { ascending: true })
      .order("reference", { ascending: true })
      .range(from, from + PAGE - 1);
    if (sourceFilter) q = q.eq("source", sourceFilter);
    const { data, error } = await q;
    if (error) throw new Error(`fetch (from=${from}): ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const themes = (row as { themes: string[] | null }).themes;
      const isEmpty = !themes || themes.length === 0;
      if (isEmpty) {
        all.push({
          id: (row as { id: string }).id,
          source: (row as { source: Source }).source,
          reference: (row as { reference: string }).reference,
          english: (row as { english: string }).english,
          hindi: (row as { hindi: string }).hindi,
        });
      }
    }
    if (data.length < PAGE) break;
  }
  return all;
}

async function writeThemes(chunkId: string, themes: string[]): Promise<void> {
  const { error } = await supabase
    .from("verses")
    .update({ themes })
    .eq("id", chunkId);
  if (error) throw new Error(`update verses (id=${chunkId}): ${error.message}`);
}

async function workerLoop(workerId: number, queue: Chunk[], state: SharedState, dryRun: boolean): Promise<void> {
  while (true) {
    const chunk = queue.shift();
    if (!chunk) return;

    const result = await classifyWithRetries(chunk, state);
    if (!result) {
      state.fail++;
      // Continue to next chunk
      await sleep(INTER_CALL_DELAY_MS);
      continue;
    }

    state.totalIn += result.inTokens;
    state.totalOut += result.outTokens;
    state.bySrcIn[chunk.source] += result.inTokens;
    state.bySrcOut[chunk.source] += result.outTokens;

    if (result.rejected.length > 0) {
      state.rejectedTagCount += result.rejected.length;
      for (const t of result.rejected) {
        state.rejectedTagSamples.set(t, (state.rejectedTagSamples.get(t) ?? 0) + 1);
      }
    }
    if (result.rawTagCount > 7) {
      state.overruns.push({ ref: chunk.reference, tagCount: result.rawTagCount, tags: result.themes });
    }

    // Acceptance: ≥1 valid tag (taxonomy-filtered)
    if (result.themes.length === 0) {
      state.failures.push({
        ref: chunk.reference,
        reason: `0 valid tags after taxonomy filter (rejected: [${result.rejected.join(", ")}])`,
      });
      state.fail++;
      await sleep(INTER_CALL_DELAY_MS);
      continue;
    }

    if (!dryRun) {
      try {
        await writeThemes(chunk.id, result.themes);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        state.failures.push({ ref: chunk.reference, reason: `write failed: ${reason}` });
        state.fail++;
        await sleep(INTER_CALL_DELAY_MS);
        continue;
      }
    }

    state.ok++;
    state.perChunkResults.push({ chunk, result });

    if (state.ok % PROGRESS_EVERY === 0) {
      const elapsed = (Date.now() - state.startTime) / 1000;
      const total = state.ok + state.fail;
      const rate = total / elapsed;
      const remaining = (queue.length + (CONCURRENCY - 1));
      const eta = rate > 0 ? Math.ceil(remaining / rate / 60) : 0;
      const usd = (state.totalIn / 1e6) * PRICE_INPUT_PER_M_USD + (state.totalOut / 1e6) * PRICE_OUTPUT_PER_M_USD;
      const inr = usd * USD_TO_INR;
      console.log(
        `  Progress: ok=${state.ok} fail=${state.fail} (${total} done, ~${remaining} left, ${elapsed.toFixed(0)}s elapsed, ETA ${eta}min, cost ~₹${inr.toFixed(2)})`,
      );
    }

    await sleep(INTER_CALL_DELAY_MS);
  }
}

async function main() {
  const cli = parseCli();
  console.log("=== Phase 2 tag-themes ===");
  console.log(`Model: ${MODEL}, max_tokens=${MAX_TOKENS}, temperature=${TEMPERATURE}`);
  console.log(`Concurrency: ${CONCURRENCY}, inter-call delay: ${INTER_CALL_DELAY_MS}ms per worker`);
  console.log(`Source filter: ${cli.source ?? "(all)"}`);
  console.log(`Dry-run: ${cli.dryRun ? "YES (no DB writes; first 5 chunks only)" : "no"}`);
  console.log("");

  console.log("Fetching chunks needing tags...");
  let chunks = await fetchAllNeedingTags(cli.source);
  console.log(`Found ${chunks.length} chunks with empty themes${cli.source ? ` in source=${cli.source}` : ""}.`);

  if (cli.dryRun) {
    chunks = chunks.slice(0, 5);
    console.log(`[DRY-RUN] Truncated to first ${chunks.length} chunks; no DB writes.`);
  }

  if (chunks.length === 0) {
    console.log("Nothing to tag.");
    return;
  }

  const state: SharedState = {
    ok: 0,
    fail: 0,
    totalIn: 0,
    totalOut: 0,
    bySrcIn: { gita: 0, mahabharata: 0, bhagavata: 0 },
    bySrcOut: { gita: 0, mahabharata: 0, bhagavata: 0 },
    retries: 0,
    parseRetries: 0,
    parseErrorsTotal: 0,
    rejectedTagCount: 0,
    rejectedTagSamples: new Map(),
    overruns: [],
    perChunkResults: [],
    failures: [],
    startTime: Date.now(),
  };

  const queue = [...chunks];
  const workers: Promise<void>[] = [];
  for (let w = 0; w < CONCURRENCY; w++) {
    workers.push(workerLoop(w + 1, queue, state, cli.dryRun));
  }
  await Promise.all(workers);

  // Aggregate stats
  const totalSec = ((Date.now() - state.startTime) / 1000);
  const totalUsd = (state.totalIn / 1e6) * PRICE_INPUT_PER_M_USD + (state.totalOut / 1e6) * PRICE_OUTPUT_PER_M_USD;
  const totalInr = totalUsd * USD_TO_INR;

  // Per-source costs
  const costFor = (src: Source) => {
    const usd = (state.bySrcIn[src] / 1e6) * PRICE_INPUT_PER_M_USD + (state.bySrcOut[src] / 1e6) * PRICE_OUTPUT_PER_M_USD;
    return { usd, inr: usd * USD_TO_INR };
  };
  const cGita = costFor("gita");
  const cMbh = costFor("mahabharata");
  const cBhg = costFor("bhagavata");

  // Tag distribution
  const tagCount = new Map<string, number>();
  const cautionByChunk = new Map<string, string[]>(); // ref -> caution tags applied
  const tagsBySrc: Record<Source, Map<string, number>> = {
    gita: new Map(), mahabharata: new Map(), bhagavata: new Map(),
  };
  for (const { chunk, result } of state.perChunkResults) {
    for (const t of result.themes) {
      tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
      tagsBySrc[chunk.source].set(t, (tagsBySrc[chunk.source].get(t) ?? 0) + 1);
    }
    const cTags = result.themes.filter(t => CAUTION_TAGS.has(t));
    if (cTags.length > 0) cautionByChunk.set(chunk.reference, cTags);
  }

  console.log(`\n=== Final stats ===`);
  console.log(`ok:           ${state.ok}`);
  console.log(`fail:         ${state.fail}`);
  console.log(`time:         ${totalSec.toFixed(0)}s (${(totalSec / 60).toFixed(1)}min)`);
  console.log(`api retries:  ${state.retries} (rate-limit + network combined)`);
  console.log(`parse retries: ${state.parseRetries} (parse_error first-retry)`);
  console.log(`parse_error total (incl retried-and-recovered): ${state.parseErrorsTotal}`);
  console.log(`tokens (in / out): ${state.totalIn.toLocaleString()} / ${state.totalOut.toLocaleString()}`);
  console.log(`cost USD:     $${totalUsd.toFixed(4)}`);
  console.log(`cost INR:     ~₹${totalInr.toFixed(2)}`);
  console.log(``);
  console.log(`Per-source cost:`);
  console.log(`  gita:        ~₹${cGita.inr.toFixed(2)}  ($${cGita.usd.toFixed(4)})`);
  console.log(`  mahabharata: ~₹${cMbh.inr.toFixed(2)}  ($${cMbh.usd.toFixed(4)})`);
  console.log(`  bhagavata:   ~₹${cBhg.inr.toFixed(2)}  ($${cBhg.usd.toFixed(4)})`);
  console.log(``);
  console.log(`rejected tags (taxonomy filter): ${state.rejectedTagCount}`);
  if (state.rejectedTagSamples.size > 0) {
    console.log(`  invented-tag breakdown:`);
    const sorted = [...state.rejectedTagSamples.entries()].sort((a, b) => b[1] - a[1]);
    for (const [t, n] of sorted.slice(0, 20)) console.log(`    ${t}: ${n}`);
  }
  console.log(`overrun chunks (>7 valid tags): ${state.overruns.length}`);
  for (const o of state.overruns.slice(0, 10)) {
    console.log(`  ${o.ref}: ${o.tagCount} → [${o.tags.join(", ")}]`);
  }
  if (state.failures.length > 0) {
    console.log(`\nFailures (${state.failures.length}):`);
    for (const f of state.failures.slice(0, 30)) console.log(`  ${f.ref}  ::  ${f.reason}`);
    if (state.failures.length > 30) console.log(`  …and ${state.failures.length - 30} more`);
  }

  // Write tag-distribution report (separate per founder Step 2.2 ask).
  // Only meaningful for non-dry-run + non-source-filtered runs (full corpus).
  // For partial runs, still emit but tagged with the run scope so it's
  // distinguishable from full-corpus distributions.
  const date = new Date().toISOString().slice(0, 10);
  const scopeSuffix = cli.source ? `-${cli.source}-only` : "";
  const distPath = `test-results/phase2-tag-distribution${scopeSuffix}-${date}.md`;

  fs.mkdirSync("test-results", { recursive: true });
  const lines: string[] = [];
  lines.push(`# Phase 2 tag distribution${cli.source ? ` (${cli.source} only)` : ""}`);
  lines.push(``);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Model: \`${MODEL}\` · max_tokens=${MAX_TOKENS} · temperature=${TEMPERATURE}`);
  lines.push(`Run: ${cli.dryRun ? "DRY-RUN (5 chunks)" : "full"}${cli.source ? ` · source=${cli.source}` : " · all sources"}`);
  lines.push(``);
  lines.push(`## Run summary`);
  lines.push(``);
  lines.push(`| metric | value |`);
  lines.push(`|---|---|`);
  lines.push(`| Chunks tagged ok | ${state.ok} |`);
  lines.push(`| Chunks failed | ${state.fail} |`);
  lines.push(`| Wall time | ${(totalSec / 60).toFixed(1)} min |`);
  lines.push(`| Total cost | $${totalUsd.toFixed(4)} (~₹${totalInr.toFixed(2)}) |`);
  lines.push(`| Tokens (in / out) | ${state.totalIn.toLocaleString()} / ${state.totalOut.toLocaleString()} |`);
  lines.push(`| API retries (429 / network) | ${state.retries} |`);
  lines.push(`| Parse-error retries (recovered) | ${state.parseRetries} |`);
  lines.push(`| Rejected tags (taxonomy filter) | ${state.rejectedTagCount} |`);
  lines.push(`| Overrun chunks (>7 valid tags) | ${state.overruns.length} |`);
  lines.push(``);
  lines.push(`## Per-source cost breakdown`);
  lines.push(``);
  lines.push(`| source | tokens in / out | cost USD | cost INR |`);
  lines.push(`|---|---|---|---|`);
  lines.push(`| gita        | ${state.bySrcIn.gita.toLocaleString()} / ${state.bySrcOut.gita.toLocaleString()} | $${cGita.usd.toFixed(4)} | ~₹${cGita.inr.toFixed(2)} |`);
  lines.push(`| mahabharata | ${state.bySrcIn.mahabharata.toLocaleString()} / ${state.bySrcOut.mahabharata.toLocaleString()} | $${cMbh.usd.toFixed(4)} | ~₹${cMbh.inr.toFixed(2)} |`);
  lines.push(`| bhagavata   | ${state.bySrcIn.bhagavata.toLocaleString()} / ${state.bySrcOut.bhagavata.toLocaleString()} | $${cBhg.usd.toFixed(4)} | ~₹${cBhg.inr.toFixed(2)} |`);
  lines.push(``);
  lines.push(`## Tag distribution (overall)`);
  lines.push(``);
  lines.push(`Sanity-check thresholds (Phase 2 plan): no single tag >30% of corpus, no tag <0.5%. Total tagged chunks: ${state.ok}.`);
  lines.push(``);
  lines.push(`| tag | count | % of tagged chunks |`);
  lines.push(`|---|---|---|`);
  const totalTagged = state.ok || 1;
  const sortedAll = [...tagCount.entries()].sort((a, b) => b[1] - a[1]);
  for (const [t, n] of sortedAll) {
    lines.push(`| ${t} | ${n} | ${(100 * n / totalTagged).toFixed(1)}% |`);
  }
  // Mark untagged-by-classifier (taxonomy entries with 0 hits)
  const untouched = [...VALID_TAGS].filter(t => !tagCount.has(t));
  if (untouched.length > 0) {
    lines.push(``);
    lines.push(`Tags with 0 hits across the corpus (potentially under-applied):`);
    lines.push(``);
    for (const t of untouched) lines.push(`- \`${t}\``);
  }
  lines.push(``);
  lines.push(`## Caution tag distribution`);
  lines.push(``);
  lines.push(`Group C tags applied (chunks may carry more than one):`);
  lines.push(``);
  lines.push(`| caution tag | count | % |`);
  lines.push(`|---|---|---|`);
  for (const t of CAUTION_TAGS) {
    const n = tagCount.get(t) ?? 0;
    lines.push(`| ${t} | ${n} | ${(100 * n / totalTagged).toFixed(1)}% |`);
  }
  lines.push(``);
  lines.push(`Total chunks with ≥1 caution tag: **${cautionByChunk.size}** of ${state.ok} (${(100 * cautionByChunk.size / totalTagged).toFixed(1)}%).`);
  lines.push(``);
  lines.push(`## Per-source tag distribution`);
  lines.push(``);
  for (const src of ["gita", "mahabharata", "bhagavata"] as const) {
    const m = tagsBySrc[src];
    if (m.size === 0) continue;
    const srcCount = state.perChunkResults.filter(r => r.chunk.source === src).length;
    lines.push(`### ${src} (${srcCount} chunks)`);
    lines.push(``);
    const sortedSrc = [...m.entries()].sort((a, b) => b[1] - a[1]);
    lines.push(`| tag | count | % of source |`);
    lines.push(`|---|---|---|`);
    for (const [t, n] of sortedSrc) {
      lines.push(`| ${t} | ${n} | ${(100 * n / (srcCount || 1)).toFixed(1)}% |`);
    }
    lines.push(``);
  }
  if (state.rejectedTagSamples.size > 0) {
    lines.push(`## Rejected (invented) tags`);
    lines.push(``);
    lines.push(`Sonnet returned these tags despite the explicit "Do NOT invent" instruction; they were dropped before write.`);
    lines.push(``);
    lines.push(`| invented tag | count |`);
    lines.push(`|---|---|`);
    const sortedRej = [...state.rejectedTagSamples.entries()].sort((a, b) => b[1] - a[1]);
    for (const [t, n] of sortedRej) lines.push(`| ${t} | ${n} |`);
    lines.push(``);
  }
  if (state.overruns.length > 0) {
    lines.push(`## Overrun chunks (>7 tags returned)`);
    lines.push(``);
    lines.push(`These chunks' raw classifier output had >7 tags; they were not rejected (founder agreed to log-and-write per Step 2.2 kickoff). Spot-check candidates.`);
    lines.push(``);
    lines.push(`| reference | tag count | tags written |`);
    lines.push(`|---|---|---|`);
    for (const o of state.overruns) {
      lines.push(`| ${o.ref} | ${o.tagCount} | ${o.tags.join(", ")} |`);
    }
    lines.push(``);
  }
  if (state.failures.length > 0) {
    lines.push(`## Failures (${state.failures.length})`);
    lines.push(``);
    for (const f of state.failures) {
      lines.push(`- **${f.ref}**: ${f.reason}`);
    }
    lines.push(``);
  }

  fs.writeFileSync(distPath, lines.join("\n"), "utf8");
  console.log(`\nDistribution report: ${distPath}`);

  if (state.fail > 0) {
    console.log(`\n[exit 1] ${state.fail} failures (see above + ${distPath} Failures section)`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
