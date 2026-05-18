"use client";

import { useState } from "react";
import type { TierId, TierConfig } from "@/lib/seva";
import { BRAND } from "@/lib/brand";
import Diya from "./motifs/Diya";

// Dawn Aarti redesign (2026-05-18) — sevā tier picker. Visual rebuild
// to the handoff mock (dawn-seva.jsx): each tier is a Dawn row card —
// a Diya on a tone-tinted panel + name + price + per-msg + arrow;
// Bhakti (₹101) elevated with a lavender ring + "MOST CHOSEN" badge.
// Row layout (not the desktop 4-col) because sevā renders inside the
// narrow in-chat DiyaSevaPanel / SevaPaywall card, matching the
// SevaPaywallMobile mock. EVERY Razorpay behaviour below is preserved
// verbatim — only the rendered markup changed.

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

// Per-tier Dawn tone (by price) → tinted Diya panel + Diya palette.
const TONE: Record<
  number,
  { bg: string; diya: "warm" | "peacock"; ring: string }
> = {
  11: {
    bg: "linear-gradient(180deg, oklch(98% 0.012 60), oklch(94% 0.02 60))",
    diya: "warm",
    ring: "",
  },
  51: {
    bg: "linear-gradient(180deg, oklch(95% 0.04 12), oklch(89% 0.07 12))",
    diya: "warm",
    ring: "",
  },
  101: {
    bg: "linear-gradient(180deg, oklch(95% 0.03 305), oklch(88% 0.06 305))",
    diya: "warm",
    ring: "0 0 0 2px oklch(75% 0.1 285)",
  },
  501: {
    bg: "linear-gradient(180deg, oklch(70% 0.12 205), oklch(45% 0.13 215))",
    diya: "peacock",
    ring: "",
  },
};

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
      <div className="flex flex-col gap-3">
        {tiers.map((tier) => {
          const isPending = pendingTierId === tier.id;
          const isDisabledByOther = pendingTierId !== null && !isPending;
          const fav = tier.priceInr === 101;
          const tone = TONE[tier.priceInr] ?? TONE[11];
          const perMsg = (tier.priceInr / tier.messages).toFixed(2);
          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => handleTierTap(tier)}
              disabled={isDisabledByOther || isPending}
              aria-busy={isPending}
              className="group relative flex items-stretch gap-4 overflow-hidden rounded-2xl border border-[oklch(86%_0.03_60)] bg-white/55 p-3 text-left backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] disabled:cursor-not-allowed disabled:opacity-50"
              style={
                fav
                  ? {
                      boxShadow: `0 1px 0 rgba(255,255,255,.6) inset, 0 16px 32px -22px oklch(50% 0.15 280 / .35), ${tone.ring}`,
                    }
                  : {
                      boxShadow:
                        "0 1px 0 rgba(255,255,255,.6) inset, 0 12px 24px -20px oklch(35% 0.05 30 / .3)",
                    }
              }
            >
              {/* Diya thumbnail on a tone-tinted panel */}
              <span
                aria-hidden
                className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                style={{ background: tone.bg }}
              >
                <Diya tone={tone.diya} className="h-full w-full" />
              </span>

              {/* Tier text */}
              <span className="flex min-w-0 flex-1 flex-col justify-center">
                <span className="flex items-baseline gap-2">
                  <span className="font-[family-name:var(--font-devanagari)] text-xl leading-none text-ink">
                    {tier.displayNameHi}
                  </span>
                  <span className="font-[family-name:var(--font-display)] text-[10px] uppercase tracking-[0.28em] text-ink-soft">
                    {tier.displayName} Sevā
                  </span>
                </span>
                <span className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="font-[family-name:var(--font-display)] text-2xl tabular-nums text-ink">
                    ₹{tier.priceInr}
                  </span>
                  <span className="font-[family-name:var(--font-serif)] text-xs italic text-ink-soft">
                    · {tier.messages} msgs · ≈ ₹{perMsg}/msg
                  </span>
                </span>
                <span className="mt-1 font-[family-name:var(--font-display)] text-[9px] uppercase tracking-[0.26em] text-ink-faint">
                  {fav ? "Most chosen · " : ""}No expiry · 72h refund
                </span>
              </span>

              {/* Arrow affordance */}
              <span
                aria-hidden
                className={`flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full text-base transition-transform group-hover:translate-x-0.5 ${
                  fav
                    ? "bg-[oklch(53%_0.19_28)] text-white"
                    : "border border-[oklch(85%_0.04_60)] bg-white/60 text-ink-soft"
                }`}
              >
                →
              </span>

              {isPending && (
                <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80 font-[family-name:var(--font-display)] text-xs tracking-[0.2em] text-ink backdrop-blur-sm">
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
          className="mt-3 text-center font-[family-name:var(--font-serif)] text-xs italic text-[oklch(53%_0.19_28)]"
        >
          {errorMessage}
        </p>
      )}
    </>
  );
}
