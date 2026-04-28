import type { TierConfig } from "@/lib/seva";

export type Role = "user" | "assistant";

export interface VerseCitation {
  reference: string;        // e.g. "gita_2.47"
  sanskrit: string;
  transliteration: string;
  hindi: string;
  english: string;
}

export interface SafetyHelpline {
  label: string;            // e.g. "iCall"
  number: string;           // e.g. "9152987821"
}

export interface SafetyCard {
  type: "self_harm" | "harm_others";
  title: string;            // bilingual headline
  body: string;             // bilingual supportive paragraph
  helplines: SafetyHelpline[];
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  paywall?: boolean;
  tiers?: TierConfig[];
  verses?: VerseCitation[];
  safety_card?: SafetyCard;
}
