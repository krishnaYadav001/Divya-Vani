// Phase 10.6 — voice_generations telemetry writer WITH the new tts_mode column.
//
// Why this exists separately from voiceCache.logVoiceGeneration:
// voiceCache.ts is locked this phase (byte-identical), and its INSERT does not
// carry the Phase-10.6 `tts_mode` column. Rather than modify the locked file,
// this module writes the same voice_generations row PLUS tts_mode, so the
// /api/tts route records whether a call came from voice mode ('voice') or the
// default path (null). The route uses THIS writer for every generation, so
// there is exactly one telemetry row per call (it no longer calls the
// voiceCache logger). voiceCache.logVoiceGeneration stays in place, untouched.
//
// Mirrors the existing per-module cached service-role client pattern
// (voiceCache.ts, voiceAccess.ts): server-only key, silent-fail so a telemetry
// miss never breaks playback. Reuses voiceCache's VoiceGenerationLog type so
// the field set can't drift.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VoiceGenerationLog } from "@/lib/voiceCache";

let cachedClient: SupabaseClient | null = null;

function getDb(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[voiceTelemetry] supabase env vars missing", {
      hasUrl: !!url,
      hasKey: !!key,
    });
    return null;
  }
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

/** One telemetry row, hashes only (never raw text), plus tts_mode. Silent-fail
 *  — a logging miss must never break playback (ops invariant). */
export async function logVoiceGeneration(
  row: VoiceGenerationLog & { ttsMode: string | null },
): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;
    const { error } = await db.from("voice_generations").insert({
      user_id: row.userId,
      reply_text_hash: row.replyTextHash,
      tagged_text_hash: row.taggedTextHash,
      voice_id: row.voiceId,
      model: row.model,
      cache_hit: row.cacheHit,
      reply_length: row.replyLength,
      tag_count: row.tagCount,
      mode: row.mode,
      latency_ms: row.latencyMs,
      tts_mode: row.ttsMode,
    });
    if (error) {
      console.error("[voiceTelemetry] logVoiceGeneration error:", error);
    }
  } catch (e) {
    console.error("[voiceTelemetry] logVoiceGeneration threw:", e);
  }
}
