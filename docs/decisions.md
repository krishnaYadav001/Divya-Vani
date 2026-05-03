# Krishna AI — Locked Product Decisions

This is the canonical list of locked product decisions. When in doubt about
"did we decide X or Y?", check here first. Do not relitigate items in this
file unless explicitly reopening one.

Last updated: 2026-05-03 (Phase 2.6 — chat-route prompt-cache fix — COMPLETE)

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

## 17. Phase 2 theme taxonomy (locked 2026-05-02)

Fixed controlled vocabulary used to tag every chunk in the `verses` table
(701 Gita + 1,704 Mahabharata + 727 Bhagavata = 3,132 rows). Tags drive
Phase 2 retrieval reranking (theme-overlap score, weight 0.3 vs cosine
0.7 by default) and Phase 3+ persona framing (caution-tag-aware reply
shaping). Each chunk gets 3–7 tags; classifier rejects outside that band.

This taxonomy is **closed** — adding a tag requires reopening this
decision and re-tagging the full corpus (cost ~₹150–400). No
single-instance tags, no ad-hoc additions during classification.

### Group A — Emotional / state (15 tags)

`loneliness`, `anger`, `fear`, `grief`, `jealousy`, `doubt`, `despair`,
`attachment`, `longing`, `joy`, `gratitude`, `surrender`, `devotion`,
`forgiveness`, `equanimity`.

The user's surface query usually maps to one of these (e.g. "I'm angry
at someone close" → `anger`, `attachment`). Phase 2 query-classification
also returns tags from this group.

### Group B — Relational / dharmic (15 tags)

`duty`, `betrayal`, `family-conflict`, `friendship`, `marriage`,
`parent-child`, `teacher-student`, `ruler-subject`, `action`, `inaction`,
`decision`, `sacrifice`, `renunciation`, `householder`, `ascetic`.

Captures the *situation* and *role* a chunk speaks to. Mahabharata-heavy
content tends to land here (kingship, war, family lines). Bhagavata
Uddhava-Gita weight on `ascetic` / `renunciation` / `householder` —
critical for getting Phase 1.7 corpus to surface on renunciation queries.

### Group C — Caution tags (4)

Apply ONLY when the passage genuinely warrants the caveat. These flag
chunks Phase 3+ persona framing must handle carefully.

- `caution_devotional_intimacy` — rāsa-līlā, vastra-haraṇa, Krishna's
  multiple wives. Devotionally legitimate but easily misread by a casual
  modern reader.
- `caution_violence` — Kaṁsa-vadha, Aristhāsura, demon-slayings. Krishna
  acts as warrior; persona must contextualize, not glorify.
- `caution_complex_dharma` — Krishna's strategic actions, Yudhishthira's
  half-truth, Bhima's vow against Dushasana. Cases where literal-rule
  ethics fail and the text models a higher-order calculus.
- `caution_renunciation_extreme` — passages mis-readable as endorsing
  self-harm or extreme withdrawal. Critical safety-adjacent: Krishna
  reading distress in a user's words while a `caution_renunciation_extreme`
  chunk is in the retrieval pool requires softer Bhagavata-mode framing.

(Four tags lock for Phase 2; reopen this decision if Phase 3+ persona
work surfaces a fifth caution category that meaningfully changes reply
shape.)

### How this taxonomy is applied

- **Tagging script** (Step 2.2): every chunk classified once via the
  Step-2.1b model winner; results written to `verses.themes text[]`
  column. Resume-safe; sample-validated against tag-distribution
  sanity-check (no single tag >30%, no tag <0.5%).
- **Retrieval rerank** (Step 2.3 Layer 1): query-time Haiku call returns
  query themes from this same taxonomy; theme-overlap score added to
  cosine similarity at weight 0.3.
- **Persona framing** (Phase 3, deferred): caution tags surfaced in
  retrieved chunks should bias Krishna's reply shape (e.g. soften framing
  when `caution_violence` chunk retrieved). Persona prompt iteration
  itself is out-of-scope for Phase 2.

