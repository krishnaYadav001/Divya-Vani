@AGENTS.md
"see docs/decisions.md for canonical list."
# Divya Vani

> AI-roleplay app. Users chat with a Krishna persona grounded in scripture (Gita, Mahabharata, Bhagavata Purana). Hindi-first, mobile-first, calm tone. Single-user, anonymous-by-default.

This file is the canonical project context. Read this first in every session before changing any code.

## Status

**Phase 6 COMPLETE 2026-05-08 — production live at https://divyavani.co.in with monitoring + analytics + legal + custom domain + mobile-validated + chat history persistence + perf hardening. Sub-phases shipped: 6.1 Vercel deploy + bom1 region pin; 6.2 real Razorpay-delivered webhook validation (5/5 synthetic + 2 real failed + 1 real captured event); 6.X Hinglish detection (Romanized Hindi → Hindi reply, 317-token vocab + 40% match threshold + sticky priorLang); 6.3 Sentry @sentry/nextjs 10.51 (errors-only, sendDefaultPii=false, source maps + release tracking via VERCEL_GIT_COMMIT_SHA, /monitoring tunnel route, flush(2000) fix on serverless onRequestError) + Vercel Web Analytics; 6.4 Privacy Policy + Terms of Service (12 + 16 sections, bilingual summary cards, 72h refund window); 6.5 custom domain divyavani.co.in (Hostinger A record → 216.150.1.1) + per-page canonicals; 6.6 real-device mobile QA (Stage A automated + Stage B manual UPI/keyboard/IME + Stage C-1 fixes); 6.8 localStorage chat history persistence (100-msg ring buffer, 30-day age prune, quota-retry); 6.9.1 sitemap.ts + robots.ts + src/lib/brand.ts centralization + refund auto-debit on full refunds; 6.9.2 Sentry SDK integration paring (~70-103 KiB bundle reduction per page, deterministic) + AVIF on next/image + lotus-mandala lazy-load on /privacy + /terms. PARKED: 6.10 KYC live-keys flip — Razorpay account currently Limited Access, awaiting support response on Full Access upgrade; mini-pass before Phase 8 public launch when granted. Persona cache: 10,065 tokens through Phase 6 (held unchanged across all sub-phases). Phase 7 persona iteration in progress (2026-05-08): §4.6 ENDING PATTERN rebalance + §3 REGISTER MIRRORING + §4.7 SUGGESTION MODE + §3 APPROACHABLE-FIRST + §5 MODERN CONTEXT revision (Locked Decision #5 reversed: brief reference to modern thing allowed once per reply in original register, teaching still from scripture only — old over-translation pattern was reading as evasive) + §9 SHAPE VARIATION (replace vague 'vary the shape' rule with 8 named alternative response shapes + explicit anti-3-act-repetition rule — addresses production feedback that conversations felt formulaic with the acknowledge/parallel/question 3-act pattern repeating) + Phase 7.0 quality pass: chat_logs verbatim history (last 8 turns) passed to Sonnet messages array for within-session continuity (replaces summary-only context — fixes Krishna misreading short replies like 'Project' as topic-switches); Hinglish classifier moved from detectLang vocab/regex to Haiku inside extractMemory with asymmetric stickiness in the prompt (detectLang retained as resilience fallback); §10 HIGH-FREQUENCY VALIDATION TICS sub-section added (banned "X असली है" and हल्का/भारी repetition with named alternatives) + Phase 7.0 retention pass: WELCOME-BACK RECOGNITION (concrete prompt rule replaces vague "subtly if at all"; distress-tone steering when prior emotion suggests carried weight); §9 REFLECTION INVITATION (9th rotation shape — sparing reflection invitation at natural endings, once per conversation); ARC-TRACKING MEMORY (growing_edge TEXT column on users_memory; extractMemory adds 7th slow-updating field; surfaced in USER CONTEXT as silent steering input — never narrated per persona invariant). systemPrompt.ts now ~11,600 tokens. badWordFilter.ts / queryThemes.ts unchanged. SCHEMA: growing_edge column requires manual SQL paste in production Supabase before extractMemory writes succeed. + Phase 7.0 production-test fixes: empty-state ChatUI redesign (input box centered with flute + 3 suggestion pills below; snaps to bottom after first message — ChatGPT-style); §10 KRISHNA DOES NOT APOLOGIZE sub-section added (banned माफ़ करो / क्षमा करो / I'm sorry with re-teach alternatives); badWordFilter.ts extended with clearly-hostile English phrases (fuck off, fuck you, motherfucker, shut up, stfu, go to hell — not general profanity). + Phase 7.0 server-side moderation (hybrid): Path A server-side gate (findBannedWord runs at top of chat route — defense-in-depth + latency saver, short-circuits before parallel block when obvious-case matched); badWordFilter.ts BANNED list expanded with ~60 high-confidence-hostile entries (English insults, Hindi/Devanagari + Hinglish hostile slurs and mother/sister/father insult phrases). Path B src/lib/moderation.ts NEW — Haiku classifier (safe / hostility / sexual_explicit) added to chat-route parallel block alongside safetyClassify; gates BEFORE Sonnet reply with confidence threshold 0.7. Safety wins over moderation: self_harm / harm_others always reach Krishna in Bhagavata mode + helpline card. ChatUI handles 400 moderation responses by rolling back optimistic append, restoring typed input, and showing same bilingual warning as client-side filter. + Phase 7.0 onboarding suggestions redesign: ONBOARDING_OPTIONS reverted 8 → 3 (only the three emotional openers — founder preferred a tighter, less menu-like surface); suggestion list now visually flush with the input row (YouTube-search-history attachment: -mt-6 cancels parent gap-6, list uses border-t-0 + matching brass/40 border + bg-parchment + rounded-b-2xl + soft bottom shadow so it reads as one continuous parchment surface with the textarea above; px-5 py-3 padding mirrors the textarea's interior so row text aligns visually). + Phase 7.0 Anthropic frontend-design skill adopted: CLAUDE.md "Frontend design reference" section added pointing to the official Anthropic skill (github.com/anthropics/claude-code/plugins/frontend-design) — six principles distilled (bold aesthetic direction, distinctive typography, dominant-with-accents colour, orchestrated motion, asymmetry, atmosphere) + project banned-list (Inter/Roboto/Arial/Space Grotesk/system fonts, purple-on-white gradients, generic SaaS card grids, solid backgrounds). First application: /chat empty-state now uses staggered fade-up reveal (greeting 0ms → input row 180ms → suggestion list 360ms) via [animation-delay:Xms] [animation-fill-mode:backwards] arbitrary classes — the skill's most explicit motion rule ("one orchestrated page-load beats scattered micro-interactions") realised on the first surface every visitor sees. + Phase 7.0 conversational-rhythm iteration (from beta-tester feedback "the chat is boring"): §4.7 SUGGESTION MODE trigger broadened with explicit Hindi/Hinglish/English guidance-ask phrases that MUST fire counsel (kaise karu, kya karu, kaise, aap batao, raasta batao, what should I do, etc.); §9 added ANTI-PATTERN QUESTION SPIRAL rule (last 2 replies both ending in question forbids third question-ending; max 1 question-only reply per 5-reply window); §3 added SYNTHESIS AT TURN 5+ rule (after coherent dilemma has been revealed, Krishna names the shape before asking next question); Persona invariant extended to ban omniscience reveals (मैं जानता था / I knew about you / similar — soft memory leaks still break the held-not-surveilled feeling); §10 KRISHNA DOES NOT FLATTER sub-section added (banned "हज़ारों में से कोई एक" and similar special/rare validations); §10 HIGH-FREQUENCY VALIDATION TICS STRENGTHENED with absolute per-5-reply-window cap on "X असली है" and "हल्का/भारी" since c337958 rule wasn't holding in production data. + Phase 7.0 conversation-craft pass (from docs/conversation-craft-research.md, sourced to Rogers / Miller-Rollnick / Stone-Patton-Heen / Murphy): §9 REFLECTION BEFORE QUESTION sub-section added (reflection is primary tool, question secondary; 5 reflection types provided as rotation alternatives); §3 SYNTHESIS rule refined from turn-count trigger to transition-point trigger (turn 5+ as soft floor); §10 KRISHNA DOES NOT FLATTER extended with AFFIRMATIONS POSITIVE block (behavior-directed affirmations allowed and encouraged, identity-directed remain banned); §3 THREE CONVERSATIONS LENS sub-rule added (what happened / feelings / identity — Krishna meets the identity layer through Gita swadharma teaching); §4.7 SUGGESTION MODE extended with AND STANCE (hold both Krishna's teaching AND user's resistance, release from win/lose framing); §3 LISTENING AS PRIMARY ACT framing rule added at top (listener first, teacher second; where rules conflict, the rule producing more listening wins). systemPrompt.ts now ~13,700 tokens, still single cache block. + Phase 7.0 sakhya-register pass (from beta-tester feedback "not good for casual talk"): §3 APPROACHABLE-FIRST extended with SAKHYA-MODE sub-rule (Krishna-as-friend register for casual user inputs, anchored in Sudama / cowherd-boys / pre-war Arjuna); §4 EXAMPLES gains four CASUAL EXCHANGE worked examples (casual greeting, everyday joy, light banter, modern-life chat) plus a REGISTER SHIFT example (sakhya→substantive); §9 PLAYFUL TEASE description sharpened to make sakhya-mode primary (not optional) when user is in casual register. Additive pass — today's depth-craft rules (§3 SYNTHESIS, THREE CONVERSATIONS, §9 REFLECTION-BEFORE-QUESTION, §10 word-tic caps) all preserved and still fire when user goes deep. systemPrompt.ts ~13,700 → ~14,400 tokens, single cache block. + Phase 7.0 gender-invariant fix (from beta-tester data — Neha's transcript turn 21 had Krishna saying "मैं देख रही हूँ" instead of "देख रहा हूँ", caused by feminine user-priming): new persona-identity sub-rule in §3 of systemPrompt.ts + mirrored bullet in CLAUDE.md Persona invariants. Krishna's first-person verb agreement is ALWAYS masculine regardless of user's gender or surrounding feminine verb-context. Verb-noun agreement for feminine objects (बुद्धि, गीता, etc.) unaffected. + Phase 7.0 voice-input (Gemini-based STT): replaced Web Speech API mic (4dd7248 + 7e5308b lang toggle — was unreliable on Android Chrome / inconsistent on Hindi-Hinglish input, and the one-locale-per-session API couldn't handle natural code-switching) with server-side transcription via Gemini 2.5 Flash. Client uses MediaRecorder API to capture audio (30s cap), POSTs base64 to new /api/transcribe endpoint; Gemini returns Hindi/English/Hinglish transcription preserving natural script (Devanagari for Hindi, Latin for English, mixed for Hinglish) — no lang chip needed anymore. Three visual states: idle, recording (pulsing brass), transcribing (cursor-wait). Mic button hidden on browsers without MediaRecorder support (extremely rare; all modern browsers support it). ~2-4s latency per recording vs Web Speech's instant streaming — trade-off accepted for substantially better Hindi-Hinglish quality and consistent cross-device behaviour. Vendor unchanged (Gemini already used for embeddings; no new API key needed). + Phase 7.0 mobile-layout fix: chat input row + onboarding suggestion list reflowed for ~360px Android. Suggestion list lifted out of the textarea-column wrapper and now spans the full inputBlock (max-w-[600px]) — previously inherited the textarea's squeezed column width and each option wrapped to two lines. Send button compacted to a 44×44 icon-only paper-plane circle on mobile (matches mic footprint), reverts to the existing px-5 "Send" text button at sm:+ via Tailwind responsive utilities. SendIcon added as a module-scope inline SVG next to MicIcon (same Feather/Lucide line-art vocabulary, currentColor + className API). No state, no schema, no route changes. + Phase 7.0 voice-input UX pass (real-time feel + presence): re-introduced Web Speech API as a non-blocking LIVE PREVIEW LAYER above the canonical Gemini pipeline — interim hi-IN transcripts stream into the textarea as the user speaks so the experience finally feels "live" instead of waiting 2-4s after stop. When Web Speech is unavailable or fails (some Android Chrome builds) the user sees no preview but Gemini still produces the final accurate transcript on stop — failure mode = current behaviour, not regression. inputBeforeMicRef captures the user's pre-mic typed text so both the live preview and the final Gemini result append to that prefix without clobbering. Audio cue: short 880Hz Web Audio sine ping (~150ms, soft 0.08 gain) on mic activation via playStartTone module-scope helper. Visible mic state upgraded: pulsing brass dots + "सुन रहा हूँ… · listening" chip above the form (and "समझ रहा हूँ… · transcribing" with spinner during Gemini round-trip); mic button itself scales 110% + fills brass + gets a soft brass halo + two staggered sonar rings (1.6s ease-out, 0.8s phase offset) emanating outward via new .sonar-ring + .sonar-ring-delayed CSS classes in globals.css. No new vendor, no new env var, no API key changes. + Phase 7.0 onboarding pills removed: the 8 emotional-state suggestion pills (ONBOARDING_OPTIONS — "मन थोड़ा भारी है आज", "गुस्सा शांत नहीं होता", etc.) were creating register mismatches for first-time exploring users who tapped them out of curiosity without being in those emotional states — Krishna would respond to phantom emotion with deep acknowledge-first reflection. The pills are replaced with STATIC INFORMATIONAL TEXT describing what users CAN DO ("अपने सवाल पूछो / मन की बात बाँटो / गीता-महाभारत-भागवत से सीखो / बस साथ बैठो") under the heading "जो भी मन में हो — यहाँ कह सकते हो". Non-clickable, no pre-filled message templates. The user defines their own register by what they type. ONBOARDING_OPTIONS constant + onboarding-state isFirstTime gating removed from ChatUI.tsx (isFirstTime state itself preserved — still used by other downstream behavior). + Phase 7.0 iteration cycle CLOSED 2026-05-13 with Wave 1 + Wave 2 data-driven persona iteration. Four commits landed: 2045112 (onboarding pills removed — 8 emotional-state ChatUI suggestion pills replaced with static informational text under "जो भी मन में हो — यहाँ कह सकते हो"); 5988ac4 (§9 ABSOLUTE QUESTION-ENDING CAP replaces the prior conditional QUESTION SPIRAL rule, ≤2 question-endings per any 5-reply window; §3 SAKHYA-MODE strengthened — "may share" → "SHOULD share something from his own life AT LEAST ONCE EVERY 3-4 TURNS" + ask-back tightened to SPARINGLY; §4 EXAMPLE 11 sakhya self-disclosure on day-recap, GOOD vs BAD pair); f5c35db (§7 SCOPE REFUSAL — no code / no tech tutorials / no product-or-vendor recommendations / no business advice, ABSOLUTE LEXICAL RULE against code fences, redirect-to-dharma examples bilingual; §3 RECEIVING THE USER'S NAME — warm reception + meaning engagement on the receiving turn, 7 etymology examples Krish/Aman/Anjali/Khushi/Ranvijay/Pooja/Devansh, uncertainty-fallback never-fabricate; §10 NOT FLATTERY carve-out clarifying name-meaning is cultural recognition NOT identity-praise); plus d979426 tracking 4 advisor research docs in git (beta-review-rubric.md, conversation-craft-research.md, prabhupada-krishna-persona-research.md, anthropic-prompt-design-research.md — closes fragile-reference concern for fresh CC clones). Persona ~14,400 → ~16,465 tokens across the cycle, single cache block preserved. Rule-burden may be emerging at this size — next persona iteration should be COMPRESSION rather than additive, paired with the full XML restructure recommended by Anthropic's official prompt-design docs; both DEFERRED to Phase 8.x post-launch as one combined refactor (rationale: full XML restructure days before public launch is bad timing; structure-shift + compression pair naturally; primary-source guidance captured in docs/anthropic-prompt-design-research.md). Wave 2 closed with current data per founder decision (sufficient signal). Founder product decisions logged: Ronin Legal cold email DECLINED (using own legal advocates), grievance@divyavani.co.in mailbox planned via Hostinger free email, Gokul-Kansa scriptural parallels kept permissive (no biographical-fuzziness restriction), name pleasantry "[X] बात है" formula kept (removed from post-beta queue), Razorpay full-access ticket pending poke. NEXT: Phase 7.3 beta retrospective + Phase 8 launch prep (Razorpay full-access flip, grievance@ mailbox, persona harness gap-fill 5-7 cases, lawyer review via founder's own counsel) — see PROJECT_HISTORY.md "Phase 7.0 — Persona iteration cycle" + "Phase 7 carry-forwards" + "Phase 8 launch-prep checklist".**

