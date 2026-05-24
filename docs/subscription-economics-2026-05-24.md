# Subscription Economics — Real Per-Unit Cost + Recommended Model

> **Status:** Cost analysis + subscription design, grounded in the *actual shipped* Phase 10–11 architecture (ElevenLabs ConvAI voice, not the Sarvam-Bulbul plan in `phase10-tts-vendor-research.md`). Supersedes the cost assumptions in `phase9-subscription-design.md` (which predates the voice build and never costed voice).
>
> **Author:** Claude advisor pass, 2026-05-24. All vendor pricing WebFetch-verified on this date (see Sources). USD→INR = **₹96/$1** (founder-confirmed 2026-05-24).
>
> **Two scope additions (2026-05-24):** (a) target audience includes **Indian-American / NRI** users via Razorpay International — a parallel USD ladder is added in §7b; (b) the **≤55-word voice reply cap is being removed** — cost impact in §4b.

---

## 1. How the two surfaces actually work (cost-relevant facts)

### Text chat (`/chat` → `/api/chat`)
Per message turn:
- **1× Claude Sonnet 4.6** reply. System prompt = 26,327-token persona (cached, 1h TTL, `cache_control` ephemeral) + uncached dynamic block (5 RAG verses in 4 languages + user context) + last-8-turns history in the messages array. `max_tokens: 3000`.
- **5× Claude Haiku 4.5** calls on a typical ≥25-word turn: `extractMemory` (500 tok), `safetyClassify` (100 tok), `moderateInput` (100 tok), `attestVerseReferences` (200 tok), `extractScripturalEntities` (200 tok).
- **1× Gemini `gemini-embedding-001`** query embedding.

### Voice (`/voice` → ElevenLabs ConvAI React SDK → `/api/agent-llm`)
This is **ElevenLabs Conversational AI** (their agent platform), billed **per conversation-minute**. The SDK owns mic + playback; ElevenLabs does the STT and TTS; it calls our **custom LLM endpoint** for the brain. Per voice turn our endpoint runs:
- **1× Sonnet 4.6**, same 26k cached persona, `max_tokens: 1000`, reply hard-capped to **≤55 words**.
- **3× Haiku 4.5** (memory, safety, moderation — *no* attestation/entity calls on voice path).
- **ElevenLabs ConvAI per-minute fee** covers STT + TTS (Viraj voice) + turn-taking.
- Sarvam Saaras STT is **not** in this path (it only serves the `/chat` mic-dictation feature).

**This is the single most important fact for pricing:** text is metered per *message* and cheap; voice is metered per *minute* and ~5× more expensive. They cannot share one flat "unlimited" bucket.

---

## 2. Verified vendor pricing (2026-05-24)

| Vendor | Unit | Price |
|---|---|---|
| Claude Sonnet 4.6 | input / 1h-cache-write / cache-read / output | $3 / $6 / $0.30 / $15 per MTok |
| Claude Haiku 4.5 | input / output | $1 / $5 per MTok |
| Gemini embedding-001 | input | $0.15 / MTok (free tier exists) |
| ElevenLabs ConvAI | per conversation-minute | **$0.08/min in-plan, $0.16/min overage** |
| Sarvam Saaras STT | per hour | ₹30/hr (₹0.50/min) — text-mic only |
| Razorpay | per transaction | ~2% + 18% GST on fee ≈ **2.4% effective** |

ElevenLabs ConvAI plans: Starter $6 (75 min) · Creator $22 (75) · Pro $99 (275) · Scale $299 (1,238) · Business $990 (3,738 min).

---

## 3. Cost per text message (at scale, warm shared cache)

The persona block is identical for every user, so at any real traffic level it is a **shared cache read** (~$0.30/MTok), and the 1h write cost amortises to ≈0.

| Component | Tokens | Cost (USD) |
|---|---|---|
| Sonnet persona (cache read) | 26,327 | $0.0079 |
| Sonnet dynamic + history + current (uncached input) | ~3,500 | $0.0105 |
| Sonnet output | ~250 | $0.0038 |
| Haiku ×5 | — | $0.0065 |
| Gemini embedding | ~30 | ~$0 (free tier) |
| **Total** | | **≈ $0.029** |

