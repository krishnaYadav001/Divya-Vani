import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getWalletPack } from "@/lib/subscriptions";
import { getRazorpayClient } from "@/lib/razorpay";
import { insertPayment } from "@/lib/supabase";

const USER_COOKIE = "god_messenger_uid";

// Phase 9 — voice-minute WALLET top-up: a ONE-TIME Razorpay order (not a
// subscription), modelled on /api/seva/create-order. The pack id is stored as
// payments.tier; /api/wallet/verify credits voice_seconds_balance on success.
export async function POST(req: Request) {
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value;
  if (!userId) {
    return NextResponse.json(
      { error: "no user identity on this request" },
      { status: 400 },
    );
  }

  let body: { packId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  if (typeof body.packId !== "string" || !body.packId) {
    return NextResponse.json({ error: "packId required" }, { status: 400 });
  }

  let pack;
  try {
    pack = getWalletPack(body.packId);
  } catch {
    return NextResponse.json({ error: "unknown wallet pack" }, { status: 400 });
  }

  const rzp = getRazorpayClient();
  if (!rzp) {
    return NextResponse.json(
      { error: "payment service unavailable" },
      { status: 500 },
    );
  }

  let order;
  try {
    order = await rzp.orders.create({
      amount: pack.amount, // smallest unit: paise (INR) / cents (USD)
      currency: pack.currency,
      receipt: `wallet_${Date.now().toString(36)}`,
      notes: { user_id: userId, pack: pack.id, kind: "voice_wallet" },
    });
  } catch (e) {
    console.error("[wallet/create-order] orders.create threw:", e);
    return NextResponse.json(
      { error: "could not create order" },
      { status: 500 },
    );
  }

  if (!order?.id || typeof order.id !== "string") {
    console.error("[wallet/create-order] order missing id:", order);
    return NextResponse.json(
      { error: "could not create order" },
      { status: 500 },
    );
  }

  const inserted = await insertPayment({
    user_id: userId,
    razorpay_order_id: order.id,
    amount_paise: pack.amount,
    tier: pack.id, // wallet pack id (free-text tier column)
    status: "created",
  });
  if (!inserted) {
    return NextResponse.json(
      { error: "could not record order" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    order_id: order.id,
    amount: pack.amount,
    currency: pack.currency,
    key_id: process.env.RAZORPAY_KEY_ID,
    pack_id: pack.id,
    minutes: pack.minutes,
    display: pack.display,
  });
}
