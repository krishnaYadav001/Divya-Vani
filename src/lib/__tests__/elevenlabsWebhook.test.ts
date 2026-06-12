import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  verifyAndParseElevenLabsWebhook,
  extractPostCallMetering,
} from "../elevenlabsWebhook";

const SECRET = "wsec_test_secret";

// Build a valid ElevenLabs-Signature header for a body at a given timestamp.
function sign(body: string, tsSeconds: number, secret = SECRET): string {
  const hex = createHmac("sha256", secret).update(`${tsSeconds}.${body}`).digest("hex");
  return `t=${tsSeconds},v0=${hex}`;
}

const samplePayload = JSON.stringify({
  type: "post_call_transcription",
  event_timestamp: 1,
  data: {
    conversation_id: "conv_abc",
    status: "done",
    metadata: { call_duration_secs: 137 },
    conversation_initiation_client_data: {
      dynamic_variables: { user_id: "user-uuid-123" },
    },
  },
});

test("valid signature + fresh timestamp verifies and parses", () => {
  const ts = Math.floor(Date.now() / 1000);
  const res = verifyAndParseElevenLabsWebhook(samplePayload, sign(samplePayload, ts), SECRET);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.event.data?.conversation_id, "conv_abc");
});

test("tampered body fails verification", () => {
  const ts = Math.floor(Date.now() / 1000);
  const header = sign(samplePayload, ts);
  const tampered = samplePayload.replace("137", "1");
  const res = verifyAndParseElevenLabsWebhook(tampered, header, SECRET);
  assert.equal(res.ok, false);
});

test("wrong secret fails verification", () => {
  const ts = Math.floor(Date.now() / 1000);
  const header = sign(samplePayload, ts, "wsec_attacker");
  const res = verifyAndParseElevenLabsWebhook(samplePayload, header, SECRET);
  assert.equal(res.ok, false);
});

test("stale timestamp (> 30 min) is rejected even with a valid hash", () => {
  const stale = Math.floor(Date.now() / 1000) - 31 * 60;
  const res = verifyAndParseElevenLabsWebhook(samplePayload, sign(samplePayload, stale), SECRET);
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.reason, /tolerance/);
});

test("missing / malformed signature header is rejected", () => {
  assert.equal(verifyAndParseElevenLabsWebhook(samplePayload, null, SECRET).ok, false);
  assert.equal(verifyAndParseElevenLabsWebhook(samplePayload, "garbage", SECRET).ok, false);
  assert.equal(
    verifyAndParseElevenLabsWebhook(samplePayload, "t=123", SECRET).ok,
    false,
  );
});

test("extractPostCallMetering pulls conversation id, user id, duration", () => {
  const meta = extractPostCallMetering(JSON.parse(samplePayload));
  assert.deepEqual(meta, {
    conversationId: "conv_abc",
    userId: "user-uuid-123",
    durationSecs: 137,
  });
});

test("extractPostCallMetering returns null for non post_call_transcription events", () => {
  assert.equal(extractPostCallMetering({ type: "post_call_audio", data: {} }), null);
});

test("extractPostCallMetering returns empty userId when dynamic var absent (caller skips)", () => {
  const meta = extractPostCallMetering({
    type: "post_call_transcription",
    data: { conversation_id: "c1", metadata: { call_duration_secs: 10 } },
  });
  assert.equal(meta?.userId, "");
  assert.equal(meta?.conversationId, "c1");
});