**≈ $0.029 (₹2.8) per message; range ₹2.4–3.8.**

> **Launch caveat:** at low traffic the persona cache goes cold between turns and each cold turn pays a ~$0.16 (₹15) 1h cache *write*, amortised across that hour's traffic. At <10 msg/hour, effective cost is **₹4–5/msg**. It drops toward ₹2.8 only once traffic keeps the cache warm.

---

## 4. Cost per voice minute

| Component | Per minute | Cost (₹) |
|---|---|---|
| ElevenLabs ConvAI (STT+TTS+orchestration) | $0.08–0.16/min | ₹7.7–15.4 |
| Our Anthropic agent-llm (~1.5 turns/min × ~$0.023) | $0.035/min | ₹3.3 |
| **Total** | $0.115–0.195/min | **≈ ₹13–19/min** |

**Plan on ~₹15 per voice minute** (~₹17–19 once on ConvAI overage).

**Headline ratio: 1 voice minute ≈ 1 text message × ~5.** A 5-minute voice call ≈ ₹75 ≈ the cost of ~25 text messages.

## 4b. Effect of removing the ≤55-word voice cap

The cap removal **does not change cost per minute** — ConvAI's per-minute rate is fixed. It changes **minutes consumed per session**: uncapped, Krishna's replies grow from ~25s of speech to 60–120s, so each exchange spans more billed time. Expect a session's billed minutes to **roughly 2–3×** for the same conversational content — a call that cost ₹75 (5 min) can become ₹150–225 (10–15 min). Sonnet output tokens also rise (~90 → ~400 tok ≈ +₹0.4/turn — negligible vs ConvAI).

**Economic consequence:** uncapped voice is **safe under a per-minute wallet** (revenue scales with cost) but **dangerous inside any flat or bundled-minutes tier** (a few long contemplative sessions blow the bundle). Therefore, with the cap removed: keep bundled monthly minutes **modest** and push the bulk of voice onto the wallet.

**Fairness/UX note:** the user can't control Krishna's reply length, so a hard removal means they silently pay (in minutes) for his verbosity. Recommend replacing the hard 55-word truncation with a **soft persona guidance toward natural, complete-but-unpadded replies** (e.g. "speak as long as the moment needs, typically under ~150 words; never pad") rather than literally unbounded rambling. Implementation: edit the `≤55 words` constraint in `src/app/api/agent-llm/.../route.ts` + drop the `tts` truncation; consider an outer ConvAI max-turn-duration as a runaway guard.

---

## 5. The economic problem this creates

1. **A flat "unlimited voice" tier is impossible.** At ₹15/min, a ₹999/mo tier breaks even at **~65 minutes/month (~2 min/day)** — and *less* once the word cap is gone and sessions run longer. Any heavier user is a loss. Our older spiritual audience is *exactly* the segment that will talk for 5–10 min/session.
2. **The existing prepaid seva packs are underwater at face value.** Param ₹501/350 = ₹1.43/msg revenue vs ₹2.8/msg cost. *Every* pack loses money if fully used. They only profit on **breakage** (prepaid messages that go unused — gift-card economics). They work if average utilisation stays under ~50%.
3. **The planned ₹499 / 450-message Plus tier is the same story** — 450 × ₹2.8 = ₹1,260 worst-case COGS vs ₹499. Profitable *only* on breakage (avg subscriber using well under ~165 msgs/mo).

Subscription profitability here rests entirely on breakage + a hard ceiling on the expensive resource (voice minutes). That is normal for AI subs — but it must be designed in, not assumed.

---

## 6. How big tech structures this

- **OpenAI / Anthropic / Google (AI chat):** Free → Plus (~$20) → Pro (~$200). Flat monthly, *soft* caps relying on breakage, advanced/voice features metered with limits. Text-first.
- **Indian voice-consultation (AstroTalk, AstroSage, GaneshaSpeaks):** **per-minute wallet.** User recharges a wallet, calls are billed per minute. This is the culturally-native model for paid *voice* in India, and it perfectly matches a per-minute cost structure — revenue scales with cost, so it never runs at a loss.

