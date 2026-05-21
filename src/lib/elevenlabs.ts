// Phase 10.1 — ElevenLabs TTS wrapper (Krishna Voice).
//
// Thin server-only wrapper around the official @elevenlabs/elevenlabs-js
// SDK (v2.x). Exposes convertToAudio(text, options) returning a web
// ReadableStream<Uint8Array> of MP3 bytes, plus the speech-markup
// stripper and the shared config constants the /api/tts route reads.
//
// Security invariant: ELEVENLABS_API_KEY is server-only. This module is
// never imported by client code (it pulls in the Node SDK + reads the
// key from process.env). The browser only ever sees the audio bytes the
// route streams back — never the key, never the tagged text.
//
// Voice: Viraj (3AMU7jXQuQa3oRvRqUmb). Model: eleven_v3. Stability 0.85
// (close to the Robust end — steadier, less improvisational delivery,
// the right register for a scriptural persona). Output mp3_44100_128.
//
// NOTE on the SDK method name: the spec referenced `convertAsStream`,
// but the installed SDK (v2.49.0) exposes streaming as
// `textToSpeech.stream(voiceId, request, requestOptions)` returning
// HttpResponsePromise<ReadableStream<Uint8Array>>. Verified against the
// shipped type definitions before writing this wrapper.

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

/** Thrown when the API key is not configured. The route maps this to a
 *  503 + a critical log line (a bad/missing key is an ops problem, not a
 *  user problem). */
export class TtsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TtsConfigError";
  }
}

function numberFromEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

// Config — hardcoded defaults, env-overridable without redeploy (the
// route + this module both read the same constants).
export const DEFAULT_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID ?? "3AMU7jXQuQa3oRvRqUmb"; // Viraj
export const DEFAULT_MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_v3";
export const DEFAULT_STABILITY = numberFromEnv(
  process.env.ELEVENLABS_STABILITY,
  0.85,
);
// Fixed per spec — codec_samplerate_bitrate. `as const` keeps the literal
// type so it satisfies the SDK's TextToSpeechStreamRequestOutputFormat
// union without a cast.
const OUTPUT_FORMAT = "mp3_44100_128" as const;
// Outer per-request bound. The route's edge-case list calls for aborting
// a generation that runs past ~30s; the SDK throws ElevenLabsTimeoutError
// which the route catches → 503.
const TTS_TIMEOUT_SECONDS = 30;

let cachedClient: ElevenLabsClient | null = null;

function getClient(): ElevenLabsClient {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new TtsConfigError("ELEVENLABS_API_KEY missing — TTS not configured");
  }
  cachedClient = new ElevenLabsClient({ apiKey });
  return cachedClient;
}

export type ConvertOptions = {
  voiceId?: string;
  model?: string;
  stability?: number;
};

/**
 * Convert `text` (already tag-injected) to an MP3 audio stream. Returns a
 * web ReadableStream<Uint8Array> the caller can both stream to the client
 * and tee for caching. Throws TtsConfigError (missing key) or the SDK's
 * own error types (network / 4xx / 5xx / timeout) — the route translates
 * all of these into a 503 because the failure happens before any audio
 * byte has been committed to the HTTP response.
 */
export async function convertToAudio(
  text: string,
  options: ConvertOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  const client = getClient();
  const stream = await client.textToSpeech.stream(
    options.voiceId ?? DEFAULT_VOICE_ID,
    {
      text,
      modelId: options.model ?? DEFAULT_MODEL,
      outputFormat: OUTPUT_FORMAT,
      voiceSettings: { stability: options.stability ?? DEFAULT_STABILITY },
    },
    { timeoutInSeconds: TTS_TIMEOUT_SECONDS, maxRetries: 1 },
  );
  return stream;
}

/**
 * Strip speech-irrelevant markup before TTS. Krishna's persona forbids
 * code fences and the reply rarely carries markdown, but this is
 * defensive: ElevenLabs would otherwise read "asterisk asterisk" etc.
 * Removes ``` fences (and their contents), inline `code`, **bold** /
 * *italic* / _underscores_ markers, and markdown link syntax — keeping
 * the human-readable text. Audio tags ([gently] etc.) are NOT touched;
 * they are added later by the tag injector and are meaningful to v3.
 */
export function stripSpeechMarkup(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2") // italic (single *)
    .replace(/_([^_\n]+)_/g, "$1") // underscore emphasis
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → text
    .replace(/[ \t]{2,}/g, " ") // collapse runs of spaces
    .trim();
}
