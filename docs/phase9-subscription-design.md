# Phase 9 Design — Krishna Plus Subscription (₹499/month)

> **Status:** Pre-implementation design doc. Implementation gated on real free-user traffic justifying subscription monetization (per `docs/build-roadmap.md` discipline — "DO NOT START until founder has real free-user traffic that would convert to subscription").
>
> **Purpose:** Surface design decisions the founder must make + lock the architecture before any code is written. Reduces re-design cost during implementation.
>
> **Last updated:** 2026-05-16. Razorpay Subscriptions API and RBI E-Mandate Framework data web-verified against current 2026 sources (see Sources section).

---

## Product summary

Krishna Plus is the first subscription tier (Phase 9 in `docs/build-roadmap.md`). Single tier at launch:

| Tier | Price | Includes |
|---|---|---|
| Krishna Plus | ₹499 / month | 450 messages / month pool, no daily cap, resets on renewal date |

**Hybrid with existing seva tiers** — Pratham ₹11 / Anjali ₹51 / Bhakti ₹101 / Param ₹501 one-time payments continue. Subscription does not replace them; it complements.

**Target audience:** Indian users who become repeat customers and would otherwise buy seva tiers multiple times per month. At 60+ messages/month, Plus is cheaper than buying 1× Bhakti (₹101 / 60 msg) twice = ₹202; at 350+ messages/month, Plus beats 1× Param (₹501 / 350 msg).

---

## Key product decisions — founder must approve before implementation

These 6 decisions shape the entire system. Lock them before writing code.

### 1. GST treatment — inclusive or exclusive of 18%?

- **Option A — ₹499 inclusive of GST.** Customer pays ₹499 total. Internal split: ₹423 base + ₹76 GST. Cleaner price display, matches Indian consumer expectation ("₹499 ka subscription"). Lower revenue per subscription.
- **Option B — ₹499 + 18% GST = ₹588.82 total.** Customer sees "₹499 + GST" at checkout, charged ₹588.82. Matches B2B SaaS pattern (Zoho, Razorpay itself). Higher revenue.

**Recommendation:** Option A (inclusive). Krishna Plus is a B2C emotional/spiritual subscription, not B2B SaaS. Consumer-facing pricing should be the headline number, not a base+GST breakdown. AstroTalk / AstroSage follow this pattern. Same model as Netflix India (₹199 inclusive).

### 2. Refund policy for subscription charges

Existing seva tiers have 72-hour refund window (per Phase 6.4 /privacy). For subscription:

- **Option A — 72h refund window matches seva, full refund.** First charge refundable within 72h; subsequent monthly charges have no refund unless billing error.
- **Option B — No refund after first charge.** Customer cancels for next cycle. Period continues until cycle end.
- **Option C — Pro-rata refund for unused days.** Cancel mid-cycle, get refund for remaining days.

**Recommendation:** Option B (no refund after first charge, period continues to cycle end). Matches Spotify, Netflix, ChatGPT Plus, AstroTalk Premium. Avoids fraud risk + abuse of "subscribe, use 25 days, refund full ₹499." Option A is too generous for a 30-day cycle. Option C is operationally complex.

### 3. Grace period for failed payment

When UPI mandate fails (insufficient balance, expired UPI handle, bank downtime), Razorpay retries automatically per its Smart Retry logic. Beyond Razorpay's retries:

- **Option A — 3 days.** Tight grace; subscription halts quickly. Lower MRR loss to grace abuse, but worse UX for users with temporary issues.
- **Option B — 7 days.** Industry-standard. Razorpay's retry window typically covers most transient failures.
- **Option C — 14 days.** Generous; risks "free month" for chronic non-payers.

**Recommendation:** Option B (7 days). During grace, allow continued access with subtle "payment retry needed" banner. After grace, halt access until user re-authorizes payment.

### 4. Upgrade trigger — when does the user see "Upgrade to Plus"?

