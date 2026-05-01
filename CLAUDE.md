@AGENTS.md
"see docs/decisions.md for canonical list."
# Krishna AI

> AI-roleplay app. Users chat with a Krishna persona grounded in scripture (Gita, Mahabharata, Bhagavata Purana). Hindi-first, mobile-first, calm tone. Single-user, anonymous-by-default.

This file is the canonical project context. Read this first in every session before changing any code.

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
  - Embeddings: Gemini `gemini-embedding-001` (called with `outputDimensionality: 768` to match the `vector(768)` column; `taskType: RETRIEVAL_DOCUMENT` for ingest, `RETRIEVAL_QUERY` for search)
- **Hosting:** local dev currently; Vercel target (Phase 6+).

---

## Locked product decisions — DO NOT VIOLATE

These are foundation decisions. Do not propose alternatives unless the founder explicitly asks.

1. **Identity:** AI roleplays Krishna. NEVER claims to be the actual divine Krishna. Permanent visible disclaimer bar near the avatar.
2. **Krishnas in scope:** All five — Gita, Mahabharata, Bhagavata, Vrindavan, Bal. Build order: Gita first, then Mahabharata, then Bhagavata/Vrindavan/Bal.
3. **User name:** Krishna addresses the user by their actual name. Asked organically in his first reply ("किस नाम से पुकारूँ?"). User addresses Krishna with any respectful name (Krishna, Kanha, Madhav, Govind, Murari, etc.) — accept all.
4. **Question scope:** Medium — personal, emotional, life questions handled through dharma framing.
5. **Modern context handling (Option C):** NEVER name modern things in Krishna's replies (Instagram, boyfriend, phone, college, job, app). Translate to underlying feeling. Example: "my boyfriend ghosted me" becomes a reply about absence, longing, attachment — never about boyfriends or phones.
6. **Tone (Option C with acknowledge-first guardrail):** Krishna is direct and challenging when appropriate, but ALWAYS acknowledges the feeling first. NEVER leads with challenge. The Gita pattern: spill in chapter 1, speak plainly in chapter 2. Mirror that.
7. **Self-harm and harm-others handling:** Krishna stays in compassionate character. The system layer adds a separate non-Krishna helpline card alongside the reply. Krishna himself never adds helplines and never breaks character.
8. **Bad-word handling:** Text input has a client-side filter; banned words cannot be submitted. Krishna himself never engages with inappropriate content.
9. **Voice / video:** NOT in v1. Text-only. Hindi one-way TTS arrives Phase 10 inside the Krishna Voice tier (₹999/mo); async voice messaging Phase 12; real-time voice call Phase 13 (Krishna Premium ₹2,999/mo). Animated / lip-synced AI video avatars and real-time video calling are explicitly NEVER planned — see "Post-launch pricing ladder" for full rationale.
10. **Verse citations:** Inline natural mention in Krishna's reply ("as I told Arjuna long ago...") + expandable card showing Sanskrit + Hindi + English. UI surfaces the reference number, not Krishna.
11. **Pricing (v1):** Pay-as-you-go only. Razorpay one-time UPI checkout — Razorpay Subscriptions module is NOT integrated in v1. Free tier: 10 messages, no expiry. Four one-time seva tiers — Pratham Seva ₹11 / 6 msg, Anjali Seva ₹51 / 30 msg, Bhakti Seva ₹101 / 60 msg, Param Seva ₹501 / 350 msg. All tiers profitable standalone (margins 34–49% after Razorpay 2.36% fees and ~₹0.92/msg API cost). No loss-leaders, no subsidy logic, no time-based unlimited. Subscriptions arrive Phase 9 — see "Post-launch pricing ladder."
12. **Languages:** Hindi-first, English supported equally, Sanskrit accepted. Krishna replies in whichever language the user wrote in: Hindi → Hindi, English → English. Sanskrit input is met with quoted Gita/Mahabharata scripture + a brief Hindi explanation — Krishna does NOT generate original Sanskrit prose. Verse cards always show Sanskrit + transliteration + Hindi + English regardless of reply language. Sanskrit input is expected to be rare in practice; the code path stays open but optimization effort goes to Hindi/English.
13. **Refusals:** Sexual content, instructions to harm others, anything illegal under Indian law. Refuse in-character with grace; never lecture.

