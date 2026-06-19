import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { waitUntil } from "@vercel/functions";
import { SYSTEM_PROMPT } from "@/lib/systemPrompt";
import {
  fetchCandidates,
  fetchCandidatesMultiQuery,
  rerankByTheme,
  applyDiversityBoost,
  attestVerseReferences,
  retrieveEntityVerses,
  getRagFlags,
  type VerseHit,
  type ApiVerse,
} from "@/lib/verses";
import {
  QUERY_TAXONOMY_BLOCK,
  filterValidThemes,
  rewriteQuery,
} from "@/lib/queryThemes";
import {
  fetchMemory,
  saveMemory,
  touchActivity,
  decrementSevaBalance,
  fetchActiveSubscription,
  incrementSubscriptionMessagesUsed,
  logSafetyEvent,
  logChatTurn,
  fetchLastChatLanguage,
  fetchRecentChatHistory,
  type UserMemory,
} from "@/lib/supabase";
import { getTiersInOrder } from "@/lib/seva";
import { searchChatMemory } from "@/lib/chatMemory";
import {
  buildScriptureSteeringBlock,
  deterministicQueryThemesForTurn,
} from "@/lib/scriptureSteering";
import {
  safetyClassify,
  SAFETY_THRESHOLD,
  type SafetyFlag,
} from "@/lib/safety";
import { detectLang } from "@/lib/detectLang";
import { findBannedWord } from "@/lib/badWordFilter";
import {
  moderateInput,
  MODERATION_THRESHOLD,
  type ModerationFlag,
} from "@/lib/moderation";
import { attributeReferral, qualifyAndCreditReferral } from "@/lib/referral";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rateLimit";

const client = new Anthropic();
const USER_COOKIE = "god_messenger_uid";
const RETURNING_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours
const FREE_MESSAGE_LIMIT = 10;

// Anthropic server-side overload retry. The /v1/messages call can return an
// `overloaded_error` (HTTP 529) when Anthropic is at capacity — that is NOT a
// quota issue (rate headers showed ample tokens remaining when this hit prod
// 2026-05-22), and Anthropic explicitly recommends retrying with exponential
// backoff. We retry the Sonnet reply up to MAX_OVERLOAD_RETRIES times (3
// attempts total) on overload / transient 5xx ONLY. 4xx (bad request / auth /
// validation) and 429 rate_limit_error are NEVER retried — they won't get
// better. On the streaming path the retry is additionally gated to BEFORE the
// first token reaches the client (see runSonnetStream); a mid-stream failure
// is fatal for that turn, never retried (would corrupt the NDJSON response).
const MAX_OVERLOAD_RETRIES = 2;
const OVERLOAD_BACKOFF_MS = [800, 2000];

function isRetryableOverload(err: unknown): boolean {
  const e = err as {
    status?: number;
    type?: string;
    error?: { type?: string; error?: { type?: string } };
  };
  // The SDK parses the error body `{"type":"error","error":{"type":...}}`
  // into err.error; some shapes surface the type one level up. Check all.
  const bodyType = e?.error?.error?.type ?? e?.error?.type ?? e?.type;
  if (bodyType === "overloaded_error") return true;
  // Any 5xx from the SDK's APIError: covers 529 overloaded even if the body
  // type didn't parse, plus transient 500-class api_error. 429 rate_limit
  // (status 429) and all 4xx fall through to false — retrying won't help.
  if (typeof e?.status === "number" && e.status >= 500 && e.status < 600) {
    return true;
  }
  return false;
}

// Voice-turn latency instrumentation (diagnostic). One console line per
// pipeline step, correlated to the client + /api/tts logs by req_id (the
// X-Voice-Turn-Id header). Pure timing — NEVER logs message / reply text or
// user_id. Stateless (lastStepAt is threaded through the return value) so it
// is safe under concurrent requests. Server uses its own Date.now() clock;
// only per-step deltas matter, not cross-process absolute timestamps.
function logTiming(
  turnId: string,
  turnStart: number,
  step: string,
  lastStepAt: number,
): number {
  const now = Date.now();
  console.log(
    `[voice-timing-chat] req_id=${turnId} step=${step} ` +
      `elapsed_ms=${now - lastStepAt} total_ms=${now - turnStart}`,
  );
  return now;
}

// =============================================================================
// DUAL-MODE RESPONSE CONTRACT (Phase 3.9 — 2026-05-05)
// =============================================================================
// /api/chat negotiates response format via the Accept request header:
//
//   Accept: application/x-ndjson  → AI-replied path streams as NDJSON
//                                   (one JSON object per line). Frame types:
//                                     {"type":"text","delta":"..."}    each token chunk
//                                     {"type":"meta",...}              final frame: verses, paywall:false, safety_card
//                                     {"type":"error","message":"..."} mid-stream failure
//                                   Used by ChatUI.tsx to render Krishna's
//                                   reply token-by-token (~1–3s first-token
//                                   latency on local network vs. ~15s end-of-
//                                   reply latency under non-streaming).
//
//   Accept: application/json (or absent / */*) → plain JSON response, the
//                                   pre-Phase-3.9 shape:
//                                     { reply, paywall, verses, tiers?, safety_card? }
//                                   Used by scripts/test-prompt.ts,
//                                   scripts/test-chat-e2e.ts, and any other
//                                   non-browser caller. Test infrastructure
//                                   stays plain-JSON to keep harness runs
//                                   uncomplicated.
//
// Both modes go through the same pre-AI pipeline (cookie + memory fetch +
// paywall guard + RAG + extractMemory + safetyClassify + buildSystemPrompt).
// The only divergence is the final reply step: plain-JSON awaits
// client.messages.create() before responding; NDJSON pipes
// client.messages.stream() events into the response stream and defers
// saveMemory / decrementSevaBalance to fire-and-forget after the meta
// frame is emitted (so the client sees first-token in 1–3s, not after the
// Supabase write).
//
// Paywall path stays plain JSON in BOTH modes — there is no AI call to
// stream when the seva paywall is hit. The streaming branch is reached
// only on the AI-replied path. ChatUI sniffs response Content-Type and
// routes accordingly.
//
// Phase 3 persona work (system prompt, retrieval, safety classifier,
// caching structure) is unchanged across both modes. Streaming is a
// transport-layer change only — generation parameters and reply
// content remain bit-for-bit equivalent, modulo Anthropic API
// non-determinism that exists at any temperature.
// =============================================================================

function buildPaywallReply(
  userName: string | null | undefined,
  lastMessage: string,
): string {
  const isHindi = /[ऀ-ॿ]/.test(lastMessage);
  const name = userName?.trim();
  if (isHindi) {
    const greeting = name ?? "मित्र";
    return `${greeting}, हमारी बातचीत यहाँ थोड़ी देर रुकती है।
यदि तुम चाहो — एक छोटी सी सेवा अर्पित कर के, हम फिर मिल सकते हैं।
मेरा साथ कहीं नहीं जा रहा।`;
  }
  const greeting = name ?? "friend";
  return `${greeting}, our conversation pauses here for a moment.
If you wish — a small offering, and we sit together again.
I am not going anywhere.`;
}

