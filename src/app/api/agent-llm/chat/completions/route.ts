// =============================================================================
// Phase 11.2 — OpenAI-compatible custom-LLM endpoint for ElevenAgents
// =============================================================================
// ElevenAgents (ElevenLabs Conversational AI) is configured with a "Custom LLM"
// URL of https://divyavani.co.in/api/agent-llm. ElevenLabs appends
// `/chat/completions`, so the real POST lands here. This route speaks the
// OpenAI Chat Completions *streaming* wire format (SSE, `data: {json}\n\n`,
// terminated by `data: [DONE]\n\n`) — ElevenAgents parses it with the OpenAI
// Python SDK (`AsyncOpenAI/Python`), so any deviation from that shape breaks it.
//
// Inside, it wraps the SAME brain as /api/chat: Anthropic Sonnet 4.6 + the
// byte-locked Krishna persona + scripture RAG + the safety/moderation stack.
// It is the brain of the real-time voice conversation; first audible chunk
// should land in ≤ ~3s under normal Anthropic load.
//
// This endpoint is server-to-server (called from Google Cloud on ElevenLabs'
// behalf): NO cookies, NO verse cards (ElevenAgents owns the UI). Auth is a
// Bearer token (CUSTOM_LLM_KEY). Phase 11.4: the PAYWALL is now enforced here
// (hasVoiceAccess on the real per-user id) as defense-in-depth behind the
// widget's own pre-check.
//
// ── Relationship to /api/chat ────────────────────────────────────────────────
// /api/chat is byte-locked for this phase, and its `extractMemory` /
// `buildSystemPrompt` / `formatScriptureBlock` / overload-retry helpers are
// module-private (not exported). Since we may not touch that file and the spec
// asks for a single new file, the few shared helpers are DUPLICATED below
// (clearly marked). A future phase that can touch /api/chat should hoist these
// into a shared lib (e.g. src/lib/personaTurn.ts) and import them in both.
//
// ── User identity (Phase 11.4 — per-user via dynamic variables) ───────────────
// The widget passes the cookie UUID to ElevenAgents at conversation start via
// BOTH `customLlmExtraBody` (which ElevenLabs merges into the OpenAI request
// body — landing at body.user_id) AND `dynamicVariables`. ElevenLabs versions
// surface it at slightly different paths, so resolveUserId() reads a cascade
// (see its comment). When NO real id resolves — legacy dashboard test calls, or
// the widget's dynamic variable failing to propagate so ElevenLabs sends its
// placeholder default — the turn is treated as UNIDENTIFIED: we still answer it
// (a live call is never torn down) but read/write NO Supabase state and alert
// via Sentry. This prevents distinct real users merging into one shared memory
// row. See isIdentified in POST.
//
// Note we still do NOT read chat_logs back for conversation history
// (fetchRecentChatHistory / fetchLastChatLanguage): ElevenAgents supplies the
// authoritative current-conversation history in the request body, so we use
// that and avoid an extra serial DB hit on the latency-critical path.

import Anthropic from "@anthropic-ai/sdk";
import { createHash, randomUUID, timingSafeEqual } from "crypto";
import { waitUntil } from "@vercel/functions";
import { SYSTEM_PROMPT } from "@/lib/systemPrompt";
import {
  fetchCandidates,
  rerankByTheme,
  applyDiversityBoost,
  getRagFlags,
  type VerseHit,
} from "@/lib/verses";
import { QUERY_TAXONOMY_BLOCK, filterValidThemes } from "@/lib/queryThemes";
import {
  fetchMemory,
  saveMemory,
  logSafetyEvent,
  logChatTurn,
  fetchRecentChatHistory,
  type UserMemory,
} from "@/lib/supabase";
import { safetyClassify, SAFETY_THRESHOLD, type SafetyFlag } from "@/lib/safety";
import { detectLang } from "@/lib/detectLang";
import { findBannedWord } from "@/lib/badWordFilter";
import {
  moderateInput,
  MODERATION_THRESHOLD,
  type ModerationFlag,
} from "@/lib/moderation";
import { hasVoiceAccess } from "@/lib/voiceAccess";
import { searchChatMemory, type ChatMemoryHit } from "@/lib/chatMemory";
import {
  buildScriptureSteeringBlock,
  deterministicQueryThemesForTurn,
} from "@/lib/scriptureSteering";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rateLimit";
import * as Sentry from "@sentry/nextjs";

const client = new Anthropic();

// Sentinel "no real identity" id. It is BOTH the absent-id fallback in
// resolveUserId() AND the placeholder default declared on the agent
// (setup-elevenlabs-agent.ts → dynamic_variable_placeholders.user_id), so when
// the widget's dynamic variable fails to propagate ElevenLabs sends THIS string
// as a real-looking value. A turn resolving to this sentinel is treated as
// UNIDENTIFIED: the call proceeds, but nothing is read from / written to
// Supabase (see isIdentified in POST). A real cookie UUID never collides with it.
const AGENT_USER_ID = "elevenagents-test-user";
// Model id echoed back in every OpenAI chunk. ElevenAgents sends
// model:"krishna-sonnet-4-6"; we echo whatever it sends, defaulting to this.
const DEFAULT_MODEL_ID = "krishna-sonnet-4-6";
// Voice replies stay conversational, not essays: override the request's
// max_tokens (5000) and temperature (0.0). 1300 tokens is a generous ceiling
// above the soft ~150-word target (see VOICE-MODE OUTPUT CONSTRAINT below) —
// raised from 1000 when SUBSTANCE PACING allowed teaching replies up to ~200
// words: Devanagari tokenizes heavily, and a hard-cap clip mid-parallel reads
// as a broken sentence through TTS. Still the hard upper bound that guards
// against a runaway turn now that the old ≤55-word cap is gone.
const VOICE_MAX_TOKENS = 1300;
const VOICE_TEMPERATURE = 0.6;
const RETURNING_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours (mirror /api/chat)

// Anthropic overload retry — identical policy to /api/chat: retry overload /
// transient 5xx only, never 4xx / 429, and (on the streaming path) only BEFORE
// the first token has reached the client.
const MAX_OVERLOAD_RETRIES = 2;
const OVERLOAD_BACKOFF_MS = [800, 2000];

// ── SSE headers required by ElevenLabs / the OpenAI SDK ───────────────────────
const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
};

// =============================================================================
// OpenAI Chat Completions SSE chunk builders
// =============================================================================
function dataLine(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}
const DONE_LINE = "data: [DONE]\n\n";

function chunkBase(id: string, created: number, model: string) {
  return { id, object: "chat.completion.chunk", created, model };
}
// First chunk only — announces the assistant role.
function roleChunkLine(id: string, created: number, model: string): string {
  return dataLine({
    ...chunkBase(id, created, model),
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
  });
}
// One per emitted content chunk (Phase 11.2.1: one per sentence, not per delta).
function contentChunkLine(
  id: string,
  created: number,
  model: string,
  content: string,
): string {
  return dataLine({
    ...chunkBase(id, created, model),
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  });
}
// Terminal content chunk — empty delta + finish_reason "stop".
function stopChunkLine(id: string, created: number, model: string): string {
  return dataLine({
    ...chunkBase(id, created, model),
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  });
}
// Phase 11.5 — OpenAI-format tool_call delta chunk. We emit this DETERMINISTIC-
// ALLY from OUR safety classifier (not the model) when a turn is flagged
// self_harm / harm_others, so ElevenAgents routes a client-tool call to the
// widget which renders the non-Krishna helpline overlay (Locked Decision #7).
// `show_helpline_card` is registered on the agent as a fire-and-forget client
// tool; Krishna's compassionate Bhagavata reply still streams as normal content
// AFTER this chunk. NOTE: interleaving a tool_call with content in a single
// completion (finish_reason "stop") is non-standard — ElevenLabs' parser MUST
// tolerate it for both the overlay and the spoken reply to land. This is the
// one piece a live smoke test must confirm (see CC report).
function toolCallChunkLine(
  id: string,
  created: number,
  model: string,
  toolCallId: string,
  name: string,
  args: string,
): string {
  return dataLine({
    ...chunkBase(id, created, model),
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: toolCallId,
              type: "function",
              function: { name, arguments: args },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  });
}
// Usage chunk — choices:[] per OpenAI spec. Emitted only when the request set
// stream_options.include_usage:true (ElevenAgents does).
function usageChunkLine(
  id: string,
  created: number,
  model: string,
  promptTokens: number,
  completionTokens: number,
): string {
  return dataLine({
    ...chunkBase(id, created, model),
    choices: [],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  });
}
// OpenAI-shaped error frame. Used ONLY before the first token has been emitted
// (a mid-stream error frame would break the SDK parser — see edge case 9).
function errorFrameLine(message: string): string {
  return dataLine({
    error: { message, type: "upstream_error", code: "502" },
  });
}

// =============================================================================
// Helpers
// =============================================================================

// Constant-time bearer-token compare. Hash both sides to a fixed 32-byte digest
// so timingSafeEqual gets equal-length inputs and we never leak length.
function tokensMatch(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Extract plain text from an OpenAI message `content`, which is normally a
// string but may be an array of content parts (edge 20: unicode is just UTF-8,
// no special handling needed).
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part &&
        typeof part === "object" &&
        typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
      )
      .join("");
  }
  return "";
}

// DUPLICATED from /api/chat (module-private there). Retry classifier.
function isRetryableOverload(err: unknown): boolean {
  const e = err as {
    status?: number;
    type?: string;
    error?: { type?: string; error?: { type?: string } };
  };
  const bodyType = e?.error?.error?.type ?? e?.error?.type ?? e?.type;
  if (bodyType === "overloaded_error") return true;
  if (typeof e?.status === "number" && e.status >= 500 && e.status < 600) {
    return true;
  }
  return false;
}