---

## Post-launch pricing ladder

Forward-looking. DO NOT IMPLEMENT until the corresponding phase ships. Each tier is a feature gate scheduled month-by-month after v1 launch + beta data.

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

**NEVER planned (do not add):**
- **Animated / lip-synced AI video avatar.** Cost ₹50–300/min/user, financial trap.
- **Real-time video calling.** Cost ₹200–600/min, unviable for solo-founder economics.

---

## File structure

```
src/
├── app/
│   ├── layout.tsx                  Body uses h-dvh + bg-linear-to-b gradient,
│   │                               suppressHydrationWarning for Grammarly
│   ├── page.tsx                    Landing page (Hindi headline + "शुरू करें"
│   │                               CTA -> /chat)
│   ├── globals.css                 Tailwind + fade-up keyframe
│   ├── chat/page.tsx               Renders <ChatUI />
│   ├── components/
│   │   └── ChatUI.tsx              Main chat client (header, messages,
│   │                               onboarding cards, paywall, input,
│   │                               verse cards, safety cards)
│   └── api/
│       ├── chat/route.ts           Main POST endpoint
│       ├── seva/
│       │   ├── create-order/route.ts   Razorpay order creation (Phase 5+)
│       │   └── verify/route.ts         Razorpay signature verify (Phase 5+)
│       ├── auth/
│       │   ├── send-otp/route.ts       (Phase 5+)
│       │   └── verify-otp/route.ts     (Phase 5+)
│       └── onboarding-state/route.ts
└── lib/
    ├── systemPrompt.ts             Krishna persona prompt (rewritten Phase 3)
    ├── messages.ts                 Message + VerseCitation + SafetyCard types
    ├── supabase.ts                 Client + saveMemory, fetchMemory, etc.
    ├── verses.ts                   searchVerses(query, k) — server-only
    └── badWordFilter.ts            Client-side input filter (Phase 4+)

scripts/                            (project root, not under src/)
├── ingest-gita.ts                  Embed Gita verses into Supabase (Phase 1).
│                                   npm run ingest:gita / ingest:gita:dry
├── regenerate-hindi.ts             Regenerate Gita Hindi via Sonnet 4.6 + v3
│                                   prompt (Phase 1 license remediation,
│                                   2026-04-28). npm run regen:hindi(:dry).
├── parse-mahabharata.ts            Parse Ganguli English MBh into chunks
│                                   (Phase 1.5 parser, 1,844 chunks emitted).
├── run-mahabharata-corpus.ts       Driver: runs parse across all 23
│                                   curated parva-section ranges.
├── regenerate-hindi-mahabharata.ts Regenerate MBh Hindi via Sonnet 4.6 + v3
│                                   + prose addendum, concurrency 3,
│                                   resume-safe (Phase 1.5).
│                                   npm run regen:hindi:mahabharata(:dry).
├── fix-em-dash-endings.ts          Phase 1.5 post-process: merges pairs
│                                   where chunk N ends in em-dash and chunk
│                                   N+1 continues the sentence; strips
│                                   trailing translator footnotes (— टी.).
│                                   Reduced 1,844 → 1,704 chunks.
├── ingest-mahabharata.ts           Embed cleaned MBh chunks into Supabase
│                                   (Phase 1.5). Retry-on-429 + 500ms
│                                   inter-call delay + cost tracking.
│                                   npm run ingest:mahabharata(:dry).
├── parse-bhagavata.ts              Parse Sanyal English Bhagavata Canto 10
│                                   into chunks (Phase 1.6 parser, 633
│                                   chunks emitted across all 90 chapters).
│                                   Paragraph-batched; emits both anchored
│                                   (`bhagavata_10.<ch>.<verseStart>`, dot)
│                                   and fallback (`bhagavata_10.<ch>_<N>`,
│                                   underscore) reference forms based on
│                                   whether Sanyal's "(N—M)" parenthetical
│                                   survived OCR. npm run parse:bhagavata.
├── regenerate-hindi-bhagavata.ts   Regenerate Bhagavata Hindi via Sonnet 4.6
│                                   + v3 + Bhagavata addendum v1.1 (the
│                                   `SYSTEM_PROMPT` constant in that file
│                                   is the canonical addendum source-of-
│                                   truth; line number drifts with refactors,
│                                   so reference by symbol not line).
│                                   Same concurrency/retry/consistency-check
│                                   skeleton as MBh regen, MAX_TOKENS=1800.
│                                   npm run regen:hindi:bhagavata(:dry).
├── fix-em-dash-endings-bhagavata.ts  Phase 1.6 post-process: merges 63
│                                   sentence-bisect pairs at chapter
│                                   boundaries (vs MB's parva boundaries).
│                                   Reduced 633 → 568 chunks.
│                                   npm run fix:bhagavata-em-dash(:dry).
├── ingest-bhagavata.ts             Embed cleaned Bhagavata chunks into
│                                   Supabase (Phase 1.6). Same retry coverage
│                                   + pagination loop as MBh ingest.
│                                   Schema-invariant validation: every chunk
│                                   has exactly one of verseStart /
│                                   fallbackChunkN non-null.
│                                   npm run ingest:bhagavata(:dry).
├── bhagavata-addendum-test.ts      Reusable addendum pressure-test driver
│                                   (Phase 1.6 baseline run produced
│                                   test-results/phase1.6-pressure-test-
│                                   2026-05-01.md). Edit SYSTEM_PROMPT,
│                                   passages array, OUTPUT_PATH for
│                                   future addendum tweaks (Phase 1.7+).
│                                   NOT in package.json.
├── test-search.ts                  10-query verse retrieval test (Phase 1).
│                                   npm run test:search
└── test-prompt.ts                  Run system prompt against test queries
                                    (Phase 3)

data/                               (project root, not under src/)
├── gita.json                       701-verse Gita corpus (Sanskrit +
│                                   regenerated Hindi + Sivananda English).
│                                   ~730 KB, committed.
│                                   See "Phase 1 corpus sources" below.
├── mahabharata.json                Phase 1.5 parser output: 1,844 chunks
│                                   (English + chunkN/wordCount/warnings,
│                                   no Hindi yet). Preserved as parse
│                                   baseline.
├── mahabharata-regenerated.json    1,844 chunks with regenerated Hindi.
│                                   Output of regenerate-hindi-mahabharata.ts
│                                   (~₹2,714 total Sonnet 4.6 spend).
│                                   Preserved as backup.
├── mahabharata-regenerated-cleaned.json
│                                   1,704 chunks after em-dash post-process
│                                   merge (138 sentence-bisect pairs joined,
│                                   2 translator footnotes stripped). This
│                                   is the file ingested into Supabase.
├── mahabharata-raw/                Source ground truth for the MBh parser:
│                                   ganguli/ (Roy/Ganguli English, archive
│                                   .org PD plain-text, 12 vols),
│                                   sanskrit-bori/ (BORI critical edition,
│                                   deferred to Phase 9+ audit),
│                                   sanskrit-kumbakonam/ (Southern recension,
│                                   not used in v1).
├── bhagavata.json                  Phase 1.6 parser output: 633 chunks
│                                   across all 90 chapters of Canto 10
│                                   (English + canto/chapter/verseStart/
│                                   verseEnd/fallbackChunkN/wordCount/
│                                   warnings, no Hindi yet). Preserved
│                                   as parse baseline.
├── bhagavata-regenerated.json      633 chunks with regenerated Hindi.
│                                   Output of regenerate-hindi-bhagavata.ts
│                                   (~₹897.53 total Sonnet 4.6 spend).
│                                   Preserved as backup before em-dash
│                                   cleanup.
├── bhagavata-regenerated-cleaned.json
│                                   568 chunks after em-dash post-process
│                                   merge (63 sentence-bisect pairs joined).
│                                   This is the Canto 10 file ingested into
│                                   Supabase.
├── bhagavata-canto11.json          Phase 1.7 parser output: 162 chunks
│                                   across 24 chapters of Canto 11 (Sanyal
│                                   VI–XXIX = std 11.6–29 Uddhava-Gita).
│                                   Canto field=11. 82.1% anchored vs
│                                   17.9% fallback — denser parenthetical
│                                   labeling than Canto 10's 69.2%.
│                                   Preserved as parse baseline.
├── bhagavata-canto11-regenerated.json
│                                   162 chunks with regenerated Hindi.
│                                   Output of regenerate-hindi-bhagavata.ts
│                                   --canto=11 (₹231.18 Sonnet 4.6 spend).
│                                   Preserved as backup before em-dash
│                                   cleanup.
├── bhagavata-canto11-regenerated-cleaned.json
│                                   159 chunks after em-dash post-process
│                                   merge (3 pairs joined, all resolved
│                                   cleanly to terminal). This is the file
│                                   ingested into Supabase as Canto 11.
└── bhagavata-raw/                  Sanyal Vol 4 + Vol 5 djvu_txt — gitignored
                                    (CC0 archive.org sources, ~600–760 KB
                                    each, re-fetchable via curl per the
                                    "Phase 1.6 corpus sources" section
                                    below). Vol 3 also stored locally for
                                    future Bhagavata expansion (Books 7–9,
                                    NOT Canto 10/11, do not use for Phase
                                    1.6 / 1.7). Vol 5 BOOK XI body slice
                                    (lines 7448–14174) is the Canto 11
                                    source for Phase 1.7.

docs/
├── build-roadmap.md                14-week phase plan
├── decisions.md                    Locked decisions verbatim
├── phase-prompts.md                Per-phase Claude Code prompts
├── build-session-prompt.md         Cowork build-session template
└── community-session-prompt.md     Cowork community-session template

.env.local (gitignored):
  ANTHROPIC_API_KEY
  GEMINI_API_KEY
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  RAZORPAY_KEY_ID                   (Phase 5+)
  RAZORPAY_KEY_SECRET               (Phase 5+)
  RAZORPAY_WEBHOOK_SECRET           (Phase 5+)
  SENTRY_DSN                        (Phase 6+)
  PLAUSIBLE_DOMAIN                  (Phase 6+)
```

