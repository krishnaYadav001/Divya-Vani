-- =============================================================================
-- Referral & Share-Reward System — manual schema
-- =============================================================================
-- FOUNDER: Paste this entire file into the Supabase SQL Editor and run it once.
--
-- This project uses NO migration tooling. Schema changes are applied by hand via
-- the Supabase SQL Editor (see .claude/rules/schema.md). Every statement below is
-- idempotent (guarded with IF NOT EXISTS / CREATE OR REPLACE), so re-running this
-- file is SAFE: it produces no errors and creates no duplicate columns, tables,
-- constraints, or indexes.
--
-- What it does:
--   1. Adds a nullable referral_code to users_memory (UNIQUE allows many NULLs,
--      rejects duplicate non-NULLs).
--   2. Creates the referrals bookkeeping table (one row per referred user).
--   3. Creates the reward_transactions bookkeeping table (one row per credited
--      referral).
--   4. Enables row-level security with zero policies on both new tables
--      (service-role bypasses; the service-role key is server-only).
--
-- No new voice-balance column and no new free-message column are added — rewards
-- credit the existing users_memory.voice_seconds_balance, and qualification reads
-- the existing users_memory.message_count. Crediting reuses the EXISTING
-- credit_voice_seconds(p_user_id text, p_seconds int) RPC defined in
-- docs/subscriptions-rpcs.sql (the same RPC /api/wallet/verify uses).
-- =============================================================================

-- 1. Referral code on the existing users_memory row (nullable; UNIQUE allows
--    multiple NULLs but rejects duplicate non-NULL values).
ALTER TABLE users_memory
  ADD COLUMN IF NOT EXISTS referral_code text;

CREATE UNIQUE INDEX IF NOT EXISTS users_memory_referral_code_key
  ON users_memory (referral_code);

-- 2. Referrals table — one row per referred user (UNIQUE referred_user_id).
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id text NOT NULL,
  referred_user_id text NOT NULL,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'qualified', 'rejected')),
  required_messages int NOT NULL DEFAULT 3,
  reward_seconds int NOT NULL DEFAULT 120,
  referred_message_count_at_qualification int,
  created_at timestamptz NOT NULL DEFAULT now(),
  qualified_at timestamptz,
  rejected_reason text
);

CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_user_id_key
  ON referrals (referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_user_id
  ON referrals (referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_user_id
  ON referrals (referred_user_id);

-- 3. Reward transactions — one row per credited referral (UNIQUE related_referral_id).
CREATE TABLE IF NOT EXISTS reward_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  type text NOT NULL DEFAULT 'referral_voice_reward',
  amount_seconds int NOT NULL DEFAULT 120,
  related_referral_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reward_transactions_related_referral_id_key
  ON reward_transactions (related_referral_id);
CREATE INDEX IF NOT EXISTS idx_reward_transactions_user_id
  ON reward_transactions (user_id);

-- 4. RLS on, zero policies (service-role bypasses; key is server-only).
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_transactions ENABLE ROW LEVEL SECURITY;

-- 5. (Voice wallet credit RPC reused, NOT redefined.)
--    The referral feature credits voice_seconds_balance via the EXISTING
--    credit_voice_seconds(p_user_id text, p_seconds int) RPC defined in
--    docs/subscriptions-rpcs.sql. That RPC is already live in production
--    (used by /api/wallet/verify) and Postgres won't let CREATE OR REPLACE
--    rename its parameter (42P13). If for any reason credit_voice_seconds
--    does not exist in this database yet, paste docs/subscriptions-rpcs.sql
--    once before this file.
