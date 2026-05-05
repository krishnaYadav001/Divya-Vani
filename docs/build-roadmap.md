# Project: Krishna AI

An AI roleplaying Krishna — the character from the Bhagavad Gita, Mahabharata, 
and Bhagavata Purana — chatting with users about life, emotions, decisions, 
and dharma. The AI speaks AS Krishna would speak, grounded in real scripture. 
It explicitly does NOT claim to be the actual divine Krishna; it is an AI 
inhabiting his voice and wisdom. A permanent disclaimer bar near the avatar 
states this.

# Founder

I'm Krishna, MCA graduate from Kanpur, Uttar Pradesh. Solo founder. Average 
coder, comfortable with the stack below but I read every line before merging. 
Building this with Claude Code in VS Code.

# Tech stack

- Next.js 16 (App Router, src/ directory) — MAJOR version, breaking changes 
  from older docs; verify APIs against current docs before assuming
- TypeScript
- Tailwind CSS v4 — note: bg-gradient-* is now bg-linear-*, several utilities 
  renamed; verify before using
- Supabase (Postgres + pgvector for verse embeddings; auth available)
- @anthropic-ai/sdk 0.91.x
- Final reply model: claude-sonnet-4-6
- Memory extraction model: claude-haiku-4-5
- Embedding model: Gemini gemini-embedding-001 (Google AI SDK; called with outputDimensionality: 768 + taskType RETRIEVAL_DOCUMENT/QUERY)
- Hosting: local dev currently; Vercel planned

# Locked product decisions

- AI roleplays Krishna; never claims divinity; permanent disclaimer bar visible
- All five Krishnas in scope (Gita, Mahabharata, Bhagavata, Vrindavan, Bal); 
  Gita is built first, others added in order
- Krishna addresses user by their actual name (asked naturally in first reply)
- User addresses Krishna with any respectful name (Krishna, Kanha, Madhav, 
  Govind, Murari, etc.)
- Scope: Medium — personal/emotional/life questions, modern context handled 
  through dharma framing
- Modern context handling: Option C — never name modern things (Instagram, 
  boyfriend, phone); translate to underlying feeling
- Tone: Option C with acknowledge-first guardrail — Krishna only challenges 
  AFTER acknowledging the feeling; never leads with challenge
- Self-harm and harm-others: Krishna stays in compassionate character; system 
  layer adds a separate non-Krishna helpline card alongside
- Bad-word handling: text input filter at typing layer (cannot be submitted); 
  Krishna himself never engages
- Verse citations: inline natural mention in Krishna's reply + expandable 
  card showing Sanskrit + Hindi + English
- Voice: NOT in v1. Text-only. Phased rollout post-launch — Phase 10 Hindi
  one-way TTS, Phase 12 async voice messages, Phase 13 real-time voice call.
  Animated/lip-synced AI video and real-time video calling are NEVER planned.
- Pricing (v1): Pay-as-you-go ONLY. Razorpay one-time UPI checkout — Razorpay
  Subscriptions module NOT used in v1. 10 free messages, no expiry. Four seva
  tiers — Pratham ₹11/6 msg, Anjali ₹51/30, Bhakti ₹101/60, Param ₹501/350.
  All four standalone-profitable. Subscriptions arrive Phase 9.
- Languages: Hindi-first, English supported equally, Sanskrit accepted. Krishna replies in whichever language the user wrote in (Sanskrit input is rare in practice but the door stays open). Verse cards always show Sanskrit + Hindi + English regardless of reply language.
- Refusals: sexual content, instructions to harm others, anything illegal 
  under Indian law

# Supabase schema

users_memory (one row per user):
  id uuid pk, user_id text unique not null, user_name text, main_problem text, 
  emotion text, context_summary text, last_active_at timestamptz, 
  message_count int default 0, seva_balance int default 0, 
  is_first_time bool default true, verses_referenced text[] default '{}',
  updated_at timestamptz default now()
  (legacy is_paid column dropped in Phase 5; subscriptions Phase 9+ live in
  a separate `subscriptions` table, not added as columns here)

verses (Phase 1 — to be created):
  id uuid pk, source text, reference text, chapter int, verse_number int, 
  sanskrit text, transliteration text, hindi text, english text, 
  themes text[], embedding vector(768), created_at timestamptz default now()
  Index: ivfflat on embedding vector_cosine_ops

RLS enabled, no policies (locks anon access; service role bypasses).
No migration tooling — schema changes are manual ALTER TABLE in SQL Editor.

# Identity model

HTTP-only cookie god_messenger_uid (UUID, 1 year, secure in prod). Per-browser. 
Optional email-OTP auth planned (Phase 5) for cross-device sync without 
forced sign-in.

# Chat turn flow

