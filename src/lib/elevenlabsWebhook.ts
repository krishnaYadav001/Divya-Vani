// Server-only verifier + parser for the ElevenLabs Agents **post-call**
// webhook (Phase 9 voice metering). The post-call webhook is the AUTHORITATIVE
// source of a voice call's duration: ElevenLabs runs the media pipeline, so it
// — not the browser — knows how long the call actually was. We meter against
// `metadata.call_duration_secs` from this event, keyed to our user via the
// `dynamic_variables.user_id` we pass at session start.
//
// Signature scheme is replicated EXACTLY from the installed
// @elevenlabs/elevenlabs-js `webhooks.constructEvent` source (so we don't pull
// the whole SDK into the route bundle, and don't guess the format):
//   • header `ElevenLabs-Signature: t=<unix_seconds>,v0=<hex_hmac_sha256>`
//   • signed message = `${timestamp}.${rawBody}`
//   • HMAC-SHA256 over that message with the webhook secret, hex digest
//   • 30-minute replay tolerance on the timestamp
//   • constant-time compare of the v0 hash
// Verified against node_modules/@elevenlabs/elevenlabs-js/wrapper/webhooks.js.

import { createHmac } from "crypto";
import { timingSafeEqualHex } from "@/lib/secureCompare";

// 30-minute replay window (matches the SDK).
const TOLERANCE_MS = 30 * 60 * 1000;

export interface ElevenLabsWebhookEvent {
  type?: string;
  event_timestamp?: number;
  data?: {
    conversation_id?: string;
    status?: string;
    metadata?: { call_duration_secs?: number };
    conversation_initiation_client_data?: {
      dynamic_variables?: Record<string, unknown>;
    };
  };
}

export type VerifyResult =
  | { ok: true; event: ElevenLabsWebhookEvent }
  | { ok: false; reason: string };

/**
 * Verify the ElevenLabs-Signature header against the raw body + secret, then
 * parse the JSON. Returns the parsed event only when the signature AND the
 * timestamp window both pass. Never throws.
 */
export function verifyAndParseElevenLabsWebhook(
  rawBody: string,
  sigHeader: string | null | undefined,
  secret: string,
): VerifyResult {
  if (!sigHeader) return { ok: false, reason: "missing signature header" };
  const parts = sigHeader.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const provided = parts.find((p) => p.startsWith("v0="));
  if (!timestamp || !provided) {
    return { ok: false, reason: "no v0 signature in header" };
  }
  const reqMs = Number(timestamp) * 1000;
  if (!Number.isFinite(reqMs) || reqMs < Date.now() - TOLERANCE_MS) {
    return { ok: false, reason: "timestamp outside tolerance" };
  }
  const expected =
    "v0=" +
    createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  if (!timingSafeEqualHex(expected, provided)) {
    return { ok: false, reason: "signature mismatch" };
  }
  let event: ElevenLabsWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "invalid json body" };
  }
  return { ok: true, event };
}

export interface PostCallMetering {
  conversationId: string;
  userId: string;
  durationSecs: number;
}

/**
 * Pull the metering fields out of a verified post_call_transcription event.
 * Returns null for any other event type, or when the conversation id is absent
 * (without it we can't dedupe against the provisional client report). A missing
 * user_id is returned as "" so the caller can decide (an unidentified call is
 * not metered — see the route).
 */
export function extractPostCallMetering(
  event: ElevenLabsWebhookEvent,
): PostCallMetering | null {
  if (event.type !== "post_call_transcription") return null;
  const data = event.data;
  if (!data) return null;
  const conversationId =
    typeof data.conversation_id === "string" ? data.conversation_id : "";
  if (!conversationId) return null;
  const durationSecs =
    typeof data.metadata?.call_duration_secs === "number"
      ? data.metadata.call_duration_secs
      : 0;
  const dyn = data.conversation_initiation_client_data?.dynamic_variables;
  const userId =
    dyn && typeof dyn.user_id === "string" ? dyn.user_id : "";
  return { conversationId, userId, durationSecs };
}
