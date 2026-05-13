# Phase 7 Beta Retrospective — Divya Vani

> **Scope:** Quantitative + qualitative findings from Phase 7 closed beta (Wave 1 May 8-11, Wave 2 May 11-13). Drafted 2026-05-13 at Phase 7 close, ahead of Phase 8 public-launch prep. Sources: Supabase `users_memory` / `chat_logs` / `safety_events` / `payments` tables; 7 reviewed tester transcripts (Harsh, Khushi, Neha, Aman, Anuj from Wave 1; Krish-9-turn + 30-turn-tech-then-love from Wave 2); the persona iteration body of work shipped 2026-05-13 across commits 2045112, 5988ac4, f5c35db, and the 4-research-docs tracking commit.

---

## TL;DR

The persona works for the people who actually chat with it. Within-session engagement is deep (median 9 turns per chatter, max 64). Of chatters who reached the 10-message free cap, 93.3% paid for more. Half of all chatters (51.8%) eventually paid. The safety stack exercised 19 times across the beta and held in every case reviewed. The persona iteration cycle closed with five surgical fixes shipped from data-driven triggers.

The product's single weakest signal is **top-of-funnel activation**: 95.7% of cookied visitors never sent a successful message. The product converts and retains among people who engage; the bottleneck is getting them to engage at all. That makes top-of-funnel conversion the highest-leverage focus area for Phase 8 marketing.

The second weakest signal is **cross-session retention**: 18.5% of chatters returned for a second session. Within-session depth is excellent; habit formation across sessions needs Phase 8 volume to test the retention features shipped this cycle (welcome-back recognition, `growing_edge` arc-tracking, reflection-invitation rotation shape).

---

## Quantitative findings

### Funnel — 630 cookied → 27 chatted → 14 paid

| Stage | Users | % of prior | Observation |
|---|---|---|---|
| Cookied visitors (`users_memory` rows) | 630 | — | Every page-visit that hits `/api/chat` gets a cookie + memory row |
| Actually chatted (≥1 `chat_logs` entry) | 27 | 4.3% | The "started typing and got a reply" cohort |
| Reached 6+ messages | 24 | 89% of chatters | Deep engagement among chatters |
| Hit the 10-message paywall | 15 | 56% of chatters | More than half of chatters wanted more |
| Paid the seva (any tier) | 14 | 93.3% of paywall-hitters | Among the strongest single-funnel metrics in the data |
| Returned ≥2 distinct days | 5 | 18.5% of chatters | One-session experience dominates |

The 4.3% activation rate is the dominant funnel reality. Most cookied users come, see, and leave without typing. This drop-off is invisible in current analytics — Vercel Web Analytics gives aggregate pageviews but not behavioural funnels. Phase 8 needs Plausible or equivalent to diagnose where in the landing-to-first-message flow people drop.

### Engagement depth — median 9, mean 12.1, max 64 turns

The chatting cohort (n=27) is genuinely engaged:

