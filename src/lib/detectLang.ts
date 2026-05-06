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
//
// Phase 5.5 — sticky priorLang fallback. Single-word ambiguous replies
// (a name, "ok", "haan") in an otherwise Hindi conversation should
// inherit the prior conversation language rather than flipping to
// English just because they're Latin-script. Only fires when the
// CURRENT message has no clear language signal AND the caller passes
// a priorLang to inherit. Clear signals (>=3 words, OR any Devanagari,
// OR explicit Sanskrit markers) bypass the sticky rule and use
// per-message detection as before.

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

  if (priorLang) {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    const hasDevanagari = devanagari > 0;
    if (wordCount < 3 && !hasDevanagari) {
      return priorLang;
    }
  }

  return devanagari / stripped.length > 0.3 ? 'hi' : 'en';
}
