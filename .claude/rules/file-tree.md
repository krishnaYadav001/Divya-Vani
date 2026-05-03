---
paths:
  - "src/**/*"
  - "scripts/**/*"
  - "data/**/*"
---

# File structure

This rule loads when Claude is touching code (src/, scripts/) or corpus data (data/). The CLAUDE.md root has only a one-line pointer here.

```
src/
├── app/
│   ├── layout.tsx                 h-dvh + bg-linear-to-b from-parchment to-parchment/95 (Phase 2.5); registers Geist + Geist_Mono + Cormorant_Garamond + Noto_Sans_Devanagari via next/font/google; suppressHydrationWarning for Grammarly
│   ├── page.tsx                   Landing page — Hindi headline + "शुरू करें" CTA → /chat
│   ├── globals.css                Tailwind v4 @theme inline — Phase 2.5 added 6 semantic color tokens (devotional, sacred, krishna, brass, parchment, peacock) + 2 dark text variants (devotional-dark, brass-dark) + --font-serif/--font-devanagari aliases; fade-up keyframe
│   ├── chat/page.tsx              Renders <ChatUI />
│   ├── design-system/page.tsx     Phase 2.5 reference page — color swatches with WCAG ratings, typography samples, motif catalog, mock verse cards. Public route; not linked from app
│   ├── components/
│   │   ├── ChatUI.tsx             Main chat client. Phase 2.5: <main> landmark, lotus-mandala watermark, peacock-feather header, bansuri input motif, krishna-bg Send button. resolveUserLang() walks back to most recent user message for verse-card label routing
│   │   ├── VerseCard.tsx          Phase 2.5 — extracted from ChatUI. VerseCardList + VerseCard. Renders source-tinted collapsed pill (badge + label) + expanded card with optional Sanskrit panes + empty-Sanskrit footer caveat. Uses formatReferenceLabel + tryParseReference + SOURCE_BADGE_CLASSES
│   │   ├── SevaPaywall.tsx        Razorpay paywall (Phase 5+)
│   │   └── motifs/
│   │       ├── PeacockFeather.tsx Phase 2.5 — next/image wrapping public/krishna-peacock-feather.png. Accepts width/height/priority/title/className. aria-hidden by default
│   │       ├── Bansuri.tsx        Phase 2.5 — inline SVG, transverse 6-finger-hole flute. currentColor + className API
│   │       └── LotusMandala.tsx   Phase 2.5 — inline SVG, 8-petal कमल यंत्र. Used as background watermark at low opacity
│   └── api/
│       ├── chat/route.ts          Main POST endpoint
│       ├── seva/create-order/route.ts   Razorpay order creation (Phase 5+)
│       ├── seva/verify/route.ts         Razorpay signature verify (Phase 5+)
│       ├── auth/send-otp/route.ts       (Phase 5+)
│       ├── auth/verify-otp/route.ts     (Phase 5+)
│       └── onboarding-state/route.ts
└── lib/
    ├── systemPrompt.ts            Krishna persona prompt (rewritten Phase 3)
    ├── messages.ts                Message + VerseCitation + SafetyCard types
    ├── supabase.ts                Client + saveMemory, fetchMemory, etc.
    ├── verses.ts                  Phase 2 retrieval pipeline — fetchCandidates / rerankByTheme / applyDiversityBoost / fetchCandidatesMultiQuery / searchVerses wrapper. Reads RAG_LAYER_* + RAG_THEME_WEIGHT + RAG_CANDIDATES_K + RAG_DIVERSITY_* + RAG_REWRITE_* flags from env. Server-only.
    ├── queryThemes.ts             Phase 2 query-theme classification + LAST-valid-JSON parser. Exports VALID_TAGS / CAUTION_TAGS / QUERY_TAXONOMY_BLOCK / parseThemesFromResponse / filterValidThemes / classifyQueryThemes / rewriteQuery. The chat-route extractMemory piggybacks query-theme classification onto its existing Haiku call (no extra round-trip); standalone classifyQueryThemes is for the regression harness + tests. Server-only.
    ├── badWordFilter.ts           Client-side input filter (Phase 4+)
    ├── referenceParser.ts         Phase 2.5 — parseReference + tryParseReference + formatReferenceLabel (8 label combos: 4 ref formats × hi/en) + parva-name maps for all 13 Phase 1.5 parvas (co-located, single file). Throws on unrecognized input
    ├── detectLang.ts              Phase 2.5 — Devanagari-dominant heuristic (>30% chars in U+0900–U+097F → 'hi'). Used by ChatUI.resolveUserLang for verse-card label routing
    ├── designTokens.ts            Phase 2.5 — typed registry: COLOR_TOKENS (hex + role + WCAG ratings on parchment) + SOURCE_BADGE_CLASSES (sanctioned per-source styles, post-R1 tuning) + SOURCE_BADGE_LABEL (short hi/en + descriptive aria) + TYPOGRAPHY scale + MIN_TOUCH_TARGET_PX + MOTIFS registry. CSS vars are source of truth; this file is the lookup index
    └── __tests__/
        ├── referenceParser.test.ts  37 tests covering all 4 ref formats + 8 label combos + edge cases
        └── detectLang.test.ts       10 tests covering bilingual + edge cases

public/                            (Next.js static asset directory)
└── krishna-peacock-feather.png   Phase 2.5 — 500×500 transparent PNG (71.8 KB). Founder-supplied photographic asset; rendered via next/image in PeacockFeather component (motifs/)

scripts/                           (project root, not under src/)
├── ingest-gita.ts                 Embed Gita verses into Supabase. npm run ingest:gita(:dry).
├── regenerate-hindi.ts            Gita Hindi regen via Sonnet 4.6 + v3 (Phase 1 license remediation 2026-04-28). npm run regen:hindi(:dry).
├── parse-mahabharata.ts           Ganguli English MBh → chunks (Phase 1.5 parser, 1,844 chunks emitted).
├── run-mahabharata-corpus.ts      Driver: parse across 23 curated parva-section ranges.
├── regenerate-hindi-mahabharata.ts MBh Hindi regen via Sonnet 4.6 + v3 + prose addendum, concurrency 3, resume-safe. npm run regen:hindi:mahabharata(:dry).
├── fix-em-dash-endings.ts         Phase 1.5 post-process: merges em-dash sentence-bisects + strips translator footnotes (— टी.). 1,844 → 1,704 chunks.
├── ingest-mahabharata.ts          Embed cleaned MBh chunks. Retry-on-429 + 500ms inter-call delay + cost tracking. npm run ingest:mahabharata(:dry).
├── parse-bhagavata.ts             Sanyal English Bhagavata parser (Phase 1.6+). CLI: --canto=N, --chapters=A-B, --output=path. Emits anchored (`bhagavata_<canto>.<ch>.<verseStart>` dot) or fallback (`bhagavata_<canto>.<ch>_<N>` underscore) refs based on whether Sanyal's "(N—M)" parenthetical survived OCR. Per-canto config map at line ~135. npm run parse:bhagavata.
├── regenerate-hindi-bhagavata.ts  Bhagavata Hindi regen via Sonnet 4.6 + v3 + Bhagavata addendum v1.1. The `SYSTEM_PROMPT` constant in this file is the canonical addendum source-of-truth (reference by symbol, not line — drifts with refactors). MAX_TOKENS=1800. CLI: --input/--output. npm run regen:hindi:bhagavata(:canto11)(:dry).
├── fix-em-dash-endings-bhagavata.ts Phase 1.6+ post-process: merges em-dash bisects at chapter boundaries. CLI: --input/--output. Reduced 633 → 568 (Canto 10), 162 → 159 (Canto 11). npm run fix:bhagavata-em-dash(:canto11)(:dry).
├── ingest-bhagavata.ts            Embed cleaned Bhagavata chunks. Auto-detects canto from input; CANTO_LAST_CHAPTER_BY_CANTO map gates chapter-range validation. Schema invariant: every chunk has exactly one of verseStart / fallbackChunkN non-null. CLI: --input. npm run ingest:bhagavata(:canto11)(:dry).
├── bhagavata-quality-gate.ts      Reusable Bhagavata quality gate (renamed from phase1.6-quality-gate.ts; per-phase customization documented in docstring). 5-query retrieval + 20-chunk stratified spot-check. NOT in package.json — invoke via tsx directly.
├── bhagavata-addendum-test.ts     Reusable addendum pressure-test driver. NOT in package.json — invoke via tsx directly.
├── count-system-prompt-tokens.ts  One-off: messages.countTokens probe + 3-call cache reproducer (Phase 1.7 cache investigation). NOT in package.json — invoke via tsx directly.
├── count-verses-by-source.ts      One-off: post-ingest row-count sanity check. NOT in package.json — invoke via tsx directly.
├── retrieval-regression-test.ts   Phase 2 regression harness: 6 failing + 6 passing queries with version-controlled per-query baseline source-counts. CLI flags --label / --theme-rerank / --source-diversity / --query-rewrite / --candidates-k / --theme-weight / --diversity-threshold for per-layer ablation. Imports the production pipeline (fetchCandidates + rerankByTheme + applyDiversityBoost + classifyQueryThemes + rewriteQuery) so harness exercises the same code path as /api/chat. NOT in package.json — invoke via tsx directly.
├── tag-classifier-validation.ts   Phase 2 Step 2.1b validation harness: 30 stratified chunks (8 per source + 6 caution-likely MUST_INCLUDE) classified by both Haiku 4.5 and Sonnet 4.6 with the same prompt. Founder picks the model based on Jaccard agreement + invented-tag rate + caution-tag coverage. NOT in package.json.
├── tag-themes.ts                  Phase 2 Step 2.2 full-corpus tagger. Reads chunks where themes IS NULL/empty (paginated, resume-safe), classifies via Sonnet 4.6 against the locked 34-tag taxonomy, writes themes column. Concurrency 3, 500ms inter-call delay, retry-on-429 with 60s/120s/240s/480s/960s backoff, parse-error one-retry-then-skip, taxonomy-rejection filter for invented tags. Emits per-source cost breakdown + caution-tag distribution. CLI: --dry-run, --source=<gita|mahabharata|bhagavata>. NOT in package.json.
├── tag-distribution-report.ts     Phase 2 Step 2.2 follow-up: emits a full-corpus tag-distribution markdown from live Supabase state (NOT just the most recent run's chunks). Used for founder review + the close-out documentation. NOT in package.json.
├── tag-spot-check.ts              Phase 2 Step 2.2 follow-up: 20-chunk spot-check (5 random per source × 3 + 1 from each of the 4 caution categories + 1 random caution). Deterministic seeded shuffle. NOT in package.json.
├── check-tag-progress.ts          One-off: total / tagged / empty count per source. Used during the Phase 2 tagging run to confirm resume-safety after the laptop-sleep crash. NOT in package.json.
├── test-search.ts                 10-query verse retrieval test (Phase 1). npm run test:search.
├── test-prompt.ts                 Run system prompt against test queries (Phase 3). npm run test:prompt.
├── screenshot-chat.ts             Phase 2.5 — Playwright driver for repeatable mobile-viewport screenshots. CLI: --query="text|label" (chat flow), --route-only (static page capture), --mock (intercepts /api/chat + /api/onboarding-state via window.fetch override; uses 3 canned source-mix fixtures with all 4 ref formats — zero API cost), --headed, --out, --url, --path. npm run screenshot:chat.
├── cls-slow3g-check.ts            Phase 2.5 — Playwright + CDP Network.emulateNetworkConditions at Slow 3G defaults (50 kbps / 32 kbps / 400 ms latency) + 4× CPU throttle. Loads /chat, observes layout-shift PerformanceObserver entries, reports CLS + peacock-feather rendered dimensions. NOT in package.json — invoke via tsx directly.
└── contrast-check.ts              Phase 2.5 — Programmatic WCAG 2.1 contrast calc with alpha-blended effective backgrounds. Outputs a markdown table of every sanctioned text × background combo. NOT in package.json.

data/                              (project root, not under src/)
├── gita.json                      701-verse Gita corpus (Sanskrit + regenerated Hindi + Sivananda English). ~730 KB, committed. See PROJECT_HISTORY.md for sources.
├── mahabharata.json               Phase 1.5 parser output: 1,844 chunks (English-only, no Hindi yet). Parse baseline.
├── mahabharata-regenerated.json   1,844 chunks with regenerated Hindi (~₹2,714 Sonnet 4.6 spend). Backup.
├── mahabharata-regenerated-cleaned.json  1,704 chunks after em-dash merge (138 pairs joined, 2 footnotes stripped). Ingested into Supabase.
├── mahabharata-raw/               MBh source ground truth: ganguli/ (PD English, 12 vols), sanskrit-bori/ (deferred to Phase 9+), sanskrit-kumbakonam/ (Southern recension, not used in v1).
├── bhagavata.json                 Phase 1.6 parser output: 633 chunks across all 90 chapters of Canto 10. Parse baseline.
├── bhagavata-regenerated.json     633 chunks with regenerated Hindi (~₹897.53 Sonnet 4.6 spend). Backup before em-dash cleanup.
├── bhagavata-regenerated-cleaned.json  568 chunks after em-dash merge (63 pairs joined). Canto 10 ingested file.
├── bhagavata-canto11.json         Phase 1.7 parser output: 162 chunks across 24 chapters of Canto 11.6–29 Uddhava-Gita. 82.1% anchored (vs Canto 10's 69.2%). Parse baseline.
├── bhagavata-canto11-regenerated.json  162 chunks with regenerated Hindi (₹231.18 Sonnet 4.6 spend). Backup.
├── bhagavata-canto11-regenerated-cleaned.json  159 chunks after em-dash merge (3 pairs joined, all resolved). Canto 11 ingested file.
└── bhagavata-raw/                 Sanyal Vol 4 + Vol 5 djvu_txt — gitignored (CC0 archive.org sources, ~600–760 KB each, re-fetchable per PROJECT_HISTORY.md). Vol 3 stored locally for future Bhagavata expansion (Books 7–9, NOT for current phases). Vol 5 BOOK XI body slice (lines 7448–14174) is the Canto 11 source.

docs/
├── build-roadmap.md               Detailed phase plan (full per-phase notes; CLAUDE.md keeps only the current/next pointer)
├── decisions.md                   Locked product decisions verbatim with full rationale (CLAUDE.md keeps only one-line summaries)
├── phase-prompts.md               Per-phase Claude Code prompts
├── build-session-prompt.md        Cowork build-session template
└── community-session-prompt.md    Cowork community-session template

.env.example (committed):                        canonical Phase 2 RAG flag set + placeholders for Phase 5+ secrets.
.env.local (gitignored):
  ANTHROPIC_API_KEY
  GEMINI_API_KEY
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  RAG_LAYER_THEME_RERANK           (Phase 2+; default true)
  RAG_LAYER_SOURCE_DIVERSITY       (Phase 2+; default true)
  RAG_LAYER_QUERY_REWRITE          (Phase 2+; default false — ships off, available for Phase 7 beta toggle)
  RAG_THEME_WEIGHT                 (Phase 2+; default 0.3)
  RAG_CANDIDATES_K                 (Phase 2+; default 30)
  RAG_DIVERSITY_COSINE_THRESHOLD   (Phase 2+; default 0.65)
  RAG_DIVERSITY_SCOPE_K            (Phase 2+; default 10)
  RAG_REWRITE_VARIANTS             (Phase 2+; default 3 — only when L3 enabled)
  RAG_REWRITE_PER_VARIANT_K        (Phase 2+; default 10 — only when L3 enabled)
  RAZORPAY_KEY_ID                  (Phase 5+)
  RAZORPAY_KEY_SECRET              (Phase 5+)
  RAZORPAY_WEBHOOK_SECRET          (Phase 5+)
  SENTRY_DSN                       (Phase 6+)
  PLAUSIBLE_DOMAIN                 (Phase 6+)
```
