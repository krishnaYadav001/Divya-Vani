"use client";

import { useState } from "react";
import type { TierId, TierConfig } from "@/lib/seva";
import { BRAND } from "@/lib/brand";

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
      name: BRAND.name.en,
      description: `${tier.displayName} · ${tier.messages} messages`,
      order_id: order.order_id,
      theme: { color: "#d4a24a" },
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
      <div className="grid grid-cols-2 gap-3">
        {tiers.map((tier) => {
          const isPending = pendingTierId === tier.id;
          const isDisabledByOther = pendingTierId !== null && !isPending;
          // Phase 8 redesign — Bhakti (₹101) is the design's emphasised
          // tier. Conveyed by gold border + gold-tint fill only (no
          // "अनुशंसित" badge text added — visual emphasis, not new copy).
          const recommended = tier.priceInr === 101;
          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => handleTierTap(tier)}
              disabled={isDisabledByOther || isPending}
              aria-busy={isPending}
              className={
                "group relative flex flex-col items-center rounded-lg border px-4 py-5 text-center transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 disabled:cursor-not-allowed disabled:opacity-50 " +
                (recommended
                  ? "border-gold bg-linear-to-b from-gold/[0.12] to-gold/[0.04]"
                  : "border-gold-faint bg-ink2/60 hover:border-gold-dim")
              }
            >
              <span className="text-2xl leading-none" aria-hidden>
                {tier.symbol}
              </span>
              <span className="mt-2 font-devanagari text-base text-ivory">
                {tier.displayNameHi}
              </span>
              <span className="font-[family-name:var(--font-display)] text-[10px] uppercase tracking-[0.14em] text-gold-dim">
                {tier.displayName}
              </span>
              <span className="mt-3 font-[family-name:var(--font-display)] text-2xl tabular-nums text-ivory">
                ₹{tier.priceInr}
              </span>
              <span className="mt-0.5 text-[11px] text-ivory/55">
                <span className="font-serif italic tabular-nums">
                  {tier.messages} messages
                </span>
                <span aria-hidden className="mx-1 text-gold/60">
                  ·
                </span>
                <span className="font-devanagari">संदेश</span>
              </span>
              {isPending && (
                <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-ink1/85 text-xs text-gold backdrop-blur-sm">
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
