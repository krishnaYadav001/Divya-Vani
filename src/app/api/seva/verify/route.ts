import crypto from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getTier } from "@/lib/seva";
import {
  findPaymentByOrderId,
  markPaymentVerifiedAtomic,
  markPaymentFailed,
  creditSevaBalance,
  fetchMemory,
} from "@/lib/supabase";

const USER_COOKIE = "god_messenger_uid";

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
    const memory = await fetchMemory(userId);
    return NextResponse.json({
      ok: true,
      alreadyCredited: true,
      new_balance: memory?.seva_balance ?? 0,
      tier_id: payment.tier,
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
    console.error("[seva/verify] RAZORPAY_KEY_SECRET missing");
    return NextResponse.json(
      { error: "verify service unavailable" },
      { status: 500 },
    );
  }
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  if (expected !== signature) {
    await markPaymentFailed(orderId);
    return NextResponse.json({ error: "signature mismatch" }, { status: 400 });
  }

  const updated = await markPaymentVerifiedAtomic(orderId, paymentId);
  if (!updated) {
    const memory = await fetchMemory(userId);
    return NextResponse.json({
      ok: true,
      alreadyCredited: true,
      new_balance: memory?.seva_balance ?? 0,
      tier_id: payment.tier,
    });
  }

  let tier;
  try {
    tier = getTier(updated.tier);
  } catch {
    console.error("[seva/verify] stored payment has unknown tier:", updated.tier);
    return NextResponse.json(
      { error: "internal: unknown tier on stored payment" },
      { status: 500 },
    );
  }

  const newBalance = await creditSevaBalance(userId, tier.messages);
  if (newBalance === null) {
    console.error(
      "[seva/verify] creditSevaBalance failed for verified order:",
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
    new_balance: newBalance,
    tier_id: tier.id,
    credited: tier.messages,
  });
}
