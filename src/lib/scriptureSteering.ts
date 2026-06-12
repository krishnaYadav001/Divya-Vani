// Server-side current-turn steering for cases where waiting on Haiku would
// either add latency (voice) or let retrieval gravity pull too hard toward Gita.

const DIRECT_RELATIONSHIP_RE =
  /\b(girlfriend|boyfriend|gf|bf|ex|ex-girlfriend|ex-boyfriend|breakup|break-up|broke up|ghosted|blocked me|relationship|relation|romantic|love story|lover|crush|partner|dating|marry|marriage|wife|husband|shaadi|shadi|vivah|rishta|premika|premi)\b|\u0917\u0930\u094d\u0932\u092b\u094d\u0930\u0947\u0902\u0921|\u092c\u0949\u092f\u092b\u094d\u0930\u0947\u0902\u0921|\u092a\u094d\u0930\u0947\u092e\u093f\u0915\u093e|\u092a\u094d\u0930\u0947\u092e\u0940|\u0930\u093f\u0936\u094d\u0924\u093e|\u0930\u093f\u0936\u094d\u0924\u0947|\u0936\u093e\u0926\u0940|\u0935\u093f\u0935\u093e\u0939|\u092a\u0924\u094d\u0928\u0940|\u092a\u0924\u093f|\u091b\u094b\u0921[\u093c\u095c]? \u0926\u093f\u092f\u093e|\u092c\u094d\u0930\u0947\u0915\u0905\u092a/i;

const ROMANTIC_LOVE_CONTEXT_RE =
  /\b(still love|love (her|him|them)|loved (her|him|them)|in love with|unreturned love|lost my love|waiting for (her|him|them)|she left me|he left me|they left me|pyaar karta|pyaar karti|pyar karta|pyar karti|prem karta|prem karti)\b|\u092a\u094d\u0930\u0947\u092e|\u092a\u094d\u092f\u093e\u0930/i;

const DEVOTIONAL_OBJECT_RE =
  /\b(krishna|kanha|govind|bhagwan|god|lord|aap|aapse|apse|tumse|shyam|radhe)\b|\u0915\u0943\u0937\u094d\u0923|\u0915\u093e\u0928\u094d\u0939\u093e|\u092d\u0917\u0935\u093e\u0928|\u0930\u093e\u0927\u0947/i;

const CONTINUATION_RE =
  /\b(what should i do|what do i do|what now|now what|should i wait|should i text|should i call|move on|let go|reply|message|call|talk|again|still|her|him|them|she|he|they|usse|usko|use|kya karu|kya karoon|ab kya|kaise|bhoolu|bhulu)\b|\u0905\u092c \u0915\u094d\u092f\u093e|\u0915\u094d\u092f\u093e \u0915\u0930\u0942\u0901|\u0915\u094d\u092f\u093e \u0915\u0930\u0942\u0902|\u0909\u0938\u0947|\u0909\u0938\u0915\u094b/i;

const STRONG_NON_RELATIONSHIP_RE =
  /\b(career|job|business|startup|exam|study|school|college|money|finance|health|illness|disease|spiritual practice|meditation|sadhana)\b|\u0915\u0930\u093f\u092f\u0930|\u0928\u094c\u0915\u0930\u0940|\u092c\u093f\u091c\u0928\u0947\u0938|\u092a\u0930\u0940\u0915\u094d\u0937\u093e|\u092a\u0948\u0938\u093e|\u0938\u094d\u0935\u093e\u0938\u094d\u0925\u094d\u092f/i;

const BETRAYAL_RE =
  /\b(cheat|cheated|betray|betrayed|betrayal|lied|ghosted|blocked|dhokha|daga)\b|\u0927\u094b\u0916\u093e|\u0926\u0917\u093e|\u091d\u0942\u0920|\u091a\u0941\u092a \u0939\u094b/i;

const MARRIAGE_RE =
  /\b(marry|marriage|shaadi|shadi|vivah|rishta|wife|husband|kundali)\b|\u0936\u093e\u0926\u0940|\u0935\u093f\u0935\u093e\u0939|\u0930\u093f\u0936\u094d\u0924\u093e|\u092a\u0924\u094d\u0928\u0940|\u092a\u0924\u093f|\u0915\u0941\u0902\u0921\u0932\u0940/i;

