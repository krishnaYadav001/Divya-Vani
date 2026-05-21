// Phase 10.1 — Haiku-based audio-tag injection for Krishna Voice.
//
// ElevenLabs v3 honors inline emotional tags like [gently] or
// [reverently] to direct delivery. This module asks Haiku 4.5 to insert
// those tags ONLY at genuine semantic shift points (acknowledge→challenge
// pivots, story→reflection, register changes, before a Sanskrit verse).
// There is NO tag quota — many replies are one consistent register and
// get zero tags. Quota-tagging would make the voice lurch.
//
// Every failure mode (Haiku down, invalid JSON, rewritten text, illegal
// tag, >3 tags) falls through to a single mode-default wrap so the route
// always gets usable tagged text. Mirrors the resilient JSON-parse +
// silent-fallback pattern in src/lib/moderation.ts.

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export type KrishnaMode =
  | "gita"
  | "sakhya"
  | "bhagavata"
  | "vrindavan"
  | "mahabharata";

export const KRISHNA_MODES: readonly KrishnaMode[] = [
  "gita",
  "sakhya",
  "bhagavata",
  "vrindavan",
  "mahabharata",
] as const;

// The only tags Krishna's voice may use. Anything outside this set
// invalidates the whole Haiku response → mode-default fallback.
export const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  "serious",
  "firmly",
  "resolutely",
  "gently",
  "softly",
  "warmly",
  "playfully",
  "lightly",
  "reverently",
]);

// Documented for clarity + parity with the spec; the allowed-set check
// already rejects these, but listing them keeps the intent explicit and
// greppable. Krishna's voice does not include these registers.
export const BANNED_TAGS: readonly string[] = [
  "sarcastically",
  "angrily",
  "apologetic",
  "admiring",
  "mockingly",
  "whispers",
  "shouts",
  "excitedly",
  "sadly",
];

// Fallback tag per mode when Haiku is skipped or its output is rejected.
const MODE_DEFAULT_TAG: Record<KrishnaMode, string> = {
  gita: "[serious]",
  sakhya: "[warmly]",
  bhagavata: "[gently]",
  vrindavan: "[playfully]",
  mahabharata: "[resolutely]",
};

const MAX_TAGS = 3;
// Below this word count, with a known mode, skip Haiku entirely — a short
// clear reply rarely needs a mid-reply register shift, and this saves a
// Haiku round-trip on the most common case.
const SKIP_HAIKU_WORD_FLOOR = 50;

const TAG_RE = /\[([a-z]+)\]/g;

const SYSTEM_PROMPT = `You are a voice direction assistant for Krishna's voice (an AI character based on the Bhagavad Gita / Mahabharata / Bhagavata Purana, speaking in Hindi or English).

Your task: read Krishna's reply text and decide where to insert ElevenLabs audio tags to direct emotional inflection. Output JSON only.

CRITICAL RULES:
- Many replies need ZERO tags. If the reply is one consistent emotional register throughout, return zero tags. Do NOT tag on a quota.
- Insert tags ONLY at semantic shift points: acknowledge→challenge pivot, story→reflection, register change, before a Sanskrit verse, or before a markedly different sentence.
- Maximum 3 tags per reply.
- Use ONLY these tags. Anything else is invalid:
  [serious], [firmly], [resolutely], [gently], [softly], [warmly], [playfully], [lightly], [reverently]
- BANNED tags — never use: [sarcastically], [angrily], [apologetic], [admiring], [mockingly], [whispers], [shouts], [excitedly], [sadly] (Krishna's voice does not include these registers).
- Sanskrit verses (Devanagari text that is scriptural shloka) MUST be preceded by [reverently], regardless of other tags in the reply.

Also identify the dominant Krishna mode of the reply, choosing from:
- "gita" — teaching, dharma, philosophical authority
- "sakhya" — friend, casual, warm, shares own life
- "bhagavata" — compassion, surrender, soft
- "vrindavan" — pastoral, lyrical, playful, intimate
- "mahabharata" — strategic, weighty decisions

Output a JSON object with this exact shape:

{
  "mode": "<one of: gita | sakhya | bhagavata | vrindavan | mahabharata>",
  "tagged_text": "<the original reply with tags inserted inline at the chosen positions>"
}

The tagged_text must preserve the original reply EXACTLY — same characters, same punctuation, same line breaks — with tags inserted as additional content. Do NOT rewrite the reply.

Return ONLY the JSON object. No prose around it. No code fences.`;

function wordCount(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function isKrishnaMode(v: unknown): v is KrishnaMode {
  return (
    typeof v === "string" && (KRISHNA_MODES as readonly string[]).includes(v)
  );
}

/** Remove all [tag] tokens and collapse whitespace — used to compare the
 *  Haiku output against the original reply (Haiku may have inserted spaces
 *  around tags). */
function stripTagsNormalize(s: string): string {
  return s.replace(TAG_RE, " ").replace(/\s+/g, " ").trim();
}

function mode_default(
  reply: string,
  mode: KrishnaMode,
): { taggedText: string; mode: KrishnaMode; tagCount: number } {
  return {
    taggedText: `${MODE_DEFAULT_TAG[mode]} ${reply}`,
    mode,
    tagCount: 1,
  };
}

/**
 * Returns the reply with audio tags inserted (or a mode-default wrap),
 * the detected Krishna mode, and the tag count. Never throws — every
 * error path returns a usable mode-default wrap.
 */
export async function injectTags(
  reply: string,
  modeHint?: KrishnaMode,
): Promise<{ taggedText: string; mode: KrishnaMode; tagCount: number }> {
  const fallbackMode: KrishnaMode = modeHint ?? "bhagavata";

  // Short + known-mode → skip Haiku, wrap in the mode default.
  if (modeHint && wordCount(reply) < SKIP_HAIKU_WORD_FLOOR) {
    return mode_default(reply, modeHint);
  }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: reply }],
    });

    const out =
      response.content.find((b) => b.type === "text")?.text ?? "";
    const candidates: string[] = [out.trim()];
    const fence = out.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (fence) candidates.push(fence[1]);
    const greedy = out.match(/\{[\s\S]*\}/);
    if (greedy) candidates.push(greedy[0]);

    for (const c of candidates) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(c.trim()) as Record<string, unknown>;
      } catch {
        continue;
      }

      const mode = isKrishnaMode(parsed.mode) ? parsed.mode : null;
      const taggedText =
        typeof parsed.tagged_text === "string" ? parsed.tagged_text : null;
      if (!mode || taggedText === null) continue;

      // The reply must survive intact after stripping tags — reject any
      // rewrite.
      if (stripTagsNormalize(taggedText) !== stripTagsNormalize(reply)) {
        continue;
      }

      // Every tag must be in the allowed set; count must be ≤ MAX_TAGS.
      const tags = [...taggedText.matchAll(TAG_RE)].map((m) => m[1]);
      if (tags.some((t) => !ALLOWED_TAGS.has(t))) continue;
      if (tags.length > MAX_TAGS) continue;

      return { taggedText, mode, tagCount: tags.length };
    }

    console.error(
      "[voiceTagInjector] no valid Haiku output, using mode-default",
    );
    return mode_default(reply, fallbackMode);
  } catch (e) {
    console.error("[voiceTagInjector] threw, using mode-default:", e);
    return mode_default(reply, fallbackMode);
  }
}