**The fit for Divya Vani is a hybrid:** ChatGPT-style flat subscription for the cheap, predictable *text*, and AstroTalk-style per-minute economics for the expensive, variable *voice*.

---

## 7. Recommended model (RECOMMENDED)

**Text = flat subscription. Voice = metered minutes (small bundled allowance + pay-as-you-go wallet).** Keeps the founder's locked price points (₹499 / ₹999 / ₹2,999) but fixes the mechanics so voice can never run at a loss.

**Designed so that even at 100% usage (every included message + every included minute consumed), the tier still profits — no reliance on breakage to avoid a loss.** Counts reduced from the earlier draft to satisfy this. Cost basis: text ₹2.8/msg, voice ₹16/min, fee ~2.4%, pre-GST.

| Tier | Price | Text | Voice | Max-use COGS | **Profit @ max use** | Profit @ typical use |
|---|---|---|---|---|---|---|
| **Free** | ₹0 | 10 msgs (lifetime) | 5 min (lifetime) | ₹108 | — (acquisition) | — |
| **Seva Pratham** | ₹11 once | 3 msgs | — | ₹8.4 | **₹2.3 (21%)** | higher (breakage) |
| **Seva Anjali** | ₹51 once | 15 msgs | — | ₹42 | **₹7.8 (16%)** | higher |
| **Seva Bhakti** | ₹101 once | 30 msgs | — | ₹84 | **₹14.6 (15%)** | higher |
| **Seva Param** | ₹501 once | 150 msgs | — | ₹420 | **₹69 (14%)** | higher |
| **Krishna Plus** | ₹499/mo | 100 msgs | 5 min | ₹360 | **₹127 (26%)** | ~₹343 (70%) |
| **Krishna Voice** | ₹999/mo | 100 msgs | 30 min + wallet overage | ₹760 | **₹216 (22%)** | ~₹644 (66%) |
| **Krishna Premium** | ₹2,999/mo | 200 msgs | 100 min + wallet overage | ₹2,160 | **₹768 (26%)** | ~₹2,064 (70%) |
| **Voice Wallet** | ₹99=4 / ₹299=12 / ₹599=25 min | — | pay-as-you-go | — | **32–34%** (always) | always |

Rules:
- Included monthly minutes are a **hard cap**; beyond it the user spends Voice Wallet minutes. Non-subscriber wallet ≈ ₹24/min; subscriber overage discounted (≈ ₹18/min). Both are above the ₹16/min cost → always profitable.
- The Voice Wallet works **without any subscription** (pure AstroTalk model — the safest voice revenue).
- Voice tiers inherit their text allowance as a hard cap too.
- **GST caveat:** once the founder crosses the ₹20-lakh threshold and prices become GST-inclusive, Plus max-use margin thins to ~₹50 (~13%). If that happens, trim Plus to ~80 msgs or accept breakage-reliance on that one tier. Voice/Premium retain healthy margin under GST.
- The message counts are markedly lower than the earlier ₹499/450-msg draft — that draft was only profitable on breakage. Guaranteeing profit at full use at today's ₹2.8/msg cost forces ~100-msg caps. The lever to raise these caps is **cutting per-message cost** (persona compression, fewer Haiku calls) — see §8.

### Why this is best
- **Never loses money on voice** — the expensive resource is either capped or pre-paid above cost.
- **Matches both reference markets** — ChatGPT flat-text + AstroTalk per-minute-voice.
- **Respects locked decisions #9 & #11** (the ₹499/₹999/₹2,999 ladder) — only adds the wallet and the minute caps.
- **Light users pay little (wallet), heavy users pay proportionally, average subscribers fund the rest via breakage.**

---

## 7b. NRI / Indian-American ladder (USD, Razorpay International)

