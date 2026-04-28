// Server-only. Imports SUPABASE_SERVICE_ROLE_KEY at module load.
// Never import this file from a client component or it will leak the key.

import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL) throw new Error('SUPABASE_URL missing');
if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');

const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIM = 768;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const embedModel = genAI.getGenerativeModel({ model: EMBED_MODEL });

export type VerseHit = {
  reference: string;
  chapter: number;
  verse_number: number;
  sanskrit: string;
  transliteration: string;
  hindi: string;
  english: string;
  themes: string[];
  similarity: number;
};

export async function searchVerses(query: string, k: number = 5): Promise<VerseHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // SDK v0.24 types don't include outputDimensionality on EmbedContentRequest,
  // but the v1beta API accepts it. Cast bypasses the stale type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await embedModel.embedContent({
    content: { role: 'user', parts: [{ text: trimmed }] },
    taskType: TaskType.RETRIEVAL_QUERY,
    outputDimensionality: EMBED_DIM,
  } as any);

  const { data, error } = await supabase.rpc('match_verses', {
    query_embedding: r.embedding.values,
    match_count: k,
  });

  if (error) throw new Error(`match_verses RPC: ${error.message}`);
  return (data ?? []) as VerseHit[];
}
