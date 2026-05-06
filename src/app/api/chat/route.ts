import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { SYSTEM_PROMPT } from "@/lib/systemPrompt";
import {
  fetchCandidates,
  fetchCandidatesMultiQuery,
  rerankByTheme,
  applyDiversityBoost,
  getRagFlags,
  type VerseHit,
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
  type UserMemory,
} from "@/lib/supabase";
import { getTiersInOrder } from "@/lib/seva";
import {
  safetyClassify,
  SAFETY_THRESHOLD,
  type SafetyFlag,
} from "@/lib/safety";

const client = new Anthropic();
const USER_COOKIE = "god_messenger_uid";
const RETURNING_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours
const FREE_MESSAGE_LIMIT = 10;

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

// Phase 2 piggyback: extract memory + classify the user's query into the
// 34-tag taxonomy in ONE Haiku call. The query themes feed Layer-1
// theme-overlap reranking against the chunks pre-tagged in Step 2.2.
type ExtractedTurn = UserMemory & { query_themes?: string[] };

async function extractMemory(
  message: string,
  priorSummary: string | null,
  nameAwaited: boolean,
): Promise<ExtractedTurn | null> {
  try {
    const priorBlock = priorSummary
      ? `Prior context summary (the user's emotional thread up to now):
"${priorSummary}"`
      : `Prior context summary: (none — this is the first turn)`;

    const nameInstruction = nameAwaited
      ? `- detected_user_name: Krishna asked the user their name in his previous reply. The user has now responded. If this message is plausibly the user's name — a single word that looks name-shaped (e.g. "Krishna", "कृष्णा", "Anjali"), a sentence stating their name (e.g. "मेरा नाम कृष्णा है", "I'm Anjali"), or anything similar — return that name as a string. If the user ignored the question and brought up a new topic instead, return null. Bias toward returning the name when the message is short and could plausibly be one.`
      : `- detected_user_name: if and only if the user CLEARLY stated their OWN name in THIS message (e.g., "मेरा नाम कृष्णा है", "I'm Anjali"), return that name as a string. Otherwise return null. Names of other people mentioned in passing must NOT be returned. Be conservative.`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `${priorBlock}

The user's latest message:
"${message}"

Produce these five fields about the user, integrating the prior summary with the new message:
- main_problem: short phrase describing what they are dealing with right now
- emotion: one word for the current emotional state
- context_summary: ONE OR TWO sentences that capture the user's running emotional thread — what they have been feeling and why, including how today's message fits into that thread. If there was no prior summary, write a fresh one based on this message alone.
${nameInstruction}
- query_themes: 1-7 themes from the fixed taxonomy below that capture what the user is feeling, asking about, or struggling with in THIS message. The same taxonomy was applied to the scripture corpus, so query themes can match retrieved-verse themes during scripture retrieval reranking.

${QUERY_TAXONOMY_BLOCK}

Return ONLY valid JSON in this exact shape, with no surrounding text or markdown:
{"main_problem":"...","emotion":"...","context_summary":"...","detected_user_name":null,"query_themes":["tag1","tag2"]}`,
        },
      ],
    });
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
): { persona: string; dynamic: string } {
  const lines: string[] = [];

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
    lines.push(`- Recent emotional thread: ${memory.context_summary}`);
  }
  if (isFirstTime) {
    lines.push(
      `- This is the user's first message in the app — be slightly warmer and more emotionally connecting than usual, but stay grounded and don't over-perform welcome.`,
    );
  } else if (isReturningUser) {
    lines.push(
      `- Note: this is the user's first message after being away for several hours. Acknowledge the return only subtly, if at all — the thread above is what they were carrying when they last spoke.`,
    );
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
  const { message } = await req.json();

  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json(
      { error: "message must be a non-empty string" },
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

  // 2. Fetch prior memory — needed for paywall check, returning-flag,
  //    onboarding-flag, extraction summary, and message_count increment.
  const priorMemory = await fetchMemory(userId);
  const priorCount = priorMemory?.message_count ?? 0;
  const sevaBalance = priorMemory?.seva_balance ?? 0;
  const isFirstTime = priorMemory?.is_first_time !== false;

  // 3. Seva paywall guard: free pool spent AND no purchased credits → no AI
  //    call, no count change. Return the paywall reply with the four tier
  //    offers so the client can render the seva picker.
  if (priorCount >= FREE_MESSAGE_LIMIT && sevaBalance <= 0) {
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
  const isReturningUser = isReturningAfterGap(priorMemory);

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
    if (!ragFlags.queryRewrite) {
      return fetchCandidates(message, fetchK);
    }
    const variants = await rewriteQuery(message, ragFlags.rewriteVariants);
    return fetchCandidatesMultiQuery(variants, fetchK, ragFlags.rewritePerVariantK);
  }

  const [candidates, extracted, safety] = await Promise.all([
    gatherCandidates().catch((e) => {
      console.error("[gatherCandidates] threw:", e);
      return [] as VerseHit[];
    }),
    extractMemory(message, priorMemory?.context_summary ?? null, nameAwaited),
    safetyClassify(message),
  ]);

  const queryThemes = extracted?.query_themes ?? [];

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

  // Merge prior memory with this turn's freshly extracted fields so the
  // current reply has access to the just-detected name + updated emotion
  // / problem / summary instead of using only the previous turn's state.
  const effectiveMemory: UserMemory | null = extracted
    ? { ...priorMemory, ...extracted }
    : priorMemory;

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
  // 5-turn test). Caching only the persona is silent no-op today
  // (persona < Sonnet 4.6's 2,048-token cache minimum) AND lights
  // up automatically when Phase 3 grows the persona past it. No
  // further code change needed at that point — Phase 3 ships the
  // longer persona prompt and this block starts hitting cache.
  const { persona, dynamic } = buildSystemPrompt(
    effectiveMemory,
    isReturningUser,
    isFirstTime,
    verses,
    priorCount,
    safetyFlag,
  );

  const systemBlocks: Array<{
    type: "text";
    text: string;
    cache_control?: { type: "ephemeral" };
  }> = [
    {
      type: "text",
      text: persona,
      cache_control: { type: "ephemeral" },
    },
  ];
  if (dynamic.length > 0) {
    systemBlocks.push({ type: "text", text: dynamic });
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
  async function persistTurnState(): Promise<void> {
    const verseRefs = verses.map((v) => v.reference);
    const newUserName =
      !priorMemory?.user_name && extracted?.user_name
        ? extracted.user_name
        : undefined;

    const usingSevaCredit = priorCount >= FREE_MESSAGE_LIMIT;
    const nextMessageCount = usingSevaCredit ? undefined : priorCount + 1;

    if (extracted) {
      await saveMemory(userId, {
        main_problem: extracted.main_problem,
        emotion: extracted.emotion,
        context_summary: extracted.context_summary,
        message_count: nextMessageCount,
        is_first_time: false,
        verses_referenced: verseRefs,
        user_name: newUserName,
      });
    } else {
      await saveMemory(userId, {
        message_count: nextMessageCount,
        is_first_time: false,
        verses_referenced: verseRefs,
      });
    }

    if (usingSevaCredit) {
      await decrementSevaBalance(userId);
    }
  }

  const responseVerses = verses.map((v) => ({
    reference: v.reference,
    sanskrit: v.sanskrit,
    transliteration: v.transliteration,
    hindi: v.hindi,
    english: v.english,
  }));
  const safetyCard = safetyFlag ? buildSafetyCard(safetyFlag) : undefined;

  // Phase 5.4: post-mutation counter values surfaced to the client so the
  // diya panel updates in lockstep with the DB write performed by
  // persistTurnState. Uses the same usingSevaCredit semantics — bump
  // message_count on the free pool, decrement seva_balance once spending
  // credits. In the streaming path persistTurnState fires-and-forgets
  // after these values are sent, so the response races slightly ahead
  // of the DB write (same accepted race documented above persistTurnState).
  const usingSevaCreditForResponse = priorCount >= FREE_MESSAGE_LIMIT;
  const responseMessageCount = usingSevaCreditForResponse
    ? priorCount
    : priorCount + 1;
  const responseSevaBalance = usingSevaCreditForResponse
    ? Math.max(0, sevaBalance - 1)
    : sevaBalance;

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
          const messageStream = client.messages.stream(
            {
              model: "claude-sonnet-4-6",
              max_tokens: 3000,
              system: systemBlocks,
              messages: [{ role: "user", content: message }],
            },
            { signal: req.signal },
          );

          messageStream.on("text", (delta) => {
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

          const finalMsg = await messageStream.finalMessage();

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

          const metaLine =
            JSON.stringify({
              type: "meta",
              verses: responseVerses,
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
          controller.close();

          // Fire-and-forget — does NOT block the response stream.
          persistTurnState().catch((e) => {
            console.error("[chat] deferred persistTurnState failed:", e);
          });
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
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: systemBlocks,
    messages: [{ role: "user", content: message }],
  });

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

  await persistTurnState();

  const reply =
    response.content.find((b) => b.type === "text")?.text.trim() ?? "";

  return withCookie(
    NextResponse.json({
      reply,
      paywall: false,
      verses: responseVerses,
      safety_card: safetyCard,
      message_count: responseMessageCount,
      seva_balance: responseSevaBalance,
    }),
    isNewUser,
    userId,
  );
}
