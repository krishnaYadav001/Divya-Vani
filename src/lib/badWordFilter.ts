// Client-side bad-word filter. Blocks submission while input contains
// any banned word. Goal: prevent inappropriate content before it reaches
// the AI. This is a shame-free input gate, not a comprehensive content
// moderation system.
//
// Maintenance:
// - Keep the list short and obvious. Edge cases (mild slang, swears
//   with benign uses) cause false positives that frustrate users.
// - Match is case-insensitive substring. Substring catches conjugations
//   automatically (e.g. "chutiya" catches "chutiyaa", "chutiyon").
// - When in doubt, do NOT add a word. The user might be venting
//   legitimately ("I feel like shit", "मेरी ज़िंदगी बकवास है") and
//   blocking that breaks the calm vibe.
// - Casteist slurs are deliberately not included here — many community
//   names are also used as slurs, and substring matching cannot
//   distinguish. Add when you have specific abuse patterns to block,
//   not preemptively.

const BANNED: string[] = [
  // English — gendered/homophobic slurs
  "slut",
  "whore",
  "cunt",
  "faggot",

  // English — direct threats
  "kys",
  "kill yourself",
  "kill you",

  // Hindi (Devanagari) — sexual slurs (no benign use)
  "मादरचोद",
  "बहनचोद",
  "भोसड़ी",
  "चूतिया",
  "गांडू",

  // Hindi (Romanized / Hinglish) — common typed variants of the above
  "madarchod",
  "behenchod",
  "behanchod",
  "bhenchod",
  "bhosdi",
  "bhosadi",
  "chutiya",
  "gaandu",
  "gandu",

  // Hindi — direct threats
  "जान से मार",
  "जान से मारूँगा",
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function findBannedWord(text: string): string | null {
  const t = normalize(text);
  if (!t) return null;
  for (const w of BANNED) {
    if (t.includes(w.toLowerCase())) return w;
  }
  return null;
}

export function containsBannedWord(text: string): boolean {
  return findBannedWord(text) !== null;
}
