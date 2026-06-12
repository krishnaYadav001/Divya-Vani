// Server-only. Imports SUPABASE_SERVICE_ROLE_KEY at module load.
// Never import this file from a client component or it will leak the key.
//
// Phase 2 retrieval pipeline:
//   1. fetchCandidates(query, k)        → cosine top-k via match_verses RPC
//   2. rerankByTheme(cs, queryThemes)   → score = cosine*(1-w) + theme_overlap*w
//   3. searchVerses(query, k, themes?)  → wrapper, used by non-chat callers
//
// The chat route calls fetchCandidates + rerankByTheme directly so the
// candidate fetch can run in parallel with the Haiku theme-classification
// call. Other callers (scripts/test-search.ts, scripts/bhagavata-quality-
// gate.ts, scripts/retrieval-regression-test.ts) use searchVerses.
//
// Feature flags read from env at each call (so flag-flipping in CLI/tests
// takes effect without restarting the process):
//   RAG_LAYER_THEME_RERANK   default true
//   RAG_THEME_WEIGHT         default 0.3 — weight on theme_overlap_score
//   RAG_CANDIDATES_K         default 30  — candidates fetched before rerank
//
// When RAG_LAYER_THEME_RERANK=false OR queryThemes is empty/undefined,
// retrieval falls back to pure cosine top-k (current Phase 1 behavior).

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL) throw new Error('SUPABASE_URL missing');
if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');

const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIM = 768;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const embedModel = genAI.getGenerativeModel({ model: EMBED_MODEL });
const anthropic = new Anthropic();

export type VerseHit = {
  reference: string;
  chapter: number;
  verse_number: number;
  sanskrit: string;
  transliteration: string;
  hindi: string;
  english: string;
  themes: string[];
  similarity: number;
};

type RagFlags = {
  themeRerank: boolean;
  themeWeight: number;
  candidatesK: number;
  sourceDiversity: boolean;
  diversityCosineThreshold: number;
  diversityScopeK: number;
  queryRewrite: boolean;
  rewriteVariants: number;
  rewritePerVariantK: number;
};

function readFlags(): RagFlags {
  const themeRerank =
    (process.env.RAG_LAYER_THEME_RERANK ?? 'true').toLowerCase() !== 'false';
  const themeWeight = (() => {
    const raw = process.env.RAG_THEME_WEIGHT;
    if (!raw) return 0.3;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.3;
  })();
  const candidatesK = (() => {
    const raw = process.env.RAG_CANDIDATES_K;
    if (!raw) return 30;
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) && n >= 1 && n <= 200 ? n : 30;
  })();
  const sourceDiversity =
    (process.env.RAG_LAYER_SOURCE_DIVERSITY ?? 'true').toLowerCase() !== 'false';
  const diversityCosineThreshold = (() => {
    const raw = process.env.RAG_DIVERSITY_COSINE_THRESHOLD;
    if (!raw) return 0.65;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.65;
  })();
  const diversityScopeK = (() => {
    const raw = process.env.RAG_DIVERSITY_SCOPE_K;
    if (!raw) return 10;
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) && n >= 1 && n <= 200 ? n : 10;
  })();
  const queryRewrite =
    (process.env.RAG_LAYER_QUERY_REWRITE ?? 'true').toLowerCase() !== 'false';
  const rewriteVariants = (() => {
    const raw = process.env.RAG_REWRITE_VARIANTS;
    if (!raw) return 3;
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) && n >= 1 && n <= 6 ? n : 3;
  })();
  const rewritePerVariantK = (() => {
    const raw = process.env.RAG_REWRITE_PER_VARIANT_K;
    if (!raw) return 10;
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 10;
  })();
  return {
    themeRerank, themeWeight, candidatesK,
    sourceDiversity, diversityCosineThreshold, diversityScopeK,
    queryRewrite, rewriteVariants, rewritePerVariantK,
  };
}

