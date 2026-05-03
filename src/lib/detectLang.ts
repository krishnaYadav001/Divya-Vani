// Heuristic language detection for chat messages. Returns 'hi' if
// the input is Devanagari-dominant (>30% of stripped chars in
// U+0900–U+097F), else 'en'. Used to route verse-card label
// formatting between Hindi and English per locked decision #12
// (Krishna replies in user's input language).
//
// 30% threshold accommodates: bilingual Hindi messages with English
// proper nouns (e.g. "मेरा name क्या है?"), transliterated Sanskrit
// terms in roman, and short messages where one English filler
// ("ok") shouldn't flip the language.

export function detectLang(text: string): 'hi' | 'en' {
  const stripped = text.replace(/\s/g, '');
  if (stripped.length === 0) return 'hi';
  let devanagari = 0;
  for (const ch of stripped) {
    const code = ch.codePointAt(0);
    if (code !== undefined && code >= 0x0900 && code <= 0x097f) devanagari++;
  }
  return devanagari / stripped.length > 0.3 ? 'hi' : 'en';
}
