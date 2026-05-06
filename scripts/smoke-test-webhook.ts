// Phase 5.3 Razorpay webhook smoke test (local dev only).
//
// Programmatically exercises /api/razorpay/webhook through five scenarios
// with hard assertions. Connects to Supabase via the service role key for
// setup / verification / cleanup. POSTs to localhost:3000 (dev server must
// already be running). Cleanup runs in a try/finally so partial-run state
// never persists, even on failure.
//
// Scenarios:
//   1. payment.captured fresh        → recovery path, status flip + 6-msg credit
//   2. idempotency replay            → fixed event_id, posted twice, second
//                                      hits hasProcessedEvent short-circuit
//   3. tampered body                 → original signature + mutated body → 400
//   4. payment.failed                → fresh order, status flip, no credit
//   5. refund.created                → refund tracked, balance NOT auto-debited
//
// USAGE:
//   Terminal A:  npm run dev
//   Terminal B:  npm run smoke:webhook
//
// EXIT: 0 on all-pass, 1 on first-failure (with cleanup still performed).

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "smoke-test-webhook.ts must not run against production",
  );
}

const BASE = process.env.WEBHOOK_BASE_URL ?? "http://localhost:3000";
const TEST_USER_ID = "test_user";
const ORDER_1 = "order_TESTSYNTH_001";
const ORDER_2 = "order_TESTSYNTH_002";
const REFUND_ID = "rfnd_TESTSYNTH_001";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required (load via --env-file=.env.local)",
  );
}
if (!RAZORPAY_WEBHOOK_SECRET) {
  throw new Error(
    "RAZORPAY_WEBHOOK_SECRET required (load via --env-file=.env.local)",
  );
}

const WEBHOOK_SECRET: string = RAZORPAY_WEBHOOK_SECRET;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function computeSignature(body: string): string {
  return crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
}

interface WebhookResponseBody {
  ok?: boolean;
  alreadyProcessed?: boolean;
  error?: string;
}

interface PostResult {
  status: number;
  json: WebhookResponseBody;
}

