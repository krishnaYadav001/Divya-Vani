-- =============================================================================
-- Security hardening — enable RLS on users_memory
-- =============================================================================
-- FOUNDER: Paste this into the Supabase SQL Editor and run it once.
--
-- WHY: Every other table in the project has Row Level Security enabled with
-- zero policies (service-role bypasses; the service-role key is server-only).
-- users_memory was the ONE table left with RLS disabled — and it is the most
-- sensitive (seva_balance, voice_seconds_balance, user_name, context_summary,
-- growing_edge, referral_code).
--
-- IMPACT: None today. The app never connects to Supabase with the anon/public
-- key (verified: there is no browser-side Supabase client anywhere). All access
-- is server-side via the service-role key, which BYPASSES RLS. Enabling RLS
-- with no policies therefore changes nothing for the running app — it only
-- closes the latent hole where a future browser-side anon-key read/write would
-- have had full access to this one table while every other table stayed locked.
--
-- Idempotent: ENABLE ROW LEVEL SECURITY is a no-op if already enabled.
-- No policies are added (matches the existing pattern on every other table).
-- =============================================================================

ALTER TABLE users_memory ENABLE ROW LEVEL SECURITY;

-- Verify (should return relrowsecurity = true):
--   SELECT relname, relrowsecurity
--   FROM pg_class
--   WHERE relname = 'users_memory' AND relnamespace = 'public'::regnamespace;
