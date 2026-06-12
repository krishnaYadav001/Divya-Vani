// =============================================================================
// Phase 9 — ElevenLabs post-call webhook: AUTHORITATIVE voice metering.
// =============================================================================
// ElevenLabs runs the voice media pipeline, so IT — not the browser — knows the
// true call duration. After each call it POSTs a `post_call_transcription` event
// here with `metadata.call_duration_secs` and the `dynamic_variables.user_id` we
// set at session start. We debit that authoritative duration through the same
// per-conversation high-water-mark ledger the provisional client report uses
// (meter_voice_session), so:
//   • the client's instant report keeps the balance UX snappy, AND
//   • a client that suppressed/under-reported its duration is trued up here, AND
//   • neither path (nor a webhook retry) can ever double-charge.
//
// SETUP (founder): in the ElevenLabs dashboard → the agent → Post-call webhook,
// point a `post_call_transcription` webhook at
//   https://divyavani.co.in/api/voice/elevenlabs-webhook
// and set ELEVENLABS_WEBHOOK_SECRET (the webhook's signing secret) in Vercel.
// Until that secret is set this route 503s (ElevenLabs retries), and metering
// falls back to the provisional client report only.
//
// Signature is verified (HMAC-SHA256, 30-min replay window) before any work —
// see src/lib/elevenlabsWebhook.ts.

import { NextResponse } from "next/server";
import {
  verifyAndParseElevenLabsWebhook,
  extractPostCallMetering,
} from "@/lib/elevenlabsWebhook";
import { meterVoiceSession } from "@/lib/supabase";

// Same clamp as /api/voice/usage — no legitimate single call approaches 2h.
const MAX_SESSION_SECONDS = 2 * 60 * 60;
// Mirror the agent-llm sentinel: a turn that resolved to the placeholder id is
// unidentified and must not be metered into a shared/none row.
const AGENT_USER_ID = "elevenagents-test-user";

export async function POST(req: Request) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "[voice/el-webhook] ELEVENLABS_WEBHOOK_SECRET not set — cannot verify. " +
        "Set it in Vercel + configure the ElevenLabs post-call webhook, together.",
    );
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  // HMAC needs the EXACT raw bytes — read text(), not json().
  const rawBody = await req.text();
  const sig = req.headers.get("elevenlabs-signature");
  const verified = verifyAndParseElevenLabsWebhook(rawBody, sig, secret);
  if (!verified.ok) {
    console.error("[voice/el-webhook] verification failed:", verified.reason);
    return NextResponse.json({ error: verified.reason }, { status: 400 });
  }

  const meta = extractPostCallMetering(verified.event);
  if (!meta) {
    // Not a post_call_transcription event (e.g. audio webhook) or no conversation
    // id — ack so ElevenLabs doesn't retry a no-op.
    return NextResponse.json({ ok: true, metered: 0, reason: "not_metering_event" });
  }

  const { conversationId, userId, durationSecs } = meta;
  if (!userId || userId === AGENT_USER_ID || userId.includes("{{")) {
    // Unidentified call (dynamic var didn't propagate / dashboard test) — never
    // meter into a shared row. Ack.
    console.warn("[voice/el-webhook] unidentified user_id, not metering:", {
      conversationId,
      userId,
    });
    return NextResponse.json({ ok: true, metered: 0, reason: "unidentified" });
  }

  const seconds = Math.min(
    Math.max(0, Math.round(durationSecs)),
    MAX_SESSION_SECONDS,
  );
  if (seconds <= 0) {
    return NextResponse.json({ ok: true, metered: 0, reason: "zero_duration" });
  }

  const result = await meterVoiceSession(userId, conversationId, seconds, "webhook");
  if (!result) {
    // DB blip or the meter_voice_session function isn't installed. Return 500 so
    // ElevenLabs retries; the high-water-mark ledger makes a retry idempotent, so
    // a later success can't double-charge.
    console.error(
      "[voice/el-webhook] meterVoiceSession failed — will retry:",
      conversationId,
    );
    return NextResponse.json({ error: "metering failed" }, { status: 500 });
  }

  console.log("[voice/el-webhook] metered:", {
    conversationId,
    userId,
    reported: seconds,
    delta: result.delta,
    already: result.already,
    from_pool: result.from_pool,
    from_wallet: result.from_wallet,
    shortfall: result.shortfall,
  });
  return NextResponse.json({ ok: true, metered: result.delta });
}
