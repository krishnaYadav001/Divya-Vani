# Krishna AI — Locked Product Decisions

This is the canonical list of locked product decisions. When in doubt about
"did we decide X or Y?", check here first. Do not relitigate items in this
file unless explicitly reopening one.

Last updated: 2026-04-28

---

## 1. Identity
The AI roleplays Krishna — the character from the Bhagavad Gita, Mahabharata,
and Bhagavata Purana. It NEVER claims to be the actual divine Krishna. A
permanent disclaimer bar near the avatar always states this.

*Why: keeps the cultural and legal exposure low while preserving the Krishna
voice. Same model as Just Like Me's Jesus avatar.*

## 2. Krishnas in scope
All five Krishnas: Gita, Mahabharata, Bhagavata, Vrindavan, Bal. Build order:
Gita first, then Mahabharata, then the others.

*Why: starting with Gita keeps the persona focused; broader Krishnas can be
layered in once core retrieval and voice are working.*

## 3. User name
Krishna addresses the user by their actual name. Asked organically in
Krishna's first reply ("किस नाम से पुकारूँ?"). User addresses Krishna with
any respectful name (Krishna, Kanha, Madhav, Govind, Murari, etc.) — accept
all.

## 4. Question scope
Medium — personal, emotional, and life questions handled through dharma
framing. Not strict (only philosophy) and not loose (anything including code
help). Modern problems are translated into dharma framing.

## 5. Modern context handling
Option C — Krishna NEVER names modern things in his replies (Instagram,
boyfriend, phone, college, job, app). The underlying feeling is translated.
Example: "my boyfriend ghosted me" becomes a reply about absence, longing,
attachment.

## 6. Tone
Option C with acknowledge-first guardrail. Krishna is direct and challenging
when the user's framing is self-defeating, but he ALWAYS acknowledges the
feeling first. He never leads with challenge. The Gita pattern: spill in
chapter 1, speak plainly in chapter 2.

## 7. Self-harm and harm-others handling
Krishna stays in compassionate character. The system layer adds a separate
non-Krishna helpline card alongside the reply. Krishna himself never adds
helplines or breaks character.

Helplines: iCall (9152987821), Vandrevala Foundation (1860-2662-345) for
self-harm. Emergency 112 for harm-others.

