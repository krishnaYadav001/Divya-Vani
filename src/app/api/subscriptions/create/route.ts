import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getPlan,
  type Currency,
  type PlanKey,
} from "@/lib/subscriptions";
import {
  createRazorpaySubscription,
  cancelRazorpaySubscription,
} from "@/lib/razorpay";
import {
  fetchInProgressSubscription,
  insertSubscription,
  updateSubscriptionStatus,
} from "@/lib/supabase";

const USER_COOKIE = "god_messenger_uid";

// Razorpay requires a finite total_count (cycles before the subscription
// auto-completes). Set ~10 years so it behaves as "until cancelled".
const TOTAL_COUNT_BY_PERIOD: Record<string, number> = {
  monthly: 120,
  annual: 10,
};

// A 'created' subscription is a checkout the user started but never
// authenticated. Within this window we treat it as the SAME in-progress
// checkout and resume it (no second Razorpay subscription); past it, it's an
// abandoned cart we retire before minting a fresh one.
const STALE_CREATED_MS = 15 * 60 * 1000;

function isCurrency(v: unknown): v is Currency {
  return v === "INR" || v === "USD";
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

  let body: { planKey?: unknown; currency?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  if (typeof body.planKey !== "string" || !body.planKey) {
    return NextResponse.json({ error: "planKey required" }, { status: 400 });
  }
  if (!isCurrency(body.currency)) {
    return NextResponse.json(
      { error: "currency must be INR or USD" },
      { status: 400 },
    );
  }
  const currency: Currency = body.currency;

  let plan;
  try {
    plan = getPlan(body.planKey);
  } catch {
    return NextResponse.json({ error: "unknown plan" }, { status: 400 });
  }
  const planKey: PlanKey = plan.key;

  // One offer per currency at launch (INR-monthly or USD-annual). Pick it.
  const offer = plan.offers.find((o) => o.currency === currency);
  if (!offer) {
    return NextResponse.json(
      { error: `no ${currency} offer for ${planKey}` },
      { status: 400 },
    );
  }

  const planId = process.env[offer.planIdEnv];
  if (!planId) {
    console.error(
      `[subscriptions/create] plan id env not set: ${offer.planIdEnv}`,
    );
    return NextResponse.json(
      { error: "subscription plans not configured" },
      { status: 500 },
    );
  }

  // Prevent a SECOND chargeable subscription alongside an existing one. We look
  // at any non-terminal sub (created/authenticated/active/pending/halted), not
  // just 'active': two authenticated mandates would silently double-charge (the
  // 2nd can never go 'active' under the one-active-per-user partial unique
  // index, yet Razorpay keeps charging it forever).
  const existing = await fetchInProgressSubscription(userId);
  if (existing) {
    if (existing.status !== "created") {
      // A live or in-flight mandate (active / authenticated / pending / halted)
      // — refuse a new one. The Settings panel handles upgrades/cancel.
      return NextResponse.json(
        { error: "already_subscribed", plan_key: existing.plan_key, status: existing.status },
        { status: 409 },
      );
    }
    // status === 'created': a checkout was started but never authenticated.
    const sameOffer =
      existing.plan_key === planKey && existing.currency === currency;
    const ageMs = Date.now() - new Date(existing.created_at ?? 0).getTime();
    if (sameOffer && ageMs < STALE_CREATED_MS) {
      // Same plan, still fresh → resume the SAME Razorpay subscription instead
      // of minting a duplicate. Checkout only needs the subscription_id.
      return NextResponse.json({
        subscription_id: existing.razorpay_subscription_id,
        short_url: null,
        key_id: process.env.RAZORPAY_KEY_ID,
        plan_key: planKey,
        currency,
        period: offer.period,
        amount: offer.amount,
        display: offer.display,
        plan_name: plan.displayName,
        resumed: true,
      });
    }
    // Different plan, or an abandoned/stale checkout → retire the old 'created'
    // subscription (best-effort cancel at Razorpay + mark expired locally) so
    // the user can never end up holding two chargeable subscriptions.
    await cancelRazorpaySubscription(existing.razorpay_subscription_id, false).catch(
      () => {},
    );
    await updateSubscriptionStatus(existing.razorpay_subscription_id, {
      status: "expired",
    });
  }

  const totalCount = TOTAL_COUNT_BY_PERIOD[offer.period] ?? 120;

  const sub = await createRazorpaySubscription({
    planId,
    totalCount,
    userId,
    notes: { plan_key: planKey, currency, period: offer.period },
  });
  if (!sub) {
    return NextResponse.json(
      { error: "could not create subscription" },
      { status: 500 },
    );
  }

  const recorded = await insertSubscription({
    user_id: userId,
    razorpay_subscription_id: sub.id,
    razorpay_customer_id: sub.customerId,
    plan_key: planKey,
    currency,
    billing_period: offer.period,
    status: "created",
    message_pool: plan.entitlement.messagePool,
    voice_minutes_pool: plan.entitlement.voiceMinutes,
    amount: offer.amount,
  });
  if (!recorded) {
    // The Razorpay subscription exists but we couldn't persist it. Don't hand
    // back a checkout whose activation we can't attribute — the webhook would
    // arrive for an unknown subscription. The user can retry (creates a fresh
    // one); the orphan never activates because the user won't pay it.
    console.error(
      "[subscriptions/create] insertSubscription failed; orphan Razorpay sub:",
      sub.id,
    );
    return NextResponse.json(
      { error: "could not record subscription" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    subscription_id: sub.id,
    short_url: sub.shortUrl,
    key_id: process.env.RAZORPAY_KEY_ID,
    plan_key: planKey,
    currency,
    period: offer.period,
    amount: offer.amount,
    display: offer.display,
    plan_name: plan.displayName,
  });
}
