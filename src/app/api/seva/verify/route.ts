import crypto from "crypto";
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getTier } from "@/lib/seva";
import { fireMetaEvent } from "@/lib/metaEvents";
import { fireGoogleAdsConversion } from "@/lib/googleAdsEvents";
import {
  findPaymentByOrderId,
  markPaymentVerifiedAtomic,
  markPaymentFailed,
  creditSevaBalance,
  fetchMemory,
  touchActivity,
} from "@/lib/supabase";

const USER_COOKIE = "god_messenger_uid";

export async function POST(req: Request) {
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value;
  const gclid = jar.get("dv_gclid")?.value ?? null;
  const headersList = await headers();
  const clientIp = headersList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientUserAgent = headersList.get("user-agent") ?? undefined;
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

  // A voice-first payer (someone who buys seva before ever sending a chat
  // message — e.g. landing straight on /voice) has NO users_memory row yet.
  // credit_seva_balance is UPDATE-only (returns null for a missing row), so
  // without this the credit would 500 here — the payment is already marked
  // verified above, so the user would be charged, lose their purchased
  // messages, AND see the voice paywall persist until a manual reload. Ensure
  // the row exists first: touchActivity is an idempotent upsert that only
  // writes user_id + last_active_at, never clobbering seva_balance on an
  // existing row.
  await touchActivity(userId);
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

  // Fire Purchase events + mark lead converted — non-blocking async IIFE so the
  // response returns immediately without waiting for external API calls.
  void (async () => {
    const supabaseLocal = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: leadRow } = await supabaseLocal
      .from("journey_leads")
      .select("email")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const leadEmail: string | undefined = leadRow?.email ?? undefined;
    const valueRupees = payment.amount_paise / 100;
    await Promise.allSettled([
      fireMetaEvent(
        "Purchase",
        { email: leadEmail, clientIp, clientUserAgent },
        { currency: "INR", value: valueRupees },
        "https://divyavani.co.in/chat",
      ),
      fireGoogleAdsConversion({
        conversionActionId: process.env.GOOGLE_ADS_CONVERSION_PURCHASE_ID,
        gclid,
        email: leadEmail,
        valueRupees,
      }),
      leadEmail
        ? supabaseLocal
            .from("journey_leads")
            .update({ converted_at: new Date().toISOString() })
            .eq("user_id", userId)
            .is("converted_at", null)
        : Promise.resolve(),
    ]);
  })();

  return NextResponse.json({
    ok: true,
    alreadyCredited: false,
    new_balance: newBalance,
    tier_id: tier.id,
    credited: tier.messages,
  });
}
