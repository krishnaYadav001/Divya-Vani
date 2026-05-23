"use client";

// Phase 11.5 — the non-Krishna helpline overlay (Locked Decision #7). Rendered
// by AgentVoiceClient when the `show_helpline_card` client tool fires (the
// backend emits that tool_call on a self_harm / harm_others safety flag).
//
// Krishna NEVER speaks this; it is a SEPARATE system-layer card. The overlay is
// INFORMATIONAL, not blocking — the orb keeps running and the conversation
// continues in the background while it is open (spec B5 / B6.8).
//
// The card text is copied VERBATIM from buildSafetyCard() in
// src/app/api/chat/route.ts so the voice + text helplines stay identical. The
// card is intentionally bilingual (hi · en) regardless of `userLang` — matching
// the text-mode card; `userLang` is accepted for parity / future tuning.

type Flag = "self_harm" | "harm_others";

type CardContent = {
  title: string;
  body: string;
  helplines: Array<{ label: string; number: string }>;
};

// Verbatim from buildSafetyCard() — keep in sync if that ever changes.
const CARDS: Record<Flag, CardContent> = {
  self_harm: {
    title: "अगर मन बहुत भारी है · If the weight feels too much",
    body: "तुम्हारा दर्द असली है, तुम अकेले नहीं हो। नीचे के नंबर पर एक प्रशिक्षित, संवेदनशील इंसान बिना जजमेंट के सुनेगा। · Your pain is real, and you are not alone. The numbers below reach a trained, caring listener — no judgement, just presence.",
    helplines: [
      { label: "iCall", number: "9152987821" },
      { label: "Vandrevala Foundation", number: "1860-2662-345" },
    ],
  },
  harm_others: {
    title: "अगर ख़तरा है · If there's a risk right now",
    body: "इस पल में अगर किसी को तुरंत नुकसान का ख़तरा है — अपने आप को या किसी और को — तो आपातकालीन नंबर पर तुरंत संपर्क करना ज़रूरी है। · In this moment, if anyone is in immediate danger — yourself or someone else — please contact emergency services right away.",
    helplines: [{ label: "Emergency · आपातकाल", number: "112" }],
  },
};

export default function HelplineOverlay({
  flag,
  onDismiss,
}: {
  flag: Flag;
  // userLang is accepted by callers for parity with the tool params but the
  // card is bilingual, so it does not change the rendered text.
  userLang?: "hi" | "en";
  onDismiss: () => void;
}) {
  const card = CARDS[flag] ?? CARDS.self_harm; // edge B6.12: unknown flag → self_harm default

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="absolute inset-0 z-30 flex items-center justify-center bg-ink/25 px-5 backdrop-blur-sm"
    >
      <div className="fade-up w-full max-w-[400px] rounded-2xl border border-gold-leaf/40 bg-buttermilk/95 p-5 leading-relaxed shadow-[0_18px_48px_-16px_oklch(40%_0.08_30_/_0.4)] ring-1 ring-inset ring-peach/50">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-peacock">
          सहारा · Support
        </p>
        <p className="mb-2 font-devanagari text-[15px] font-medium text-ink">
          {card.title}
        </p>
        <p className="mb-3 text-sm text-ink-soft">{card.body}</p>
        <div className="flex flex-wrap gap-2">
          {card.helplines.map((h) => (
            <a
              key={h.number}
              href={`tel:${h.number.replace(/[^0-9+]/g, "")}`}
              className="inline-flex items-center gap-3 rounded-2xl border border-gold-leaf/30 bg-cloud/80 px-4 py-2.5 shadow-[0_1px_3px_oklch(40%_0.08_30_/_0.08)] transition-colors hover:bg-cloud"
            >
              <span aria-hidden className="text-lg leading-none">
                📞
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                  {h.label}
                </span>
                <span className="text-base font-semibold text-ink">
                  {h.number}
                </span>
              </span>
            </a>
          ))}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-ink-line px-5 py-2 text-sm text-ink-soft transition-colors hover:bg-mist focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-leaf"
        >
          <span className="font-devanagari">समझ गया</span>
          <span aria-hidden className="mx-1.5 text-ink-faint">
            ·
          </span>
          <span className="font-serif italic">Continue</span>
        </button>
      </div>
    </div>
  );
}