async function postWebhook(
  body: string,
  eventId: string,
  signature?: string,
): Promise<PostResult> {
  const sig = signature ?? computeSignature(body);
  const res = await fetch(`${BASE}/api/razorpay/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": sig,
      "x-razorpay-event-id": eventId,
    },
    body,
  });
  const text = await res.text();
  let json: WebhookResponseBody;
  try {
    json = text ? (JSON.parse(text) as WebhookResponseBody) : {};
  } catch {
    throw new Error(
      `response not JSON (status ${res.status}): ${text.slice(0, 200)}`,
    );
  }
  return { status: res.status, json };
}

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

async function readPayment(orderId: string) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("razorpay_order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(`readPayment ${orderId}: ${error.message}`);
  return data;
}

async function readSevaBalance(): Promise<number> {
  const { data, error } = await supabase
    .from("users_memory")
    .select("seva_balance")
    .eq("user_id", TEST_USER_ID)
    .maybeSingle();
  if (error) throw new Error(`readSevaBalance: ${error.message}`);
  return data?.seva_balance ?? 0;
}

async function readWebhookEvent(eventId: string) {
  const { data, error } = await supabase
    .from("webhook_events")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw new Error(`readWebhookEvent ${eventId}: ${error.message}`);
  return data;
}

async function cleanup(): Promise<void> {
  await supabase.from("webhook_events").delete().like("event_id", "evt_test_%");
  await supabase.from("payments").delete().eq("user_id", TEST_USER_ID);
  await supabase.from("users_memory").delete().eq("user_id", TEST_USER_ID);
}

async function setup(): Promise<void> {
  await cleanup();

  const { error: e1 } = await supabase.from("users_memory").upsert(
    {
      user_id: TEST_USER_ID,
      message_count: 0,
      seva_balance: 0,
    },
    { onConflict: "user_id" },
  );
  if (e1) throw new Error(`setup users_memory: ${e1.message}`);

  const { error: e2 } = await supabase.from("payments").insert({
    user_id: TEST_USER_ID,
    razorpay_order_id: ORDER_1,
    amount_paise: 1100,
    tier: "pratham_seva",
    status: "created",
  });
  if (e2) throw new Error(`setup payments(${ORDER_1}): ${e2.message}`);

  console.log(
    `[setup] inserted users_memory(${TEST_USER_ID}) + payments(${ORDER_1}, status=created)`,
  );
}

async function scenario1(): Promise<string> {
  console.log("\n--- Scenario 1: payment.captured fresh ---");
  const paymentId = `pay_TESTSYNTH_${Date.now()}`;
  const eventId = `evt_test_captured_${Date.now()}`;
  const body = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: { entity: { order_id: ORDER_1, id: paymentId } },
    },
  });

  const res = await postWebhook(body, eventId);
  assertEq(res.status, 200, "S1 HTTP status");
  assertEq(res.json.ok, true, "S1 body.ok");

  const row = await readPayment(ORDER_1);
  if (!row) throw new Error(`S1: payments(${ORDER_1}) missing`);
  assertEq(row.status, "verified", "S1 payments.status");
  assertEq(row.razorpay_payment_id, paymentId, "S1 razorpay_payment_id");
  if (!row.verified_at) throw new Error("S1: verified_at not set");
  const ageMs = Date.now() - new Date(row.verified_at).getTime();
  if (ageMs > 60_000) {
    throw new Error(`S1: verified_at too old (${ageMs}ms; expected <60000)`);
  }

  const balance = await readSevaBalance();
  assertEq(balance, 6, "S1 seva_balance");

  const evt = await readWebhookEvent(eventId);
  if (!evt) throw new Error(`S1: webhook_events row for ${eventId} missing`);
  assertEq(evt.event_type, "payment.captured", "S1 event_type");

  console.log(
    `PASS — Scenario 1: ${ORDER_1} verified, paymentId=${paymentId}, balance=6`,
  );
  return paymentId;
}

async function scenario2(): Promise<void> {
  console.log("\n--- Scenario 2: idempotency replay ---");
  const eventId = "evt_test_replay_001";
  const paymentId = `pay_TESTSYNTH_REPLAY_${Date.now()}`;
  const body = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: { entity: { order_id: ORDER_1, id: paymentId } },
    },
  });

  const r1 = await postWebhook(body, eventId);
  assertEq(r1.status, 200, "S2 first HTTP status");
  assertEq(r1.json.ok, true, "S2 first body.ok");
  if (r1.json.alreadyProcessed !== undefined) {
    throw new Error(
      `S2 first: unexpected alreadyProcessed=${r1.json.alreadyProcessed} (expected absent)`,
    );
  }

  const r2 = await postWebhook(body, eventId);
  assertEq(r2.status, 200, "S2 replay HTTP status");
  assertEq(r2.json.ok, true, "S2 replay body.ok");
  assertEq(r2.json.alreadyProcessed, true, "S2 replay alreadyProcessed");

  const balance = await readSevaBalance();
  assertEq(balance, 6, "S2 seva_balance unchanged");

  console.log(
    `PASS — Scenario 2: replay ${eventId} short-circuited, balance still 6`,
  );
}

async function scenario3(): Promise<void> {
  console.log("\n--- Scenario 3: tampered body ---");
  const eventId = `evt_test_tampered_${Date.now()}`;
  const legit = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: { entity: { order_id: ORDER_1, id: "pay_LEGIT_999" } },
    },
  });
  const sig = computeSignature(legit);
  const tampered = legit.replace("pay_LEGIT_999", "pay_HACKED_999");

  const res = await postWebhook(tampered, eventId, sig);
  assertEq(res.status, 400, "S3 HTTP status");
  assertEq(res.json.error, "signature mismatch", "S3 body.error");

  const evt = await readWebhookEvent(eventId);
  if (evt) {
    throw new Error(
      `S3: webhook_events should be empty for ${eventId}, found row`,
    );
  }

  const row = await readPayment(ORDER_1);
  if (!row) throw new Error(`S3: payments(${ORDER_1}) vanished`);
  assertEq(row.status, "verified", "S3 payments.status (unchanged)");
  if (row.razorpay_payment_id === "pay_HACKED_999") {
    throw new Error("S3: payments.razorpay_payment_id was tampered");
  }

  console.log(
    `PASS — Scenario 3: tampered body → 400, no DB writes for ${eventId}`,
  );
}

async function scenario4(): Promise<void> {
  console.log("\n--- Scenario 4: payment.failed ---");
  const { error } = await supabase.from("payments").insert({
    user_id: TEST_USER_ID,
    razorpay_order_id: ORDER_2,
    amount_paise: 1100,
    tier: "pratham_seva",
    status: "created",
  });
  if (error) throw new Error(`S4 setup payments(${ORDER_2}): ${error.message}`);

  const paymentId = `pay_TESTSYNTH_FAIL_${Date.now()}`;
  const eventId = `evt_test_failed_${Date.now()}`;
  const body = JSON.stringify({
    event: "payment.failed",
    payload: {
      payment: {
        entity: {
          order_id: ORDER_2,
          id: paymentId,
          error_code: "BAD_REQUEST_ERROR",
        },
      },
    },
  });

  const res = await postWebhook(body, eventId);
  assertEq(res.status, 200, "S4 HTTP status");
  assertEq(res.json.ok, true, "S4 body.ok");

  const row = await readPayment(ORDER_2);
  if (!row) throw new Error(`S4: payments(${ORDER_2}) missing`);
  assertEq(row.status, "failed", "S4 payments.status");

  const balance = await readSevaBalance();
  assertEq(balance, 6, "S4 seva_balance unchanged");

  console.log(
    `PASS — Scenario 4: ${ORDER_2} flipped to failed, balance still 6`,
  );
}

async function scenario5(s1PaymentId: string): Promise<void> {
  console.log("\n--- Scenario 5: refund.created ---");
  const eventId = `evt_test_refund_${Date.now()}`;
  const body = JSON.stringify({
    event: "refund.created",
    payload: {
      refund: {
        entity: {
          id: REFUND_ID,
          payment_id: s1PaymentId,
          amount: 1100,
          currency: "INR",
        },
      },
    },
  });

  const res = await postWebhook(body, eventId);
  assertEq(res.status, 200, "S5 HTTP status");
  assertEq(res.json.ok, true, "S5 body.ok");

  const row = await readPayment(ORDER_1);
  if (!row) throw new Error(`S5: payments(${ORDER_1}) missing`);
  if (!row.refunded_at) throw new Error("S5: refunded_at not set");
  assertEq(row.razorpay_refund_id, REFUND_ID, "S5 razorpay_refund_id");

  const balance = await readSevaBalance();
  assertEq(balance, 6, "S5 seva_balance unchanged (no auto-debit in v1)");

  console.log(
    `PASS — Scenario 5: refund tracked on ${ORDER_1}, balance preserved at 6`,
  );
}

async function main(): Promise<void> {
  let passed = 0;
  let failedAt: number | null = null;
  let failedErr: unknown = null;

  try {
    await setup();
    const s1PaymentId = await scenario1();
    passed = 1;
    await scenario2();
    passed = 2;
    await scenario3();
    passed = 3;
    await scenario4();
    passed = 4;
    await scenario5(s1PaymentId);
    passed = 5;
  } catch (e) {
    failedAt = passed + 1;
    failedErr = e;
  } finally {
    try {
      await cleanup();
      console.log(
        "\n[cleanup] removed test_user rows + evt_test_* webhook_events",
      );
    } catch (e) {
      console.error(
        "[cleanup] failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  console.log("");
  if (failedAt === null) {
    console.log("✅ 5/5 scenarios passed");
    process.exit(0);
  } else {
    console.log(`❌ ${passed}/5 passed (failed at: scenario ${failedAt})`);
    if (failedErr instanceof Error) {
      console.error(failedErr.stack ?? failedErr.message);
    } else {
      console.error(failedErr);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
