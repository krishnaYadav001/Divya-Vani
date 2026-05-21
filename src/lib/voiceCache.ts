// Phase 10.1 — Voice cache + telemetry (Supabase Storage + Postgres).
//
// Content-addressed MP3 cache: the key is a SHA-256 over the tagged text
// + voice + model + stability, so two users who hit the identical reply
// share one cached MP3 (cached audio is not personal data — it carries
// no user id and lives in a private, content-addressed bucket).
//
// Also owns the voice_generations telemetry writes + the rolling-24h
// counts the rate limiter reads. Both voice tables are written through
// the service-role client (server-only), mirroring src/lib/supabase.ts.
// Telemetry stores HASHES only — never raw reply text — so an
// opted-out user's content is never persisted here.
//
// Storage bucket: `voice-cache` (private, audio/mpeg). Founder creates it
// manually before deploy (see the CC report). All errors silent-fail per
// the ops invariant — a cache/telemetry miss must never break playback.

import { createHash } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "voice-cache";

let cachedClient: SupabaseClient | null = null;

function getDb(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[voiceCache] supabase env vars missing", {
      hasUrl: !!url,
      hasKey: !!key,
    });
    return null;
  }
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

/** SHA-256 over the exact bytes that determine the audio output. NFC-
 *  normalize the tagged text so Devanagari composed/decomposed variants
 *  collapse to one key. */
export function cacheKey(
  taggedText: string,
  voiceId: string,
  model: string,
  stability: number,
): string {
  return createHash("sha256")
    .update(`${taggedText.normalize("NFC")}|${voiceId}|${model}|${stability.toFixed(2)}`)
    .digest("hex");
}

/** Generic SHA-256 hex — used for reply_text_hash telemetry. */
export function sha256Hex(s: string): string {
  return createHash("sha256").update(s.normalize("NFC")).digest("hex");
}

export async function lookupCache(
  key: string,
): Promise<{ storagePath: string } | null> {
  try {
    const db = getDb();
    if (!db) return null;
    const { data, error } = await db
      .from("voice_cache")
      .select("audio_storage_path")
      .eq("tagged_text_hash", key)
      .maybeSingle();
    if (error) {
      console.error("[voiceCache] lookupCache error:", error);
      return null;
    }
    if (!data?.audio_storage_path) return null;
    return { storagePath: data.audio_storage_path as string };
  } catch (e) {
    console.error("[voiceCache] lookupCache threw:", e);
    return null;
  }
}

/** Read a cached MP3 from Storage as a web ReadableStream. Throws on
 *  failure so the route can fall through to regeneration. */
export async function readAudio(
  storagePath: string,
): Promise<ReadableStream<Uint8Array>> {
  const db = getDb();
  if (!db) throw new Error("supabase client unavailable");
  const { data, error } = await db.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(`storage download failed: ${error?.message ?? "no data"}`);
  }
  return data.stream() as ReadableStream<Uint8Array>;
}

/**
 * Upload the MP3 to Storage at `{key}.mp3` and insert the voice_cache row.
 * Returns the storage path. `upsert: true` so a rare concurrent
 * double-generation (accepted per the edge-case list) overwrites
 * harmlessly. Throws on failure — the route already streamed bytes to the
 * client, so it logs and moves on (next identical request re-generates).
 */
export async function writeAudio(
  key: string,
  audioBytes: Buffer,
  voiceId: string,
  model: string,
  stability: number,
  characterCount: number,
): Promise<string> {
  const db = getDb();
  if (!db) throw new Error("supabase client unavailable");
  const path = `${key}.mp3`;

  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(path, audioBytes, { contentType: "audio/mpeg", upsert: true });
  if (upErr) {
    throw new Error(`storage upload failed: ${upErr.message}`);
  }

  const { error: rowErr } = await db.from("voice_cache").upsert(
    {
      tagged_text_hash: key,
      voice_id: voiceId,
      model,
      stability,
      audio_storage_path: path,
      character_count: characterCount,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "tagged_text_hash" },
  );
  if (rowErr) {
    // The MP3 is uploaded; a failed row insert just means the next hit
    // misses and regenerates. Log, don't throw.
    console.error("[voiceCache] writeAudio row upsert error:", rowErr);
  }
  return path;
}

/** Increment hit_count + refresh last_used_at on a cache hit. Read-modify-
 *  write (no rpc exists for this); the tiny race on hit_count is
 *  acceptable — it is telemetry only. Silent-fail. */
export async function bumpCacheHit(key: string): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;
    const { data, error } = await db
      .from("voice_cache")
      .select("hit_count")
      .eq("tagged_text_hash", key)
      .maybeSingle();
    if (error) {
      console.error("[voiceCache] bumpCacheHit read error:", error);
      return;
    }
    const next = ((data?.hit_count as number | null) ?? 0) + 1;
    const { error: updErr } = await db
      .from("voice_cache")
      .update({ hit_count: next, last_used_at: new Date().toISOString() })
      .eq("tagged_text_hash", key);
    if (updErr) {
      console.error("[voiceCache] bumpCacheHit update error:", updErr);
    }
  } catch (e) {
    console.error("[voiceCache] bumpCacheHit threw:", e);
  }
}

export type VoiceGenerationLog = {
  userId: string;
  replyTextHash: string;
  taggedTextHash: string;
  voiceId: string;
  model: string;
  cacheHit: boolean;
  replyLength: number;
  tagCount: number;
  mode: string | null;
  latencyMs: number | null;
};

/** Insert one telemetry row. Hashes only — never raw text. Silent-fail. */
export async function logVoiceGeneration(
  row: VoiceGenerationLog,
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
    });
    if (error) {
      console.error("[voiceCache] logVoiceGeneration error:", error);
    }
  } catch (e) {
    console.error("[voiceCache] logVoiceGeneration threw:", e);
  }
}

function since24h(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

/** Count this user's voice generations in the last 24h. Fail-OPEN here
 *  would let a runaway bypass the cap; instead a count error returns a
 *  sentinel the route treats conservatively. We return the real count or
 *  -1 on error; the route reads -1 as "couldn't verify → allow" (a DB
 *  blip should not lock out a paying user — the site-wide cap is the hard
 *  cost backstop). */
export async function countUserGenerationsLast24h(
  userId: string,
): Promise<number> {
  try {
    const db = getDb();
    if (!db) return -1;
    const { count, error } = await db
      .from("voice_generations")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since24h());
    if (error) {
      console.error("[voiceCache] countUserGenerations error:", error);
      return -1;
    }
    return count ?? 0;
  } catch (e) {
    console.error("[voiceCache] countUserGenerations threw:", e);
    return -1;
  }
}

/** Count site-wide voice generations in the last 24h. */
export async function countTotalGenerationsLast24h(): Promise<number> {
  try {
    const db = getDb();
    if (!db) return -1;
    const { count, error } = await db
      .from("voice_generations")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since24h());
    if (error) {
      console.error("[voiceCache] countTotalGenerations error:", error);
      return -1;
    }
    return count ?? 0;
  } catch (e) {
    console.error("[voiceCache] countTotalGenerations threw:", e);
    return -1;
  }
}
