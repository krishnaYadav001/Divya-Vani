"use client";

import type { TierConfig } from "@/lib/seva";
import SevaTierPicker from "./SevaTierPicker";

interface SevaPaywallProps {
  tiers: TierConfig[];
  onSuccess: () => void;
}

export default function SevaPaywall({ tiers, onSuccess }: SevaPaywallProps) {
  return (
    <div className="mt-3 rounded-2xl bg-linear-to-b from-amber-50/60 to-white px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-amber-100/70">
      <div className="text-center">
        <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-amber-700">
          Seva · सेवा
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-700">
          जो भीतर से उठे, वही भेंट करो — हर अर्पण इस यात्रा को आगे ले जाता है
        </p>
        <p className="mt-1 text-xs italic text-zinc-500">
          Offer what arises within — every gift carries the journey forward
        </p>
      </div>

      <div className="mt-5">
        <SevaTierPicker tiers={tiers} onSuccess={onSuccess} />
      </div>
    </div>
  );
}
