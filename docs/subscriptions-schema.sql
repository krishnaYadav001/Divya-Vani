-- =============================================================================
-- Phase 9 — Subscriptions schema. PASTE THIS INTO THE SUPABASE SQL EDITOR.
-- =============================================================================
-- No migration tooling exists (project convention) — run this manually once.
-- All statements are idempotent (IF NOT EXISTS), safe to re-run.
--
-- Reuses the existing `webhook_events` table for subscription-webhook
-- idempotency (no separate events table needed).
-- =============================================================================

-- 1) Subscriptions — at most one ACTIVE row per user (partial unique index).
CREATE TABLE IF NOT EXISTS subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  text NOT NULL,
  razorpay_subscription_id text UNIQUE NOT NULL,
  razorpay_customer_id     text,
  plan_key                 text NOT NULL,            -- 'plus' | 'voice' | 'premium'
  currency                 text NOT NULL,            -- 'INR' | 'USD'
  billing_period           text NOT NULL,            -- 'monthly' | 'annual'
  status                   text NOT NULL,            -- created|authenticated|active|pending|halted|cancelled|completed|expired|paused
  -- Entitlements (snapshotted from the plan at creation so a later config
  -- change never silently alters an existing subscriber's allowance).
  message_pool             int  NOT NULL,
  messages_used            int  NOT NULL DEFAULT 0,
  voice_minutes_pool       int  NOT NULL,
  voice_seconds_used       int  NOT NULL DEFAULT 0,  -- seconds for precise metering
  -- Billing window (authoritative values come from Razorpay webhooks).
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean NOT NULL DEFAULT false,
  cancelled_at             timestamptz,
  amount                   int,                       -- smallest unit: paise (INR) / cents (USD)
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
  ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON subscriptions (status);
-- One ACTIVE subscription per user (others may exist as cancelled/expired history).
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_active_per_user
  ON subscriptions (user_id) WHERE status = 'active';

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;  -- no policies; service role bypasses

-- 2) Voice-minute WALLET (one-time top-ups, like seva message credits).
--    Lives on users_memory so it's read in the same fetchMemory hit.
ALTER TABLE users_memory
  ADD COLUMN IF NOT EXISTS voice_seconds_balance int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_voice_trial_claimed_at timestamptz;

-- free_voice_trial_claimed_at is the one-time guard for the 2-minute free
-- voice-to-voice trial. The grant_free_voice_trial RPC in subscriptions-rpcs.sql
-- is the only writer; it increments voice_seconds_balance exactly once.

-- 3) Wallet purchases reuse the existing `payments` table. Widen the tier
--    CHECK if one exists (the seva tier ids + the new wallet pack ids).
--    `payments.tier` is currently a free-text column (no CHECK) — nothing to
--    alter; wallet pack ids ('wallet_inr_4', 'wallet_usd_15', etc.) just store
--    as-is. If you later add a CHECK constraint, include the wallet ids.

-- 4) Voice session ledger — a high-water mark of metered seconds per ElevenLabs
--    conversation. Voice is debited from TWO reports of the same call: the
--    browser's provisional duration (instant, for snappy balance UX, but
--    spoofable) and ElevenLabs' AUTHORITATIVE post-call webhook duration. Both
--    call meter_voice_session() (see subscriptions-rpcs.sql), which only ever
--    charges the INCREMENT beyond what this row already recorded — so the two
--    reports (and webhook retries) can never double-charge, and a suppressed /
--    under-reported client number is trued up by the webhook.
CREATE TABLE IF NOT EXISTS voice_sessions (
  conversation_id  text PRIMARY KEY,         -- ElevenLabs conversation id
  user_id          text NOT NULL,
  metered_seconds  int  NOT NULL DEFAULT 0,  -- max duration charged so far
  last_source      text,                     -- 'client' | 'webhook' (diagnostics)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_user_id ON voice_sessions (user_id);
ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;  -- no policies; service role bypasses

-- =============================================================================
-- Done. After running: confirm `subscriptions` + `voice_sessions` exist and
-- `users_memory` has `voice_seconds_balance` + `free_voice_trial_claimed_at`.
-- Then create the Razorpay Plans (see the setup script / dashboard step) and
-- set the RAZORPAY_PLAN_* env vars.
-- =============================================================================