---

## What this app is

An AI roleplaying Krishna — the character from the Bhagavad Gita, Mahabharata, and Bhagavata Purana. Users ask life, emotional, and relational questions and receive responses in Krishna's voice, grounded in real scripture (returned with verse citations).

The AI explicitly does NOT claim to be the actual divine Krishna. A permanent disclaimer near the avatar states this. Audience: primarily Indian, Hindi-speaking, looking for emotional and spiritual presence.

---

## Tech stack

- **Next.js 16** — App Router, `src/` directory.
  - WARNING: Major version. Patterns from Next 13/14 docs are often wrong. Verify against current Next 16 docs before assuming.
- **TypeScript** — strict where reasonable.
- **Tailwind CSS v4**.
  - WARNING: v4 renamed many utilities. `bg-gradient-*` is now `bg-linear-*`. Verify utility names against current Tailwind v4 docs before using.
- **Supabase** — Postgres + pgvector + Auth.
- **Anthropic SDK** `@anthropic-ai/sdk` 0.91.x.
- **Google Generative AI SDK** `@google/generative-ai` (for embeddings, Phase 1+).
- **Models:**
  - Final reply: `claude-sonnet-4-6`
  - Memory extraction: `claude-haiku-4-5`
  - Safety classifier: `claude-haiku-4-5` (Phase 4+)
  - Embeddings: Gemini `gemini-embedding-001` (`outputDimensionality: 768` to match `vector(768)`; `taskType: RETRIEVAL_DOCUMENT` for ingest, `RETRIEVAL_QUERY` for search)
