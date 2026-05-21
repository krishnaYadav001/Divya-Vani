import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { waitUntil } from "@vercel/functions";
import {
  convertToAudio,
  stripSpeechMarkup,
  TtsConfigError,
  DEFAULT_VOICE_ID,
  DEFAULT_MODEL,
  DEFAULT_STABILITY,
} from "@/lib/elevenlabs";
import {
  injectTags,
  KRISHNA_MODES,
  type KrishnaMode,
} from "@/lib/voiceTagInjector";
import {
  cacheKey,
  sha256Hex,
  lookupCache,
  readAudio,
  writeAudio,
  bumpCacheHit,
  logVoiceGeneration,
  countUserGenerationsLast24h,
  countTotalGenerationsLast24h,
} from "@/lib/voiceCache";
import { hasVoiceAccess } from "@/lib/voiceAccess";

// Phase 10.1 — Krishna Voice TTS backend (standalone endpoint).
//
// POST { text, modeHint?, conversationId? } → MP3 audio stream.
//
// Pipeline: validate → auth (cookie) → paywall (verified payment) →
// rate limit (per-user + site-wide 24h caps) → strip markup + word-cap →
// Haiku tag injection → content-addressed cache (Supabase Storage) →
// ElevenLabs v3 stream (tee'd: one branch to the client, one to the
// cache). Telemetry stores hashes only (DPDP-aligned). All third-party
// keys (ElevenLabs, Supabase service role) stay server-only.
//
// Node runtime: needs crypto (SHA-256), Buffer, the ElevenLabs Node SDK,
// and the Supabase service client. maxDuration headroom for the v3 call.

export const runtime = "nodejs";
export const maxDuration = 60;

const USER_COOKIE = "god_messenger_uid";
const MAX_TEXT_CHARS = 2000;

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

const DAILY_CAP_PER_USER = intFromEnv("VOICE_DAILY_CAP_PER_USER", 50);
const DAILY_CAP_TOTAL = intFromEnv("VOICE_DAILY_CAP_TOTAL", 10000);
const MAX_REPLY_WORDS = intFromEnv("VOICE_MAX_REPLY_WORDS", 100);

const AUDIO_HEADERS: Record<string, string> = {
  "Content-Type": "audio/mpeg",
  // Browser must not cache the proxied stream — our content-addressed
  // server cache is the cache layer; the per-user paywall must re-check
  // on every play.
  "Cache-Control": "no-store",
};

function isKrishnaMode(v: unknown): v is KrishnaMode {
  return (
    typeof v === "string" && (KRISHNA_MODES as readonly string[]).includes(v)
  );
}

/** Truncate to the first `maxWords` words, appending an ellipsis when cut.
 *  Returns the text + whether it was truncated. */
function capWords(
  text: string,
  maxWords: number,
): { text: string; truncated: boolean } {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return { text: text.trim(), truncated: false };
  return { text: words.slice(0, maxWords).join(" ") + " …", truncated: true };
}

