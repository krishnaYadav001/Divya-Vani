@AGENTS.md
"see docs/decisions.md for canonical list."
# Divya Vani

> AI-roleplay app. Users chat with a Krishna persona grounded in scripture (Gita, Mahabharata, Bhagavata Purana). Hindi-first, mobile-first, calm tone. Single-user, anonymous-by-default.

This file is the canonical project context. Read this first in every session before changing any code.

## Status

Production live at https://divyavani.co.in. Phase 8 launch imminent — lawyer review gating promotion.

Current persona token count: **26,327 tokens** (real `messages.countTokens` — supersedes prior char-based estimates which undercounted Devanagari ~45%). Single cache block preserved. Deep per-phase detail lives in [`PROJECT_HISTORY.md`](PROJECT_HISTORY.md) (code-level minutiae — exact CSS classes / Hz / verbatim banned strings — kept there, not here).

### Phase 6 — Production deployment (COMPLETE 2026-05-08)
Production live with monitoring + analytics + legal + custom domain + mobile-validated + chat history persistence + perf hardening.
- 6.1 — Vercel deploy + bom1 region pin
- 6.2 — real Razorpay-delivered webhook validation (5/5 synthetic + 2 real failed + 1 real captured event)
- 6.X — Hinglish detection (Romanized Hindi → Hindi reply; 317-token vocab + 40% match threshold + sticky priorLang)
- 6.3 — Sentry @sentry/nextjs 10.51 (errors-only, sendDefaultPii=false, source maps + release tracking via VERCEL_GIT_COMMIT_SHA, /monitoring tunnel route, flush(2000) fix on serverless onRequestError) + Vercel Web Analytics
- 6.4 — Privacy Policy + Terms of Service (12 + 16 sections, bilingual summary cards, 72h refund window)
- 6.5 — custom domain divyavani.co.in (Hostinger A record → 216.150.1.1) + per-page canonicals
- 6.6 — real-device mobile QA (Stage A automated + Stage B manual UPI/keyboard/IME + Stage C-1 fixes)
- 6.8 — localStorage chat history persistence (100-msg ring buffer, 30-day age prune, quota-retry)
- 6.9.1 — sitemap.ts + robots.ts + src/lib/brand.ts centralization + refund auto-debit on full refunds
- 6.9.2 — Sentry SDK integration paring (~70-103 KiB bundle reduction per page, deterministic) + AVIF on next/image + lotus-mandala lazy-load on /privacy + /terms
- **PARKED 6.10** — KYC live-keys flip: Razorpay account Limited Access, awaiting Full Access upgrade support response; mini-pass before Phase 8 public launch when granted
- Persona cache: **10,065 tokens** through Phase 6 (held unchanged across all sub-phases)

