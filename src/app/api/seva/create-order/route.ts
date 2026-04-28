import Razorpay from "razorpay";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getTier } from "@/lib/seva";
import { insertPayment } from "@/lib/supabase";

const USER_COOKIE = "god_messenger_uid";

let cachedClient: Razorpay | null = null;
function getRazorpay(): Razorpay | null {
  if (cachedClient) return cachedClient;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    console.error("[seva/create-order] Razorpay env vars missing", {
      hasId: !!keyId,
      hasSecret: !!keySecret,
    });
    return null;
  }
  cachedClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return cachedClient;
}

export async function POST(req: Request) {
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value;
  if (!userId) {
    return NextResponse.json(
      { error: "no user identity on this request" },
      { status: 400 },
    );
  }

  let body: { tier?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  if (typeof body.tier !== "string" || !body.tier) {
    return NextResponse.json({ error: "tier required" }, { status: 400 });
  }

  let tier;
  try {
    tier = getTier(body.tier);
  } catch {
    return NextResponse.json({ error: "unknown tier" }, { status: 400 });
  }

  const rzp = getRazorpay();
  if (!rzp) {
    return NextResponse.json(
      { error: "payment service unavailable" },
      { status: 500 },
    );
  }

  let order;
  try {
    order = await rzp.orders.create({
      amount: tier.amountPaise,
      currency: "INR",
      receipt: `seva_${Date.now().toString(36)}`,
      notes: { user_id: userId, tier: tier.id },
    });
  } catch (e) {
    console.error("[seva/create-order] orders.create threw:", e);
    return NextResponse.json(
      { error: "could not create order" },
      { status: 500 },
    );
  }

  if (!order?.id || typeof order.id !== "string") {
    console.error("[seva/create-order] order missing id:", order);
    return NextResponse.json(
      { error: "could not create order" },
      { status: 500 },
    );
  }

  const inserted = await insertPayment({
    user_id: userId,
    razorpay_order_id: order.id,
    amount_paise: tier.amountPaise,
    tier: tier.id,
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
    amount: tier.amountPaise,
    currency: "INR",
    key_id: process.env.RAZORPAY_KEY_ID,
    tier_id: tier.id,
    messages: tier.messages,
  });
}
