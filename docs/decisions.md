# Krishna AI — Locked Product Decisions

This is the canonical list of locked product decisions. When in doubt about
"did we decide X or Y?", check here first. Do not relitigate items in this
file unless explicitly reopening one.

Last updated: 2026-05-01

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
Hindi-first, English supported equally, Sanskrit accepted. Krishna replies in whichever language the user wrote in: Hindi → Hindi, English → English. Sanskrit input is met with quoted Gita/Mahabharata scripture + a brief Hindi explanation — Krishna does NOT generate original Sanskrit prose. Verse cards always show Sanskrit + transliteration + Hindi + English regardless of reply language. Sanskrit input is expected to be rare in practice; the code path stays open but optimization effort goes to Hindi/English.

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
| 2026-04-29 | Narrowed Sanskrit-input rule (decision #12) from "reply in Sanskrit" to "quote scripture + Hindi explanation" | LLM-generated Sanskrit prose violates sandhi, case inflections, and meter conventions in ways noticeable to Sanskrit-trained users. Quoting existing PD scripture is safe; generating new Sanskrit is not. Section 3 VOICE updated in `src/lib/systemPrompt.ts`; decision #12 in this file updated; `CLAUDE.md` line 53 updated in parallel. |
| 2026-04-29 | Phase 1.5 Sanskrit source: BORI Critical Edition primary (Option A); accept ~5–10% chunks with empty `sanskrit` field on devotional accretions BORI cuts | Northern Vulgate Sanskrit not available as machine-readable PD (verified via live URL probes 2026-04-28: sacred-texts.com Cloudflare-blocked; sanskritdocuments.org hosts BORI + Kumbakonam Southern, NOT Northern Vulgate). BORI is the cleanest digital source — Tokunaga-typed text via `sanskritdocuments.org/mirrors/mahabharata/txt/mbhNN.itx`. English (Ganguli via Wikisource) + regenerated Hindi carry meaning; Sanskrit is verse-card display feature, not retrieval-critical. Option B (mixed recensions) and C (OCR Bombay/Calcutta scans) deferred — revisit C in Phase 9+ if user feedback demands. |
| 2026-04-29 | Phase 1.5 corpus expansion: added Sabha 60–68 (vastra haran), restricted Stri Parva to 24–25 only, included Mausala 1–9 (override roadmap "skip Mausala"), added Adi 218–225 + Sauptika 13–18 + Anugita (Ashvamedhika 16–50) + Drona 32–46 + Drona 190–194 + Karna 80–84 + Shalya 55–65 | Two-round audit. Round 1: vastra haran is the most significant Krishna-grace scene (Gita 9.22 manifestation); omission would create a glaring gap for Hindi devotee users. Stri outside 24–25 is grief content without active Krishna involvement. Mausala covers equanimity-in-dying (rare in scriptural counseling material). Round 2: Abhimanyu (mourning young loss), Yudhishthira's lie (moral-complexity calculus), Bhima–Dushasana (vow-fulfillment dharma), Duryodhana's mace fight (means-vs-ends). Sauptika 1–12 SKIPPED — massacre prose, Krishna not present. Final 23-range list; estimated ~3,000–3,500 chunks; Hindi regen budget ~₹550–650. |
| 2026-04-30 | Phase 1.5 Mahabharata corpus ingested: 1,704 chunks across 13 parvas + 23 ranges | Roy/Ganguli English from archive.org PD plain-text (12 vols), regenerated Hindi via Sonnet 4.6 + v3 prompt + prose addendum, Sanskrit BORI deferred to Phase 9+ audit. Total spend ~₹2,719 (₹2,714 Sonnet regen + ₹4.93 Gemini embedding + ₹0 em-dash cleanup). Actual chunk count came in below the ~3,000–3,500 estimate because the parser was tighter than predicted; Hindi regen overran the ₹550–650 estimate ~4× because chunks averaged 230 words (not the assumed ~50–80) — re-baseline cost models for Phase 1.6/1.7 from this. Quality gate: 19/20 spot-check PASS + 1 FLAG (minor punctuation), 5/5 retrieval-coverage. |
| 2026-04-30 | `mb_udyoga_92` upstream parser anomaly: section sub-chunked into `_1a/_1b/_2a/_2b/_3a/_3b/_4`, with no unsuffixed `_1` ever produced | Parser re-detected an emerging section header mid-section and reset chunkN. Identical anomaly observed in `mb_drona_40` (where `_1`, `_1a`, `_1b` all coexist) and `mb_bhishma_108`. Surfaced when Phase 1.5 verification SQL targeted `mb_udyoga_92_1` and got no row. Future spot-check spec lists should reference actual chunk patterns from the cleaned JSON, not assume an unsuffixed `_1` exists for every section. |
| 2026-05-01 | Phase 1.6 Bhagavata source locked + addendum v1.1 locked | J. M. Sanyal *Srimad-Bhagavatam* (Calcutta 1929–34, PD). Primary: Sarayu/UP-Museum CC0 archive.org scans `eszb_…` (Vol 4) + `qpbw_…` (Vol 5). Fallback: DLI `in.ernet.dli.2015.461237`. Avoid Munshiram Manoharlal reprint `qblt_…`. License-backup translator: Manmatha Nath Dutt *Shrimad Bhagwatam* 1896, `in.ernet.dli.2015.272582`. djvu_txt URL pattern matches Phase 1.5 (`archive.org/stream/<id>/<id>_djvu.txt`). Bhagavata addendum v1.1 locked for the regenerator SYSTEM_PROMPT (Sanskrit-absent caveat + lyrical/devotional voice rule + glossary lock with गोप uniform, names including सुदामा, no राधा pending Phase 9+); full text in project memory and slated for `scripts/regenerate-hindi-bhagavata.ts` line 80 once built. Pressure-test 2026-05-01: 6/6 registers passed (Bal-vatsalya, mādhurya/strength, mādhurya/longing, viraha, householder, philosophical Veda-stuti) at ₹8.22 spend; report at `test-results/phase1.6-pressure-test-2026-05-01.md`. Vol 3 (`ikxh_…`) found but covers Books 7–9 (Prahlāda, Vāmana, dynasties), NOT Canto 10 — Canto 10 ch 1–22 lives in Vol 4 itself (verified Vol 4 Ch IX = Canto 10 Ch 9 Yashoda-mortar). Vol 4 + Vol 5 alone cover all of Canto 10; no additional volume needed for Phase 1.6 ingest. Two production-pipeline tunings flagged for Phase 1.6a regenerator: MAX_TOKENS to 1500–1800 (Bhagavata Hindi expansion 25–35%; 800 truncated 2/6 test passages) and post-run spot-check on सुदामा name spelling. Open caveat: Sanyal's death year 1937 not independently confirmed in 15-min validation; Indian PD holds via pre-1955 publication-date rule regardless. |
| 2026-05-01 | Phase 1.6 corrections: source-gap concern resolved + reference scheme locked | Source-gap concern resolved: Sanyal Vol 4 covers Canto 10 chs 1–61 starting at Ch 1 = "Destruction of Devakī's Six Sons by Kansa"; the earlier "Vol 4 = chs 23–61" figure (in the Phase 1.6 implementation kickoff prompt) was incorrect. Vol 4 + Vol 5 alone cover all of Canto 10; no additional volume needed. Reference scheme locked: Option A (verse-range start) per Sanyal's sparse parenthetical structure. Anchored form `bhagavata_10.<ch>.<verseStart>` (dot separator) when Sanyal's "(N—M)" parenthetical is present; fallback form `bhagavata_10.<ch>_<fallbackChunkN>` (underscore separator flags fallback at a glance) when parenthetical absent or OCR-garbled. Per-verse references like `bhagavata_10.29.21` (kickoff assumption) not feasible from literary-prose translation. Schema mapping: chapter int = chapter-within-canto, verse_number int = verseStart (anchored) or fallbackChunkN (fallback). Canto info in reference text only; no schema change. |