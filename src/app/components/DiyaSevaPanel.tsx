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
      onClose();
    }
  }

  const remaining =
    sevaBalance > 0 ? sevaBalance : Math.max(0, FREE_LIMIT - messageCount);
  const isDepleted = remaining === 0;
  const countDisplay = String(remaining);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Seva · सेवा"
      aria-hidden={!isOpen}
      className={
        "absolute right-0 top-full z-30 mt-2 w-72 origin-top-right overflow-hidden rounded-2xl bg-parchment px-5 py-5 shadow-[0_12px_32px_-8px_rgba(124,95,46,0.18),0_4px_12px_-2px_rgba(124,95,46,0.08)] ring-1 ring-brass/30 transition-all duration-200 sm:w-80 " +
        (isOpen
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
          : "pointer-events-none -translate-y-1 scale-95 opacity-0")
      }
    >
      <button
        type="button"
        aria-label="Close · बंद करें"
        onClick={onClose}
        className="absolute right-1 top-1 z-10 flex min-h-11 min-w-11 items-center justify-center rounded-full text-brass-dark transition-colors hover:bg-brass/10 hover:text-krishna focus:outline-none focus:ring-2 focus:ring-devotional/40"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
          <path
            d="M 4 4 L 12 12 M 12 4 L 4 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <div className="text-center">
        {/* Counter — three-layer depth per Anthropic frontend-design rules:
            (1) warm radial glow behind (atmosphere, lit-diya feel),
            (2) thin warm ring around (containment, headline framing),
            (3) the numeral itself in devotional-dark (AA-safe on parchment).
            tabular-nums + tracking-tight give a precise, intentional feel
            on Cormorant numerals. */}
        <div className="relative pt-1 pb-3">
          <div
            aria-hidden
            className={
              "pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-[55%] rounded-full blur-2xl transition-opacity duration-300 " +
              (isDepleted ? "bg-devotional/10" : "bg-devotional/30")
            }
          />
          <div className="relative inline-flex items-baseline justify-center rounded-full bg-parchment/60 px-6 py-1.5 ring-1 ring-devotional/30 backdrop-blur-[1px]">
            <p
              className={
                "font-serif text-5xl font-semibold leading-none tracking-tight tabular-nums sm:text-6xl " +
                (isDepleted ? "text-devotional/60" : "text-devotional-dark")
              }
            >
              {countDisplay}
            </p>
          </div>
          <p className="relative mt-3 text-xs text-brass-dark">
            <span className="font-devanagari">बातचीत और हैं</span>
            <span aria-hidden className="mx-1.5 text-brass/70">
              ·
            </span>
            <span className="font-serif">conversations remain</span>
          </p>
        </div>
      </div>

      {confirmedCount !== null ? (
        <div
          role="status"
          className="mt-4 rounded-xl bg-devotional/10 px-3 py-3 text-center text-sm text-devotional-dark ring-1 ring-devotional/40"
        >
          <span className="font-devanagari">
            {confirmedCount} बातचीत जुड़ गई
          </span>
          <span aria-hidden className="mx-1.5 text-brass/70">
            ·
          </span>
          <span className="font-serif">{confirmedCount} messages added</span>
        </div>
      ) : (
        <div className="mt-5">
          <SevaTierPicker tiers={tiers} onSuccess={handlePickerSuccess} />
        </div>
      )}
    </div>
  );
}
