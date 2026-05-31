# Phase 10 Design — Krishna Voice (Custom TTS Voice Clone)

> **Status:** Pre-implementation design doc. Founder explicitly authorized re-sequencing — Phase 10 moved AHEAD of Phase 9 (subscriptions). Voice is now the acquisition lever, not the post-launch upsell.
>
> **Strategic rationale:** Target audience is older, spiritual, less typing-comfortable. Voice solves their UX problem AND acts as marketing differentiator (video of AI Krishna speaking is shareable content). Phase 13 (real-time V2V) gated on subscriber volume; Phase 10 (Krishna replies in voice) gives 80% of the impact at 10% of the cost.
>
> **Founder decisions locked:**
> - Custom Krishna voice clone (not default vendor voice)
> - Separate "/voice" mode with always-on audio per reply (existing /chat stays text-only)
> - Vendor preference: my recommendation = Sarvam Bulbul V3
>
> **Last updated:** 2026-05-17. Vendor data web-verified against current 2026 sources (see Sources section).

---

## Product summary

Add a dedicated voice-chat surface where Krishna's every reply auto-plays in a custom-cloned Hindi voice. Existing /chat remains text-only. Users self-select voice experience.

| Surface | URL | Audio behavior | User input |
|---|---|---|---|
| Existing text chat | /chat | None (text only) | Type or mic-dictation |
| **NEW** voice chat | /voice (or /talk) | Auto-play on every Krishna reply | Type or mic-dictation (V1) |

User input remains text/mic-dictation in V1 (Phase 10) — full real-time voice-in-voice-out is Phase 13 (separately gated). Voice-mode users TYPE OR DICTATE their question, then HEAR Krishna's reply in his voice.

---

## Vendor analysis — Sarvam Bulbul V3 vs ElevenLabs (top 2)

### Sarvam Bulbul V3 — RECOMMENDED

**Why it wins for Divya Vani:**

| Factor | Sarvam Bulbul V3 | Why it matters |
|---|---|---|
| **Hindi quality** | Native — 35+ voices across 11 Indian languages, sourced from professional Indian voice artists | Best-in-class Hindi pronunciation, no English-accented Hindi artifacts |
| **Voice cloning** | Supported with consent safeguards | Required for custom Krishna voice |
| **Vendor consistency** | Already integrated as STT (Saaras V3, Phase 8.0 d06984d) | Same dashboard, same API key pattern, same Indian data residency story for /privacy |
| **DPDP compliance** | Indian data residency, DPDP-friendly | Matches existing privacy posture |
| **Development cost** | **UNLIMITED API access through Feb 28, 2026** | Build entire Phase 10 for free during dev sprint |
| **Production cost** | Per-character pricing similar to industry (~₹15-25 per million chars expected) | Comparable to or cheaper than ElevenLabs |
| **Free credits** | ₹1,000 on signup | Covers initial testing post-Feb 2026 |

**Risks / unknowns:**
- Post-Feb 2026 paid pricing not yet published — request quote during dev
- Voice cloning consent process for "Krishna" character (no real person to consent — likely OK but verify)
- Streaming TTS latency vs batch — affects perceived "live" feel

### ElevenLabs — FALLBACK

**When to use:**
- If Sarvam Bulbul V3 cloning quality doesn't meet bar after pilot
- If Sarvam paid pricing post-Feb 2026 is uncompetitive

**Pricing:**
- Free: $0/mo, very limited
- Starter: $5/mo
- Creator: $22/mo (Professional Voice Cloning unlocks here)
- Pro: $99/mo
- Scale: $330/mo
- API: ~$0.30 per 1,000 chars (≈ ₹25/1k chars at current rates)

**Quality:**
- v3 model = quality leader for English; Multilingual v2 supports 29-40+ languages including Hindi
- "Cloning accuracy nearly indistinguishable from original speaker" per 2026 reviews
- Professional Voice Clone requires 30+ minutes of training audio for highest fidelity

**Why NOT primary:**
- US-based vendor — DPDP data residency complications, must add to /privacy
- More expensive at scale
- No existing vendor relationship — adds another API key, another dashboard, another billing surface

