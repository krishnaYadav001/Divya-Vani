// =============================================================================
// Phase 8.x — Semantic memory retrieval over chat_logs (memory layer #4).
// =============================================================================
// The fourth memory layer (alongside the verbatim recent window, the extracted
// fact store in users_memory, and the rolling context_summary): embed every
// logged turn, then per incoming message retrieve the few most RELEVANT old
// exchanges — so when a user mentions "my brother" and that conversation was
// 60 turns ago (outside the verbatim window), Krishna still has it.
//
// Same machinery as verse RAG: Gemini gemini-embedding-001 @ 768 dims into
// pgvector, cosine search via an RPC (match_chat_history — SQL given to the
// founder for manual paste, see docs/sql-chat-memory-retrieval.sql).
//
// DESIGN: everything here SILENT-FAILS (ops invariant — chat must keep
// working). Missing env, Gemini failure, missing column/RPC (founder hasn't
// pasted the SQL yet) → embed returns null, search returns []. Deploy-safe in
// any order.
//
// Privacy: rides entirely on chat_logs — training_opt_out users are never
// logged there, so they are never embedded or retrieved; the 180-day purge
// deletes the embedding with the row. No new disclosure surface.

import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768;
// Combined user+reply text cap before embedding (chars). Keeps the embed call
// bounded; the stored row itself is untouched.
const EMBED_TEXT_CAP = 4000;
// Below this cosine similarity a "memory" is noise, not a memory — an
// unrelated old turn injected as context reads as Krishna misremembering.
const MIN_SIMILARITY = 0.4;

let cachedDb: SupabaseClient | null = null;
function getDb(): SupabaseClient | null {
  if (cachedDb) return cachedDb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cachedDb = createClient(url, key, { auth: { persistSession: false } });
  return cachedDb;
}

let cachedEmbed: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null =
  null;
function getEmbedModel() {
  if (cachedEmbed) return cachedEmbed;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  cachedEmbed = new GoogleGenerativeAI(key).getGenerativeModel({
    model: EMBED_MODEL,
  });
  return cachedEmbed;
}

async function embedText(
  text: string,
  taskType: TaskType,
): Promise<number[] | null> {
  try {
    const model = getEmbedModel();
    if (!model) return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    // SDK v0.24 types don't include outputDimensionality on
    // EmbedContentRequest, but the v1beta API accepts it (same cast as
    // verses.ts).
    const r = await model.embedContent({
      content: { role: "user", parts: [{ text: trimmed }] },
      taskType,
      outputDimensionality: EMBED_DIM,
    } as unknown as Parameters<typeof model.embedContent>[0]);
    const values = r.embedding?.values;
    return Array.isArray(values) && values.length === EMBED_DIM ? values : null;
  } catch (e) {
    console.warn("[chatMemory] embedText failed:", e);
    return null;
  }
}

/**
 * Embedding for STORAGE of one logged turn. Combines the user's message with
 * Krishna's reply so retrieval can match on either side of the exchange.
 * Called post-stream (inside logChatTurn) — never on the latency-critical path.
 */
export async function embedChatTurn(
  userMessage: string,
  replyText: string,
): Promise<number[] | null> {
  return embedText(
    `${userMessage}\n${replyText}`.slice(0, EMBED_TEXT_CAP),
    TaskType.RETRIEVAL_DOCUMENT,
  );
}

export type ChatMemoryHit = {
  user_message: string;
  reply_text: string;
  turn_at: string;
  similarity: number;
};

/**
 * Semantic search over the user's OWN past turns. Embeds the query
 * (RETRIEVAL_QUERY) and cosine-searches chat_logs via the match_chat_history
 * RPC, filtered server-side to this user_id. Returns at most `k` hits above
 * MIN_SIMILARITY, most-similar first. Silent-fails to [].
 */
export async function searchChatMemory(
  userId: string,
  query: string,
  k: number = 3,
): Promise<ChatMemoryHit[]> {
  try {
    const db = getDb();
    if (!db) return [];
    const embedding = await embedText(query, TaskType.RETRIEVAL_QUERY);
    if (!embedding) return [];
    const { data, error } = await db.rpc("match_chat_history", {
      p_user_id: userId,
      query_embedding: embedding,
      match_count: k,
    });
    if (error) {
      // Most common pre-SQL-paste failure: RPC doesn't exist yet. Quiet line,
      // not an error — the feature simply isn't on until the founder pastes.
      console.warn("[chatMemory] match_chat_history RPC error:", error.message);
      return [];
    }
    if (!Array.isArray(data)) return [];
    return (data as ChatMemoryHit[]).filter(
      (h) =>
        typeof h.similarity === "number" && h.similarity >= MIN_SIMILARITY,
    );
  } catch (e) {
    console.warn("[chatMemory] searchChatMemory threw:", e);
    return [];
  }
}
