"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WALLET_PACKS, type Currency } from "@/lib/subscriptions";
import { BRAND } from "@/lib/brand";
import { useLanguage } from "../providers/LanguageProvider";

// Phase 9 — voice-minute wallet (one-time top-ups). Reuses the seva-style
// ONE-TIME Razorpay order flow (create-order → Checkout with order_id → verify),
// crediting voice_seconds_balance. Region decides currency (India → ₹ packs,
// elsewhere → $ packs), mirroring SubscriptionPicker; there is no manual toggle.

// window.Razorpay is globally typed for the one-time (order_id) shape by
// SevaTierPicker, so we use it directly here.
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

export default function WalletPicker({
  defaultCurrency,
}: {
  defaultCurrency?: Currency;
}) {
  const { lang, t } = useLanguage();
  const tt = t.subscribe;
  const dev = lang === "hi";
  const [currency, setCurrency] = useState<Currency>(defaultCurrency ?? "INR");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addedMinutes, setAddedMinutes] = useState<number | null>(null);
  // Persistent voice-wallet balance (seconds). null = not loaded; the display
  // shows a dash until /api/voice/balance returns.
  const [walletSeconds, setWalletSeconds] = useState<number | null>(null);

  // Region → currency (India → INR, else → USD). SSR-safe (see SubscriptionPicker).
  useEffect(() => {
    if (defaultCurrency) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      const india = tz === "Asia/Kolkata" || tz === "Asia/Calcutta";
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!india) setCurrency("USD");
    } catch {
      /* keep INR */
    }
  }, [defaultCurrency]);

  // Fetch the current wallet balance on mount so the user always sees how many
  // voice minutes they have, before and after any top-up.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/voice/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (typeof d.voice_seconds === "number") setWalletSeconds(d.voice_seconds);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const packs = WALLET_PACKS.filter((p) => p.currency === currency);

  async function handleBuy(packId: string) {
    if (pendingId) return;
    setPendingId(packId);
    setErrorMessage(null);

    let order: {
      order_id: string;
      amount: number;
      currency: string;
      key_id: string;
      minutes: number;
    };
    try {
      const res = await fetch("/api/wallet/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      if (!res.ok) throw new Error("create failed");
      order = await res.json();
    } catch {
      setErrorMessage(tt.errorStart);
      setPendingId(null);
      return;
    }

    try {
      await loadRazorpayScript();
    } catch {
      setErrorMessage(tt.errorStart);
      setPendingId(null);
      return;
    }
    if (!window.Razorpay) {
      setErrorMessage(tt.errorStart);
      setPendingId(null);
      return;
    }

    const rzp = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: BRAND.name.en,
      description: tt.walletMinutes.replace("{n}", String(order.minutes)),
      order_id: order.order_id,
      theme: { color: "#d4a24a" },
      handler: async (response) => {
        try {
          const verifyRes = await fetch("/api/wallet/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });
          if (!verifyRes.ok) throw new Error("verify failed");
          const data = await verifyRes.json();
          if (data.ok) {
            const credited =
              typeof data.credited_minutes === "number"
                ? data.credited_minutes
                : order.minutes;
            setAddedMinutes(credited);
            if (typeof data.voice_seconds_balance === "number") {
              setWalletSeconds(data.voice_seconds_balance);
            } else if (walletSeconds !== null) {
              // Fall back to incrementing the cached value if the server didn't
              // echo a balance (older verify responses).
              setWalletSeconds(walletSeconds + credited * 60);
            }
          } else {
            setErrorMessage(tt.errorStart);
          }
        } catch {
          setErrorMessage(tt.errorStart);
        } finally {
          setPendingId(null);
        }
      },
      modal: { ondismiss: () => setPendingId(null) },
    });
    rzp.open();
  }

  const walletMinutesDisplay =
    walletSeconds === null ? null : Math.floor(walletSeconds / 60);

  return (
    <div>
      {/* Persistent balance display — the single place the user can always see
          how many voice minutes are in their wallet, before and after a top-up. */}
      <div
        className="mb-3 rounded-2xl border border-[oklch(86%_0.03_60)] bg-[oklch(96%_0.025_80)] px-4 py-3"
        role="status"
        aria-live="polite"
      >
        <p
          className={`text-base text-ink ${
            dev
              ? "font-[family-name:var(--font-devanagari)]"
              : "font-[family-name:var(--font-display)]"
          }`}
        >
          {walletMinutesDisplay === null
            ? "…"
            : walletMinutesDisplay > 0
              ? tt.walletBalance.replace("{n}", String(walletMinutesDisplay))
              : tt.walletEmpty}
        </p>
        {addedMinutes !== null && (
          <p
            className={`mt-1 text-xs text-[oklch(52%_0.13_205)] ${
              dev
                ? "font-[family-name:var(--font-devanagari)]"
                : "font-[family-name:var(--font-serif)] italic"
            }`}
          >
            +{tt.walletAdded.replace("{n}", String(addedMinutes))}
          </p>
        )}
      </div>

      <p
        className={`mb-4 text-sm leading-relaxed text-ink-soft ${
          dev
            ? "font-[family-name:var(--font-devanagari)]"
            : "font-[family-name:var(--font-serif)] italic"
        }`}
      >
        {tt.walletDesc}
      </p>

      <div className="flex flex-col gap-2.5">
        {packs.map((pack) => {
          const isPending = pendingId === pack.id;
          const isDisabledByOther = pendingId !== null && !isPending;
          return (
            <div
              key={pack.id}
              className="flex items-center gap-3 rounded-2xl border border-[oklch(86%_0.03_60)] bg-white/60 p-3"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-[family-name:var(--font-display)] text-lg leading-none text-ink">
                  {tt.walletMinutes.replace("{n}", String(pack.minutes))}
                </span>
                <span
                  className={`mt-1 text-sm text-ink-soft ${
                    dev
                      ? "font-[family-name:var(--font-devanagari)]"
                      : "font-[family-name:var(--font-serif)] italic"
                  }`}
                >
                  {pack.display}
                </span>
              </span>
              <button
                type="button"
                onClick={() => handleBuy(pack.id)}
                disabled={isDisabledByOther || isPending}
                aria-busy={isPending}
                className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-[oklch(80%_0.04_50)] bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] px-5 py-1.5 text-sm text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] disabled:translate-y-0 disabled:opacity-50 ${
                  dev
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-display)] tracking-[0.06em]"
                }`}
              >
                {isPending ? "…" : tt.walletBuy}
              </button>
            </div>
          );
        })}
      </div>

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
