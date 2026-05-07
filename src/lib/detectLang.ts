// Heuristic language detection for chat messages. Returns 'hi' if
// the input is Devanagari-dominant (>30% of stripped chars in
// U+0900–U+097F) OR Hinglish (Latin-script Hindi), else 'en'.
// Used to route both verse-card label formatting and Krishna's reply
// language per locked decision #12 (reply in user's input language).
//
// 30% Devanagari threshold accommodates: bilingual Hindi messages with
// English proper nouns (e.g. "मेरा name क्या है?"), transliterated Sanskrit
// terms in roman, and short messages where one English filler ("ok")
// shouldn't flip the language.
//
// Phase 5.5 — sticky priorLang fallback. Single-word ambiguous replies
// (a name, "ok", "haan") in an otherwise Hindi conversation should
// inherit the prior conversation language rather than flipping to
// English just because they're Latin-script. Only fires when the
// CURRENT message has no clear language signal AND the caller passes
// a priorLang to inherit. Clear signals (>=3 words, OR any Devanagari,
// OR sufficient Hinglish vocab) bypass the sticky rule.
//
// Phase 6.X — Hinglish (Romanized Hindi) layer. Many UP/Hindi-belt users
// type Hindi in Latin script ("main bahut khush hu") because Devanagari
// keyboards are slow on phones. Treat Hinglish as a writing-script variant
// of Hindi, not a separate language: input → Hindi reply (Devanagari).
// Triggers only on Latin-only input with >=3 tokens AND >=40% of tokens
// matching the curated HINGLISH_VOCAB. The 40% threshold is the floor
// that separates Hinglish from English-with-incidental-Hindi-noun
// ("Tell me about Yashoda" — 0% match → en).

