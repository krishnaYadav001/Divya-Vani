"use client";

import { useEffect, useRef, useState } from "react";
import type { TierConfig } from "@/lib/seva";
import SevaTierPicker from "./SevaTierPicker";

const FREE_LIMIT = 10;

interface DiyaSevaPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messageCount: number;
  sevaBalance: number;
  tiers: TierConfig[];
  onPurchaseSuccess: (newBalance: number) => void;
}

export default function DiyaSevaPanel({
  isOpen,
  onClose,
  messageCount,
  sevaBalance,
  tiers,
  onPurchaseSuccess,
}: DiyaSevaPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null);

  // Outside-click closer. Razorpay's modal lives outside our React tree
  // (appended to <body>), so we explicitly skip closes whose target is
  // inside any razorpay-* container — otherwise tapping the Razorpay
  // backdrop would close our panel mid-checkout.
  useEffect(() => {
    if (!isOpen) return;
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (target.closest('[class*="razorpay"], [id*="razorpay"]')) return;
      onClose();
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [isOpen, onClose]);

  // Reset confirmation + cancel any pending dismiss timer if the panel
  // is closed externally (parent toggle, outside click, etc.) so a stale
  // timer can't reopen-then-close after a user has reopened the panel.
  useEffect(() => {
    if (!isOpen) {
      setConfirmedCount(null);
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    }
  }, [isOpen]);

  function handlePickerSuccess(newBalance: number) {
    // sevaBalance is the prop captured at render time — still the
    // pre-purchase value at this moment because onPurchaseSuccess
    // hasn't fired yet to update the parent.
    const credited = newBalance - sevaBalance;
    onPurchaseSuccess(newBalance);
    if (credited > 0) {
      setConfirmedCount(credited);
      dismissTimerRef.current = setTimeout(() => {
        setConfirmedCount(null);
        dismissTimerRef.current = null;
        onClose();
      }, 2500);
    } else {
      // Already-credited or zero-delta success — close silently rather
      // than flashing a "0 messages added" line.
      onClose();
    }
  }

  const remaining =
    sevaBalance > 0 ? sevaBalance : Math.max(0, FREE_LIMIT - messageCount);
  const isDepleted = remaining === 0;
  // Phase 6.x — always Latin digits (was Devanagari in Hindi mode). Latin
  // digits at the same point size are visually lighter, the count reads
  // faster, and bilingual users get a consistent number across modes.
  const countDisplay = String(remaining);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Seva · सेवा"
      aria-hidden={!isOpen}
      className={
        "absolute right-0 top-full z-30 mt-2 w-72 origin-top-right rounded-2xl bg-parchment px-4 py-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)] ring-1 ring-amber-100/70 transition-all duration-200 sm:w-80 " +
        (isOpen
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
          : "pointer-events-none -translate-y-1 scale-95 opacity-0")
      }
    >
      <button
        type="button"
        aria-label="Close · बंद करें"
        onClick={onClose}
        className="absolute right-1 top-1 flex min-h-11 min-w-11 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-amber-300/40"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
          <path
            d="M 4 4 L 12 12 M 12 4 L 4 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <div className="text-center">
        {/* Phase 5.5 polish — count + subtitle as a visually-grouped unit:
            big devotional-amber number ringed for a "lit lamp" feel, with
            a small bilingual subtitle directly below. Edge-case at 0:
            muted text-devotional/60 keeps it on-brand (dimmer lamp).
            Phase 6.x — Latin digits always; Cormorant matches the temple
            aesthetic without the visual heft of Devanagari at this size. */}
        <div className="pt-1 pb-3">
          <div className="inline-flex items-center justify-center rounded-full px-5 py-1.5 ring-1 ring-devotional/20">
            <p
              className={
                "font-serif text-4xl font-semibold leading-none sm:text-5xl " +
                (isDepleted ? "text-devotional/60" : "text-devotional")
              }
            >
              {countDisplay}
            </p>
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            <span className="font-devanagari">बातचीत और हैं</span>
            <span aria-hidden className="mx-1.5 text-brass">
              ·
            </span>
            <span className="font-serif">conversations remain</span>
          </p>
        </div>
        <p className="text-xs italic text-zinc-600">
          <span className="font-devanagari">
            जब चाहे, सेवा अर्पित कर सकते हो
          </span>
          <span aria-hidden className="mx-1.5 not-italic text-brass">
            ·
          </span>
          <span className="font-serif">
            Whenever you wish, you may offer seva
          </span>
        </p>
      </div>

      {confirmedCount !== null ? (
        <div
          role="status"
          className="mt-4 rounded-xl bg-amber-50 px-3 py-3 text-center text-sm text-amber-800 ring-1 ring-amber-200/70"
        >
          <span className="font-devanagari">
            {confirmedCount} बातचीत जुड़ गई
          </span>
          <span aria-hidden className="mx-1.5 text-brass">
            ·
          </span>
          <span className="font-serif">{confirmedCount} messages added</span>
        </div>
      ) : (
        <div className="mt-4">
          <SevaTierPicker tiers={tiers} onSuccess={handlePickerSuccess} />
        </div>
      )}
    </div>
  );
}
