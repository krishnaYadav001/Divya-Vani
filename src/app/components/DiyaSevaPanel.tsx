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

  // Phase 8 prep counter-display bugfix — the prior ternary
  // (sevaBalance > 0 ? sevaBalance : freeRemaining) hid the user's
  // UNUSED free messages whenever they purchased seva before
  // exhausting the free pool. Real production case:
  //   message_count=3, seva_balance=6 → showed "6" but the user
  //   actually had 7 unused free + 6 paid = 13 messages remaining.
  // The correct formula sums both pools so the counter reflects
  // the user's total runway. Backend chat-flow consumes free-first
  // then paid (per chat-flow rule + /api/chat persistTurnState),
  // so the counter ticks down through (10-mc) first, then sb.
  //
  // Edge cases verified:
  //   (a) mc=0,  sb=0  → max(0, 10-0)  + 0  = 10   (full free pool)
  //   (b) mc=3,  sb=0  → max(0, 10-3)  + 0  = 7    (no purchases yet)
  //   (c) mc=3,  sb=6  → max(0, 10-3)  + 6  = 13   (the bug case)
  //   (d) mc=10, sb=6  → max(0, 10-10) + 6  = 6    (free exhausted)
  //   (e) mc=10, sb=0  → max(0, 10-10) + 0  = 0    (paywall state)
  //   (f) mc=15, sb=2  → max(0, 10-15) + 2  = 2    (defensive clamp)
  const remaining =
    Math.max(0, FREE_LIMIT - messageCount) + (sevaBalance ?? 0);
  const isDepleted = remaining === 0;
  const countDisplay = String(remaining);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Seva · सेवा"
      // Phase 6.6 Stage C-1 — `inert` (not aria-hidden) when closed.
      // inert removes children from the accessibility tree AND the focus
      // order (aria-hidden only does the former), fixing the WCAG
      // violation where tab focus jumped to invisible tier-card buttons.
      // React 19 supports inert as a boolean prop natively.
      inert={!isOpen}
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
        // Phase 6.6 Stage C-1 — h-12 w-12 (48×48) for unambiguous Apple
        // HIG / Google MWG tap target. min-h-11 measured 42px on iPhone
        // 14 Pro at scale factor 3 due to sub-pixel rounding; explicit
        // h-12 w-12 sidesteps the issue.
        className="absolute right-1 top-1 z-10 flex h-12 w-12 items-center justify-center rounded-full text-brass-dark transition-colors hover:bg-brass/10 hover:text-krishna focus:outline-none focus:ring-2 focus:ring-devotional/40"
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
                "font-sans text-5xl font-semibold leading-none tracking-tight tabular-nums sm:text-6xl " +
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
