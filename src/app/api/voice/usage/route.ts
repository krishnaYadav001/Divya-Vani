import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { consumeVoiceSeconds } from "@/lib/supabase";

const USER_COOKIE = "god_messenger_uid";
// Guard against a bad client value (clock skew / runaway timer). No legitimate
// single voice session approaches two hours; clamp so one bad call can't drain
// a pool/wallet. The agent itself enforces much shorter turn/session limits.
const MAX_SESSION_SECONDS = 2 * 60 * 60;

// Phase 9 — voice metering. The /voice widget POSTs the finished session's
// duration here on disconnect; we debit the subscription pool then the wallet
// (see consume_voice_seconds). Fire-and-forget from the client, so this always
// returns 200 quickly and never blocks the next session — a metering miss is
// acceptable per the ops invariant, double-charging is not (hence the clamp +
// the row-locked SQL).
export async function POST(req: Request) {
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value;
  if (!userId) {
    // No identity — nothing to meter. Ack so the client doesn't retry.
    return NextResponse.json({ ok: true, metered: 0 });
  }

  let body: { seconds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true, metered: 0 });
  }

  const raw = body.seconds;
  const seconds =
    typeof raw === "number" && Number.isFinite(raw) && raw > 0
      ? Math.min(Math.round(raw), MAX_SESSION_SECONDS)
      : 0;
  if (seconds <= 0) {
    return NextResponse.json({ ok: true, metered: 0 });
  }

  const result = await consumeVoiceSeconds(userId, seconds);
  if (result && result.shortfall > 0) {
    // Session ran past the user's remaining balance — logged for visibility;
    // not an error (the conversation already happened, entry was gated).
    console.log("[voice/usage] overage beyond balance:", {
      userId,
      requested: seconds,
      from_pool: result.from_pool,
      from_wallet: result.from_wallet,
      shortfall: result.shortfall,
    });
  }

  return NextResponse.json({ ok: true, metered: seconds });
}