function sourceFromRef(ref: string): 'gita' | 'mahabharata' | 'bhagavata' | 'unknown' {
  if (ref.startsWith('gita_')) return 'gita';
  if (ref.startsWith('mb_')) return 'mahabharata';
  if (ref.startsWith('bhagavata_')) return 'bhagavata';
  return 'unknown';
}

// Embed query + cosine top-k via match_verses RPC. The chat route calls
// this directly so it can run in parallel with the Haiku theme call.
export async function fetchCandidates(query: string, k: number): Promise<VerseHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // SDK v0.24 types don't include outputDimensionality on EmbedContentRequest,
  // but the v1beta API accepts it. Cast through unknown to the real param type
  // bypasses the stale type without `any`.
  const r = await embedModel.embedContent({
    content: { role: 'user', parts: [{ text: trimmed }] },
    taskType: TaskType.RETRIEVAL_QUERY,
    outputDimensionality: EMBED_DIM,
  } as unknown as Parameters<typeof embedModel.embedContent>[0]);

  const { data, error } = await supabase.rpc('match_verses', {
    query_embedding: r.embedding.values,
    match_count: k,
  });

  if (error) throw new Error(`match_verses RPC: ${error.message}`);
  return (data ?? []) as VerseHit[];
}

// Layer 3 — multi-query expansion. Embeds N queries (original + variants
// from rewriteQuery) in parallel, runs match_verses for each with
// per-variant k, unions deduped by reference (keeping the best cosine
// across variants), and returns top-totalK by cosine. The downstream
// rerank/diversity layers see a richer candidate pool than a single
// query would surface, helping queries where the original phrasing
// hits an embedding "blind spot."
export async function fetchCandidatesMultiQuery(
  queries: string[],
  totalK: number,
  perVariantK: number,
): Promise<VerseHit[]> {
  const cleaned = queries.map((q) => q.trim()).filter((q) => q.length > 0);
  if (cleaned.length === 0) return [];
  if (cleaned.length === 1) {
    // Single-query path collapses to plain fetchCandidates(totalK) so we
    // don't pay the multi-RPC overhead when there's nothing to merge.
    return fetchCandidates(cleaned[0], totalK);
  }

  const lists = await Promise.all(
    cleaned.map((q) => fetchCandidates(q, perVariantK).catch((e) => {
      // Per-variant failures are silent: we still return what other
      // variants found. Mirrors the chat route's silent-fail invariant.
      console.error(`[fetchCandidatesMultiQuery] variant "${q.slice(0, 40)}…" failed:`, e);
      return [] as VerseHit[];
    }))
  );

  const byRef = new Map<string, VerseHit>();
  for (const list of lists) {
    for (const hit of list) {
      const existing = byRef.get(hit.reference);
      if (!existing || hit.similarity > existing.similarity) {
        byRef.set(hit.reference, hit);
      }
    }
  }

  const all = [...byRef.values()];
  all.sort((a, b) => b.similarity - a.similarity);
  return all.slice(0, totalK);
}

// Theme-overlap score is asymmetric Jaccard with denominator =
// max(|queryThemes|, |chunk.themes|, 1). This keeps the score in [0, 1]:
// chunks with a small intersection over a large theme set get a low score
// (which is what we want — a chunk tagged with 6 themes that match only
// 1 query theme is less relevant than a chunk tagged 3-of-3 matches).
//
// At chat time queryThemes is typically 3-5; chunks have 3-7. So denom is
// usually max-of-chunk-tags. The score rewards proportional overlap.
export function rerankByTheme(
  candidates: VerseHit[],
  queryThemes: string[],
  weight: number,
): VerseHit[] {
  if (queryThemes.length === 0 || candidates.length === 0) {
    return candidates;
  }
  const querySet = new Set(queryThemes);
  const w = Math.max(0, Math.min(1, weight));

  type Scored = VerseHit & { __score: number };
  const scored: Scored[] = candidates.map((c) => {
    const ct = c.themes ?? [];
    let intersect = 0;
    for (const t of ct) if (querySet.has(t)) intersect++;
    const denom = Math.max(querySet.size, ct.length, 1);
    const themeOverlap = intersect / denom;
    const score = c.similarity * (1 - w) + themeOverlap * w;
    return { ...c, __score: score };
  });
  scored.sort((a, b) => b.__score - a.__score);
  return scored.map((hit) => {
    const rest: VerseHit = { ...hit };
    delete (rest as Partial<Scored>).__score;
    return rest;
  });
}