const FAMILY_RE =
  /\b(family|parents?|mother|father|ghar wale|gharwale|papa|mummy|maa|approval|disapprove|disapproves)\b|\u092a\u0930\u093f\u0935\u093e\u0930|\u0918\u0930 \u0935\u093e\u0932\u0947|\u092e\u093e\u0901|\u092a\u093e\u092a\u093e|\u092a\u093f\u0924\u093e|\u092e\u093e\u0924\u093e|\u092e\u092e\u094d\u092e\u0940|\u0930\u093e\u091c[\u093c\u095c]\u0940|\u0930\u091c\u093e\u092e\u0902\u0926\u0940/i;

const JEALOUSY_RE =
  /\b(jealous|jealousy|jalan|jalta|jalti)\b|\u091c\u0932\u0928|\u0908\u0930\u094d\u0937\u094d\u092f\u093e/i;

const FORGIVENESS_RE =
  /\b(forgive|forgiveness|maaf|mafi)\b|\u092e\u093e\u092b|\u0915\u094d\u0937\u092e\u093e/i;

function hasRomanticRelationshipCue(text: string): boolean {
  if (DIRECT_RELATIONSHIP_RE.test(text)) return true;
  if (!ROMANTIC_LOVE_CONTEXT_RE.test(text)) return false;

  // "I love Krishna" is devotional love, not girlfriend/boyfriend heartbreak.
  return !DEVOTIONAL_OBJECT_RE.test(text);
}

function shouldUsePriorRelationshipContext(
  message: string,
  priorSummary?: string | null,
): boolean {
  if (!priorSummary || !hasRomanticRelationshipCue(priorSummary)) return false;
  if (STRONG_NON_RELATIONSHIP_RE.test(message)) return false;

  const wordCount = message.trim().split(/\s+/).filter(Boolean).length;
  return wordCount <= 5 || CONTINUATION_RE.test(message);
}

function relationshipContextText(
  message: string,
  priorSummary?: string | null,
): string {
  if (hasRomanticRelationshipCue(message)) {
    return `${message}\n${priorSummary ?? ""}`;
  }
  if (shouldUsePriorRelationshipContext(message, priorSummary)) {
    return `${message}\n${priorSummary ?? ""}`;
  }
  return "";
}

export function isRomanticRelationshipTurn(
  message: string,
  priorSummary?: string | null,
): boolean {
  return relationshipContextText(message, priorSummary).length > 0;
}

export function deterministicQueryThemesForTurn(
  message: string,
  priorSummary?: string | null,
): string[] {
  const text = relationshipContextText(message, priorSummary);
  if (text.length === 0) return [];

  const themes = new Set<string>(["attachment", "longing", "grief"]);
  if (BETRAYAL_RE.test(text)) themes.add("betrayal");
  if (MARRIAGE_RE.test(text)) themes.add("marriage");
  if (FAMILY_RE.test(text)) themes.add("family-conflict");
  if (JEALOUSY_RE.test(text)) themes.add("jealousy");
  if (FORGIVENESS_RE.test(text)) themes.add("forgiveness");

  return [...themes];
}

export function buildScriptureSteeringBlock(
  message: string,
  priorSummary?: string | null,
): string {
  if (!isRomanticRelationshipTurn(message, priorSummary)) return "";

  return `CURRENT-TURN SCRIPTURE STEERING:
- The devotee is speaking about romantic love, a breakup, marriage pressure, or relationship pain. Treat this as a Bhagavata/Vrindavan/Rukmini/Gopi lane, not an Arjuna/Kurukshetra lane.
- Private order for this reply: first read the user's emotional state; then read their current understanding (do they need comfort, explanation, a decision path, or help letting go?); then choose ONE love-appropriate parallel; then give the path that parallel reveals. Do not announce this analysis.
- First acknowledge the hurt in the user's actual frame: girlfriend, boyfriend, ex, love, silence, family pressure, or waiting.
- Match the solution to the emotional shape: grief/longing -> separation without self-erasure; betrayal/ghosting -> dignity and clear seeing; family pressure/marriage -> patient courage like Rukmini; confusion about whether to keep waiting -> distinguish love in the heart from the other person's closed door.
- Prefer ONE love-appropriate parallel: gopi viraha / Bhramara-gita for longing, silence, ghosting, or separation; Rukmini's letter for choosing love with dignity and patience; Uddhava with the gopis for love that cannot be solved by clever advice; Sudama only if the pain is about worthiness/status; Yashoda only if the heart of the issue is care rather than romance.
- Do NOT invoke Arjuna, Kurukshetra, battlefield despair, or "as I told Arjuna" for romantic breakup/love turns unless the user explicitly asks about moral duty, action, war, or a career/path decision.
- If RELEVANT SCRIPTURE is Gita-heavy but the user's situation is love/relationship pain, use the Gita only as a secondary teaching after the love parallel, or do not cite it aloud if it would distort the moment.`;
}