1. Client posts to /api/chat with { message }
2. Read cookie or generate UUID
3. fetchMemory(userId) → priorCount, isPaid, isFirstTime, priorMemory, 
   user_name
4. Seva paywall guard: message_count >= 10 AND seva_balance == 0 → static
   seva paywall reply with 4 tier options, no AI call. Else if seva_balance
   > 0, decrement by 1 in step 9.
5. Compute isReturningUser (12h+ gap), isFirstTime
6. Embed user message via Gemini gemini-embedding-001
7. Similarity-search verses table → top 5 relevant verses
8. Parallel: extractMemory (Haiku JSON: main_problem/emotion/context_summary) 
   AND safety classifier (Haiku JSON: self_harm/harm_others/safe) AND final 
   reply (Sonnet, system prompt + USER CONTEXT + RELEVANT SCRIPTURE blocks)
9. saveMemory writes extraction + count+1 + name (if asked) + activity
10. Return { reply, verses, paywall, safety_card }, set cookie if new

# Build phase plan (19 weeks to launch)

Phase 0 — Decision lock (done)

## Phase 1 — Bhagavad Gita (weeks 1–2, COMPLETE)

- **Goal:** Ingest the full Bhagavad Gita as the foundational Krishna corpus — enables Gita-mode persona retrieval.
- **Source:**
  - Sanskrit: github.com/gita/gita (verse text only — millennia-old PD; mechanical encoding low copyright bar)
  - English: Swami Sivananda translation via github.com/gita/gita (PD in India under life+60 rule; Sivananda d. 1963)
  - Hindi: regenerated 2026-04-28 via Claude Sonnet 4.6 from Sanskrit + English using v3 system prompt (modern Hindi with scriptural dignity, classical Devanagari conjuncts). Original Tejomayananda translation dropped due to active copyright.
- **Curation:** All 18 chapters, all 701 verses, no filtering.
- **Chunk strategy:** Per-verse. Reference format `gita_<chapter>.<verse>` (e.g. `gita_2.47`); split verses use `gita_<chapter>.<verse>_<endverse>` (e.g. `gita_18.78_79`).
- **Chunk count:** 701.
- **Time:** Phase 1 ingestion closed 2026-04-26. Hindi license remediation completed 2026-04-28 (regeneration ₹257 + re-embed ₹2 ≈ ₹263 total). Backup of original Hindi preserved at `data/gita.json.backup-20260428-191951`.
- **Test queries (validated):** anger, fear, breakup, family conflict, doubt, success guilt, loneliness, grief, decision paralysis, jealousy. Result: 7/10 bullseye, 2/10 mixed, 1/10 corpus-thin (loneliness — Gita is light on solitude themes).
- **Hindi regeneration as standing practice for Phases 1.5–1.7:** The Sonnet 4.6 + v3-prompt approach used here is now the standard for all subsequent corpus ingests. Phases 1.5 (Mahabharata), 1.6 (Bhagavata 10), and 1.7 (Uddhava Gita) will source Sanskrit + English from public-domain editions and regenerate Hindi at ingest time rather than sourcing Hindi from copyrighted modern translations. This **resolves the Phase 1.6 Bhagavata Hindi license blocker** that was previously flagged (no longer need to license Prabhupada / Goswami / Bryant for Hindi). The English-translation license question for Phase 1.6 still requires resolution — see that phase's Source line.

## Phase 1.5 — Mahabharata Krishna sections (weeks 3–4, COMPLETE 2026-04-30)

- **Goal:** Ingest curated Krishna-relevant sections of the Mahabharata — unlocks Mahabharata Krishna mode (the strategic friend who navigated court politics, betrayal, family conflict).
- **Source:**
  - **English:** Kisari Mohan Ganguli / Pratap Chandra Roy translation (1883–1896, PD worldwide), 12-volume plain-text edition from archive.org.
  - **Hindi:** regenerated 2026-04-30 via Claude Sonnet 4.6 + v3 system prompt + Mahabharata prose addendum ("Sanskrit may be partial or absent; translate based on English; preserve Sanskrit philosophical terms"). The Phase 1 Hindi-regen pattern carried forward as locked-in standard practice (no licensed-translation procurement needed).
  - **Sanskrit:** intentionally **not attached** at this phase. BORI critical edition was downloaded to `data/mahabharata-raw/sanskrit-bori/` but alignment deferred to Phase 9+ per docs/decisions.md 2026-04-29. All MBh rows have `sanskrit = ''` and `sanskrit_source = NULL`.
