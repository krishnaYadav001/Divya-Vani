export type TierId = "pratham_seva" | "anjali" | "bhakti" | "param";

export interface TierConfig {
  id: TierId;
  displayName: string;
  displayNameHi: string;
  symbol: string;
  priceInr: number;
  amountPaise: number;
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
    messages: 6,
  },
  anjali: {
    id: "anjali",
    displayName: "Anjali Seva",
    displayNameHi: "अंजलि सेवा",
    symbol: "🙏",
    priceInr: 51,
    amountPaise: 5100,
    messages: 30,
  },
  bhakti: {
    id: "bhakti",
    displayName: "Bhakti Seva",
    displayNameHi: "भक्ति सेवा",
    symbol: "🪔",
    priceInr: 101,
    amountPaise: 10100,
    messages: 60,
  },
  param: {
    id: "param",
    displayName: "Param Seva",
    displayNameHi: "परम सेवा",
    symbol: "🕉️",
    priceInr: 501,
    amountPaise: 50100,
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
