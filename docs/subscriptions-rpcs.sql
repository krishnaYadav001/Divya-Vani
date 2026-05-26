-- =============================================================================
-- Phase 9 — Subscription RPCs. PASTE THIS INTO THE SUPABASE SQL EDITOR.
-- =============================================================================
-- Run AFTER docs/subscriptions-schema.sql (it depends on the `subscriptions`
-- table). CREATE OR REPLACE is idempotent — safe to re-run.
--
-- Mirrors the existing credit_seva_balance / decrement_seva_balance functions:
-- balance mutations live in SQL so the WHERE guard makes them race-safe (a
-- double-submit can't over-count or push a counter past its pool).
-- =============================================================================

-- increment_subscription_messages — consume one message from the user's ACTIVE
-- subscription pool. Returns the new messages_used, or NULL when there is no
-- active subscription OR the pool is already exhausted (messages_used >=
-- message_pool). The chat route reads this NULL as "no sub allowance — fall
-- through to seva / paywall".
CREATE OR REPLACE FUNCTION increment_subscription_messages(p_user_id text)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  new_used int;
BEGIN
  UPDATE subscriptions
     SET messages_used = messages_used + 1,
         updated_at = now()
   WHERE user_id = p_user_id
     AND status = 'active'
     AND messages_used < message_pool
  RETURNING messages_used INTO new_used;

  RETURN new_used;  -- NULL when no row matched
END;
$$;

-- =============================================================================
-- Done. The voice-metering RPC (consume_voice_seconds) is added in a later
-- increment and will be appended to this file for a single re-paste.
-- =============================================================================