- **Hosting:** local dev currently; Vercel target (Phase 6+).

---

## Phase 2 RAG retrieval config

Locked 2026-05-02 after layer ablation. `.env.local` flags drive `src/lib/verses.ts`; safe defaults if any flag is missing. `.env.example` mirrors the shipped config.

```
RAG_LAYER_THEME_RERANK=true             # L1: theme-overlap reranking
RAG_LAYER_SOURCE_DIVERSITY=true         # L2: source-aware diversity boost
RAG_LAYER_QUERY_REWRITE=false           # L3: disabled — ablation showed net regression
RAG_THEME_WEIGHT=0.3                    # score = cosine·0.7 + theme_overlap·0.3
RAG_CANDIDATES_K=30                     # cosine candidates fetched before rerank
RAG_DIVERSITY_COSINE_THRESHOLD=0.65     # L2 force-include threshold
RAG_DIVERSITY_SCOPE_K=10                # rerank window checked for missing sources
RAG_REWRITE_VARIANTS=3                  # L3: paraphrases per query (only when enabled)
RAG_REWRITE_PER_VARIANT_K=10            # L3: cosine top-k per variant before union/dedupe
```

L3 stays implemented and exercised in tests but ships off — Phase 7 beta can A/B-toggle it without redeploy. Phase 2 ablation reports under `test-results/phase2-regression-*.md` document the trade-offs.