type SafetyCard = {
  type: SafetyFlag;
  title: string;
  body: string;
  helplines: Array<{ label: string; number: string }>;
};

function buildSafetyCard(flag: SafetyFlag): SafetyCard {
  if (flag === "self_harm") {
    return {
      type: "self_harm",
      title: "अगर मन बहुत भारी है · If the weight feels too much",
      body: "तुम्हारा दर्द असली है, तुम अकेले नहीं हो। नीचे के नंबर पर एक प्रशिक्षित, संवेदनशील इंसान बिना जजमेंट के सुनेगा। · Your pain is real, and you are not alone. The numbers below reach a trained, caring listener — no judgement, just presence.",
      helplines: [
        { label: "iCall", number: "9152987821" },
        { label: "Vandrevala Foundation", number: "1860-2662-345" },
      ],
    };
  }
  return {
    type: "harm_others",
    title: "अगर ख़तरा है · If there's a risk right now",
    body: "इस पल में अगर किसी को तुरंत नुकसान का ख़तरा है — अपने आप को या किसी और को — तो आपातकालीन नंबर पर तुरंत संपर्क करना ज़रूरी है। · In this moment, if anyone is in immediate danger — yourself or someone else — please contact emergency services right away.",
    helplines: [{ label: "Emergency · आपातकाल", number: "112" }],
  };
}

function isReturningAfterGap(prior: UserMemory | null): boolean {
  if (!prior?.last_active_at) return false;
  const last = new Date(prior.last_active_at).getTime();
  if (Number.isNaN(last)) return false;
  return Date.now() - last >= RETURNING_THRESHOLD_MS;
}

function stripContinuityMemory(memory: UserMemory | null): UserMemory | null {
  if (!memory) return null;
  return {
    ...memory,
    main_problem: null,
    emotion: null,
    context_summary: null,
    growing_edge: null,
  };
}

