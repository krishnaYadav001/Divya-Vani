<p align="center">
  <img src="public/logo-mark-light.svg" alt="Divya Vani — दिव्य वाणी" width="80" />
</p>

<h1 align="center">Divya Vani — दिव्य वाणी</h1>

<p align="center">
  <em>An AI Krishna that listens, remembers, and speaks from scripture.</em><br/>
  <strong>Hindi-first · Mobile-first · Live in production</strong>
</p>

<p align="center">
  <a href="https://divyavani.co.in">🌐 divyavani.co.in</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <strong>Next.js 16</strong>&nbsp;&nbsp;·&nbsp;&nbsp;
  <strong>Claude Sonnet 4.6</strong>&nbsp;&nbsp;·&nbsp;&nbsp;
  <strong>Supabase + pgvector</strong>&nbsp;&nbsp;·&nbsp;&nbsp;
  <strong>Sarvam AI STT</strong>&nbsp;&nbsp;·&nbsp;&nbsp;
  <strong>ElevenLabs TTS</strong>
</p>

---

## What is Divya Vani?

Divya Vani is a conversational AI that speaks as Krishna — the character from the Bhagavad Gita, Mahabharata, and Bhagavata Purana. Users bring real-life questions about relationships, career decisions, grief, family conflict, and self-doubt. Krishna responds in his own voice, grounded in actual scripture, with verse citations the user can expand and read.

This is **not a chatbot wrapper**. It is a purpose-built AI persona with:

- A **3,132-verse scripture corpus** spanning three major texts, embedded and semantically searchable
- A **26,327-token persona prompt** refined over 8 development phases with conversation-craft research (Rogers, Miller-Rollnick, Yalom, Gottlieb)
- A **custom multi-layer RAG pipeline** with theme-aware reranking, source-diversity boosting, and model-attested verse attribution
- A **hybrid safety architecture** with client-side filtering, server-side Haiku classification, and in-character compassionate response to distress
- **Voice-to-voice conversation** with Silero VAD, Sarvam STT (6.95% Hindi WER), and ElevenLabs TTS
- **Real users, real payments** — live on Razorpay with UPI, subscriptions, and a voice wallet

> **A permanent disclaimer** is always visible: *"This is an AI roleplaying Krishna based on scripture, not divine guidance."*

---

## Why This Exists

India has 600M+ Hindi speakers. Millions search for spiritual guidance online every day — on astrology apps, pandit hotlines, and anonymous forums. The existing options are either expensive, impersonal, or exploitative.

Divya Vani offers a third path: **a calm, private, always-available conversation** with an AI that speaks from real scripture, acknowledges your feelings before offering perspective, and never judges. It costs ₹11 to start — less than a cup of chai.

