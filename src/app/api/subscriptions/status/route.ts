import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchActiveSubscription } from "@/lib/supabase";

const USER_COOKIE = "god_messenger_uid";

// Phase 9 — read the caller's active subscription for the Settings panel (and
// for re-polling after Checkout, since activation is webhook-driven and lands a
// few seconds later). Returns a trimmed summary; never the raw row.
export async function GET() {
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value;
  if (!userId) {
    return NextResponse.json({ active: false, subscription: null });
  }

  const sub = await fetchActiveSubscription(userId);
  if (!sub) {
    return NextResponse.json({ active: false, subscription: null });
  }

  return NextResponse.json({
    active: true,
    subscription: {
      plan_key: sub.plan_key,
      currency: sub.currency,
      billing_period: sub.billing_period,
      status: sub.status,
      message_pool: sub.message_pool,
      messages_used: sub.messages_used,
      voice_minutes_pool: sub.voice_minutes_pool,
      voice_seconds_used: sub.voice_seconds_used,
      current_period_end: sub.current_period_end ?? null,
      cancel_at_period_end: sub.cancel_at_period_end,
    },
  });
}