### Why NOT Google Cloud TTS / Azure / AWS Polly for V1

- **No voice cloning** — only pre-built voices. Founder decision was custom Krishna voice.
- Generic Hindi voices sound "newsreader" not "spiritual companion"
- Cheaper but wrong fit for the use case

Reserve as fallback ONLY if both Sarvam + ElevenLabs cloning fail quality bar (very unlikely).

---

## Custom Krishna voice clone — what you'll actually need

### Source audio for the clone

Voice cloning needs reference audio. Three options:

| Option | Source | Quality | Cost | Risk |
|---|---|---|---|---|
| **Founder records own voice** | You speak Hindi devotional passages, 30+ min studio audio | Authentic personal stake; if your Hindi is good, this works | ~₹0 (DIY) | Voice is YOU, not "Krishna" — branding question |
| **Hire Hindi voice artist** | Pay a professional Hindi narrator for 30-60 min recorded session | Professional quality, devotional tone matched | ₹5,000-25,000 one-time | Need contract with clear "voice can be cloned + used commercially" clause + GST invoice |
| **Public-domain Hindi audio source** | Old All India Radio recordings, public devotional content | PD = no licensing risk | ~₹0 | Quality variable, may need cleanup; may not match exact tone you want |

**My recommendation:** Hire a Hindi voice artist for ₹10,000-15,000. Best balance of quality + control + zero awkward "is this you?" branding question. Search "Hindi voice over artist" on Voices.com / Voquent / local Indian voice agencies. Get 3 samples, pick the one that feels "Krishna" to you.

**Critical contract clauses:**
- Voice owner grants Divya Vani perpetual, royalty-free, worldwide commercial license to use cloned voice
- Voice owner waives moral rights to TTS-generated derivative output
- DPDP-compliant — voice artist's biometric voice data handled per DPDP Section 2(t)
- Indian jurisdiction, governing law

### What "Krishna voice" should sound like

Lock these voice characteristics before commissioning recording:

