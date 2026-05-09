@AGENTS.md
"see docs/decisions.md for canonical list."
# Divya Vani

> AI-roleplay app. Users chat with a Krishna persona grounded in scripture (Gita, Mahabharata, Bhagavata Purana). Hindi-first, mobile-first, calm tone. Single-user, anonymous-by-default.

This file is the canonical project context. Read this first in every session before changing any code.

## Status

**Phase 6 COMPLETE 2026-05-08 — production live at https://divyavani.co.in with monitoring + analytics + legal + custom domain + mobile-validated + chat history persistence + perf hardening. Sub-phases shipped: 6.1 Vercel deploy + bom1 region pin; 6.2 real Razorpay-delivered webhook validation (5/5 synthetic + 2 real failed + 1 real captured event); 6.X Hinglish detection (Romanized Hindi → Hindi reply, 317-token vocab + 40% match threshold + sticky priorLang); 6.3 Sentry @sentry/nextjs 10.51 (errors-only, sendDefaultPii=false, source maps + release tracking via VERCEL_GIT_COMMIT_SHA, /monitoring tunnel route, flush(2000) fix on serverless onRequestError) + Vercel Web Analytics; 6.4 Privacy Policy + Terms of Service (12 + 16 sections, bilingual summary cards, 72h refund window); 6.5 custom domain divyavani.co.in (Hostinger A record → 216.150.1.1) + per-page canonicals; 6.6 real-device mobile QA (Stage A automated + Stage B manual UPI/keyboard/IME + Stage C-1 fixes); 6.8 localStorage chat history persistence (100-msg ring buffer, 30-day age prune, quota-retry); 6.9.1 sitemap.ts + robots.ts + src/lib/brand.ts centralization + refund auto-debit on full refunds; 6.9.2 Sentry SDK integration paring (~70-103 KiB bundle reduction per page, deterministic) + AVIF on next/image + lotus-mandala lazy-load on /privacy + /terms. PARKED: 6.10 KYC live-keys flip — Razorpay account currently Limited Access, awaiting support response on Full Access upgrade; mini-pass before Phase 8 public launch when granted. Persona cache: 10,065 tokens through Phase 6 (held unchanged across all sub-phases). Phase 7 persona iteration in progress (2026-05-08): §4.6 ENDING PATTERN rebalance + §3 REGISTER MIRRORING + §4.7 SUGGESTION MODE + §3 APPROACHABLE-FIRST + §5 MODERN CONTEXT revision (Locked Decision #5 reversed: brief reference to modern thing allowed once per reply in original register, teaching still from scripture only — old over-translation pattern was reading as evasive) + §9 SHAPE VARIATION (replace vague 'vary the shape' rule with 8 named alternative response shapes + explicit anti-3-act-repetition rule — addresses production feedback that conversations felt formulaic with the acknowledge/parallel/question 3-act pattern repeating). systemPrompt.ts now ~11,200 tokens. badWordFilter.ts / queryThemes.ts unchanged. NEXT: Phase 7 closed beta with 50 friends on test keys (test-mode is fine for closed beta) — see PROJECT_HISTORY.md "Phase 7 carry-forwards" for the work that runs in parallel.**

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

See [`docs/build-roadmap.md`](docs/build-roadmap.md) for the full 19-week phase plan and per-phase technical detail. Quick orientation: Phases 1 / 1.5 / 1.6 / 1.7 (corpus ingest) **complete** as of 2026-05-02; Phase 2 (RAG retuning) is **next**, then Phase 3 (persona prompt) → 4 (safety + name + content filter) → 5 (Razorpay seva) → 6 (mobile QA + Vercel deploy) → 7 (closed beta with 50 users) → 8 (public launch). Phase 9+ post-launch ladder lives in the "Post-launch pricing ladder" table above.
