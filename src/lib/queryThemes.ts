// Server-only. Phase 2 query-theme classification utilities.
//
// Used by:
// - /api/chat/route.ts — extractMemory's Haiku call piggybacks the
//   query-theme classification onto the same call (one Haiku, both
//   memory + themes returned).
// - scripts/retrieval-regression-test.ts — harness needs a standalone
//   classifyQueryThemes() to test Layer-1 reranking without spinning up
//   the chat route's full memory-extraction context.
//
// The 34-tag taxonomy is the locked Decision #17 set used during full-
// corpus tagging (Step 2.2). Validation filter strips out-of-taxonomy
// tags returned by the model — same defensive pattern as scripts/
// tag-themes.ts.
//
// Parser inherits the LAST-valid-JSON pattern from scripts/tag-themes.ts:
// when the model emits two `{...}` blocks (initial + corrected after a
// "Wait, X is not in taxonomy" aside), pick the LAST one.

import Anthropic from "@anthropic-ai/sdk";

// Locked Decision #17 taxonomy — keep in sync with scripts/tag-themes.ts.
// If reopening Decision #17, update both places.
export const VALID_TAGS = new Set<string>([
  // Group A — Emotional / state (15)
  "loneliness", "anger", "fear", "grief", "jealousy", "doubt", "despair",
  "attachment", "longing", "joy", "gratitude", "surrender", "devotion",
  "forgiveness", "equanimity",
  // Group B — Relational / dharmic (15)
  "duty", "betrayal", "family-conflict", "friendship", "marriage",
  "parent-child", "teacher-student", "ruler-subject", "action", "inaction",
  "decision", "sacrifice", "renunciation", "householder", "ascetic",
  // Group C — Caution (4)
  "caution_devotional_intimacy", "caution_violence", "caution_complex_dharma",
  "caution_renunciation_extreme",
]);

export const CAUTION_TAGS = new Set<string>([
  "caution_devotional_intimacy", "caution_violence",
  "caution_complex_dharma", "caution_renunciation_extreme",
]);

// Inserted into the chat-route extractMemory prompt as a piggyback; also
// the standalone classifyQueryThemes prompt uses it. Same taxonomy text
// for both so query themes match the chunk-tagging vocabulary.
//
// Step 2.4 ablation lesson: tried adding worked examples + 3-7 minimum
// to enforce broader theme sets — backfired by biasing toward `devotion`
// (which appeared in 3 of 4 examples) and over-rerank toward Gita
// (heaviest devotion-tagged source). Reverted to the original prompt;
// canonical for Phase 2 ship.
export const QUERY_TAXONOMY_BLOCK = `Use this fixed taxonomy. Do NOT invent new tags.

GROUP A — Emotional / state (15):
loneliness, anger, fear, grief, jealousy, doubt, despair, attachment, longing, joy, gratitude, surrender, devotion, forgiveness, equanimity

GROUP B — Relational / dharmic (15):
duty, betrayal, family-conflict, friendship, marriage, parent-child, teacher-student, ruler-subject, action, inaction, decision, sacrifice, renunciation, householder, ascetic

GROUP C — Caution (4) — apply ONLY when the user's message itself genuinely warrants the caveat:
- caution_devotional_intimacy — user describes intimate / romantic / devotional-rapture content
- caution_violence — user describes a violent fantasy, intent, or named-warrior killing scenario
- caution_complex_dharma — user is wrestling with a moral grey-zone where literal-rule ethics fails
- caution_renunciation_extreme — user expresses wanting to disappear, withdraw, or end engagement with life`;

