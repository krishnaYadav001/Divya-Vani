// Phase 9 — recurring subscription + voice-wallet configuration (pure data,
// server+client safe, like seva.ts). NO Razorpay/Supabase calls here — those
// live in the API routes + a subscriptions data layer.
//
// Design (from docs/subscription-economics-2026-05-24.md):
//   • Entitlements are UNIFIED per tier (same messages + voice minutes in every
//     currency) — only the PRICE varies. "Same product, priced per market."
//   • Launch billing periods (verified Razorpay constraint — RBI e-mandate is
//     India/INR-only; foreign-card recurring rides card networks):
//        INR → monthly auto-renew (UPI AutoPay / e-mandate)
//        USD → annual          (one charge/year; lower foreign-recurring risk)
//     Annual-INR + monthly-USD are easy additions later (add an Offer below
//     and the matching Razorpay Plan).
//   • Amounts are in the SMALLEST unit: paise for INR, cents for USD.
//   • Each (tier × currency × period) maps to ONE Razorpay Plan id, read from
//     an env var (founder creates the Plans; see scripts/setup-razorpay-plans).

export type PlanKey = "plus" | "voice" | "premium";
export type Currency = "INR" | "USD";
export type BillingPeriod = "monthly" | "annual";

export interface Entitlement {
  /** Messages included per billing cycle. */
  messagePool: number;
  /** Voice minutes included per billing cycle (overage → wallet). */
  voiceMinutes: number;
}

export interface PlanOffer {
  currency: Currency;
  period: BillingPeriod;
  /** Smallest unit: paise (INR) / cents (USD). */
  amount: number;
  /** Human display price, e.g. "₹499" / "$99". */
  display: string;
  /** Env var holding the Razorpay plan_id for this offer. */
  planIdEnv: string;
}

export interface SubscriptionPlan {
  key: PlanKey;
  displayName: string;
  displayNameHi: string;
  /** Short marketing line (English; Hindi handled in UI dictionary). */
  blurb: string;
  entitlement: Entitlement;
  offers: PlanOffer[];
}

export const SUBSCRIPTION_PLANS: Record<PlanKey, SubscriptionPlan> = {
  plus: {
    key: "plus",
    displayName: "Krishna Plus",
    displayNameHi: "कृष्ण प्लस",
    blurb: "Daily text companionship, a taste of voice.",
    entitlement: { messagePool: 100, voiceMinutes: 5 },
    offers: [
      {
        currency: "INR",
        period: "monthly",
        amount: 49900,
        display: "₹499",
        planIdEnv: "RAZORPAY_PLAN_PLUS_INR_MONTHLY",
      },
      {
        currency: "USD",
        period: "annual",
        amount: 9900,
        display: "$99",
        planIdEnv: "RAZORPAY_PLAN_PLUS_USD_ANNUAL",
      },
    ],
  },
  voice: {
    key: "voice",
    displayName: "Krishna Voice",
    displayNameHi: "कृष्ण वाणी",
    blurb: "Hear Krishna speak — text plus voice minutes.",
    entitlement: { messagePool: 100, voiceMinutes: 30 },
    offers: [
      {
        currency: "INR",
        period: "monthly",
        amount: 99900,
        display: "₹999",
        planIdEnv: "RAZORPAY_PLAN_VOICE_INR_MONTHLY",
      },
      {
        currency: "USD",
        period: "annual",
        amount: 24900,
        display: "$249",
        planIdEnv: "RAZORPAY_PLAN_VOICE_USD_ANNUAL",
      },
    ],
  },
  premium: {
    key: "premium",
    displayName: "Krishna Premium",
    displayNameHi: "कृष्ण प्रीमियम",
    blurb: "The fullest presence — generous text + voice.",
    entitlement: { messagePool: 200, voiceMinutes: 100 },
    offers: [
      {
        currency: "INR",
        period: "monthly",
        amount: 299900,
        display: "₹2,999",
        planIdEnv: "RAZORPAY_PLAN_PREMIUM_INR_MONTHLY",
      },
      {
        currency: "USD",
        period: "annual",
        amount: 49900,
        display: "$499",
        planIdEnv: "RAZORPAY_PLAN_PREMIUM_USD_ANNUAL",
      },
    ],
  },
};

export const PLAN_ORDER: PlanKey[] = ["plus", "voice", "premium"];

// ── Voice-minute wallet (one-time top-ups; reuse the seva `payments` flow,
//    NOT Razorpay Subscriptions). Always priced above the ~₹16/$0.16-per-min
//    cost, so they profit regardless of usage. `minutes` credits as seconds. ──
export interface WalletPack {
  id: string;
  currency: Currency;
  amount: number; // paise / cents
  display: string;
  minutes: number;
}

export const WALLET_PACKS: WalletPack[] = [
  { id: "wallet_inr_4", currency: "INR", amount: 9900, display: "₹99", minutes: 4 },
  { id: "wallet_inr_12", currency: "INR", amount: 29900, display: "₹299", minutes: 12 },
  { id: "wallet_inr_25", currency: "INR", amount: 59900, display: "₹599", minutes: 25 },
  { id: "wallet_usd_15", currency: "USD", amount: 499, display: "$4.99", minutes: 15 },
  { id: "wallet_usd_35", currency: "USD", amount: 999, display: "$9.99", minutes: 35 },
  { id: "wallet_usd_80", currency: "USD", amount: 1999, display: "$19.99", minutes: 80 },
];

// ── Lookups (throw on unknown — callers validate request input first). ──
export function getPlan(key: string): SubscriptionPlan {
  const plan = SUBSCRIPTION_PLANS[key as PlanKey];
  if (!plan) throw new Error(`Unknown subscription plan: ${key}`);
  return plan;
}

export function getOffer(
  key: PlanKey,
  currency: Currency,
  period: BillingPeriod,
): PlanOffer {
  const offer = getPlan(key).offers.find(
    (o) => o.currency === currency && o.period === period,
  );
  if (!offer) {
    throw new Error(`No ${currency}/${period} offer for plan ${key}`);
  }
  return offer;
}

export function getWalletPack(id: string): WalletPack {
  const pack = WALLET_PACKS.find((p) => p.id === id);
  if (!pack) throw new Error(`Unknown wallet pack: ${id}`);
  return pack;
}

export function getPlansInOrder(): SubscriptionPlan[] {
  return PLAN_ORDER.map((k) => SUBSCRIPTION_PLANS[k]);
}