/** Drain a web ReadableStream into a single Buffer. */
async function collectStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  // 1. Parse + validate body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", detail: "invalid JSON" },
      { status: 400 },
    );
  }
  const raw = (body ?? {}) as Record<string, unknown>;
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  const modeHintRaw = raw.modeHint;

  if (!text) {
    return NextResponse.json(
      { error: "bad_request", detail: "text is empty" },
      { status: 400 },
    );
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      { error: "bad_request", detail: "text too long (max 2000 chars)" },
      { status: 400 },
    );
  }
  if (modeHintRaw !== undefined && !isKrishnaMode(modeHintRaw)) {
    return NextResponse.json(
      { error: "bad_request", detail: "invalid modeHint" },
      { status: 400 },
    );
  }
  const modeHint: KrishnaMode | undefined = isKrishnaMode(modeHintRaw)
    ? modeHintRaw
    : undefined;

  // 2. Auth — existing cookie only. Voice never mints a new identity.
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 3. Paywall — must have at least one verified payment.
  const access = await hasVoiceAccess(userId);
  if (!access.allowed) {
    return NextResponse.json(
      { error: "payment_required", upgrade_path: "seva" },
      { status: 402 },
    );
  }

  // 4. Rate limit — per-user then site-wide. A negative count means the
  //    DB couldn't be read; treat per-user as "couldn't verify → allow"
  //    (a blip must not lock out a paying user) but keep the site-wide
  //    cap as the hard cost backstop (also allow on read failure, since
  //    the alternative is denying everyone on a transient error).
  const userCount = await countUserGenerationsLast24h(userId);
  if (userCount >= 0 && userCount >= DAILY_CAP_PER_USER) {
    return NextResponse.json(
      { error: "rate_limited", cap_type: "user" },
      { status: 429 },
    );
  }
  const totalCount = await countTotalGenerationsLast24h();
  if (totalCount >= 0 && totalCount >= DAILY_CAP_TOTAL) {
    return NextResponse.json(
      { error: "rate_limited", cap_type: "site" },
      { status: 429 },
    );
  }

  // 5. Strip markup, then word-cap. (Length >2000 already 400'd above.)
  const cleaned = stripSpeechMarkup(text);
  const { text: spokenText } = capWords(cleaned, MAX_REPLY_WORDS);
  if (!spokenText) {
    return NextResponse.json(
      { error: "bad_request", detail: "no speakable text after cleanup" },
      { status: 400 },
    );
  }

  // 6. Haiku tag injection (never throws).
  const { taggedText, mode, tagCount } = await injectTags(spokenText, modeHint);

  // Config snapshot for cache key + telemetry.
  const voiceId = DEFAULT_VOICE_ID;
  const model = DEFAULT_MODEL;
  const stability = DEFAULT_STABILITY;
  const key = cacheKey(taggedText, voiceId, model, stability);
  const replyTextHash = sha256Hex(spokenText);
  const replyLength = spokenText.length;

  // 7. Cache check.
  const hit = await lookupCache(key);
  if (hit) {
    try {
      const stream = await readAudio(hit.storagePath);
      waitUntil(bumpCacheHit(key));
      waitUntil(
        logVoiceGeneration({
          userId,
          replyTextHash,
          taggedTextHash: key,
          voiceId,
          model,
          cacheHit: true,
          replyLength,
          tagCount,
          mode,
          latencyMs: Date.now() - startedAt,
        }),
      );
      return new Response(stream, { status: 200, headers: AUDIO_HEADERS });
    } catch (e) {
      // Cache row present but object missing/unreadable → regenerate.
      console.error("[tts] cache read failed, regenerating:", e);
    }
  }

  // 8. Generate via ElevenLabs. A throw here is pre-stream (config / auth /
  //    4xx / 5xx / timeout) → 503; no audio byte has been committed yet.
  let elevenStream: ReadableStream<Uint8Array>;
  try {
    elevenStream = await convertToAudio(taggedText, {
      voiceId,
      model,
      stability,
    });
  } catch (e) {
    const isConfig = e instanceof TtsConfigError;
    console.error(
      isConfig
        ? "[tts] CRITICAL config/auth failure — check ELEVENLABS_API_KEY:"
        : "[tts] ElevenLabs generation failed:",
      e,
    );
    waitUntil(
      logVoiceGeneration({
        userId,
        replyTextHash,
        taggedTextHash: key,
        voiceId,
        model,
        cacheHit: false,
        replyLength,
        tagCount,
        mode: "error",
        latencyMs: Date.now() - startedAt,
      }),
    );
    return NextResponse.json({ error: "tts_unavailable" }, { status: 503 });
  }

  // 9. Tee: one branch streams to the client, the other is collected for
  //    caching + telemetry after the response (waitUntil keeps the
  //    function alive). A mid-stream failure on the cache branch is logged
  //    but never fails the request — the client already has its bytes.
  const [clientBranch, cacheBranch] = elevenStream.tee();

  waitUntil(
    (async () => {
      let bytes: Buffer | null = null;
      try {
        bytes = await collectStream(cacheBranch);
      } catch (e) {
        console.error("[tts] cache-branch collection failed:", e);
      }
      await logVoiceGeneration({
        userId,
        replyTextHash,
        taggedTextHash: key,
        voiceId,
        model,
        cacheHit: false,
        replyLength,
        tagCount,
        mode,
        latencyMs: Date.now() - startedAt,
      });
      if (bytes && bytes.length > 0) {
        try {
          await writeAudio(
            key,
            bytes,
            voiceId,
            model,
            stability,
            taggedText.length,
          );
        } catch (e) {
          // Already streamed to client; next identical request re-gens.
          console.error("[tts] storage persist failed:", e);
        }
      }
    })(),
  );

  return new Response(clientBranch, { status: 200, headers: AUDIO_HEADERS });
}