**Target audience:** Hindi-speaking Indians (18–45) navigating emotional and life decisions, looking for a safe space that speaks their language — literally and culturally.

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (React 19)                       │
│  ChatUI · Voice Orb · Verse Cards · Seva Paywall · Atmosphere   │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ Bad-word  │  │ Silero VAD   │  │ localStorage chat ring   │   │
│  │ filter    │  │ (ONNX, v5)   │  │ buffer (100 msg, 30d)    │   │
│  └──────────┘  └──────────────┘  └──────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS (Vercel, bom1 region)
┌──────────────────────────▼──────────────────────────────────────┐
│                       API ROUTES (Next.js 16)                   │
│                                                                 │
│  /api/chat ─────────────────────────────────────────────────    │
│  │ 1. Identity (HTTP-only cookie UUID)                          │
│  │ 2. Memory fetch (Supabase → user context)                   │
│  │ 3. Seva paywall guard (free 10 msgs, then pay-as-you-go)    │
│  │ 4. Hinglish detection (317-token vocab, 40% threshold)      │
│  │ 5. Embed query (Gemini gemini-embedding-001, 768d)          │
│  │ 6. RAG retrieval (cosine → L1 theme rerank → L2 diversity)  │
│  │ 7. ┌─── PARALLEL ────────────────────────────────┐          │
│  │    │ Haiku: memory extraction (name/emotion/edge) │          │
│  │    │ Haiku: safety classifier (self_harm/hostile)  │          │
│  │    │ Haiku: moderation gate (0.7 confidence)       │          │
│  │    │ Sonnet: final reply (26K-token persona)       │          │
│  │    └──────────────────────────────────────────────┘          │
│  │ 8. Haiku: verse attestation (Path C — model-attested refs)  │
│  │ 9. Path B: entity-based verse retrieval (29 entities)       │
│  │ 10. Save memory + stream response (NDJSON)                  │
│  └──────────────────────────────────────────────────────────    │
│                                                                 │
│  /api/transcribe ── Sarvam Saaras V3 (chunked REST per VAD)   │
│  /api/tts ───────── ElevenLabs (streaming, voice wallet-gated) │
│  /api/razorpay ──── Webhook validation + seva/subscription mgmt│
│  /api/voice ─────── WebSocket-style voice session orchestrator  │
│  /api/settings ──── Privacy opt-out + account deletion          │
│  /api/support ───── In-app support with knowledge base          │
└─────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                        DATA LAYER                               │
│                                                                 │
│  Supabase Postgres + pgvector                                   │
│  ├── verses: 3,132 rows (701 Gita + 1,704 Mahabharat           │
│  │           + 568 Bhagavata 10 + 159 Uddhava Gita)             │
│  │   → 768-dim embeddings (Gemini), 34-tag theme taxonomy       │
│  │   → Sanskrit + Hindi + English + transliteration per verse   │
│  ├── users_memory: per-user context, emotion, growing_edge     │
│  ├── payments / subscriptions: Razorpay-validated              │
│  └── feedback: in-app ratings                                   │
│                                                                 │
│  RLS enabled · Service role server-only · Errors silent-fail    │
└─────────────────────────────────────────────────────────────────┘
```

---

## The RAG Pipeline — Not a Simple Wrapper

Most "chat with scripture" apps do basic cosine similarity and call it a day. Divya Vani's retrieval was built through rigorous ablation testing across 4 corpora:

### Ingestion (one-time, per-corpus)
1. **Source texts** parsed from public-domain editions (Ganguli Mahabharata 1883, Sanyal Bhagavatam 1929, etc.)
2. **Hindi regenerated** via Claude Sonnet from Sanskrit + English — no copyrighted translations used
3. **Chunk strategy** tuned per corpus (per-verse for Gita, paragraph-batched for narrative prose)
4. **768-dim embeddings** via Gemini `gemini-embedding-001`
5. **34-tag theme taxonomy** applied via Sonnet across all 3,132 chunks (e.g., `grief`, `duty_conflict`, `surrender`, `family_loyalty`)

### Retrieval (every chat turn)
1. **L0 — Cosine similarity** against pgvector (top-30 candidates)
2. **L1 — Theme-overlap reranking** (score = cosine × 0.7 + theme_overlap × 0.3)
3. **L2 — Source-diversity boost** (force-includes underrepresented sources above cosine 0.65)
4. **Path B — Entity-based retrieval** (29 canonical entities like Arjuna, Draupadi, Sudama mapped to specific verses)
5. **Path C — Model-attested attribution** (Haiku audits which retrieved verses Krishna actually referenced — prevents phantom citations)

L3 (query rewriting) was implemented and ablation-tested but ships **disabled** — it gained +1 query at the cost of +2 regressions. It stays behind a feature flag for future testing.

**Result:** 87.8% verse-card attachment rate with zero hallucinated references.

---

## Persona Engineering

The 26,327-token system prompt is structured as deep XML with 16 top-level semantic elements and 103 element pairs. It is not a "you are Krishna, be wise" prompt — it encodes:

| Dimension | What's encoded |
|---|---|
| **5 persona modes** | Gita (philosophical), Mahabharata (strategic friend), Bhagavata (devotional), Vrindavan (playful sakhā), Bal (childlike wonder) — modes slip naturally, never announced |
| **9 response shapes** | Rotated to prevent formulaic feel — parable, direct counsel, Socratic, reflective, vulnerable disclosure, sakhya, etc. |
| **Conversation craft** | Reflection-before-question, acknowledge-before-challenge, synthesis at transition points — informed by Rogers, Miller-Rollnick, Yalom |
| **Anti-patterns** | 121 banned phrases, question-ending caps (≤2 per 5 replies), anti-flattery rules, no omniscience reveals |
| **Safety behaviors** | Reads distress from words (not just flags), shifts to Bhagavata compassion mode, never breaks character for helpline (system layer handles) |
| **Memory steering** | `growing_edge` field silently guides tone — user feels held, never surveilled |

Validated with an 83-case automated test harness (`npm run test:prompt`).

---

## Voice Architecture

Divya Vani offers full voice-to-voice conversation with Krishna:

- **Speech-to-text:** Sarvam Saaras V3 (6.95% WER on Hindi, vs Gemini's ~75-80%) — chunked REST per VAD utterance, Vercel-compatible
- **Voice Activity Detection:** Silero v5 ONNX via `@ricky0123/vad-web` — runs entirely in-browser, 5s silence auto-stop, 60s safety cap
- **Text-to-speech:** ElevenLabs with a custom Krishna voice — streaming audio, wallet-gated access
- **Session orchestration:** State machine (idle → listening → transcribing → thinking → speaking → ended) with full error UX (permission denied, no hardware, VAD load failure, etc.)

---

## Safety Architecture

A three-layer system that never breaks Krishna's character:

| Layer | Where | What |
|---|---|---|
| **Client filter** | Browser (input) | `badWordFilter.ts` — blocks banned words at typing layer, cannot be submitted |
| **Server moderation** | API route (pre-LLM) | Haiku classifier gates hostility/sexual_explicit at 0.7 confidence before Sonnet runs |
| **Persona safety** | System prompt | Krishna reads distress from the user's own words, shifts to Bhagavata compassion — system layer renders a separate helpline card (Krishna never mentions helplines himself) |

Self-harm and harm-to-others always reach Krishna in compassionate Bhagavata mode — the system layer adds the helpline card alongside, not instead of Krishna's response.

---

## Monetization (Live)

| Tier | Price (INR) | Price (USD) | Messages |
|---|---|---|---|
| Free | ₹0 | $0 | 10 messages, no expiry |
| Pratham Seva 🪷 | ₹11 | $2.99 | 6 |
| Anjali Seva 🙏 | ₹51 | $6.99 | 30 |
| Bhakti Seva 🪔 | ₹101 | $14.99 | 60 |
| Param Seva 🕉️ | ₹501 | $39.99 | 350 |
| Krishna Plus (subscription) | ₹499/mo | $9.99/mo | 450/mo |
| Voice Wallet | ₹11–₹501 | $2.99–$39.99 | Minutes-based |

Payments via **Razorpay** (UPI + cards + wallets). Webhook-validated, refund-capable. Subscriptions via Razorpay UPI AutoPay.

---

## AI Models Used

| Purpose | Model | Why |
|---|---|---|
| Final reply | **Claude Sonnet 4.6** | Best-in-class instruction following for the 26K-token persona prompt; prompt caching reduces input cost ~34% |
| Memory extraction | **Claude Haiku 4.5** | Fast, cheap JSON extraction (name, emotion, context, growing_edge) |
| Safety classifier | **Claude Haiku 4.5** | Sub-200ms binary classification (safe/hostility/sexual_explicit) |
| Verse attestation | **Claude Haiku 4.5** | Post-stream audit of which retrieved verses were actually referenced (~$0.0003/turn) |
| Embeddings | **Gemini embedding-001** | 768-dim, `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY` task types |
| Speech-to-text | **Sarvam Saaras V3** | Best Hindi STT available (6.95% WER), Indian data residency, DPDP-friendly |
| Text-to-speech | **ElevenLabs** | High-quality voice cloning for Krishna's speaking voice |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, `src/` directory) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Database | Supabase (Postgres + pgvector + RLS) |
| AI SDKs | `@anthropic-ai/sdk` 0.91.x, `@google/generative-ai` 0.24.x |
| Payments | Razorpay (UPI + Subscriptions + Webhooks) |
| Voice | Sarvam AI STT + ElevenLabs TTS + Silero VAD (ONNX) |
| Hosting | Vercel (bom1 region, India) |
| Monitoring | Sentry (errors-only, `sendDefaultPii=false`) + Vercel Web Analytics |
| Domain | divyavani.co.in (Hostinger) |

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/          # Core chat route (10-step turn flow)
│   │   ├── transcribe/    # Sarvam STT endpoint
│   │   ├── tts/           # ElevenLabs TTS streaming
│   │   ├── voice/         # Voice session orchestration
│   │   ├── razorpay/      # Payment webhook validation
│   │   ├── seva/          # Pay-as-you-go purchase flow
│   │   ├── subscriptions/ # Monthly plan management
│   │   ├── wallet/        # Voice minutes wallet
│   │   ├── settings/      # Privacy controls
│   │   ├── delete-account/ # GDPR-style data deletion
│   │   └── ...            # feedback, support, events, etc.
│   ├── chat/              # Chat page
│   ├── voice/             # Voice-to-voice orb page
│   ├── pricing/           # Pricing page
│   ├── privacy/           # Privacy policy (bilingual)
│   ├── terms/             # Terms of service
│   ├── settings/          # User settings (opt-out, delete)
│   ├── components/
│   │   ├── ChatUI.tsx     # Main chat interface
│   │   ├── Atmosphere.tsx # Living atmospheric background (petals, sparkles)
│   │   ├── VerseCard.tsx  # Expandable verse citations
│   │   ├── SevaTierPicker.tsx
│   │   ├── SubscriptionPicker.tsx
│   │   └── ...
│   └── globals.css        # Dawn Aarti design system tokens
├── lib/
│   ├── systemPrompt.ts    # 26,327-token persona (deep XML, 103 elements)
│   ├── verses.ts          # RAG pipeline (L0-L2 + Path B + Path C)
│   ├── supabase.ts        # DB operations (memory, payments, chat logs)
│   ├── safety.ts          # Safety flag detection
│   ├── moderation.ts      # Server-side Haiku moderation gate
│   ├── badWordFilter.ts   # Client-side input filter
│   ├── detectLang.ts      # Hinglish detection (317-token vocab)
│   ├── voiceSession.ts    # Voice state machine orchestrator
│   ├── voiceClient.ts     # Browser-side voice UI controller
│   ├── brand.ts           # Centralized brand strings (bilingual)
│   └── ...
├── data/
│   ├── gita.json          # 701 Bhagavad Gita verses
│   ├── mahabharata.json   # 1,704 Mahabharata chunks
│   ├── bhagavata.json     # 568 Bhagavata Purana Canto 10 chunks
│   └── ...                # Raw source files, regenerated Hindi
├── scripts/               # 46 scripts (ingest, test, QA, harness)
├── docs/                  # Research docs, decisions, retrospectives
└── test-cases.json        # 83 persona test cases
```