---

## Phase 1 corpus sources

- **Sanskrit:** github.com/gita/gita (verse text only — millennia-old PD; mechanical encoding low copyright bar)
- **English:** Swami Sivananda translation via github.com/gita/gita (PD in India under life+60 rule; Sivananda d. 1963)
- **Hindi:** regenerated via Claude Sonnet 4.6 from Sanskrit + English on 2026-04-28 using v3 system prompt (modern Hindi with scriptural dignity, classical Devanagari conjuncts). Original Tejomayananda translation dropped due to active copyright.

---

## Phase 1.5 corpus sources

- **English:** Kisari Mohan Ganguli / Pratap Chandra Roy translation (1883–1896, PD worldwide), via 12-volume plain-text edition on archive.org.
- **Hindi:** regenerated 2026-04-30 via Claude Sonnet 4.6 from English using v3 system prompt + Mahabharata prose addendum ("Sanskrit may be partial or absent; translate based on English; preserve Sanskrit philosophical terms"). Total Sonnet spend ₹2,714 across 1,844 chunks.
- **Sanskrit:** intentionally **NOT attached** at this phase. BORI critical edition was downloaded but deferred per `docs/decisions.md` 2026-04-29 decision. All MBh rows in `verses` have `sanskrit = ''` and `sanskrit_source = NULL`. Sanskrit alignment is a Phase 9+ audit.
- **Curation:** 13 parvas across 23 curated section ranges per `docs/decisions.md` 2026-04-29 audit (rounds 1 + 2). Excludes Sauptika 1–12 (massacre prose, no Krishna), Adi pre-218 (background mythology), Anushasana / Ashramavasika / Mahaprasthanika / Svargarohanika.
- **Post-process:** `fix-em-dash-endings.ts` merged 138 sentence-bisected pairs (chunker artefact at original Ganguli line endings), reducing 1,844 → 1,704 chunks. 18 mid-word/ellipsis truncation chunks remain — deferred to Phase 2 RAG retuning or future parser improvements.

