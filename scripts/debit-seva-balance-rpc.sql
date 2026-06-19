-- =============================================================================
-- debit_seva_balance — atomic seva debit (full-refund auto-debit)
-- =============================================================================
-- FOUNDER: Paste this into the Supabase SQL Editor and run it once.
--
-- WHY: the Razorpay webhook's full-refund handler debited seva_balance with a
-- read-modify-write (fetchMemory → compute → saveMemory). That is a race: a
-- concurrent purchase/decrement between the read and the write could be lost.
-- This RPC makes the debit a single atomic, clamped UPDATE — mirroring the
-- existing credit_seva_balance / decrement_seva_balance functions.
--
-- Semantics: subtract p_amount, clamped at 0 (never negative). UPDATE-only —
-- returns the new balance, or NULL if the user row doesn't exist (caller treats
-- NULL as "nothing to debit"). Idempotent to re-run (CREATE OR REPLACE).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.debit_seva_balance(p_user_id text, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
AS $function$
declare
  new_balance int;
begin
  if p_amount is null or p_amount <= 0 then
    select seva_balance into new_balance
      from users_memory where user_id = p_user_id;
    return new_balance;  -- nothing to debit; return current (or NULL if no row)
  end if;

  update users_memory
    set seva_balance = greatest(0, coalesce(seva_balance, 0) - p_amount),
        updated_at = now()
    where user_id = p_user_id
    returning seva_balance into new_balance;

  return new_balance;  -- NULL when no row matched (unknown user)
end;
$function$;

-- Verify:
--   SELECT proname FROM pg_proc WHERE proname = 'debit_seva_balance';