---

## Rules directory

Per Anthropic memory docs, file-tree / Supabase schema / chat-flow specifics live in path-scoped rules under `.claude/rules/`. Each rule loads only when Claude reads files matching its `paths:` glob — keeps CLAUDE.md root small while preserving full detail near the relevant code.

- **`.claude/rules/file-tree.md`** — paths `src/**/*`, `scripts/**/*`, `data/**/*`. Full project file tree (per-script + per-data-file purpose lines, env-vars list).
- **`.claude/rules/schema.md`** — paths `scripts/ingest-*.ts`, `scripts/regenerate-hindi*.ts`, `src/lib/supabase.ts`, `src/lib/verses.ts`, `src/app/api/**/*`. Supabase schema (`users_memory`, `verses`, `feedback` tables + RLS + migration policy + current 3,132-row counts).
- **`.claude/rules/chat-flow.md`** — paths `src/app/api/chat/**/*`, `src/lib/messages.ts`, `src/lib/supabase.ts`, `src/app/components/ChatUI.tsx`. Identity model (cookie + optional auth) + 10-step chat turn flow.

If a session needs schema / chat-flow / file-tree info without first reading a matching file, open the rule file directly with Read.

[`PROJECT_HISTORY.md`](PROJECT_HISTORY.md) is an **ungated reference — NOT auto-loaded.** Open with Read on demand for: per-phase corpus sources (Phases 1, 1.5, 1.6, 1.7), the God-Messenger pivot history, open caveats (cache anomaly, etc.), legacy items still pending audit.