function isReturningAfterGap(prior: UserMemory | null): boolean {
  if (!prior?.last_active_at) return false;
  const last = new Date(prior.last_active_at).getTime();
  if (Number.isNaN(last)) return false;
  return Date.now() - last >= RETURNING_THRESHOLD_MS;
}

// DUPLICATED from /api/chat (module-private there). Memory extraction +
// query-theme classification in one Haiku call. Kept byte-faithful so behaviour
// matches the text path exactly.
type ExtractedTurn = UserMemory & {
  query_themes?: string[];
  language?: "hi" | "en";
  growing_edge?: string | null;
};

async function extractMemory(
  message: string,
  priorSummary: string | null,
  nameAwaited: boolean,
  priorLang: "hi" | "en" | undefined,
  priorGrowingEdge: string | null,
): Promise<ExtractedTurn | null> {
  try {
    const priorBlock = priorSummary
      ? `Prior context summary (the user's emotional thread up to now):
"${priorSummary}"`
      : `Prior context summary: (none — this is the first turn)`;

    const nameInstruction = nameAwaited
      ? `- detected_user_name: Krishna asked the user their name in his previous reply. The user has now responded. If this message is plausibly the user's name — a single word that looks name-shaped (e.g. "Krishna", "कृष्णा", "Anjali"), a sentence stating their name (e.g. "मेरा नाम कृष्णा है", "I'm Anjali"), or anything similar — return that name as a string. If the user ignored the question and brought up a new topic instead, return null. Bias toward returning the name when the message is short and could plausibly be one. Do NOT capture as user_name any of these even if the user types them: han, haan, hmm, ok, yes, no, nahi, achha, accha, theek, namaste, namaskar, hello, hi, hey, kya, tum, aap. These are common Hindi/Hinglish acknowledgments, particles, or greetings — never names. Capture user_name ONLY when the user explicitly introduces themselves (e.g., 'mera naam X hai', 'main X hoon', 'I'm X') or responds with what is clearly a name to a direct name question.`
      : `- detected_user_name: if and only if the user CLEARLY stated their OWN name in THIS message (e.g., "मेरा नाम कृष्णा है", "I'm Anjali"), return that name as a string. Otherwise return null. Names of other people mentioned in passing must NOT be returned. Be conservative. Do NOT capture as user_name any of these even if the user types them: han, haan, hmm, ok, yes, no, nahi, achha, accha, theek, namaste, namaskar, hello, hi, hey, kya, tum, aap. These are common Hindi/Hinglish acknowledgments, particles, or greetings — never names. Capture user_name ONLY when the user explicitly introduces themselves (e.g., 'mera naam X hai', 'main X hoon', 'I'm X') or responds with what is clearly a name to a direct name question.`;

    const stickinessInstruction =
      priorLang === "hi"
        ? 'The prior conversation was Hindi. Default to "hi" unless this message is unambiguously English with ZERO Hindi tokens (no "hai", "hain", "kya", "tum", "main", "mera", "ki", "ko", "ka", "ke", no Devanagari, no Hindi verb inflections like "-na", "-ta", "-rahi", "-rahe", "-kar"). Romanized Hindi mixed with English loanwords (project, time, office, manager) is HINGLISH and classifies as "hi", not "en".'
        : priorLang === "en"
          ? 'The prior conversation was English. Default to "en" unless this message has clear Hindi signal — Devanagari script, substantial Hinglish, or an explicit language-switch request like "hindi mein bolo".'
          : 'No prior conversation language available. Classify based on this message alone. Romanized Hindi mixed with English loanwords classifies as "hi".';

    const growingEdgeInstruction = priorGrowingEdge
      ? `Update slowly: the prior growing_edge is "${priorGrowingEdge}". Keep it UNCHANGED unless this turn meaningfully shifts the long-term arc — return the same value if uncertain. The growing_edge is not the current emotion or topic; it is what Krishna has been pointing this user toward across multiple sessions.`
      : `No prior growing_edge yet. Return null unless this turn clearly establishes a long-term arc (typically only after the user has shared 3+ substantive turns of the same theme). When uncertain, return null.`;

    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `${priorBlock}

The user's latest message:
"${message}"

Produce these seven fields about the user, integrating the prior summary with the new message:
- main_problem: short phrase describing what they are dealing with right now
- emotion: one word for the current emotional state
- context_summary: ONE OR TWO sentences that capture the user's running emotional thread — what they have been feeling and why, including how today's message fits into that thread. If there was no prior summary, write a fresh one based on this message alone. Write the summary in the SAME language/script as the user's most recent message: Devanagari Hindi if they wrote Devanagari, Romanized Hindi if they wrote Hinglish, English if they wrote English.
${nameInstruction}
- query_themes: 1-7 themes from the fixed taxonomy below that capture what the user is feeling, asking about, or struggling with in THIS message. The same taxonomy was applied to the scripture corpus, so query themes can match retrieved-verse themes during scripture retrieval reranking.
- language: classify the user's input language. Output "hi" if the message is Hindi (Devanagari OR Romanized Hindi/Hinglish), or "en" if unambiguously English. ${stickinessInstruction}
- growing_edge: a short phrase (max 12 words, in English) capturing what Krishna has been pointing this user toward across MULTIPLE sessions. DISTINCT from main_problem (current concern). Examples: "letting go of what isn't yours to hold", "facing the work instead of waiting to feel ready", "honoring the parent without becoming the parent's mirror". ${growingEdgeInstruction}

${QUERY_TAXONOMY_BLOCK}

Return ONLY valid JSON in this exact shape, with no surrounding text or markdown:
{"main_problem":"...","emotion":"...","context_summary":"...","detected_user_name":null,"query_themes":["tag1","tag2"],"language":"hi","growing_edge":null}`,
          },
        ],
      },
      // extractMemory runs in the BACKGROUND (kicked off pre-stream, awaited in
      // persistTurnState inside waitUntil AFTER the reply has streamed) — it is
      // NOT on the user's response path. The old 3s fail-fast timeout (copied
      // from a critical-path call) was firing here ("Request timed out"), so the
      // memory WRITE (name / emotion / context_summary / growing_edge) silently
      // fell back to a minimal save and Krishna forgot the user. A generous 10s
      // timeout lets Haiku finish; zero impact on response latency since this is
      // post-stream background work.
      { timeout: 10000, maxRetries: 0 },
    );
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    let parsed: Record<string, unknown> | null = null;
    const candidates: string[] = [text.trim()];
    const fence = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (fence) candidates.push(fence[1]);
    const allBlocks = text.match(/\{[^{}]*\}/g) ?? [];
    candidates.push(...[...allBlocks].reverse());
    const greedy = text.match(/\{[\s\S]*\}/);
    if (greedy) candidates.push(greedy[0]);
    for (const c of candidates) {
      try {
        const obj = JSON.parse(c.trim());
        if (
          typeof obj === "object" &&
          obj !== null &&
          typeof (obj as Record<string, unknown>).main_problem === "string"
        ) {
          parsed = obj as Record<string, unknown>;
          break;
        }
      } catch {
        /* try next */
      }
    }
    if (!parsed) {
      console.error("[agent-llm extractMemory] no JSON object found in output");
      return null;
    }
    if (
      typeof parsed.main_problem !== "string" ||
      typeof parsed.emotion !== "string" ||
      typeof parsed.context_summary !== "string"
    ) {
      console.error("[agent-llm extractMemory] parsed JSON had wrong shape");
      return null;
    }
    const result: ExtractedTurn = {
      main_problem: (parsed.main_problem as string).trim(),
      emotion: (parsed.emotion as string).trim(),
      context_summary: (parsed.context_summary as string).trim(),
    };
    if (
      typeof parsed.detected_user_name === "string" &&
      (parsed.detected_user_name as string).trim()
    ) {
      result.user_name = (parsed.detected_user_name as string).trim();
    }
    if (parsed.language === "hi" || parsed.language === "en") {
      result.language = parsed.language;
    }
    if (parsed.growing_edge === null || typeof parsed.growing_edge === "string") {
      result.growing_edge = parsed.growing_edge as string | null;
    }
    if (Array.isArray(parsed.query_themes)) {
      const stringTags = (parsed.query_themes as unknown[]).filter(
        (x): x is string => typeof x === "string",
      );
      result.query_themes = filterValidThemes(stringTags);
    } else {
      result.query_themes = [];
    }
    return result;
  } catch (e) {
    console.error("[agent-llm extractMemory] threw:", e);
    return null;
  }
}

// DUPLICATED from /api/chat (module-private there).
function formatScriptureBlock(verses: VerseHit[]): string {
  if (!verses.length) return "";
  const lines = verses.map((v) => {
    const sanskrit = v.sanskrit.replace(/\s+/g, " ").trim();
    const hindi = v.hindi.replace(/\s+/g, " ").trim();
    const english = v.english.replace(/\s+/g, " ").trim();
    return `[${v.reference}] ${sanskrit} — ${hindi} — ${english}`;
  });
  return `RELEVANT SCRIPTURE:\n${lines.join("\n")}`;
}

