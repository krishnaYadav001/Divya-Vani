"use client";

import { useState } from "react";
import Link from "next/link";
import {
  getPlansInOrder,
  type Currency,
  type PlanKey,
} from "@/lib/subscriptions";
import { BRAND } from "@/lib/brand";
import { useLanguage } from "../providers/LanguageProvider";

// Phase 9 — recurring subscription picker (Plus / Voice / Premium). Sibling of
// SevaTierPicker, but talks to the Subscriptions API: POST /api/subscriptions/
// create returns a subscription_id which we hand to Razorpay Checkout (NOT an
// order_id). Activation is confirmed asynchronously by the subscription.charged
// webhook, so the success handler shows an "activating…" note rather than
// claiming instant access. Dawn-Aarti light styling so it reads on the modal
// card, the pricing page, and the settings panel alike.

// Razorpay Checkout options for a SUBSCRIPTION (subscription_id, not order_id).
// window.Razorpay is globally typed by SevaTierPicker for the one-time order
// shape; we cast to this shape locally rather than widen that global.
interface RazorpaySubscriptionResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}
interface RazorpaySubscriptionOptions {
  key: string;
  subscription_id: string;
  name: string;
  description?: string;
  handler: (response: RazorpaySubscriptionResponse) => void;
  modal?: { ondismiss?: () => void };
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
}
type RazorpayCtor = new (options: RazorpaySubscriptionOptions) => {
  open: () => void;
};

let scriptPromise: Promise<void> | null = null;
function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("server"));
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

interface SubscriptionPickerProps {
  /** Initial currency; user can still flip the toggle. Defaults to INR. */
  defaultCurrency?: Currency;
  /** Fired after the user completes Razorpay Checkout (activation is async). */
  onSuccess?: () => void;
  onError?: (msg: string) => void;
}

// The middle tier (Voice) is flagged as the recommended one.
const POPULAR: PlanKey = "voice";

