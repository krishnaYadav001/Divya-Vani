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
import { fetchMemory } from "@/lib/supabase";
import { hasVoiceAccess } from "@/lib/voiceAccess";

const USER_COOKIE = "god_messenger_uid";

export async function GET() {
  try {
    const jar = await cookies();
    const existing = jar.get(USER_COOKIE)?.value;
    const userId = existing ?? randomUUID();
    const isNewUser = !existing;

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