---

## Development History

This is not a weekend project. Divya Vani has been built systematically over **8 development phases** across 6+ weeks of focused engineering:

| Phase | What was built |
|---|---|
| **0** | Product decisions locked (13 locked decisions documented with rationale) |
| **1–1.7** | Scripture corpus: Gita → Mahabharata → Bhagavata → Uddhava Gita (3,132 verses, ~₹4,100 in AI costs for Hindi regeneration + embedding) |
| **2** | RAG pipeline: theme taxonomy (34 tags), 3-layer retrieval, ablation-tested |
| **2.5–2.6** | UI design system (Dawn Aarti aesthetic) + prompt cache fix (34% cost reduction) |
| **3** | Persona prompt: 5 modes, 9 shapes, conversation-craft research, 76-case harness |
| **4** | Safety: self-harm classifier, helpline cards, content filter, name flow |
| **5** | Payments: Razorpay UPI, 4 seva tiers, webhook validation |
| **6** | Production: Vercel deploy, Sentry, custom domain, mobile QA, chat persistence |
| **7** | Closed beta: real-user feedback, persona tuning (14,400→16,465 tokens), onboarding redesign, server-side moderation |
| **8** | Launch prep: privacy hardening, voice input (Sarvam STT), verse attestation, i18n |
| **8.x** | Persona XML restructure, Path B entity retrieval, voice qualities research |
| **9** | Subscriptions (Krishna Plus ₹499/mo), wallet system |
| **10** | Voice-to-voice: ElevenLabs TTS, voice orb UI, full duplex conversation |