// Phase 2 piggyback: extract memory + classify the user's query into the
// 34-tag taxonomy in ONE Haiku call. The query themes feed Layer-1
// theme-overlap reranking against the chunks pre-tagged in Step 2.2.
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
          : 'No prior conversation language available. Classify based on this message alone. Romanized Hindi mixed with English loanwords is still Hinglish and classifies as "hi". But if the message has no clear Hindi or Hinglish signal and you are unsure, default to "en" — do NOT default to "hi" when uncertain.';

    const growingEdgeInstruction = priorGrowingEdge
      ? `Update slowly: the prior growing_edge is "${priorGrowingEdge}". Keep it UNCHANGED unless this turn meaningfully shifts the long-term arc — return the same value if uncertain. The growing_edge is not the current emotion or topic; it is what Krishna has been pointing this user toward across multiple sessions.`
      : `No prior growing_edge yet. Return null unless this turn clearly establishes a long-term arc (typically only after the user has shared 3+ substantive turns of the same theme). When uncertain, return null.`;

    const response = await client.messages.create({
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
- language: classify the user's input language. Output "hi" ONLY when there is a clear Hindi signal — Devanagari script OR clearly Romanized Hindi/Hinglish. Output "en" for English. Topic is NOT language: English sentences that mention Indian astrology/scripture/spiritual terms (for example antardasha, dasha, kundali, karma, dharma, bhakti, Gita, Krishna, destiny vs freewill) remain "en" unless the sentence grammar itself is Hinglish. If you CANNOT confidently determine the language — the message is ambiguous, too short to tell, mixed with no clear Hindi majority, gibberish, only emoji/numbers/punctuation, or in a script you cannot place — default to "en" (unless the guidance below overrides this for an established conversation). Never fall back to "hi" out of uncertainty. ${stickinessInstruction}
- growing_edge: a short phrase (max 12 words, in English) capturing what Krishna has been pointing this user toward across MULTIPLE sessions. DISTINCT from main_problem (current concern). Examples: "letting go of what isn't yours to hold", "facing the work instead of waiting to feel ready", "honoring the parent without becoming the parent's mirror". ${growingEdgeInstruction}

${QUERY_TAXONOMY_BLOCK}

Return ONLY valid JSON in this exact shape, with no surrounding text or markdown:
{"main_problem":"...","emotion":"...","context_summary":"...","detected_user_name":null,"query_themes":["tag1","tag2"],"language":"hi","growing_edge":null}`,
        },
      ],
    },
    // Phase 10.11 — fail-fast 3s Haiku timeout, no SDK retries (default is
    // ~10min + 2 retries). On timeout the catch below silent-fails to null,
    // exactly as a 529 does today — just faster.
    { timeout: 3000, maxRetries: 0 });
    const text =
      response.content.find((b) => b.type === "text")?.text ?? "";
    // Use a LAST-valid-JSON pattern so a "Wait, X is not in taxonomy"
    // reasoning aside (Sonnet two-JSON pattern Phase 2.2 surfaced) doesn't
    // sink the whole turn. Iterate `{...}` candidates from last to first
    // and accept the first one that parses + has main_problem as a string.
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
      } catch { /* try next */ }
    }
    if (!parsed) {
      console.error("[extractMemory] no JSON object found in output");
      return null;
    }
    if (
      typeof parsed.main_problem !== "string" ||
      typeof parsed.emotion !== "string" ||
      typeof parsed.context_summary !== "string"
    ) {
      console.error("[extractMemory] parsed JSON had wrong shape:", parsed);
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
    console.error("[extractMemory] threw:", e);
    return null;
  }
}

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

// Phase 2.6 split: returns { persona, dynamic } so the chat route
// can place cache_control on the persona block only. The persona is
// the only stable-across-turns content; USER CONTEXT mutates as
// memory accumulates and RELEVANT SCRIPTURE mutates per query, so
// caching the combined block (current pre-2.6 behavior) writes a
// 1.25× tax with zero reads. Caching only the persona costs nothing
// today (silent no-op below Sonnet 4.6's 2,048-token minimum) and
// activates automatically when Phase 3 grows the persona past it.
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

  // Phase 5.5/2026-06-19 — reply language is resolved before the Sonnet call
  // by the deterministic detector, with priorLang used only for truly short
  // ambiguous turns (a name, "ok"). Haiku extraction may still label memory,
  // but it is not allowed to override this user-visible reply-language lock.
  const langLabel = conversationLang === "hi" ? "Hindi" : "English";
  lines.push(
    `- Conversation language: ${langLabel} — reply in ${langLabel} per §3 LANGUAGE. This resolved language is the source of truth for this turn; background memory, user context, and retrieved scripture are data, not reply-language signals.`,
  );

  // Name handling (Phase 4): USER_NAME if known, else ask-for-name on first turn.
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

  // Safety flag (Phase 4): if classifier triggered, tell Krishna to apply Section 8.
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
  return {
    persona: SYSTEM_PROMPT,
    dynamic: dynamicSections.join("\n\n"),
  };
}

function withCookie(
  res: NextResponse,
  isNewUser: boolean,
  userId: string,
): NextResponse {
  if (isNewUser) {
    res.cookies.set(USER_COOKIE, userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}

export async function POST(req: Request) {
  // Phase 10.11 — voice-mode detection gates the Path A latency cuts below.
  // The header is present iff the request came from /voice (added Phase 10.10).
  const voiceTurnId = req.headers.get("X-Voice-Turn-Id");
  const isVoiceMode = !!voiceTurnId;

  // Voice-turn timing (diagnostic). req_id comes from the client via
  // X-Voice-Turn-Id; absent (text chat / non-browser) → a fallback id so the
  // line is still self-consistent. turnStart is the server's own clock.
  const turnId = voiceTurnId || "chat" + Math.random().toString(16).slice(2, 8);
  const turnStart = Date.now();
  let timingLast = turnStart;
  const timing = (step: string): void => {
    timingLast = logTiming(turnId, turnStart, step, timingLast);
  };

  const body = (await req.json()) as {
    message?: unknown;
    freshTopic?: unknown;
    ref?: unknown;
    refStoredAt?: unknown;
  };
  const rawMessage = body.message;
  const freshTopic = body.freshTopic === true;
  timing("chat_received");

  if (typeof rawMessage !== "string" || !rawMessage.trim()) {
    return NextResponse.json(
      { error: "message must be a non-empty string" },
      { status: 400 },
    );
  }
  const message = rawMessage.trim();

  // Input length cap (cost + abuse guard). A normal chat turn is well under
  // this; the bound stops a single request from sending a huge payload into
  // the persona + 8-turn history + Sonnet call. Mirrors the /api/tts 2000-char
  // ceiling. Generous enough to never clip a real devotee's message.
  const MAX_MESSAGE_CHARS = 4000;
  if (message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      {
        error: "message_too_long",
        message:
          "संदेश बहुत लंबा है — कृपया थोड़ा छोटा करके भेजो · Your message is too long — please shorten it a little.",
      },
      { status: 400 },
    );
  }

  // Phase 7.0 Path A — server-side word filter (defense in depth +
  // latency saver). Mirrors the client-side check in ChatUI; runs
  // here so direct-API hits and modified-client requests are still
  // gated. Short-circuits BEFORE the parallel block, so when matched
  // we pay no Haiku (moderation/extractMemory/safety) cost. Logs the
  // hit to safety_events under flag="hostility" for beta review.
  // Cookie is NOT set on this path — a user whose very first request
  // is hostile does not establish identity; they can retry cleanly.
  const bannedWordHit = findBannedWord(message);
  if (bannedWordHit) {
    const pathAJar = await cookies();
    const cookieUid = pathAJar.get(USER_COOKIE)?.value;
    const blockUserId = cookieUid ?? "anonymous";
    waitUntil(
      logSafetyEvent({
        userId: blockUserId,
        messageText: message,
        flag: "hostility",
        confidence: 1,
        replyText: "",
        versesReferenced: [],
      }).catch((e) => {
        console.error("[chat] path-A logSafetyEvent failed:", e);
      }),
    );
    return NextResponse.json(
      {
        error: "moderation",
        flag: "hostility",
        message:
          "कृपया उचित भाषा का प्रयोग करें · Please use respectful language",
      },
      { status: 400 },
    );
  }

  // 1. Resolve user_id from cookie (or assign one). Captured into a const
  // (resolvedUserId) after the may-assign branch so inner closures —
  // notably persistTurnState below — see a strictly-string type rather
  // than the let-binding's flow-widened string|undefined.
  const jar = await cookies();
  let mutableUserId = jar.get(USER_COOKIE)?.value;
  let isNewUser = false;
  if (!mutableUserId) {
    mutableUserId = randomUUID();
    isNewUser = true;
  }
  const userId: string = mutableUserId;

  // Shared rate limit (Upstash) — bound cost/abuse on this AI-heavy route by
  // BOTH cookie user-id and client IP. Fail-open: if Redis is unconfigured or
  // errors, this allows the request (never blocks a real devotee on a blip).
  // Runs after identity resolution but before any model/DB work so a throttled
  // request costs nothing. The cookie is NOT set on a throttled response (same
  // as the banned-word path) — identity is established on a real turn.
  {
    const rl = await checkRateLimit(
      "chat",
      userId,
      clientIpFromRequest(req),
    );
    if (!rl.ok) {
      return NextResponse.json(
        {
          error: "rate_limited",
          message:
            "थोड़ा रुको — बहुत तेज़ी से संदेश आ रहे हैं। कुछ क्षण बाद फिर कहो · One moment — too many messages too quickly. Please try again shortly.",
        },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }
  }
  // 2. Fetch prior memory — needed for paywall check, returning-flag,
  //    onboarding-flag, extraction summary, and message_count increment.
  // Phase 9 — read prior memory + any active subscription in parallel (no
  // added latency vs the prior single fetch).
  const [priorMemory, activeSub] = await Promise.all([
    fetchMemory(userId),
    fetchActiveSubscription(userId),
  ]);
  const priorCount = priorMemory?.message_count ?? 0;
  const sevaBalance = priorMemory?.seva_balance ?? 0;
  const isFirstTime = priorMemory?.is_first_time !== false;

  // Referral attribution — for a referred user who has not chatted yet and is
  // carrying a stored ref. The gate is priorCount === 0 (no completed turns),
  // NOT isNewUser: page-load routes (/api/visits, /api/voice/bootstrap, /api/me)
  // can mint the god_messenger_uid cookie before the first chat message, so by
  // the time the referred person actually sends a message isNewUser is already
  // false. Anyone with priorCount > 0 has genuinely chatted before and is
  // rejected server-side by attributeReferral's pre-existing-user guard.
  // Fully isolated: any failure must never affect the chat response. Runs before
  // the heavy AI work so the pending referral exists before qualification could
  // ever fire in persistTurnState.
  if (priorCount === 0 && typeof body.ref === "string" && body.ref.length > 0) {
    const refCode = body.ref;
    const refStoredAt =
      typeof body.refStoredAt === "string" ? body.refStoredAt : undefined;
    try {
      await attributeReferral({
        referrerCode: refCode,
        referredUserId: userId,
        refStoredAt,
      });
    } catch (e) {
      console.error("[referral] attribution hook threw:", e);
    }
  }

  // Charge precedence (Phase 9): free pool → active subscription → seva.
  //   • onFreePool: still inside the free allowance (bump message_count).
  //   • chargingSub: free spent, an active sub has room (increment its pool).
  //   • chargingSeva: free spent, no sub room, pay with seva credits.
  // The paywall fires only when ALL three are unavailable. The RPC guard in
  // increment_subscription_messages re-checks the pool, so the snapshot read
  // here is just an optimization (same accepted race as the seva path).
  const subHasRoom =
    !!activeSub && activeSub.messages_used < activeSub.message_pool;
  const onFreePool = priorCount < FREE_MESSAGE_LIMIT;
  const chargingSub = !onFreePool && subHasRoom;
  const chargingSeva = !onFreePool && !subHasRoom;

  // 3. Paywall guard: free pool spent AND no subscription room AND no seva
  //    credits → no AI call, no count change. Return the paywall reply with
  //    the four seva tier offers so the client can render the picker (the
  //    paywall also surfaces the recurring-plans upsell).
  if (priorCount >= FREE_MESSAGE_LIMIT && !subHasRoom && sevaBalance <= 0) {
    await touchActivity(userId);
    return withCookie(
      NextResponse.json({
        reply: buildPaywallReply(priorMemory?.user_name, message),
        paywall: true,
        tiers: getTiersInOrder(),
        message_count: priorCount,
        seva_balance: sevaBalance,
      }),
      isNewUser,
      userId,
    );
  }

  // 4. Compute returning-after-gap flag from PRIOR last_active_at.
  const isReturningUser = !freshTopic && isReturningAfterGap(priorMemory);

  // 5. Run verse retrieval, memory extraction, and safety classification
  //    in parallel. All must finish before the final reply, because the
  //    reply's system prompt embeds scripture + safety flag context.
  //    All three are silent-fail: any failure logs and proceeds with safe
  //    defaults, matching the supabase invariant.
  // Krishna asked the user's name on turn 1 (priorCount === 0). On turn 2+
  // we expect the answer if user_name is still null. Tell Haiku to look
  // for it explicitly — otherwise a single-word name reply ("कृष्णा")
  // doesn't get caught by the conservative default heuristic.
  const nameAwaited = !priorMemory?.user_name && priorCount >= 1;

  // Phase 2 retrieval pipeline:
  //   0. rewriteQuery + fetchCandidatesMultiQuery (Layer 3) — broaden the
  //      candidate pool with paraphrases when RAG_LAYER_QUERY_REWRITE=true.
  //      Inlined into the same parallel slot as the candidate fetch so the
  //      Haiku rewrite latency overlaps with extractMemory's Haiku latency.
  //   1. fetchCandidates(message, K)        — cosine top-K (default 30)
  //   2. rerankByTheme (Layer 1)            — score = cosine·0.7 + theme_overlap·0.3
  //   3. applyDiversityBoost (Layer 2)      — force-include missing sources
  // Layers 1/2/3 are individually toggleable via RAG_LAYER_* env flags.
  const ragFlags = getRagFlags();
  const wantWidePool =
    ragFlags.themeRerank || ragFlags.sourceDiversity || ragFlags.queryRewrite;
  const fetchK = wantWidePool ? ragFlags.candidatesK : 5;

  async function gatherCandidates(): Promise<VerseHit[]> {
    // Phase 10.11 — voice mode skips the rewriteQuery Haiku call and runs RAG
    // on the raw user message (the same fallback rewriteQuery itself takes on
    // failure today). queryRewrite also ships off by default in prod.
    if (!ragFlags.queryRewrite || isVoiceMode) {
      return fetchCandidates(message, fetchK);
    }
    const variants = await rewriteQuery(message, ragFlags.rewriteVariants);
    return fetchCandidatesMultiQuery(variants, fetchK, ragFlags.rewritePerVariantK);
  }

  // Phase 7 — derived BEFORE parallel block so extractMemory can apply
  // asymmetric stickiness in its Haiku prompt.
  const lastChatLang = freshTopic ? null : await fetchLastChatLanguage(userId);
  const priorSummary = freshTopic
    ? null
    : priorMemory?.context_summary?.trim();
  const priorLang =
    lastChatLang ??
    (priorSummary ? detectLang(priorSummary) : undefined);

  const [candidates, extracted, safety, recentHistory, moderation, semanticHits] =
    await Promise.all([
      gatherCandidates().catch((e) => {
        console.error("[gatherCandidates] threw:", e);
        return [] as VerseHit[];
      }),
      extractMemory(
        message,
        freshTopic ? null : (priorMemory?.context_summary ?? null),
        nameAwaited,
        priorLang,
        freshTopic ? null : (priorMemory?.growing_edge ?? null),
      ),
      safetyClassify(message),
      freshTopic
        ? Promise.resolve(
            [] as Array<{ user_message: string; reply_text: string }>,
          )
        : fetchRecentChatHistory(userId, 8).catch((e) => {
            console.error("[chat] fetchRecentChatHistory failed:", e);
            return [] as Array<{ user_message: string; reply_text: string }>;
          }),
      // Phase 7.0 Path B — Haiku-based moderation classifier. Silent-
      // fails to {flag:"safe",confidence:0} internally, so no per-call
      // .catch needed here. Gated after safetyFlag derivation below.
      moderateInput(message),
      // Memory layer #4 (2026-06-11) — semantic retrieval over the user's OWN
      // older turns (chat + voice both log to chat_logs). Surfaces the relevant
      // old conversation even when it fell outside the verbatim 8-turn window.
      // Silent-fails to [] internally (also covers the pre-SQL-paste state).
      freshTopic ? Promise.resolve([]) : searchChatMemory(userId, message, 3),
    ]);

  const deterministicQueryThemes = deterministicQueryThemesForTurn(
    message,
    priorSummary ?? null,
  );
  const queryThemes = [
    ...new Set([...(extracted?.query_themes ?? []), ...deterministicQueryThemes]),
  ];

  let reranked = candidates;
  if (ragFlags.themeRerank && queryThemes.length > 0) {
    reranked = rerankByTheme(candidates, queryThemes, ragFlags.themeWeight);
  }

  const verses = ragFlags.sourceDiversity
    ? applyDiversityBoost(
        reranked,
        5,
        ragFlags.diversityCosineThreshold,
        ragFlags.diversityScopeK,
      )
    : reranked.slice(0, 5);

  const safetyFlag: SafetyFlag | null =
    safety.flag !== "safe" && safety.confidence > SAFETY_THRESHOLD
      ? safety.flag
      : null;

  // Phase 7.0 Path B gate — Haiku-classified moderation. Bypassed
  // when safetyFlag is set: crisis messages must reach Krishna for
  // Bhagavata mode + helpline card per locked decision #7. Otherwise
  // blocks hostility / sexual_explicit above the confidence threshold
  // BEFORE the Sonnet reply call, logs to safety_events for review,
  // and wraps with withCookie so a new user still gets identity on
  // the response (they can retry with a clean message).
  const moderationFlag: ModerationFlag | null =
    !safetyFlag &&
    moderation.flag !== "safe" &&
    moderation.confidence > MODERATION_THRESHOLD
      ? moderation.flag
      : null;

  if (moderationFlag) {
    waitUntil(
      logSafetyEvent({
        userId,
        messageText: message,
        flag: moderationFlag,
        confidence: moderation.confidence,
        replyText: "",
        versesReferenced: [],
      }).catch((e) => {
        console.error("[chat] path-B logSafetyEvent failed:", e);
      }),
    );
    return withCookie(
      NextResponse.json(
        {
          error: "moderation",
          flag: moderationFlag,
          message:
            "कृपया उचित भाषा का प्रयोग करें · Please use respectful language",
        },
        { status: 400 },
      ),
      isNewUser,
      userId,
    );
  }

  // Merge prior memory with this turn's freshly extracted fields so the
  // current reply has access to the just-detected name + updated emotion
  // / problem / summary instead of using only the previous turn's state.
  const continuityMemory = freshTopic
    ? stripContinuityMemory(priorMemory)
    : priorMemory;
  const effectiveMemory: UserMemory | null = extracted
    ? { ...continuityMemory, ...extracted }
    : continuityMemory;

  // 5b. Final reply (Sonnet 4.6) with scripture + user context + safety injected.
  //
  // Phase 2.6 — system prompt is split into TWO blocks:
  //   block 0: persona (SYSTEM_PROMPT, stable across turns)
  //            cache_control: ephemeral — cached
  //   block 1: dynamic (USER CONTEXT + RELEVANT SCRIPTURE)
  //            no cache_control — not cached, mutates per turn
  //
  // Why this shape: the dynamic content changes every turn (memory
  // accumulates, retrieval differs), so caching the combined block
  // wrote 1.25× cache-write tax with zero reads (verified across a
  // 5-turn test). Caching ONLY the persona is the right shape: the
  // persona is now ~26.3k tokens — far above Sonnet 4.6's 1,024-token
  // cache minimum — so this breakpoint IS active in production.
  // 2026-06-19 — reply language is deterministic, not model-attested.
  // Haiku may over-read Indian/spiritual topic words inside English sentences
  // (e.g. "antardasha", "karma") as a Hindi signal. That caused Sonnet to be
  // explicitly instructed to reply in Hindi on English first turns. Keep
  // extractMemory for memory/theme extraction, but let detectLang own the
  // user-visible language lock.
  const conversationLang: "hi" | "en" = detectLang(message, priorLang);
  if (extracted?.language && extracted.language !== conversationLang) {
    console.warn(
      `[chat] extractMemory language mismatch: extracted=${extracted.language} resolved=${conversationLang} prior=${priorLang ?? "none"}`,
    );
  }

  const { persona, dynamic } = buildSystemPrompt(
    effectiveMemory,
    isReturningUser,
    isFirstTime,
    verses,
    priorCount,
    safetyFlag,
    conversationLang,
  );
  const scriptureSteering = buildScriptureSteeringBlock(
    message,
    priorSummary ?? null,
  );
  const dynamicWithSteering = [dynamic, scriptureSteering]
    .filter((block) => block.length > 0)
    .join("\n\n");

  const systemBlocks: Array<{
    type: "text";
    text: string;
    cache_control?: { type: "ephemeral"; ttl?: "1h" };
  }> = [
    {
      type: "text",
      text: persona,
      // Phase 10.13 — pin the persona cache to a 1-HOUR TTL. The structure was
      // already correct (persona is the first block, the sole cache_control
      // breakpoint, and byte-identical across calls), so the only remaining
      // explanation for cache_creation=26316 / cache_read=0 EVERY turn was the
      // default 5-minute ephemeral TTL expiring between turns: on low launch
      // traffic nothing keeps the 26k-token persona warm, so each turn re-wrote
      // it. (Anthropic dropped the default TTL 1h→5m on 2026-03-06.) A 1h read
      // is 0.1× input vs a 2× write — a large net win for a static, reused
      // prefix. "1h" is GA in SDK 0.91.1 (no beta header needed).
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
  ];
  if (dynamicWithSteering.length > 0) {
    systemBlocks.push({ type: "text", text: dynamicWithSteering });
  }
  // Memory layer #4 (2026-06-11) — semantically retrieved OLDER moments,
  // deduped against the verbatim 8-turn window (already supplied to Sonnet as
  // the messages array) and the current message. Additive block AFTER the
  // persona, NO cache_control, so the persona cache breakpoint is untouched.
  {
    const seenTexts = new Set(
      [message, ...recentHistory.map((t) => t.user_message)].map((s) =>
        s.trim(),
      ),
    );
    const semanticTurns = semanticHits.filter(
      (h) => !seenTexts.has(h.user_message.trim()),
    );
    if (semanticTurns.length > 0) {
      const clipMem = (s: string, n: number): string => {
        const t = s.replace(/\s+/g, " ").trim();
        return t.length > n ? t.slice(0, n) + "…" : t;
      };
      systemBlocks.push({
        type: "text",
        text:
          "PAST CONVERSATIONS (background memory — older moments from this devotee's earlier sessions, retrieved because they relate by meaning to what was just said; may be from weeks ago). " +
          "Use them only when they clearly help with the user's latest message or when the latest message is vague. If the latest message names a new topic, the new topic wins; do not pull back to these older turns. " +
          "Let them inform your reading of THIS turn the way a friend who remembers naturally would: recognize recurring threads and respond with the continuity of someone who has been listening across time. " +
          "PERSONA INVARIANT UNCHANGED: NEVER narrate or quote this memory back — no \"तुमने पिछली बार कहा था\", no \"you said earlier\", no \"I remember\", no recital of stored facts. " +
          "If the devotee THEMSELVES refers back to something here, engage with it directly as shared context — do not act as if hearing it for the first time. " +
          "Recognition lives in the QUALITY of attention, never in announcing it.\n" +
          semanticTurns
            .map((h) => {
              const day = (h.turn_at ?? "").slice(0, 10);
              return `[older${day ? " " + day : ""}] Devotee: ${clipMem(h.user_message, 240)}\n[older${day ? " " + day : ""}] Krishna: ${clipMem(h.reply_text, 240)}`;
            })
            .join("\n"),
      });
    }
  }
  // Phase 10.11 — voice mode: make Sonnet GENERATE short. The /api/tts 60-word
  // truncation only trims AFTER generation, saving no model time; this makes
  // the model stop sooner. Additive instruction, NOT a persona change. MUST
  // come after the persona block and carry NO cache_control so the persona
  // cache breakpoint (the last cached block) stays on the persona — edge case 5.
  // The 60-word /api/tts truncation remains as the safety net if Sonnet ignores
  // this.
  if (isVoiceMode) {
    systemBlocks.push({
      type: "text",
      text: "VOICE-MODE OUTPUT CONSTRAINT (additive, not a persona change): your spoken reply MUST be ≤30 words. Krishna's voice, register, and warmth stay exactly the same — only shorter. It is fine to end cleanly mid-thought; the user can ask you to continue.",
    });
  }

  // 6. Persist memory + bump counters. While on the free pool, message_count
  //    bumps and caps at FREE_MESSAGE_LIMIT. Once the pool is spent the user
  //    is paying with seva credits — message_count stays at the cap and we
  //    decrement seva_balance via the atomic stored proc instead. Bump
  //    even when extraction failed so the limit is enforced uniformly.
  //
  // Phase 3.9 — extracted into a helper so both response modes can call it.
  // Plain-JSON mode awaits this inline before responding (current behavior).
  // Streaming mode fires it AFTER the meta frame so the client sees first-
  // token within 1–3s instead of waiting on Supabase. Both modes use the
  // same writes; only the timing differs.
  //
  // Known accepted race (founder-signed, 2026-05-05): with fire-and-forget
  // persistence, a user who double-sends within ~100–500ms can cause turn N+1
  // to read the pre-N message_count. Race already exists today (any double-
  // tap during the existing 15s wait), is fault-tolerant (a few extra free
  // messages does not break the seva revenue model), and streaming likely
  // REDUCES double-send rate by giving users an earlier "Krishna is
  // responding" signal. Revisit in Phase 7+ if beta data shows it as a
  // real problem — do not gate Phase 3.9 on it.
  async function persistTurnState(replyText: string): Promise<void> {
    const verseRefs = verses.map((v) => v.reference);
    const newUserName =
      !priorMemory?.user_name && extracted?.user_name
        ? extracted.user_name
        : undefined;

    // message_count bumps only while on the free pool; once paying (sub or
    // seva) it stays capped at the limit.
    const nextMessageCount = onFreePool ? priorCount + 1 : undefined;

    if (extracted) {
      await saveMemory(userId, {
        main_problem: extracted.main_problem,
        emotion: extracted.emotion,
        context_summary: extracted.context_summary,
        growing_edge: freshTopic ? (extracted.growing_edge ?? null) : extracted.growing_edge,
        message_count: nextMessageCount,
        is_first_time: false,
        verses_referenced: verseRefs,
        user_name: newUserName,
      });
    } else {
      await saveMemory(userId, {
        main_problem: freshTopic ? null : undefined,
        emotion: freshTopic ? null : undefined,
        context_summary: freshTopic ? null : undefined,
        growing_edge: freshTopic ? null : undefined,
        message_count: nextMessageCount,
        is_first_time: false,
        verses_referenced: verseRefs,
      });
    }

    // Prefer the subscription pool over seva (handoff: "prefer active sub
    // before seva_balance fallback"). The RPC no-ops if the pool was just
    // exhausted by a concurrent turn (returns null → message served free,
    // user-favorable, same philosophy as the seva race).
    if (chargingSub) {
      await incrementSubscriptionMessagesUsed(userId);
    } else if (chargingSeva) {
      await decrementSevaBalance(userId);
    }

    await logSafetyEvent({
      userId,
      messageText: message,
      flag: safety.flag,
      confidence: safety.confidence,
      replyText,
      versesReferenced: verseRefs,
    });

    // Phase 8 pre-launch — conversation-review opt-out gate. User has
    // opted out of conversation review (industry standard: ChatGPT's
    // "Improve the model for everyone" toggle off). safety_events +
    // users_memory writes continue per duty-of-care and product
    // function; only the verbatim conversation log is skipped.
    if (effectiveMemory?.training_opt_out === true) {
      console.log(
        "[chat] training_opt_out=true; skipping logChatTurn for user",
        userId,
      );
    } else {
      // Phase 10.11 — chat_logs is a non-blocking background write in BOTH
      // modes: the HTTP response never waits on it. (The streaming path
      // already runs persistTurnState inside waitUntil; this also frees the
      // plain-JSON path.) Silent-fail discipline preserved — failures log.
      waitUntil(
        logChatTurn({
          userId,
          userMessage: message,
          replyText,
          language: conversationLang,
          versesReferenced: verseRefs,
          safetyFlag: safety.flag,
          messageCountAfter: priorCount + 1,
        }).catch((err) => {
          console.warn("[chat_logs] background insert failed:", err);
        }),
      );
    }

    // Referral qualification — when the referred user reaches the 3-message
    // threshold, credit the referrer exactly once. Idempotent + isolated.
    if (onFreePool && typeof nextMessageCount === "number" && nextMessageCount >= 3) {
      try {
        await qualifyAndCreditReferral(userId);
      } catch (e) {
        console.error("[referral] qualification hook threw:", e);
      }
    }
  }

  // Verse-card surfacing — two layered filters:
  //
  //   1. Word-count floor (VERSE_CARD_MIN_WORDS = 25). Short replies
  //      ("हाँ, बताओ।", "ठीक है।") never surface cards. Fixes the
  //      production UX bug where casual responses rendered 5 cards of
  //      retrieval debris. Short-circuit returns [] immediately —
  //      avoids paying for a Haiku attestation call on short replies.
  //
  //   2. Model-attested filter (attestVerseReferences in verses.ts).
  //      Above the floor, a small Haiku call audits which retrieved
  //      verses Krishna actually drew from. Only attested refs surface
  //      as cards. Silent-fails to the full retrieved pool on auditor
  //      error so cards never silently disappear when the audit breaks.
  //
  // RAG retrieval pipeline itself is unchanged — `verses` still flows
  // into the Sonnet system prompt as RELEVANT SCRIPTURE; only the
  // user-visible card list is filtered. attestVerseReferences runs
  // AFTER Sonnet's reply finishes (streaming path: between
  // finalMessage() and the meta frame; non-streaming: before the
  // NextResponse.json). Adds ~500ms to meta-frame latency — user-
  // perceived reply latency is unchanged because the reply text has
  // already streamed.
  const VERSE_CARD_MIN_WORDS = 25;
  const VERSE_CARD_MAX = 5;
  async function buildResponseVerses(replyText: string): Promise<ApiVerse[]> {
    // Phase 10.11 — voice mode never renders verse cards (the audio loop
    // ignores them), so skip BOTH Path C (attestVerseReferences) and Path B
    // (retrieveEntityVerses) Haiku/embedding calls entirely.
    if (isVoiceMode) return [];
    const replyWordCount = replyText.trim().split(/\s+/).filter(Boolean).length;
    // 25-word floor — short replies get NO cards and we run NEITHER the
    // Path C nor the Path B Haiku call (latency + cost saver).
    if (replyWordCount < VERSE_CARD_MIN_WORDS) return [];

    // Path C (attest the cosine RAG pool) and Path B (entity-based
    // retrieval for §4.5 figures the cosine search missed) run in
    // parallel — total meta-frame delay ≈ max(PathC, PathB), not the
    // sum. Both degrade gracefully internally; the extra .catch guards
    // are belt-and-suspenders so Path C still surfaces if Path B throws.
    const [attestedRefsArr, entityResult] = await Promise.all([
      attestVerseReferences(replyText, verses).catch((e) => {
        console.error("[buildResponseVerses] Path C threw:", e);
        return verses.map((v) => v.reference); // silent-fail = full pool
      }),
      retrieveEntityVerses(replyText).catch((e) => {
        console.error("[buildResponseVerses] Path B threw:", e);
        return { entities: [] as string[], verses: [] as ApiVerse[] };
      }),
    ]);

    const attestedRefs = new Set(attestedRefsArr);
    const pathC: ApiVerse[] = verses
      .filter((v) => attestedRefs.has(v.reference))
      .map((v) => ({
        reference: v.reference,
        sanskrit: v.sanskrit,
        transliteration: v.transliteration,
        hindi: v.hindi,
        english: v.english,
      }));

    // Merge: Path C first (verses Krishna actually drew from take card
    // priority), then Path B entity verses. Dedupe by reference so a
    // verse attested AND entity-retrieved appears once. Cap at 5.
    const merged: ApiVerse[] = [];
    const seenRefs = new Set<string>();
    for (const v of [...pathC, ...entityResult.verses]) {
      if (seenRefs.has(v.reference)) continue;
      seenRefs.add(v.reference);
      merged.push(v);
      if (merged.length >= VERSE_CARD_MAX) break;
    }

    console.log(
      `[chat] verse cards: attested=${pathC.length} ` +
        `entity_retrieved=${entityResult.verses.length} ` +
        `merged=${merged.length} ` +
        `entities=[${entityResult.entities.join(",")}]`,
    );

    return merged;
  }
  const safetyCard = safetyFlag ? buildSafetyCard(safetyFlag) : undefined;

  // Phase 5.4: post-mutation counter values surfaced to the client so the
  // diya panel updates in lockstep with the DB write performed by
  // persistTurnState. Uses the same usingSevaCredit semantics — bump
  // message_count on the free pool, decrement seva_balance once spending
  // credits. In the streaming path persistTurnState fires-and-forgets
  // after these values are sent, so the response races slightly ahead
  // of the DB write (same accepted race documented above persistTurnState).
  // Phase 9 — mirror the 3-way charge: free bumps the count; sub/seva keep it
  // capped. seva_balance only drops when actually paying with seva (a turn
  // charged to the subscription pool leaves seva untouched).
  const responseMessageCount = onFreePool ? priorCount + 1 : priorCount;
  const responseSevaBalance = chargingSeva
    ? Math.max(0, sevaBalance - 1)
    : sevaBalance;

  // Phase 7 — within-session continuity. The rolling context_summary
  // captures emotion arc; the verbatim recent turns let Krishna
  // actually respond to the dialogue. Last 8 turns is a soft window —
  // tune in beta if cost/quality feedback warrants. recentHistory is
  // already chronological (helper reverses inside the fetch).
  const messagesArray: Array<{ role: "user" | "assistant"; content: string }> = [
    ...recentHistory.flatMap((turn) => [
      { role: "user" as const, content: turn.user_message },
      { role: "assistant" as const, content: turn.reply_text },
    ]),
    { role: "user" as const, content: message },
  ];

  // 5b. Final reply — branch on Accept header (see DUAL-MODE RESPONSE
  // CONTRACT block at top of file).
  //
  // Safety-card override: when safetyFlag is non-null (self_harm or
  // harm_others classified above SAFETY_THRESHOLD), force the plain-
  // JSON path even if the client requested streaming. Reasoning: the
  // helpline card is an intervention that must land alongside Krishna's
  // reply, not after a 1–15 second token stream during which the user
  // may disengage. Krishna still replies in full Bhagavata-mode per
  // locked decision #7 — the card just rides with the JSON instead of
  // being deferred to a meta-frame at end-of-stream.
  const wantsStream =
    !safetyFlag &&
    (req.headers.get("accept")?.includes("application/x-ndjson") ?? false);

  if (wantsStream) {
    // ───────────── Streaming path (NDJSON) ─────────────
    // Pipe MessageStream events into a ReadableStream as
    // `{"type":"text","delta":"..."}` lines, then emit one final
    // `{"type":"meta",...}` frame with verses + safety_card before
    // closing. Defer persistTurnState to fire-and-forget AFTER the meta
    // frame so the client UX is not gated on the Supabase write.
    //
    // Cancellation: req.signal is forwarded to the SDK so closing the
    // browser tab cancels the upstream Anthropic call. On abort,
    // persistTurnState is intentionally NOT run — memory should only
    // persist completed exchanges.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Stream the Sonnet reply with retry on Anthropic server-side
          // overload. Retrying is only safe BEFORE the first token reaches
          // the client: once any text delta has been enqueued, a failure is
          // fatal for the turn (a retry would prepend a second partial reply
          // to the NDJSON stream the client is already rendering). An
          // overloaded_error typically fires at connection time — before any
          // token — so in practice it IS retryable; `hasEmittedText` guards
          // the rare mid-stream case.
          let hasEmittedText = false;
          let sonnetFirstTokenLogged = false;
          const runSonnetStream = async () => {
            let lastErr: unknown;
            for (let attempt = 0; attempt <= MAX_OVERLOAD_RETRIES; attempt++) {
              timing("sonnet_call_start");
              const messageStream = client.messages.stream(
                {
                  model: "claude-sonnet-4-6",
                  max_tokens: 3000,
                  system: systemBlocks,
                  messages: messagesArray,
                },
                { signal: req.signal },
              );

              messageStream.on("text", (delta) => {
                if (!sonnetFirstTokenLogged) {
                  sonnetFirstTokenLogged = true;
                  timing("sonnet_first_token");
                }
                hasEmittedText = true;
                try {
                  controller.enqueue(
                    encoder.encode(
                      JSON.stringify({ type: "text", delta }) + "\n",
                    ),
                  );
                } catch {
                  // Controller closed (client disconnected). Swallow —
                  // the SDK will surface abort via its own error path.
                }
              });

              try {
                const fm = await messageStream.finalMessage();
                timing("sonnet_stream_end");
                return fm;
              } catch (err) {
                lastErr = err;
                // Client abort → propagate to the outer catch (no retry, no
                // persist). Already emitted tokens → fatal (can't corrupt the
                // stream). Non-overload error → fatal. Else back off + retry.
                if (req.signal.aborted || hasEmittedText) throw err;
                if (!isRetryableOverload(err)) throw err;
                if (attempt === MAX_OVERLOAD_RETRIES) {
                  console.error(
                    "[chat] anthropic overloaded — all retries exhausted, returning error to client",
                  );
                  throw err;
                }
                const delay = OVERLOAD_BACKOFF_MS[attempt] ?? 2000;
                console.warn(
                  `[chat] anthropic overloaded — retry ${attempt + 1}/${MAX_OVERLOAD_RETRIES} after ${delay}ms`,
                );
                await new Promise((r) => setTimeout(r, delay));
              }
            }
            throw lastErr;
          };

          const finalMsg = await runSonnetStream();

          // Same cache telemetry as the plain-JSON path so the log
          // shape stays grep-stable across both modes. Phase 2.6
          // cache invariant: cache_creation drops to 0 after the
          // first call within 5 min, cache_read sustains at persona
          // size for subsequent turns. Tagged "(stream)" so the two
          // paths can be distinguished in logs.
          console.log(
            `[chat] sonnet usage (stream): input=${finalMsg.usage.input_tokens ?? 0} ` +
              `cache_creation=${finalMsg.usage.cache_creation_input_tokens ?? 0} ` +
              `cache_read=${finalMsg.usage.cache_read_input_tokens ?? 0} ` +
              `output=${finalMsg.usage.output_tokens ?? 0} ` +
              `(persona=${persona.length}ch dynamic=${dynamic.length}ch)`,
          );

          const replyText =
            finalMsg.content.find((b) => b.type === "text")?.text ?? "";

          // Phase 8.0 Path C — attestation runs AFTER the reply has
          // fully streamed (text on screen) and BEFORE the meta frame
          // ships. Adds ~500ms before the verse cards land below the
          // reply. User-visible reply latency is unchanged: the text
          // they're reading already arrived. controller.enqueue must
          // strictly follow this await so the meta frame carries the
          // attested verses list, not the pre-attestation list.
          const attestedResponseVerses = await buildResponseVerses(replyText);

          const metaLine =
            JSON.stringify({
              type: "meta",
              verses: attestedResponseVerses,
              paywall: false,
              safety_card: safetyCard ?? null,
              message_count: responseMessageCount,
              seva_balance: responseSevaBalance,
            }) + "\n";
          try {
            controller.enqueue(encoder.encode(metaLine));
          } catch {
            // Controller closed mid-meta — client disconnected after
            // text but before meta landed. saveMemory still runs below
            // because the model call completed successfully.
          }
          timing("chat_response_sent");
          controller.close();

          // Fire-and-forget — does NOT block the response stream.
          // Wrapped in waitUntil so Vercel keeps the function alive
          // until the writes (saveMemory + logSafetyEvent + logChatTurn
          // + decrementSevaBalance) resolve, even after the streaming
          // response has closed. Without this, message_count lags
          // behind actual turn count and breaks paywall logic.
          waitUntil(
            persistTurnState(replyText).catch((e) => {
              console.error("[chat] deferred persistTurnState failed:", e);
            }),
          );
        } catch (e) {
          // Two distinct failure modes:
          //   1. Client aborted (closed tab) — req.signal.aborted = true.
          //      Do NOT persist memory; that turn never completed.
          //   2. Upstream error (Anthropic 5xx, rate limit, etc.) —
          //      surface a {"type":"error",...} frame so the UI can
          //      render whatever partial reply was received and prompt
          //      the user to resend.
          if (req.signal.aborted) {
            console.log(
              "[chat] stream aborted by client; not persisting turn state",
            );
          } else {
            console.error("[chat] stream errored:", e);
            try {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: "error",
                    message:
                      "connection dropped — please send your message again.",
                  }) + "\n",
                ),
              );
            } catch {
              // Controller already closed; nothing more we can do.
            }
          }
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        }
      },
    });

    const res = new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        // Disable upstream proxy buffering (e.g. nginx) so tokens
        // reach the client as they arrive, not in a single dump.
        "X-Accel-Buffering": "no",
      },
    });
    return withCookie(res, isNewUser, userId);
  }

  // ───────────── Plain-JSON path (pre-Phase-3.9 behavior) ─────────────
  // Used by test-prompt.ts, test-chat-e2e.ts, and any non-browser
  // caller that does not request NDJSON. Synchronous: awaits the full
  // model reply and saveMemory before returning.
  // Same overload-retry discipline as the streaming path. create() is atomic
  // (it returns the full message or throws), so there is no partial-output
  // hazard — every overload / 5xx failure is safely retryable up to the cap.
  const createSonnetWithRetry = async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_OVERLOAD_RETRIES; attempt++) {
      try {
        timing("sonnet_call_start");
        return await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 3000,
          system: systemBlocks,
          messages: messagesArray,
        });
      } catch (err) {
        lastErr = err;
        if (!isRetryableOverload(err)) throw err;
        if (attempt === MAX_OVERLOAD_RETRIES) {
          console.error(
            "[chat] anthropic overloaded — all retries exhausted, returning error to client",
          );
          throw err;
        }
        const delay = OVERLOAD_BACKOFF_MS[attempt] ?? 2000;
        console.warn(
          `[chat] anthropic overloaded — retry ${attempt + 1}/${MAX_OVERLOAD_RETRIES} after ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  };
  const response = await createSonnetWithRetry();
  timing("sonnet_stream_end");

  // Phase 2.6 cache telemetry: per-turn cache write/read + persona
  // size relative to the Sonnet 4.6 cache minimum. Watch this log
  // as the Phase 3 persona ships — cache_creation should jump from
  // 0 to ~3K on the first turn after deploy, then cache_read should
  // sustain at the same value across subsequent turns within 5 min.
  console.log(
    `[chat] sonnet usage: input=${response.usage.input_tokens ?? 0} ` +
      `cache_creation=${response.usage.cache_creation_input_tokens ?? 0} ` +
      `cache_read=${response.usage.cache_read_input_tokens ?? 0} ` +
      `output=${response.usage.output_tokens ?? 0} ` +
      `(persona=${persona.length}ch dynamic=${dynamic.length}ch)`,
  );

  const reply =
    response.content.find((b) => b.type === "text")?.text.trim() ?? "";

  await persistTurnState(reply);

  // Phase 8.0 Path C — attest verses AFTER the Sonnet reply lands and
  // BEFORE the JSON response goes out. Plain-JSON callers (test scripts,
  // non-browser clients) see the same attested-verses list as streaming
  // clients. Sequential here rather than parallel because the response
  // body needs the result before NextResponse.json can serialize.
  const attestedResponseVerses = await buildResponseVerses(reply);

  timing("chat_response_sent");
  return withCookie(
    NextResponse.json({
      reply,
      paywall: false,
      verses: attestedResponseVerses,
      safety_card: safetyCard,
      message_count: responseMessageCount,
      seva_balance: responseSevaBalance,
    }),
    isNewUser,
    userId,
  );
}