- **Option A — Paywall only.** Plus appears only on the seva paywall screen (after 10 free + ₹0 seva). Lowest friction; no in-chat distraction.
- **Option B — Paywall + persistent /settings option.** Plus is also discoverable in Settings for users who haven't hit paywall yet but want predictable monthly billing.
- **Option C — Paywall + Settings + in-chat upsell card (after every 25 messages used).** Aggressive upsell — risks breaking the contemplative chat experience.

**Recommendation:** Option B. Settings already has /delete-account and training opt-out (Phase 8.0 commit 659945f); Plus tier fits naturally as another Settings option. Avoid Option C — Krishna's chat experience must not feel like a SaaS upsell funnel.

### 5. Subscriber cancellation — immediate or end-of-period access?

- **Option A — Cancel immediately, no further charges, access ends immediately.** Cleaner accounting, but feels punitive ("I paid for the month, why am I cut off?").
- **Option B — Cancel sets `cancel_at_period_end=true`, access continues until current period end.** Industry standard (Netflix, Spotify). Customer-friendly.

**Recommendation:** Option B. Matches consumer expectation, reduces churn-anger, simple to implement (Razorpay supports `cancel_at_cycle_end=true` flag on cancellation API).

### 6. Plus + seva interaction

When a Plus subscriber's 450-message pool is exhausted:

- **Option A — Fall through to seva balance.** If they have ≥1 seva balance, decrement it. If not, show paywall with seva options + "Plus pool resets {date}" notice.
- **Option B — Mutually exclusive — Plus users cannot buy seva tiers.** Simpler; "you have Plus, just wait for renewal."

**Recommendation:** Option A. Better UX for heavy users who exceed 450/month (rare but possible). Implementation cost is minor — extend existing seva paywall logic with a Plus-exhausted variant. Reduces customer rage at "I can't talk to Krishna right now even though I'm a paying subscriber."

---

## Technical architecture

### Database schema (new tables)

```sql
-- Subscription state table — one row per user's subscription history
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users_memory(user_id),
  razorpay_subscription_id text UNIQUE NOT NULL,
  razorpay_customer_id text NOT NULL,
  razorpay_plan_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('created','authenticated','active','paused','halted','cancelled','expired','in_grace')),
  monthly_message_pool int NOT NULL DEFAULT 450,
  messages_used_this_cycle int NOT NULL DEFAULT 0,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  grace_until timestamptz,  -- if in_grace, when grace expires
  payment_method text,  -- 'upi' or 'card'
  upi_vpa text,         -- last-known VPA (e.g. "user@bank")
  card_last4 text,      -- last 4 digits if card
  amount_paise int NOT NULL DEFAULT 49900,  -- ₹499 in paise
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_razorpay_id ON subscriptions(razorpay_subscription_id);
CREATE UNIQUE INDEX idx_subscriptions_one_active_per_user
  ON subscriptions(user_id) WHERE status = 'active';  -- prevent double-active

-- Webhook event log — idempotency + audit trail
CREATE TABLE subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES subscriptions(id),
  razorpay_event_id text UNIQUE NOT NULL,  -- Razorpay's event ID; unique prevents reprocessing
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed boolean DEFAULT false,
  processed_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_subscription_events_unprocessed
  ON subscription_events(created_at) WHERE NOT processed;
```

Note: No changes to `users_memory` table — subscription state stays in `subscriptions` table joined by `user_id`. This keeps `users_memory` focused on conversation memory only.

### Razorpay Subscriptions integration

**One-time setup (founder, via Razorpay dashboard):**
1. Create Plan: ₹499 / monthly / billing cycle 30 days. Razorpay returns `plan_id`. Store in env: `RAZORPAY_PLUS_PLAN_ID`.

**Subscription creation flow (per user upgrade):**
1. User clicks "Upgrade to Plus" → `POST /api/subscriptions/create`
2. Server creates Razorpay Subscription via `POST /v1/subscriptions` with:
   - `plan_id` (Krishna Plus plan)
   - `total_count: 12` (1-year initial; auto-renews per Razorpay docs)
   - `customer_notify: 1`
   - `notes: { user_id: <our_user_id> }`