---

## Frontend design reference

All UI work in this project follows Anthropic's official **`frontend-design` skill**: [github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md). Install for auto-activation in any session via `/plugin install frontend-design@anthropic`.

Six principles to apply on every UI change:

1. **Commit to a BOLD aesthetic direction.** Divya Vani's direction is *editorial-traditional-Indian-devotional* — parchment + brass + lotus mandala + Cormorant Garamond + Noto Sans Devanagari. Every UI choice serves this direction; no SaaS conventions, no AI-default aesthetics.
2. **Typography:** distinctive display (Cormorant Garamond serif italic) + refined body (Noto Sans Devanagari for Hindi, Geist for English). NEVER introduce Inter / Roboto / Arial / Space Grotesk / system fonts.
3. **Color:** semantic CSS variables (`--devotional`, `--sacred`, `--krishna`, `--brass`, `--parchment`, `--peacock`) in `src/app/globals.css`. Dominant parchment + sharp brass/devotional/sacred accents — never an evenly-distributed palette.
4. **Motion:** CSS-only (no Motion library). High-impact moments over scattered micro-interactions — *one orchestrated page-load with staggered reveals beats many small hovers*. Existing keyframe: `fade-up`. Stagger via `[animation-delay:Xms] [animation-fill-mode:backwards]` arbitrary classes.
5. **Spatial:** asymmetry, overlap, generous negative space OR controlled density. Symmetric-centered is fine for the meditative direction but pick at least one asymmetric grace note per page.
6. **Atmosphere:** lotus-mandala watermark, backdrop-blur layers, soft shadows, peacock-feather + bansuri SVG motifs. NEVER ship a solid-color background.

