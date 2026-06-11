-- =============================================================================
-- Phase 8.x — Memory layer #4: semantic retrieval over chat_logs (2026-06-11)
-- =============================================================================
-- Paste into the production Supabase SQL Editor. Idempotent — safe to re-run.
-- Until this is run, the code silent-fails: turns are logged unembedded and
-- retrieval returns [] (a "[chatMemory] match_chat_history RPC error" warn
-- line in Vercel logs is the tell).
--
-- Privacy posture unchanged: rides entirely on chat_logs — training_opt_out
-- users are never logged there so never embedded; the 180-day purge deletes
-- the embedding with the row.

-- 1. Embedding column (Gemini gemini-embedding-001 @ 768 dims, same as verses).
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS embedding vector(768);

-- 2. Per-user cosine search RPC. Executed via the service-role client only;
--    RLS on chat_logs stays enabled with no policies.
CREATE OR REPLACE FUNCTION match_chat_history(
  p_user_id text,
  query_embedding vector(768),
  match_count int DEFAULT 3
)
RETURNS TABLE (
  user_message text,
  reply_text text,
  turn_at timestamptz,
  similarity double precision
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.user_message,
    c.reply_text,
    c.turn_at,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM chat_logs c
  WHERE c.user_id = p_user_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 3. OPTIONAL — vector index. At current row counts a per-user scan is
--    already fast (the user_id filter narrows to a handful of rows); create
--    this only when chat_logs grows past ~50k rows:
-- CREATE INDEX IF NOT EXISTS idx_chat_logs_embedding
--   ON chat_logs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 4. After pasting: backfill embeddings for existing rows from your machine:
--    npx tsx --env-file=.env.local scripts/backfill-chat-embeddings.ts