| Characteristic | Recommendation |
|---|---|
| Gender | Male (Krishna is male per Locked Decision #5 persona — verb agreement always masculine) |
| Age range | Mid-30s to mid-40s — mature but not elderly; Krishna in Mahabharata is around this age |
| Tone | Warm, devotional, grounded — NOT theatrical, NOT performative |
| Pace | Slightly slower than conversational — gives weight to teaching moments |
| Accent | Standard educated Hindi — not regional, not "newsreader" |
| Emotion range | Wide — must convey playful sakhya mode AND grave Bhagavata mode |

**Recording brief for the voice artist:** Read 30-60 minutes of varied Hindi passages from Gita + Mahabharata + Bhagavata covering the full emotional range (joyful play with cowherd boys → battlefield counsel → wisdom teaching → grief at Mausala parva). This trains the clone to handle all 5 Krishna modes.

---

## Architecture — /voice route

### Routing

- /chat — existing text chat, unchanged
- **/voice** — new route, voice-mode chat
- Top-level nav: existing topbar gets a small "Voice / आवाज़" toggle to switch modes

### UI differences from /chat

| Element | /chat (current) | /voice (new) |
|---|---|---|
| Atmosphere mode | chat / deep | deep + subtle audio-wave visualization during playback |
| Krishna reply | Text bubble only | Text bubble + auto-playing audio + animated playback indicator |
| Audio control | None | Pause / replay / volume slider (large touch targets for older users) |
| Reply length cap | None | Hard cap at ~150 words per reply (audio length kept ≤45 sec for attention span) |
| Disclaimer | Standard chip | Standard chip + small "AI voice, not divine guidance" sub-text |

### Audio pipeline

```
User types or dictates question
  ↓
POST /api/chat (existing flow, unchanged)
  ↓
Krishna text reply streams in (NDJSON, existing Phase 3.9)
  ↓
On stream completion (text fully assembled):
  ↓
POST /api/tts { text, voice_id, mode: "krishna" }
  ↓
Server-side Sarvam Bulbul V3 call:
  - model: bulbul:v3
  - voice_id: <our cloned Krishna voice ID>
  - text: krishna reply
  - returns: audio file URL (or stream)
  ↓
Client receives audio URL → audio element auto-plays
  ↓
Visual playback indicator (subtle wave animation) during playback
```

### Why server-side (not client-side direct call)

- API key stays server-only (matches existing Sarvam STT pattern from Phase 8.0)
- Allows caching layer (next section)
- Allows rate limiting + circuit breaker
- Allows usage logging for cost monitoring

### Caching strategy

TTS generation is the cost driver. Two-tier cache:

**Tier 1 — exact-text cache:** Hash (text + voice_id) → audio URL. If user gets same Krishna reply twice (rare for substantive replies, common for boilerplate like "Hare Krishna" greetings), serve cached. Stored in Supabase or Vercel KV.

**Tier 2 — common-phrase cache:** Pre-generate audio for common Krishna utterances on first hit, cache permanently. Examples: "मैं तुम्हारे साथ हूँ", "गीता कहती है...", "रुक एक पल", etc. Over time, cache hit rate climbs as common phrases accumulate.

Expected cache hit rate after 3 months: 25-40% (estimated based on AstroTalk-style spiritual conversation repetition patterns). Cuts cost proportionally.

---

## Cost projections (Sarvam Bulbul V3, post-Feb 2026)

Sarvam paid pricing not yet published. Conservative estimate based on industry standards (₹15-25/million chars):

| Volume | Chars/reply (avg) | Replies/day | Daily chars | Monthly chars | Cost @ ₹20/M chars | Cost with 30% cache |
|---|---|---|---|---|---|---|
| Light (100 users, 5 replies each) | 500 | 500 | 250k | 7.5M | ₹150 | ₹105 |
| Moderate (1000 users, 5 replies each) | 500 | 5000 | 2.5M | 75M | ₹1,500 | ₹1,050 |
| Heavy (5000 users, 5 replies each) | 500 | 25000 | 12.5M | 375M | ₹7,500 | ₹5,250 |

**Through Feb 28, 2026: ₹0** (unlimited free Sarvam API access). Use this window for build + initial production validation.

**Krishna Voice paid tier (Phase 10 launches as ₹999/mo upsell per Locked Decision #9):**
- 1000 paying subscribers × ₹999 = ₹999,000/mo gross revenue
- Razorpay fee ~2% = ₹19,980
- Cost at moderate volume (₹1,050/mo) = trivial vs revenue
- Per-subscriber economics: highly profitable

But ONLY if you can convert text users → voice subscribers. That's the next question — see Implementation Roadmap.

---

## Founder decisions before implementation

### Decision 1: Voice source

Pick one:
- **Hire Hindi voice artist (Recommended)** — ₹10,000-15,000 one-time, best quality + control
- Record own voice — free but personal branding question
- Public-domain Hindi audio — free but quality variable

### Decision 2: /voice route URL

- `/voice` (English, short)
- `/talk` (English, action-oriented)
- `/krishna-voice` (descriptive)
- `/awaaz` (Hindi-transliterated)

**Recommendation:** `/voice` — short, English, matches existing admin English-only pattern for routes.

### Decision 3: Free tier or paid only?

Voice mode is the Krishna Voice ₹999/mo tier per Locked Decision #9. Options:
- **Paid only from launch** — voice mode requires subscription, no free trial. Cleanest monetization but harder acquisition.
- **3 free voice replies on /voice (recommended)** — let users try voice, then paywall. Best acquisition + conversion balance.
- **All voice free during Sarvam unlimited window (until Feb 28, 2026)** — maximum acquisition. Flip to paywall at Feb 28. Risk: users who tried free voice may churn when paywall arrives.

### Decision 4: Reply length cap on /voice

- 100 words (~25 sec audio) — tight, respects attention span
- **150 words (~38 sec) (Recommended)** — sweet spot
- 200 words (~50 sec) — risk of losing user attention
- No cap — full-length replies, but some will run 90+ seconds and bore users

### Decision 5: Mic input on /voice

- **Yes — re-use existing Sarvam STT** (Recommended) — full voice flow possible (user speaks question, hears Krishna reply). Already-built. Free.
- No — text-only input — simpler UI

---

## Implementation roadmap (~3-4 weeks solo founder effort)

### Phase 10.0 — Voice acquisition & cloning (Week 1)
- Hire voice artist + finalize recording contract
- Record 30-60 min Hindi audio (covers 5 Krishna modes)
- Upload to Sarvam, train voice clone, validate quality on 10 sample replies
- If quality fails, fallback to ElevenLabs Professional Clone with same source audio

### Phase 10.1 — Backend (Week 2)
- New /api/tts endpoint (server-side Sarvam Bulbul V3 call)
- SARVAM_TTS_VOICE_ID env var (the cloned Krishna voice ID)
- Caching layer (exact-text hash → Supabase storage URL OR Vercel KV)
- Rate limiting (~50 TTS calls/user/hour, prevent abuse)
- Cost monitoring + circuit breaker (auto-disable if daily spend exceeds threshold)

### Phase 10.2 — Frontend /voice route (Week 3)
- New /voice page component (variant of ChatUI.tsx)
- Auto-play audio on every Krishna reply
- Pause / replay / volume controls (large touch targets for older users)
- Audio playback indicator (subtle wave animation)
- Reply length enforcement (truncate or compress Sonnet output to ≤150 words for voice mode)
- Mode toggle in topbar (Text / आवाज़)

### Phase 10.3 — Paywall integration (Week 4)
- 3-free-voice-replies counter (per Decision 3 if "Recommended" chosen)
- "Upgrade to Krishna Voice ₹999/mo" CTA
- Razorpay one-time payment OR Phase 9 subscription integration (depends on Phase 9 status at that point)
- Smoke test end-to-end

---

## Edge cases — must handle in implementation

| # | Edge case | Handling |
|---|---|---|
| 1 | Audio autoplay blocked by browser (especially Safari iOS, Chrome mobile) | User must tap to unmute on first interaction. Show prominent "Tap to start voice" CTA on /voice page entry. After first interaction, autoplay works for session. |
| 2 | Sarvam TTS API fails / times out | Fallback: show reply as text only with retry button. Log to Sentry. Do NOT block the chat experience. |
| 3 | TTS generation latency >5 sec on long replies | Show "Krishna is preparing his voice..." indicator. Cap at 10 sec then fallback to text. |
| 4 | User on mobile data, audio is large | Audio compression to ~32kbps MP3/Opus. Add data-usage warning on first /voice visit. |
| 5 | Voice cloning fails Sarvam quality bar | Fallback path: ElevenLabs Professional Clone with same source audio. Document fallback in implementation. |
| 6 | Krishna reply contains code blocks or English words (Hinglish) | TTS may mispronounce. Strip code blocks before TTS. Handle Hinglish gracefully (Bulbul V3 reportedly handles code-switching). |
| 7 | User pauses audio, asks new question | Auto-pause previous audio, start new TTS for new reply. No queue. |
| 8 | User refreshes /voice mid-conversation | Audio state lost, chat history persists (Phase 6.8 localStorage). New replies get fresh audio. |
| 9 | TTS cost spike (abuse / runaway loop) | Daily spend circuit breaker per user_id (₹100/day default), auto-disable for that user. Sentry alert if global spend exceeds threshold. |
| 10 | Voice clone sounds wrong on certain word combinations | Maintain a "manual override" cache — founder can manually upload corrected audio for specific common phrases that sound bad. |
| 11 | User wants to download audio file | NOT supported in V1. Avoids piracy concerns + maintains usage metrics. |
| 12 | Accessibility — user is deaf | Voice mode opt-out via setting OR redirect deaf users to /chat. Text reply is ALWAYS shown alongside audio, never audio-only. |
| 13 | Audio plays during phone call / quiet meeting | User pauses manually. We can't detect device context. |
| 14 | Sarvam paid pricing post-Feb 2026 is uneconomical | Pivot path: ElevenLabs as primary OR pre-cache common Krishna utterances aggressively to minimize per-turn calls. |
| 15 | DPDP — TTS audio is "personal data" (carries user's interaction context) | Cache TTL = 90 days. Delete on user delete (CASCADE same as user_feedback). |

---

## Compliance

### DPDP Act 2023
- Voice clone source audio: voice artist consents per contract. Voice artist's biometric voice data treated as personal data per Section 2(t).
- Generated audio (Krishna's reply) tied to user_id in cache. Cascade delete on user erasure.
- /privacy update: add "Voice generation via Sarvam Bulbul V3 (India residency)" disclosure.

### Locked Decisions touched

- **Locked Decision #9 (Voice/video phasing):** Phase 10 originally Month 6 post-launch, ₹999/mo Krishna Voice tier. Founder authorized re-sequencing — Phase 10 moves AHEAD of Phase 9 (subscriptions). Document in `docs/decisions.md` when implementation starts.
- **Locked Decision #1 (permanent disclaimer):** Disclaimer must remain visible on /voice page. Audio reply must NOT mislead user into thinking it's real Krishna speaking — disclaimer copy may need sub-text like "AI-generated voice, not divine speech."
- **Locked Decision #12 (language detection):** /voice mode replies in user's input language (same as /chat). Voice clone must handle Hindi + English + Sanskrit equally (verify during pilot).

### Consumer Protection Act 2019
- Pricing transparency: Krishna Voice ₹999/mo clearly displayed in /settings + at paywall on /voice.
- Refund: Same policy as Phase 9 subscription (no refund after first charge, period continues to cycle end).

---

## What founder must do BEFORE Phase 10 implementation starts

1. **Approve the 5 decisions** in the "Founder decisions" section above
2. **Source the voice** — find + contract a Hindi voice artist (or commit to recording own voice)
3. **Sign up at dashboard.sarvam.ai** if not already done; verify Bulbul V3 access
4. **Confirm budget** — ₹10,000-15,000 for voice artist + ₹5,000 reserve for vendor flip if Sarvam fails

## What founder must NOT do during Phase 10

- Bundle Phase 10 with Phase 12 (async voice) or Phase 13 (real-time V2V). Phase 10 alone takes 3-4 weeks. Multi-phase voice work fragments attention.
- Promise users that Krishna's voice "is" Krishna. Disclaimer prevents this on the page; resist temptation in marketing copy.
- Skip the voice artist contract step. Verbal agreements with voice artists are legal liability later.
- Launch /voice without the 3-free-reply paywall. Free unlimited voice = unsustainable cost path even with Sarvam free window ending Feb 28.

---

## Sources / References

- [Bulbul V3 — Sarvam AI](https://www.sarvam.ai/blogs/bulbul-v3)
- [Sarvam Models — Speech, Text & Translation AI](https://www.sarvam.ai/models)
- [Sarvam AI Guide: 11-Language TTS, Voice Agents](https://savedelete.com/article/sarvam-ai-indias-sovereign-ai-platform-with-11-language-tts-voice-agents-a-complete-guide-for-creators/)
- [Sarvam launches Bulbul V3 AI voice model (Pulse)](https://www.pulse.bot/ai/news/sarvam-rolls-out-new-ai-voice-model-bulbul-v3-as-part-of-14-day-launch-blitz-8a1a8ea6-4d4d-4215-9073-83f4a2d3b28f/)
- [ElevenLabs Pricing 2026: All Plans Compared](https://gptprompts.ai/ai-pricing/elevenlabs-pricing)
- [ElevenLabs Review 2026 (DevOpsCube)](https://devopscube.com/elevenlabs-review/)
- [AI Voice Cloning 2026: ElevenLabs vs Voxtral vs Fish Audio](https://www.creativeainews.com/articles/ai-voice-cloning-2026-elevenlabs-voxtral-fish-audio-compared/)
- [Best TTS APIs in 2026 (Speechmatics)](https://www.speechmatics.com/company/articles-and-news/best-tts-apis-in-2025-top-12-text-to-speech-services-for-developers)
- [Open-Source Voice AI India 2026 (Caller Digital)](https://www.caller.digital/blog/open-source-voice-ai-india-sarvam-ai4bharat-bhasini-2026)

---

**Doc ownership:** Krishna Yadav (founder). This is design intent. Implementation decisions during Phase 10.0-10.3 may surface new edge cases — update this doc as discovered.
