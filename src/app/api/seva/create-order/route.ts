import Razorpay from "razorpay";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getTier, getTierAmount } from "@/lib/seva";
import type { Currency } from "@/lib/subscriptions";
import { insertPayment } from "@/lib/supabase";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rateLimit";

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

  // Shared rate limit (Upstash) — order creation should be rare per user;
  // bound by cookie user-id + client IP to stop order/row spam. Fail-open on
  // Redis unavailability so a blip never blocks a genuine purchase.
  {
    const rl = await checkRateLimit(
      "seva_create_order",
      userId,
      clientIpFromRequest(req),
    );
    if (!rl.ok) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }
  }

  let body: { tier?: unknown; currency?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  if (typeof body.tier !== "string" || !body.tier) {
    return NextResponse.json({ error: "tier required" }, { status: 400 });
  }
  // Currency is region-decided client-side (India → INR, else → USD), mirroring
  // the wallet/subscription flows. Default to INR if absent or unrecognized so
  // an older client or a malformed request never breaks the (INR) happy path.
  const currency: Currency = body.currency === "USD" ? "USD" : "INR";

  let tier;
  try {
    tier = getTier(body.tier);
  } catch {
    return NextResponse.json({ error: "unknown tier" }, { status: 400 });
  }
  const amount = getTierAmount(tier, currency);

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
      amount,
      currency,
      receipt: `seva_${Date.now().toString(36)}`,
      notes: { user_id: userId, tier: tier.id, currency },
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
    // Stored in the charged smallest unit: paise (INR) or cents (USD). The
    // currency is recoverable from this amount via inferCurrencyFromAmount
    // (INR-paise and USD-cents never collide for any tier) — matching the
    // wallet flow, which likewise stores cents in this column for USD packs.
    amount_paise: amount,
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
    amount,
    currency,
    key_id: process.env.RAZORPAY_KEY_ID,
    tier_id: tier.id,
    messages: tier.messages,
  });
}