// Layer 2 — source-aware diversity boost. After Layer-1 reranking, if a
// source (gita / mahabharata / bhagavata) has 0 chunks in the top-N
// reranked window (default top-10) AND there's a chunk from that source
// in the wider candidate pool with cosine similarity ≥ threshold (default
// 0.65), force-include 1 chunk from that source into the final top-k by
// displacing the lowest-ranked chunk. Up to one force-include per missing
// source.
//
// Returns the final top-k. The force-included chunk(s) come from somewhere
// in the wider reranked pool (positions > scopeK), so they have a lower
// combined-rerank score than what they displaced — they end up at the tail
// of the top-k. Not re-sorted: preserves the rerank score order at the
// top while still surfacing missing-source content.
export function applyDiversityBoost(
  reranked: VerseHit[],
  k: number,
  threshold: number,
  scopeK: number = 10,
): VerseHit[] {
  if (reranked.length === 0) return [];
  const window = reranked.slice(0, scopeK);
  const sourcesPresent = new Set<string>();
  for (const c of window) sourcesPresent.add(sourceFromRef(c.reference));

  const allSources: Array<'gita' | 'mahabharata' | 'bhagavata'> = ['gita', 'mahabharata', 'bhagavata'];
  const missing = allSources.filter((s) => !sourcesPresent.has(s));
  if (missing.length === 0) return reranked.slice(0, k);

  const result = reranked.slice(0, k);
  const alreadyInResult = new Set(result.map((c) => c.reference));

  for (const src of missing) {
    // Best-cosine candidate from the missing source in the wider reranked
    // list. We use cosine (similarity), NOT the combined rerank score,
    // because the threshold semantic is "cosine close enough to compete."
    let best: VerseHit | null = null;
    for (const c of reranked) {
      if (sourceFromRef(c.reference) !== src) continue;
      if (alreadyInResult.has(c.reference)) continue;
      if (c.similarity < threshold) continue;
      if (!best || c.similarity > best.similarity) best = c;
    }
    if (!best) continue;
    // Displace the lowest-rerank chunk in result (last position) and
    // append. result keeps top-(k-1) reranked plus the rescued chunk.
    result.pop();
    result.push(best);
    alreadyInResult.add(best.reference);
  }
  return result;
}

// Convenience wrapper for callers that don't run retrieval in parallel
// with a Haiku call (scripts/test-search.ts, scripts/bhagavata-quality-
// gate.ts, the regression harness with --theme-rerank=false). The chat
// route does NOT use this — it calls fetchCandidates + rerankByTheme
// directly to overlap the candidate fetch with extractMemory.
//
// Backward-compatible: callers that pass only (query, k) get cosine top-k
// (same as Phase 1). Callers that pass queryThemes get reranked top-k
// when RAG_LAYER_THEME_RERANK=true. Diversity boost applies on top.
export async function searchVerses(
  query: string,
  k: number = 5,
  queryThemes?: string[],
): Promise<VerseHit[]> {
  const flags = readFlags();
  const wantRerank = flags.themeRerank && queryThemes && queryThemes.length > 0;
  const wantDiversity = flags.sourceDiversity;
  const fetchK = wantRerank || wantDiversity ? Math.max(flags.candidatesK, k) : k;

  const candidates = await fetchCandidates(query, fetchK);
  if (candidates.length === 0) return [];

  let reranked = candidates;
  if (wantRerank) {
    reranked = rerankByTheme(candidates, queryThemes!, flags.themeWeight);
  }

  if (wantDiversity) {
    return applyDiversityBoost(reranked, k, flags.diversityCosineThreshold, flags.diversityScopeK);
  }
  return reranked.slice(0, k);
}

