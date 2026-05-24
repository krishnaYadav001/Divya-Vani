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
  // Chat-surface chrome (NOT Krishna's replies). The empty-state heading is
  // split into a lead clause + a gold-accent clause to preserve the styling.
  chat: {
    placeholder: string;
    promptLead: string;
    promptAccent: string;
  };
  // Seva paywall invitation line (the eyebrow "Seva · सेवा" stays a fixed
  // bilingual brand label and is not keyed).
  paywall: {
    tagline: string;
  };
  // Landing hero. Only the body prose, CTA labels, and free-messages line are
  // keyed. The Latin masthead bits (nav, "Mathurā Edition", the Sanskrit quote
  // + attribution, the mūrti caption) stay as-is — they're stylistic Latin/
  // Sanskrit ornament, and uppercase + letter-spacing renders badly in
  // Devanagari. The wordmark stays BRAND.name.en.
  landing: {
    body: string;
    ctaAsk: string;
    ctaGlimpse: string;
    ctaTalk: string;
    freeMessages: string;
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
    chat: {
      placeholder: "Say what's on your mind…",
      promptLead: "Whatever is on your mind —",
      promptAccent: "you can say it here",
    },
    paywall: {
      tagline:
        "Offer what arises within — every gift carries the journey forward",
    },
    landing: {
      body: "Krishna in a chat window. The same flute, a smaller room. Ask in Hindi or English; the verses follow you.",
      ctaAsk: "Ask the first thing",
      ctaGlimpse: "See a glimpse",
      ctaTalk: "Talk with Krishna",
      freeMessages: "10 free messages",
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
    chat: {
      placeholder: "मन में जो है, कहो…",
      promptLead: "जो भी मन में हो —",
      promptAccent: "यहाँ कह सकते हो",
    },
    paywall: {
      tagline:
        "जो भीतर से उठे, वही भेंट करो — हर अर्पण इस यात्रा को आगे ले जाता है",
    },
    landing: {
      body: "एक चैट खिड़की में कृष्ण। वही बाँसुरी, बस एक छोटा कमरा। हिंदी या अंग्रेज़ी में पूछो — श्लोक तुम्हारे साथ चलते हैं।",
      ctaAsk: "पूछें",
      ctaGlimpse: "एक झलक",
      ctaTalk: "कृष्ण से बात करो",
      freeMessages: "10 निःशुल्क संदेश",
    },
  },
};