// Pull the LAST valid `{...}` block. Sonnet sometimes emits the original
// JSON, then "Wait, X is not in taxonomy" reasoning, then a corrected
// JSON. We want the corrected one. Same pattern as scripts/tag-themes.ts.
export function parseThemesFromResponse(raw: string): string[] | null {
  const tryParse = (s: string): string[] | null => {
    try {
      const obj = JSON.parse(s);
      if (Array.isArray(obj?.themes)) {
        return obj.themes.filter((x: unknown) => typeof x === "string");
      }
      if (Array.isArray(obj?.query_themes)) {
        return obj.query_themes.filter((x: unknown) => typeof x === "string");
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

  const allMatches = raw.match(/\{[^{}]*\}/g) ?? [];
  for (let i = allMatches.length - 1; i >= 0; i--) {
    const sub = tryParse(allMatches[i]);
    if (sub) return sub;
  }

  const greedy = raw.match(/\{[\s\S]*\}/);
  if (greedy) {
    const sub = tryParse(greedy[0]);
    if (sub) return sub;
  }

  return null;
}

export function filterValidThemes(themes: string[]): string[] {
  return themes.filter((t) => VALID_TAGS.has(t));
}

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

// Layer 3 — query rewriting. Returns [original, ...up to N variants] for
// multi-query expansion. The variants are designed to broaden the
// candidate pool by paraphrasing in the same language, language-flipping,
// and stripping surface detail to expose emotional core. When the model
// fails or returns garbage, falls back to [original] so retrieval still
// works.
export async function rewriteQuery(
  message: string,
  variants: number = 3,
): Promise<string[]> {
  try {
    const r = await getClient().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      temperature: 0.4, // some diversity for paraphrases
      system: `You are paraphrasing a user's message in an AI Krishna chat app to expand the candidate pool for scripture retrieval. Generate ${variants} alternative phrasings of the user's message that preserve emotional intent.

Each variant should be distinct in style:
1. Paraphrase in the SAME language as input (same emotional tone, different wording, surface details preserved).
2. Language-flip: if input is Hindi-dominant return an English version; if English-dominant return a Hindi version; if mixed, produce a clean Hindi-canonical version.
3. Emotional-core: strip surface details (specific people, situations, objects) and capture the underlying feeling in 1-2 short sentences.

Variants must remain emotionally faithful — do NOT add new themes the user didn't express. Keep each variant under 25 words.

Respond with ONLY a JSON object: { "variants": ["variant1", "variant2", "variant3"] }
No prose, no preamble, no explanation. Exactly ${variants} variants.`,
      messages: [
        {
          role: "user",
          content: `User message:\n"${message}"\n\nReturn the JSON now.`,
        },
      ],
    });
    const raw = r.content.find((b) => b.type === "text")?.text ?? "";

    // Reuse the LAST-valid-JSON pattern: try direct parse, fenced block,
    // each `{...}` from last to first, then greedy as fallback.
    const tryParse = (s: string): string[] | null => {
      try {
        const obj = JSON.parse(s);
        if (Array.isArray(obj?.variants)) {
          return obj.variants
            .filter((x: unknown) => typeof x === "string")
            .map((x: string) => x.trim())
            .filter((x: string) => x.length > 0);
        }
      } catch { /* fall through */ }
      return null;
    };

    let parsed: string[] | null = tryParse(raw.trim());
    if (!parsed) {
      const fence = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      if (fence) parsed = tryParse(fence[1]);
    }
    if (!parsed) {
      const allMatches = raw.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) ?? [];
      for (let i = allMatches.length - 1; i >= 0; i--) {
        const sub = tryParse(allMatches[i]);
        if (sub) { parsed = sub; break; }
      }
    }
    if (!parsed) {
      const greedy = raw.match(/\{[\s\S]*\}/);
      if (greedy) parsed = tryParse(greedy[0]);
    }

    if (!parsed || parsed.length === 0) {
      console.warn("[rewriteQuery] no variants parsed; using original only");
      return [message];
    }
    // Drop any variant identical to the original (case-insensitive trim).
    const norm = (s: string) => s.toLowerCase().trim();
    const original = norm(message);
    const unique = parsed.filter((v) => norm(v) !== original);
    return [message, ...unique.slice(0, variants)];
  } catch (e) {
    console.error("[rewriteQuery] threw:", e);
    return [message];
  }
}

// Standalone classifier used by the regression harness. The chat route
// piggybacks its own variant on extractMemory's Haiku call (one round-trip
// for memory + themes), so this function is intentionally NOT called from
// the chat route — it's for scripts and tests that don't run extractMemory.
export async function classifyQueryThemes(message: string): Promise<string[]> {
  try {
    const r = await getClient().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      temperature: 0,
      system: `You are tagging a user's message in an AI roleplaying Krishna chat app for thematic retrieval. Classify the message into 1-7 themes from the fixed taxonomy below — themes that capture what the user is feeling, asking about, or struggling with. The same taxonomy was used to tag the scripture corpus, so the themes can match between query and retrieved verses.

${QUERY_TAXONOMY_BLOCK}

Respond with ONLY a JSON object: { "themes": ["tag1", "tag2", ...] }
1 to 7 tags. Tags must come from the taxonomy above. No prose.`,
      messages: [{ role: "user", content: `User message:\n"${message}"\n\nReturn the JSON now.` }],
    });
    const raw = r.content.find((b) => b.type === "text")?.text ?? "";
    const parsed = parseThemesFromResponse(raw);
    if (!parsed) return [];
    return filterValidThemes(parsed);
  } catch (e) {
    console.error("[classifyQueryThemes] threw:", e);
    return [];
  }
}