NRIs earn in USD and have ~6–8× the purchasing power. **Price to US willingness-to-pay, not an INR conversion** — ₹999 ≈ $10.40 is *too cheap* for a US resident; it signals low value and leaves money on the table. US reference points: ChatGPT Plus $20, Character.AI+ $10, Replika Pro ~$20, Calm/Headspace ~$13, Hallow (Catholic prayer app) ~$70/yr. Voice — *hearing* Krishna, shareable with elders/parents — is the hero feature for this segment, so the voice tier carries the value.

Costs in USD: text ~**$0.03/msg**, voice ~**$0.16/min**. US pricing gives far more margin headroom than the INR ladder.

**Structure mirrors the US wellness/devotional apps NRIs already pay for** — Calm ($69.99/yr), Headspace ($69.99/yr or $12.99/mo), Hallow ($69.99/yr), ChatGPT Plus ($20/mo): a **7-day free trial → monthly OR annual (2 months free)** toggle, annual pushed as the default.

**Design principle (corrected 2026-05-24):** NRI inclusions are kept **lean (≈ the India caps, not larger)**, NOT inflated. The earlier draft over-provisioned NRI (120 msg / 60–130 min) which crushed the margin %. Since an NRI pays ~2× the rupee price for the *same* product, holding the counts at India levels makes **NRI margin ~2× India's** — the headroom is taken as profit, not given away. Caps sized so **both monthly and annual clear ~55–68% margin even at 100% usage.**

| Tier | Monthly | Annual (2 mo free) | Text | Voice | **Profit @ max use (monthly / annual-effective)** |
|---|---|---|---|---|---|
| **Free / 7-day trial** | $0 | — | 10 msgs | 5 min | acquisition |
| **Krishna Plus** | **$9.99** | **$99** | 90 msgs | 5 min | **$6.14/mo (64%) / $4.46/mo (56%)** |
| **Krishna Voice** | **$24.99** | **$249** | 100 msgs | 30 min + wallet | **$16.31/mo (68%) / $12.23/mo (61%)** |
| **Krishna Premium** | **$49.99** | **$499** | 200 msgs | 70 min + wallet | **$31.04/mo (64%) / $22.93/mo (57%)** |
| **Voice Wallet (USD)** | $4.99=15 / $9.99=35 / $19.99=80 min | — | — | pay-as-you-go | **34–50% (always)** |

Notes specific to NRI:
- **Annual is the hero** — US consumers prefer it; better retention + cash flow + lower processor-fee drag. Both monthly and annual profit at full use, so neither can lose money.
- **Same product as India, ~2× the margin.** NRI Plus earns ~$6/mo vs India Plus ~₹127 (~$1.3) — roughly 4–7× the *absolute* profit per subscriber, and now a higher margin % too.
- Bundled minutes are deliberately conservative *because the word cap is gone* (longer replies eat minutes faster); overage flows to the wallet.
- **Razorpay International caveats — VERIFY before launch (could not web-search this session):** (a) international-card fees are higher, ~**3–3.5% + GST** vs ~2% domestic — bake into margins; (b) **recurring/e-mandate on international cards** is not the same as UPI AutoPay — confirm Razorpay supports auto-renew on foreign cards, else fall back to annual one-time or a second processor (Stripe/Paddle are common for USD recurring); (c) **GST treatment of digital services to recipients abroad** (export of service / zero-rated vs OIDAR) is a CA question — do not assume; (d) forex settlement markup on INR payout.

---

## 8. Margin levers if costs bite

1. **Voice is the lever, not text.** ConvAI per-minute is the dominant cost. The retired Phase-10.5 self-hosted loop (Sarvam STT + Sonnet + Sarvam Bulbul TTS REST, ~₹4–5/min vs ConvAI ₹13/min) is **~3× cheaper** — revisit if voice volume hurts margins, accepting worse latency/turn-taking.
2. **Trim Haiku fan-out.** 5 Haiku calls/text-turn ≈ ₹0.55/msg. `attestVerseReferences` + `extractScripturalEntities` could be merged into one call or cached.
3. **Persona compression** (already in backlog at 26,327 tok) — every 5k tokens trimmed saves ~₹0.13/msg on the cache read alone.
4. **Keep the cache warm** — at scale the shared persona cache is the biggest single saver already in place.

