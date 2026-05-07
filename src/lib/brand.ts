// Phase 6.9.1 — centralized brand strings.
//
// One frozen object, imported wherever brand text appears. Hedges
// against a third pivot (the brand has already been renamed once,
// from "Krishna AI" to "Divya Vani") becoming a multi-file grep
// rather than a one-line edit.
//
// Pure data only — no helpers, no behavior. `as const` so all
// literals get narrow types and downstream consumers get exhaustive
// autocomplete + compile-time guards against typos.
//
// Skipped intentionally (do NOT add references to BRAND in these):
//   - src/lib/systemPrompt.ts (locked persona file; brand text in
//     the persona prompt would invalidate the Phase 2.6 cache)
//   - src/lib/badWordFilter.ts (locked)
//   - scripts/, test files (intentional fixture hardcoding)

export const BRAND = {
  name: {
    en: "Divya Vani",
    hi: "दिव्य वाणी",
  },
  url: "https://divyavani.co.in",
  description: {
    en: "An AI roleplaying Krishna — speak about life, emotions, and dharma. Grounded in the Bhagavad Gita.",
    hi: "एक शांत जगह, जहाँ आप अपनी बात कह सकते हैं",
  },
  tagline: {
    hi: "जब मन उलझा हो, बस किसी से बात करनी हो…",
  },
  disclaimer: {
    en: "This is an AI roleplaying Krishna based on scripture, not divine guidance.",
    hi: "यह AI शास्त्र-आधारित कृष्ण रूप का अभिनय कर रहा है, दैवीय मार्गदर्शन नहीं।",
  },
  contact: {
    founder: "Krishna Yadav",
    email: "krishnayadav123345@gmail.com",
    location: "Kanpur, Uttar Pradesh, India",
  },
  copyright: {
    year: 2026,
    text: "© 2026 Divya Vani",
  },
} as const;
