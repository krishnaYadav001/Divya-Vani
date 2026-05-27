"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getTiersInOrder } from "@/lib/seva";
import type { Currency } from "@/lib/subscriptions";
import { useLanguage } from "../providers/LanguageProvider";
import SubscriptionPicker from "./SubscriptionPicker";
import SubscriptionManager, {
  type SubscriptionSummary,
} from "./SubscriptionManager";
import SevaTierPicker from "./SevaTierPicker";
import WalletPicker from "./WalletPicker";

// Phase 9 — the single monetization hub, opened from the header diya icon.
// Bottom-sheet on mobile / centered dialog on desktop, HEIGHT-CONSTRAINED with
// an internal scroll area so it never overflows the viewport (fixes the prior
// overflow). Segmented tabs keep each section short:
//   • Plans — active-subscription manager, else the subscription picker.
//   • Seva  — one-time message top-ups (the existing seva tier picker).
// (Voice-minute wallet is a planned third tab; deferred until its purchase flow
// is built.) This is the only payments surface — Settings no longer hosts any.

const TIERS = getTiersInOrder();

type Tab = "plans" | "seva" | "wallet";

interface SevaHubModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: Tab;
  defaultCurrency?: Currency;
}

export default function SevaHubModal({
  open,
  onClose,
  initialTab = "plans",
  defaultCurrency,
}: SevaHubModalProps) {
  const { lang, t } = useLanguage();
  const tt = t.subscribe;
  const dev = lang === "hi";
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);

  // Active-subscription lookup for the Plans tab (manager vs picker).
  const [subLoading, setSubLoading] = useState(true);
  const [activeSub, setActiveSub] = useState<SubscriptionSummary | null>(null);

  // Escape + focus + body-scroll lock while open.
  useEffect(() => {
    if (!open) return;
    // Reset to the requested tab each time the hub opens (intentional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab(initialTab);
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
  }, [open, onClose, initialTab]);

  // Fetch subscription status when the hub opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Show the loading state before the status fetch (intentional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubLoading(true);
    fetch("/api/subscriptions/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setActiveSub(d?.active && d.subscription ? d.subscription : null);
      })
      .catch(() => {
        if (!cancelled) setActiveSub(null);
      })
      .finally(() => {
        if (!cancelled) setSubLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const tabBtn = (key: Tab, label: string) => {
    const active = tab === key;
    return (
      <button
        type="button"
        onClick={() => setTab(key)}
        aria-pressed={active}
        className={`min-h-10 flex-1 rounded-full px-4 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] ${
          active
            ? "bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset]"
            : "text-ink-soft hover:text-ink"
        } ${
          dev
            ? "font-[family-name:var(--font-devanagari)]"
            : "font-[family-name:var(--font-display)] tracking-[0.04em]"
        }`}
      >
        {label}
      </button>
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-[oklch(20%_0.03_30_/_0.45)] backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={tt.hubTitle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Card: capped height + internal scroll so it always fits the screen. */}
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-[oklch(88%_0.02_60)] bg-[oklch(98%_0.012_70)] shadow-[0_-8px_40px_-12px_oklch(35%_0.06_30_/_0.5)] sm:max-h-[85vh] sm:rounded-3xl sm:shadow-[0_30px_70px_-24px_oklch(35%_0.06_30_/_0.5)]">
        {/* Header (fixed) */}
        <header className="shrink-0 border-b border-[oklch(90%_0.02_60)] px-5 pb-4 pt-3 sm:px-6">
          {/* Mobile drag handle */}
          <div
            aria-hidden
            className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[oklch(86%_0.03_60)] sm:hidden"
          />
          <div className="flex items-center justify-between gap-3">
            <h2
              className={`text-xl text-ink ${
                dev
                  ? "font-[family-name:var(--font-devanagari)]"
                  : "font-[family-name:var(--font-display)]"
              }`}
            >
              {tt.hubTitle}
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={tt.ariaClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[oklch(86%_0.03_60)] bg-white/70 text-ink-soft transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)]"
            >
              ✕
            </button>
          </div>
          {/* Segmented tabs */}
          <div className="mt-3 flex rounded-full border border-[oklch(86%_0.04_70)] bg-white/55 p-1">
            {tabBtn("seva", tt.tabSeva)}
            {tabBtn("wallet", tt.tabWallet)}
            {tabBtn("plans", tt.tabPlans)}
          </div>
        </header>

        {/* Body (scrolls) */}
        <div className="dv-scroll flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {tab === "plans" ? (
            subLoading ? (
              <p
                className="py-10 text-center text-sm text-ink-faint"
                role="status"
                aria-live="polite"
              >
                …
              </p>
            ) : activeSub ? (
              <SubscriptionManager initial={activeSub} />
            ) : (
              <SubscriptionPicker defaultCurrency={defaultCurrency} />
            )
          ) : tab === "wallet" ? (
            <WalletPicker defaultCurrency={defaultCurrency} />
          ) : (
            <SevaTierPicker tiers={TIERS} onSuccess={() => {}} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
