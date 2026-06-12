import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { meterVoiceSession } from "@/lib/supabase";

const USER_COOKIE = "god_messenger_uid";
// Guard against a bad client value (clock skew / runaway timer). No legitimate
// single voice session approaches two hours; clamp so one bad call can't drain
// a pool/wallet. The agent itself enforces much shorter turn/session limits.
const MAX_SESSION_SECONDS = 2 * 60 * 60;

// Phase 9 — voice metering (PROVISIONAL client report). The /voice widget POSTs
// the finished session's duration + its ElevenLabs conversationId here on
// disconnect, for an instant balance update. This is debited through the
// per-conversation high-water-mark ledger (meter_voice_session), so it can
// NEVER double-charge with — and is trued up by — the AUTHORITATIVE post-call
// webhook (/api/voice/elevenlabs-webhook), which reports the same conversationId
// with ElevenLabs' own connection duration. A client that suppresses or
// under-reports this POST only delays/under-states the charge; the webhook
// settles the true amount. Fire-and-forget, always 200 quickly.
export async function POST(req: Request) {
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value;
  if (!userId) {
    // No identity — nothing to meter. Ack so the client doesn't retry.
    return NextResponse.json({ ok: true, metered: 0 });
  }

  let body: { seconds?: unknown; conversationId?: unknown };
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
  const conversationId =
    typeof body.conversationId === "string" && body.conversationId
      ? body.conversationId
      : null;
  if (seconds <= 0) {
    return NextResponse.json({ ok: true, metered: 0 });
  }
  if (!conversationId) {
    // Without the conversation id we can't dedupe against the authoritative
    // post-call webhook — skip the provisional debit and let the webhook meter
    // this call (prevents a double-charge for older/edge clients).
    return NextResponse.json({ ok: true, metered: 0, reason: "no_conversation_id" });
  }

  const result = await meterVoiceSession(userId, conversationId, seconds, "client");
  if (result && result.shortfall > 0) {
    // Session ran past the user's remaining balance — logged for visibility;
    // not an error (the conversation already happened, entry was gated).
    console.log("[voice/usage] overage beyond balance:", {
      userId,
      conversationId,
      requested: seconds,
      delta: result.delta,
      from_pool: result.from_pool,
      from_wallet: result.from_wallet,
      shortfall: result.shortfall,
    });
  }

  return NextResponse.json({ ok: true, metered: result?.delta ?? 0 });
}