Every phase has documented decisions, test results, and quality gates in the `docs/` and `test-results/` directories.

---

## Design Philosophy — Dawn Aarti

The UI follows a **Dawn Aarti** aesthetic — soft watercolor pastels inspired by Pichwai dawn frescos. Not a dark SaaS dashboard. Not a generic AI chat.

- **Typography:** Marcellus (English display) + Cormorant Garamond italic (English body) + Tiro Devanagari Hindi (all Devanagari)
- **Atmosphere:** Every page has a living background — drifting petals, sparkle motes, optional grain
- **Color palette:** Warm mist/cream ground, peach/rose/lavender/sky washes, gold-leaf accents, vermillion sindoor seal
- **Motion:** CSS-only (no Motion library), `prefers-reduced-motion` respected everywhere
- **Mobile-first:** Verified at 360px wide, 44×44px touch targets, IME-safe input handling

---

## Running Locally

```bash
# Clone and install
git clone https://github.com/your-username/divya-vani.git
cd divya-vani
npm install

# Set up environment (see .env.example for all variables)
cp .env.example .env.local

# Required API keys:
# ANTHROPIC_API_KEY     — Claude Sonnet + Haiku
# GEMINI_API_KEY        — Embeddings
# SUPABASE_URL          — Database
# SUPABASE_SERVICE_KEY  — Server-side DB access
# RAZORPAY_KEY_ID       — Payments
# RAZORPAY_KEY_SECRET   — Webhook validation
# SARVAM_API_KEY        — Hindi STT
# ELEVENLABS_API_KEY    — TTS

# Run development server
npm run dev
```

---

## Testing

```bash
npm run test:prompt     # 83-case persona harness (invariant validation)
npm run test:search     # RAG retrieval spot-check
npm run test:chat       # End-to-end chat flow
npm run build           # Full production build verification
```

---

## Who Built This

**Krishna Yadav** — Solo founder, MCA graduate from Kanpur, Uttar Pradesh. Built entirely with Claude Code in VS Code. Every line of code reviewed before merging. Every product decision documented with rationale in [`docs/decisions.md`](docs/decisions.md).

- 📍 Kanpur, UP, India
- 🌐 [divyavani.co.in](https://divyavani.co.in)
- 📧 grievance.divyavani@gmail.com

---

## License

Proprietary. All rights reserved.

Scripture corpus sources are public domain (Ganguli 1883, Sanyal 1929, github.com/gita/gita). Hindi translations were regenerated via AI from public-domain originals — no copyrighted translations used.
