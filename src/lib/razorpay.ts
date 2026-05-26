// Phase 9 — shared Razorpay client + Subscriptions wrappers. The seva one-time
// flow (src/app/api/seva/*) keeps its own inline client; this module is the
// shared home for the Subscriptions API used by the create + cancel routes so
// the client getter isn't duplicated. Server-only (reads RAZORPAY_KEY_SECRET).

import Razorpay from "razorpay";

let cachedClient: Razorpay | null = null;

/** Cached Razorpay client, or null if env vars are missing (caller 500s). */
export function getRazorpayClient(): Razorpay | null {
  if (cachedClient) return cachedClient;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    console.error("[razorpay] env vars missing", {
      hasId: !!keyId,
      hasSecret: !!keySecret,
    });
    return null;
  }
  cachedClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return cachedClient;
}

/** The subset of the Razorpay subscription object the app persists / returns. */
export interface CreatedSubscription {
  id: string;
  shortUrl: string;
  status: string;
  customerId: string | null;
  currentStart: number | null; // Unix seconds (null until first charge)
  currentEnd: number | null;
}

/**
 * Create a Razorpay Subscription against a plan. `total_count` is the number of
 * billing cycles before the subscription auto-completes (Razorpay requires it);
 * we set it high so it behaves as "until cancelled". `notes.user_id` is what the
 * webhook reads to attribute subscription.* events back to our user.
 *
 * Returns null on any failure (missing client / API error) — the caller maps
 * that to a 500 so the UI can show a retry, never a half-created state.
 */
export async function createRazorpaySubscription(params: {
  planId: string;
  totalCount: number;
  userId: string;
  notes?: Record<string, string>;
}): Promise<CreatedSubscription | null> {
  const rzp = getRazorpayClient();
  if (!rzp) return null;
  try {
    const sub = await rzp.subscriptions.create({
      plan_id: params.planId,
      total_count: params.totalCount,
      customer_notify: 1,
      notes: { user_id: params.userId, ...(params.notes ?? {}) },
    });
    if (!sub?.id || !sub.short_url) {
      console.error("[razorpay] subscription create returned no id/short_url:", sub);
      return null;
    }
    return {
      id: sub.id,
      shortUrl: sub.short_url,
      status: sub.status,
      customerId: sub.customer_id ?? null,
      currentStart: sub.current_start ?? null,
      currentEnd: sub.current_end ?? null,
    };
  } catch (e) {
    console.error("[razorpay] createRazorpaySubscription threw:", e);
    return null;
  }
}

/**
 * Cancel a Razorpay Subscription. `atCycleEnd=true` (default) lets the user keep
 * their entitlements until the paid period ends, then stops renewal — the
 * standard "cancel" UX. Pass false to cancel immediately. Returns false on any
 * failure so the route can surface a retry.
 */
export async function cancelRazorpaySubscription(
  subscriptionId: string,
  atCycleEnd: boolean = true,
): Promise<boolean> {
  const rzp = getRazorpayClient();
  if (!rzp) return false;
  try {
    await rzp.subscriptions.cancel(subscriptionId, atCycleEnd);
    return true;
  } catch (e) {
    console.error("[razorpay] cancelRazorpaySubscription threw:", e);
    return false;
  }
}
