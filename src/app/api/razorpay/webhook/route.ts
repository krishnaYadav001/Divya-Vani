import crypto from "crypto";
import { NextResponse } from "next/server";
import { getTier } from "@/lib/seva";
import { getWalletPack } from "@/lib/subscriptions";
import { timingSafeEqualHex } from "@/lib/secureCompare";
import {
  findPaymentByOrderId,
  findPaymentByPaymentId,
  markPaymentVerifiedAtomic,
  markPaymentFailed,
  markPaymentRefunded,
  creditSevaBalance,
  creditVoiceSeconds,
  hasProcessedEvent,
  recordEvent,
  fetchMemory,
  saveMemory,
  touchActivity,
  updateSubscriptionStatus,
  resetSubscriptionCycleUsage,
  type SubscriptionStatus,
} from "@/lib/supabase";

interface RazorpayPaymentEntity {
  id?: string;
  order_id?: string;
}

interface RazorpayRefundEntity {
  id?: string;
  payment_id?: string;
  amount?: number;
}

interface RazorpaySubscriptionEntity {
  id?: string;
  status?: string;
  current_start?: number | null;
  current_end?: number | null;
  customer_id?: string | null;
  ended_at?: number | null;
}

interface RazorpayWebhookEvent {
  event?: unknown;
  payload?: {
    payment?: { entity?: RazorpayPaymentEntity };
    refund?: { entity?: RazorpayRefundEntity };
    subscription?: { entity?: RazorpaySubscriptionEntity };
  };
}

// Razorpay timestamps are Unix SECONDS; our columns are timestamptz. Null/0 → null.
function unixToIso(sec?: number | null): string | null {
  return typeof sec === "number" && sec > 0
    ? new Date(sec * 1000).toISOString()
    : null;
}