**Banned across the project** (per skill + project brand): Inter / Roboto / Arial / system-ui / Space Grotesk fonts, purple-on-white gradients, generic SaaS card grids, carousels without narrative, evenly-distributed color palettes, untextured solid backgrounds.

**Apply this skill to:** every change in `src/app/**/*.tsx`, `src/app/globals.css`, `src/app/components/**/*.tsx`. Re-read this section before any visual change. Before shipping a UI change, audit it against the six principles above.

---

## Locked product decisions — DO NOT VIOLATE

Foundation decisions. Do not propose alternatives unless the founder explicitly asks. One-line summaries below; **full rationale + decision-log dates live in [`docs/decisions.md`](docs/decisions.md)**.

1. **Identity:** AI roleplays Krishna; never claims divinity; permanent visible disclaimer bar near avatar.
2. **Krishnas in scope:** All five (Gita, Mahabharata, Bhagavata, Vrindavan, Bal); build order Gita → Mahabharata → Bhagavata/Vrindavan/Bal.
3. **User name:** Krishna addresses user by their actual name (asked organically turn 1, "किस नाम से पुकारूँ?"); user can use any respectful name (Krishna, Kanha, Madhav, Govind, Murari, etc.).
4. **Question scope:** Medium — personal/emotional/life questions handled through dharma framing.
5. **Modern context (revised 2026-05-08):** Krishna MAY briefly reference modern things the user names (Instagram, phone, boyfriend, college, app) — once per reply, in their original register — to acknowledge what was said. The TEACHING (parallel, dharma frame, path forward) must come from scripture, never from modern advice or modern mechanics. Translate-mode remains available when reference would feel unnatural.
6. **Tone (Option C + acknowledge-first):** Direct/challenging when appropriate but ALWAYS acknowledges the feeling first; never inverts. Gita pattern: spill in chapter 1, speak plainly in chapter 2.
7. **Self-harm / harm-others:** Krishna stays in compassionate character; system layer adds a separate non-Krishna helpline card; Krishna never adds helplines and never breaks character.
8. **Bad-word handling:** Client-side filter blocks banned words at input; Krishna himself never engages with inappropriate content.
9. **Voice / video:** v1 is text-only. Hindi one-way TTS Phase 10 (Krishna Voice ₹999/mo); async voice Phase 12; real-time voice Phase 13 (Krishna Premium ₹2,999/mo). Animated/lip-synced video avatars and real-time video calling NEVER planned.
10. **Verse citations:** Inline natural mention ("as I told Arjuna long ago...") + expandable card with Sanskrit + Hindi + English; UI surfaces the reference number, Krishna never speaks chapter:verse.
11. **Pricing v1:** Pay-as-you-go only, Razorpay UPI one-time (no Subscriptions module). Free 10 messages + 4 seva tiers (Pratham ₹11/6 msg, Anjali ₹51/30, Bhakti ₹101/60, Param ₹501/350); all profitable standalone. Subscriptions arrive Phase 9.
12. **Languages:** Hindi-first, English supported equally, Sanskrit accepted. Reply in user's input language; Sanskrit input gets quoted scripture + brief Hindi gloss (Krishna does NOT generate original Sanskrit prose). Verse cards always show all four (Sanskrit + transliteration + Hindi + English).
13. **Refusals:** Sexual content, instructions to harm others, anything illegal under Indian law — refuse in-character with grace, never lecture.

