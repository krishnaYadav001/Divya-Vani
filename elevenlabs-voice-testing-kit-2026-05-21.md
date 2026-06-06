# ElevenLabs Voice Testing Kit — Divya Vani

Five Krishna-mode passages + evaluation rubric + decision tree. Use this to test ElevenLabs Voice Library voices against Krishna's actual voice range before committing to one.

## Account setup

1. Sign up at https://elevenlabs.io — free tier is enough for testing (10,000 credits/month ≈ 10 min of Multilingual v2 TTS). No card required.
2. Free tier has NO commercial-use rights — fine for testing, not for production. When you ship, upgrade to Creator ($22/mo, 100K credits ≈ 100 min/mo, professional voice clone unlocked, commercial rights). Pro ($99/mo, 500K credits) if traffic grows past ~3,000 turns/month.

## Model choice

Use **Multilingual v2** for all tests. Reasons:
- It's the stable workhorse, 29 languages including Hindi.
- Better voice control parameters (stability, similarity, style) — important for keeping Krishna's calm steady register.
- Eleven v3 (alpha) is more emotional but offers LESS control — risky for a persona that needs consistency.

You can test one voice on v3 as a side experiment if you're curious, but ship v2.

## Voice Library filter

Go to https://elevenlabs.io/voice-library and apply these filters:

- **Language:** Hindi (or "Hindi" + "Indian English" if Hindi-only is too narrow)
- **Gender:** Male
- **Age:** Middle-aged or Older
- **Use case:** Narration / Conversational / Characters (avoid "Social Media" — those tend to be high-energy)
- **Accent:** Indian (try Hindi-native first, fall back to Indian-English)

Aim for 5–10 candidate voices. Some names that surfaced in 2026 reviews — worth checking if they're still in the library:
- Suman Pro (deep, calm male voice)
- Ravikant (Hindi native)
- Rudransh (deep mature documentary voice)

These are starting points. Browse the full filter result and pick by feel.

## The 5 test passages

Paste each into the Voice Library "Try it" / "Generate" box. Run each candidate voice against ALL FIVE passages. Listen on headphones in a quiet room. Note your reactions in a simple spreadsheet (voice_id × passage = quick score).

### Passage 1 — Gita mode (gravitas, philosophical authority)

```
धनुष नीचे रख दो, अर्जुन। यह क्षण तुम्हारा है — पर तुम्हारा नहीं। जो कर्म आज तुम्हारे सामने है, उसे करो, और फल मुझ पर छोड़ दो। मन का भार उठाने का प्रयास मत करो — वह भार तुम्हारा कभी था ही नहीं। बस अपना धर्म पहचानो, और चलते रहो।
```

What to listen for: weight, stillness, unhurried pace. Voice should sound like a teacher who has nothing to prove.

### Passage 2 — Sakhya mode (friend, warm, shares own life)

```
मेरा दिन भी कुछ ऐसा ही गुज़रता था, मित्र। सुबह गायों के पीछे, दोपहर बंसी बजाते, और शाम को सुदामा के साथ बैठ कर बातें — कितनी छोटी बातें, पर वही सबसे बड़ी थीं। तुम्हारी थकान समझता हूँ। कभी-कभी सबसे बड़ी राहत यही होती है — किसी के पास बैठना, बिना कुछ कहे।
```

What to listen for: warmth, casualness, the smile-in-the-voice. Should sound like a friend, not a guru.

### Passage 3 — Bhagavata mode (compassion, surrender, soft)

```
रुको। साँस लो। जो भारीपन है, उसे जल्दी से दूर करने की कोशिश मत करो। कभी-कभी मन की पीड़ा हमारे लिए ही आती है — हमें कुछ सिखाने, हमें कुछ याद दिलाने। मैं यहाँ हूँ। तुम्हारे पास। जो भी कहना चाहो, कह दो — चाहे आँसुओं में, चाहे शब्दों में।
```

