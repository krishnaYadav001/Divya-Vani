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

-- consume_voice_seconds — meter a finished voice session. Spends from the
-- active subscription's voice pool FIRST, then overflows to the one-time wallet
-- (users_memory.voice_seconds_balance), flooring each at 0. Both mutations are
-- row-locked (FOR UPDATE) so concurrent calls can't double-spend. Returns a
-- jsonb breakdown { from_pool, from_wallet, shortfall } — shortfall is seconds
-- that exceeded both balances (overage we couldn't charge; telemetry only, the
-- session already happened). Voice ENTRY is gated separately by hasVoiceAccess;
-- this just debits after the fact.
CREATE OR REPLACE FUNCTION consume_voice_seconds(p_user_id text, p_seconds int)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_used          int;
  v_pool          int;
  v_pool_remaining int := 0;
  v_from_pool     int := 0;
  v_remainder     int := 0;
  v_wallet        int;
  v_from_wallet   int := 0;
BEGIN
  IF p_seconds IS NULL OR p_seconds <= 0 THEN
    RETURN jsonb_build_object('from_pool', 0, 'from_wallet', 0, 'shortfall', 0);
  END IF;

  -- 1) Subscription pool first.
  SELECT voice_seconds_used, voice_minutes_pool * 60
    INTO v_used, v_pool
    FROM subscriptions
   WHERE user_id = p_user_id AND status = 'active'
   FOR UPDATE;

  IF FOUND THEN
    v_pool_remaining := GREATEST(v_pool - v_used, 0);
    v_from_pool := LEAST(p_seconds, v_pool_remaining);
    IF v_from_pool > 0 THEN
      UPDATE subscriptions
         SET voice_seconds_used = voice_seconds_used + v_from_pool,
             updated_at = now()
       WHERE user_id = p_user_id AND status = 'active';
    END IF;
  END IF;

  -- 2) Wallet overflow for whatever the pool didn't cover.
  v_remainder := p_seconds - v_from_pool;
  IF v_remainder > 0 THEN
    SELECT voice_seconds_balance
      INTO v_wallet
      FROM users_memory
     WHERE user_id = p_user_id
     FOR UPDATE;
    IF FOUND THEN
      v_from_wallet := LEAST(v_remainder, GREATEST(v_wallet, 0));
      IF v_from_wallet > 0 THEN
        UPDATE users_memory
           SET voice_seconds_balance = voice_seconds_balance - v_from_wallet,
               updated_at = now()
         WHERE user_id = p_user_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'from_pool',   v_from_pool,
    'from_wallet', v_from_wallet,
    'shortfall',   v_remainder - v_from_wallet
  );
END;
$$;

-- credit_voice_seconds — add purchased wallet minutes (as seconds) to a user's
-- one-time balance. Used by /api/wallet/verify + the payment.captured webhook
-- recovery path. Atomic + handles a voice-first buyer who has no users_memory
-- row yet (INSERT ... ON CONFLICT increments). Returns the new balance.
CREATE OR REPLACE FUNCTION credit_voice_seconds(p_user_id text, p_seconds int)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  new_balance int;
BEGIN
  IF p_seconds IS NULL OR p_seconds <= 0 THEN
    SELECT voice_seconds_balance INTO new_balance
      FROM users_memory WHERE user_id = p_user_id;
    RETURN COALESCE(new_balance, 0);
  END IF;

  INSERT INTO users_memory (user_id, voice_seconds_balance)
  VALUES (p_user_id, p_seconds)
  ON CONFLICT (user_id) DO UPDATE
    SET voice_seconds_balance =
          users_memory.voice_seconds_balance + EXCLUDED.voice_seconds_balance,
        updated_at = now()
  RETURNING voice_seconds_balance INTO new_balance;

  RETURN new_balance;
END;
$$;

-- =============================================================================
-- Done. Confirm all three functions exist:
--   SELECT proname FROM pg_proc WHERE proname IN
--    ('increment_subscription_messages','consume_voice_seconds','credit_voice_seconds');
-- =============================================================================