const HINGLISH_VOCAB: ReadonlySet<string> = new Set([
  // Pronouns
  'main', 'mai', 'maine', 'mujhe', 'mujhko',
  'tu', 'tum', 'tujhe', 'tumko', 'tumhe',
  'aap', 'aapko', 'aapka', 'aapki', 'aapke',
  'hum', 'hume', 'humko',
  'mera', 'meri', 'mere',
  'tumhara', 'tumhari', 'tumhare',
  'humara', 'humari', 'humare',
  'apna', 'apni', 'apne',
  'uska', 'uski', 'uske', 'usko', 'unhe',
  'unka', 'unki', 'unke', 'isko',
  'yeh', 'ye', 'vo', 'voh', 'woh', 'jo',

  // Common verbs (Romanized)
  'hai', 'hain', 'ho', 'hu', 'hoon', 'hota', 'hoti', 'hote',
  'tha', 'thi', 'the',
  'kar', 'karo', 'karta', 'karti', 'karte',
  'kiya', 'kiye', 'karu', 'karna', 'karenge', 'karein',
  'jana', 'jao', 'jaa', 'ja', 'jata', 'jati', 'jate',
  'gaya', 'gayi', 'gaye',
  'aana', 'aao', 'aaya', 'aayi', 'aa', 'aata', 'aati', 'aate',
  'dena', 'denge', 'diya', 'do', 'dijiye',
  'lena', 'liya', 'lo', 'le',
  'mil', 'mila', 'milta', 'milti', 'milte', 'milegi', 'milega',
  'sun', 'sunna', 'suno', 'suna',
  'dekh', 'dekho', 'dekha', 'dekhna', 'dekhi',
  'bata', 'batao', 'bataya', 'kaha', 'kahta', 'kahti',
  'raha', 'rahi', 'rahe', 'rahega', 'rahegi',
  'chahiye', 'chahta', 'chahti', 'chahte',
  'samjho', 'samajh', 'samjha', 'samjhi', 'samajhna',
  'sochna', 'soch', 'socho', 'socha',
  'lagta', 'lagti', 'lage', 'lagi',
  'banna', 'banta', 'banti', 'banaya',
  'pata', 'jaanta', 'jaanti', 'jaante',

  // Particles / connectors
  'ka', 'ki', 'ke', 'ko', 'se', 'par', 'pe',
  'aur', 'ya', 'lekin', 'magar', 'kyunki', 'kyu',
  'agar', 'jab', 'tab', 'phir', 'fir', 'bhi', 'hi',
  'to', 'toh', 'mein', 'tak',

  // Negation
  'nahi', 'nahin', 'mat', 'na',

  // Question words
  'kya', 'kyon', 'kyo', 'kaise', 'kaisa', 'kaisi',
  'kahan', 'kahaan', 'kab', 'kaun', 'kitna', 'kitne', 'kitni',

  // Adjectives / quantifiers
  'accha', 'acha', 'achha', 'theek', 'sahi', 'galat',
  'bahut', 'bohot', 'bahot', 'thoda', 'thodi',
  'jyada', 'zyada', 'kam', 'sab', 'sabhi',
  'kuch', 'kuchh', 'koi', 'har', 'sara', 'saari',

  // Emotions
  'khush', 'khushi', 'udaas', 'gussa', 'gusa',
  'pareshan', 'dukh', 'dukhi',
  'dard', 'pyar', 'pyaar', 'mohabbat', 'ishq',
  'chinta', 'dar', 'darr', 'takleef', 'shanti',

  // Family / people
  'maa', 'baap', 'pita', 'pitaji', 'mata', 'mataji',
  'bhai', 'bhaiya', 'behan', 'behen', 'beti', 'beta',
  'dost', 'pati', 'patni',
  'dada', 'dadi', 'nana', 'nani',

  // Spiritual / honorific
  'bhagwan', 'bhagvaan', 'ishwar', 'prabhu', 'guru', 'swami',
  'krishna', 'kanha', 'kanhaiya', 'kanhaa',
  'ram', 'raam', 'shiv', 'shankar',
  'dharma', 'dharm', 'karma', 'bhakti',
  'atma', 'mukti', 'moksha',
  'devi', 'kripa', 'aashirwad',
  'ji', 'sahab', 'saheb',

  // Time / place
  'aaj', 'kal', 'abhi', 'ab', 'raat', 'din', 'subah', 'sham',
  'ghar', 'jagah', 'yahaan', 'wahaan', 'yahan', 'wahan',
  'idhar', 'udhar', 'kabhi', 'hamesha', 'kabse',

  // Common nouns
  'kaam', 'baat', 'naam', 'mann', 'man', 'dil',
  'jeevan', 'zindagi', 'samasya', 'prem',
  'izzat', 'mehnat', 'lagan', 'jaan',

  // Greetings
  'namaste', 'pranam', 'dhanyavad', 'shukriya', 'namaskar',
  'jai', 'hare',

  // Body / feeling
  'neend', 'bhookh', 'pyaas', 'thakaan',
]);

function tokenizeForHinglish(text: string): string[] {
  // Lowercase, strip diacritics, split on any non-letter, drop short fragments.
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 2);
}

export function detectLang(
  text: string,
  priorLang?: 'hi' | 'en',
): 'hi' | 'en' {
  const stripped = text.replace(/\s/g, '');
  if (stripped.length === 0) return priorLang ?? 'hi';
  let devanagari = 0;
  for (const ch of stripped) {
    const code = ch.codePointAt(0);
    if (code !== undefined && code >= 0x0900 && code <= 0x097f) devanagari++;
  }

  const hasDevanagari = devanagari > 0;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  // Phase 5.5 sticky priorLang for short Latin-only ambiguous inputs.
  if (priorLang && wordCount < 3 && !hasDevanagari) {
    return priorLang;
  }

  // Devanagari-dominant → hi.
  if (devanagari / stripped.length > 0.3) return 'hi';

  // Phase 6.X Hinglish layer — Latin-script Hindi → 'hi'.
  if (!hasDevanagari && wordCount >= 3) {
    const tokens = tokenizeForHinglish(text);
    if (tokens.length >= 3) {
      let matched = 0;
      for (const t of tokens) {
        if (HINGLISH_VOCAB.has(t)) matched++;
      }
      if (matched / tokens.length >= 0.4) return 'hi';
    }
  }

  return 'en';
}