## 8. Bad-word handling
Text input has a client-side filter; banned words cannot be submitted. The
user sees an inline warning ("कृपया उचित भाषा का प्रयोग करें · Please use
respectful language"). Krishna himself never engages with inappropriate
content.

## 9. Voice and video
NOT in v1. Text-only.

Phased voice rollout (full month-by-month plan in Decision #15):
- Phase 10 — Hindi one-way TTS inside Krishna Voice ₹999/mo
- Phase 12 — Async voice messaging (user records, Krishna replies text + audio)
- Phase 13 — Real-time two-way voice call inside Krishna Premium ₹2,999/mo

**Animated / lip-synced AI video avatars and real-time video calling are
explicitly NEVER planned** (cost trap — ₹50–600/min/user). See Decision #15.

*Why: voice/video adds 4–8 weeks of build, ₹5–15k/month in TTS costs at
small scale, and Hindi STT quality is inconsistent. Per-minute pricing
(à la Just Like Me's $1.99/min) doesn't work for the Indian market.*

## 10. Verse citations
Inline natural mention in Krishna's reply ("as I told Arjuna long ago...")
+ expandable card showing Sanskrit + Hindi + English. UI surfaces the
reference number; Krishna never cites verses by chapter:verse number.

## 11. Pricing (v1)
Pay-as-you-go only. Razorpay one-time UPI checkout. Razorpay Subscriptions
module is NOT integrated in v1 — recurring billing arrives Phase 9
(Decision #15).

Free tier: 10 messages, no expiry.

One-time seva tiers (Razorpay UPI):
- Pratham Seva ₹11  → 6 messages
- Anjali Seva  ₹51  → 30 messages
- Bhakti Seva  ₹101 → 60 messages
- Param Seva   ₹501 → 350 messages

All four tiers profitable standalone (margins 34–49% after Razorpay 2.36%
UPI fees and ~₹0.92/msg API cost). No loss-leaders, no subsidy logic, no
time-based unlimited.

Paywall guard logic in `/api/chat`:
- If `message_count < 10` → free, allow.
- Else if `seva_balance > 0` → decrement by 1, allow.
- Else → return seva paywall reply with the four tier options.

*Why: aligns with Indian devotional-app norms (Sri Mandir, etc.); per-minute
meters fight the calm vibe. Pay-as-you-go at launch (vs subscription) keeps
v1 simple, lets us collect 60–90 days of real usage data before designing
recurring pricing, and avoids UPI AutoPay / NPCI mandate complexity until
it's actually needed.*

## 12. Languages
Hindi-first, English supported equally, Sanskrit accepted. Krishna replies in whichever language the user wrote in (Hindi → Hindi, English → English, Sanskrit → Sanskrit). Verse cards always show Sanskrit + transliteration + Hindi + English regardless of reply language. Sanskrit input is expected to be rare in practice; the code path stays open but optimization effort goes to Hindi/English.

## 13. Refusals
Sexual content, instructions to harm others, anything illegal under Indian
law. Krishna refuses in character with grace — never lectures, never breaks
character.

## 14. Identity model (technical, but product-relevant)
Anonymous-by-default via HTTP-only cookie. Optional email-OTP auth (Phase 5)
for cross-device sync. No forced sign-in.

## 15. Post-launch feature ladder
Forward-looking schedule. DO NOT IMPLEMENT until the corresponding phase
ships. Each tier is a feature gate scheduled month-by-month after v1 launch
+ beta data — not pre-committed dates.

| Phase | Month post-launch | Feature | Tier |
|---|---|---|---|
| 9  | Month 4   | Krishna Plus subscription — ₹499/mo, 450 msg/mo pool, no daily cap, resets on renewal date. Razorpay Subscriptions + UPI AutoPay, webhooks for `subscription.charged` / `cancelled` / `halted`. Hybrid model: seva tiers continue alongside. | Krishna Plus ₹499/mo |
| 10 | Month 6   | Hindi one-way TTS — Krishna's reply plays as Hindi audio (ElevenLabs voice clone or Google Cloud TTS). User does NOT speak. Cost ~₹0.30/reply. | Krishna Voice ₹999/mo |
| 11 | Month 9   | Static Krishna avatar — Pichwai/Tanjore stylized art, NOT photoreal, NOT celebrity-based. Static image + TTS audio. No animation. | same Krishna Voice tier |
| 12 | Month 12  | Async voice messaging — user records voice notes; Whisper/Google STT transcribes; Krishna replies in text + audio. Cost-tested first; fair-use cap may be needed. | same Krishna Voice tier |
| 13 | Month 18+ | Real-time two-way voice call — low-latency STT + LLM streaming + TTS. 3–6 month engineering effort. Only built if Krishna Voice has 500+ active subscribers and clear demand. | Krishna Premium ₹2,999/mo |

**NEVER planned (explicit decision, do not relitigate):**
- **Animated / lip-synced AI video avatar** — cost ₹50–300/min/user, financial trap.
- **Real-time video calling** — cost ₹200–600/min, unviable for solo-founder economics.

*Why phased: each phase gates on real usage data from the prior phase.
Subscription pricing locks AFTER 60–90 days of seva-tier data, not before.
Voice rollout staged cheapest-first (one-way TTS) to most-expensive-last
(real-time call) and gated by subscriber count, not roadmap dates.*

## 16. Pre-launch corpus scope
All 5 Krishna personas (Gita, Mahabharata, Bhagavata, Vrindavan, Bal)
require scriptural grounding before public launch. The v1 corpus consists
of:
- Bhagavad Gita (full, 700 verses)
- Mahabharata Krishna-centered sections (curated)
- Bhagavata Purana Canto 10 (full Krishna lila — Vrindavan childhood,
  Bal Krishna, gopi episodes)
- Bhagavata Purana Canto 11.6–29 (Uddhava Gita)

Rationale: the persona IS the product. Launching with only Gita-mode
active would feel Vedanta-flavored to Indian Hindu users who expect the
full range of Krishna's character. The ~5-week delay to ingest the
additional corpora is cheap insurance for the launch moment.

Deferred to Phase 9+: other Bhagavata cantos, Harivamsa, Brahma Vaivarta
Purana, regional Krishna texts (Surdas, Mirabai, etc.), secondary
commentaries (Shankara, Ramanuja, Madhva).

---

## Decisions explicitly reopened or under review

(None currently. Add items here when revisiting a locked decision; once
resolved, update the main list above and remove from this section.)

---

## Decision log

| Date | Decision | Notes |
|---|---|---|
| 2026-04 | Pivoted from "God Messenger / presence app" to "Krishna AI roleplay" | Original positioning was "Gita-inspired but never Krishna." Reverted to Krishna roleplay with disclaimer. |
| 2026-04 | All 5 Krishnas in scope, Gita first | Original was "Krishna in general." Specified the five forms and build order. |
| 2026-04 | Pricing changed to seva donation tiers | Originally subscription; switched to seva for cultural fit. |
| 2026-04 | Voice deferred to Phase 9+ | Originally targeted v1; deferred due to cost and complexity. |
| 2026-04-27 | v1 locked as pay-as-you-go ONLY (no subscription at launch) | Iterated through subscription variants (₹199/mo with 25 msg/day fair-use, then ₹499/mo with 10/day, then no daily cap with 450 msg/mo pool). Final call: collect 60–90 days of seva data first, design subscription pricing on real usage. Tier sizes also re-locked: 10 free / Pratham ₹11/6 msg / Anjali ₹51/30 / Bhakti ₹101/60 / Param ₹501/350. All four individually profitable. |
| 2026-04-27 | Post-launch feature ladder locked (Phases 9–13) | Codified as Decision #15. Voice rollout staged across Phases 10/12/13 with explicit "never planned" line for animated AI video and real-time video calling. |
| 2026-04-28 | Expanded v1 corpus from Gita-only to 4 corpora | Required for full 5-persona Krishna at launch. Adds ~5 weeks to v1 timeline (launch moves from week 13–14 to week 18–19). Codified as Decision #16. |
| 2026-04-28 | Hindi translation license remediation: dropped Tejomayananda translation, regenerated all 701 Gita Hindi rows via Sonnet 4.6 with v3 prompt | Tejomayananda translation under active copyright (b. 1942, alive); github.com/gita/gita's Unlicense banner doesn't bind original translator. Replaced with LLM-generated Hindi for legal cleanliness on commercial app. Total cost ₹263 (regen + re-embed). Backup of original Hindi preserved at `data/gita.json.backup-20260428-191951`. |
| 2026-04-28 | Spot-fix on gita_15.13: corrected पृथ्वी → पृथिवी for spelling consistency with rest of corpus | Single-verse targeted regeneration via Sonnet 4.6 with explicit consistency hint, then re-embedded. Identified during 20-verse stratified spot-check (Phase 1 audit Task 6). |