---

## Phase 1.6 corpus sources

- **English:** J. M. Sanyal *Srimad-Bhagavatam* (Calcutta 1929–34, PD), via Sarayu Foundation / UP State Museum CC0 archive.org scans — Vol 4 (`eszb_…`, Canto 10 chs 1–61) + Vol 5 (`qpbw_…`, Canto 10 chs 62–90). djvu_txt URL pattern matches Phase 1.5 (`archive.org/stream/<id>/<id>_djvu.txt`).
- **Hindi:** regenerated 2026-05-01 via Claude Sonnet 4.6 from English using v3 system prompt + **Bhagavata addendum v1.1** (3 bullets: Sanskrit-absent caveat + lyrical/devotional voice rule + glossary lock with गोप uniform, names through सुदामा, no राधा pending Phase 9+). Canonical addendum text lives in the `SYSTEM_PROMPT` constant of `scripts/regenerate-hindi-bhagavata.ts` (reference by symbol, not line — line numbers drift with refactors). Total Sonnet spend ₹897.53 across 633 chunks (40% under estimate; 0% cache hit rate — falsified Phase 1.7 by `messages.countTokens` showing 1,317 > 1,024 minimum).
- **Sanskrit:** intentionally **NOT attached** at this phase (mirrors Phase 1.5 BORI deferral). All Bhagavata rows in `verses` have `sanskrit = ''` and `sanskrit_source = NULL`. Sanskrit alignment is a Phase 9+ audit.
- **Reference scheme:** `bhagavata_10.<chapter>.<verseStart>` anchored (dot separator, when Sanyal's "(N—M)" parenthetical is present, 69.2% of chunks) OR `bhagavata_10.<chapter>_<fallbackChunkN>` fallback (underscore separator, when parenthetical absent or OCR-garbled, 30.8% of chunks). Schema mapping: `chapter` int = chapter-within-canto, `verse_number` int = verseStart (anchored) or fallbackChunkN (fallback).
- **Post-process:** `fix-em-dash-endings-bhagavata.ts` merged 63 sentence-bisected pairs (62 cleanly resolved, 1 deep chain + 2 oversize merges flagged for review), reducing 633 → 568 chunks. OCR fix patterns baked into the parser: leading-digit 8→3 gate (handles Sanyal 3↔8 misread), inline parenthetical fallback (recovers OCR-merged paragraphs), tilde separator on verse-range parentheticals.
- **Quality gate:** 20/20 spot-check PASS + 3/5 retrieval coverage (queries 3 + 4 deferred to Phase 2 corpus-balance retuning, same precedent as Phase 1.5 anger-query carry-forward).

---

## Phase 1.7 corpus sources

- **English:** J. M. Sanyal *Srimad-Bhagavatam* Vol 5 only (`qpbw_…` Sarayu/UP-Museum CC0 archive.org scan; same edition + license-fallback chain as Phase 1.6). Vol 5 BOOK XI body slice (lines 7448–14174 inclusive) covers all 31 chapters of Sanyal Book XI = standard Canto 11. Phase 1.7 scope is Sanyal chs 6–29 (`--chapters=6-29` filter): the Uddhava-Gita arc — Krishna's Yadu farewell + Devas hymn at Dwaraka (chs 6–7), avadhūta-Brahmana / 24-gurus (chs 7–9), philosophical conclusions (chs 11–13), didactic yoga / four-orders / vibhūti / vānaprastha (chs 14–21), theoretical guṇas + tattva-enumeration (chs 22–25), devotional climax + ritual worship + final teaching (chs 26–29). Sanyal chs 1–5 (Yadu curse + Nimi-Yogendras prelude) and chs 30–31 (Mausala + Krishna's departure) intentionally excluded — narrative bookends, not Uddhava-frame teaching.
- **Sanyal-vs-standard chapter alignment:** Sanyal Book XI = standard Canto 11 — **1:1 chapter count (both 31 chapters), 1:1 alignment verified at Sanyal Ch VI = std 11.6 boundary** (Devas-at-Dwaraka opening). Per-chapter content audit for chs 7–29 deferred to Phase 9+ Sanskrit-attachment milestone.
- **Hindi:** regenerated 2026-05-02 via Claude Sonnet 4.6 + v3 system prompt + Bhagavata addendum v1.1 (locked permanent — no v1.2 needed; canonical addendum text remains the SYSTEM_PROMPT constant in `scripts/regenerate-hindi-bhagavata.ts`). v1.1's "Canto 10 voice is lyrical" framing was tested explicitly against Phase 1.7's didactic / theoretical / philosophical content via the dry-run register-validation pass; the model takes register cues from source text first and does not import inappropriate Vrindavan imagery into philosophical chunks. Confirmed at full scale by 9d Sanskrit-philosophical-term preservation in the 20-chunk spot-check (116 target-term occurrences = 5.8/chunk avg, 0 dilutions). Total Sonnet spend ₹231.18 across 162 chunks (≈₹1.43/chunk, identical to Phase 1.6 baseline).
- **Sanskrit:** intentionally **NOT attached** at this phase (mirrors Phase 1.5 BORI deferral and Phase 1.6 Canto 10). All Phase 1.7 Bhagavata rows have `sanskrit = ''` and `sanskrit_source = NULL`. Sanskrit alignment + per-chapter content audit are a Phase 9+ milestone.
- **Reference scheme:** inherits Phase 1.6: `bhagavata_11.<chapter>.<verseStart>` anchored (dot separator, 82.1% — higher than Canto 10's 69.2% because Sanyal Book XI uses `(N—M)` parentheticals more methodically than Book X) OR `bhagavata_11.<chapter>_<fallbackChunkN>` fallback (underscore separator, 17.9%). Schema mapping unchanged: `chapter` int = chapter-within-canto (here 6–29), `verse_number` int = verseStart (anchored) or fallbackChunkN (fallback), canto info in reference text only.
- **Post-process:** `fix-em-dash-endings-bhagavata.ts --canto11` merged 3 sentence-bisected pairs (all resolved cleanly to terminal punctuation; 0 deep chains, 0 oversize merges, 0 footnote strips), reducing 162 → 159 chunks. Em-dash merger inherits the Phase 1.6 boundary rule (refuse to merge across CHAPTER) and the OCR fix patterns (8→3 leading-digit gate, tilde separator, inline parenthetical fallback) baked into the parser.
- **Quality gate:** 18/20 spot-check PASS + 3/5 retrieval coverage (≥17/20 + ≥3/5 thresholds met; threshold lowered from Phase 1.6's ≥4/5 retrieval because the 159-chunk corpus competes against ~3,200 rows of older content). 2 spot-check FLAGs (`bhagavata_11.22.19`, `bhagavata_11.29_4`) are pre-existing 1.3% non-terminal class — English source truncates mid-clause at parser-induced chunk boundary, em-dash merger only catches dash-terminal cases. Same mechanism as Phase 1.6 residual; not a Phase 1.7 regression. Retrieval queries 3 + 4 (surrender, renunciation) returned 5/5 Gita: structural Gita-compact-verse-cosine-bias carry-forward, defer to Phase 2.
- **Carry-forward to Phase 2 / 9+:**
  - **Phase 2:** structural Gita-compact-verse-cosine-bias on abstract-emotional queries (anger / surrender / renunciation) — same issue surfaced in Phases 1.5 + 1.6 + 1.7. Address via theme tags / query rewriting / source-aware retrieval boost. Also: 2/159 residual non-terminal chunks from parser-truncated English boundaries.
  - **Phase 9+:** **0% cache hit rate confirmed at full scale** (162 calls; 1,317-token SYSTEM_PROMPT verified above the 1,024-token cache minimum via `messages.countTokens`; 3-call sequential probe in `scripts/count-system-prompt-tokens.ts` reproduces 0 cache_creation + 0 cache_read). The Phase 1.6 "below threshold" hypothesis is falsified. Remaining hypotheses: Sonnet-4.6-specific cache eligibility, beta-header drift, API-tier gating, ephemeral-TTL default change. Investigation note at `test-results/phase1.7-cache-investigation.md`. Reopen alongside Sanskrit-attachment milestone when prompt size + cache savings get bigger. Sanyal-vs-standard per-chapter content audit also opens at this milestone.

---

## Supabase schema

### `users_memory` (one row per user)

| column | type | default | purpose |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PK |
| `user_id` | text unique not null | — | Cookie UUID |
| `auth_user_id` | uuid | null | Supabase Auth link (Phase 5+) |
| `user_name` | text | null | Asked in turn 1 (Phase 4+) |
| `main_problem` | text | null | Latest extracted concern |
| `emotion` | text | null | Latest extracted emotion |
| `context_summary` | text | null | Running narrative across turns |
| `last_active_at` | timestamptz | null | Returning-after-gap detection |
| `message_count` | int | 0 | Free-tier counter |
| `seva_balance` | int | 0 | Remaining purchased messages from seva tiers (Phase 5+) |
| `is_first_time` | bool | true | Onboarding flag |
| `verses_referenced` | text[] | `{}` | Verse refs used in last reply (Phase 2+) |
| `updated_at` | timestamptz | `now()` | Generic |

Note: legacy `is_paid` column from God Messenger era is dropped in Phase 5 in favor of `seva_balance` only. No time-based unlimited at v1; subscriptions (Phase 9+) introduce a separate `subscriptions` table rather than adding columns here.

### `verses` (Phase 1+)

| column | type | purpose |
|---|---|---|
| `id` | uuid | PK |
| `source` | text | `'gita'`, `'mahabharata'`, `'bhagavata'` |
| `reference` | text | `'gita_2.47'` |
| `chapter` | int | |
| `verse_number` | int | |
| `sanskrit` | text | |
| `transliteration` | text | |
| `hindi` | text | |
| `english` | text | |
| `themes` | text[] | `['fear','duty','action']` |
| `embedding` | vector(768) | Gemini `gemini-embedding-001` @ outputDimensionality 768 |
| `created_at` | timestamptz | |

Index: `ivfflat` on `embedding` using `vector_cosine_ops`.

**Current row counts (2026-05-02):** 701 gita + 1,704 mahabharata + 727 bhagavata (568 Canto 10 + 159 Canto 11.6–29 Uddhava-Gita) = **3,132 total scriptural rows**. Mahabharata + Bhagavata rows have `sanskrit = ''` and `sanskrit_source = NULL` per Phase 1.5 / 1.6 / 1.7 Sanskrit deferrals.

### `feedback` (Phase 6+)

`message_id`, `user_id`, `rating` (up/down), `text`, `created_at`.

**RLS:** enabled on all tables, no policies (locks anonymous access). Service role bypasses; service role key is server-only.

**Migrations:** manual `ALTER TABLE` via Supabase SQL Editor. No tooling. Schema changes ALWAYS paired with the SQL given to the founder for manual execution.

---

## Identity model

HTTP-only cookie `god_messenger_uid` (UUID, 1 year, secure in production, sameSite="lax"). Per-browser. Generated on first request.

Optional Supabase email-OTP auth (Phase 5+) for cross-device sync. When the user authenticates, `auth_user_id` is linked to the existing cookie row. Future logins resolve cookie OR auth to the same `user_id`.

---

## Chat turn flow

1. Client POSTs to `/api/chat` with `{ message }`.
2. Read cookie `god_messenger_uid` or generate a new UUID.
3. `fetchMemory(userId)` reads: `priorCount`, seva state (`seva_balance`, `unlimited_until`), `isFirstTime`, `priorMemory`, `userName`.
4. **Seva paywall guard:** if `message_count >= 10` (free exhausted) AND `seva_balance == 0`, return seva-paywall reply showing the four tier options, no AI call. Otherwise proceed; the eventual write in step 9 decrements `seva_balance` by 1 when the free pool is already spent.
5. Compute `isReturningUser` (12h+ gap), `isFirstTime`.
6. **Embed user message** via `text-embedding-004` (Phase 2+).
7. **Similarity-search** `verses` table → top 5 (Phase 2+).
8. **Three parallel AI calls:**
   - `extractMemory` (Haiku JSON: `main_problem`, `emotion`, `context_summary`).
   - `safetyClassify` (Haiku JSON: `flag` ∈ `self_harm | harm_others | safe`, `confidence`) — Phase 4+.
   - Final reply (Sonnet, system prompt + USER CONTEXT + RELEVANT SCRIPTURE + safety flag context).
9. `saveMemory` writes extraction + `count+1` + name (if newly captured) + `verses_referenced` + activity. Decrement `seva_balance` if applicable.
10. Return `{ reply, verses, paywall, safety_card }`. Set cookie if new user.

---

## Key invariants — DO NOT BREAK

### Persona invariants (Krishna's behavior)
- **Krishna NEVER breaks character to lecture about being an AI.** If asked directly, briefly acknowledges + continues naturally — does not narrate the return ("anyway", "moving on").
- **Krishna NEVER names modern things** (Instagram, phone, boyfriend, college, job, app). Translates to underlying feeling. (Locked decision #5.)
- **Krishna NEVER speaks chapter:verse numbers** in replies. The UI surfaces them as expandable cards. Krishna references verses by intent ("as I told Arjuna long ago..."). (Locked decision #10.)
- **Krishna NEVER reveals stored memory** ("you said earlier", "I remember", "your emotion is..."). The user feels held, not surveilled.
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

| Phase | Weeks | Goal |
|---|---|---|
| 0 | Day 1 | Decision lock, docs setup |
| 1 | 1–2 | Bhagavad Gita ingestion (701 verses) — **COMPLETE** |
| 1.5 | 3–4 | Mahabharata Krishna sections — 13 parvas, 23 curated ranges, 1,704 chunks — **COMPLETE 2026-04-30** |
| 1.6 | 5–7 | Bhagavata Purana Canto 10 — full 90 chapters, Sanyal CC0, 568 chunks — **COMPLETE 2026-05-01** |
| 1.7 | 7–8 | Bhagavata Purana Canto 11.6–29 — Uddhava Gita, 159 chunks across 24 chapters — **COMPLETE 2026-05-02** |
| 2 (next) | 8–9 | RAG retuning with full corpus + verse-card UI + regression-test all retrieval |
| 3 | 10–11 | Krishna persona prompt iteration with full data; apply held Round 4 edits (mode rotation, Arjuna rate limit, Vrindavan example) |
| 4 | 12 | Safety classifier, helpline cards, name flow, content filter, disclaimer bar |
| 5 | 13 | Razorpay seva integration (pay-as-you-go, 4 tiers) |
| 6 | 14–15 | Mobile QA, Sentry, Plausible, privacy/terms, Vercel deploy |
| 7 | 16–17 | Closed beta with 50 users |
| 8 | 18–19 | Public launch |
| 9+ | Month 4+ post-launch | Subscription tier, voice, additional Bhagavata cantos, Harivamsa, regional Krishna texts (full ladder in "Post-launch pricing ladder" section above) |

Detailed plan in `docs/build-roadmap.md`.

---

## Project history

The repo was originally "God Messenger" — a calm Hindi-first emotional support chat with the framing "Gita-inspired but never claims to be Krishna or any god." That positioning was REPLACED with "AI roleplaying Krishna" (current). Some legacy files may still contain old "presence not advice" language — flag and clean as you encounter them.

Legacy items to audit and migrate:
- `src/lib/systemPrompt.ts` — placeholder until Phase 3 rewrites it for Krishna persona.
- `src/lib/seedResponses.ts` — Hindi tone seeds; some may carry over, some won't.
- `users_memory.is_paid` column — dropped in Phase 5; replaced by `seva_balance`-only model.

---

## Open issues / known caveats

- Personalization is "previous turn → current turn" via `context_summary`, not deep multi-turn history. Acceptable for v1.
- Cookie identity is per-browser; Phase 5 auth addresses this.
- No prompt caching yet. The ~1500-token system prompt is sent in full every request. If volume scales, adding `cache_control: { type: "ephemeral" }` would cut input cost ~10x on cached reads.
- `is_first_time` backfill exists for pre-column rows. Future column adds need similar consideration.