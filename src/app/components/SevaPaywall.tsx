"use client";

import type { TierConfig } from "@/lib/seva";
import SevaTierPicker from "./SevaTierPicker";

interface SevaPaywallProps {
  tiers: TierConfig[];
  onSuccess: () => void;
}

export default function SevaPaywall({ tiers, onSuccess }: SevaPaywallProps) {
  return (
    <div className="mt-3 rounded-2xl border border-gold/20 bg-linear-to-b from-ink3/55 to-ink1/70 px-5 py-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm">
      <div className="text-center">
        <p className="font-[family-name:var(--font-display)] text-[10px] font-medium uppercase tracking-[0.25em] text-gold-dim">
          Seva · सेवा
        </p>
        <p className="mt-3 font-devanagari text-sm leading-relaxed text-ivory/[0.78]">
          जो भीतर से उठे, वही भेंट करो — हर अर्पण इस यात्रा को आगे ले जाता है
        </p>
        <p className="mt-1 font-serif text-xs italic text-ivory/[0.45]">
          Offer what arises within — every gift carries the journey forward
        </p>
      </div>

      <div className="mt-5">
        <SevaTierPicker tiers={tiers} onSuccess={onSuccess} />
      </div>
    </div>
  );
}