// DUPLICATED from /api/chat (module-private there). Returns { persona, dynamic }
// so the caller can place cache_control on the persona block only.
function buildSystemPrompt(
  memory: UserMemory | null,
  isReturningUser: boolean,
  isFirstTime: boolean,
  verses: VerseHit[],
  priorCount: number,
  safetyFlag: SafetyFlag | null,
  conversationLang: "hi" | "en",
): { persona: string; dynamic: string } {
  const lines: string[] = [];

  const langLabel = conversationLang === "hi" ? "Hindi" : "English";
  lines.push(
    `- Conversation language: ${langLabel} — reply in ${langLabel} per §3 LANGUAGE, even if this single message is short or in another script. The conversation's running language is the source of truth for ambiguous turns.`,
  );

  const userName = memory?.user_name?.trim();
  if (userName) {
    lines.push(
      `- USER_NAME: ${userName} — address them by this name warmly, sparingly (twice in a reply is too many).`,
    );
  } else if (priorCount === 0) {
    lines.push(
      `- The user's name is not yet known and this is their first message. Per the persona's first-reply rule, ask their name organically as part of your reply — Hindi: "बताओ — किस नाम से पुकारूँ?", English: "...what name should I call you by?". Keep it one beat among others, not the whole reply.`,
    );
  }

  if (safetyFlag) {
    lines.push(
      `- SAFETY_FLAG: ${safetyFlag} — apply Section 8 of your persona instructions: shift to softer Bhagavata mode, hold the user's pain close, do NOT add helplines yourself (the system layer attaches a separate helpline card).`,
    );
  }

  if (memory?.emotion) {
    lines.push(`- The user is currently feeling: ${memory.emotion}`);
  }
  if (memory?.main_problem) {
    lines.push(`- Their main concern: ${memory.main_problem}`);
  }
  if (memory?.context_summary) {
    lines.push(
      `- Recent emotional thread (background only; do not override a clear new topic in the user's latest message): ${memory.context_summary}`,
    );
  }
  if (memory?.growing_edge) {
    lines.push(
      `- USER'S GROWING EDGE (silent steering input — NEVER narrate to the user; background only, not a command to continue an old topic): ${memory.growing_edge}. Let this shape the register of your reply, the verses you reach for, and the questions you ask only when it fits the latest message. Krishna does NOT name this arc to the user (persona invariant: Krishna NEVER reveals stored memory). The user discovers their own arc through Krishna's gravitational pull, not through Krishna's announcement.`,
    );
  }
  if (isFirstTime) {
    lines.push(
      `- This is the user's first message in the app — be slightly warmer and more emotionally connecting than usual, but stay grounded and don't over-perform welcome.`,
    );
  } else if (isReturningUser) {
    lines.push(
      `- WELCOME-BACK MOMENT: this is the user's first message after being away for several hours. Krishna may open with quiet recognition — "फिर आए हो", "तुम लौट आए", or simply the user's name with warmth — and then engage with what they're saying NOW. Krishna does NOT narrate the prior session's content (persona invariant: Krishna NEVER reveals stored memory — "तुमने पिछली बार X कहा था" / "you said earlier..." is BANNED). The recognition is in the QUALITY of his attention, not in a recital of facts.`,
    );
    if (memory?.emotion) {
      lines.push(
        `- Prior session ended with the user feeling: ${memory.emotion}. If this suggests they were carrying weight last time, open softer/slower than usual without specifying why.`,
      );
    }
  }

  const dynamicSections: string[] = [];
  if (lines.length > 0) {
    dynamicSections.push(`USER CONTEXT:\n${lines.join("\n")}`);
  }
  const scripture = formatScriptureBlock(verses);
  if (scripture) {
    dynamicSections.push(scripture);
  }
  return { persona: SYSTEM_PROMPT, dynamic: dynamicSections.join("\n\n") };
}

// In-character fallback / refusal replies. Hindi-default (voice), short so the
// TTS layer reads them cleanly and they stay within the ≤30-word voice budget.
const BANNED_WORD_REPLY =
  "क्षमा करो — ऐसी भाषा में मैं साथ नहीं दे पाऊँगा। शांत मन से, फिर से कहो — मैं सुन रहा हूँ।";
const MODERATION_REPLY =
  "इस पर मैं साथ नहीं दे सकता, मित्र। पर तुम्हारे मन में जो असली बोझ है — वो कहो। मैं यहीं हूँ।";
const EMPTY_TURN_REPLY = "हाँ? बताओ — मैं सुन रहा हूँ।";
const IDENTITY_REQUIRED_REPLY =
  "I could not verify this voice session. Please refresh the page and try again.";
const VOICE_RATE_LIMIT_REPLY =
  "One moment - too many voice messages are arriving. Please pause briefly and then speak again.";
const MIN_CUSTOM_LLM_KEY_LENGTH = 32;

// Build a complete SSE stream for a fixed, non-Anthropic reply (banned word /
// moderation refusal / whitespace-only turn). Emits role → content → stop →
// (usage) → DONE. Usage is reported as 0/0 since no model was called.
function fixedReplyStream(
  replyText: string,
  includeUsage: boolean,
  model: string,
): ReadableStream<Uint8Array> {
  const id = "chatcmpl-" + randomUUID();
  const created = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(roleChunkLine(id, created, model)));
      controller.enqueue(
        encoder.encode(contentChunkLine(id, created, model, replyText)),
      );
      controller.enqueue(encoder.encode(stopChunkLine(id, created, model)));
      if (includeUsage) {
        controller.enqueue(encoder.encode(usageChunkLine(id, created, model, 0, 0)));
      }
      controller.enqueue(encoder.encode(DONE_LINE));
      controller.close();
    },
  });
}