*Why locked-vocabulary instead of free-form: free-form tags drift across
runs (same chunk gets "anger" once and "rage" the next), defeat overlap
scoring, and require post-hoc clustering. A 35-tag closed set is small
enough to memorize, large enough to discriminate Bhagavata didactic
content from Gita epigrams from Mahabharata narrative passages.*

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
| 2026-05-01 | Phase 1.6 Bhagavata Canto 10 corpus ingested: 568 chunks across 90 chapters | Sanyal English from archive.org CC0 plain-text (Vol 4 + Vol 5 Sarayu/UP-Museum scans), regenerated Hindi via Sonnet 4.6 + v3 prompt + Bhagavata addendum v1.1 (canonical text now at `scripts/regenerate-hindi-bhagavata.ts:80`), Sanskrit deferred to Phase 9+ audit (mirrors Phase 1.5). All Bhagavata rows have `sanskrit = ''` and `sanskrit_source = NULL`. Reference scheme: 69.2% anchored `bhagavata_10.<ch>.<verseStart>` + 30.8% fallback `bhagavata_10.<ch>_<chunkN>` — structural ceiling for this Sanyal corpus per fallback-chunk audit (intro/dialogue/commentary paragraphs without verse-range parentheticals). Total spend: ~₹907 (Sonnet 4.6 regen ₹897.53 + Gemini embedding ₹1.10 + pressure-test ₹8.22) — 40–98% under per-stage estimates. Quality gate: 20/20 spot-check PASS (independently verified) + 3/5 retrieval coverage (queries 3 + 4 deferred to Phase 2 corpus-balance retuning, same precedent as Phase 1.5 anger-query carry-forward — Bhagavata corpus IS embedded and retrievable; the 2 failing queries return semantically valid Gita matches that score higher cosine similarity than Bhagavata equivalents). Em-dash post-process: `fix-em-dash-endings-bhagavata.ts` merged 63 sentence-bisected pairs (1 unresolved deep chain, 2 oversize merges flagged), reducing 633 → 568 chunks. Carry-forward to Phase 1.7: (a) **0% cache hit rate** persisted across 633 calls — investigate `cache_control` placement / SDK version; SYSTEM_PROMPT measures ~1500 tokens (above Sonnet's 1024 minimum), so below-threshold theory ruled out. (b) Em-dash cleanup, OCR fix patterns (8→3 leading-digit gate, tilde separator, inline parenthetical fallback) — inherit verbatim. (c) Narrator-tag form variation (बोले / ने कहा) — monitor in Phase 1.7 spot-check; if persists, consider v1.2 glossary lock. (d) 1/633 ग्वाला accepted as contextual exception at `bhagavata_10.54.9` (villain-contempt register about Krishna) — threshold for Phase 1.7 same: ≤0.5% with per-instance documentation. |
| 2026-05-02 | Phase 2 theme taxonomy locked (Decision #17): 34 tags total — 15 emotional (Group A) + 15 relational/dharmic (Group B) + 4 caution (Group C) | Closed vocabulary; reopen requires re-tagging the 3,132-row corpus. Drives Phase 2 Layer-1 theme-overlap reranking (weight 0.3 vs cosine 0.7) and Phase 3+ caution-tag-aware persona framing. Step 2.0a regression baseline shows 5/5 Gita lock-in on three failing queries (Q1.6.2, Q1.7.1, Q1.7.2) — taxonomy chosen specifically to discriminate Bhagavata didactic / Uddhava-ascetic content from Gita epigrams on these surrender/renunciation themes. **Step 2.1b classification model: Sonnet 4.6** chosen over Haiku 4.5 because Haiku invented out-of-taxonomy tags (`faith`, `delusion`, `defeat`, `playfulness`) on ~17% of validation samples despite the explicit "Do NOT invent" prompt — Sonnet stayed in-taxonomy. Cost tradeoff accepted: ~₹1,187 Sonnet-only vs ~₹319 Haiku-alone, in exchange for guaranteed taxonomy fidelity for the full 3,132-row corpus. Validation report: `test-results/phase2-classification-validation-2026-05-02.md`. **30% prevalence threshold override:** distribution audit found 4 tags exceeding 30% of corpus — `action` 52.9%, `duty` 50.2%, `equanimity` 43.5%, `devotion` 35.5%. Override-with-judgment, not reclassify: the 30% sanity-check was designed to catch a degraded classifier defaulting everything to one tag, NOT to flag genuine high-prevalence themes. These 4 tags correctly identify central themes of all three texts (MBh is genuinely 70% about duty; Bhagavata is 75% about devotion). Distribution report: `test-results/phase2-tag-distribution-full-corpus-2026-05-02.md`. |
| 2026-05-02 | Phase 2 RAG retuning COMPLETE: L1 (theme rerank) + L2 (source diversity) shipped default-on; L3 (query rewrite) shipped behind `RAG_LAYER_QUERY_REWRITE=false` flag for Phase 7 beta toggle | Three rebalancing layers landed on `src/lib/verses.ts` + `src/app/api/chat/route.ts`. **L1 + L2** (final shipped config) added **+5 failing-query gain** vs baseline (Bhagavata + MBh chunks gained in top-5, summed across 6 prior-phase failing queries) and **3/6 passing regressions** (1 real — Q1.7.4 "I learn from everything around me", classifier returned `[gratitude]` only — flagged as Phase 3 follow-up; 2 borderline source-mix shifts with no quality loss in emotional terms). **L3 (query rewrite) net-negative** in ablation (added 1 failing improvement Q1.6.2 surrender via multi-query expansion at cosine 0.665, but introduced 2 additional regressions because emotional-core variants drift surface meaning — e.g., "Simple pleasures bring deep contentment" mapped Q1.6.3 from Bhagavata pastoral to Gita contentment teachings). L3 stays implemented + tested but ships disabled; founder Phase 7 beta can A/B re-enable without redeploy. **Step 2.4 query-classifier prompt-tuning (3-7 minimum + worked examples) backfired** — biased toward `devotion` (in 3 of 4 examples) which over-rerank toward Gita; reverted to original 1-7 prompt. **Per-source-count regression metric proved brittle**: Q1.7.3 ("daily devotion") tripped the criterion when 2 Gita dropped, but the user gained 2 Bhagavata chunks (5/5 Bhagavata vs baseline 3 Bhagavata + 2 Gita) — i.e., subjectively better retrieval flagged as regression. Documented as ablation lesson; future phases should pair the criterion with subjective-quality review. **Total Phase 2 spend: ~₹1,204** (₹1,187 corpus tagging + ₹14 classification validation + ₹3 baseline + ablation runs). Final config locked in `CLAUDE.md` "Phase 2 RAG retrieval config" + `.env.example`. Reports: `test-results/phase2-regression-{baseline,layer1,layer1-2,final-pre-fix,final}-2026-05-02.md`. Carry-forward to Phase 3: persona prompt should reference theme overlap when explaining why a verse was retrieved + caution-tag-aware reply framing (e.g., soften when `caution_violence` or `caution_renunciation_extreme` chunk retrieved). Carry-forward to Phase 9+: GIN index on `themes` column when in-memory rerank cost shows up in latency budget; re-tag with newer model when caution-tag taxonomy expands. |
| 2026-05-02 | Phase 1.7 Bhagavata Canto 11.6–29 Uddhava-Gita corpus ingested: 159 chunks across 24 chapters | **Sanyal Vol 5 archive.org CC0** (`qpbw_…` Sarayu/UP-Museum scan), Vol 5 alone covers Canto 11 in full — sliced via BOOK XI body marker (occurrence 2) → BOOK XII body marker (occurrence 2). **Sanyal Book XI = standard Canto 11 — 1:1 chapter alignment** verified at Sanyal Ch VI = std 11.6 boundary (Devas-at-Dwaraka opening). Per-chapter content audit deferred to Phase 9+ Sanskrit-attachment milestone, when the Sanskrit BORI / Devanagari source attachment will give per-verse alignment to settle any subtler offsets. Initial 30-vs-31 chapter gap concern was a TOC-misread on my part: both Sanyal Book XI and standard Canto 11 have 31 chapters. **Hindi regenerated via Sonnet 4.6 + v3 prompt + Bhagavata addendum v1.1 (locked, no v1.2 needed)** — 9d Sanskrit-philosophical-term preservation criterion held cleanly across the philosophical/avadhūta + theoretical guṇas chunks (116 target-term occurrences across 20 spot-check chunks ≈ 5.8/chunk, 0 dilutions), confirming v1.1's Canto-10-lyrical framing does not bleed inappropriate Vrindavan imagery into Uddhava-Gita didactic content. v1.1 stays the canonical Bhagavata addendum for Canto 10 + 11 + future cantos. Reference scheme inherits Phase 1.6: anchored `bhagavata_11.<ch>.<verseStart>` (82.1%) + fallback `bhagavata_11.<ch>_<chunkN>` (17.9%) — **higher anchor rate than Canto 10's 69.2%** because Sanyal Book XI is more methodically labeled with `(N—M)` parentheticals than Book X's longer narrative paragraphs. Em-dash post-process: 3 sentence-bisected pairs merged (all resolved cleanly to terminal punctuation, 0 deep chains, 0 oversize), reducing 162 → 159 chunks. Total spend: **~₹231.46** (Sonnet 4.6 dry-run ₹7.41 + full regen ₹231.18 already includes the dry-run line + Gemini embedding ₹0.28). Quality gate: **18/20 spot-check PASS + 3/5 retrieval** (≥17/20 + ≥3/5 thresholds met; the 2 spot-check FLAGs at `bhagavata_11.22.19` + `bhagavata_11.29_4` are the pre-existing 1.3% non-terminal class — English source itself truncates mid-clause at parser-induced chunk boundary, em-dash merger doesn't catch non-dash residual fragments; same mechanism as Phase 1.6 residual). Retrieval queries 3 (surrender) + 4 (renunciation) returned 5/5 Gita: same **structural Gita-compact-verse-cosine-bias** carry-forward from Phases 1.5 + 1.6 — defer to Phase 2 RAG retuning (theme tags, query rewriting, source-aware boost), not a corpus-quality issue. Carry-forward to Phase 9+: **0% cache hit rate confirmed at full scale** (162 calls; 1,317-token SYSTEM_PROMPT verified above 1,024 cache minimum via `messages.countTokens`; 3-call sequential probe reproduced 0 cache_creation + 0 cache_read; root cause unknown — candidates documented in `test-results/phase1.7-cache-investigation.md` are model-specific eligibility, beta-header drift, API-tier gating, ephemeral-TTL default change). Reopen alongside Sanskrit-attachment milestone when prompt size + cache savings are bigger. Schema unchanged (no migration). |
| 2026-05-03 | Phase 2.6 COMPLETE: chat-route prompt-cache fix landed — root cause of Phase 1.6/1.7/2 anomaly resolved | **Root cause (settles the carry-forward from Phase 1.6/1.7):** Sonnet 4.6 raised the minimum cacheable prompt from 1,024 tokens (Sonnet 4.5/4) to **2,048 tokens** — model-specific change in the Anthropic docs that the Phase 1.7 15-minute investigation didn't have. Prior regen `SYSTEM_PROMPT` at 1,317 tokens fell silently below the new threshold; per docs, "length-based caching failures are silent: the request succeeds but both `cache_creation_input_tokens` and `cache_read_input_tokens` will be 0." Exactly matches the symptom. Not an SDK bug, payload structure issue, beta header missing, or API tier gating. **Chat-route fix (the meaningful win):** `src/app/api/chat/route.ts` previously passed `system` as a plain string with no `cache_control`. Phase 2.6 restructures into 2 system blocks — block 0 = persona (`SYSTEM_PROMPT`, stable across turns) with `cache_control: { type: "ephemeral" }`; block 1 = dynamic (USER CONTEXT + RELEVANT SCRIPTURE) with no cache directive. The dynamic content mutates every turn (memory accumulates, retrieval differs per query — verified by 5-turn measurement showing system-block size oscillating 8K→13K), so caching the combined block writes a 1.25× tax with **zero reads** (also verified — the original wired-as-one-block setup landed cache_creation > 0 and cache_read = 0 across all 5 measured turns). Caching only the persona costs nothing today below 2,048 (silent no-op) AND sustained 100% hit rate post-fix because **`SYSTEM_PROMPT` is already 5,303 tokens, well above 2,048** — the founder's expected wait-for-Phase-3 was unnecessary; cache activates immediately. **Verification (5-turn live test against prod build):** turn 1 cache_creation=5,303 cache_read=0 (write); turns 2-5 cache_creation=0 cache_read=5,303 (sustained read). Acceptance criterion of ≥90% hit rate met (100% on turns 2-5). **Cost reduction:** ~34% on input portion of a 5-turn session vs uncached baseline; per-turn savings approach ~₹0.10-0.20 for multi-turn sessions. Single-turn first-message users see no benefit (small 1.25× write penalty on the persona block). Net positive any time avg session length > 1.5 turns — true for the 10-msg free pool design. **Regen scripts (Phase 1.6/1.7 carry-forward) NOT modified:** their 1,317-token `SYSTEM_PROMPT` is still below the 2,048 minimum, so `cache_control: ephemeral` continues being a silent no-op there. Harmless (no 1.25× tax since cache write doesn't happen). No large regen runs scheduled before Phase 9+ Sanskrit attachment, at which point prompt growth may push above 2,048 and caching activates automatically. **Permanent telemetry:** `[chat] sonnet usage: input=N cache_creation=N cache_read=N output=N (persona=Nch dynamic=Nch)` log line on every chat turn — watch for cache_read jumps when Phase 3 ships its persona iteration. **Total Phase 2.6 spend ~₹15** (1 single-turn measurement + 2× 5-turn verification batches at ~₹4-5 each); came in under the ₹20 budget + 2-hour time-box. **Carry-forward closed:** the cache items in the Phase 1.6/1.7/2 carry-forward lists are resolved by this row; remove from carry-forward when revisiting those phases. |
| 2026-05-03 | Phase 2.5 COMPLETE: temple-aesthetic UI + verse-card source-aware refs (Gita/MBh/Bhagavata badges, dual-format Bhagavata labels, empty-Sanskrit footer caveat, lotus-mandala atmosphere, peacock-feather header, bansuri input accent) | **Verse-card foundation:** `parseReference` + `formatReferenceLabel` in `src/lib/referenceParser.ts` cover all 4 ref formats — Gita anchored (`gita_2.47`) + Gita split (`gita_18.78_79` → "Bhagavad Gita 18.78-79"); MBh with parva map across all 13 Phase 1.5 parvas (`mb_drona_38_1a` → "Mahabharata Drona Parva 38", sub-letter dropped from display); Bhagavata anchored (`bhagavata_10.29.7` → "Srimad Bhagavatam 10.29.7"); Bhagavata fallback (`bhagavata_10.55_3` → "Srimad Bhagavatam 10.55 (passage 3)"). Hindi labels (भगवद्गीता / महाभारत / श्रीमद्भागवत) selected per user input language via `detectLang()` heuristic (>30% Devanagari chars → 'hi'). 47/47 unit tests via Node `tsx --test`. Verse-card extracted from ChatUI to `src/app/components/VerseCard.tsx`; collapsed pill is itself the source-tinted badge (saffron/maroon/indigo) at min-h-11 (44px touch-target above 28px WCAG fail). Empty Sanskrit (MBh + Bhagavata rows) renders Hindi + English only + a "संस्कृत संरेखण: फेज 9+ ऑडिट लंबित" / "Sanskrit alignment: Phase 9+ audit pending" footer caveat in `text-brass-dark/90`. **Visual identity foundation:** 6 semantic color tokens (`devotional` #E89B3C, `sacred` #7C2D2A, `krishna` #1E2A5E, `brass` #B08D4C, `parchment` #FBF4E8, `peacock` #0E5566) + 2 dark text variants (`devotional-dark` #7A4F1E, `brass-dark` #7C5F2E) added to `src/app/globals.css` `@theme inline` block — Tailwind v4 CSS-first config (no JS config file in this codebase). `src/lib/designTokens.ts` is the typed registry with WCAG ratings + sanctioned `SOURCE_BADGE_CLASSES` (Step 2.5.8 R1 bumped MBh `bg-sacred/10` → `/20` + border `/40` → `/60` for stronger differentiation from Gita's warm marigold). Noto Sans Devanagari + Cormorant Garamond self-hosted via `next/font/google` in `layout.tsx`. **Krishna-presence motifs:** `PeacockFeather` is a photographic asset (`public/krishna-peacock-feather.png`, 71.8 KB, 500×500, 1:1) rendered via `next/image` with explicit width/height for CLS prevention + `priority` flag in the header preload; `Bansuri` + `LotusMandala` kept as inline SVG per discipline rule. **Atmosphere:** layout body gradient `from-orange-50 via-amber-50 to-amber-100` → `from-parchment to-parchment/95`; lotus mandala fixed-positioned watermark at `opacity-[0.06]`; bansuri silhouette to left of input (`hidden sm:block`); Send button `bg-krishna text-parchment`. **Accessibility cleanup discovered + fixed:** `landmark-one-main` (ChatUI outer wrapper `<div>` → `<main>`) + `meta-viewport` (removed `maximumScale: 1` to allow user pinch-zoom — was a WCAG 1.4.4 violation predating Phase 2.5). **QA gates passed:** Lighthouse mobile accessibility 100/100 (target ≥90, exceeded by 10); Cumulative Layout Shift 0 in Lighthouse + 0.0087 at Slow 3G + 4× CPU throttle (target <0.1, exceeded by ~12×) — `next/image` reservation worked perfectly; 9/9 WCAG AA contrast pass on every text combination (min disclaimer 5.44:1, max body+button 12.41:1); Hindi conjunct rendering verified (पाण्डुपुत्र / निरहंकारः / भगवद्गीता classical forms); 5-query live retrieval batch verified all 4 ref formats render naturally including 3-of-5 queries surfacing Bhagavata fallback refs. **Tooling shipped:** `scripts/screenshot-chat.ts` (Playwright driver with `--mock` fixture-injection flag for zero-API-cost UI iteration); `scripts/cls-slow3g-check.ts` (Playwright + CDP `Network.emulateNetworkConditions` for Slow-3G CLS measurement); `scripts/contrast-check.ts` (programmatic WCAG calc with alpha-blended effective backgrounds). `lighthouse` added to devDeps. `/design-system` route built as a public reference page (color swatches with WCAG ratings, typography samples, motif catalog, mock verse cards). **Phase 11 boundary:** static Pichwai/Tanjore Krishna avatar work explicitly NOT preempted — peacock-feather + bansuri + lotus-mandala motifs are devotional symbology, not avatar. **Total spend ~₹100** (5 live screenshot batches × ~₹15-20 each = ~₹75 + 5-query final mobile QA ~₹25; ₹0 on the 4 mock screenshot batches via `--mock`). Reports: `test-results/phase2.5-mobile-qa-2026-05-03.md` + `test-results/phase2.5-{baseline,step3-badges,step67-atmosphere,step67b-peacock-png,mobile-qa,design-system,mock-smoketest}-screenshots/`. Carry-forward to Phase 3: persona prompt should reference verses by intent (Decision #10) using the new vocabulary ("as I told Arjuna long ago", not "Bhagavad Gita 2.47"). Carry-forward to Phase 6: re-audit Lighthouse on Vercel prod for LCP improvement; reuse `cls-slow3g-check.ts` + `contrast-check.ts` + `screenshot-chat.ts --mock` for repeat regressions. |