---

## 9. Blended monthly P&L (illustrative — 5,000 MAU, NRI-skewed)

Per the target audience ("mostly Indian-American / NRI"), the paid base skews NRI. **All numbers below are illustrative assumptions the founder should replace with real funnel data** — the value is the *structure*, not false precision. COGS uses **typical usage (~45% of caps)**, not max; the per-tier max-use floor (§7/§7b) guarantees no tier ever loses money even if everyone maxed out.

### Inputs
- 5,000 monthly-active users; ~11% paying (engaged devotional niche — optimistic, run a 5% sensitivity too).
- USD→INR ₹96. Fees: India ~2.4%, NRI ~3.5%. NRI GST zero-rated (verify).

| Segment | Subscribers | Profit/sub/mo (typical use) | Monthly gross profit |
|---|---|---|---|
| **India Plus** ₹499 | 150 | ₹343 | ₹51,450 |
| **India Voice** ₹999 | 70 | ₹644 | ₹45,080 |
| **India Premium** ₹2,999 | 15 | ₹2,064 | ₹30,960 |
| **India Seva** (one-time/mo) | 250 buys | ₹30 | ₹7,500 |
| **India Voice Wallet** (one-time/mo) | 120 buys | ₹100 | ₹12,000 |
| **NRI Plus** $9.99 | 180 | $8.06 (₹774) | ₹139,277 |
| **NRI Voice** $24.99 | 95 | $20.60 (₹1,978) | ₹187,872 |
| **NRI Premium** $49.99 | 25 | $40.50 (₹3,888) | ₹97,200 |
| **NRI Voice Wallet** (one-time/mo) | 60 buys | $4 (₹384) | ₹23,040 |
| **Gross profit (pre-fixed-cost)** | | | **₹594,379** |

### Fixed monthly costs
| Item | Cost |
|---|---|
| Infra (Vercel + Supabase + Sentry + domain + misc) | ~₹10,000 |
| ElevenLabs plan true-up (Business plan minimum vs marginal min already in COGS) | ~₹40,000 |
| Anthropic / Gemini / Sarvam usage | embedded in per-unit COGS |
| **Total fixed** | **~₹50,000** |

### Net
**≈ ₹544,000 / month net (~$5,670)** at this mix — *before* marketing/CAC, founder salary, Google Ads spend, and GST-if-registered.

### What this P&L makes obvious
1. **NRIs are ~75% of profit** (₹447k of ₹594k gross) from 360 payers, vs ₹147k from ~535 India payers+one-timers. Targeting NRIs is the correct strategic call — the same engineering effort earns 4–7× per NRI subscriber.
2. **Voice tiers (India Voice + NRI Voice) are the single biggest line** — voice is the premium hook, *if* minutes stay capped + wallet-metered so they can't run away.
3. **Sensitivity:** at a conservative 5% paid (≈250 payers, same mix ratio), net ≈ ₹230k/mo — still solidly profitable. The model breaks even at well under 100 paying subscribers.
4. **The lever that scales this is NRI acquisition cost.** If Google Ads CAC for an NRI subscriber is < their ~$240/yr LTV (Voice annual), growth is profitable. Track CAC:LTV per geo.

> Re-run this with real conversion + usage once beta data exists. A small spreadsheet with the §7/§7b per-tier margins as constants and counts as inputs will keep it live.

---

## Sources (verified 2026-05-24)
- [Anthropic / Claude API pricing](https://platform.claude.com/docs/en/docs/about-claude/pricing)
- [ElevenLabs API & Conversational AI pricing](https://elevenlabs.io/pricing/api)
- [Sarvam AI pricing](https://docs.sarvam.ai/api-reference-docs/pricing)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Live code: `src/app/api/chat/route.ts`, `src/app/api/agent-llm/chat/completions/route.ts`, `src/lib/elevenlabs.ts`, `src/app/api/tts/route.ts`, `src/app/voice/AgentVoiceClient.tsx`, `src/lib/verses.ts`