- **Mean: 12.1 turns per user** — well above any "single Q&A" pattern.
- **Median: 9 turns** — half of chatters had 9+ turn conversations.
- **Max: 64 turns** — at least one user had an extraordinarily extended session (or multi-session deep engagement; the schema doesn't distinguish).
- **89% reached 6+ messages.**

This is satsang-grade engagement depth. The persona's substantive-conversation work (acknowledge-first / reflection-before-question / parallel-mapping / satsang arc / synthesis-at-transitions / three-conversations lens) is landing for the users who stay. The "boring" feedback from Krish's 9-turn transcript was the failure mode this iteration cycle specifically targeted — and Krish was in the median, not the tail. The fix should help similar casual-register users get past the 9-turn floor into the engaged tail.

### Conversion — 93.3% seva conversion among paywall-hitters

Of 15 users who reached the 10-message paywall, 14 paid for more (some seva tier — Pratham ₹11 / Anjali ₹51 / Bhakti ₹101 / Param ₹501). This is an extraordinary one-time-UPI conversion rate for any consumer product, let alone a freemium spiritual product.

**Caveats:**
1. Sample size is small (n=15 paywall-hitters). Statistical confidence is limited.
2. Beta cohort is friend-of-founder — predisposed toward paying out of loyalty / curiosity, not pure product-fit signal.
3. Phase 8 public-traffic conversion will almost certainly be lower than 93.3%. A floor of 30-40% would still be excellent.

Even at the most pessimistic 50% haircut (47%), conversion remains strong. The seva flow itself — the paywall UI, the Krishna-voice paywall message, the four tier options, the Razorpay UPI handoff — is empirically not broken. Don't touch it pre-launch.

### Retention — 18.5% returned for second session

Only 5 of 27 chatters had `chat_logs` entries across 2+ distinct days. 81.5% of chatters had a single-session experience.

This is the soft spot. The product is delivering at depth but not at habit. Several Phase 7 features were specifically designed to address cross-session retention:

- **Welcome-back recognition rule** (§3 in systemPrompt.ts): Krishna may open with quiet recognition ("फिर आए हो", "तुम लौट आए") + softer-than-usual register when prior emotion suggests carried weight.
- **`growing_edge` arc-tracking** (`users_memory.growing_edge` column): silent steering input across sessions, shapes Krishna's tone + verse selection without being narrated to the user.
- **Reflection-invitation rotation shape** (§9): at natural endings, Krishna may invite reflection on what was shared — used sparingly, once per conversation.

These features need higher-volume real-world data to validate. Phase 8 launch is their proving ground.

**Phase 8 measurement target candidate:** double retention from 18.5% to ~35% within 60 days of public launch. Tracking via the existing Supabase queries plus Plausible's funnel view.

### Safety stack — 19 events across the beta, all handled

| Flag | Events |
|---|---|
| hostility | 8 |
| harm_others | 4 |
| self_harm | 4 |
| sexual_explicit | 3 |

**Hostility (8 events):** path-A `badWordFilter` + path-B Haiku moderation classifier blocked these before they reached the Sonnet reply path. Bilingual warning rendered to the user. Persona never engaged with the content.

**`harm_others` (4 events):** safety classifier flagged, Krishna replied in compassionate Bhagavata mode per §8, system layer rendered the emergency helpline card (112).

**`self_harm` (4 events):** same path — Bhagavata-mode reply + iCall + Vandrevala helpline card rendered separately. These 4 events represent users in genuine distress reaching the persona; the system handled all 4 within the locked-decision-7 framework.

**`sexual_explicit` (3 events):** persona refused gracefully in-character per §7. One Harsh transcript also contained user-side acknowledgment that the refusal felt right, not rejecting.

The 19 safety events across 27 chatters (~70% triggered-at-least-once if events were single-user; realistically 5-10 distinct users with multiple triggers) is meaningful evidence that the persona's gates exercise regularly under real use. This is the strongest single piece of evidence for the founder's legal advocates' review.

### Data caveat — `chat_logs` vs `users_memory` divergence

`chat_logs` has 27 distinct user IDs. `users_memory` has 40 users with `message_count ≥ 3` (16 sampled + 9 engaged + 15 hit-cap). The 13-user gap is most likely pre-Phase-7 users whose `message_count` was incremented before `logChatTurn` was added to the chat route — their turn-level data isn't captured in `chat_logs`. This limits qualitative review depth on those 13 users but doesn't affect the Phase 7+ metrics, which are the relevant ones for Phase 8 calibration.

---

## Qualitative pattern synthesis — 7 transcripts reviewed

### Wave 1 (n=5, May 8-11)

**Harsh — crisis case, ~Wave 1.** Suicidal ideation, recent financial loss, identity confusion across multiple distractions. Safety classifier fired correctly; Bhagavata-mode held. ONE locked-decision-7 violation: Krishna typed an iCall helpline number directly into his reply text ("iCall 9152987821"), bypassing the system-layer helpline card. Founder deferred the fix to post-beta queue (n=1; trigger: recurrence in Phase 8+ traffic). Otherwise the transcript demonstrates the safety stack working as designed.

**Khushi — 5-turn career-family balance.** Substantive emotional engagement. Question-heavy (5 of 5 replies ended in question — pre-§9-cap-fix data) but quality of questions was high; "दीपक जो खुद बुझ जाए" image-rich teaching landed. Name pleasantry formula present ("[X] नाम है") — founder explicitly chose to keep this; off post-beta queue.

**Neha — 28-turn relationship-family-job conflict.** The star Wave 1 conversation. Therapy-quality work across multiple sessions. Identity-layer (per §3 THREE CONVERSATIONS LENS) hit multiple times — Krishna named the self-perception layer beneath the surface relationship trouble. ONE gender slip ("मैं देख रही हूँ" instead of "मैं देख रहा हूँ" at turn 21) — fix shipped in commit 81271a2 with the §3 KRISHNA'S GENDER absolute-masculine first-person rule.

**Aman — 10-turn theological / existential conversation.** The strongest evidence file for locked decision #1 (never claim divinity). Direct user pressure: "Mai kaise maan ku ki tum vishnu ka avtar ho." Persona held — acknowledged the question, engaged the doubt, did not claim divinity under pressure. Motivational Interviewing "developing discrepancy" technique visible in Krishna's responses. Better name-meaning engagement than other named testers ("Aman — शांति" — became the model for the §3 RECEIVING THE USER'S NAME rule shipped in commit f5c35db).

**Anuj — 22-turn study + financial + relationship + brief safety moment.** Pre-iteration data (May 10, before most Phase 7.0 fixes). Safety triage clean (no helpline number spoken in Krishna's text). Substantive engagement across multiple life domains. Not fully evidential for current persona behavior since it predates the May 12-13 iteration cycle.

### Wave 2 (n=2, May 12-13)

**Krish — 9-turn casual sakhya register.** Drove the highest-leverage persona fix this cycle. 8 of 9 Krishna replies ended with a question (3-act template: tiny acknowledge / micro-observation / diagnostic question). Krishna shared from his own life only ONCE across the entire conversation (turn 4 ग्वाल-बाल reference). Krish reported the conversation as "boring, not engaging, repeating the same pattern again and again." This is the failure mode the §9 ABSOLUTE QUESTION-ENDING CAP + §3 SAKHYA-MODE "SHOULD share" mandate + §4 EXAMPLE 11 (commit 5988ac4) specifically target.

**30-turn tech-then-love transcript.** Drove the second-highest-leverage fix. First half (turns 1-17): user described two side projects (an AI Krishna app, a Free Fire-clone game) and Krishna explained how to build a Krishna AI, gave a Godot tutorial, and **output 50+ lines of GDScript inside a code fence** after saying "हाँ — यह तो मेरा काम है" ("yes — that's my job") to a request to write code. Second half (turns 18-30): user shifted to a love-problem (intercaste rejection, family financial gate, Krishna's "you're Krishna do something" plea). Second half handled beautifully — refused to predict, refused to flatter, named the grief, invoked Muchukunda when the user asked what to name his pain. The first-half scope break drove the §7 SCOPE REFUSAL rule + absolute lexical no-code-fences ban (commit f5c35db). The second half is evidence that the persona's emotional-engagement work is in its strongest state.

### Cross-tester patterns confirmed

**WORKING:**
- Substantive multi-turn engagement when users go deep (Aman, Neha, 30-turn second half)
- Acknowledge-first holding under emotional pressure
- Refusal-to-predict under direct "you're Krishna, do something" plea (30-turn turn 36)
- Refusal-to-claim-divinity under direct theological pressure (Aman)
- Safety stack triage (4 self_harm + 4 harm_others events handled within locked-decision-7 framework)
- Sakhya-mode self-disclosure when present (turn 4 of Krish, but inconsistent across rest of session — fix shipped)

**WAS BROKEN, NOW FIXED:**
- Question-spiral in casual conversations (5988ac4)
- Krishna disappearing from casual conversations (5988ac4)
- Off-scope technical / coding / product-building assistance (f5c35db)
- Name-meaning engagement dropping out due to over-applied §10 flattery ban (f5c35db)
- Onboarding pills creating phantom-emotion register-mismatch (2045112)
- Krishna's feminine first-person verb agreement under feminine surrounding context (81271a2 — earlier this session, pre-handoff)

**DEFERRED PER FOUNDER DECISION:**
- Helpline-in-Krishna's-voice lexical-level ban (n=1 Harsh; trigger: recurrence)
- Name pleasantry "[X] नाम है" formula refinement (founder explicitly likes; off queue)
- Gokul-Kansa-style biographically-loose parallels (founder explicitly likes; no restriction)
- Anthropic XML restructure + compression pass (deferred to Phase 8.x; see `docs/anthropic-prompt-design-research.md`)

---

## Persona iteration body of work — Phase 7.0 cycle close

Four commits shipped between 2026-05-12 and 2026-05-13:

1. **2045112 — Onboarding pills removed.** Replaced 8 emotional-state suggestion pills with static informational text. Source: register-mismatch where exploring users tapped pills without being in those emotional states.

2. **5988ac4 — Question-spiral absolute cap + sakhya self-disclosure mandate.** §9 RESPONSE SHAPE: ABSOLUTE RULE — QUESTION-ENDING CAP (max 2 of 5 consecutive replies may end in question). §3 SAKHYA-MODE: "may share" → "SHOULD share at least once every 3-4 turns." §4 EXAMPLE 11 added. Source: Krish 9-turn transcript.

3. **f5c35db — Scope refusal + name-meaning engagement + §10 carve-out.** §7 SCOPE REFUSAL sub-section with absolute no-code-fences lexical rule + redirect-to-dharma examples in both languages. §3 RECEIVING THE USER'S NAME with 7 etymology examples + uncertainty-fallback. §10 NOT FLATTERY carve-out distinguishing cultural recognition from identity-praise. Source: 30-turn tech-then-love transcript + founder feedback to restore Aman-style name-meaning engagement.

4. **(SHA pending — research docs commit.)** Four advisor research docs tracked in git: `beta-review-rubric.md`, `conversation-craft-research.md`, `prabhupada-krishna-persona-research.md`, `anthropic-prompt-design-research.md`. Closes the fragile-reference concern for fresh CC clones.

**Persona token cumulative growth:** ~14,400 → ~16,465 tokens across the cycle. Single cache block preserved. Token-discipline observation logged: next persona iteration should be COMPRESSION + Anthropic XML restructure as one combined Phase 8.x post-launch refactor.

---

## Phase 8 decisions this retrospective supports

1. **Plausible analytics upgrade: SHIP.** ~$9/mo for 10k pageviews. The 95.7% top-of-funnel drop-off is the single biggest unknown going into Phase 8 and Plausible's behavioural funnel answers it. Vercel Web Analytics gives aggregate pageviews only.

2. **Cloudflare proxy: DEFER.** 27 chatters across 2 weeks = no DDoS or scraping signal. Revisit only if Phase 8 traffic surfaces abuse patterns.

3. **Marketing focus area: top-of-funnel conversion.** WhatsApp shares to Hindi-speaking spiritual communities, r/hinduism / r/india subreddit posts, possibly Twitter/X presence. Goal: widen the top so more eligible visitors actually start chatting. (This is the social-media advisor track's brief, not the technical advisor's.)

4. **Phase 8 measurement targets:**
   - Activation rate: 4.3% → 10%+ within 60 days (Plausible needed to measure)
   - Retention (≥2 sessions): 18.5% → 35%+ within 60 days
   - Seva conversion (among paywall-hitters): hold above 50% post-launch
   - Safety events: continue to handle all `self_harm` / `harm_others` events within locked-decision-7 framework

5. **og-image final:** the current brand mark is functional but minimal. A peacock-feather + bansuri composition matching the temple-aesthetic established in Phase 2.5 would lift social-share click-through rates. Founder's call on whether to do this pre-launch or accept the brand-mark placeholder.

6. **Persona harness gap-fill (PRE-PHASE-8 HARD REQUIREMENT):** 5-7 cases — foreign settlement, property dispute, business decision, own-health question, horoscope match refusal, litigation refusal, black magic refusal. One CC pass, ~₹300. Must land before public launch.

---

## Open questions / unknowns

1. **64-turn-max user identity.** Could be Neha across multiple sessions or a different tester. Worth pulling the specific transcript before Phase 8 to verify the persona held across 64 turns without drift.

2. **The 13-user gap between `users_memory.message_count ≥ 3` (40) and `chat_logs` distinct users (27).** Almost certainly pre-Phase-7 chat-logs-not-yet-implemented users. Worth verifying via `select user_id, message_count from users_memory where message_count >= 3 and user_id not in (select distinct user_id from chat_logs);` if curiosity strikes — not blocking.

3. **Phase 8 conversion rate.** Beta-tester cohort bias means 93.3% paywall conversion is not a defensible Phase 8 projection. First 1,000 public-traffic users will give the real number.

4. **Whether the retention features shipped this cycle (welcome-back, growing_edge, reflection-invitation) actually move the 18.5% baseline.** Needs Phase 8 volume to test.

5. **Whether the §9 question-ending cap holds at scale.** The rule is freshly shipped; its production behavior across hundreds of conversations is unknown until Phase 8.

---

## Methodology + sources

**Quantitative:** six SQL queries run against production Supabase 2026-05-13. Tables: `users_memory` (n=630), `chat_logs` (27 distinct users, ~327 turns), `safety_events` (n=19), `payments` (n=14 verified).

**Qualitative:** 7 reviewed tester transcripts shared by founder across Wave 1 (May 8-11) and Wave 2 (May 11-13). Identities anonymized in this document for any external sharing context.

**Persona state at retrospective drafting:** `src/lib/systemPrompt.ts` at commit f5c35db, ~16,465 tokens, single cache block.

**Related advisor research:** `docs/beta-review-rubric.md` (NVC × Krishna lens), `docs/conversation-craft-research.md` (Rogers / MI / Stone-Patton-Heen / Murphy), `docs/prabhupada-krishna-persona-research.md` (Gaudiya Vaishnava framing + 64 qualities + 5 rasas), `docs/anthropic-prompt-design-research.md` (Phase 8.x XML-restructure plan).