export function getRagFlags(): RagFlags {
  return readFlags();
}

// Phase 8.0 Path C — model-attested verse references.
//
// After Krishna's reply is generated, audit which of the retrieved
// verses he actually referenced, quoted, paraphrased, or drew a
// parallel from. Returns the subset of refs that Krishna genuinely
// drew on. The chat route filters responseVerses by this list before
// surfacing cards to the client.
//
// Layered defense:
//   1. Word-count floor (in chat/route.ts buildResponseVerses) is the
//      first gate — short replies skip this audit entirely and surface
//      no cards. We re-check the floor here so callers outside the chat
//      route (tests, future scripts) get the same behavior.
//   2. Haiku audit — small, fast call. The retrieved verse pool is
//      always ≤5 chunks, so the prompt is short (~150-300 tokens).
//
// Silent-fail invariant: on Haiku error, JSON parse failure, network
// error — return ALL retrievedVerses refs (NOT empty). Hiding all
// cards when the auditor itself broke would silently degrade the UX;
// surfacing the retrieved set falls back to pre-Path-C behavior. The
// failure is logged for observability.
//
// Defensive filter: Haiku may hallucinate refs that aren't in the
// pool — we drop those (only refs that exist in retrievedVerses
// survive the filter at the end).
const ATTESTATION_MIN_WORDS = 25;

