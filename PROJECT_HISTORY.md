# Project history

> This is an ungated reference. Read on demand for historical context. **Not auto-loaded by Claude Code sessions** — it's intentionally NOT imported via `@PROJECT_HISTORY.md` from CLAUDE.md, since that would defeat the purpose of pulling it out of CLAUDE.md (per Anthropic's docs, `@` imports load at launch).
>
> When you need any of: per-phase corpus source details, the project pivot from "God Messenger", legacy items still pending audit, or known caveats — open this file directly with the Read tool and pull the relevant section.

---

## Project pivot (former God Messenger framing)

The repo was originally "God Messenger" — a calm Hindi-first emotional support chat with the framing "Gita-inspired but never claims to be Krishna or any god." That positioning was REPLACED with "AI roleplaying Krishna" (current). Some legacy files may still contain old "presence not advice" language — flag and clean as you encounter them.

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
  - **Phase 9+:** ~~0% cache hit rate confirmed at full scale~~ — **ROOT CAUSE RESOLVED in Phase 2.6 (2026-05-03):** Sonnet 4.6 raised the minimum cacheable prompt from 1,024 (Sonnet 4.5/4) to **2,048 tokens**. Phase 1.7's "1,317 > 1,024" check tested the wrong threshold for Sonnet 4.6 specifically; 1,317 falls silently below the new 2,048 minimum (per docs: "length-based caching failures are silent" — exactly our symptom). Regen-script `cache_control: ephemeral` directive continues as a known harmless no-op at the current 1,317-token prompt size. **For Phase 9+:** if Sanskrit attachment grows the regen prompt past 2,048 tokens, caching will activate automatically with no code change needed. See Phase 2.6 PROJECT_HISTORY entry for the full root-cause analysis and the chat-route fix that exploits this discovery (chat-route persona is already 5,303 tokens; caching landed 100% hit rate on turns 2-5). Sanyal-vs-standard per-chapter content audit also opens at this milestone (separate from the cache resolution).

---

## Phase 2 RAG retuning

