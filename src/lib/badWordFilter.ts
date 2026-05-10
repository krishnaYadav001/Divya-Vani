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

  // English — clearly-hostile phrases (vs general profanity which is
  // intentionally allowed for venting; see file maintenance notes)
  "fuck off",
  "fuck you",
  "fuck u",
  "f off",
  "motherfucker",
  "mother fucker",
  "shut up",
  "shut the fuck",
  "stfu",
  "go to hell",

  // English — additional hostile slurs / insults (round 3)
  "bitch",
  "bitches",
  "bitchy",
  "dickhead",
  "dickface",
  "dick head",
  "cocksucker",
  "cock sucker",
  "douchebag",
  "douche bag",
  "twat",
  "wanker",
  "fucker",
  "fuckers",
  "shithead",
  "shit head",
  "shitface",
  "son of a bitch",
  "son of bitch",
  "piss off",
  "piss you",
  "screw you",
  "screw off",
  "jackass",

  // Hindi (Devanagari) — sexual slurs (no benign use)
  "मादरचोद",
  "बहनचोद",
  "भोसड़ी",
  "चूतिया",
  "गांडू",

  // Hindi (Devanagari) — additional hostile / sexual slurs (round 3)
  "रंडी",
  "भड़वा",
  "भड़वे",
  "सूअर",
  "कुतिया",
  "माँ चोद",
  "मां चोद",
  "माँ की चूत",
  "मां की चूत",
  "माँ का भोसड़ा",
  "तेरी माँ की",
  "तेरी मां की",
  "तेरी माँ का",
  "तेरी मां का",
  "तेरी बहन की",
  "तेरी बहन का",
  "तेरे बाप का",
  "तेरे बाप की",
  "गधे का बच्चा",
  "मादरजात",
  "बेगैरत",
  "बेग़ैरत",
  "नीच कमीना",
  "हरामी पिल्ला",

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

  // Hindi (Romanized / Hinglish) — additional hostile variants (round 3)
  "randi",
  "raandi",
  "bhadwa",
  "bhadve",
  "bhadwon",
  "bhadua",
  "suar",
  "suvar",
  "sooar",
  "kutiya",
  "kuttiya",
  "kutia",
  "maa chod",
  "ma chod",
  "maa chodu",
  "ma chodu",
  "maa ki chut",
  "ma ki chut",
  "maa ki choot",
  "maa ka bhosda",
  "ma ka bhosda",
  "teri maa ki",
  "teri ma ki",
  "teri maa ka",
  "teri ma ka",
  "teri behen ki",
  "teri bahan ki",
  "teri bhen ki",
  "teri bahn ki",
  "teri behen ka",
  "teri bahan ka",
  "tere baap ka",
  "tere baap ki",
  "madarjat",
  "begairat",
  "begerat",
  "be ghairat",
  "gadhe ka bachcha",
  "gadhe ki aulad",
  "harami pilla",
  "harami pille",

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
