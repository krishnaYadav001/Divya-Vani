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

## Phase 1.5 — Mahabharata Krishna sections (weeks 3–4)

- **Goal:** Ingest curated Krishna-relevant sections of the Mahabharata — unlocks Mahabharata Krishna mode (the strategic friend who navigated court politics, betrayal, family conflict).
- **Source:** Kisari Mohan Ganguli English translation (1883–1896, public domain via Wikisource and sacred-texts.com). Sanskrit text from BORI critical edition (PD). Hindi: Gita Press editions are canonical but copyright unclear — fall back to PD Hindi editions or paraphrase from Sanskrit + Ganguli.
- **Curation:** Seven parvas where Krishna is a major actor — Sabha (Draupadi disrobing), Vana (exile-period dialogues), Udyoga (peace mission), Bhishma (Krishna outside the Gita itself, since Gita is in Bhishma but already ingested), Drona (Abhimanyu/Jayadratha strategy), Karna (dharma-vs-friendship confrontations), Shanti (post-war wisdom). Skip Adi (background mythology), Stri (lament), Mausala (Krishna's death — defer).
- **Chunk strategy:** By adhyaya (chapter) within parva, sub-chunked at paragraph level or every ~300 tokens, whichever is smaller. Reference format `mb_<parva>_<adhyaya>_<paragraph>` (e.g. `mb_udyoga_92_3`).
- **Chunk count:** ~1,500–2,500 chunks (heavy filtering of a corpus 10× the Gita's size).
- **Time:** 2 weeks. Includes corpus prep (download Ganguli, identify Krishna-relevant adhyayas, parse prose), embed via Gemini `gemini-embedding-001` (768-dim, `taskType: RETRIEVAL_DOCUMENT`), ingest, validate.
- **Test queries:** "मेरे साथ धोखा हुआ" / "I was betrayed by someone close" → Karna or Yudhishthira on betrayal. "मेरे परिवार में लड़ाई है" / "my family won't speak to me" → Pandava-Kaurava politics. "I'm being mistreated unfairly" → Draupadi assembly scene. "I'm angry at someone close" → Krishna's counsel to Bhima or Arjuna outside Gita. "मैं अकेला सही पक्ष में हूँ" → Krishna's peace-mission rejection.

## Phase 1.6 — Bhagavata Purana Canto 10 (weeks 5–7)

- **Goal:** Ingest Krishna's life story (birth through Mathura departure) — unlocks Vrindavan, Bal Krishna, and Bhagavata persona modes. Longest single ingest of Phase 1.
- **Source — license blocker, decide before ingest:** Sanskrit (PD via GRETIL — Göttingen Register of Electronic Texts in Indian Languages). English translations: Prabhupada is **under BBT/ISKCON copyright** — cannot use without license. Modern translations (C. L. Goswami, Edwin F. Bryant) are also under copyright. PD options: H. H. Wilson 1840 (archaic English, retrieval quality will suffer). Hindi: Gita Press copyright unclear; check or paraphrase. **Decision needed:** pay for a licensed translation, accept Wilson PD, or paraphrase from Sanskrit. Recommend: license a modern translation given how much this corpus shapes the Vrindavan / Bal persona quality.
- **Curation:** Full Canto 10, all 90 chapters. Natural arcs: 1–14 birth + Vrindavan infancy (Bal Krishna), 15–35 pre-adolescent Vrindavan (gopi friendships), 29–33 rāsa līlā, 36–49 Mathura departure + Kaṁsa, 50–77 adult Mathura/Dvārakā, 78–90 late-life set-up for Uddhava arrival.
- **Chunk strategy:** Per-verse (Bhagavata verses are self-contained śloka units like the Gita). Reference format `bhagavata_10.<chapter>.<verse>` (e.g. `bhagavata_10.29.21`).
- **Chunk count:** ~3,000 chunks (~33 verses/chapter × 90 chapters).
- **Time:** 3 weeks. Includes ~3 days license clarification, Sanskrit acquisition, translation pairing, parser code, embed, ingest, validate.
- **Test queries:** "बारिश में चाय पी, बहुत अच्छा लगा" → Vrindavan-mood / Bal Krishna joy. "I miss someone deeply" → gopi-virahā (separation), flute themes. "मैं छोटी सी ख़ुशी महसूस कर रहा हूँ" → Bal Krishna mischief episodes. "I'm overwhelmed and want to surrender" → Bhagavata-mode surrender verses. "I want to be playful, not serious" → Bal Krishna butter-stealing / mud-eating.

## Phase 1.7 — Uddhava Gita (Bhagavata 11.6–29) (weeks 7–8)

- **Goal:** Ingest Krishna's final teaching to Uddhava ("the second Gita") — practical bhakti, real-world dharma, complement to the more cosmological Bhagavad Gita.
- **Source:** Same source decisions as Phase 1.6. Uddhava Gita has slightly higher PD-translation availability (some 19th–early-20th-century translations are PD).
- **Curation:** Canto 11, chapters 6–29. Natural arc: 11.6–7 farewell, 11.8–10 bhakti vs jñāna vs karma yoga, 11.11–17 practical paths, 11.18–25 avadhūta-saṁvāda (24 gurus), 11.26–29 final teachings + departure.
- **Chunk strategy:** Per-verse, same as 1.6. Reference format `bhagavata_11.<chapter>.<verse>` (e.g. `bhagavata_11.13.32`).
- **Chunk count:** ~700 chunks (~25–35 verses/chapter × 24 chapters).
- **Time:** 1 week. Smaller corpus, parser/chunker code reused from Phase 1.6.
- **Test queries:** "मुझे रोज़मर्रा की ज़िंदगी में भक्ति कैसे करनी है?" / "how do I practice devotion in everyday life?" → practical bhakti chapters. "I learn from everything around me" → avadhūta-24-gurus passages. "I want to surrender but don't know how" → surrender-path Uddhava dialogues. "What is real renunciation?" → renunciation-vs-engagement verses.

Phase 2 — RAG retuning (weeks 8–9): retrieval rebalanced across all 4
  corpora, verse-card UI labels updated to handle source-aware references
  (gita / mahabharata / bhagavata), regression-test every test_queries case
  from Phases 1–1.7.
Phase 3 — Krishna persona prompt (weeks 10–11): re-iterate systemPrompt.ts
  with full-corpus retrieval available. Apply HELD Round 4 edits — mode
  rotation rule (§2), Arjuna rate limit with alternative parallels (§6),
  Vrindavan/Bal joy example (§4). Re-run test harness end-to-end.
Phase 4 — Safety + name collection (week 12): self-harm classifier,
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