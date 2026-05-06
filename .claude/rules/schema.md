---
paths:
  - "scripts/ingest-*.ts"
  - "scripts/regenerate-hindi*.ts"
  - "src/lib/supabase.ts"
  - "src/lib/verses.ts"
  - "src/app/api/**/*"
---

# Supabase schema

This rule loads when Claude is touching ingestion / regeneration scripts, the Supabase / verses libs, or any API route. The CLAUDE.md root has only a one-line pointer here.

## `users_memory` (one row per user)

| column | type | default | purpose |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PK |
| `user_id` | text unique not null | — | Cookie UUID |
| `auth_user_id` | uuid | null | Supabase Auth link (Phase 5+) |
| `user_name` | text | null | Asked in turn 1 (Phase 4+) |
| `main_problem` | text | null | Latest extracted concern |
| `emotion` | text | null | Latest extracted emotion |
| `context_summary` | text | null | Running narrative across turns |
| `last_active_at` | timestamptz | null | Returning-after-gap detection |
| `message_count` | int | 0 | Free-tier counter |
| `seva_balance` | int | 0 | Remaining purchased messages from seva tiers (Phase 5+) |
| `is_first_time` | bool | true | Onboarding flag |
| `verses_referenced` | text[] | `{}` | Verse refs used in last reply (Phase 2+) |
| `updated_at` | timestamptz | `now()` | Generic |

Note: legacy `is_paid` column from God Messenger era is dropped in Phase 5 in favor of `seva_balance` only. No time-based unlimited at v1; subscriptions (Phase 9+) introduce a separate `subscriptions` table rather than adding columns here.

## `verses` (Phase 1+)

| column | type | purpose |
|---|---|---|
| `id` | uuid | PK |
| `source` | text | `'gita'`, `'mahabharata'`, `'bhagavata'` |
| `reference` | text | `'gita_2.47'` |
| `chapter` | int | |
| `verse_number` | int | |
| `sanskrit` | text | |
| `transliteration` | text | |
| `hindi` | text | |
| `english` | text | |
| `themes` | text[] | `['fear','duty','action']` |
| `embedding` | vector(768) | Gemini `gemini-embedding-001` @ outputDimensionality 768 |
| `created_at` | timestamptz | |

Index: `ivfflat` on `embedding` using `vector_cosine_ops`.

**Current row counts (2026-05-02):** 701 gita + 1,704 mahabharata + 727 bhagavata (568 Canto 10 + 159 Canto 11.6–29 Uddhava-Gita) = **3,132 total scriptural rows**. Mahabharata + Bhagavata rows have `sanskrit = ''` and `sanskrit_source = NULL` per Phase 1.5 / 1.6 / 1.7 Sanskrit deferrals.

## `feedback` (Phase 6+)

`message_id`, `user_id`, `rating` (up/down), `text`, `created_at`.

## `payments` (Phase 5+)

One row per Razorpay order. Created at `/api/seva/create-order`, transitioned to `verified` by `/api/seva/verify` (synchronous client path) or by the `payment.captured` webhook (async safety net) — whichever wins. `markPaymentVerifiedAtomic` enforces a `WHERE status = 'created'` clause so the two paths cannot double-credit.

| column | type | default | purpose |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | PK |
| `user_id` | text not null | — | Cookie UUID (matches `users_memory.user_id`) |
| `razorpay_order_id` | text unique not null | — | Razorpay's order id; UNIQUE enables idempotent lookup |
| `razorpay_payment_id` | text | null | Set by verify or `payment.captured` webhook |
| `amount_paise` | int not null | — | Tier price in paise (e.g. 1100 for ₹11) |
| `tier` | text not null | — | Seva tier id (`pratham_seva` / `anjali` / `bhakti` / `param`) |
| `status` | text not null | — | `'created'` \| `'verified'` \| `'failed'` |
| `created_at` | timestamptz | `now()` | Order creation timestamp |
| `verified_at` | timestamptz | null | Set when status flips to `'verified'` |
| `refunded_at` | timestamptz | null | Set by `refund.created` webhook (Phase 5.3+) |
| `razorpay_refund_id` | text | null | Refund id from `refund.created` payload (Phase 5.3+) |

## `webhook_events` (Phase 5.3+)

Audit + idempotency table for Razorpay webhook deliveries. The handler short-circuits on duplicate `event_id` (Razorpay reuses `x-razorpay-event-id` on retries — exponential backoff up to ~24h). `payload` retains the full event for forensic replay.

| column | type | default | purpose |
|---|---|---|---|
| `event_id` | text primary key | — | Razorpay's `x-razorpay-event-id`; PK enforces single-processing |
| `event_type` | text not null | — | e.g. `'payment.captured'`, `'payment.failed'`, `'refund.created'` |
| `received_at` | timestamptz not null | `now()` | Server receive timestamp |
| `payload` | jsonb | — | Full event JSON |

**RLS:** enabled on all tables, no policies (locks anonymous access). Service role bypasses; service role key is server-only.

**Migrations:** manual `ALTER TABLE` via Supabase SQL Editor. No tooling. Schema changes ALWAYS paired with the SQL given to the founder for manual execution. Phase 5.3 manual SQL adds `payments.refunded_at`, `payments.razorpay_refund_id`, and the `webhook_events` table — all idempotent (`IF NOT EXISTS`).