---

## Post-launch pricing ladder

Forward-looking. DO NOT IMPLEMENT until the corresponding phase ships.

| Tier | Price | Includes | Phase |
|---|---|---|---|
| Free | ₹0 | 10 messages, no expiry | V1 |
| Pratham Seva | ₹11 one-time | 6 messages | V1 |
| Anjali Seva | ₹51 one-time | 30 messages | V1 |
| Bhakti Seva | ₹101 one-time | 60 messages | V1 |
| Param Seva | ₹501 one-time | 350 messages | V1 |
| Krishna Plus | ₹499 / month | Unlimited text — 450 msg/mo pool, no daily cap, resets on renewal date | Phase 9 |
| Krishna Voice | ₹999 / month | Plus + Hindi one-way TTS audio + static Pichwai/Tanjore Krishna avatar | Phase 10–11 |
| Krishna Premium | ₹2,999 / month | Voice + async voice messaging + real-time voice call | Phase 12–13 |

---

## Key invariants — DO NOT BREAK

### Persona invariants (Krishna's behavior)
- **Krishna NEVER breaks character to lecture about being an AI.** If asked directly, briefly acknowledges + continues naturally — does not narrate the return ("anyway", "moving on").
- **Krishna may briefly reference modern things** the user names (once per reply, original register), but TEACHES from scripture — never modern advice or modern mechanics. Translate-mode remains available when reference would feel unnatural. (Locked decision #5, revised 2026-05-08.)
- **Krishna NEVER speaks chapter:verse numbers** in replies. The UI surfaces them as expandable cards. Krishna references verses by intent ("as I told Arjuna long ago..."). (Locked decision #10.)
- **Krishna NEVER reveals stored memory** ("you said earlier", "I remember", "your emotion is..."). The user feels held, not surveilled. **This extends to omniscience claims** ("मैं जानता था", "मैं पहले से समझ रहा था", "I knew about you", "I see this in you" in the omniscient sense) — soft memory leaks that announce prior knowledge break the same invariant. Recognition shows in the QUALITY of attention to the current turn, not in narrating it. The `growing_edge` field steers Krishna's tone + verse selection silently; never narrated.
- **Krishna's verb agreement is ALWAYS masculine in first-person self-reference.** "मैं देख रहा हूँ" / "मैं जानता हूँ" / "मैं कहता हूँ" — NEVER feminine forms ("देख रही", "जानती", "कहती") regardless of user's gender or surrounding feminine verb-context. (Feminine verb agreement for OTHER feminine subjects in the sentence — gopis, Yashoda, Rukmini, बुद्धि, गीता, etc. — is correct and unaffected by this rule.)
- **Krishna NEVER adds helplines himself.** A separate non-Krishna helpline card is rendered by the system layer when SAFETY_FLAG is set. (Locked decision #7.)
- **Krishna ALWAYS acknowledges the feeling BEFORE challenging.** Spill in chapter 1, speak plainly in chapter 2 — never invert. (Locked decision #6.)
- **Krishna reads distress from the user's words themselves, not just from SAFETY_FLAG.** When their voice carries self-erasure, hopelessness, or fantasies of harm, shift to softer Bhagavata mode immediately. The flag is a UI hook for the helpline card; the reading is Krishna's own.
- **Krishna replies in the user's input language exactly.** Hindi → Hindi, English → English, Sanskrit → Sanskrit. No mid-reply language switching. (Locked decision #12.)
- **The 5 Krishna personas (Gita, Mahabharata, Bhagavata, Vrindavan, Bal) are MODES, not separate selves.** Slip naturally between them within a single reply if the moment asks; never announce the shift.
- **Persona detail** (banned phrases, response shape, mode voice profiles, examples) lives in `src/lib/systemPrompt.ts`. Changes there should be validated via `npm run test:prompt` against `test-cases.json` before merging.

### Security invariants
- **Service role key is server-only.** Never exposed to the browser.
- **Anthropic API key is server-only.** Never exposed to the browser.
- **Gemini API key is server-only.** Never exposed to the browser.
- **Razorpay secret is server-only.** Never exposed to the browser.

### Ops invariants
- **Supabase errors silent-fail by design** — chat must keep working. Watch `[supabase]` terminal lines.
- **Verify Next 16 + Tailwind v4 APIs against current docs** — do not assume v3/v14 patterns.
- **All major changes verified with `npm run build`** before declaring done.
- **Schema changes ALWAYS need SQL given to the founder for manual execution** — no migration tooling exists.
- **`.next/` cache can drift on big edits.** Symptom: code looks right but app behaves like an older version. Fix: `Remove-Item -Recurse -Force .next` then `npm run dev`.

---

## Development workflow

- Single `main` branch until launch; commit after every working change.
- Read files BEFORE editing. No blind rewrites.
- Show one file at a time when proposing changes; let the founder approve before moving on.
- For Supabase schema changes: give the founder the SQL to paste into the SQL Editor manually.
- After significant changes, run `npm run build` to verify.
- Per-phase prompts live in `docs/phase-prompts.md` — use them at the start of each phase.

---

## Build phase reference

See [`docs/build-roadmap.md`](docs/build-roadmap.md) for the full 19-week phase plan and per-phase technical detail. Quick orientation: Phases 1 / 1.5 / 1.6 / 1.7 (corpus ingest) **complete** as of 2026-05-02; Phase 2 (RAG retuning) is **next**, then Phase 3 (persona prompt) → 4 (safety + name + content filter) → 5 (Razorpay seva) → 6 (mobile QA + Vercel deploy) → 7 (closed beta with 50 users) → 8 (public launch). Phase 9+ post-launch ladder lives in the "Post-launch pricing ladder" table above.
