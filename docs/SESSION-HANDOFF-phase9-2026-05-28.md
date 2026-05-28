# SESSION HANDOFF — Phase 9 Subscriptions, post-launch iteration

> Paste-and-continue handoff. Fresh session has the codebase but NOT this
> conversation. Read this top-to-bottom, then run `git log --oneline -16` +
> `git status` to confirm the live state.
> Last updated: 2026-05-28. Current HEAD on `origin/main`: **`c96fb0f`**.

## Where we are
Phase 9 (recurring subscriptions + voice metering + seva hub + voice-minute
wallet) is **shipped end-to-end on divyavani.co.in.** Lint at **0 errors**.
Build passes. All payment surfaces live behind the **🪔 diya icon** in the
chat header. The session that just ended was an iteration cycle: the modal
was rebuilt as a tabbed hub, the wallet was added, balance displays were made
persistent, and verse-card pill contrast was fixed under the Dawn Aarti
remap.

## Live architecture (skim if you know it; deeper detail below)
- **🪔 SevaHubModal** (`src/app/components/SevaHubModal.tsx`) — single
  monetization hub. Bottom-sheet mobile / centered dialog desktop,
  height-constrained with internal scroll. Three segmented tabs:
  **Seva | Voice minutes | Plans** (`tab="seva"` is the default when opened
  from the diya icon; `SubscribeButton` callers pass `initialTab="plans"`).
  Persistent balance headers on the Seva + Voice-minutes tabs.
- **Seva tab** → `SevaTierPicker` (one-time message packs) + a top
  `"Sevā balance: N messages"` header (`/api/seva/balance`).
- **Voice minutes tab** → `WalletPicker` (one-time voice-minute packs,
  ₹99 / ₹299 / ₹599 in India, $4.99 / $9.99 / $19.99 abroad) + a top
  `"Voice wallet: N minutes"` header (`/api/voice/balance`).
- **Plans tab** → `SubscriptionManager` if active sub, else
  `SubscriptionPicker`. **Currency is region-only** (India→INR/monthly,
  else→USD/annual) — there is NO manual toggle (founder decision).
- **Settings** (`src/app/settings/`) has **NO payment UI** (stripped); only
  identity / language / privacy / feedback / delete / about. The seva
  balance is still shown as **read-only info** in the aside.

## Live payment flows
- **Subscriptions** — `/api/subscriptions/create` (validates planKey+currency,
  blocks a second active sub, creates Razorpay sub, inserts row at status
  `created`), `/cancel` (cancel_at_cycle_end, idempotent), `/status` (GET).
  `/api/razorpay/webhook` handles `subscription.authenticated | activated |
  charged | pending | halted | completed | cancelled`. Activation is
  webhook-driven.
- **Seva** (unchanged, working) — `/api/seva/create-order` + `/verify`.
- **Voice-minute wallet** — `/api/wallet/create-order` + `/verify` (mirrors
  seva, but credits `users_memory.voice_seconds_balance`). The
  `payment.captured` webhook branches on `getWalletPack(tier)` → credits voice
  seconds for wallet rows; otherwise credits seva messages.
- **Chat gating** (`src/app/api/chat/route.ts`) — precedence:
  **free pool → active sub (messages_used < message_pool) → seva → paywall.**
  Reads memory + sub in `Promise.all`; the booleans
  `onFreePool / chargingSub / chargingSeva` drive both `persistTurnState` and
  the response counters.
- **Voice metering** (`src/app/voice/AgentVoiceClient.tsx`) — wall-clock from
  `onConnect` → `onDisconnect`. On disconnect, fire-and-forget POST to
  `/api/voice/usage` with elapsed seconds; `consume_voice_seconds` RPC debits
  the subscription pool first, then `voice_seconds_balance` (wallet).
  `hasVoiceAccess` allows if sub-pool-remaining OR wallet>0 OR legacy seva
  (non-regressive; founder may tighten later).

## Manual setup the founder did this cycle (confirm if continuing)
1. **`docs/subscriptions-rpcs.sql` pasted in Supabase** → 3 functions:
   `increment_subscription_messages`, `consume_voice_seconds`,
   **`credit_voice_seconds`** (the third was added when the wallet shipped;
   confirm with `SELECT proname FROM pg_proc WHERE proname IN (...)` — should
   return 3 rows).
2. **6 `RAZORPAY_PLAN_*` env vars in Vercel** (LIVE plan ids; mirrored in
   `.env.local`).
