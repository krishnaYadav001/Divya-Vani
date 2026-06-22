// =============================================================================
// Phase 11.3/11.4 — /voice identity + access bootstrap.
// =============================================================================
// The ElevenAgents widget needs three things before it can start a voice
// conversation, all keyed to the same cookie identity the rest of the app uses:
//
//   1. user_id  — the cookie UUID, passed to ElevenAgents (dynamicVariables +
//                 customLlmExtraBody) so /api/agent-llm resolves the real user's
//                 memory / paywall / safety logs.
//   2. hasAccess — voice is paid-seva only (Locked Decision #9 / Phase 10.1);
//                 the widget shows the seva paywall instead of the orb when false.
//   3. message_count / seva_balance — for the seva panel display.
//
// We do all three in one GET so the widget makes a single round trip on mount.
//
// WHY A ROUTE HANDLER (not the /voice server component): Next 16 server
// components are render-only and cannot set cookies (only Server Actions /
// Route Handlers can). A brand-new browser arriving at /voice has no cookie, so
// this handler mints + sets it here. (Spec B7 anticipated exactly this.)
//
// Identity invariant: the cookie options below MUST match /api/chat's withCookie
// byte-for-byte, so /chat and /voice resolve to the SAME user_id row.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { waitUntil } from "@vercel/functions";
import { fetchMemory, grantFreeVoiceTrial } from "@/lib/supabase";
import { hasVoiceAccess } from "@/lib/voiceAccess";
import { SYSTEM_PROMPT } from "@/lib/systemPrompt";

const USER_COOKIE = "god_messenger_uid";

// Persona-cache warmup needs room to prefill the ~26k-token persona when the
// Anthropic cache is cold (it runs in waitUntil AFTER the response is sent, but
// still counts against the function's lifetime).
export const maxDuration = 60;

const anthropic = new Anthropic();

// ── Persona prompt-cache warmup (voice first-turn latency, founder 2026-06-11) ─
// On a cold cache, the first voice turn must prefill the entire 26,327-token
// persona before Krishna's first token — the single biggest "the call lags at
// the beginning" contributor. The user spends ~5-15s between opening /voice and
// actually speaking (mic permission, ElevenLabs connect, first utterance), so a
// background cache-touch fired here finishes before the first real turn needs it.
//
// Mechanics (per Anthropic prompt-caching docs):
//   • max_tokens: 0 runs PREFILL ONLY — the cache is written at the breakpoint,
//     the response returns immediately with content: [], zero output tokens.
//   • The breakpoint sits on the SAME persona block, same model, same 1h TTL as
//     /api/agent-llm and /api/chat, so the cache entry is byte-shared with both.
//   • Cache reads refresh the TTL, so a warm touch (≈0.1× input price, <₹1)
//     keeps the entry alive; a cold touch pays the 2× write the first real turn
//     would have paid anyway — net-new cost ONLY when a paid user opens /voice
//     and never speaks.
// Gated to access.allowed (paid users only — they are the only ones who can
// start a call) and throttled per warm instance so repeated mounts / SevaHub
// re-checks don't stack redundant touches.
const WARM_THROTTLE_MS = 4 * 60 * 1000;
let lastWarmAt = 0;

function warmPersonaCache(): void {
  const now = Date.now();
  if (now - lastWarmAt < WARM_THROTTLE_MS) return;
  lastWarmAt = now;
  waitUntil(
    anthropic.messages
      .create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 0,
          system: [
            {
              type: "text",
              text: SYSTEM_PROMPT,
              cache_control: { type: "ephemeral", ttl: "1h" },
            },
          ],
          messages: [{ role: "user", content: "warmup" }],
        },
        // Bounded so a slow cold prefill never outlives maxDuration; never
        // retried — the next page open warms again.
        { timeout: 45000, maxRetries: 0 },
      )
      .then((res) => {
        console.log(
          `[voice/bootstrap] persona cache warm: cache_creation=${res.usage.cache_creation_input_tokens ?? 0} cache_read=${res.usage.cache_read_input_tokens ?? 0}`,
        );
      })
      .catch((e) => {
        // Best-effort: a failed warm just means the first turn pays the cold
        // prefill like before. Reset the throttle so the next mount retries.
        lastWarmAt = 0;
        console.warn("[voice/bootstrap] persona cache warm failed:", e);
      }),
  );
}

export async function GET() {
  try {
    const jar = await cookies();
    const existing = jar.get(USER_COOKIE)?.value;
    const userId = existing ?? randomUUID();
    const isNewUser = !existing;

    await grantFreeVoiceTrial(userId);

    // hasVoiceAccess + fetchMemory in parallel. hasVoiceAccess fails closed
    // internally (any DB error → allowed:false), so a blip costs a paywall
    // prompt, never free voice. fetchMemory silent-fails to null.
    const [access, memory] = await Promise.all([
      hasVoiceAccess(userId),
      fetchMemory(userId).catch((e) => {
        console.error("[voice/bootstrap] fetchMemory threw:", e);
        return null;
      }),
    ]);

    // Paid user on the voice page → warm the shared persona prompt cache in
    // the background so their first spoken turn streams from a hot cache.
    if (access.allowed) warmPersonaCache();

    const res = NextResponse.json(
      {
        userId,
        hasAccess: access.allowed,
        messageCount: memory?.message_count ?? 0,
        sevaBalance: memory?.seva_balance ?? 0,
      },
      { status: 200 },
    );

    // Set the cookie on THIS response when freshly minted (same options as
    // /api/chat withCookie). A returning user keeps their existing cookie.
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
  } catch (e) {
    // Total failure — return a safe denied state so the widget shows the
    // paywall rather than crashing. No cookie set (next load retries).
    console.error("[voice/bootstrap] error:", e);
    return NextResponse.json(
      { userId: null, hasAccess: false, messageCount: 0, sevaBalance: 0 },
      { status: 200 },
    );
  }
}
