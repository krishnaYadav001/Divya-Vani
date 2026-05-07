"use client";

import { useState } from "react";
import type { TierId, TierConfig } from "@/lib/seva";

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  handler: (response: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("server"));
  }
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load Razorpay Checkout"));
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

interface SevaTierPickerProps {
  tiers: TierConfig[];
  onSuccess: (newBalance: number) => void;
  onError?: (msg: string) => void;
}

export default function SevaTierPicker({
  tiers,
  onSuccess,
  onError,
}: SevaTierPickerProps) {
  const [pendingTierId, setPendingTierId] = useState<TierId | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function reportError(msg: string) {
    setErrorMessage(msg);
    onError?.(msg);
  }

  async function handleTierTap(tier: TierConfig) {
    if (pendingTierId) return;
    setPendingTierId(tier.id);
    setErrorMessage(null);

    let order: {
      order_id: string;
      amount: number;
      currency: string;
      key_id: string;
    };
    try {
      const orderRes = await fetch("/api/seva/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tier.id }),
      });
      if (!orderRes.ok) {
        const err = await orderRes.json().catch(() => ({}));
        throw new Error(err.error || "Could not start payment");
      }
      order = await orderRes.json();
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Something went wrong");
      setPendingTierId(null);
      return;
    }

    try {
      await loadRazorpayScript();
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Could not load checkout");
      setPendingTierId(null);
      return;
    }

    if (!window.Razorpay) {
      reportError("Could not load checkout");
      setPendingTierId(null);
      return;
    }

    const rzp = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: "Divya Vani",
      description: `${tier.displayName} · ${tier.messages} messages`,
      order_id: order.order_id,
      theme: { color: "#92400e" },
      handler: async (response) => {
        try {
          const verifyRes = await fetch("/api/seva/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });
          if (!verifyRes.ok) {
            const err = await verifyRes.json().catch(() => ({}));
            throw new Error(err.error || "Could not verify payment");
          }
          const data = await verifyRes.json();
          if (data.ok) {
            const newBalance =
              typeof data.new_balance === "number" ? data.new_balance : 0;
            onSuccess(newBalance);
          } else {
            reportError("Payment did not complete. Please try again.");
          }
        } catch (e) {
          reportError(e instanceof Error ? e.message : "Verification failed");
        } finally {
          setPendingTierId(null);
        }
      },
      modal: {
        ondismiss: () => {
          setPendingTierId(null);
        },
      },
    });
    rzp.open();
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        {tiers.map((tier) => {
          const isPending = pendingTierId === tier.id;
          const isDisabledByOther = pendingTierId !== null && !isPending;
          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => handleTierTap(tier)}
              disabled={isDisabledByOther || isPending}
              aria-busy={isPending}
              className="group relative flex flex-col items-center rounded-xl border border-brass/30 bg-parchment/70 px-3 py-4 text-center shadow-[0_1px_2px_rgba(124,95,46,0.05)] transition-[background-color,border-color,box-shadow] duration-200 hover:border-devotional/50 hover:bg-devotional/[0.06] hover:shadow-[0_4px_14px_-2px_rgba(232,155,60,0.18)] focus:outline-none focus-visible:border-devotional/60 focus-visible:ring-2 focus-visible:ring-devotional/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-2xl leading-none" aria-hidden>
                {tier.symbol}
              </span>
              <span className="mt-2 font-serif text-sm font-medium text-krishna">
                {tier.displayNameHi}
              </span>
              <span className="text-[10px] uppercase tracking-[0.08em] text-brass-dark">
                {tier.displayName}
              </span>
              <span className="mt-3 font-serif text-xl font-semibold tabular-nums text-devotional-dark">
                ₹{tier.priceInr}
              </span>
              <span className="mt-0.5 text-[11px] text-brass-dark">
                <span className="font-serif tabular-nums">
                  {tier.messages} messages
                </span>
                <span aria-hidden className="mx-1 text-brass/70">
                  ·
                </span>
                <span className="font-devanagari">संदेश</span>
              </span>
              {isPending && (
                <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-parchment/85 text-xs text-devotional-dark backdrop-blur-sm">
                  …
                </span>
              )}
            </button>
          );
        })}
      </div>

      {errorMessage && (
        <p
          role="alert"
          className="mt-3 text-center text-xs font-medium text-sacred"
        >
          {errorMessage}
        </p>
      )}
    </>
  );
}
