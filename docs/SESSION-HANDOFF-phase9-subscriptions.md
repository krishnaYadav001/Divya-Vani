# SESSION HANDOFF — Phase 9 Subscription System (Divya Vani)

> Paste-and-continue handoff. A fresh session has the codebase but NOT this
> conversation. Read this top-to-bottom, then run `git log --oneline -12` and
> `git status` to confirm the live state before building.
> Last updated: 2026-05-25.

## What we're building
The full recurring **subscription system** (Phase 9): Krishna Plus / Voice / Premium tiers (INR + USD) + a one-time **voice-minute wallet**, on Razorpay Subscriptions. Razorpay **Full Access + International payments are both GRANTED**.

## Cost facts (web-verified 2026-05-24; FX ₹96/$1)
- **Text ≈ ₹2.8/msg ($0.029)**: Sonnet 4.6 (26.3k cached persona + RAG + history) + 5 Haiku calls.
- **Voice ≈ ₹15/min ($0.16)**: ElevenLabs ConvAI per-minute ($0.08–0.16) + Anthropic agent-llm.
- **Verified Razorpay constraint:** RBI e-mandate is **India/INR-only** → INR gets true monthly auto-renew (UPI AutoPay); **NRI/USD recurring rides card networks → launch USD as ANNUAL** (monthly-USD is a phase-2 add-on). Full cost/P&L/derivation: `docs/subscription-economics-2026-05-24.md`.

## Final tier design (UNIFIED entitlements; price varies by currency)
| Tier | Entitlement /cycle | INR (monthly) | USD (annual) |
|---|---|---|---|
| Plus | 100 msg + 5 voice min | ₹499 | $99 |
| Voice | 100 msg + 30 voice min | ₹999 | $249 |
| Premium | 200 msg + 100 voice min | ₹2,999 | $499 |

Voice wallet (one-time, reuse seva flow): INR ₹99=4min / ₹299=12min / ₹599=25min; USD $4.99=15 / $9.99=35 / $19.99=80. All tiers + packs profit even at 100% usage. These numbers live in `src/lib/subscriptions.ts`.

## DONE + committed this session (on `main`)
- Language toggle (English-default + हिन्दी), trust pages `/contact` `/pricing` `/refund` + phone/address, voice word-cap removed (≤55w → soft ~150w in agent-llm), consent → passive policy line, address `255 EWS, Barra-4, Janta Nagar, Kanpur, UP 208027`.
- **Phase 9 foundation (commit `5f557a5`):**
  - `docs/subscriptions-schema.sql` — `subscriptions` table (one-active-per-user partial unique index) + `voice_seconds_balance` column on `users_memory`. Idempotent; reuses existing `webhook_events` for idempotency.
  - `src/lib/subscriptions.ts` — `SUBSCRIPTION_PLANS`, `WALLET_PACKS`, `getPlan/getOffer/getWalletPack/getPlansInOrder`. Pure data (no Razorpay/DB calls).
- User stated they pushed all code. **CONFIRM with git** — these were seen uncommitted in-session and may differ from remote.

## FOUNDER pending actions (gate TESTING, not coding)
1. Paste `docs/subscriptions-schema.sql` into Supabase SQL Editor.
2. Create 6 Razorpay Plans (Subscriptions→Plans): Plus/Voice/Premium ₹499/₹999/₹2,999 **monthly INR**; Plus/Voice/Premium $99/$249/$499 **yearly USD**. Each returns a `plan_id`.
3. Set 6 env vars to those ids: `RAZORPAY_PLAN_{PLUS,VOICE,PREMIUM}_INR_MONTHLY`, `RAZORPAY_PLAN_{PLUS,VOICE,PREMIUM}_USD_ANNUAL` (Vercel + `.env.local`).
   - (Optional: a `scripts/setup-razorpay-plans.ts` can create all 6 via API + print ids.)

