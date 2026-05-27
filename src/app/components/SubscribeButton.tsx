"use client";

import { useState } from "react";
import type { Currency } from "@/lib/subscriptions";
import SubscriptionModal from "./SubscriptionModal";

// Phase 9 — self-contained trigger: a styled button that owns its own
// SubscriptionModal open state. Dropped into the chat header, the in-chat
// paywall, the pricing page, and the empty-state of the Settings panel, so
// every entry point opens the identical modal without lifting state.

type Variant = "pill" | "ghost" | "solid" | "link";

const VARIANT_CLASS: Record<Variant, string> = {
  // Compact header pill (Dawn brass).
  pill: "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[oklch(80%_0.06_75)] bg-linear-to-b from-[oklch(95%_0.04_80)] to-[oklch(88%_0.07_65)] px-3.5 py-1.5 text-[12px] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset] transition-transform hover:-translate-y-0.5",
  // Full-width solid CTA (pricing page / settings empty state).
  solid:
    "inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[oklch(80%_0.04_50)] bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] px-7 py-3 text-sm text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_6px_18px_-8px_oklch(50%_0.1_30_/_0.25)] transition-transform hover:-translate-y-0.5",
  // Quiet bordered button.
  ghost:
    "inline-flex min-h-11 items-center justify-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/45 px-5 py-2 text-sm text-ink-soft backdrop-blur transition-colors hover:bg-white/70 hover:text-ink",
  // Text link (for dark surfaces like the in-chat paywall — gold underline).
  link: "inline-flex items-center gap-1 text-sm text-gold underline decoration-gold/50 underline-offset-4 transition-colors hover:text-gold-dim",
};

interface SubscribeButtonProps {
  label: string;
  variant?: Variant;
  className?: string;
  fontClassName?: string;
  defaultCurrency?: Currency;
  /** Called after Checkout completes (e.g. to refresh the Settings panel). */
  onSuccess?: () => void;
}

export default function SubscribeButton({
  label,
  variant = "solid",
  className = "",
  fontClassName = "font-[family-name:var(--font-display)] tracking-[0.06em]",
  defaultCurrency,
  onSuccess,
}: SubscribeButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${VARIANT_CLASS[variant]} focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] ${fontClassName} ${className}`}
      >
        {label}
      </button>
      <SubscriptionModal
        open={open}
        onClose={() => setOpen(false)}
        defaultCurrency={defaultCurrency}
        onSuccess={onSuccess}
      />
    </>
  );
}
