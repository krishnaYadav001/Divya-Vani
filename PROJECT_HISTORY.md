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
  - **Phase 9+:** **0% cache hit rate confirmed at full scale** (162 calls; 1,317-token SYSTEM_PROMPT verified above the 1,024-token cache minimum via `messages.countTokens`; 3-call sequential probe in `scripts/count-system-prompt-tokens.ts` reproduces 0 cache_creation + 0 cache_read). The Phase 1.6 "below threshold" hypothesis is falsified. Remaining hypotheses: Sonnet-4.6-specific cache eligibility, beta-header drift, API-tier gating, ephemeral-TTL default change. Investigation note at `test-results/phase1.7-cache-investigation.md`. Reopen alongside Sanskrit-attachment milestone when prompt size + cache savings get bigger. Sanyal-vs-standard per-chapter content audit also opens at this milestone.

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

## Open issues / known caveats

- Personalization is "previous turn → current turn" via `context_summary`, not deep multi-turn history. Acceptable for v1.
- Cookie identity is per-browser; Phase 5 auth addresses this.
- **Prompt caching anomaly:** `cache_control: { type: "ephemeral" }` is set on the regen SYSTEM_PROMPT block but observed 0% hit rate at full scale (Phase 1.6: 633 calls; Phase 1.7: 162 calls). The Phase 1.6 "below 1,024-token threshold" hypothesis was falsified Phase 1.7 — `messages.countTokens` returned 1,317 tokens for the regen SYSTEM_PROMPT, comfortably above the 1,024 cache minimum. A 3-call sequential probe in `scripts/count-system-prompt-tokens.ts` reproduces 0 cache_creation + 0 cache_read with identical prompt structure. Remaining hypotheses: Sonnet-4.6-specific cache eligibility, beta-header drift, API-tier gating, ephemeral-TTL default change. Defer to Phase 9+ alongside Sanskrit-attachment milestone (when corpus + prompt size are larger and savings justify deeper investigation, possibly escalating to Anthropic support). Detailed note at `test-results/phase1.7-cache-investigation.md`. The runtime app's chat endpoint does NOT yet use prompt caching; same anomaly likely applies, defer accordingly.
- `is_first_time` backfill exists for pre-column rows. Future column adds need similar consideration.

---

## Legacy items to audit and migrate

- `src/lib/systemPrompt.ts` — placeholder until Phase 3 rewrites it for Krishna persona.
- `src/lib/seedResponses.ts` — Hindi tone seeds; some may carry over, some won't.
- `users_memory.is_paid` column — dropped in Phase 5; replaced by `seva_balance`-only model.