- **Goal:** fix the structural Gita-compact-verse-cosine-bias surfaced in Phases 1.5 / 1.6 / 1.7 retrieval gates. Add rebalancing layers on top of pgvector cosine retrieval so Bhagavata prose + MBh narrative content surface on abstract emotional queries (anger / surrender / renunciation) where Gita's compact verse-form previously dominated by cosine alone.
- **Theme taxonomy locked (Decision #17):** 34 tags total — 15 emotional/state (Group A: loneliness, anger, fear, grief, jealousy, doubt, despair, attachment, longing, joy, gratitude, surrender, devotion, forgiveness, equanimity), 15 relational/dharmic (Group B: duty, betrayal, family-conflict, friendship, marriage, parent-child, teacher-student, ruler-subject, action, inaction, decision, sacrifice, renunciation, householder, ascetic), 4 caution (Group C: caution_devotional_intimacy, caution_violence, caution_complex_dharma, caution_renunciation_extreme). Closed vocabulary; reopen requires re-tagging the full corpus.
- **Classification model:** Sonnet 4.6 over Haiku 4.5. Step 2.1b validation showed Haiku invented out-of-taxonomy tags (`faith`, `delusion`, `defeat`, `playfulness`) on ~17% of 30-sample validation set despite explicit "Do NOT invent" instruction; Sonnet stayed in-taxonomy. Cost tradeoff accepted: ~₹1,187 Sonnet-only vs ~₹319 Haiku-alone for guaranteed taxonomy fidelity. Validation report `test-results/phase2-classification-validation-2026-05-02.md`.
- **Full-corpus tagging:** all 3,132 rows tagged. Avg 5.79 tags/chunk (min 2, max 7); 0 invalid tags in DB; 0 overrun chunks (>7); 1,560 chunks (49.8%) carry ≥1 caution tag. Distribution health: `caution_violence` concentrated in MBh (43.1%) + Bhagavata (22.1%); `caution_devotional_intimacy` concentrated in Bhagavata (15.5% — rāsa-līlā / vastra-haran). 4 tags exceed 30% prevalence threshold (`action` 52.9%, `duty` 50.2%, `equanimity` 43.5%, `devotion` 35.5%) — overridden with judgment, NOT reclassified: the threshold was a sanity-check for degraded classifier behavior, NOT a flag for genuine high-prevalence themes. MBh is genuinely 70% about duty; Bhagavata is 75% about devotion. Distribution report `test-results/phase2-tag-distribution-full-corpus-2026-05-02.md`. Spot-check report `test-results/phase2-tag-spot-check-2026-05-02.md`.
- **Tagging operational notes:** the run died once at chunk ~920 when the laptop slept (4h gap, no log activity). Resume-safety in `scripts/tag-themes.ts` worked cleanly on rerun. A second run hit a Sonnet two-JSON parser edge-case — model emits initial JSON, then "Wait, X is not in taxonomy. Let me reconsider" reasoning aside, then a corrected JSON. The greedy `/\{[\s\S]*\}/` regex captured both objects as one string and JSON.parse failed. Fix: LAST-valid-JSON pattern (try non-nested `/\{[^{}]*\}/g` matches from last to first, accept first that parses). 35 chunks failed under the original parser; all 35 cleared in 36s on the third run with the patched parser. **The LAST-valid-JSON pattern is now the canonical defensive parser pattern** for any future Haiku/Sonnet JSON-output Phase work — inherited into `src/lib/queryThemes.ts` (extractMemory + classifyQueryThemes + rewriteQuery).
- **Three rebalancing layers:**
  - **L1 — theme-overlap reranking** (default ON): `score = cosine·0.7 + theme_overlap·0.3`. Reranks the top-30 cosine candidates by hybrid score before truncating to top-5. Query themes piggyback onto extractMemory's existing Haiku call (one round-trip for memory + themes).
  - **L2 — source-aware diversity boost** (default ON): if a source (gita/mahabharata/bhagavata) has 0 chunks in top-10 reranked AND a chunk from that source exists in top-30 with cosine ≥ 0.65, force-include 1 from each missing source into the final top-5 by displacing the lowest-ranked chunk. Up to one force-include per missing source.
  - **L3 — query rewriting** (default OFF, behind flag): generate 3 variant phrasings via Haiku (paraphrase + language-flip + emotional-core), embed all 4 in parallel, top-10 each via match_verses, union deduped by reference, top-30 by max-cosine across variants → pass to L1 rerank.
- **Ablation table** (per-layer regression-test deltas vs baseline; harness `scripts/retrieval-regression-test.ts`):

  | run | failing-gain sum | failing-improved | passing-regressions | report |
  |---|---|---|---|---|
  | baseline (no layers) | 0 | 0/6 | 0/6 | `phase2-regression-baseline-2026-05-02.md` |
  | L1 only | +3 | 2/6 | 3/6 | `phase2-regression-layer1-2026-05-02.md` |
  | L1 + L2 (shipped) | **+5** | **3/6** | **3/6** | `phase2-regression-layer1-2-2026-05-02.md` |
  | L1 + L2 + L3 (1-7 prompt) | +4 | 4/6 | 5/6 | `phase2-regression-final-pre-fix-2026-05-02.md` |
  | L1 + L2 + L3 + 3-7 prompt | +3 | 3/6 | 6/6 | `phase2-regression-final-2026-05-02.md` |

- **Final shipped config** (canonical lock, see `CLAUDE.md` § "Phase 2 RAG retrieval config" + `.env.example`):
  ```
  RAG_LAYER_THEME_RERANK=true
  RAG_LAYER_SOURCE_DIVERSITY=true
  RAG_LAYER_QUERY_REWRITE=false           # ablation showed net regression
  RAG_THEME_WEIGHT=0.3
  RAG_CANDIDATES_K=30
  RAG_DIVERSITY_COSINE_THRESHOLD=0.65
  RAG_DIVERSITY_SCOPE_K=10
  ```
- **Step 2.4 prompt-tuning lesson:** classifier-prompt change (1-7 → 3-7 minimum + worked examples) BACKFIRED. The worked examples I drafted included `devotion` in 3 of 4 examples; Haiku learned "devotion is usually applicable" and tagged 5 of 6 failing queries with devotion. Combined with theme-rerank, this over-weighted Gita (the most devotion-tagged source) and 6/6 passing queries regressed. Reverted to original 1-7 prompt with no worked examples — that's the canonical Phase 2 query-classifier prompt. Lesson: when adding examples to a classification prompt, ensure no single tag appears in more than half of the examples, or it leaks as a default.
- **Per-source-count regression metric brittleness:** Q1.7.3 ("daily devotion") shifted from 2 Gita + 3 Bhagavata → 0 Gita + 5 Bhagavata. Subjectively this is a pure improvement (more Bhagavata content for a Bhagavata-relevant query) but the per-source-count criterion fired because Gita dropped. Q1.6.4 similarly traded MBh for Bhagavata. Future phases should pair this metric with subjective-quality review or with a "total-relevant-chunks" criterion that gives weight to the expected source.
- **Total Phase 2 spend:** ~₹1,204 (₹1,187 corpus tagging + ₹14 classification validation + ₹3 baseline + ablation runs). 1.4% over the ₹1,187 projection — within noise.
- **Carry-forward to Phase 2.5:**
  - Verse-card UI dual-format rendering (Bhagavata anchored `bhagavata_<canto>.<ch>.<vStart>` vs fallback `bhagavata_<canto>.<ch>_<chunkN>`); empty-Sanskrit handling for MBh + Bhagavata; source badges. Spec lives in the auto-memory note `project_phase2_verse_card_dual_format`.
- **Carry-forward to Phase 3:**
  - Persona prompt should reference theme overlap when explaining why a verse was retrieved (the `themes` column is now populated and meaningful).
  - Caution-tag-aware reply framing: when a `caution_violence` or `caution_renunciation_extreme` chunk is retrieved, persona should soften the framing. When `caution_devotional_intimacy` is retrieved, frame as devotional metaphor not surface intimacy.
  - **Q1.7.4 query-classifier weakness** ("I learn from everything around me" → only `[gratitude]`): the classifier needs better priors for the avadhūta-style "every encounter is a teacher" stance. Likely Phase 3 systemPrompt iteration will surface a tweak; if not, revisit with a focused few-shot prompt at that time (without the devotion-bias trap).
- **Carry-forward to Phase 7 beta:**
  - L3 (query rewriting) ships disabled but available behind `RAG_LAYER_QUERY_REWRITE` flag. A/B-toggle in beta to gather real-user data on whether the +1 failing improvement (Q1.6.2 surrender) outweighs the regressions on emotional-direct queries. Toggling requires no redeploy.
- **Carry-forward to Phase 9+:**
  - GIN index on `themes` column when in-memory rerank cost shows up in latency budget.
  - Re-tag with newer model when caution-tag taxonomy expands beyond the locked 4 categories.

---

## Phase 2.5 — Temple-aesthetic UI + verse-card source-aware refs (2026-05-03 COMPLETE)

**Outcome.** Bundled two pieces of UI-foundation work that would otherwise be touched repeatedly through Phases 3-8: (1) verse-card source-aware references with dual-format Bhagavata handling, and (2) the temple-presence visual identity (color tokens, Hindi/English typography, 3 Krishna-presence motifs, soft warm gradient + lotus mandala atmosphere).

**Verse-card foundation:**
- New `src/lib/referenceParser.ts` — `parseReference()` handles all 4 formats: Gita anchored + split, MBh with optional sub-letter chunk suffix, Bhagavata anchored (dot separator), Bhagavata fallback (underscore separator). `formatReferenceLabel(parsed, lang)` produces 8 label combinations (4 sources × 2 languages); parva-name maps for all 13 Phase 1.5 parvas co-located in same file. Throws on unrecognized input. Soft-fail wrapper `tryParseReference()` for the React render path. 47/47 unit tests via Node `tsx --test`.
- New `src/lib/detectLang.ts` — Devanagari-dominant heuristic (>30% chars in U+0900–U+097F → `'hi'`, else `'en'`). Used by ChatUI to compute `userLang` per assistant message (walks back to most recent user message) for verse-card label routing per locked decision #12.
- New `src/app/components/VerseCard.tsx` — extracted from ChatUI; collapsed pill is itself the source-tinted badge (saffron Gita / deeper-maroon MBh / cool-indigo Bhagavata) at min-h-11 (44px touch target above the 28px WCAG fail). Expanded card has explicit badge chip in header. Empty Sanskrit (MBh + Bhagavata rows) renders Hindi + English only + a footer caveat in `text-brass-dark/90`.

**Visual identity foundation:**
- 6 semantic color tokens added to `src/app/globals.css` `@theme inline` block (Tailwind v4 CSS-first config — no JS config file in this codebase). Single tokens + opacity modifiers; no -50/-900 scales. After R1 founder iteration, 2 dark text variants added (`devotional-dark` #7A4F1E, `brass-dark` #7C5F2E) for AA-safe text contexts (devotional + brass at full saturation only pass border/fill, not text on parchment).
- `src/lib/designTokens.ts` is the typed registry — color hex + role + WCAG ratings + sanctioned `SOURCE_BADGE_CLASSES` + `SOURCE_BADGE_LABEL` (short Hindi/English visible text + descriptive English aria) + typography scale + 44px touch-target constant + motif registry. Documentation-as-code; CSS variables remain the source of truth in globals.css.
- Noto Sans Devanagari (weights 400/500/700, devanagari subset) + Cormorant Garamond (weights 400/500/600, latin subset) self-hosted via `next/font/google` — auto-self-hosted by Next at build time.
- 3 Krishna-presence motifs at `src/app/components/motifs/`. Founder iteration mid-phase swapped the SVG `PeacockFeather` for a photographic asset (`public/krishna-peacock-feather.png`, 71.8 KB, 500×500, 1:1 transparent) rendered via `next/image` with explicit `width`/`height` for CLS prevention + `priority` flag for header preload. `Bansuri` (transverse 6-finger-hole flute) + `LotusMandala` (8-petal कमल यंत्र, used as 6%-opacity watermark) remain inline SVG per discipline rule (raster only where founder explicitly opts in).
- `src/app/design-system/page.tsx` — public reference page showing color swatches with WCAG ratings, typography samples (Hindi paragraph, English Cormorant, UI sans, Sanskrit italic), 3 motifs at multiple sizes + a watermark demo, mock verse cards.

**Atmosphere on /chat:**
- Body gradient `from-orange-50 via-amber-50 to-amber-100` → `from-parchment to-parchment/95`.
- Header: PeacockFeather (h-12) at left of Cormorant title with peacock-color accent on "Krishna" + sacred-color "AI", Devanagari subhead.
- Disclaimer (locked decision #1) repositioned + restyled to `text-sm text-brass-dark`, sits directly under header above the fold at all 3 viewports.
- Lotus mandala SVG watermark fixed-positioned, `opacity-[0.06]`, behind content, `pointer-events-none aria-hidden`.
- Verse cards on parchment with brass borders. Bansuri silhouette to left of input (hidden on mobile via `sm:block`). Send button `bg-krishna text-parchment hover:bg-krishna/90`.

**Tooling shipped (reusable in Phase 6+):**
- `scripts/screenshot-chat.ts` — Playwright driver for repeatable mobile-viewport screenshots. `--query="text|label"` repeatable (chat flow), `--route-only` (static page capture), `--mock` (Playwright `addInitScript` overrides `window.fetch` to intercept `/api/chat` + `/api/onboarding-state` and return canned 3-source fixtures with all 4 ref formats — zero API cost for UI iteration). Used `--mock` for Step 2.5.8 R1-R3 iteration (saved ~₹30-40 vs live), live mode for the genuine 5-query mobile QA matrix.
- `scripts/cls-slow3g-check.ts` — Playwright + CDP `Network.emulateNetworkConditions` at Slow 3G defaults (50 kbps / 32 kbps / 400 ms latency) + 4× CPU throttle. Loads /chat, observes layout-shift PerformanceObserver entries, reports CLS + peacock-feather rendered dimensions.
- `scripts/contrast-check.ts` — Programmatic WCAG 2.1 contrast calc with alpha-blended effective backgrounds (the rendered tinted bg over parchment, not the raw token). Outputs a markdown table.
- `lighthouse` added to devDeps; `npx lighthouse --form-factor=mobile --screen-emulation.mobile=true` invocation pattern documented in QA report. Edge or Playwright's bundled Chromium binary works as the driver via `CHROME_PATH` env var (system Chrome not required).

**Mid-phase iteration history (the lessons worth remembering):**
- **R1 founder refinement (post Step 2.5.0a aesthetic review):** added `devotional-dark` + `brass-dark` text variants because devotional + brass at full saturation fail AA as text on parchment (2.5–2.6:1). Locked usage discipline in designTokens.ts — devotional + brass for fill/borders/badge tints only; sacred + krishna + peacock work both fill AND text.
- **Mid-stream content-language fix (caught after first Step 2.5.6 screenshots):** I was using `userLang` to pick the message-body font, but Krishna's first-time greeting is Hindi regardless of user input language → Cormorant fell back to system serif for Devanagari, looked broken. Switched to per-message `detectLang(message.content)` for body font; `userLang` still drives verse-card labels. Worth flagging because the bug only surfaced at screenshot time, not in code review.
- **Step 2.5.8 R1 MBh badge differentiation:** founder flagged sacred /10 vs devotional /15 reading as similar warm tones at small viewports. Bumped MBh `bg-sacred/10` → `/20` + border `/40` → `/60`. Mock screenshot batch confirmed the deeper maroon stops MBh from reading as soft pink.
- **Step 2.5.9 fold-out a11y violations (Lighthouse mobile):** ChatUI outer wrapper was a `<div>` (no `<main>` landmark anywhere) and `layout.tsx` had `maximumScale: 1` on the Viewport export (blocking pinch-zoom — WCAG 1.4.4 fail). Both predated Phase 2.5; Phase 2.5 surfaced them. Both fixes were 2 lines each. Re-run accessibility: 92 → 100/100.
- **Cost discipline correction (mid-phase):** founder spotted that I'd used live API for every iteration screenshot batch (~₹15-20 each). Built `--mock` flag in screenshot-chat.ts; used for all Step 2.5.8 work. Carry-forward principle: live mode for baseline + final QA only; mock for visual iteration.

**QA gates (full Step 2.5.9 report at `test-results/phase2.5-mobile-qa-2026-05-03.md`):**
- Lighthouse mobile accessibility: **100/100** (target ≥90, exceeded by 10).
- Lighthouse mobile CLS: **0** (target <0.1).
- Slow 3G + 4× CPU CLS: **0.0087** (target <0.1, exceeded by ~12×). Peacock feather rendered at 48×48 with no shift.
- WCAG AA contrast: **9/9 combinations pass**, min 5.44:1 (disclaimer), max 12.41:1 (body + button).
- Hindi conjuncts (पाण्डुपुत्र / निरहंकारः / श्रीमद्भागवत classical forms) verified via Noto Sans Devanagari.
- Touch targets ≥ 44×44 px (min-h-11 on collapsed pills).
- 5-query live retrieval batch surfaced **3 of 5 queries with Bhagavata fallback refs** naturally — `(अंश N)` and `(passage N)` syntax both render correctly in their respective languages.

**Total spend ~₹100** (5 live screenshot batches @ ~₹15-20 + 5-query final mobile QA ~₹25; ₹0 on the 4 mock-mode iteration batches). Mobile QA budget was ₹15-25, came in at ~₹25.

**Phase 11 boundary held:** static Pichwai/Tanjore Krishna avatar work explicitly NOT preempted. Peacock feather + bansuri + lotus mandala motifs are devotional symbology, not avatar. Phase 11 will fit a depicted Krishna character into the design language Phase 2.5 establishes.

**Carry-forward to Phase 3:**
- Persona prompt should reference verses by intent (locked decision #10) using the new label vocabulary — Krishna says "as I told Arjuna long ago", never "Bhagavad Gita 2.47". The verse cards now surface those numbers via the UI; Krishna himself doesn't speak them.
- Q1.7.4 query-classifier weakness ("I learn from everything around me" → only `[gratitude]`) carried forward from Phase 2 — surface during Phase 3 systemPrompt iteration.

**Carry-forward to Phase 6:**
- Re-audit Lighthouse on Vercel production deployment for LCP improvement (currently 2.9 s in dev/prod local; edge caching should trim further).
- Reuse `cls-slow3g-check.ts` + `contrast-check.ts` + `screenshot-chat.ts --mock` for repeat regression checks before each beta release.
- Slow 3G load time 76 s is realistic for tier-3 Indian mobile networks; consider a route-level loading skeleton or lighter initial bundle if user feedback at beta confirms this is painful.

---

## Phase 2.6 — Chat-route prompt-cache fix (2026-05-03 COMPLETE)

**Outcome.** Resolves the 0% cache hit rate that's been carried forward from Phase 1.6 / 1.7 / 2. Two-hour focused sprint; came in at ~₹15 spend (under the ₹20 budget).

**Root cause** (settled in STEP 1 by reading current Anthropic prompt-caching docs):

Sonnet 4.6 raised the minimum cacheable prompt from 1,024 tokens (Sonnet 4.5 / 4) to **2,048 tokens** — a model-specific change documented in the docs but not in the Phase 1.7 15-minute investigation that ruled out the threshold hypothesis. Per the docs verbatim:

> Length-based caching failures are silent: the request succeeds but both `cache_creation_input_tokens` and `cache_read_input_tokens` will be 0.

Phase 1.6 / 1.7 regen `SYSTEM_PROMPT` measures 1,317 tokens — above the old 1,024 minimum the prior investigation checked, but **below the 2,048 minimum that's specific to Sonnet 4.6**. This is the entire root cause. Not an SDK bug, not a payload structure issue, not a missing beta header, not a TTL default change, not API tier gating.

The Phase 1.7 investigation note at `test-results/phase1.7-cache-investigation.md` was correct on the data it had; it just tested the wrong threshold number for Sonnet 4.6 specifically.

**Surprise discovery during STEP 3a measurement.** The chat route's `system` content was passed as a plain string (no `cache_control` at all — separate concern from the regen-script anomaly). And the **constructed system content is much larger than expected** because the RELEVANT SCRIPTURE block, formatting 5 retrieved verses with full Sanskrit + Hindi + English, dominates: a Bhagavata-heavy "Tell me about Yashoda" turn measured at **12,285 system tokens** (5,303 from `SYSTEM_PROMPT` + ~7,000 from scripture+context). Above 2,048, so caching CAN engage on the chat route today — Phase 3 wait was unnecessary.

**Fix on `src/app/api/chat/route.ts`.** Restructured `system` from one plain string into two structured blocks:

- **Block 0 — persona** (`SYSTEM_PROMPT`, 5,303 tokens, stable across turns) with `cache_control: { type: "ephemeral" }`.
- **Block 1 — dynamic** (USER CONTEXT + RELEVANT SCRIPTURE, mutates every turn as memory accumulates and retrieval differs) with no cache directive.

Why this shape: the dynamic content changes every turn (verified — system block size oscillates 8K → 13K across a 5-turn session as different verse retrievals land). Caching the COMBINED block (the naive single-`cache_control` setup) wrote a 1.25× tax with **zero reads** across all 5 turns — verified by an interim measurement before settling on the persona-only structure. Caching only the persona works because the persona is byte-stable across turns within a session.

Also kept `buildSystemPrompt` as a refactor returning `{ persona, dynamic }` so the chat route assembles the structured blocks without duplicating logic.

**Verification (5-turn live test, fresh prod build):**

```
Turn 1: cache_creation=5,303  cache_read=0      (persona writes)
Turn 2: cache_creation=0      cache_read=5,303  HIT
Turn 3: cache_creation=0      cache_read=5,303  HIT
Turn 4: cache_creation=0      cache_read=5,303  HIT
Turn 5: cache_creation=0      cache_read=5,303  HIT
```

100% hit rate on turns 2-5; sustained at 5,303 tokens read per turn. Beats the founder's ≥90% acceptance criterion. The `cache_read_input_tokens` ramps stay constant at 5,303 because the persona is byte-stable; the `input_tokens` field varies per turn (dynamic content).

**Cost reduction** on the input portion of the same 5-turn session, with caching applied:

- Pre-fix (combined-block cached, prefix never matched): ~52K billed-input-equivalent tokens (every turn writing 1.25× the full block).
- Post-fix: turn 1 writes persona at 1.25× + dynamic at 1×; turns 2-5 read persona at 0.10× + dynamic at 1×. Total: ~34K billed-input-equivalent tokens.
- **~34% input cost reduction across the 5-turn session.** Per-turn savings approach ~₹0.10-0.20 for multi-turn sessions. Single-turn first-message users see no cache benefit (small 1.25× write penalty on the persona). Net positive any time avg session length > 1.5 turns — true for the 10-msg free pool design.

**Permanent telemetry** added at the end of every chat-route Sonnet call:

```
[chat] sonnet usage: input=N cache_creation=N cache_read=N output=N (persona=Nch dynamic=Nch)
```

This is the canonical signal going forward. Watch for `cache_read` jumps when Phase 3 ships its persona iteration (if persona size shifts past or below thresholds).

**Regen scripts NOT modified.** Their 1,317-token `SYSTEM_PROMPT` is still below the 2,048 minimum, so `cache_control: { type: "ephemeral" }` continues as a harmless no-op there (no 1.25× tax — cache write fails silently per docs). No large regen runs scheduled before Phase 9+ Sanskrit attachment, at which point the prompt may grow past 2,048 and caching activates without code changes.

**Carry-forward closure:**
- Phase 1.6 carry-forward "0% cache hit rate persisted across 633 calls" — RESOLVED, root cause documented.
- Phase 1.7 carry-forward "0% cache hit rate confirmed at full scale (162 calls)" — RESOLVED.
- Phase 2 RAG retuning didn't list cache as a carry-forward, but the chat route's `system: string` shape (which never wired caching at all) was a latent issue — RESOLVED.
- The "Open issues / known caveats" bullet for prompt caching is now struck-through with a cross-reference to this entry.

**Files modified:** `src/app/api/chat/route.ts` only (restructure + telemetry). 4 doc files updated: `CLAUDE.md` status, `docs/decisions.md` row, `docs/build-roadmap.md` Phase 2.6 entry, this `PROJECT_HISTORY.md` entry. No new files. No new dependencies.

---

## Open issues / known caveats

- Personalization is "previous turn → current turn" via `context_summary`, not deep multi-turn history. Acceptable for v1.
- Cookie identity is per-browser; Phase 5 auth addresses this.
- ~~**Prompt caching anomaly**~~ — **RESOLVED in Phase 2.6 (2026-05-03).** Root cause: Sonnet 4.6 raised the minimum cacheable prompt from 1,024 (Sonnet 4.5/4) to 2,048 tokens. Phase 1.7's "1,317 > 1,024" threshold check tested the wrong number; 1,317 falls silently below the new 2,048. The chat-route fix lives in `src/app/api/chat/route.ts` (split persona vs dynamic system blocks, cache_control on persona only) — see Phase 2.6 entry below. Regen scripts unchanged: their 1,317-token SYSTEM_PROMPT is still below 2,048, so the cache_control directive there continues as a known harmless no-op until Phase 9+ Sanskrit attachment grows the regen prompt past the threshold. Detailed root-cause analysis: `test-results/phase1.7-cache-investigation.md` + the Phase 2.6 PROJECT_HISTORY entry below.
- `is_first_time` backfill exists for pre-column rows. Future column adds need similar consideration.

---

## Legacy items to audit and migrate

- `src/lib/systemPrompt.ts` — placeholder until Phase 3 rewrites it for Krishna persona.
- `src/lib/seedResponses.ts` — Hindi tone seeds; some may carry over, some won't.
- `users_memory.is_paid` column — dropped in Phase 5; replaced by `seva_balance`-only model.
