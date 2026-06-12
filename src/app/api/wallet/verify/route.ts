import crypto from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getWalletPack } from "@/lib/subscriptions";
import { timingSafeEqualHex } from "@/lib/secureCompare";
import {
  findPaymentByOrderId,
  markPaymentVerifiedAtomic,
  markPaymentFailed,
  creditVoiceSeconds,
  fetchVoiceSecondsBalance,
  touchActivity,
} from "@/lib/supabase";

const USER_COOKIE = "god_messenger_uid";

// Phase 9 — verify a voice-wallet top-up + credit voice_seconds_balance.
// Mirrors /api/seva/verify exactly (same signature check + atomic status
// transition); only the credited resource differs (voice seconds, not seva
// messages). The payment.captured webhook is the async safety net.
export async function POST(req: Request) {
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value;
  if (!userId) {
    return NextResponse.json(
      { error: "no user identity on this request" },
      { status: 400 },
    );
  }

  let body: {
    razorpay_order_id?: unknown;
    razorpay_payment_id?: unknown;
    razorpay_signature?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const orderId =
    typeof body.razorpay_order_id === "string" ? body.razorpay_order_id : null;
  const paymentId =
    typeof body.razorpay_payment_id === "string"
      ? body.razorpay_payment_id
      : null;
  const signature =
    typeof body.razorpay_signature === "string" ? body.razorpay_signature : null;
  if (!orderId || !paymentId || !signature) {
    return NextResponse.json(
      {
        error:
          "razorpay_order_id, razorpay_payment_id, razorpay_signature all required",
      },
      { status: 400 },
    );
  }

  const payment = await findPaymentByOrderId(orderId);
  if (!payment) {
    return NextResponse.json({ error: "order not found" }, { status: 404 });
  }
  if (payment.user_id !== userId) {
    return NextResponse.json(
      { error: "order does not belong to this user" },
      { status: 403 },
    );
  }

  if (payment.status === "verified") {
    return NextResponse.json({
      ok: true,
      alreadyCredited: true,
      voice_seconds_balance: await fetchVoiceSecondsBalance(userId),
      pack_id: payment.tier,
    });
  }
  if (payment.status === "failed") {
    return NextResponse.json(
      { error: "order already marked failed" },
      { status: 400 },
    );
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    console.error("[wallet/verify] RAZORPAY_KEY_SECRET missing");
    return NextResponse.json(
      { error: "verify service unavailable" },
      { status: 500 },
    );
  }
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  if (!timingSafeEqualHex(expected, signature)) {
    await markPaymentFailed(orderId);
    return NextResponse.json({ error: "signature mismatch" }, { status: 400 });
  }

  const updated = await markPaymentVerifiedAtomic(orderId, paymentId);
  if (!updated) {
    // Raced with the webhook — already credited.
    return NextResponse.json({
      ok: true,
      alreadyCredited: true,
      voice_seconds_balance: await fetchVoiceSecondsBalance(userId),
      pack_id: payment.tier,
    });
  }

  let pack;
  try {
    pack = getWalletPack(updated.tier);
  } catch {
    console.error("[wallet/verify] stored payment has unknown pack:", updated.tier);
    return NextResponse.json(
      { error: "internal: unknown pack on stored payment" },
      { status: 500 },
    );
  }

  // creditVoiceSeconds upserts the users_memory row, so a voice-first buyer with
  // no row yet is handled (mirrors the seva touchActivity safeguard).
  await touchActivity(userId);
  const newBalance = await creditVoiceSeconds(userId, pack.minutes * 60);
  if (newBalance === null) {
    console.error(
      "[wallet/verify] creditVoiceSeconds failed for verified order:",
      orderId,
    );
    return NextResponse.json(
      { error: "credit failed; contact support" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    alreadyCredited: false,
    voice_seconds_balance: newBalance,
    pack_id: pack.id,
    credited_minutes: pack.minutes,
  });
}
