import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cancelRazorpaySubscription } from "@/lib/razorpay";
import {
  fetchActiveSubscription,
  updateSubscriptionStatus,
} from "@/lib/supabase";

const USER_COOKIE = "god_messenger_uid";

export async function POST() {
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value;
  if (!userId) {
    return NextResponse.json(
      { error: "no user identity on this request" },
      { status: 400 },
    );
  }

  const sub = await fetchActiveSubscription(userId);
  if (!sub) {
    return NextResponse.json(
      { error: "no_active_subscription" },
      { status: 404 },
    );
  }

  // Already scheduled to cancel — idempotent success (double-tap / retry).
  if (sub.cancel_at_period_end) {
    return NextResponse.json({
      ok: true,
      cancel_at_period_end: true,
      current_period_end: sub.current_period_end ?? null,
    });
  }

  // cancel_at_cycle_end:true keeps entitlements until the paid period ends, then
  // stops renewal. Razorpay fires subscription.cancelled at that point → the
  // webhook flips status to 'cancelled'. Until then we mark the intent so the
  // Settings panel can show "cancels on <date>" and entitlements keep working.
  const cancelled = await cancelRazorpaySubscription(
    sub.razorpay_subscription_id,
    true,
  );
  if (!cancelled) {
    return NextResponse.json(
      { error: "could not cancel subscription" },
      { status: 500 },
    );
  }

  await updateSubscriptionStatus(sub.razorpay_subscription_id, {
    cancel_at_period_end: true,
  });

  return NextResponse.json({
    ok: true,
    cancel_at_period_end: true,
    current_period_end: sub.current_period_end ?? null,
  });
}
