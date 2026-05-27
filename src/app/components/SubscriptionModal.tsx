"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Currency } from "@/lib/subscriptions";
import { useLanguage } from "../providers/LanguageProvider";
import SubscriptionPicker from "./SubscriptionPicker";

// Phase 9 — overlay that hosts SubscriptionPicker. Rendered above everything
// (portal to <body>) with a dim backdrop, so it reads the same whether opened
// from the chat header, the in-chat paywall, the pricing page, or Settings.
// Dawn-Aarti light card on a soft scrim. Closes on backdrop click + Escape.

interface SubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  defaultCurrency?: Currency;
  /** Bubbled from the picker after Razorpay Checkout completes. */
  onSuccess?: () => void;
}

export default function SubscriptionModal({
  open,
  onClose,
  defaultCurrency,
  onSuccess,
}: SubscriptionModalProps) {
  const { lang, t } = useLanguage();
  const dev = lang === "hi";
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Escape to close + focus the close button on open + lock body scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-[oklch(20%_0.03_30_/_0.45)] px-4 py-8 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t.subscribe.heading}
      onClick={(e) => {
        // Backdrop click (not a click inside the card) closes.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-3xl border border-[oklch(88%_0.02_60)] bg-[oklch(98%_0.012_70)] p-6 shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_30px_70px_-24px_oklch(35%_0.06_30_/_0.5)] sm:p-7">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t.subscribe.ariaClose}
          className="absolute right-3.5 top-3.5 flex h-9 w-9 items-center justify-center rounded-full border border-[oklch(86%_0.03_60)] bg-white/70 text-ink-soft transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)]"
        >
          ✕
        </button>

        <header className="mb-5 pr-10 text-center">
          <h2
            className={`text-2xl leading-tight text-ink ${
              dev
                ? "font-[family-name:var(--font-devanagari)]"
                : "font-[family-name:var(--font-display)]"
            }`}
          >
            {t.subscribe.heading}
          </h2>
          <p
            className={`mt-2 text-sm leading-relaxed text-ink-soft ${
              dev
                ? "font-[family-name:var(--font-devanagari)]"
                : "font-[family-name:var(--font-serif)] italic"
            }`}
          >
            {t.subscribe.tagline}
          </p>
        </header>

        <SubscriptionPicker
          defaultCurrency={defaultCurrency}
          onSuccess={onSuccess}
        />
      </div>
    </div>,
    document.body,
  );
}