What to listen for: gentleness, the pauses, room for silence between sentences. Voice should be able to slow down without dragging.

### Passage 4 — Vrindavan mode (pastoral, lyrical, intimate)

```
वृंदावन की वो शाम याद है? जब यमुना के किनारे गोपियाँ मुझे ढूँढती थीं, और मैं पेड़ के पीछे छुप जाता था — हँसते हुए। प्रेम छुपने का खेल नहीं है, फिर भी हम छुपते हैं। तुम भी छुप रहे हो शायद — खुद से। बाहर आओ। वहीं मिलेगा जिसकी तलाश है।
```

What to listen for: musicality, lightness, a hint of play. Hardest mode to find in stock voices — most "Indian narrator" voices sound too formal here.

### Passage 5 — Mahabharata mode (strategic, weighty decisions)

```
युद्ध कभी आसान नहीं होता, चाहे रण में हो या मन में। जो निर्णय आज तुम्हारे सामने है, वह कोई और नहीं ले सकता — तुम ही लेना है। मैं रथ हाँक सकता हूँ, सलाह दे सकता हूँ, पर बाण चलाने का अधिकार सिर्फ तुम्हारा है। डर है, समझता हूँ। फिर भी — उठो।
```

What to listen for: resolve without aggression. The voice must not turn into a war-movie narrator. Calm authority, not battle-cry.

## Evaluation rubric

Score each voice × passage on these dimensions (1–5 each):

1. **Pronunciation** — does it handle Devanagari conjuncts (क्ष, ज्ञ, श्र) cleanly? Numbers, proper nouns? Common failure point in stock voices for Hindi.
2. **Emotional fit** — does the voice's natural register match THIS passage? A grave voice may sound wrong in Sakhya. A warm voice may sound weak in Mahabharata.
3. **Pace** — Krishna speaks unhurried. Rushed voices fail. So do dragging voices.
4. **Tone** — calm, not preachy, not newscaster. Mature but not old.
5. **Mic quality** — clean signal, no breathy artifacts, no robotic moments on long sentences.

A voice that scores 20+/25 on a passage is a strong fit. 15–19 is workable. <15, skip.

## Decision tree

- **One voice scores 20+ on ALL 5 passages** → Ship that voice. Get the voice_id from the URL or voice detail page. Bring it to advisor + I'll draft the Phase 10.1 backend CC prompt.
- **Different voices score high on different modes** → Two paths:
  - **Path A:** Pick best-overall, accept some range loss. Simpler backend. Recommended for v1.
  - **Path B:** Use mode-specific voices (different voice_id per Krishna mode). Backend needs mode detection or persona-tag passthrough. More complex; defer to v2.
- **No voice scores well across modes** → Fall back to **cloning your own voice**. You already have 4–5 hours recorded. Workflow:
  1. Adobe Podcast Enhance (https://podcast.adobe.com/enhance) on your raw recordings — removes room noise, hum, plosives. Free.
  2. ElevenLabs Voice Lab → Professional Voice Clone (requires Creator plan).
  3. Upload your cleaned recordings — ElevenLabs trains a fine-tuned clone (~1–2 hour wait).
  4. Test the clone against the same 5 passages.
  5. Iterate if needed (add more samples, retrain).

## Budget reminder

You're paying ~8× Sarvam pricing for ElevenLabs. The cost-saving techniques are mandatory in the backend (confirmed in earlier session): cache common replies, cap reply length at 80–100 words for TTS, Multilingual v2 only, optional reply summarization via Haiku if a reply exceeds the cap. Without these, ElevenLabs at scale gets expensive.

## When you're done

Bring back to advisor:
- The voice_id you picked (or the decision to clone)
- Brief notes on what scored well and what didn't (helps the backend prompt)
- Any concerns about pronunciation or specific words that the voice struggled with — those might need pronunciation hints in the API call