export async function POST(req: Request) {
  try {
    // Razorpay HMAC is computed over the RAW request body — must use req.text(),
    // not req.json(), so the exact byte sequence is preserved for verification.
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");
    const eventId = req.headers.get("x-razorpay-event-id");

    if (!signature || !eventId) {
      console.error("[razorpay/webhook] missing required headers", {
        hasSignature: !!signature,
        hasEventId: !!eventId,
      });
      return NextResponse.json(
        { error: "missing required headers" },
        { status: 400 },
      );
    }

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[razorpay/webhook] RAZORPAY_WEBHOOK_SECRET missing");
      return NextResponse.json(
        { error: "webhook service unavailable" },
        { status: 500 },
      );
    }

    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");
    if (!timingSafeEqualHex(expected, signature)) {
      console.error("[razorpay/webhook] signature mismatch", { eventId });
      return NextResponse.json(
        { error: "signature mismatch" },
        { status: 400 },
      );
    }

    if (await hasProcessedEvent(eventId)) {
      console.log(
        "[razorpay/webhook] duplicate event, short-circuit:",
        eventId,
      );
      return NextResponse.json(
        { ok: true, alreadyProcessed: true },
        { status: 200 },
      );
    }

    let event: RazorpayWebhookEvent;
    try {
      event = JSON.parse(rawBody);
    } catch {
      console.error("[razorpay/webhook] body is not valid JSON");
      return NextResponse.json(
        { error: "invalid event body" },
        { status: 400 },
      );
    }
    if (typeof event.event !== "string") {
      console.error("[razorpay/webhook] event.event is not a string");
      return NextResponse.json(
        { error: "invalid event shape" },
        { status: 400 },
      );
    }
    const eventType: string = event.event;

    switch (eventType) {
      case "payment.captured": {
        const payment = event.payload?.payment?.entity;
        if (!payment?.order_id || !payment?.id) {
          console.error(
            "[razorpay/webhook] payment.captured: missing order_id or id",
          );
          break;
        }
        const orderId = payment.order_id;
        const paymentId = payment.id;
        const row = await findPaymentByOrderId(orderId);
        if (!row) {
          console.log(
            "[razorpay/webhook] captured for unknown order_id — Razorpay-only payment, ignoring:",
            orderId,
          );
          break;
        }
        if (row.status === "verified") {
          console.log(
            "[razorpay/webhook] already verified via /api/seva/verify, no-op:",
            orderId,
          );
          break;
        }
        if (row.status === "created") {
          const updated = await markPaymentVerifiedAtomic(orderId, paymentId);
          if (!updated) {
            console.log(
              "[razorpay/webhook] markPaymentVerifiedAtomic returned no row (raced with verify), no-op:",
              orderId,
            );
            break;
          }
          // Voice-first payers have no users_memory row yet and the credit RPCs
          // need one; touchActivity is an idempotent upsert (never clobbers an
          // existing balance) so the recovery credits instead of dropping the
          // purchase.
          await touchActivity(updated.user_id);

          // A wallet top-up (Phase 9) stores its pack id as the tier → credit
          // voice seconds. Otherwise it's a seva tier → credit messages.
          let walletPack = null;
          try {
            walletPack = getWalletPack(updated.tier);
          } catch {
            /* not a wallet pack — fall through to the seva path */
          }
          if (walletPack) {
            const newSeconds = await creditVoiceSeconds(
              updated.user_id,
              walletPack.minutes * 60,
            );
            if (newSeconds === null) {
              console.error(
                "[razorpay/webhook] creditVoiceSeconds failed for recovered wallet order:",
                orderId,
              );
              break;
            }
            console.log("[razorpay/webhook] recovered + credited voice wallet:", {
              orderId,
              paymentId,
              pack: walletPack.id,
              creditedMinutes: walletPack.minutes,
              newSeconds,
            });
            break;
          }

          let tier;
          try {
            tier = getTier(updated.tier);
          } catch {
            console.error(
              "[razorpay/webhook] stored payment has unknown tier:",
              updated.tier,
            );
            break;
          }
          const newBalance = await creditSevaBalance(
            updated.user_id,
            tier.messages,
          );
          if (newBalance === null) {
            console.error(
              "[razorpay/webhook] creditSevaBalance failed for recovered order:",
              orderId,
            );
            break;
          }
          console.log("[razorpay/webhook] recovered + credited:", {
            orderId,
            paymentId,
            tier: tier.id,
            credited: tier.messages,
            newBalance,
          });
        }
        break;
      }
      case "payment.failed": {
        const payment = event.payload?.payment?.entity;
        if (!payment?.order_id) {
          console.error("[razorpay/webhook] payment.failed: missing order_id");
          break;
        }
        const orderId = payment.order_id;
        const row = await findPaymentByOrderId(orderId);
        if (row?.status === "created") {
          await markPaymentFailed(orderId);
          console.log("[razorpay/webhook] marked failed:", orderId);
        } else {
          console.log(
            "[razorpay/webhook] payment.failed for non-created order, no-op:",
            { orderId, status: row?.status ?? "missing" },
          );
        }
        break;
      }
      case "refund.created": {
        const refund = event.payload?.refund?.entity;
        if (!refund?.payment_id || !refund?.id) {
          console.error(
            "[razorpay/webhook] refund.created: missing payment_id or id",
          );
          break;
        }
        const refundId = refund.id;
        const refundedPaymentId = refund.payment_id;
        const row = await findPaymentByPaymentId(refundedPaymentId);
        if (!row?.razorpay_order_id) {
          console.log(
            "[razorpay/webhook] refund.created for unknown payment_id, ignoring:",
            refundedPaymentId,
          );
          break;
        }
        await markPaymentRefunded(row.razorpay_order_id, refundId);
        console.log("[razorpay/webhook] refund recorded:", {
          orderId: row.razorpay_order_id,
          refundId,
        });

        // Phase 6.9.1 — auto-debit seva_balance on FULL refund only.
        // Razorpay's refund.amount is in paise; compare against the
        // original payments.amount_paise to detect partial vs full.
        // Partial refunds are logged but not debited (proportional
        // partial-refund logic is Phase 7+).
        //
        // Read-modify-write debit. The race window is vanishingly
        // small — refunds are operator-triggered events serialized via
        // webhook; the same user is unlikely to be purchasing/messaging
        // at the millisecond their refund webhook lands. Atomicity via
        // a debit_seva_balance stored proc would be cleaner but
        // requires a SQL migration; deferred to Phase 7+ if telemetry
        // shows races. The whole block sits inside the case after the
        // hasProcessedEvent idempotency check at line 73, so it runs
        // at most once per refund event.
        const refundAmountPaise =
          typeof refund.amount === "number" ? refund.amount : null;
        if (
          refundAmountPaise !== null &&
          refundAmountPaise === row.amount_paise
        ) {
          let tier;
          try {
            tier = getTier(row.tier);
          } catch {
            console.error(
              "[razorpay/webhook] refund.created: stored payment has unknown tier, skipping auto-debit:",
              row.tier,
            );
            break;
          }
          const memory = await fetchMemory(row.user_id);
          const currentBalance = memory?.seva_balance ?? 0;
          const newBalance = Math.max(0, currentBalance - tier.messages);
          await saveMemory(row.user_id, { seva_balance: newBalance });
          console.log(
            "[razorpay/webhook] full refund — auto-debited seva:",
            {
              user_id: row.user_id,
              refundId,
              tier: tier.id,
              debited: tier.messages,
              previousBalance: currentBalance,
              newBalance,
            },
          );
        } else if (
          refundAmountPaise !== null &&
          refundAmountPaise < row.amount_paise
        ) {
          console.log(
            "[razorpay/webhook] partial refund detected — manual review required, no auto-debit:",
            {
              payment_id: refundedPaymentId,
              refundId,
              refund_paise: refundAmountPaise,
              original_paise: row.amount_paise,
            },
          );
        }
        break;
      }
      // ── Phase 9 subscription lifecycle ──────────────────────────────────
      // Razorpay drives the row: authenticated → active → (charged resets the
      // cycle) → cancelled / halted / completed. We resolve the row by
      // razorpay_subscription_id (set at create time) and mirror the status;
      // only 'active' grants entitlements, so halted/pending/completed/cancelled
      // all pause access without extra logic. The hasProcessedEvent guard above
      // makes each of these run at most once per delivery.
      case "subscription.authenticated": {
        const sub = event.payload?.subscription?.entity;
        if (!sub?.id) {
          console.error("[razorpay/webhook] subscription.authenticated: missing id");
          break;
        }
        await updateSubscriptionStatus(sub.id, {
          status: "authenticated",
          razorpay_customer_id: sub.customer_id ?? undefined,
        });
        console.log("[razorpay/webhook] subscription authenticated:", sub.id);
        break;
      }
      case "subscription.activated": {
        const sub = event.payload?.subscription?.entity;
        if (!sub?.id) {
          console.error("[razorpay/webhook] subscription.activated: missing id");
          break;
        }
        const activatedOk = await updateSubscriptionStatus(sub.id, {
          status: "active",
          razorpay_customer_id: sub.customer_id ?? undefined,
          current_period_start: unixToIso(sub.current_start),
          current_period_end: unixToIso(sub.current_end),
        });
        if (!activatedOk) {
          // The UPDATE to 'active' can only fail on the one-active-per-user
          // partial unique index (a duplicate active sub) or a DB error. The
          // create route now blocks a second chargeable sub, so this should be
          // unreachable — alert loudly if it ever fires (a mandate may be
          // charging without granting entitlements; manual cancel needed).
          console.error(
            "[razorpay/webhook] subscription.activated: status update FAILED — possible duplicate-active conflict or DB error:",
            sub.id,
          );
        } else {
          console.log("[razorpay/webhook] subscription activated:", sub.id);
        }
        break;
      }
      case "subscription.charged": {
        // Each successful charge (incl. renewals): zero per-cycle usage and roll
        // the billing window forward. Re-asserts 'active' so a sub that recovered
        // from a failed charge is usable again. First-cycle charge is a no-op
        // reset (counters already 0).
        const sub = event.payload?.subscription?.entity;
        if (!sub?.id) {
          console.error("[razorpay/webhook] subscription.charged: missing id");
          break;
        }
        const chargedOk = await resetSubscriptionCycleUsage(sub.id, {
          current_period_start: unixToIso(sub.current_start),
          current_period_end: unixToIso(sub.current_end),
        });
        if (!chargedOk) {
          console.error(
            "[razorpay/webhook] subscription.charged: cycle reset FAILED — possible duplicate-active conflict or DB error:",
            sub.id,
          );
        } else {
          console.log("[razorpay/webhook] subscription charged — cycle reset:", sub.id);
        }
        break;
      }
      case "subscription.pending":
      case "subscription.halted":
      case "subscription.completed": {
        // pending = a charge failed and Razorpay is retrying (access pauses
        // until it recovers via .charged); halted = retries exhausted;
        // completed = ran all billing cycles. Mirror the status; gating treats
        // only 'active' as entitled.
        const sub = event.payload?.subscription?.entity;
        if (!sub?.id) {
          console.error(`[razorpay/webhook] ${eventType}: missing id`);
          break;
        }
        const status = eventType.split(".")[1] as SubscriptionStatus;
        await updateSubscriptionStatus(sub.id, { status });
        console.log(`[razorpay/webhook] subscription ${status}:`, sub.id);
        break;
      }
      case "subscription.cancelled": {
        const sub = event.payload?.subscription?.entity;
        if (!sub?.id) {
          console.error("[razorpay/webhook] subscription.cancelled: missing id");
          break;
        }
        await updateSubscriptionStatus(sub.id, {
          status: "cancelled",
          cancelled_at: unixToIso(sub.ended_at) ?? new Date().toISOString(),
        });
        console.log("[razorpay/webhook] subscription cancelled:", sub.id);
        break;
      }
      default:
        console.log("[razorpay/webhook] unhandled event type:", eventType);
    }

    // Record AFTER handling so future retries hit the idempotency short-circuit.
    await recordEvent(eventId, eventType, event);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("[razorpay/webhook] error:", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