export async function attestVerseReferences(
  replyText: string,
  retrievedVerses: VerseHit[],
): Promise<string[]> {
  // Short-circuits before paying for a Haiku call.
  if (!replyText.trim() || retrievedVerses.length === 0) return [];

  const wordCount = replyText.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < ATTESTATION_MIN_WORDS) return [];

  // Pool of valid refs the auditor can attest to. Hallucinated refs
  // get filtered out at the end using this set.
  const validRefs = new Set(retrievedVerses.map((v) => v.reference));

  const versesList = retrievedVerses
    .map((v, i) => {
      const sanskrit = v.sanskrit.replace(/\s+/g, ' ').trim();
      const hindi = v.hindi.replace(/\s+/g, ' ').trim();
      const english = v.english.replace(/\s+/g, ' ').trim();
      const parts = [sanskrit, hindi, english].filter((p) => p.length > 0);
      return `${i + 1}. [${v.reference}] ${parts.join(' — ')}`;
    })
    .join('\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `You are a citation auditor for Krishna's reply in the Divya Vani app.

Krishna replied:
"""
${replyText}
"""

These verses were retrieved as POTENTIAL context for Krishna's reply (but may or may not have been used):
${versesList}

Identify which of these verses Krishna ACTUALLY referenced, quoted, paraphrased, or drew a parallel from in his reply.

Rules:
- Be conservative. Only mark a verse as referenced if Krishna's reply genuinely uses its content, characters, scene, or teaching.
- A verse IS referenced if: Krishna quotes it directly, paraphrases its teaching, mentions its characters/scenes by name (Arjuna at Kurukshetra, Sudama, Yashoda, gopis, etc.), or draws a parallel that maps to its content.
- A verse is NOT referenced if it was merely thematically related but Krishna did not draw on it.
- If Krishna's reply was a short acknowledgment, affirmation, or doesn't substantively draw on any verse, return an empty list.

Return ONLY valid JSON in this exact shape, no surrounding text or markdown:
{"referenced": ["gita_2.47", "mahabharata_udyoga_140"]}

Or for no references:
{"referenced": []}`,
        },
      ],
    });

    const text =
      response.content.find((b) => b.type === 'text')?.text ?? '';

    // LAST-valid-JSON defensive parser — same pattern as extractMemory
    // in chat/route.ts. Handles Haiku occasionally emitting reasoning
    // asides before the JSON object: iterate inner-most {…} blocks
    // last-to-first, fall back to a greedy match, fall back to raw
    // trim and fenced markdown. First candidate that parses with the
    // expected shape wins.
    let parsed: { referenced?: unknown } | null = null;
    const candidates: string[] = [text.trim()];
    const fence = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (fence) candidates.push(fence[1]);
    const innerBlocks = text.match(/\{[^{}]*\}/g) ?? [];
    candidates.push(...[...innerBlocks].reverse());
    const greedy = text.match(/\{[\s\S]*\}/);
    if (greedy) candidates.push(greedy[0]);

    for (const c of candidates) {
      try {
        const obj = JSON.parse(c.trim()) as { referenced?: unknown };
        if (Array.isArray(obj.referenced)) {
          parsed = obj;
          break;
        }
      } catch {
        /* try next */
      }
    }

    if (!parsed || !Array.isArray(parsed.referenced)) {
      // Silent-fail: return full pool, not empty. See module-level
      // doc above attestVerseReferences for rationale.
      console.error(
        '[attestVerseReferences] no valid JSON, returning full pool',
      );
      return retrievedVerses.map((v) => v.reference);
    }

    // Filter Haiku output to refs that ACTUALLY exist in the retrieved
    // pool. Drops hallucinated refs without crashing.
    const attestedRefs = (parsed.referenced as unknown[])
      .filter((r): r is string => typeof r === 'string')
      .filter((r) => validRefs.has(r));

    console.log(
      `[chat] verse attestation: retrieved=${retrievedVerses.length} attested=${attestedRefs.length} reply_words=${wordCount}`,
    );

    return attestedRefs;
  } catch (e) {
    // Silent-fail on Haiku/network error: return full pool.
    console.error(
      '[attestVerseReferences] threw, returning full pool:',
      e,
    );
    return retrievedVerses.map((v) => v.reference);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Phase 8.x Path B — post-generation entity-based verse retrieval.
//
// Path C (attestVerseReferences) can only attest verses that were in the
// cosine RAG top-5. When Krishna draws on a §4.5 PARALLEL-MAPPING figure
// (Sudama, Yashoda, Devakī, gopī viraha, Mausala parva, …) that the
// cosine search didn't surface, Path C attests 0 and the reply shows no
// cards even though it's richly scriptural. Path B closes that gap:
// extract the scriptural figures Krishna actually named, look up verses
// that feature them, and MERGE those with Path C's attested set (dedupe
// by reference, cap 5). Path B is ADDITIVE — it never alters Path C and
// degrades gracefully (returns [] on any Haiku/DB error).
// ─────────────────────────────────────────────────────────────────────

export type ApiVerse = {
  reference: string;
  sanskrit: string;
  transliteration: string;
  hindi: string;
  english: string;
};

// Canonical scriptural entities Krishna draws on. The first array mirrors
// the §4.5 PARALLEL-MAPPING canon + the figures/places Krishna parallels
// most often across the 5 modes. extractScripturalEntities returns names
// from this list ONLY (Haiku output is filtered against it).
export const KRISHNA_SCRIPTURAL_ENTITIES = [
  // §4.5 PARALLEL-MAPPING core figures
  'Arjuna', 'Sudama', 'Devaki', 'Yashoda', 'Rukmini', 'Yudhishthira',
  // Mausala parva, gopī viraha, Bhramara-gītā — events
  'Mausala', 'gopi', 'Bhramara',
  // Vrindavan-Gokul-Mathura figures
  'Pootana', 'Kaliya', 'Govardhan', 'Sandipani', 'Uddhava',
  'Balarama', 'Subhadra',
  // Mahabharata figures Krishna frequently parallels
  'Bhima', 'Karna', 'Drona', 'Bhishma', 'Dhritarashtra', 'Gandhari',
  'Draupadi', 'Vidura', 'Kunti',
  // Places
  'Vrindavan', 'Dwaraka', 'Mathura', 'Kurukshetra',
];

// Search variants per canonical entity: Latin spellings, IAST diacritic
// forms, and Devanagari. getVersesForEntity ilike-matches any of these
// against english / hindi / transliteration. Keep every variant
// comma-free and paren-free — PostgREST `.or()` uses those as syntax.
const ENTITY_VARIANTS: Record<string, string[]> = {
  Arjuna: ['Arjuna', 'Arjun', 'अर्जुन', 'Partha', 'Pārtha', 'पार्थ', 'Dhananjaya', 'धनंजय'],
  Sudama: ['Sudama', 'Sudāmā', 'Sudaman', 'सुदामा', 'सुदाम'],
  Devaki: ['Devaki', 'Devakī', 'देवकी'],
  Yashoda: ['Yashoda', 'Yaśodā', 'Yasoda', 'यशोदा'],
  Rukmini: ['Rukmini', 'Rukmiṇī', 'रुक्मिणी'],
  Yudhishthira: ['Yudhishthira', 'Yudhiṣṭhira', 'Yudhisthira', 'युधिष्ठिर', 'Dharmaraja', 'धर्मराज'],
  Mausala: ['Mausala', 'Mausal', 'मौसल'],
  gopi: ['gopi', 'gopī', 'gopis', 'gopīs', 'गोपी', 'गोपिय', 'गोपियों'],
  Bhramara: ['Bhramara', 'Bhramar', 'भ्रमर', 'Bhramara-gita', 'Bhramara-gītā'],
  Pootana: ['Pootana', 'Putana', 'Pūtanā', 'पूतना'],
  Kaliya: ['Kaliya', 'Kāliya', 'कालिय', 'कालिया'],
  Govardhan: ['Govardhan', 'Govardhana', 'गोवर्धन'],
  Sandipani: ['Sandipani', 'Sāndīpani', 'Sandīpani', 'सांदीपनि', 'सान्दीपनि'],
  Uddhava: ['Uddhava', 'उद्धव'],
  Balarama: ['Balarama', 'Balarāma', 'Balaram', 'बलराम'],
  Subhadra: ['Subhadra', 'Subhadrā', 'सुभद्रा'],
  Bhima: ['Bhima', 'Bhīma', 'भीम', 'Bhimasena', 'भीमसेन'],
  Karna: ['Karna', 'Karṇa', 'कर्ण'],
  Drona: ['Drona', 'Droṇa', 'द्रोण', 'Dronacharya', 'द्रोणाचार्य'],
  Bhishma: ['Bhishma', 'Bhīṣma', 'भीष्म'],
  Dhritarashtra: ['Dhritarashtra', 'Dhṛtarāṣṭra', 'धृतराष्ट्र'],
  Gandhari: ['Gandhari', 'Gāndhārī', 'गांधारी', 'गान्धारी'],
  Vrindavan: ['Vrindavan', 'Vṛndāvana', 'Vrindavana', 'वृन्दावन', 'वृंदावन'],
  Dwaraka: ['Dwaraka', 'Dvārakā', 'Dwarka', 'द्वारका', 'द्वारिका'],
  Mathura: ['Mathura', 'Mathurā', 'मथुरा'],
  Kurukshetra: ['Kurukshetra', 'Kurukṣetra', 'कुरुक्षेत्र'],
  Draupadi: ['Draupadi', 'Draupadī', 'द्रौपदी', 'Panchali', 'पांचाली', 'Yajnaseni', 'याज्ञसेनी'],
  Vidura: ['Vidura', 'विदुर', 'Mahatma Vidura'],
  Kunti: ['Kunti', 'Kuntī', 'कुंती', 'Pritha', 'पृथा'],
};

// Source a verse about this entity is most likely to be found in / most
// thematically apt. Character-lila figures → bhagavata; war figures →
// mahabharata; the Arjuna/Kurukshetra pre-war-doubt parallel → gita.
const ENTITY_PREFERRED_SOURCE: Record<string, 'gita' | 'mahabharata' | 'bhagavata'> = {
  Arjuna: 'gita', Kurukshetra: 'gita',
  Yudhishthira: 'mahabharata', Bhima: 'mahabharata', Karna: 'mahabharata',
  Drona: 'mahabharata', Bhishma: 'mahabharata', Dhritarashtra: 'mahabharata',
  Gandhari: 'mahabharata', Mausala: 'mahabharata',
  Sudama: 'bhagavata', Devaki: 'bhagavata', Yashoda: 'bhagavata',
  Rukmini: 'bhagavata', gopi: 'bhagavata', Bhramara: 'bhagavata',
  Pootana: 'bhagavata', Kaliya: 'bhagavata', Govardhan: 'bhagavata',
  Sandipani: 'bhagavata', Uddhava: 'bhagavata', Balarama: 'bhagavata',
  Subhadra: 'bhagavata', Vrindavan: 'bhagavata', Dwaraka: 'bhagavata',
  Mathura: 'bhagavata',
  Draupadi: 'mahabharata',
  Vidura: 'mahabharata',
  Kunti: 'mahabharata',
};

const ENTITY_MIN_WORDS = 25;
const ENTITY_VERSES_PER = 2; // max cards per entity

const VALID_ENTITY_SET = new Set(KRISHNA_SCRIPTURAL_ENTITIES);

// Haiku 4.5 — which canonical entities does Krishna's reply actually
// invoke? Returns canonical English names from KRISHNA_SCRIPTURAL_ENTITIES
// only (hallucinations filtered out). Silent-fail → [] (Path B is purely
// additive; on any failure we fall back to Path C alone).
//
// Arjuna/Kurukshetra are special-cased in the prompt: Krishna mentions
// Arjuna in passing constantly ("as I told Arjuna long ago"). We only
// want a card when a SPECIFIC Arjuna scene is invoked (the battlefield,
// the dropped bow, the despair between the armies) — otherwise every
// reply would surface Gita 2.x.
export async function extractScripturalEntities(
  replyText: string,
): Promise<string[]> {
  if (!replyText.trim()) return [];
  const wordCount = replyText.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < ENTITY_MIN_WORDS) return [];

  const entityCatalog = KRISHNA_SCRIPTURAL_ENTITIES.map((e) => {
    const variants = ENTITY_VARIANTS[e] ?? [e];
    return `- ${e} (also: ${variants.slice(1).join(', ') || e})`;
  }).join('\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `You identify which scriptural figures/places Krishna's reply actually invokes, for surfacing verse cards in the Divya Vani app.

Krishna replied:
"""
${replyText}
"""

Canonical entities (with transliteration / Devanagari variants):
${entityCatalog}

Return the canonical English names (left of the parenthesis) of every entity Krishna NAMES or whose SCENE he describes in this reply.

Rules:
- Match any variant form (Latin, IAST diacritics, or Devanagari).
- Include an entity if Krishna names them OR vividly describes their scene/story, even without the exact name.
- SPECIAL CASE — "Arjuna" and "Kurukshetra": include them ONLY if Krishna invokes a SPECIFIC Arjuna moment — the battlefield between the two armies, his despair/grief, his bow (Gandiva) slipping from his hand, the pre-war collapse, the chariot at Kurukshetra. Do NOT include them for a passing reference like "as I told Arjuna long ago" or "I once taught a warrior" with no scene.
- Only return names from the canonical list. Do not invent entities.
- If the reply invokes no listed entity, return an empty list.

Return ONLY valid JSON, no surrounding text or markdown:
{"entities": ["Sudama", "Yashoda"]}

Or for none:
{"entities": []}`,
        },
      ],
    });

    const text = response.content.find((b) => b.type === 'text')?.text ?? '';

    // LAST-valid-JSON defensive parser — same pattern as
    // attestVerseReferences / extractMemory.
    let parsed: { entities?: unknown } | null = null;
    const candidates: string[] = [text.trim()];
    const fence = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (fence) candidates.push(fence[1]);
    const innerBlocks = text.match(/\{[^{}]*\}/g) ?? [];
    candidates.push(...[...innerBlocks].reverse());
    const greedy = text.match(/\{[\s\S]*\}/);
    if (greedy) candidates.push(greedy[0]);

    for (const c of candidates) {
      try {
        const obj = JSON.parse(c.trim()) as { entities?: unknown };
        if (Array.isArray(obj.entities)) {
          parsed = obj;
          break;
        }
      } catch {
        /* try next */
      }
    }

    if (!parsed || !Array.isArray(parsed.entities)) {
      console.error('[extractScripturalEntities] no valid JSON, returning []');
      return [];
    }

    // Keep only canonical names that exist in the allowed set (drop
    // hallucinations + casing drift). Dedupe, preserve order.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of parsed.entities as unknown[]) {
      if (typeof raw !== 'string') continue;
      const name = raw.trim();
      if (VALID_ENTITY_SET.has(name) && !seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
    return out;
  } catch (e) {
    console.error('[extractScripturalEntities] threw, returning []:', e);
    return [];
  }
}

function occurrenceScore(text: string, variants: string[]): number {
  if (!text) return 0;
  const hay = text.toLowerCase();
  let n = 0;
  for (const v of variants) {
    const needle = v.toLowerCase();
    if (!needle) continue;
    let idx = hay.indexOf(needle);
    while (idx !== -1) {
      n++;
      idx = hay.indexOf(needle, idx + needle.length);
    }
  }
  return n;
}

// Up to ENTITY_VERSES_PER verses that prominently feature `entityName`.
// ilike-matches any variant against english / hindi / transliteration,
// prefers the entity's most-apt source, and ranks by how central the
// entity is to the verse (occurrence count in english+hindi). Returns []
// on no match or any DB error (Path B degrades to Path C alone).
export async function getVersesForEntity(
  entityName: string,
): Promise<ApiVerse[]> {
  const variants = ENTITY_VARIANTS[entityName] ?? [entityName];
  const orConds: string[] = [];
  for (const v of variants) {
    orConds.push(`english.ilike.%${v}%`);
    orConds.push(`hindi.ilike.%${v}%`);
    orConds.push(`transliteration.ilike.%${v}%`);
  }

  try {
    const { data, error } = await supabase
      .from('verses')
      .select('reference,source,sanskrit,transliteration,hindi,english')
      .or(orConds.join(','))
      .limit(60);

    if (error) {
      console.error(`[getVersesForEntity] ${entityName} DB error:`, error.message);
      return [];
    }

    type Row = {
      reference: string;
      source: string;
      sanskrit: string | null;
      transliteration: string | null;
      hindi: string | null;
      english: string | null;
    };
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) return [];

    const preferred = ENTITY_PREFERRED_SOURCE[entityName];
    const scored = rows.map((r) => {
      const score =
        occurrenceScore(r.english ?? '', variants) +
        occurrenceScore(r.hindi ?? '', variants) +
        occurrenceScore(r.transliteration ?? '', variants);
      return { r, score, preferredHit: preferred ? r.source === preferred : false };
    });

    // Preferred-source first, then by entity-centrality (occurrence
    // count), then by reference for stable ordering.
    scored.sort((a, b) => {
      if (a.preferredHit !== b.preferredHit) return a.preferredHit ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return a.r.reference.localeCompare(b.r.reference);
    });

    return scored.slice(0, ENTITY_VERSES_PER).map(({ r }) => ({
      reference: r.reference,
      sanskrit: r.sanskrit ?? '',
      transliteration: r.transliteration ?? '',
      hindi: r.hindi ?? '',
      english: r.english ?? '',
    }));
  } catch (e) {
    console.error(`[getVersesForEntity] ${entityName} threw:`, e);
    return [];
  }
}

// Path B end-to-end: extract entities Krishna invoked, fetch their
// verses in parallel, flatten. Dedupe/merge with Path C + the 5-card
// cap happens in the chat route's buildResponseVerses. Returns the
// entity list too so the caller can emit telemetry.
export async function retrieveEntityVerses(
  replyText: string,
): Promise<{ entities: string[]; verses: ApiVerse[] }> {
  const entities = await extractScripturalEntities(replyText);
  if (entities.length === 0) return { entities: [], verses: [] };
  const lists = await Promise.all(entities.map((e) => getVersesForEntity(e)));
  return { entities, verses: lists.flat() };
}