function jsonError(message: string, status: number): Response {
  // OpenAI-shaped error body so the calling SDK surfaces a clean message.
  return new Response(
    JSON.stringify({ error: { message, type: "invalid_request_error", code: status } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

// Phase 11.4 — 402 Payment Required. The widget pre-checks voice access before
// starting, so this is defense-in-depth: it fires if a non-paying user reaches
// the agent anyway. ElevenAgents surfaces the failed turn to the widget, which
// (independently) shows the seva paywall.
function paywallError(): Response {
  return new Response(
    JSON.stringify({ error: { code: "payment_required", message: "voice_paywall" } }),
    { status: 402, headers: { "Content-Type": "application/json" } },
  );
}

// Phase 11.4 — resolve the per-user identity ElevenAgents forwards. The widget
// passes user_id via customLlmExtraBody (merged by the OpenAI SDK into the
// top-level request body → body.user_id) AND dynamicVariables. Different
// ElevenLabs versions surface it at different paths, so read a cascade. Returns
// the resolved id + whether the shared-test-user fallback fired, or a malformed
// signal (a present-but-non-string user_id) so the caller can 400.
type UserIdResult =
  | { ok: true; userId: string; usedFallback: boolean }
  | { ok: false };

// A resolved string that does NOT represent a real user: the shared sentinel
// (AGENT_USER_ID — ElevenLabs injects it as the placeholder default when the
// dynamic variable doesn't propagate) or an unsubstituted dynamic-variable
// template that leaked through verbatim ("{{user_id}}", or the bare name). Any
// of these must be treated as "no id" rather than a real user.
function isPlaceholderId(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    v === AGENT_USER_ID || v.includes("{{") || v === "user_id" || v === "{{user_id}}"
  );
}

function resolveUserId(body: Record<string, unknown>): UserIdResult {
  const asObj = (v: unknown): Record<string, unknown> | undefined =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
  const clb = asObj(body.custom_llm_extra_body);
  const eeb = asObj(body.elevenlabs_extra_body);
  const dyn = asObj(body.dynamic_variables);
  // Most → least likely path given the verified live request shape.
  const candidates: unknown[] = [
    // VERIFIED 2026-05-26 against the LIVE request body: ElevenLabs merges the
    // widget's customLlmExtraBody into body.elevenlabs_extra_body, so the id
    // lands at body.elevenlabs_extra_body.user_id. This is the real path.
    eeb?.user_id,
    body.user_id, // top-level merge (other ElevenLabs versions)
    clb?.user_id, // custom_llm_extra_body passed through verbatim
    dyn?.user_id, // top-level dynamic_variables object
    asObj(eeb?.dynamic_variables)?.user_id, // dynamic_variables nested in extra body
    asObj(clb?.dynamic_variables)?.user_id,
  ];
  let sawMalformed = false; // edge A5.3: present but non-string somewhere
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      // A real id wins immediately. The placeholder/sentinel/template is NOT a
      // real id — skip it and keep scanning so a real id later in the cascade
      // still wins, and an all-placeholder request falls through to the
      // usedFallback path below (NOT a 400).
      if (isPlaceholderId(c)) continue;
      return { ok: true, userId: c.trim(), usedFallback: false };
    }
    if (c !== undefined && c !== null) sawMalformed = true;
  }
  if (sawMalformed) return { ok: false }; // edge A5.3 → 400
  // No REAL id anywhere (absent, or only the placeholder/sentinel) → unidentified.
  return { ok: true, userId: AGENT_USER_ID, usedFallback: true };
}

// =============================================================================
// GET handler — serverless warm ping (founder 2026-06-11)
// =============================================================================
// The voice widget fires a fire-and-forget GET here on page mount (once
// bootstrap confirms access) so this function is WARM before ElevenLabs'
// first server-to-server POST arrives — otherwise the first turn of the call
// pays a Vercel cold start on top of everything else. Deliberately unauthenticated:
// it does no work, touches no state, and returns no data, so there is nothing
// to protect; the POST path keeps its Bearer auth unchanged.
export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// =============================================================================
// POST handler
// =============================================================================
export async function POST(req: Request): Promise<Response> {
  const turnStart = Date.now();

  // ── Edge case 7: deployment misconfiguration. CUSTOM_LLM_KEY missing → 500. ──
  const expectedKey = process.env.CUSTOM_LLM_KEY;
  if (!expectedKey) {
    console.error(
      "[agent-llm] CRITICAL: CUSTOM_LLM_KEY env var is not set — endpoint cannot authenticate. Set it in Vercel env vars and redeploy.",
    );
    return jsonError("server misconfiguration", 500);
  }
  if (
    process.env.NODE_ENV === "production" &&
    expectedKey.length < MIN_CUSTOM_LLM_KEY_LENGTH
  ) {
    console.error(
      "[agent-llm] CRITICAL: CUSTOM_LLM_KEY is too short for production. Generate at least 32 random characters, update ElevenLabs + Vercel, and redeploy.",
    );
    return jsonError("server misconfiguration", 500);
  }

  // ── Step 1: auth gate. Bearer token, constant-time compare. ──
  // Edge case 5: missing/malformed Authorization header → 401.
  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return jsonError("missing or malformed Authorization header", 401);
  }
  // Edge case 6: value mismatch → 401 (constant-time).
  if (!tokensMatch(match[1], expectedKey)) {
    return jsonError("invalid api key", 401);
  }

  // ── Step 2: body validation. ──
  let body: {
    messages?: unknown;
    model?: unknown;
    stream_options?: { include_usage?: unknown };
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("request body is not valid JSON", 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    // Edge case 1: empty / missing messages array → 400.
    return jsonError("`messages` must be a non-empty array", 400);
  }

  const responseModel =
    typeof body.model === "string" && body.model.trim()
      ? body.model
      : DEFAULT_MODEL_ID;
  const includeUsage = body.stream_options?.include_usage === true;

  const rawMessages = body.messages as Array<{ role?: unknown; content?: unknown }>;

  // ── Step 3: strip ElevenLabs' system wrapper. ──
  // Their system message carries aggressive Hinglish rules + generic guardrails
  // that fight Krishna's pure-Hindi register (Locked Decision #12). Drop ALL
  // system messages; Anthropic gets OUR system prompt instead.
  const nonSystem = rawMessages.filter((m) => m.role !== "system");
  // Edge case 4: their format changed and no system message was present.
  if (nonSystem.length === rawMessages.length) {
    console.warn(
      "[agent-llm] no system message in request — ElevenAgents format may have changed; proceeding without stripping",
    );
  }

  // ── Step 4: conversation history + current turn. ──
  // Build the Anthropic messages array from the (authoritative) live history.
  // Anthropic requires the array to start with a user message, so drop any
  // leading assistant turns (e.g. ElevenAgents' opening first_message).
  const anthropicMessages: Array<{ role: "user" | "assistant"; content: string }> =
    [];
  for (const m of nonSystem) {
    const role =
      m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : null;
    if (!role) continue; // skip any stray tool/function roles
    anthropicMessages.push({ role, content: extractText(m.content) });
  }
  while (anthropicMessages.length > 0 && anthropicMessages[0].role === "assistant") {
    anthropicMessages.shift();
  }

  // Edge case 2: no user message anywhere → 400.
  const lastMsg = anthropicMessages[anthropicMessages.length - 1];
  if (!anthropicMessages.some((m) => m.role === "user")) {
    return jsonError("no user message found in `messages`", 400);
  }
  // Edge case 3: the last message is not a user turn (assistant was last).
  if (!lastMsg || lastMsg.role !== "user") {
    return jsonError("the last message must be from the user", 400);
  }
  const latestUserMessage = lastMsg.content;

  // ── Step 5: user identity (Phase 11.4 — from dynamic variables). ──
  const idResult = resolveUserId(body as Record<string, unknown>);
  if (!idResult.ok) {
    return jsonError("`user_id` must be a string", 400); // edge A5.3
  }
  const userId = idResult.userId;
  // A turn is "identified" only when a real cookie UUID resolved. When it did
  // NOT (the widget's dynamic variable failed to propagate, so ElevenLabs sent
  // its placeholder default — or a dashboard test call), we still answer the
  // turn so a live call is never torn down, but we DO NOT read or write any
  // Supabase state: otherwise every unidentified turn would merge into one
  // shared users_memory row (overwriting different real people's name /
  // emotion / growing_edge) and read a stranger's memory back. We alert loudly
  // — an unidentified PRODUCTION turn means identity propagation is broken.
  const isIdentified = !idResult.usedFallback;
  if (!isIdentified) {
    console.error(
      "[agent-llm] CRITICAL: no real user_id resolved — identity did not " +
        "propagate from the widget. Answering WITHOUT persistence (no memory, " +
        "no chat_logs, no safety_events). Check the agent's dynamic_variables " +
        "config + the widget startSession({ dynamicVariables }) call.",
    );
    Sentry.captureMessage(
      "agent-llm: voice turn with no real user_id — identity propagation broken (turn not persisted)",
      "error",
    );
    if (process.env.NODE_ENV === "production") {
      return new Response(
        fixedReplyStream(IDENTITY_REQUIRED_REPLY, includeUsage, responseModel),
        { status: 200, headers: SSE_HEADERS },
      );
    }
  }
  console.log(`[agent-llm] user_id=${userId} identified=${isIdentified}`);

  {
    const rl = await checkRateLimit(
      "agent_llm",
      isIdentified ? userId : null,
      clientIpFromRequest(req),
    );
    if (!rl.ok) {
      return new Response(
        fixedReplyStream(VOICE_RATE_LIMIT_REPLY, includeUsage, responseModel),
        { status: 200, headers: SSE_HEADERS },
      );
    }
  }

  // ── Step 5b: paywall (Phase 11.4) — kicked off CONCURRENTLY here and checked
  // after the parallel pre-AI block, so its Supabase round-trip OVERLAPS the
  // rest of the pre-Sonnet work instead of adding a serial hop (latency). The
  // widget's bootstrap gate is AUTHORITATIVE; this is defense-in-depth that
  // FAILS OPEN — skipped on the fallback id, and allow-on-error — so a 402 can
  // never tear down a live conversation (ElevenAgents ends the call on a non-200
  // from the custom LLM). Only a RESOLVED real user definitively denied is
  // blocked (shouldn't happen — the widget wouldn't have let them Begin).
  const accessPromise = idResult.usedFallback
    ? null
    : hasVoiceAccess(userId).catch((e) => {
        console.error(
          "[agent-llm] hasVoiceAccess threw — failing open (widget gates entry):",
          e,
        );
        return { allowed: true, reason: "threw" };
      });

  // ── Step 6a: banned-word gate (defense in depth + latency saver). ──
  // Mirrors /api/chat: short-circuit BEFORE any Haiku/Anthropic cost, log to
  // safety_events, return a graceful in-character refusal as a 200 SSE stream.
  const bannedWordHit = findBannedWord(latestUserMessage);
  if (bannedWordHit) {
    if (isIdentified) {
      waitUntil(
        logSafetyEvent({
          userId,
          messageText: latestUserMessage,
          flag: "hostility",
          confidence: 1,
          replyText: BANNED_WORD_REPLY,
          versesReferenced: [],
        }).catch((e) => console.error("[agent-llm] banned-word logSafetyEvent failed:", e)),
      );
    }
    return new Response(
      fixedReplyStream(BANNED_WORD_REPLY, includeUsage, responseModel),
      { status: 200, headers: SSE_HEADERS },
    );
  }

  // ── Step 6b/6c: prior memory + pre-AI pipeline, ALL in parallel. ──
  // RAG candidates + safety + moderation only need the raw user message, and
  // prior memory only feeds the NEXT-turn extraction + the USER CONTEXT block
  // (never RAG/safety) — so fetchMemory runs CONCURRENTLY with them instead of
  // as a serial DB hop before them, shaving ~one Supabase round-trip off the
  // latency-critical path. Each silent-fails to a safe default. Voice mode skips
  // query rewrite (RAG runs on the raw message). The heaviest Haiku call (memory
  // EXTRACTION) is still excluded — it only updates memory for the next turn,
  // kicked off after the gates + awaited post-stream.
  const ragFlags = getRagFlags();
  const wantWidePool =
    ragFlags.themeRerank || ragFlags.sourceDiversity || ragFlags.queryRewrite;
  const fetchK = wantWidePool ? ragFlags.candidatesK : 5;

  // TEMP latency profiling (founder 2026-05-26 — REMOVE after the latency pass).
  // Each sub-call records its own elapsed time from the block start; since they
  // run in PARALLEL, the MAX is pre_sonnet's long pole. This tells us whether
  // the RAG embedding network hop (Gemini, US) or the Haiku safety/moderation
  // calls dominate — i.e. whether a US region pin or buffered streaming is the
  // bigger win.
  const blockStart = Date.now();
  let memMs = 0;
  let ragMs = 0;
  let safetyMs = 0;
  let moderationMs = 0;
  let histMs = 0;
  let semMs = 0;

  // ── Speculative gating (founder 2026-06-11 latency pass). ──
  // The safety + moderation Haiku classifiers (~500-800ms) used to gate Sonnet
  // SERIALLY: Sonnet could not start until both returned. The real requirement
  // is only that nothing REACHES THE USER before the gates pass — so the
  // classifiers now run while Sonnet ramps up, and the stream below BUFFERS
  // Sonnet's output until the verdict lands (gates resolve before Sonnet's
  // first token on virtually every turn). Clean turns — the vast majority —
  // get the whole classifier wait off the critical path. Flagged turns abandon
  // the speculative stream unsent and behave exactly as before: moderation →
  // fixed refusal; safety → restart WITH the SAFETY_FLAG persona steering +
  // helpline tool first (a restart costs extra time only on distress turns,
  // where presence matters far more than speed).
  const gatesPromise = Promise.all([
    safetyClassify(latestUserMessage).then((r) => {
      safetyMs = Date.now() - blockStart;
      return r;
    }),
    moderateInput(latestUserMessage).then((r) => {
      moderationMs = Date.now() - blockStart;
      return r;
    }),
  ]);

  const [priorMemory, candidates, recentHistory, semanticHits] = await Promise.all([
    // Unidentified turns NEVER read memory: the sentinel row is shared, so
    // reading it would leak another person's name / growing_edge / "welcome
    // back". Treat unidentified as a clean first-time user.
    (isIdentified
      ? fetchMemory(userId).catch((e) => {
          console.error("[agent-llm] fetchMemory threw:", e);
          return null;
        })
      : Promise.resolve(null)
    ).then((r) => {
      memMs = Date.now() - blockStart;
      return r;
    }),
    fetchCandidates(latestUserMessage, fetchK)
      .catch((e) => {
        console.error("[agent-llm] fetchCandidates threw:", e);
        return [] as VerseHit[];
      })
      .then((r) => {
        ragMs = Date.now() - blockStart;
        return r;
      }),
    // Cross-session memory (founder 2026-06-11): ElevenAgents supplies only
    // the CURRENT call's history, so without this Krishna starts every call
    // knowing nothing but the 1-2 sentence context_summary — "he doesn't
    // remember me". Mirrors /api/chat's Phase 7.0 verbatim-history restoration.
    // Runs in this PARALLEL block (~30ms Supabase read while the Haiku calls
    // take ~800ms) — zero added latency. Unidentified turns read nothing.
    (isIdentified
      ? fetchRecentChatHistory(userId, 12).catch((e) => {
          console.error("[agent-llm] fetchRecentChatHistory threw:", e);
          return [] as Array<{ user_message: string; reply_text: string }>;
        })
      : Promise.resolve(
          [] as Array<{ user_message: string; reply_text: string }>,
        )
    ).then((r) => {
      histMs = Date.now() - blockStart;
      return r;
    }),
    // Memory layer #4 (founder 2026-06-11): semantic retrieval over the user's
    // OWN older turns — surfaces the relevant old conversation even when it
    // fell outside the verbatim recent window. Gemini embed (~365ms) + RPC
    // (~60ms) runs INSIDE this parallel block under the ~800ms Haiku long pole
    // — zero added latency. Silent-fails to [] until the founder pastes the
    // chat-memory SQL (docs/sql-chat-memory-retrieval.sql).
    (isIdentified
      ? searchChatMemory(userId, latestUserMessage, 3)
      : Promise.resolve([] as ChatMemoryHit[])
    ).then((r) => {
      semMs = Date.now() - blockStart;
      return r;
    }),
  ]);
  console.log(
    `[agent-llm] pre-AI block (parallel, ms from block start): mem=${memMs} rag=${ragMs} hist=${histMs} sem=${semMs} (safety/moderation resolve concurrently with Sonnet ramp-up — logged at verdict)`,
  );

  // Memory-derived flags (after the parallel fetch above).
  const priorCount = priorMemory?.message_count ?? 0;
  const isFirstTime = priorMemory?.is_first_time !== false;
  const isReturningUser = isReturningAfterGap(priorMemory);
  const nameAwaited = !priorMemory?.user_name && priorCount >= 1;
  const priorSummary = priorMemory?.context_summary?.trim() ?? null;

  // priorLang for extractMemory stickiness. DEVIATION: derived from the live
  // ElevenAgents history (the previous user turn) rather than fetchLastChatLanguage
  // — for the shared test id, chat_logs language would be cross-contaminated, and
  // this avoids another serial DB hit on the latency-critical path.
  const priorUserTurns = anthropicMessages.filter((m) => m.role === "user");
  const priorUserMessage =
    priorUserTurns.length >= 2
      ? priorUserTurns[priorUserTurns.length - 2].content
      : undefined;
  const priorLang: "hi" | "en" | undefined = priorUserMessage
    ? detectLang(priorUserMessage)
    : priorSummary
      ? detectLang(priorSummary)
      : undefined;

  // Paywall — checked now; its Supabase round-trip overlapped the work above
  // (Step 5b). Only block a RESOLVED real user definitively denied; the fallback
  // id and any access-check error already failed open.
  if (accessPromise) {
    const access = await accessPromise;
    if (!access.allowed) {
      console.warn(`[agent-llm] voice paywall blocked resolved user_id=${userId}`);
      return paywallError();
    }
  }

  // ── Step 6d: RAG layers — cosine + relationship-aware rerank + diversity. ──
  // Voice still does NOT wait on extractMemory's Haiku query themes before
  // Sonnet. For relationship turns, a deterministic theme pass gives us the
  // same kind of retrieval nudge with zero added latency, countering the
  // historic Gita/Arjuna gravity on love and breakup conversations.
  const deterministicQueryThemes = deterministicQueryThemesForTurn(
    latestUserMessage,
    priorSummary,
  );
  const reranked =
    ragFlags.themeRerank && deterministicQueryThemes.length > 0
      ? rerankByTheme(candidates, deterministicQueryThemes, ragFlags.themeWeight)
      : candidates;
  const verses = ragFlags.sourceDiversity
    ? applyDiversityBoost(
        reranked,
        5,
        ragFlags.diversityCosineThreshold,
        ragFlags.diversityScopeK,
      )
    : reranked.slice(0, 5);

  // ── Step 7: safety + moderation verdicts now land INSIDE the stream ──
  // (speculative gating — see gatesPromise above). Edge case 13 still holds:
  // NO safety_card is returned — ElevenAgents owns the UI; safety is enforced
  // via persona mode shift + helpline tool + safety_events logging.
  // gateSafety carries the resolved safety result for persistTurnState (the
  // stream assigns it at verdict time, which is always before persistence).
  let gateSafety: { flag: string; confidence: number } = {
    flag: "safe",
    confidence: 0,
  };

  // ── Latency: kick off memory extraction NOW (off the critical path). It runs
  // concurrently with Sonnet's stream and is awaited in persistTurnState. With
  // speculative gating it is also spent on the (rare) moderation-flagged turn —
  // accepted: one wasted Haiku call on flagged turns vs ~500ms saved on all
  // clean turns. ──
  // Skip the (heaviest) Haiku extraction entirely for unidentified turns —
  // nothing will be persisted, so there's no reason to spend it.
  const extractedPromise: Promise<ExtractedTurn | null> = isIdentified
    ? extractMemory(
        latestUserMessage,
        priorSummary,
        nameAwaited,
        priorLang,
        priorMemory?.growing_edge ?? null,
      )
    : Promise.resolve(null);

  // ── Step 8 prep: memory + conversation language for THIS turn. ──
  // Prior memory carries the running context (the user's live message is in the
  // messages array regardless); language from the detectLang heuristic (the
  // persona's §3 LANGUAGE rule governs the actual reply language). The fresh
  // extraction updates memory for the NEXT turn via persistTurnState.
  const effectiveMemory: UserMemory | null = priorMemory;
  const conversationLang: "hi" | "en" = detectLang(latestUserMessage, priorLang);

  // ── Cross-session memory block (founder 2026-06-11). ──
  // Recent chat_logs turns (text + voice — both log there) injected as
  // BACKGROUND MEMORY in the per-turn dynamic context. The dynamic block is
  // injected into the LATEST user turn, AFTER the cached conversation prefix,
  // so this has ZERO prompt-cache impact. Rows from THIS call are excluded:
  // voice turns are logged post-stream, so by turn 3 the fetch would otherwise
  // duplicate the live ElevenAgents history (matched on user_message text).
  // Clipped + capped at 6 turns to bound the per-turn uncached token cost.
  const liveUserTexts = new Set(
    anthropicMessages
      .filter((m) => m.role === "user")
      .map((m) => m.content.trim()),
  );
  const clip = (s: string, n: number): string => {
    const t = s.replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
  };
  const pastTurns = recentHistory
    .filter((t) => !liveUserTexts.has(t.user_message.trim()))
    .slice(-6);
  // Memory layer #4: semantically retrieved OLDER moments (related-by-meaning
  // to what the devotee just said), deduped against the verbatim window and
  // the live call so nothing appears twice.
  const verbatimTexts = new Set(pastTurns.map((t) => t.user_message.trim()));
  const semanticTurns = semanticHits.filter(
    (h) =>
      !liveUserTexts.has(h.user_message.trim()) &&
      !verbatimTexts.has(h.user_message.trim()),
  );
  const memoryLines: string[] = [];
  if (pastTurns.length) {
    memoryLines.push(
      "Recent earlier turns:",
      ...pastTurns.map(
        (t) =>
          `[earlier] Devotee: ${clip(t.user_message, 240)}\n[earlier] Krishna: ${clip(t.reply_text, 240)}`,
      ),
    );
  }
  if (semanticTurns.length) {
    memoryLines.push(
      "Older moments related by meaning to what the devotee just said (may be from weeks ago):",
      ...semanticTurns.map((h) => {
        const day = (h.turn_at ?? "").slice(0, 10);
        return `[older${day ? " " + day : ""}] Devotee: ${clip(h.user_message, 240)}\n[older${day ? " " + day : ""}] Krishna: ${clip(h.reply_text, 240)}`;
      }),
    );
  }
  const pastBlock = memoryLines.length
    ? "PAST CONVERSATIONS (background memory from the devotee's earlier sessions — text and voice). " +
      "This is what they have shared with you before. Let it inform your reading of THIS turn the way a friend who remembers naturally would: " +
      "use it only when it clearly helps with the user's latest message or when the latest message is vague. If the latest message names a new topic, the new topic wins; do not pull back to these older turns. " +
      "recognize recurring threads, know where their story left off, and respond with the continuity of someone who has been listening across time. " +
      "PERSONA INVARIANT UNCHANGED: NEVER narrate or quote this memory back — no \"तुमने पिछली बार कहा था\", no \"you said earlier\", no \"I remember\", no recital of stored facts. " +
      "If the devotee THEMSELVES refers back to something here, engage with it directly as shared context — do not act as if hearing it for the first time. " +
      "Recognition lives in the QUALITY of attention, never in announcing it.\n" +
      memoryLines.join("\n")
    : "";
  // ── Step 7 (build): request assembly, as a FACTORY (speculative gating). ──
  // The speculative run builds with flag=null; a safety-flagged turn rebuilds
  // with the flag (only buildSystemPrompt's USER CONTEXT differs — the persona
  // block and conversation prefix are byte-identical, so both builds share the
  // same cache entries).
  type AssembledRequest = {
    systemBlocks: Array<{
      type: "text";
      text: string;
      cache_control?: { type: "ephemeral"; ttl?: "1h" };
    }>;
    builtMessages: Anthropic.MessageParam[];
    personaLen: number;
    dynamicLen: number;
  };
  const scriptureSteering = buildScriptureSteeringBlock(
    latestUserMessage,
    priorSummary,
  );
  const assembleRequest = (flag: SafetyFlag | null): AssembledRequest => {
  const { persona, dynamic } = buildSystemPrompt(
    effectiveMemory,
    isReturningUser,
    isFirstTime,
    verses,
    priorCount,
    flag,
    conversationLang,
  );
  const dynamicFull = [dynamic, scriptureSteering, pastBlock]
    .filter((block) => block.length > 0)
    .join("\n\n");

  const systemBlocks: AssembledRequest["systemBlocks"] = [
    {
      type: "text",
      text: persona,
      // Persona is the sole cache breakpoint, pinned to a 1h TTL (mirror /api/chat).
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
  ];
  // NOTE: the per-turn `dynamic` block (USER CONTEXT + RELEVANT SCRIPTURE) is
  // deliberately NOT pushed into `system` anymore. Prompt caching is a strict
  // prefix match, so volatile per-turn content sitting in `system` (before the
  // messages) would block the conversation history from ever caching. Instead
  // `dynamic` is injected into the LATEST user turn below (standard RAG layout),
  // which keeps the whole conversation prefix cacheable. See the conversation-
  // caching block after the system blocks.
  // Voice-mode length guidance — additive, AFTER the persona block, NO
  // cache_control so the persona cache breakpoint stays on the persona block.
  // The hard ≤55-word cap was removed (founder 2026-05-25): a SOFT ~150-word
  // guide keeps replies conversational without clipping Krishna mid-teaching.
  // Voice is metered per minute, so the soft ceiling + "never pad" also protect
  // cost/latency; VOICE_MAX_TOKENS is the hard upper bound against a runaway turn.
  systemBlocks.push({
    type: "text",
    text: "VOICE-MODE OUTPUT CONSTRAINT (additive, not a persona change): you are speaking aloud in a live voice call, not typing. Speak as long as the moment genuinely needs — usually two to five sentences, and as a soft guide stay under about 150 words unless real depth truly calls for more. Never pad, never repeat yourself to fill time, and stop the instant the thought is complete. Krishna's voice, register, and warmth stay exactly the same. It is fine to end cleanly mid-thought; the user can ask you to continue.",
  });
  // Voice-mode greeting suppression (founder 2026-05-24). The call is already
  // live when this fires (the agent's first_message is empty — silent start),
  // so an opening salutation makes Krishna sound like he's answering a phone
  // each turn. Additive, voice-only; overrides the welcome / welcome-back
  // openers the USER CONTEXT block may suggest. Does NOT touch the cached
  // persona block (no cache_control).
  systemBlocks.push({
    type: "text",
    text: "VOICE-MODE — NO OPENING GREETING (additive; overrides any welcome or welcome-back cue in USER CONTEXT): begin your spoken reply with substance, never a salutation. Do NOT open with 'नमस्ते' / 'राधे राधे' / 'हे' / 'प्रिय' / 'सुनो' / 'welcome' / 'स्वागत', no self-introduction, and — even for a returning user — no spoken recognition opener like 'फिर आए हो' / 'तुम लौट आए' / 'you're back'. The conversation is already live and the user has just spoken; respond as if mid-conversation. If you still need their name (first turn), weave the ask into the body of your reply instead of leading with a hello. Recognition and warmth show in HOW Krishna attends to what was just said, never in a spoken hello.",
  });
  // Voice-mode satsang-arc compression (founder 2026-06-11). In text chat the
  // §4.5 TURN GATE + §4.6 TURN-PACING spread acknowledgment → parallel →
  // teaching across turns 1/2/3. In a live metered voice call that drip pacing
  // reads as evasion: with the ~150-word soft cap the whole reply gets consumed
  // by the acknowledge + open-ended reflection, and the scriptural parallel /
  // solution never lands — Krishna "carries the conversation" without ever
  // answering. This block compresses the arc for VOICE ONLY: substance arrives
  // in the SAME reply as the acknowledgment. Additive, AFTER the persona block,
  // NO cache_control (persona stays the sole system cache breakpoint).
  systemBlocks.push({
    type: "text",
    text: "VOICE-MODE — SUBSTANCE PACING (additive; for this live voice call it compresses §4.6 TURN-PACING and lifts the §4.5 TURN GATE): in a live voice call every spoken exchange costs the user real effort and metered minutes, so the multi-turn drip (acknowledge on turn 1, parallel on turn 2, teaching on turn 3+) reads as evasion here, not patience. From the FIRST turn in which the user shares a real problem or question, your reply must carry scriptural substance in the SAME breath: one warm acknowledging clause first (acknowledge-before-teach is never skipped), then ONE life-parallel from §4.5 or a verse-grounded observation, and a discernible path the user could take — all inside this single reply. Any guidance-shaped ask ('क्या करूँ', 'kya karoon', 'kaise...', 'what should I do', 'help me', 'बताओ') fires §4.7 SUGGESTION MODE immediately, even on turn 1: scripture-grounded counsel with a specific direction in THIS reply, never another diagnostic question. A voice reply must NEVER consist only of reflection plus a question back — reserve reflection-only replies for pure emotional disclosure where the user asked nothing and a solution would be intrusive, and for SAFETY_FLAG turns, where presence outranks solutions and soft Bhagavata mode governs exactly as the persona instructs. Casual greetings and small talk stay light per APPROACHABLE register — do not force a parallel into chit-chat. When you ARE delivering the parallel or counsel, take the space the teaching needs — up to about 200 words is fine for that reply, overriding the soft 150-word guide. Everything else holds unchanged: observational not imperative, ONE parallel not three, teach from scripture never modern advice, no chapter:verse numbers spoken aloud, no outcome prediction.",
  });

  // ── Conversation prompt caching (incremental, multi-turn) ──────────────────
  // Long voice calls used to reprocess the entire transcript every turn. Caching
  // is a prefix match, so we keep the persona cached in `system` (1h) and add a
  // SECOND breakpoint on the last HISTORY message — each turn then reads the
  // prior turn's conversation prefix and reprocesses only the newest exchange.
  // The volatile per-turn `dynamic` (USER CONTEXT + RELEVANT SCRIPTURE) is
  // injected into the latest user turn so it sits AFTER the cached history
  // (anything before a breakpoint must be byte-stable turn-to-turn). Full
  // history is preserved — nothing is dropped, so within-call recall and
  // personalization are unchanged. The injected `dynamic` is clearly delimited
  // as reference material so Krishna never mistakes it for the user's words.
  // 5-min ephemeral TTL: turns in a live call are seconds apart, so the prefix
  // stays warm; between calls a fresh conversation makes a longer TTL pointless.
  const builtMessages: Anthropic.MessageParam[] = anthropicMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const lastMsgIdx = builtMessages.length - 1;
  if (dynamicFull.length > 0 && lastMsgIdx >= 0) {
    builtMessages[lastMsgIdx] = {
      role: "user",
      content:
        "[CONTEXT FOR THIS TURN — reference material, NOT spoken aloud by the user]\n" +
        dynamicFull +
        "\n[END CONTEXT — the user's actual words follow]\n\n" +
        anthropicMessages[lastMsgIdx].content,
    };
  }
  // Cache breakpoint on the last history message (the turn before the newest
  // user turn). Needs ≥1 prior message; on the very first turn there is no
  // history to cache, so we skip it (and the persona breakpoint still applies).
  if (lastMsgIdx >= 1) {
    const prev = anthropicMessages[lastMsgIdx - 1];
    builtMessages[lastMsgIdx - 1] = {
      role: prev.role,
      content: [
        { type: "text", text: prev.content, cache_control: { type: "ephemeral" } },
      ],
    };
  }
  return {
    systemBlocks,
    builtMessages,
    personaLen: persona.length,
    dynamicLen: dynamicFull.length,
  };
  };

  // ── Step 11 prep: turn-state persistence (runs post-stream, in waitUntil). ──
  async function persistTurnState(replyText: string): Promise<void> {
    // Unidentified turn (resolveUserId fell back to the shared sentinel): never
    // touch Supabase — no memory merge into a shared row, no chat_logs
    // pollution. The alert already fired at resolve time. (Guarded again here
    // so EVERY persistence path is covered, not just the gates above.)
    if (!isIdentified) return;
    // Memory extraction was kicked off before the stream (off the critical
    // path); await its result now for the memory write. extractMemory catches
    // internally, so this resolves to its value or null — it never throws.
    const extracted = await extractedPromise;
    const verseRefs = verses.map((v) => v.reference);
    const newUserName =
      !priorMemory?.user_name && extracted?.user_name
        ? extracted.user_name
        : undefined;

    if (extracted) {
      await saveMemory(userId, {
        main_problem: extracted.main_problem,
        emotion: extracted.emotion,
        context_summary: extracted.context_summary,
        growing_edge: extracted.growing_edge,
        message_count: priorCount + 1,
        is_first_time: false,
        verses_referenced: verseRefs,
        user_name: newUserName,
      });
    } else {
      // Edge case 15: extractMemory returned null — proceed with a minimal save.
      await saveMemory(userId, {
        message_count: priorCount + 1,
        is_first_time: false,
        verses_referenced: verseRefs,
      });
    }

    // logSafetyEvent no-ops when flag === "safe". gateSafety was assigned at
    // verdict time inside the stream — always before persistence runs.
    await logSafetyEvent({
      userId,
      messageText: latestUserMessage,
      flag: gateSafety.flag,
      confidence: gateSafety.confidence,
      replyText,
      versesReferenced: verseRefs,
    });

    // Edge case 14: chat_logs write is silent-fail. Respect training_opt_out.
    if (effectiveMemory?.training_opt_out === true) {
      console.log("[agent-llm] training_opt_out=true; skipping logChatTurn");
    } else {
      await logChatTurn({
        userId,
        userMessage: latestUserMessage,
        replyText,
        language: conversationLang,
        versesReferenced: verseRefs,
        safetyFlag: gateSafety.flag,
        messageCountAfter: priorCount + 1,
        source: "voice", // tag voice turns distinctly from chat in chat_logs
      }).catch((err) => console.warn("[agent-llm chat_logs] insert failed:", err));
    }
  }

  // ── Step 11 (whitespace turn): edge case 11. ──
  // If the current user turn is whitespace-only (empty STT), skip Anthropic and
  // emit a brief in-character nudge. (Spec suggested "..."; a short Hindi line
  // reads better through TTS.) Do NOT persist — nothing meaningful happened.
  if (!latestUserMessage.trim()) {
    return new Response(
      fixedReplyStream(EMPTY_TURN_REPLY, includeUsage, responseModel),
      { status: 200, headers: SSE_HEADERS },
    );
  }

  // ── Steps 9 + 10: stream Anthropic → OpenAI Chat Completions SSE. ──
  const id = "chatcmpl-" + randomUUID();
  const created = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();

  // Outer-scope flags so the catch block can decide between a clean stop
  // (a content chunk already FLUSHED) and an error frame (nothing flushed yet).
  // Phase 11.2.1: with sentence-boundary batching, hasEmittedText means "an SSE
  // content chunk has been sent to the client" (a flush happened), NOT merely
  // "Anthropic emitted a delta" — deltas are buffered until a sentence completes.
  let hasEmittedText = false;
  let roleEmitted = false;
  let firstTokenLogged = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          // Controller closed (ElevenLabs disconnected) — swallow.
        }
      };

      // ── Phase 11.2.1 — sentence-boundary batching for ElevenAgents prosody ──
      // ElevenLabs treats each SSE delta.content chunk as one TTS generation
      // unit, so forwarding per-token Anthropic deltas resets prosody mid-
      // sentence (audible voice variation). We buffer deltas and emit ONE OpenAI
      // chunk per sentence instead. This rebatches only — NO debounce/sleep, no
      // added latency beyond waiting for the sentence's own punctuation to land.
      // Voice-pacing fix (founder 2026-06-11): each SSE delta.content chunk is
      // ONE ElevenLabs TTS generation unit, and prosody resets at every unit —
      // so per-sentence chunks made the pace audibly jump sentence-to-sentence,
      // and the old 150-char cap force-split long Hindi sentences MID-sentence
      // (the worst prosody break). After the fast first chunk, complete
      // sentences are now GROUPED into chunks of ≥ MIN_TTS_CHUNK chars, and the
      // no-boundary safety ceiling is raised to 300 so a normal Devanagari
      // sentence is never bisected.
      const SENTENCE_CAP = 300; // edge 4: hard flush ceiling without a boundary
      const MIN_TTS_CHUNK = 140; // post-first-chunk grouping floor (chars)
      let sentenceBuffer = "";
      // Latency: the FIRST emitted chunk may flush at a clause boundary
      // (comma/semicolon/dash) so the first audio starts a clause sooner; after
      // that we revert to sentence-only boundaries for best TTS prosody.
      let firstFlushDone = false;

      // ── Speculative-gating buffer (founder 2026-06-11 latency pass) ──
      // Sonnet starts BEFORE the safety/moderation verdict; until openGate()
      // is called, emitContent BUFFERS chunks instead of sending — nothing
      // reaches ElevenLabs before the gates pass. The verdict normally lands
      // before Sonnet's first token, so the buffer is usually empty when the
      // gate opens and emission is effectively live from the start.
      let gateOpen = false;
      const pendingTexts: string[] = [];
      // Send one OpenAI delta.content chunk NOW. Lazily emits the role chunk
      // first, and marks hasEmittedText (= "a content chunk has been sent").
      const sendContentNow = (text: string) => {
        if (!roleEmitted) {
          // edge 10: role marker stays metadata-first, emitted before any text.
          roleEmitted = true;
          send(roleChunkLine(id, created, responseModel));
        }
        hasEmittedText = true;
        send(contentChunkLine(id, created, responseModel, text));
      };
      const emitContent = (text: string) => {
        if (!text) return; // edge 13: never emit an empty content chunk
        if (!gateOpen) {
          pendingTexts.push(text);
          return;
        }
        sendContentNow(text);
      };
      const openGate = () => {
        gateOpen = true;
        for (const t of pendingTexts.splice(0)) sendContentNow(t);
      };

      // Exclusive end index of the next boundary in `buf` (boundary char +
      // trailing whitespace), or -1 if none yet. When allowClause is true (only
      // for the very first chunk), a clause comma/semicolon/dash already
      // FIRST_CLAUSE_MIN chars in also counts — so the first audio starts a
      // clause sooner instead of waiting for the whole opening sentence.
      const FIRST_CLAUSE_MIN = 14;
      const nextBoundaryEnd = (buf: string, allowClause: boolean): number => {
        for (let i = 0; i < buf.length; i++) {
          const ch = buf[i];
          const next = buf[i + 1];
          // `।` (Devanagari danda) is unambiguous — always a boundary (edge 9).
          // `\n\n` (paragraph break) also triggers a flush.
          // `.` `?` `!` are boundaries ONLY when followed by whitespace, so a
          // decimal like "3.14" never splits (edge 8); a terminator at the very
          // end of the buffer waits for the next delta (or the final flush).
          const isSentence =
            (ch === "\n" && next === "\n") ||
            ch === "।" ||
            ((ch === "." || ch === "?" || ch === "!") &&
              next !== undefined &&
              /\s/.test(next as string));
          // First-chunk clause break (comma/semicolon/dash + whitespace), once
          // we already have a speakable opening of ≥ FIRST_CLAUSE_MIN chars.
          const isClause =
            allowClause &&
            i + 1 >= FIRST_CLAUSE_MIN &&
            (ch === "," || ch === ";" || ch === "—" || ch === "–") &&
            next !== undefined &&
            /\s/.test(next as string);
          if (!isSentence && !isClause) continue;
          let end = ch === "\n" ? i + 2 : i + 1; // include the boundary char(s)
          while (end < buf.length && /\s/.test(buf[end] as string)) end++; // edge 3
          return end;
        }
        return -1;
      };

      // (Phase 11.5's up-front helpline tool emission moved into the verdict
      // branch below — with speculative gating the safety flag is only known
      // once the gates resolve, and the tool chunk still precedes any content.)

      // Flush the buffer in TTS-friendly units (edge 1: one Anthropic delta may
      // contain several sentences), then apply the no-boundary safety cap.
      const flushSentences = () => {
        // First chunk: emit at the EARLIEST boundary (clause allowed) so the
        // first audio still starts as fast as before. Latency unchanged.
        if (!firstFlushDone) {
          const end = nextBoundaryEnd(sentenceBuffer, true);
          if (end !== -1) {
            emitContent(sentenceBuffer.slice(0, end)); // edge 2: a 1-char chunk is fine
            sentenceBuffer = sentenceBuffer.slice(end);
            firstFlushDone = true;
          }
        }
        // After the first chunk: group COMPLETE sentences until the group
        // reaches MIN_TTS_CHUNK chars, then emit the whole group as ONE chunk —
        // one stable prosody unit instead of a reset per sentence. A short
        // trailing sentence simply waits for the next delta (or the final
        // flush), which costs nothing audible: TTS is still speaking the
        // previous chunk.
        if (firstFlushDone) {
          for (;;) {
            let off = 0;
            let groupEnd = -1;
            for (;;) {
              const e = nextBoundaryEnd(sentenceBuffer.slice(off), false);
              if (e === -1) break;
              off += e;
              if (off >= MIN_TTS_CHUNK) {
                groupEnd = off;
                break;
              }
            }
            if (groupEnd === -1) break;
            emitContent(sentenceBuffer.slice(0, groupEnd));
            sentenceBuffer = sentenceBuffer.slice(groupEnd);
          }
        }
        // edge 4: no boundary but buffer too long — split at the last whitespace
        // within the first SENTENCE_CAP chars, else force-split at the cap.
        while (sentenceBuffer.length >= SENTENCE_CAP) {
          let splitAt = -1;
          for (let i = SENTENCE_CAP - 1; i >= 0; i--) {
            if (/\s/.test(sentenceBuffer[i] as string)) {
              splitAt = i + 1;
              break;
            }
          }
          if (splitAt <= 0) splitAt = SENTENCE_CAP;
          emitContent(sentenceBuffer.slice(0, splitAt));
          sentenceBuffer = sentenceBuffer.slice(splitAt);
          firstFlushDone = true;
        }
      };

      // Generation token: an ABANDONED speculative stream (flagged turn) must
      // never keep mutating sentenceBuffer while the restart streams. Each
      // runStream invocation carries its generation; stale handlers no-op.
      let generation = 0;
      // Initializer is cast (not bare null) so TS keeps the union type at the
      // verdict-branch use sites — the only assignments happen inside the
      // runStream closure, which control-flow narrowing can't see.
      let activeStream = null as { abort: () => void } | null;

      try {
        // Retry overload/5xx BEFORE first token only (after first token a retry
        // would prepend a second partial reply to the stream the SDK is reading).
        const runStream = async (
          parts: AssembledRequest,
          gen: number,
        ): Promise<Anthropic.Message> => {
          // Latency split: time spent on OUR pre-Sonnet work before this
          // Anthropic call. With speculative gating this no longer includes the
          // safety/moderation wait — compare with the gates-verdict log line.
          const preSonnetMs = Date.now() - turnStart;
          let lastErr: unknown;
          for (let attempt = 0; attempt <= MAX_OVERLOAD_RETRIES; attempt++) {
            // edge 12: discard any partial buffer (live retries only happen
            // before the first flush per the hasEmittedText guard; buffered
            // speculative partials are safe to drop wholesale).
            sentenceBuffer = "";
            pendingTexts.length = 0;
            firstFlushDone = false;
            const messageStream = client.messages.stream(
              {
                model: "claude-sonnet-4-6",
                max_tokens: VOICE_MAX_TOKENS, // override request's 5000
                temperature: VOICE_TEMPERATURE, // override request's 0.0
                system: parts.systemBlocks,
                messages: parts.builtMessages,
              },
              { signal: req.signal }, // edge case 10: propagate client abort
            );
            activeStream = messageStream;

            messageStream.on("text", (delta) => {
              if (!delta) return; // edge 6: ignore empty deltas (no buffer change)
              if (gen !== generation) return; // stale (abandoned) stream
              if (!firstTokenLogged) {
                firstTokenLogged = true;
                const ftMs = Date.now() - turnStart;
                console.log(
                  `[agent-llm] pre_sonnet_ms=${preSonnetMs} first_token_ms=${ftMs} sonnet_ttft_ms=${ftMs - preSonnetMs}`,
                );
              }
              // Buffer the delta and emit only at sentence boundaries so each
              // OpenAI chunk reaches ElevenLabs as one coherent TTS unit.
              sentenceBuffer += delta;
              flushSentences();
            });

            try {
              return await messageStream.finalMessage();
            } catch (err) {
              lastErr = err;
              // Abandoned on purpose (flagged turn) → bail quietly; the outer
              // .catch(() => {}) on the speculative promise swallows this.
              if (gen !== generation) throw err;
              // Abort → propagate (no retry, no persist). Already emitted text →
              // fatal. Non-overload (4xx) → fatal. Else back off + retry.
              if (req.signal.aborted || hasEmittedText) throw err;
              if (!isRetryableOverload(err)) throw err;
              if (attempt === MAX_OVERLOAD_RETRIES) throw err;
              const delay = OVERLOAD_BACKOFF_MS[attempt] ?? 2000;
              console.warn(
                `[agent-llm] anthropic overloaded — retry ${attempt + 1}/${MAX_OVERLOAD_RETRIES} after ${delay}ms`,
              );
              await new Promise((r) => setTimeout(r, delay));
            }
          }
          throw lastErr;
        };

        // ── Speculative run: Sonnet starts NOW with the flag-null prompt while
        // the safety/moderation verdict resolves; output buffers until openGate().
        const specParts = assembleRequest(null);
        let usedParts = specParts;
        const specPromise = runStream(specParts, generation);
        // Flagged paths abandon this promise — the noop .catch prevents an
        // unhandled rejection when the abort lands.
        specPromise.catch(() => {});

        const [safetyRes, moderationRes] = await gatesPromise;
        gateSafety = { flag: safetyRes.flag, confidence: safetyRes.confidence };
        console.log(
          `[agent-llm] gates verdict at ${Date.now() - turnStart}ms: safety=${safetyRes.flag} (${safetyMs}ms) moderation=${moderationRes.flag} (${moderationMs}ms)`,
        );
        const safetyFlag: SafetyFlag | null =
          safetyRes.flag !== "safe" && safetyRes.confidence > SAFETY_THRESHOLD
            ? (safetyRes.flag as SafetyFlag)
            : null;
        // Moderation gate — bypassed when safetyFlag is set: per Locked
        // Decision #7, self_harm / harm_others MUST reach Krishna for
        // compassionate Bhagavata mode.
        const moderationFlag: ModerationFlag | null =
          !safetyFlag &&
          moderationRes.flag !== "safe" &&
          moderationRes.confidence > MODERATION_THRESHOLD
            ? moderationRes.flag
            : null;

        let finalMsg: Anthropic.Message;

        if (moderationFlag) {
          // Abandon the speculative stream — its tokens are discarded UNSENT
          // (nothing passed the gate). Same wire shape as fixedReplyStream.
          generation++;
          try {
            activeStream?.abort();
          } catch {
            /* already finished */
          }
          if (isIdentified) {
            waitUntil(
              logSafetyEvent({
                userId,
                messageText: latestUserMessage,
                flag: moderationFlag,
                confidence: moderationRes.confidence,
                replyText: MODERATION_REPLY,
                versesReferenced: [],
              }).catch((e) =>
                console.error("[agent-llm] moderation logSafetyEvent failed:", e),
              ),
            );
          }
          send(roleChunkLine(id, created, responseModel));
          send(contentChunkLine(id, created, responseModel, MODERATION_REPLY));
          send(stopChunkLine(id, created, responseModel));
          if (includeUsage) {
            send(usageChunkLine(id, created, responseModel, 0, 0));
          }
          send(DONE_LINE);
          controller.close();
          return; // mirror the old short-circuit: no persistTurnState
        }

        if (safetyFlag) {
          // Distress turn: abandon the un-flagged speculative run and RESTART
          // with the SAFETY_FLAG persona steering — behavior identical to the
          // pre-speculative architecture; the restart cost lands only on turns
          // where presence matters far more than speed. Helpline tool first
          // (Phase 11.5 / edge A5.6), then Krishna's reply streams live.
          generation++;
          try {
            activeStream?.abort();
          } catch {
            /* already finished */
          }
          sentenceBuffer = "";
          pendingTexts.length = 0;
          firstFlushDone = false;
          if (!roleEmitted) {
            roleEmitted = true;
            send(roleChunkLine(id, created, responseModel));
          }
          send(
            toolCallChunkLine(
              id,
              created,
              responseModel,
              "call_" + randomUUID(),
              "show_helpline_card",
              JSON.stringify({ flag: safetyFlag, user_lang: conversationLang }),
            ),
          );
          gateOpen = true; // verdict landed — the restart streams live
          usedParts = assembleRequest(safetyFlag);
          finalMsg = await runStream(usedParts, generation);
        } else {
          // Clean turn (the overwhelmingly common path): open the gate — any
          // buffered chunks flush now, and emission is live from here on.
          openGate();
          finalMsg = await specPromise;
        }

        const u = finalMsg.usage;
        const promptTokens =
          (u.input_tokens ?? 0) +
          (u.cache_read_input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0);
        const completionTokens = u.output_tokens ?? 0;
        console.log(
          `[agent-llm] sonnet usage: input=${u.input_tokens ?? 0} ` +
            `cache_creation=${u.cache_creation_input_tokens ?? 0} ` +
            `cache_read=${u.cache_read_input_tokens ?? 0} ` +
            `output=${completionTokens} total_ms=${Date.now() - turnStart} ` +
            `(persona=${usedParts.personaLen}ch dynamic=${usedParts.dynamicLen}ch past_turns=${pastTurns.length})`,
        );

        const replyText =
          finalMsg.content.find((b) => b.type === "text")?.text ?? "";

        // Final flush — emit any remaining buffered text as the LAST content
        // chunk (e.g. a closing sentence whose terminator had no trailing space,
        // or a sub-sentence reply with no punctuation). edge 5/13: skip if the
        // remainder is empty or whitespace-only. Never drop trailing text.
        if (sentenceBuffer.trim().length > 0) {
          emitContent(sentenceBuffer);
        }
        sentenceBuffer = "";

        // Edge case 8: model produced zero text — emit role (unless a safety
        // turn already did) + one empty content chunk so the SDK sees a
        // well-formed (empty) reply, then stop.
        if (!hasEmittedText) {
          if (!roleEmitted) {
            roleEmitted = true;
            send(roleChunkLine(id, created, responseModel));
          }
          send(contentChunkLine(id, created, responseModel, ""));
        }

        send(stopChunkLine(id, created, responseModel));
        if (includeUsage) {
          send(usageChunkLine(id, created, responseModel, promptTokens, completionTokens));
        }
        send(DONE_LINE);
        controller.close();

        // Step 11: persist AFTER the stream closes. Not gated to the response.
        waitUntil(
          persistTurnState(replyText).catch((e) =>
            console.error("[agent-llm] deferred persistTurnState failed:", e),
          ),
        );
      } catch (e) {
        // Edge case 10: client aborted — close quietly, do NOT persist.
        if (req.signal.aborted) {
          console.log("[agent-llm] stream aborted by client; not persisting");
          try {
            controller.close();
          } catch {
            /* already closed */
          }
          return;
        }

        if (hasEmittedText || roleEmitted) {
          // Edge case 9: error AFTER a content chunk flushed, OR (edge A5.9) a
          // role + helpline tool_call were already emitted for a safety turn.
          // Either way an error frame now would be malformed — close gracefully
          // with a stop for whatever landed (the overlay still shows; Krishna's
          // reply may be empty). Emit a 0/0 usage chunk if asked.
          console.error("[agent-llm] anthropic errored after first chunk:", e);
          send(stopChunkLine(id, created, responseModel));
          if (includeUsage) {
            send(usageChunkLine(id, created, responseModel, 0, 0));
          }
          send(DONE_LINE);
        } else {
          // Error BEFORE first token (4xx, or overload retries exhausted). Emit
          // an OpenAI-shaped error frame (the canonical OpenAI streaming error
          // signal) then DONE. HTTP status is already 200 — headers were flushed
          // when the stream began — so the 502 is carried in the error body.
          console.error("[agent-llm] anthropic failed before first token:", e);
          send(errorFrameLine("upstream model error — please try again"));
          send(DONE_LINE);
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