export default function SubscriptionPicker({
  defaultCurrency = "INR",
  onSuccess,
  onError,
}: SubscriptionPickerProps) {
  const { lang, t } = useLanguage();
  const tt = t.subscribe;
  const dev = lang === "hi";
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [pendingKey, setPendingKey] = useState<PlanKey | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  const plans = getPlansInOrder();

  function reportError(msg: string) {
    setErrorMessage(msg);
    onError?.(msg);
  }

  async function handleSubscribe(planKey: PlanKey) {
    if (pendingKey) return;
    setPendingKey(planKey);
    setErrorMessage(null);

    let data: {
      subscription_id: string;
      key_id: string;
      plan_name: string;
      display: string;
    };
    try {
      const res = await fetch("/api/subscriptions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey, currency }),
      });
      if (res.status === 409) {
        reportError(tt.alreadyActive);
        setPendingKey(null);
        return;
      }
      if (!res.ok) {
        throw new Error("create failed");
      }
      data = await res.json();
    } catch {
      reportError(tt.errorStart);
      setPendingKey(null);
      return;
    }

    try {
      await loadRazorpayScript();
    } catch {
      reportError(tt.errorStart);
      setPendingKey(null);
      return;
    }
    if (!window.Razorpay) {
      reportError(tt.errorStart);
      setPendingKey(null);
      return;
    }

    const Ctor = window.Razorpay as unknown as RazorpayCtor;
    const rzp = new Ctor({
      key: data.key_id,
      subscription_id: data.subscription_id,
      name: BRAND.name.en,
      description: `${data.plan_name} · ${data.display}`,
      theme: { color: "#d4a24a" },
      handler: () => {
        // Activation is webhook-driven (subscription.charged); we can't confirm
        // 'active' synchronously here. Show the activating note and let the
        // caller refresh — the next status read flips to active once the
        // webhook lands.
        setActivating(true);
        setPendingKey(null);
        onSuccess?.();
      },
      modal: {
        ondismiss: () => setPendingKey(null),
      },
    });
    rzp.open();
  }

  if (activating) {
    return (
      <p
        role="status"
        aria-live="polite"
        className={`rounded-2xl border border-[oklch(86%_0.03_60)] bg-white/60 px-5 py-6 text-center text-sm leading-relaxed text-ink ${
          dev
            ? "font-[family-name:var(--font-devanagari)]"
            : "font-[family-name:var(--font-serif)] italic"
        }`}
      >
        {tt.activating}
      </p>
    );
  }

  return (
    <div>
      {/* Currency toggle — India (₹) monthly vs International ($) annual. */}
      <div
        role="group"
        aria-label="Currency"
        className="mx-auto mb-5 inline-flex w-full max-w-xs rounded-full border border-[oklch(86%_0.04_70)] bg-white/55 p-1"
      >
        {(["INR", "USD"] as const).map((c) => {
          const active = currency === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              aria-pressed={active}
              disabled={pendingKey !== null}
              className={`min-h-10 flex-1 rounded-full px-4 py-1.5 text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] disabled:opacity-60 ${
                active
                  ? "bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset]"
                  : "text-ink-soft hover:text-ink"
              } ${
                dev
                  ? "font-[family-name:var(--font-devanagari)]"
                  : "font-[family-name:var(--font-display)] tracking-[0.04em]"
              }`}
            >
              {c === "INR" ? tt.currencyINR : tt.currencyUSD}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        {plans.map((plan) => {
          const offer = plan.offers.find((o) => o.currency === currency);
          if (!offer) return null;
          const isPending = pendingKey === plan.key;
          const isDisabledByOther = pendingKey !== null && !isPending;
          const fav = plan.key === POPULAR;
          const name = dev ? plan.displayNameHi : plan.displayName;
          const periodSuffix =
            offer.period === "annual" ? tt.perYear : tt.perMonth;
          return (
            <div
              key={plan.key}
              className="relative overflow-hidden rounded-2xl border bg-white/60 p-4"
              style={
                fav
                  ? { borderColor: "oklch(75% 0.1 285)", boxShadow: "0 0 0 1px oklch(75% 0.1 285)" }
                  : { borderColor: "oklch(86% 0.03 60)" }
              }
            >
              {fav && (
                <span
                  className={`absolute right-3 top-3 rounded-full bg-[oklch(53%_0.19_28)] px-2 py-0.5 text-[9px] text-white ${
                    dev
                      ? "font-[family-name:var(--font-devanagari)]"
                      : "font-[family-name:var(--font-display)] uppercase tracking-[0.14em]"
                  }`}
                >
                  {tt.popular}
                </span>
              )}

              {/* Name */}
              <p
                className={`text-lg leading-tight text-ink ${
                  dev
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-display)]"
                }`}
              >
                {name}
              </p>

              {/* Price */}
              <p className="mt-1 flex items-baseline gap-1">
                <span className="font-[family-name:var(--font-display)] text-2xl tabular-nums leading-none text-ink">
                  {offer.display}
                </span>
                <span
                  className={`text-xs text-ink-soft ${
                    dev
                      ? "font-[family-name:var(--font-devanagari)]"
                      : "font-[family-name:var(--font-serif)] italic"
                  }`}
                >
                  {periodSuffix}
                </span>
              </p>

              {/* Entitlements */}
              <p
                className={`mt-2 text-[13px] leading-relaxed text-ink-soft ${
                  dev
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-serif)] italic"
                }`}
              >
                {tt.messagesUnit.replace("{n}", String(plan.entitlement.messagePool))}
                {" · "}
                {tt.voiceUnit.replace("{n}", String(plan.entitlement.voiceMinutes))}
              </p>

              <button
                type="button"
                onClick={() => handleSubscribe(plan.key)}
                disabled={isDisabledByOther || isPending}
                aria-busy={isPending}
                className={`mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[oklch(80%_0.04_50)] bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] px-5 py-2 text-sm text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_6px_18px_-8px_oklch(50%_0.1_30_/_0.25)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] disabled:translate-y-0 disabled:opacity-50 ${
                  dev
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-display)] tracking-[0.06em]"
                }`}
              >
                {isPending ? "…" : tt.cta}
              </button>
            </div>
          );
        })}
      </div>

      {/* Passive policy disclosure (non-blocking), same as the seva picker. */}
      <p
        className={`mt-4 text-center text-[11px] leading-snug text-ink-soft ${
          dev
            ? "font-[family-name:var(--font-devanagari)]"
            : "font-[family-name:var(--font-serif)]"
        }`}
      >
        {t.paywall.agreeNote}{" "}
        <Link
          href="/refund"
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink underline decoration-[oklch(80%_0.04_50)] underline-offset-2 hover:text-[oklch(53%_0.19_28)]"
        >
          {t.paywall.linkRefund}
        </Link>
        {" · "}
        <Link
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink underline decoration-[oklch(80%_0.04_50)] underline-offset-2 hover:text-[oklch(53%_0.19_28)]"
        >
          {t.paywall.linkTerms}
        </Link>
      </p>

      {errorMessage && (
        <p
          role="alert"
          className="mt-3 text-center font-[family-name:var(--font-serif)] text-xs italic text-[oklch(53%_0.19_28)]"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