- **Curation:** **13 parvas across 23 curated section ranges** (Adi 218–225, Sabha multiple ranges including Rajasuya 30–44 and vastra haran 60–72, Vana, Udyoga, Bhishma, Drona, Karna, Shalya 55–65, Sauptika 13–18, Stri 24–25, Shanti, Ashvamedhika 16–50 Anugita, Mausala 1–9). Curation rounds-1-and-2 audit recorded in docs/decisions.md 2026-04-29.
- **Chunk strategy:** Per-paragraph within section, sub-chunked when paragraphs exceeded ~300 words. Reference format `mb_<parva>_<section>_<chunkN>` (e.g. `mb_udyoga_92_3`). Some sections produced sub-letter suffixes `_1a/_1b/_2a/_2b` when the parser sub-split paragraphs.
- **Chunk count:** parser emitted 1,844 chunks → post-process em-dash merge consolidated to **1,704 chunks** (138 pairs joined, 2 translator footnotes stripped). Final ingest: **1,704 rows** with 768-dim Gemini embeddings.
- **Cost:** ₹2,719 total (₹2,714 Sonnet 4.6 Hindi regen + ₹4.93 Gemini embedding + ₹0 em-dash cleanup). Hindi regen overran the original ₹550–650 forecast ~4× because chunks averaged 230 words rather than the assumed ~50–80; re-baseline cost models for Phase 1.6/1.7 from this.
- **Quality gate (Task 10 audit):** 20-chunk stratified spot-check across all 13 parvas → **19 PASS + 1 FLAG (minor punctuation), 0 FAIL**. 5-query retrieval test → **5/5 surfaced Mahabharata content** in top-5 (acceptance was ≥4/5). Report: `test-results/phase1.5-mahabharata-spotcheck-2026-04-30T03-59-33-323Z.md`.
- **Test queries (validated):** "मेरे साथ धोखा हुआ" / "I was betrayed by someone close" → 4/5 Mahabharata in top-5. "मेरे परिवार में लड़ाई है" / "my family won't speak to me" → 3/5 MBh, top hit Gita 1.31 (Arjuna's lament). "I'm being mistreated unfairly" → 5/5 MBh, top hit Sabha 64.3 (Vidura). "I'm angry at someone close" → 2/5 MBh; Gita's compact anger verses (2.62–63, 16.18) outranked narrative MBh passages — flag for Phase 2 retuning. "मैं अकेला सही पक्ष में हूँ" → 2/5 MBh, top hit Gita 9.22.
- **Carry-forward — BUGS TO FIX before Phase 1.6 starts** (in `scripts/ingest-mahabharata.ts` or a shared ingest helper):
  - **Pagination cap on resume query.** The Supabase JS client's `.select()` defaults to 1,000 rows. The script's resume-existing-refs query at startup is single-page, so chunks beyond the first 1,000 were treated as "not yet ingested" and re-processed during Phase 1.5 (idempotent upsert saved us — 653 phantom re-embeds, ~₹1 wasted, no data corruption). Fix: paginate via `.range(0, 999)` then `.range(1000, 1999)` etc. Same fix pattern that was needed for the Task 9 verification diagnostic.
  - **Network-error retry coverage.** Current `isRateLimitError` predicate matches only HTTP 429 / `RESOURCE_EXHAUSTED`. The 51 explicit failures during Phase 1.5 ingest were `fetch failed` (TypeError-class network errors), which slipped through the retry path. Fix: broaden to `isRetryableError` covering both — rate-limit (60s/120s/240s/480s/960s backoff) and network-fetch errors (5s/15s/30s shorter backoff appropriate for transient blips).
- **Carry-forward — NON-BLOCKING deferrals** (do not block Phase 1.6):
  - `mb_drona_35_1b` uses colon-plus-quotes for dialogue intro (`कहे: "..."`) instead of the locked em-dash convention (`कहा — ...`). 1 of 1,704 chunks (0.06% defect rate). Defer to Phase 9+ corpus polish OR a fix-on-user-feedback model.
  - **18 mid-word/ellipsis truncation chunks** from upstream parser (e.g. `mb_udyoga_82_1` ends `...पाँचवाँ कोई भी अन्य ग्राम। हे`; `mb_bhishma_109_1` ends `...और शिखण्डी ने...`). Out-of-scope for the em-dash fix script. Defer to Phase 2 RAG retuning OR Phase 1.6 parser improvements (since the same parser will run on Bhagavata).
  - **Anger / aloneness retrieval thinness.** Q4 (`I'm angry at someone close`) and Q5 (`मैं अकेला सही पक्ष में हूँ`) surfaced only 2/5 MBh chunks in top-5 — Gita's compact abstract verses outscore narrative MBh passages on these emotional axes. Address in Phase 2 (theme tags, query rewriting, or source-aware retrieval boost).

## Phase 1.6 — Bhagavata Purana Canto 10 (weeks 5–7, COMPLETE 2026-05-01)

- **Goal:** Ingest Krishna's life story (birth through Mathura departure + late-life events) — unlocks Vrindavan, Bal Krishna, and Bhagavata persona modes. Longest single ingest of Phase 1.
- **Source:**
  - **English:** J. M. Sanyal *Srimad-Bhagavatam* (Calcutta 1929–34, PD), Sarayu/UP-Museum CC0 archive.org scans (Vol 4 `eszb_…`, Vol 5 `qpbw_…`). djvu_txt URL pattern same as Phase 1.5 roypuoft (`archive.org/stream/<id>/<id>_djvu.txt`). License blocker resolved: Phase-1-locked Hindi-regen-from-PD-English pattern eliminated need to license Prabhupada/Goswami/Bryant.
  - **Hindi:** regenerated 2026-05-01 via Claude Sonnet 4.6 + v3 system prompt + **Bhagavata addendum v1.1** (3 bullets: Sanskrit-absent caveat + lyrical/devotional voice rule + glossary lock with गोप uniform, names through सुदामा, no राधा pending Phase 9+). Pressure-test 2026-05-01 verified 6/6 register match before full run. Total Sonnet spend ₹897.53 across 633 chunks (40% under ₹1,200–2,100 estimate, even with 0% cache hit — see carry-forward).
  - **Sanskrit:** intentionally **not attached** at this phase. All Bhagavata rows have `sanskrit = ''` and `sanskrit_source = NULL`. Sanskrit alignment deferred to Phase 9+ audit (mirrors Phase 1.5 BORI deferral).
- **Curation:** Full Canto 10, all 90 chapters. Natural arcs: 1–14 birth + Vrindavan infancy (Bal Krishna), 15–35 pre-adolescent Vrindavan + rāsa līlā at 29–33, 36–55 Mathura departure + Bhramara-gītā, 56–90 Mathura/Dvārakā + Sudāma + dynasty events.
- **Chunk strategy:** Paragraph-batched within chapter (Sanyal is literary prose with no per-verse markers — only sporadic `(N—M)` verse-range parentheticals after some paragraphs). **Reference format**: `bhagavata_10.<chapter>.<verseStart>` anchored (dot separator, when parenthetical present) OR `bhagavata_10.<chapter>_<fallbackChunkN>` fallback (underscore separator, when parenthetical absent). 69.2% of chunks anchored — structural ceiling per fallback-chunk audit.
- **Chunk count:** parser emitted 633 chunks → post-process em-dash merge consolidated to **568 chunks** (63 pairs joined: 62 resolved cleanly, 1 unresolved deep chain, 2 oversize merges flagged for review). Final ingest: **568 rows** with 768-dim Gemini embeddings.
- **Cost:** ~₹907 total (₹897.53 Sonnet 4.6 Hindi regen + ₹1.10 Gemini embedding + ₹8.22 pressure-test). 40–98% under per-stage estimates.
- **Quality gate:** 20-chunk stratified spot-check across 5 register groups → **20/20 PASS** (independently verified). 5-query retrieval test → **3/5 surface Bhagavata content** in top-5 (queries 1, 2, 5 PASS; queries 3 + 4 return semantically valid Gita matches that outrank Bhagavata equivalents on cosine similarity — accept as expected pre-Phase-2 behavior, same precedent as Phase 1.5 anger-query carry-forward).
- **Test queries (validated):** "बारिश में चाय पी, बहुत अच्छा लगा" → 5/5 Bhagavata (all from ch 20 rainy-season). "I miss someone deeply" → 1/5 Bhagavata (10.87.34) + 3 MBh + 1 Gita 2.8. "मैं छोटी सी ख़ुशी महसूस कर रहा हूँ" → 0/5 Bhagavata (Gita 16.13/16.14 outscore, Phase 2 retuning). "I'm overwhelmed and want to surrender" → 0/5 Bhagavata (Gita 18.66 dominant, Phase 2). "I want to be playful, not serious" → 1/5 Bhagavata (10.30.11) + 2 Gita + 2 MBh.
- **Carry-forward to Phase 1.7:**
  - **0% cache hit rate** across 633 Sonnet calls. SYSTEM_PROMPT measures ~1500 tokens (above 1024 minimum), so below-threshold theory ruled out. Investigate `cache_control` placement / SDK version before Phase 1.7 full run. Investigation notes: `test-results/phase1.6-regen-full-run.md`.
  - **Em-dash cleanup + OCR fix patterns** (8→3 leading-digit gate, tilde separator, inline parenthetical fallback) — inherit verbatim from `scripts/parse-bhagavata.ts` and `scripts/fix-em-dash-endings-bhagavata.ts`.
  - **Narrator-tag form variation** (बोले vs ने कहा) — monitor in Phase 1.7 spot-check; if persists, consider v1.2 glossary lock.
  - **1/633 ग्वाला** accepted as contextual exception at `bhagavata_10.54.9` (villain-contempt register about Krishna). Threshold for Phase 1.7 same: ≤0.5% with per-instance documentation.

## Phase 1.7 — Uddhava Gita (Bhagavata 11.6–29) (weeks 7–8, COMPLETE 2026-05-02)

- **Goal:** Ingest Krishna's final teaching to Uddhava ("the second Gita") — practical bhakti, real-world dharma, complement to the more cosmological Bhagavad Gita.
- **Source:**
  - **English:** J. M. Sanyal *Srimad-Bhagavatam* Vol 5 only (`qpbw_…` Sarayu/UP-Museum CC0 archive.org scan; same edition + license-fallback chain as Phase 1.6). Vol 5 BOOK XI body slice (lines 7448–14174 inclusive) covers all of Canto 11 / Sanyal Book XI in 31 chapters; Phase 1.7 scope-filters to chs 6–29 via `--chapters=6-29` (skipping the Yadu-curse / Nimi-Yogendras prelude in chs 1–5 and the Mausala / Krishna-departure coda in chs 30–31).
  - **Hindi:** regenerated 2026-05-02 via Claude Sonnet 4.6 + v3 system prompt + **Bhagavata addendum v1.1 (locked permanent for all Bhagavata phases, no v1.2 needed)**. v1.1's "Canto 10 voice is lyrical" framing was tested explicitly against Uddhava-Gita didactic / theoretical content in the Phase 1.7 dry-run; the model takes register cues from source text first and does not import inappropriate Vrindavan imagery into philosophical chunks (5/5 dry-run register match → confirmed at full scale by 9d Sanskrit-philosophical-term preservation across the 20-chunk spot-check, 116 target-term occurrences with 0 dilutions). Total Sonnet spend ₹231.18 across 162 chunks.
  - **Sanskrit:** intentionally **not attached** at this phase (mirrors Phase 1.5 BORI deferral and Phase 1.6 Canto 10). All Phase 1.7 Bhagavata rows have `sanskrit = ''` and `sanskrit_source = NULL`. Sanskrit alignment is a Phase 9+ audit, where it will also settle the Sanyal-vs-standard per-chapter content audit (see Curation note).
- **Sanyal-vs-standard chapter alignment:** Sanyal Book XI = standard Canto 11. **1:1 chapter count (both 31 chapters), 1:1 alignment verified at Sanyal Ch VI = std 11.6 boundary** (Devas-at-Dwaraka opening). Per-chapter content audit for chs 7–29 deferred to Phase 9+ Sanskrit-attachment milestone.
- **Curation:** Sanyal chs 6–29 (Phase 1.7 = `--chapters=6-29` filter applied during parse). Chs 1–5 (Yadu curse + Nimi-Yogendras), 30 (Mausala), 31 (Krishna's departure) intentionally skipped — these are narrative bookends rather than the Uddhava-frame teaching itself.
- **Chunk strategy:** Same as Phase 1.6 (paragraph-batched within chapter; Sanyal is literary prose with sporadic `(N—M)` verse-range parentheticals). Reference format inherits: `bhagavata_11.<chapter>.<verseStart>` anchored / `bhagavata_11.<chapter>_<fallbackChunkN>` fallback.
- **Chunk count:** parser emitted 162 chunks → post-process em-dash merge consolidated to **159 chunks** (3 pairs joined, all resolved cleanly to terminal punctuation; 0 deep chains, 0 oversize merges, 0 footnote strips). Final ingest: **159 rows** with 768-dim Gemini embeddings. Original ~700-chunk roadmap estimate **4.4× over actual** — Sanyal compresses Bhagavata prose denser than expected, identical lesson to Phase 1.6 (633 chunks vs ~3,000 estimate). Re-baseline future Bhagavata-canto chunk estimates from this ratio.
- **Anchor rate:** 82.1% anchored (133 / 162) — **higher than Canto 10's 69.2%**. Sanyal Book XI uses verse-range parentheticals more methodically than Book X's longer narrative paragraphs. The 17.9% fallback chunks are mostly the avadhūta-Brahmana speech intros (chs 7–9) and dialogue-frame transitions where source has no verse-range labels.
- **Cost:** ~₹231.46 total (Sonnet 4.6 Hindi regen ₹231.18 — includes the ₹7.41 dry-run pressure-test + Gemini embedding ₹0.28). Tracks the Phase 1.6 baseline of ₹1.43/chunk almost exactly.
- **Quality gate:** **18/20 stratified spot-check PASS + 3/5 retrieval** (acceptance was ≥17/20 + ≥3/5; threshold lowered from Phase 1.6's ≥4/5 retrieval because the 159-chunk corpus competes against ~3,200 rows of Gita + Mahabharata + Canto 10). Report: `test-results/phase1.7-quality-gate-result-2026-05-02.md`. The 2 spot-check FLAGs (`bhagavata_11.22.19` + `bhagavata_11.29_4`) are the pre-existing 1.3% non-terminal class — English source truncates mid-clause at parser-induced chunk boundary, em-dash merger doesn't catch non-dash residual fragments. Same mechanism as Phase 1.6 residual; not a Phase 1.7 regression.
- **Test queries (validated):** "मुझे रोज़मर्रा की ज़िंदगी में भक्ति कैसे करनी है?" / "how do I practice devotion in everyday life?" → 3/5 Bhagavata in top-5 (`11.14.21`, `11.18.42`, `11.19.15` — practical bhakti chapters surface). "I learn from everything around me" → 3/5 Bhagavata (the actual avadhūta 24-gurus content surfaces: `11.7.25` Yadu-asks-Brahmana + `11.8_1` black-bee-guru + `11.8_2` fish-guru). "I want to surrender but don't know how" → 0/5 Bhagavata (Gita 18.66 / 12.11 dominate by cosine; same compact-verse-bias as Phase 1.5 anger and Phase 1.6 ख़ुशी / surrender queries). "What is real renunciation?" → 0/5 Bhagavata (Gita 18.11 / 6.2 / 18.49 dominate). "मुझे संसार से वैराग्य हो गया है" → 2/5 Bhagavata (`11.8_3` Pingala-story + `11.23.22` mother-as-guru — both excellent content matches).
- **Carry-forward to Phase 2:**
  - **Structural Gita-compact-verse-cosine-bias** (failing queries 3 + 4) — same retrieval issue surfaced in Phase 1.5 (anger query) and Phase 1.6 (queries 3 + 4). Address in Phase 2 via theme tags / query rewriting / source-aware retrieval boost.
  - **2/159 residual non-terminal chunks** (`bhagavata_11.22.19`, `bhagavata_11.29_4`) — pre-existing 1.3% class, parser truncates English mid-clause at chunk boundary, em-dash merger only catches dash-terminal cases. Either fix with a generalized non-terminal merger in Phase 2, or accept as Phase-9+ corpus polish.
- **Carry-forward to Phase 9+:**
  - **0% cache hit rate confirmed at full scale** (162 calls; 1,317-token SYSTEM_PROMPT verified above 1,024 cache minimum via `messages.countTokens`; 3-call sequential probe in `scripts/count-system-prompt-tokens.ts` reproduces 0 cache_creation + 0 cache_read). Root cause unknown — candidates in `test-results/phase1.7-cache-investigation.md`: model-specific eligibility, beta-header drift, API-tier gating, ephemeral-TTL default change. Reopen with Sanskrit-attachment milestone when prompt size + cache savings get bigger.
  - **Sanyal Book XI per-chapter content audit** for chs 7–29 (alignment with standard Canto 11 verified at boundary, but per-chapter content audit needs Sanskrit BORI attachment).

Phase 2 — RAG retuning (weeks 8–9, COMPLETE 2026-05-02): RAG retuning
  across 4 corpora — theme tagging, source-aware reranking, query
  rewriting, regression-tested against Phase 1.5/1.6/1.7 failing queries.
  3,132 rows tagged via Sonnet 4.6 against the locked 34-tag Decision-#17
  taxonomy (~₹1,204 total spend). Two layers shipped default-on:
    L1 — theme-overlap reranking (RAG_THEME_WEIGHT=0.3)
    L2 — source-aware diversity boost (cosine threshold 0.65)
  L3 (query rewriting) implemented but ships disabled — ablation showed
  +1 failing improvement at cost of +2 passing regressions; available
  behind RAG_LAYER_QUERY_REWRITE flag for Phase 7 beta toggle.
  Resolution: failing-query gain +5 vs baseline (Q1.5.2 lifted to 5/5
  MBh; Q1.7.2 surfaced first Bhagavata via L2 force-include at cosine
  0.659; smaller wins on Q1.5.1, Q1.7.1). 3 passing regressions remain
  (1 real — Q1.7.4 query-classifier weakness, Phase 3 follow-up; 2
  borderline source-mix shifts not regressions in emotional terms).
  See decisions.md row + PROJECT_HISTORY.md Phase 2 entry +
  test-results/phase2-regression-{baseline,layer1,layer1-2,final}-2026-05-02.md.
Phase 2.5 — Temple-aesthetic UI + verse-card source-aware refs (week 9,
  COMPLETE 2026-05-03). Verse-card foundation: parseReference + formatReferenceLabel
  handle all 4 ref formats (Gita anchored + split, MBh, Bhagavata anchored
  + fallback) with Hindi/English labels per user input language; source
  badges (saffron Gita / deeper-maroon MBh / indigo Bhagavata, all WCAG AA
  on parchment); empty-Sanskrit handling renders Hindi + English + a
  "Phase 9+ audit pending" footer caveat. Visual identity foundation:
  6 semantic color tokens (devotional, sacred, krishna, brass, parchment,
  peacock + dark text variants devotional-dark, brass-dark) in globals.css
  @theme inline; Noto Sans Devanagari + Cormorant Garamond via next/font;
  3 Krishna-presence motifs (PeacockFeather as photographic next/image,
  Bansuri + LotusMandala inline SVG); temple atmosphere (parchment gradient
  + lotus mandala watermark at 6% opacity + peacock-feather header +
  bansuri input accent). Tooling: Playwright + scripts/screenshot-chat.ts
  with --mock flag (zero-API-cost iteration), Lighthouse mobile audit,
  scripts/cls-slow3g-check.ts + scripts/contrast-check.ts. Mobile QA:
  Lighthouse accessibility 100/100, CLS 0.0087 at Slow 3G, 9/9 WCAG AA
  contrast pass (min 5.44:1). Spend ~₹100. Phase 11 static avatar work
  explicitly NOT preempted. Carry-forward to Phase 6: re-audit on Vercel
  prod for LCP improvement; reuse cls-slow3g-check + contrast-check
  scripts. Carry-forward to Phase 3: persona prompt should weave verse-
  reference identity (e.g., "as I told Arjuna long ago") consistent with
  the new label vocabulary (Bhagavad Gita / Mahabharata / Srimad Bhagavatam).
  See decisions.md row + PROJECT_HISTORY.md Phase 2.5 entry +
  test-results/phase2.5-mobile-qa-2026-05-03.md +
  test-results/phase2.5-{baseline,step3-badges,step67-atmosphere,step67b-peacock-png,mobile-qa,design-system,mock-smoketest}-screenshots/.
Phase 2.6 — Chat-route prompt-cache fix (week 9, COMPLETE 2026-05-03).
  Resolves the 0% cache hit rate that's been carried forward from
  Phase 1.6/1.7/2. Root cause: Sonnet 4.6 raised the minimum cacheable
  prompt from 1,024 (Sonnet 4.5/4) to **2,048 tokens** — model-specific
  change in the Anthropic docs. Phase 1.7's "1,317 > 1,024 so should
  cache" check tested the wrong threshold. Documented silent-failure
  mode: short prompts return both cache_creation and cache_read = 0,
  exactly our symptom. **Fix on `src/app/api/chat/route.ts`:** restructure
  `system` from one plain string to two structured blocks — block 0 is
  the persona (`SYSTEM_PROMPT`, 5,303 tokens, stable across turns) with
  `cache_control: { type: "ephemeral" }`; block 1 is the dynamic
  USER CONTEXT + RELEVANT SCRIPTURE (mutates per turn). Pre-fix single-
  cached-block setup wrote 1.25× tax with zero reads (5-turn measurement
  confirmed). Post-fix verification: turn 1 cache_creation=5,303
  cache_read=0; turns 2-5 cache_creation=0 cache_read=5,303 (100% hit
  rate, beat the ≥90% acceptance criterion). Cost reduction ~34% on
  input portion of a 5-turn session. Permanent `[chat] sonnet usage:`
  telemetry log line on every chat turn. Regen scripts NOT modified
  (their 1,317-token SYSTEM_PROMPT is still below the 2,048 minimum,
  cache_control directive continues as harmless no-op there; will
  activate naturally if Phase 9+ Sanskrit attachment grows the regen
  prompt past 2,048). Total spend ~₹15 (under ₹20 budget). See
  decisions.md row + PROJECT_HISTORY.md Phase 2.6 entry.
Phase 3 — Krishna persona prompt (weeks 10–11, COMPLETE 2026-05-05): re-
  iterated systemPrompt.ts with full-corpus retrieval. Round 4 edits
  shipped (mode rotation §2, Arjuna rate limit §6, Vrindavan/Bal joy
  example §4) plus Phase 3 close-out additions (§3.5 PARALLEL-MAPPING with
  eight named life-parallels, §3 HINDI REGISTER tatsama guidance, §4.6
  SATSANG ARC multi-turn pacing + open-thread ending rule + closure-
  benediction ban, §12 INCLUSION INVARIANT decoupling persona from Gita
  Press editorial baggage). 76-case harness (57 baseline + 11 PM + 8
  inclusion) clean on all invariants. UI polish bundled in: Bansuri inline-
  SVG → PNG with attached peacock feather, chat body text-sm → text-base,
  verse-pill compacted to text-xs (WCAG 2.5.5 accepted regression). Phase
  3.9 (NDJSON streaming + saveMemory defer, transport-only) landed in a
  follow-up commit; 7/7 acceptance tests pass. Reports:
  test-results/phase3-3.5b-3.5c-3.6a-combined-2026-05-05.md +
  test-results/phase3.9-streaming-tests-2026-05-05.md.
Phase 4 — Safety + name collection (week 12, NEXT): self-harm classifier,
  helpline cards, name flow, content filter, disclaimer bar.
Phase 5 — Seva donation + auth (week 13): Razorpay one-time UPI checkout
  (Razorpay Subscriptions module NOT integrated). Four seva tiers — Pratham
  ₹11/6 msg, Anjali ₹51/30, Bhakti ₹101/60, Param ₹501/350. Pay-as-you-go
  only at v1. Optional email-OTP auth.
Phase 6 — Polish + deploy (weeks 14–15): mobile QA, Sentry, Plausible,
  privacy/terms, Vercel + custom domain.
Phase 7 — Closed beta (weeks 16–17): 50 friends, read every conversation,
  tune prompt and paywall.
Phase 8 — Public launch (weeks 18–19): Reddit, X, Product Hunt.
Phase 9  (Month 4 post-launch)  — Krishna Plus subscription (₹499/mo, 450
  msg/mo pool, no daily cap, resets on renewal date). Razorpay Subscriptions
  + UPI AutoPay, webhooks for subscription.charged / cancelled / halted.
  Hybrid model: seva tiers continue alongside.
Phase 10 (Month 6 post-launch)  — Hindi one-way TTS (Krishna Voice ₹999/mo).
  ElevenLabs voice clone or Google Cloud TTS. ~₹0.30/reply cost. User does
  NOT speak.
Phase 11 (Month 9 post-launch)  — Static Krishna avatar (Pichwai/Tanjore
  stylized art, NOT photoreal, NOT celebrity-based). Same Krishna Voice
  tier. No animation.
Phase 12 (Month 12 post-launch) — Async voice messaging (user records voice
  notes; Whisper/Google STT transcribes; Krishna replies text + audio).
  Same Krishna Voice tier; fair-use cap may be added after cost testing.
Phase 13 (Month 18+ post-launch) — Real-time two-way voice call (Krishna
  Premium ₹2,999/mo). 3–6 month engineering effort. Only built if Krishna
  Voice has 500+ active subscribers and clear demand.

NEVER planned: animated/lip-synced AI video avatars (₹50–300/min/user
  financial trap), real-time video calling (₹200–600/min, unviable for
  solo-founder economics).

Other Phase 9+ work (parallel tracks): additional Bhagavata cantos,
  Harivamsa, Brahma Vaivarta Purana, regional Krishna texts (Surdas,
  Mirabai, etc.), daily reflection feature, React Native wrap.

# Key invariants (don't break these)

- Krishna never breaks character to lecture about being an AI
- Krishna never names modern things (translate to feeling)
- Krishna acknowledges before challenging (always)
- Service role key is server-only, NEVER reaches the browser
- Supabase errors silent-fail by design — chat must keep working
- Verify Next 16 and Tailwind v4 APIs against current docs (don't assume 
  v3/v14 patterns)
- All major changes verified with `npm run build` before declaring done
- Schema changes need SQL given to me to run manually — no migration tooling
- .next/ cache can drift on big edits — if behavior seems stale, 
  Remove-Item -Recurse -Force .next then npm run dev

# Current phase

[REPLACE EACH SESSION. Examples:
- "Phase 1, Day 2 — Gita JSON downloaded to data/gita.json, verses table 
  not created yet. Need help writing the schema migration SQL and the 
  ingestion script."
- "Phase 2 — verses ingested, similarity search working. Today: modify 
  /api/chat to include retrieval before generation."
- "Phase 4 — self-harm classifier needs implementation. Plan first."]

# How I want you to behave

- Direct and honest. Push back when an idea is bad. No flattery.
- I make product decisions; you give technical depth and reasoning.
- Small reviewable chunks. Show one file at a time, let me review before 
  moving on.
- Read the file before editing it. No blind rewrites.
- After significant changes, run `npm run build` to verify.
- For Supabase schema changes, give me the SQL to paste into the SQL Editor.
- Verify Next 16 and Tailwind v4 APIs against current docs before using.
- Flag when I'm polishing instead of shipping. The current phase is the 
  shipping target, not perfecting.

# What I want right now

[REPLACE EACH SESSION with the specific ask. Examples:
- "Phase 1 Day 2 — write the verses table schema and the Gita ingestion 
  script. Show schema first, let me run it manually, then the script."
- "Here's a Hindi reply from the live app: [paste]. Diagnose which rule of 
  the Krishna persona prompt was violated and propose a targeted edit."
- "Phase 5 — replace /api/pay stub with Razorpay UPI seva tiers. One file 
  at a time."]