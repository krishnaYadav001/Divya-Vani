import type { Currency } from "./subscriptions";

export type TierId = "pratham_seva" | "anjali" | "bhakti" | "param";

export interface TierConfig {
  id: TierId;
  displayName: string;
  displayNameHi: string;
  symbol: string;
  // ── India pricing (INR) ──
  priceInr: number;
  amountPaise: number;
  // ── NRI / international pricing (USD) ──
  // Priced to US willingness-to-pay, NOT an INR conversion — mirrors the USD
  // subscription + voice-wallet ladders. The message count is identical to the
  // INR tier (unified entitlement: same product, priced per market); only the
  // price differs. amountUsdCents is the smallest-unit value sent to Razorpay
  // when the buyer's region resolves to USD.
  priceUsd: number;
  amountUsdCents: number;
  priceUsdDisplay: string;
  messages: number;
}

export const TIER_CONFIG: Record<TierId, TierConfig> = {
  pratham_seva: {
    id: "pratham_seva",
    displayName: "Pratham Seva",
    displayNameHi: "प्रथम सेवा",
    symbol: "🪷",
    priceInr: 11,
    amountPaise: 1100,
    priceUsd: 2.99,
    amountUsdCents: 299,
    priceUsdDisplay: "$2.99",
    messages: 6,
  },
  anjali: {
    id: "anjali",
    displayName: "Anjali Seva",
    displayNameHi: "अंजलि सेवा",
    symbol: "🙏",
    priceInr: 51,
    amountPaise: 5100,
    priceUsd: 6.99,
    amountUsdCents: 699,
    priceUsdDisplay: "$6.99",
    messages: 30,
  },
  bhakti: {
    id: "bhakti",
    displayName: "Bhakti Seva",
    displayNameHi: "भक्ति सेवा",
    symbol: "🪔",
    priceInr: 101,
    amountPaise: 10100,
    priceUsd: 14.99,
    amountUsdCents: 1499,
    priceUsdDisplay: "$14.99",
    messages: 60,
  },
  param: {
    id: "param",
    displayName: "Param Seva",
    displayNameHi: "परम सेवा",
    symbol: "🕉️",
    priceInr: 501,
    amountPaise: 50100,
    priceUsd: 39.99,
    amountUsdCents: 3999,
    priceUsdDisplay: "$39.99",
    messages: 350,
  },
};

export const TIER_ORDER: TierId[] = ["pratham_seva", "anjali", "bhakti", "param"];

export function getTier(id: string): TierConfig {
  const config = TIER_CONFIG[id as TierId];
  if (!config) {
    throw new Error(`Unknown seva tier: ${id}`);
  }
  return config;
}

export function getTiersInOrder(): TierConfig[] {
  return TIER_ORDER.map((id) => TIER_CONFIG[id]);
}

/** Smallest-unit amount (paise for INR, cents for USD) to charge for a tier. */
export function getTierAmount(tier: TierConfig, currency: Currency): number {
  return currency === "USD" ? tier.amountUsdCents : tier.amountPaise;
}

/** Human display price for a tier in the given currency ("₹501" / "$39.99"). */
export function getTierPriceDisplay(
  tier: TierConfig,
  currency: Currency,
): string {
  return currency === "USD" ? tier.priceUsdDisplay : `₹${tier.priceInr}`;
}

/**
 * Recover the currency a stored payment was charged in by matching its stored
 * minor-unit amount against the tier's INR-paise vs USD-cents values. The two
 * never collide for any tier (₹11=1100p vs $2.99=299c, … ₹501=50100p vs
 * $39.99=3999c), so this is unambiguous and avoids adding a currency column to
 * the shared `payments` table. Falls back to INR if neither matches (legacy
 * rows / unexpected amounts).
 */
export function inferCurrencyFromAmount(
  tier: TierConfig,
  amountMinor: number,
): Currency {
  return amountMinor === tier.amountUsdCents ? "USD" : "INR";
}
