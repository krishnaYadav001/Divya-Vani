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