3. **Razorpay live webhook** — `subscription.*` events enabled. Same
   endpoint + secret as the existing seva webhook.
4. **`ALTER TABLE payments DROP CONSTRAINT payments_tier_check`** —
   leftover constraint that only whitelisted seva tier ids was rejecting
   `wallet_inr_*`/`wallet_usd_*` inserts (500). Dropped. Schema invariant
   restored: `payments.tier` is free-text; app validates via
   `getTier`/`getWalletPack` before insert.

## ONE open thread you may need to close
The founder bought the **₹99 wallet pack** during the cycle (user
`ee4f627b-b137-44c5-8d51-de6c1c701aec`, order
`order_SufXlA5MJQXN6s`, status `verified`, verified 2026-05-28 05:32:18+00).
We don't yet know whether the **credit step actually ran** (verify might have
500'd if `credit_voice_seconds` wasn't pasted at the moment of purchase). The
new persistent balance header (deployed in `4824489`) will reveal it on the
next reload:
- "Voice wallet: 4 minutes" → credit landed, nothing to do.
- "Voice wallet: empty" → credit missed. Confirm the RPC exists, then run:
  ```sql
  UPDATE users_memory
     SET voice_seconds_balance = voice_seconds_balance + 240,
         updated_at = now()
   WHERE user_id = 'ee4f627b-b137-44c5-8d51-de6c1c701aec';
  ```
  Future purchases will credit automatically.

## Invariants — do NOT break
- **Hub default tab from 🪔 = Seva.** SubscribeButton callers explicitly set
  `initialTab="plans"` because they're "subscribe" CTAs.
- **Currency by region only.** No manual INR↔USD toggle in SubscriptionPicker
  or WalletPicker. India (`Asia/Kolkata`) → INR; else → USD.
- **Settings has zero payment UI.** Don't add cancel/buy back to Settings;
  payments live in the hub.
- **Voice meter = wall-clock from `onConnect` to `onDisconnect`.** Everything
  counts (user speech, Krishna speech, silences, thinking). Matches how
  ElevenLabs Conversational AI charges per session-minute.
- **`payments.tier` is free-text by design.** Do NOT re-add a CHECK
  constraint (founder dropped it deliberately).
- The voice-flow `agent-llm` route's intentional Promise.all latency
  parallelization stays untouched (per prior invariant).

## Deferred (founder-confirmed, not "todo for you to start")
1. **Voice idle auto-cutoff** — offered, not yet authorized. Would auto-end a
   ConvAI session after ~30s of silence (protects user minutes + Eleven
   cost). Open ask.
2. **/refund + /terms subscription copy** — currently say "one-time only";
   need auto-renewal + cancellation language for Razorpay site review +
   Google Ads. I offered to draft; founder hasn't said go.
3. **USD monthly subscriptions** — launch is USD-annual only (RBI e-mandate
   is India/INR-only). Add later if there's demand.

## Recent commits (most → least recent) — quick orientation
```
c96fb0f fix(verse-card): readable pill text on Dawn Aarti pastels
9963e3e feat(seva): persistent seva-balance header in the hub Seva tab
4824489 feat(wallet): persistent voice-minute balance display in the hub
a5078f5 feat(subscriptions): voice-minute wallet top-ups (3rd hub tab)
714693d fix(subscriptions+lint): seva-default hub tab, region-only currency,
        About to bottom; clean lint to 0 errors
f95badd refactor(subscriptions): unify payments into a single seva hub …
db4e628 feat(subscriptions): auto-default checkout currency by region
16ec5da feat(subscriptions): voice metering — pool→wallet + access gate
b7f143e feat(subscriptions): chat gating — prefer active sub …
563e27d feat(subscriptions): create + cancel routes + webhook lifecycle …
379878f feat(subscriptions): tier modal + checkout + Settings management …
d2dc411 feat(subscriptions): data layer — CRUD + Razorpay wrapper + RPC
9f7aa99 feat(subscriptions): setup-razorpay-plans.ts — provision 6 Plans
4fa7d02 docs: Phase 9 subscription build handoff (prior cycle)
5f557a5 feat(subscriptions): Phase 9 foundation
```

## Project memory pointer
`C:\Users\krish\.claude\projects\c--Users-krish-Desktop-God-Messenger\memory\project-phase9-subscriptions.md`
is current and reflects this state. Update if anything material changes.
