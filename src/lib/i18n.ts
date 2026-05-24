// i18n for STATIC UI CHROME ONLY (Phase 12 — i18n, 2026-05-24).
//
// Scope boundary — READ THIS before adding keys:
//   • IN scope: buttons, nav, labels, marketing copy, the footer, the
//     seva/paywall chrome — any string the PRODUCT authors.
//   • OUT of scope: Krishna's chat + voice REPLIES, verse-card content,
//     user messages. Those follow the user's INPUT language at the model
//     layer (Locked Decision #12) and must never be keyed here.
//   • Legal pages (/privacy, /terms) stay English-only by founder
//     decision (2026-05-24) — not keyed here.
//
// Default language is English. Users switch to Hindi via the footer
// toggle (see LanguageProvider). Voice-page bilingual copy already lives
// in BRAND.voiceCopy and is selected by the same `lang`.
//
// `Messages` is an explicit interface (string-valued, NOT `as const`) so
// the en and hi dictionaries share one structural type and `UI_MESSAGES[lang]`
// resolves cleanly. Every key added to `Messages` must exist in both langs.

export type Lang = "en" | "hi";

export const LANG_STORAGE_KEY = "dv_lang";
export const DEFAULT_LANG: Lang = "en";

export type Messages = {
  footer: {
    examples: string;
    voice: string;
    pricing: string;
    privacy: string;
    terms: string;
    settings: string;
    contact: string;
  };
};

export const UI_MESSAGES: Record<Lang, Messages> = {
  en: {
    footer: {
      examples: "Examples",
      voice: "Voice",
      pricing: "Pricing",
      privacy: "Privacy",
      terms: "Terms",
      settings: "Settings",
      contact: "Contact",
    },
  },
  hi: {
    footer: {
      examples: "उदाहरण",
      voice: "आवाज़",
      pricing: "मूल्य",
      privacy: "गोपनीयता",
      terms: "नियम",
      settings: "सेटिंग्स",
      contact: "संपर्क",
    },
  },
};
