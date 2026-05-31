"use client";

import { useEffect } from "react";
import type { TierConfig } from "@/lib/seva";
import { track } from "@/lib/tracking";
import SevaTierPicker from "./SevaTierPicker";
import SubscribeButton from "./SubscribeButton";
import { useLanguage } from "../providers/LanguageProvider";

interface SevaPaywallProps {
  tiers: TierConfig[];
  onSuccess: () => void;
}

export default function SevaPaywall({ tiers, onSuccess }: SevaPaywallProps) {
  // Phase 12 — invitation line follows the UI language toggle (one line per
  // language, replacing the prior always-stacked Hindi+English pair).
  const { lang, t } = useLanguage();
  useEffect(() => {
    track("paywall_shown");
    // Server-side InitiateCheckout event for Meta Conversions API
    void fetch("/api/events/initiate-checkout", { method: "POST" });
  }, []);
  return (
    <div className="mt-3 rounded-2xl border border-gold/20 bg-linear-to-b from-ink3/55 to-ink1/70 px-5 py-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm">
      <div className="text-center">
        <p className="font-[family-name:var(--font-display)] text-[10px] font-medium uppercase tracking-[0.25em] text-gold-dim">
          Seva · सेवा
        </p>
        <p
          className={`mt-3 leading-relaxed text-ivory/[0.78] ${
            lang === "hi"
              ? "font-devanagari text-sm"
              : "font-serif text-sm italic"
          }`}
        >
          {t.paywall.tagline}
        </p>
      </div>

      <div className="mt-5">
        <SevaTierPicker tiers={tiers} onSuccess={onSuccess} />
      </div>

      {/* Recurring-plan upsell — one-time seva above, ongoing access here. */}
      <div className="mt-5 border-t border-gold/15 pt-4 text-center">
        <SubscribeButton
          label={`${t.subscribe.heading} →`}
          variant="link"
          fontClassName={
            lang === "hi"
              ? "font-devanagari"
              : "font-serif italic"
          }
        />
      </div>
    </div>
  );
}
