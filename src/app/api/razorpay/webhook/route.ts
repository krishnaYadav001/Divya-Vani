import crypto from "crypto";
import { NextResponse } from "next/server";
import { getTier } from "@/lib/seva";
import {
  findPaymentByOrderId,
  findPaymentByPaymentId,
  markPaymentVerifiedAtomic,
  markPaymentFailed,
  markPaymentRefunded,
  creditSevaBalance,
  hasProcessedEvent,
  recordEvent,
} from "@/lib/supabase";

interface RazorpayPaymentEntity {
  id?: string;
  order_id?: string;
}

interface RazorpayRefundEntity {
  id?: string;
  payment_id?: string;
}

interface RazorpayWebhookEvent {
  event?: unknown;
  payload?: {
    payment?: { entity?: RazorpayPaymentEntity };
    refund?: { entity?: RazorpayRefundEntity };
  };
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
    if (expected !== signature) {
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
        // TODO Phase 6+: auto-debit seva_balance proportional to refund.amount.
        // v1 logs only; refunds handled manually.
        console.log("[razorpay/webhook] refund recorded:", {
          orderId: row.razorpay_order_id,
          refundId,
        });
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