## NEXT INCREMENTS (in order) — resume here
2. **Data layer** — add `subscriptions` CRUD to `src/lib/supabase.ts` (insert/fetchActiveByUser/updateStatus/incrementMessagesUsed/resetCycleUsage) + a Razorpay wrapper (`rzp.subscriptions.create` / `.cancel`).
3. **Routes** — `src/app/api/subscriptions/create/route.ts` (create Razorpay sub from plan_id+currency+period, insert row status='created', return short_url/subscription_id) + `cancel/route.ts` (`cancel_at_cycle_end:true`). Extend `src/app/api/razorpay/webhook/route.ts` with `subscription.activated|charged|cancelled|halted|completed|pending` cases (same idempotency pattern).
4. **Modal UI** — 3-tier subscription modal (variant of `SevaTierPicker`) + Settings management (cancel / view renewal / usage). Reuse Razorpay Checkout but pass `subscription_id` instead of `order_id`.
5. **Gating + voice metering** — chat route: prefer active sub (messages_used < message_pool) before seva_balance fallback. **Voice metering is the novel piece:** agent-llm sees per-TURN not session duration; add `/api/voice/usage` the ConvAI widget calls on session-end (onDisconnect, with duration) → decrement `voice_seconds_used` (sub) then `voice_seconds_balance` (wallet). Design at this step.
6. **USD dual-currency** — region/currency detection (IP or Accept-Language or explicit toggle) → pick INR-monthly vs USD-annual offer at checkout.
7. **Build + smoke** — `npm run build`; test sub create→activate→charge→cancel in Razorpay test mode; webhook idempotency replay.

## Implementation facts (don't re-derive)
- **Razorpay client:** `new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })`, cached. Model: `src/app/api/seva/create-order/route.ts`.
- **Webhook:** raw-body (`req.text()`) HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET`; headers `x-razorpay-signature` + `x-razorpay-event-id`; idempotency via `hasProcessedEvent(eventId)` / `recordEvent(...)` (`webhook_events` table). Model: `src/app/api/razorpay/webhook/route.ts`.
- **Sub flow:** `subscriptions.create({ plan_id, total_count, customer_notify:1, notes:{user_id} })` → `{ id, short_url }` → pass `subscription_id` to Checkout → `subscription.activated` sets active+period → `subscription.charged` resets `messages_used`+`voice_seconds_used` per cycle.
- **Sub checkout signature verify:** HMAC(`razorpay_payment_id + "|" + razorpay_subscription_id`) with key_secret.
- **Identity:** cookie `god_messenger_uid` (text `user_id`). Voice uses `/api/voice/bootstrap` + ElevenLabs ConvAI agent `agent_3001ks8hkawgf5cb5k7fy8gwxsme` (custom-LLM = `/api/agent-llm`).
- **Existing gating:** chat route paywalls when `message_count>=10 && seva_balance==0`. Voice gated by `src/lib/voiceAccess.ts hasVoiceAccess()`.
- **supabase.ts helpers that exist:** insertPayment, findPaymentByOrderId, markPaymentVerifiedAtomic, creditSevaBalance, fetchMemory, saveMemory, touchActivity, hasProcessedEvent, recordEvent.

## Invariants / gotchas (from CLAUDE.md)
- Schema changes = idempotent SQL handed to founder (no migration tooling).
- **Verify Next 16 + Tailwind v4 APIs** (breaking vs v14/v3). `cookies()` is async.
- All payment/AI keys are server-only. `npm run build` before declaring done.
- **Do NOT touch `src/lib/systemPrompt.ts`** (persona cache) or i18n Krishna's replies — i18n is STATIC chrome only; replies follow the user's input language (Locked Decision #12).
- `src/app/api/agent-llm/.../route.ts` has an **intentional uncommitted voice-latency parallelization** (Promise.all of memory+RAG+safety+moderation) — do NOT revert it.
- Trust pages (`/pricing` `/refund` `/contact`) had intentional eyebrow-label tweaks — do NOT revert.

## Key files
- Config: `src/lib/subscriptions.ts` · Schema: `docs/subscriptions-schema.sql`
- Design+cost: `docs/subscription-economics-2026-05-24.md` (full P&L + NRI ladder) · `docs/phase9-subscription-design.md` (older; 6 product decisions + webhook event list)
- Seva model: `src/lib/seva.ts`, `src/app/api/seva/{create-order,verify}/route.ts`, `src/app/components/{SevaTierPicker,SevaPaywall}.tsx`
- Webhook: `src/app/api/razorpay/webhook/route.ts` · DB helpers: `src/lib/supabase.ts`
- i18n: `src/lib/i18n.ts`, `src/app/providers/LanguageProvider.tsx` (toggle in `SiteFooter.tsx`)
