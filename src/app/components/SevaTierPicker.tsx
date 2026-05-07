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
              className="group relative flex flex-col items-center rounded-2xl border border-amber-100 bg-white px-3 py-4 text-center shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50/40 hover:shadow-[0_4px_12px_rgba(146,64,14,0.08)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-amber-100 disabled:hover:bg-white disabled:hover:shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
            >
              <span className="text-2xl leading-none" aria-hidden>
                {tier.symbol}
              </span>
              <span className="mt-2 text-sm font-medium text-zinc-900">
                {tier.displayNameHi}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                {tier.displayName}
              </span>
              <span className="mt-3 text-xl font-semibold text-amber-800">
                ₹{tier.priceInr}
              </span>
              <span className="mt-0.5 text-[11px] text-zinc-600">
                <span className="font-serif">
                  {tier.messages} messages
                </span>
                <span aria-hidden className="mx-1 text-brass">
                  ·
                </span>
                <span className="font-devanagari">संदेश</span>
              </span>
              {isPending && (
                <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80 text-xs text-amber-700 backdrop-blur-sm">
                  …
                </span>
              )}
            </button>
          );
        })}
      </div>

      {errorMessage && (
        <p role="alert" className="mt-3 text-center text-xs text-amber-700">
          {errorMessage}
        </p>
      )}
    </>
  );
}