3. Server inserts row in `subscriptions` table with status='created', razorpay_subscription_id
4. Client receives `short_url` for Subscription Checkout, redirects user
5. User completes UPI AutoPay setup using **Intent flow only** (Collect deprecated Feb 28, 2026 per NPCI guidance)
6. Razorpay charges authentication transaction (₹1, refunded immediately)
7. On success: webhook `subscription.activated` fires → server updates status='active', current_period_start, current_period_end

**Recurring charging:**
- Razorpay handles billing automatically per the e-mandate
- Pre-debit notification sent 24h+ before each charge (Razorpay handles per RBI 2026 framework requirement)
- On successful charge: webhook `subscription.charged` fires → server resets `messages_used_this_cycle=0`, updates period dates

### Webhook events to handle

| Event | Action |
|---|---|
| `subscription.activated` | First charge succeeded. Set status='active', period_start/end. |
| `subscription.charged` | Recurring charge succeeded. Reset messages_used_this_cycle. Update period dates. |
| `subscription.cancelled` | User cancelled. Set status='cancelled', cancel_at_period_end=true. Keep access until period_end (per Decision #5 Option B). |
| `subscription.halted` | Payment failed beyond retry attempts. Set status='halted', revoke access. |
| `subscription.completed` | Subscription naturally ended (rare for monthly). Set status='expired'. |
| `subscription.paused` | Admin/Razorpay paused. Set status='paused'. |
| `subscription.resumed` | Admin resumed. Set status='active'. |
| `subscription.pending` | Mandate authentication pending. Set status='created' or 'authenticated'. |
| `payment.failed` (subscription context) | Log to subscription_events for support visibility. Move to in_grace if first failure; halted if retries exhausted. |

**All webhook handlers must:**
- Verify Razorpay signature (existing pattern from Phase 6.2 — extend to subscription events)
- Idempotency check via `razorpay_event_id` UNIQUE constraint — if already processed, skip
- Insert into `subscription_events` table BEFORE updating `subscriptions` (audit trail)
- Mark processed=true ONLY after `subscriptions` row update succeeds

### Chat route gate logic (replacement)

**Current logic** (`src/app/api/chat/route.ts`):
```
paywall_triggered = (message_count >= 10 AND seva_balance == 0)
```

**New logic** (pseudocode):
```typescript
const sub = await fetchActiveSubscription(userId);

if (sub) {
  if (sub.status === 'active') {
    if (sub.messages_used_this_cycle >= sub.monthly_message_pool) {
      // Plus pool exhausted — fall through per Decision #6 Option A
      if (memory.seva_balance > 0) {
        // Use seva balance, decrement
        decrementSevaBalance(userId);
      } else {
        return paywallResponse({
          variant: 'plus_pool_exhausted',
          renewal_date: sub.current_period_end,
          seva_tiers_available: true,
        });
      }
    } else {
      // Plus pool has room — decrement pool
      incrementSubscriptionUsage(sub.id);
    }
  } else if (sub.status === 'in_grace') {
    // Grace period — allow access with banner indicator
    incrementSubscriptionUsage(sub.id);
    response.grace_warning = true;
  } else {
    // halted, cancelled, expired — no Plus access. Fall through to seva logic.
    return originalSevaPaywallLogic(userId, memory);
  }
} else {
  // No subscription — original seva paywall logic
  return originalSevaPaywallLogic(userId, memory);
}
```

### Cancellation flow

User clicks "Cancel Krishna Plus" in `/settings`:
1. Server calls `POST /v1/subscriptions/{id}/cancel` with `cancel_at_cycle_end: true`
2. Razorpay confirms; fires `subscription.cancelled` webhook
3. Server sets status='cancelled', cancel_at_period_end=true, cancelled_at=now()
4. Access continues until current_period_end
5. After current_period_end, scheduled job (or webhook on `subscription.completed`) flips status='expired', user returns to seva paywall logic

### State machine

```
                    ┌─────────────────────────────────────┐
                    │     [no_subscription / new]         │
                    └────────────────┬────────────────────┘
                                     │ POST /api/subscriptions/create
                                     ▼
                    ┌─────────────────────────────────────┐
                    │     [created] (Razorpay pending)    │
                    └────────────────┬────────────────────┘
                                     │ subscription.activated webhook
                                     ▼
                    ┌─────────────────────────────────────┐
       ┌────────────┤             [active]                │◄────────────┐
       │            └─┬──────────────┬───────────────┬────┘             │
       │              │              │               │                  │
       │              │ user clicks  │ payment.failed│ subscription.    │
       │              │ "Cancel"     │ (Razorpay     │ charged          │
       │              ▼              │  retrying)    │ (period reset)   │
       │  ┌────────────────────┐     ▼               │                  │
       │  │   [cancelled,      │  ┌──────────────┐   │                  │
       │  │ access_until_end]  │  │  [in_grace]  │   │                  │
       │  └─────────┬──────────┘  └─┬───────────┬┘   │                  │
       │            │ period_end    │ retry OK  │     │                 │
       │            ▼               │           │     │                 │
       │  ┌────────────────────┐    │           │     │                 │
       │  │     [expired]      │    │           │     │                 │
       │  └─────────┬──────────┘    │           │     │                 │
       │            │ user resubs   │           │     │                 │
       │            ▼               ▼           ▼     │                 │
       └────────────────────────────┘     ┌──────────┴────┐             │
                                          │   [halted]    │             │
                                          └───────┬───────┘             │
                                                  │ user resubs         │
                                                  └─────────────────────┘
```

---

## Migration of existing seva users

Three categories:

1. **Free users (10 free messages exhausted, ₹0 seva)** — Plus is primary CTA at paywall, secondary CTA in /settings.
2. **Active seva customers (positive seva_balance)** — Keep their balance untouched. Plus appears as additional option in /settings. If they upgrade to Plus, seva balance remains (Decision #6 Option A — falls back if Plus pool exhausted).
3. **Past seva customers (used and finished)** — Same as free users; Plus is primary CTA at next paywall hit.

No data migration needed. Existing `users_memory.seva_balance` semantics unchanged. New `subscriptions` table is additive.

---

## Edge cases — must be handled in implementation

| # | Edge case | Handling |
|---|---|---|
| 1 | Concurrent subscription creation (user double-clicks "Upgrade") | Unique index `idx_subscriptions_one_active_per_user` prevents two active rows. Idempotency key on Razorpay API call. |
| 2 | Webhook arrives before subscription DB row exists (network race) | Webhook handler: if subscription_id not found, create row + log warning. |
| 3 | User deletes account with active subscription | `/api/delete-account` (Phase 8.0 659945f) must call Razorpay cancel + then delete subscriptions row. |
| 4 | Plus subscriber tries to buy seva tier | Allow (Decision #6 Option A). Seva balance is fallback for pool exhaustion. |
| 5 | Plus pool depleted mid-month | Show distinct paywall variant (`plus_pool_exhausted`) with renewal date + seva top-up options. |
| 6 | Renewal date on Feb 30 (month-end edge) | Razorpay handles; trust their cycle date logic. Display `current_period_end` from Razorpay, not computed locally. |
| 7 | GST display | Per Decision #1 Option A: show "₹499 (inclusive of 18% GST)" in checkout + Settings + invoice. |
| 8 | Failed payment retry storm | Razorpay's Smart Retry logic owns this. Our webhook handler must be idempotent (event_id UNIQUE) — never charge twice on duplicate webhook. |
| 9 | Mandate expiry (UPI mandate has finite lifetime, typically 1 year) | Razorpay fires pending notification. Client must trigger re-mandate flow via /settings "Update payment method" before expiry hits. |
| 10 | Card/UPI changes (user got new phone/SIM/bank) | Same as expiry — `/settings` "Update payment method" triggers new mandate creation. Old mandate auto-cancels. |
| 11 | User upgrades, then immediately cancels (within first 24h) | Per Decision #2 Option B: no refund on first charge. Cancel sets cancel_at_period_end=true; access continues for the month they paid for. |
| 12 | Subscription.activated webhook fails (e.g., DB connection error) | Webhook handler returns 500 → Razorpay retries (exponential backoff per Razorpay docs). subscription_events table tracks failed processing with `error` field for manual reconciliation. |
| 13 | Vercel function timeout on long webhook payload | Webhook handler must be fast: signature verify → insert event row → respond 200 → process async (or just-in-time on next chat). Don't do heavy work synchronously. |
| 14 | User's plus pool resets mid-conversation (charge fires while user is chatting) | Reset is atomic — next message check sees fresh pool. Mid-session UX: no special handling needed (rare boundary case). |

---

## Compliance

### DPDP Act 2023
- Payment data (card numbers, UPI VPA full string) is sensitive personal data. **Razorpay handles all PCI-scoped storage.** Our `subscriptions` table stores only:
  - Razorpay references (subscription_id, customer_id, plan_id) — not sensitive
  - `card_last4` — last 4 digits only, not full PAN, permissible per PCI DSS
  - `upi_vpa` — last-known VPA stored for display; consider hashing or redacting (e.g., `u****@bank`) for stricter compliance
- Consent: subscription creation = explicit consent to recurring charges per DPDP "specific and informed consent" standard. Capture in subscription creation API as `consent_given: true, consent_timestamp: <iso>`.
- Right to erasure: `/api/delete-account` cancels subscription + deletes subscription row. Razorpay-side data retained per their policy (typically 7 years for financial records, India IT Act + tax compliance).

### RBI Digital Payments E-Mandate Framework 2026 (effective April 21, 2026)
- **Transaction limit ₹15,000 standard** — Krishna Plus at ₹499 is well under, no additional auth required after mandate setup.
- **Pre-debit notification 24h+ prior** — Razorpay sends per framework. No app-level action needed.
- **Zero-liability protection** — Customers report unauthorized debits, no charge. Communicate in /terms.
- **No charges to customers for e-mandate** — already free for the customer.

### Consumer Protection Act 2019
- Refund policy must be clearly stated at checkout, in /terms, and in /settings cancellation flow.
- Cancellation must be as easy as subscription — /settings flow + email/in-app confirmation.
- Pricing transparency: GST treatment displayed clearly per Decision #1.

### GST
- 18% on SaaS / digital subscriptions per current Indian tax practice.
- GST registration threshold for Divya Vani: ₹20 lakh annual turnover (₹10 lakh for special category states). Founder is in UP (general category, ₹20 lakh).
- Below threshold = no GST collection needed. Above threshold = mandatory GST registration + filing.
- **At launch (₹499 × small subscriber base):** likely below threshold. Founder should consult CA on threshold approach + when to register.
- Razorpay can generate GST invoices on demand for subscribers who request them (B2C usually doesn't, but enterprise customers might).

---

## Implementation roadmap (estimated)

**Total effort: ~5 weeks solo founder time. ~₹500-1500 in Razorpay test charges during development.**

### Phase 9.0 — Backend foundations (Week 1-2)
- Database schema + manual SQL paste in Supabase
- `RAZORPAY_PLUS_PLAN_ID` env var setup
- `src/lib/subscriptions.ts` library: create / fetch / cancel / fetchActive
- `src/app/api/subscriptions/create/route.ts` + `cancel/route.ts`
- Razorpay webhook handler extension (add subscription event types to existing `src/app/api/razorpay/webhook/route.ts`)
- subscription_events idempotency logic

### Phase 9.1 — Frontend (Week 3)
- "Upgrade to Krishna Plus" CTA on paywall screen
- Settings panel for Plus subscribers (cancel + update payment + view renewal date + view usage)
- Razorpay Subscription Checkout integration (Razorpay's hosted checkout page)
- Loading states + error handling

### Phase 9.2 — Chat route integration (Week 4)
- Refactor `src/app/api/chat/route.ts` paywall gate per pseudocode above
- `incrementSubscriptionUsage` + `fetchActiveSubscription` helpers
- Pool-exhausted paywall variant (different from free-user paywall)
- Grace period UX (in-chat banner)

### Phase 9.3 — Edge case hardening + production smoke (Week 5)
- All 14 edge cases above with tests
- End-to-end smoke test with real ₹499 charge from founder's test account
- Cancellation flow test (immediate vs end-of-period verification)
- Grace period test (simulate payment failure via Razorpay test mode)
- Webhook idempotency test (replay same webhook 3× → 1 charge)
- Vercel function timeout test (slow DB scenario)
- Sentry instrumentation for subscription state changes

### Phase 9.4 — Launch (Day after Week 5)
- Plus tier announcement to existing free + seva users (email if Hostinger mailbox configured, in-app banner)
- Monitor first 100 subscriptions for failure modes
- Tune grace period / retry logic based on observed Razorpay retry behavior

---

## What founder must do BEFORE Phase 9 implementation starts

1. **Approve the 6 product decisions** in the "Key product decisions" section above.
2. **Verify real free-user → seva conversion rate justifies subscription monetization** — minimum bar: 100+ active free users, 5%+ conversion to seva. Below this, subscription will not generate enough volume to justify 5 weeks of solo dev time.
3. **Consult a CA** on GST threshold + registration timing (founder's lane, not advisor's).
4. **Decide subscription announcement timing** — at launch of Phase 9 (cold blast) vs gradual rollout to existing users only.

---

## What founder must NOT do during Phase 9

- Bundle Phase 9 with Phase 10 (TTS) or Phase 11 (avatar). Phase 9 is monetization-first; voice/avatar are quality-of-life features for a different post-product-market-fit moment.
- Over-iterate the Plus tier definition. Lock at ₹499 / 450 messages for launch; iterate based on subscriber data, not pre-launch speculation.
- Add Plus + seva interaction complexity beyond Decision #6 Option A. Simpler is better at launch.

---

## Sources / References

- [Razorpay Subscriptions: Automates UPI AutoPay & e-Mandate Compliance](https://razorpaydocumentation.com/best-subscription-management-platform-india-autopay-compliance)
- [Razorpay UPI Autopay for Recurring UPI Payments](https://razorpay.com/upi-autopay/)
- [Master Recurring Payments with UPI 2.0 Autopay: 2026 Guide](https://razorpay.com/blog/master-recurring-payments-upi-autopay-guide/)
- [Razorpay Launches UPI Autopay Interoperability at Global Fintech Fest 2026](https://razorpay.com/blog/upi-autopay-interoperability/)
- [Razorpay Create a Mandate API](https://razorpay.com/docs/api/payments/tpap-pro/mandate-flow/create-mandates/)
- [RBI E-Mandate Framework 2026: New Rules for Auto-Pay, UPI, Cards & Wallets](https://www.outlookbusiness.com/ampstories/news/rbi-e-mandate-framework-2026-new-rules-for-auto-pay-upi-cards-wallets)
- [RBI Released Digital Payments E-Mandate Framework 2026](https://the420.in/rbi-2026-e-mandate-framework-recurring-payments-upi-cards-india/)
- [RBI auto-debit rules explained — May 2026](https://www.businesstoday.in/amp/personal-finance/news/story/rbi-auto-debit-rules-explained-what-new-changes-mean-for-your-upi-and-card-payments-528507-2026-05-02)
- [GST on SaaS & Digital Services in India Explained](https://ampuesto.in/blog/gst-on-saas-digital-services-india/)
- [India Digital Tax Rules: GST & Equalization Levy Guide (Trustiics)](https://www.trustiics.com/posts/india-digital-tax-guide)

---

**Doc ownership:** Krishna Yadav (founder). This is design intent. Implementation decisions during Phase 9.0-9.3 may surface new edge cases — update this doc as discovered.