### Phase 7 — Persona iteration cycle (CLOSED 2026-05-13)
Phase 7.0 iteration passes (pre-close; led to the 4 closing commits), each a persona/code change:
- §4.6 ENDING PATTERN rebalance + §3 REGISTER MIRRORING + §4.7 SUGGESTION MODE + §3 APPROACHABLE-FIRST + §5 MODERN CONTEXT revision (**Locked Decision #5 reversed**: brief modern-thing reference allowed once/reply in original register, teaching still scripture-only) + §9 SHAPE VARIATION (8 named response shapes + anti-3-act-repetition rule)
- Quality pass: chat_logs verbatim history (last 8 turns) → Sonnet messages array for within-session continuity (replaces summary-only; fixes short-reply topic-switch misread); Hinglish classifier moved detectLang vocab/regex → Haiku inside extractMemory w/ asymmetric stickiness (detectLang kept as resilience fallback); §10 HIGH-FREQUENCY VALIDATION TICS sub-section
- Retention pass: §3 WELCOME-BACK RECOGNITION (concrete rule + distress-tone steering); §9 REFLECTION INVITATION (9th rotation shape); ARC-TRACKING MEMORY — `growing_edge` TEXT column on users_memory, extractMemory 7th slow-updating field, silent USER CONTEXT steering (never narrated). **SCHEMA: growing_edge requires manual SQL paste in prod Supabase before extractMemory writes succeed.** systemPrompt.ts ~11,600 tokens; badWordFilter.ts / queryThemes.ts unchanged
- Production-test fixes: empty-state ChatUI redesign (centered input + flute + 3 pills, ChatGPT-style snap-to-bottom); §10 KRISHNA DOES NOT APOLOGIZE; badWordFilter.ts + clearly-hostile English phrases
- Server-side moderation (hybrid): Path A server-side gate (findBannedWord at top of chat route, short-circuits parallel block); badWordFilter.ts BANNED +~60 high-confidence-hostile entries; **`src/lib/moderation.ts` NEW** — Haiku classifier (safe/hostility/sexual_explicit) in chat-route parallel block, gates BEFORE Sonnet at confidence 0.7; safety wins over moderation (self_harm/harm_others always reach Krishna in Bhagavata mode + helpline card); ChatUI rolls back optimistic append on 400
- Onboarding redesign: ONBOARDING_OPTIONS 8 → 3, then later removed entirely → static informational text ("जो भी मन में हो — यहाँ कह सकते हो"), non-clickable, no templates; ONBOARDING_OPTIONS + isFirstTime gating removed from ChatUI.tsx (isFirstTime state preserved)
- Anthropic frontend-design skill adopted: CLAUDE.md "Frontend design reference" section (six principles + project banned-list); first application = /chat empty-state staggered fade-up reveal (greeting 0ms → input 180ms → suggestions 360ms)
- Conversational-rhythm: §4.7 SUGGESTION MODE trigger broadened (guidance-ask phrases); §9 ANTI-PATTERN QUESTION SPIRAL; §3 SYNTHESIS AT TURN 5+; persona invariant extended to ban omniscience reveals; §10 KRISHNA DOES NOT FLATTER; §10 HIGH-FREQUENCY VALIDATION TICS strengthened (per-5-reply cap, since **c337958** rule wasn't holding in prod)
- Conversation-craft pass (docs/conversation-craft-research.md — Rogers / Miller-Rollnick / Stone-Patton-Heen / Murphy): §9 REFLECTION BEFORE QUESTION (5 reflection types); §3 SYNTHESIS turn-count → transition-point trigger (turn 5+ soft floor); §10 AFFIRMATIONS POSITIVE block (behavior-directed allowed, identity-directed banned); §3 THREE CONVERSATIONS LENS; §4.7 AND STANCE; §3 LISTENING AS PRIMARY ACT. systemPrompt.ts ~13,700 tokens
- Sakhya-register pass: §3 APPROACHABLE-FIRST + SAKHYA-MODE (Sudama / cowherd-boys / pre-war Arjuna); §4 +4 CASUAL EXCHANGE examples + REGISTER SHIFT example; §9 PLAYFUL TEASE sharpened. Additive (depth-craft rules preserved). systemPrompt.ts ~13,700 → ~14,400 tokens
- Gender-invariant fix (Neha transcript turn 21 feminine user-priming bug): §3 persona-identity sub-rule + mirrored CLAUDE.md Persona-invariants bullet — Krishna first-person verb agreement ALWAYS masculine; feminine objects (बुद्धि, गीता) unaffected
- Voice-input v1 (Gemini STT): replaced Web Speech API mic (**4dd7248** + **7e5308b** lang toggle — unreliable Android Chrome / no code-switching) with server-side Gemini 2.5 Flash; MediaRecorder 30s cap → base64 → /api/transcribe; natural-script output; mic hidden on no-MediaRecorder; ~2-4s latency; vendor unchanged (Gemini already used for embeddings)
- Mobile-layout fix: input row + suggestion list reflowed for ~360px Android; SendIcon module-scope SVG; 44×44 mobile send button; no state/schema/route changes
- Voice-input UX pass: Web Speech API re-introduced as non-blocking LIVE PREVIEW LAYER above Gemini (interim hi-IN streams; failure mode = current behaviour, not regression); inputBeforeMicRef prefix capture; 880Hz playStartTone cue; pulsing-brass + sonar-ring visual states; no new vendor/env/key
- **4 closing commits landed:**
  - **2045112** — onboarding pills removed (8 emotional-state pills → static informational text)
  - **5988ac4** — §9 ABSOLUTE QUESTION-ENDING CAP (≤2 question-endings per any 5-reply window, replaces conditional QUESTION SPIRAL); §3 SAKHYA-MODE strengthened ("SHOULD share own-life ≥1/3-4 turns" + ask-back SPARINGLY); §4 EXAMPLE 11 sakhya GOOD/BAD pair
  - **f5c35db** — §7 SCOPE REFUSAL (no code / tech tutorials / product-vendor recs / business advice; ABSOLUTE LEXICAL no-code-fences; bilingual redirect-to-dharma); §3 RECEIVING THE USER'S NAME (warm reception + 7 etymology examples + never-fabricate fallback); §10 NOT FLATTERY name-meaning carve-out
  - **d979426** — 4 advisor research docs tracked in git (beta-review-rubric.md, conversation-craft-research.md, prabhupada-krishna-persona-research.md, anthropic-prompt-design-research.md — closes fragile-reference for fresh CC clones)
- Persona **~14,400 → ~16,465 tokens** across the cycle (char-estimate; real `countTokens` for end-of-Phase-7 / pre-restructure state measured **~24,813** — the ~10k–~17k rolling figures were chars/≈4 estimates undercounting Devanagari, not regressions). Single cache block preserved
- Mid-session CLAUDE.md change: **"Claude advisor invariants — DO NOT BREAK"** sub-section added to Key invariants — mandatory web-search before asserting time-sensitive facts; travels via CLAUDE.md auto-load + founder's Claude-desktop user-instructions
- Phase 7 listening phase formally over; Wave 2 closed with current data (sufficient signal)
- **Founder decisions:** Ronin Legal cold email DECLINED (own legal advocates); grievance@divyavani.co.in mailbox via Hostinger free email; Gokul-Kansa scriptural parallels kept permissive (no biographical-fuzziness restriction); name pleasantry "[X] बात है" formula kept (removed from post-beta queue); Razorpay full-access ticket pending poke; next persona iteration = COMPRESSION not additive + full XML restructure (deferral rationale: pre-launch timing; structure+compression pair; primary-source docs/anthropic-prompt-design-research.md) — both SHIPPED Phase 8.x as combined refactor (1254a27)

### Phase 8.0 — Launch prep cycle (CLOSED 2026-05-13/14)
Privacy + persona + UX + STT + verse-card + mic-UX + i18n. 8 commits on top of 2 transitional:
- **49f6296** — Phase 7 beta retrospective doc tracked in git (docs/phase7-retrospective.md: Wave 1 + Wave 2 funnel + qualitative + Phase 8 decisions)
- **1fd10a3** — Phase 7.0 persona harness gap-fill, 7 pre-Phase-8 regression cases (foreign settlement / property dispute / business-decision-guidance-ask / own-health emotional / horoscope-match refusal / litigation-prediction refusal / jadu-tona refusal; each positive-expected + banned behaviors)
- **659945f** — privacy hardening: `users_memory.training_opt_out` BOOLEAN + /settings + SettingsClient (opt-out toggle, delete-my-data) + /api/settings + /api/delete-account; chat-route gate skips logChatTurn when opt-out (safety_events + context_summary still fire); /privacy rewritten (founder-human-review + 180-day chat_logs retention + voice policy); footer Settings link; 180-day auto-purge pg_cron via founder SQL paste; aligned w/ ChatGPT/Pi/Gemini/AstroTalk patterns
- **45b315c** — Settings gear icon in chat header (single ChatUI.tsx edit; fixes /settings discoverability; parity AstroTalk/AstroSage/GaneshaSpeaks)
- **c21c442** — §9 VULNERABLE DISCLOSURE TRIGGER (after vulnerability disclosure, next reply MUST NOT end with a question; reflection/affirmation/image/self-disclosure/open-thread only; fires INDEPENDENTLY of §9 ABSOLUTE QUESTION-ENDING CAP — frequency vs timing; anti-example: Wave 2 Khushi transcript 2026-05-13 15:26:22 trust-erosion → ~2h disengagement)
- **8903f48** — verse-card 25-word floor (buildResponseVerses returns [] for <25-word replies, both streaming meta-frame + non-streaming JSON; fixes 5-cards-on-2-word-reply bug) + mobile Enter (onKeyDown branches on `window.matchMedia('(pointer: coarse)')` — mobile Enter=newline/Send=submit; desktop Enter=submit/Shift+Enter=newline); both from real screenshots
- **d06984d** — STT vendor + architecture rewrite: Gemini 2.5 Flash audio → Sarvam Saaras V3 REST (6.95% WER Hindi vs Gemini ~75-80%); chunked REST per VAD utterance via Promise queue (Vercel can't host WebSocket); @ricky0123/vad-web Silero v5 ONNX from public/vad/ (~17 MB committed: silero_vad_v5.onnx + silero_vad_legacy.onnx + vad.worklet.bundle.min.js + ort-wasm-simd-threaded.{mjs,wasm}); WAV PCM16 16kHz mono; 30s cap removed; 5s session-end silence auto-stop; 60s SAFETY_CAP_MS outer bound; Web Speech preview removed; SARVAM_API_KEY server-only; IME composition guards; /privacy STT disclosure updated (Indian residency, DPDP-friendly); Vercel env-var-without-redeploy gotcha (→ 500, fix: redeploy)
- **196eba8** — Path C model-attested verse references: src/lib/verses.ts `attestVerseReferences` post-stream Haiku 4.5 audits which top-5 retrieved verses Krishna actually used; buildResponseVerses filters to attested + 25-word floor; LAST-valid-JSON parser; silent-fail returns FULL pool (never empty); telemetry `[chat] verse attestation: retrieved=5 attested=2 reply_words=87`; cost ~$0.0003/turn ≈ ₹870/mo @1000 turns/day; +~500ms on meta frame (user-perceived unchanged); smoke confirmed correct empty-card on §4.5 PARALLEL-MAPPING entities not in pool
- **5d6db73** — mic error UX chip (5 modes: permission_denied / no_hardware / unsupported_browser / vad_load_failed / transcription_failed; sacred/brass-deep border, no bright red; 8s auto-dismiss; 44×44 × button; source: founder's brother hit silent failure on denied permission)
- **c5725d3** — i18n simplification: /settings + /privacy + /terms + footer links English-only (Indian SaaS standard AstroTalk/Zerodha/Razorpay); Krishna chat voice + chat-surface chips UNCHANGED; /terms IP section retains BRAND.name.hi; net -95 lines across 4 files
- Persona ~16,465 → ~17,100 tokens (rolling char-estimate) after §9 VULNERABLE DISCLOSURE TRIGGER; real pre-restructure countTokens = ~24,813
- **Architectural findings:** (a) Sarvam supports WebSocket but Vercel serverless cannot host WebSocket (Vercel KB + Ably/Rivet) — chunked REST per VAD utterance is the Vercel-fit; (b) Path C correctly returns empty card sets when Sonnet draws on §4.5 PARALLEL-MAPPING (Devakī/Gandhārī/Mausala) not in RAG pool — correct attribution, not a bug → Phase 8.x Path B backlog; (c) Vercel env-var changes don't auto-deploy — redeploy required (caught in Sarvam smoke)
- **Founder decisions:** Sarvam over Google Cloud STT v2 (10× cheaper at scale, better Hindi, DPDP-friendly Indian residency); chunked REST over WebSocket-relay (Vercel constraint); Path C over Path A (cosine) / Path B (pattern) (most accurate, no persona change); dual-vendor EN/HI STT routing DECLINED as premature optimization (Sarvam wins all 3 modes); XML restructure + compression SHIPPED Phase 8.x as one combined refactor (15-25% reduction target abandoned mid-pass — deep XML overhead made net reduction infeasible without content deletion → "keep full structure, drop the number"); English-only admin/legal pages (Indian SaaS standard); real-time-data advisor discipline rule added to CLAUDE.md at founder's explicit request

### Phase 8.x — Persona XML + voice + Path B (CLOSED 2026-05-16)
- **1254a27** — persona XML restructure: full deep XML of src/lib/systemPrompt.ts (16 top-level semantic elements, 103 element pairs, max nesting depth 4; 5 Krishna modes nested under `<personas><modes>`; § markers preserved inline as first-line headings so CLAUDE.md/PROJECT_HISTORY.md/decisions.md cross-refs stay valid) + multishot wrap of 18 GOOD/BAD example pairs in `<examples>/<example>` + 4 compression consolidations via cross-refs (§3 LANGUAGE restatements, §4.6 closure-benediction → §10, §9 question-cap shape-list, §9 sakhya-mode-extension) + 2 softer→absolute promotions (§4 acknowledge-then-challenge per Locked Decision #6, §9 reflection-before-question per Phase 7.0 conversation-craft). Token **24,813 → 25,362 (+2.2%, +549)**; full-deep-XML + zero-deletion + 15-25%-reduction triad jointly infeasible (XML tags ~1,000+ tokens; ═══ ASCII dividers near-free under BPE) → "keep full structure, drop the number" (research doc's primary value — XML parsing reliability + multishot adherence + consistency — delivered, ~+2% accepted). Verification: npm run build PASSED; npm run test:prompt 82/83 substantive (#46 refusal_sexual gated by Phase 7.0 hybrid moderation); all 10 invariants mapped+preserved; §10 banned phrases byte-identical (**SHA256 f70fc2e7…b7f411c**, 121 quoted + 17 ❌/✅, original order); "1896 trailing NUL bytes" Windows artifact did not exist (0 NULs verified). Plan: docs/persona-xml-restructure-plan.md. (Doc close-out: **136dff5**.)
- **4c72d3a** — Path B post-generation entity-based verse retrieval (29 canonical entities, ≤2 verses/entity, runs parallel w/ Path C; card-rate **81.7% → 87.8%**)
- **8a4c72b** — persona voice additions + Gottlieb refinements: two new `<voice>` (§3) elements — `<here_and_now_awareness>` (Yalom here-and-now applied to scriptural persona, frequency-capped; in-character not imported clinical technique) + `<voice_qualities>` (soft-anchor self-check merging Bhakti-rasāmṛta-sindhu 64-qualities + Brooks' illuminator stance from *How to Know a Person* — six qualities: active curiosity, affection, generosity, holistic attitude, receptivity, tenderness); §9 PLAYFUL TEASE wit-grounding line (humor w/ shared humanity, never at user's expense); §4.7 SUGGESTION MODE new `<insight_vs_action>` sibling after `<and_stance>` (insight in one turn, action across many; Gita 3.36). Research basis docs/conversation-engagement-research.md (9-book synthesis — Brooks/Yalom/Easwaran/Carnegie/Nouwen/Gottlieb/Cron/Suleyman-Pi/Brown). Token **25,362 → 26,327 (+965, +3.8%, real countTokens)**; all 10 invariants preserved; §10 SHA256 byte-identical
- **c4ee359** — Phase 8.x docs close-out (persona voice + Gottlieb doc updates)

### Phase 8.x backlog cleanup (Session 2026-05-16)
- **b4b37ae** — next 16.2.4 → 16.2.6 (HIGH SSRF 8.6 GHSA-c4j6-fc7j-m34r + middleware-bypass 8.1 GHSA-492v-c6pp-mqqv) + @anthropic-ai/sdk 0.91.0 → 0.91.1; build PASS, test:prompt 82/83 (baseline)
- **e0c3d90** — removed unused silero_vad_legacy.onnx (~1.8 MB; vad-web `model:"v5"` only, no fallback codepath verified)
- **0a0cbae** — scripts/count-system-prompt-tokens.ts rewritten to measure persona via `messages.countTokens` (drops Phase 1.7 cache probe); added `npm run count:tokens` (measured 26,314 persona-only, 0.05% off the 26,327 reference)
- **8bb373b** — CLAUDE.md status section structural rewrite
- **Accepted residual:** postcss@8.4.31 bundled by Next (XSS via unescaped `</style>`, GHSA-qx2v-qp2m-jg93, CVSS 6.1) — transitive-only, not on app's request path, only npm "fix" is a Next downgrade. Monitor for upstream Next patch
- onnxruntime-web: install-time advisories cleared upstream — no action
- Resolved this session (formerly open backlog): count-tokens script (0a0cbae), VAD bundle trim (e0c3d90), onnxruntime-web npm-audit (b4b37ae + cleared upstream)

### Open backlog (Phase 8.x or later)
- PROJECT_HISTORY.md Phase 7 carry-forwards stale-item cleanup (STT-via-Web-Speech entry obsolete after d06984d)
- Sarvam error toast UX polish (currently logs `[chat] transcription chunk failed:` + transcription_failed chip; polish if beta data shows non-trivial Sarvam error rates)
- Path B follow-on: entity-coverage expansion if user-data shows Sonnet referencing entities outside the 29-canonical set
- Persona token-budget monitoring at **26,327** — dedicated compression pass deferred until persona grows further (would need explicit authorization to reword verbose explanatory prose / anti-example narrations while preserving every rule + every GOOD/BAD example)

### NEXT: Phase 8 public launch
Technical advisor side substantially complete — see [`PROJECT_HISTORY.md`](PROJECT_HISTORY.md) "Phase 7.0 — Persona iteration cycle" + "Phase 8.0 — Launch prep cycle" + "Phase 7 carry-forwards" + "Phase 8 launch-prep checklist". Remaining items in founder's lane:
- Razorpay KYC Limited → Full Access flip (depends on Razorpay support)
- Hostinger grievance@divyavani.co.in mailbox setup
- PhonePe deeplink Razorpay support ticket
- Plausible analytics signup + script-tag install
- og-image final
- Lawyer review of /privacy + /terms + /settings (founder's own counsel)
- Final smoke test on production

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

> **DIRECTION REVERSED — Phase 8 (2026-05-17), founder-approved.** The project moved from the Phase 2.5 *editorial-traditional parchment/brass* direction to **cinematic-dark temple-aarti**, implemented from a Claude Design handoff. The six principles below now describe the CURRENT locked direction. (Rationale + decision log: [`docs/decisions.md`](docs/decisions.md).)

1. **Commit to a BOLD aesthetic direction.** Divya Vani's direction is *cinematic-dark temple-aarti* — deep ink ground (`#050505`/`#0a0a0d`), gold leaf (`#d4a24a`), warm ivory text (`#efe6d1`), with the founder's Krishna image as a vignetted atmospheric background (masked-to-black ellipse + outer vignette + warm wash + faint film grain) on every page. Every UI choice serves this direction; no SaaS conventions, no AI-default aesthetics.
2. **Typography:** Marcellus (English display / wordmark / UI labels) + Cormorant Garamond *italic* (English body) + Tiro Devanagari Hindi (ALL Devanagari). Hindi-first, English as secondary italic. NEVER introduce Inter / Roboto / Arial / Space Grotesk / system fonts / Noto Sans Devanagari (retired).
3. **Color:** semantic CSS variables in `src/app/globals.css`. The Phase 2.5 token NAMES (`--devotional` `--sacred` `--krishna` `--brass` `--parchment` `--peacock` + `*-dark`) are deliberately KEPT and REMAPPED to the dark palette so components reskin globally — do not reintroduce light values. New direct tokens for redesign surfaces: `--ink0..3`, `--gold` / `--gold-dim` / `--gold-mute` / `--gold-faint`, `--ivory`, `--red-seal`. Dominant ink + sparing gold/ivory; full-saturation gold is for lines/fills/large-display only, NOT body text (use `*-dark`/ivory/light-gold for AA text on the dark ground — the inverted form of the old parchment rule).
4. **Motion:** CSS-only (no Motion library). High-impact moments over scattered micro-interactions. Keyframes: `fade-up`, `sonar`/`sonar-ring`, `dv-drift`, `dv-pulse`. Stagger via `[animation-delay:Xms] [animation-fill-mode:backwards]`.
5. **Spatial:** asymmetry, overlap, generous negative space OR controlled density; at least one asymmetric grace note per page (e.g. the landing dharma-wheel seal).
6. **Atmosphere:** the `Atmosphere` component (`src/app/components/Atmosphere.tsx`, modes `hero`/`chat`/`corner`/`deep`/`mobile`/`distant`) is the z-0 ground on every page — Krishna vignette + outer vignette + warm wash + film grain + backdrop-blur glass surfaces. NEVER ship a flat untextured background; NEVER place the disclaimer/identity layer where the vignette reduces its legibility (Locked Decision #1).

**Banned across the project** (per skill + project brand): Inter / Roboto / Arial / system-ui / Space Grotesk / Noto Sans Devanagari fonts, purple-on-white gradients, generic SaaS card grids, carousels without narrative, flat untextured backgrounds, light/parchment surfaces (the Phase 2.5 palette is retired), full-saturation gold as body text.

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

### Claude advisor invariants — DO NOT BREAK

- **Claude's training data has a cutoff (end of May 2025 for the current model).** Today is well past that. The AI/tech/regulatory landscape has moved 12+ months since cutoff. Claude MUST web-search before stating as fact anything that could have changed:
  - Current features, pricing, or policies of comparable products (ChatGPT, Pi, Gemini, AstroTalk, Razorpay, Vercel, Anthropic, Supabase, etc.)
  - Current regulations and case law (DPDP Act amendments, DPDP Rules 2025, IT Act rulings, Consumer Protection Act, RBI rules, specific court decisions, Bombay HC rulings on AI chatbots, etc.)
  - Current versions of libraries / frameworks (Next.js, Tailwind, Anthropic SDK, Supabase client, Razorpay SDK, Gemini SDK).
  - Specific dates, rulings, citations, market figures, app store rankings, employee/user counts.
  - Pricing of any third-party service or API.
- **Claude MAY use training data for:** established methodology (psychology frameworks like Rogers / MI / NVC, conversation craft, classical texts), general programming concepts that haven't changed in years, project-specific context (the codebase, persona file, project history, beta transcripts — all of which the founder has provided in-session), scriptural content (Gita / Mahabharata / Bhagavata — established and unchanging).
- **When uncertain whether something is current, search.** Cost of one unnecessary tool call is trivial. Cost of stale advice is concrete bad decisions on Phase 8 launch.
- **If Claude cannot verify a factual claim, state that explicitly** — "I'm not sure if X is still current; let me search" — rather than asserting confidently from training data.
- **Anticipate edge cases proactively. The founder is a solo founder relying on Claude for technical depth.** Implementing exactly what was asked without anticipating failure modes is a quality miss. For every feature or fix, Claude must mentally enumerate edge cases: boundary values (0, max, negative, very large); empty/null states; error paths (network failure, permission denied, API 4xx/5xx, malformed response); race conditions (concurrent state updates, atomicity); interaction with existing features (what could regress); mobile vs desktop divergence; permission states; first-use vs returning-user; failure-during-action (network drop mid-purchase, browser reload mid-stream, etc.). Ask: *"If I were trying to break this feature, what would I do?"* Then:
  - **In CC prompts:** surface the relevant edge cases as explicit constraints in an "EDGE CASES TO HANDLE" section so CC implements them. CC writes the handling code; the founder never has to track them.
  - **In replies to the founder:** do NOT dump the full edge-case list. Surface only what is the founder's decision to make (cost, commitment, plan tier, product trade-off). Implementation details and follow-up actions stay internal — Claude either handles them inline or drafts a separate CC prompt. The founder should never have to memorize a 7-point list of edge cases per reply.
- **These advisor invariants were added at the founder's explicit request after specific production miss patterns.** The training-data rule was added 2026-05-13 after multiple sessions of stale training-data-based assertions. The edge-cases rule was added 2026-05-15 after a counter-display bug surfaced in production that should have been anticipated when the seva flow was originally built. Both rules are not optional. Across every Cowork session, every Claude Code pass, and every advisor exchange, these disciplines hold.

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
