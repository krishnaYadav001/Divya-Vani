import { NextResponse } from "next/server";

// Phase 8.0 voice-input STT — Sarvam AI Saaras V3.
//
// Replaced Gemini 2.5 Flash (Phase 7.0) with Sarvam Saaras V3 for
// substantially better Hindi / Hinglish / Indian-English accuracy
// (6.95% WER on Hindi per Sarvam's published numbers; their model
// is purpose-built for Indic code-mixed speech). Two architectural
// decisions worth knowing here:
//
//   1. We use Sarvam's REST endpoint, NOT their WebSocket streaming
//      endpoint, even though Saaras V3 supports both. Vercel
//      serverless functions cannot host WebSocket connections (the
//      function terminates after responding; there is no persistent
//      process to hold a socket open — confirmed in Vercel's KB).
//      A WebSocket proxy through our server is therefore not
//      achievable on the current hosting. Instead the client uses
//      VAD (Voice Activity Detection) to chop the recording into
//      natural utterance chunks, and each chunk hits this REST
//      endpoint individually. The user sees their transcript
//      appear in 2-5-word chunks every ~1-2 seconds — close to
//      true streaming UX at our actual hosting tier.
//
//   2. SARVAM_API_KEY stays server-only (security invariant). The
//      browser POSTs to /api/transcribe; this route forwards to
//      Sarvam with the key. Never expose the key to the client.
//
// Sarvam params:
//   model: "saaras:v3"        — state-of-the-art, code-mix aware
//   language_code: "unknown"   — auto-detect Hindi / Hinglish / English
//   mode: "codemix"            — preserves natural script mixing
//                                (Devanagari for Hindi tokens, Latin
//                                for English tokens within one
//                                utterance — matches our user base's
//                                actual speech)
const SARVAM_ENDPOINT = "https://api.sarvam.ai/speech-to-text";
const SARVAM_MODEL = "saaras:v3";

// 5 MB inbound cap. A typical VAD-chopped utterance (2-8 seconds of
// PCM16 mono 16kHz WAV) lands well under 200 KB; the cap is a sanity
// bound against an over-long single chunk, not a time limit.
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    console.error("[transcribe] SARVAM_API_KEY missing");
    return NextResponse.json(
      { error: "SARVAM_API_KEY missing — STT not configured" },
      { status: 500 },
    );
  }

  try {
    const body = await req.json();
    const { audio, mimeType } = body as {
      audio?: string;
      mimeType?: string;
    };

    if (!audio || typeof audio !== "string") {
      return NextResponse.json(
        { error: "missing or invalid audio (expected base64 string)" },
        { status: 400 },
      );
    }

    // Base64 size estimate: actual bytes ≈ length * 0.75
    const estimatedBytes = Math.floor(audio.length * 0.75);
    if (estimatedBytes > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "audio too large (max 5MB)" },
        { status: 413 },
      );
    }

    const audioBuffer = Buffer.from(audio, "base64");
    // Sarvam best-quality path is WAV 16kHz mono PCM16; the VAD
    // client produces exactly that and tags it audio/wav. Keep the
    // client-supplied mimeType as a fallback for non-VAD callers.
    const blob = new Blob([audioBuffer], {
      type: mimeType || "audio/wav",
    });

    const formData = new FormData();
    formData.append("file", blob, "utterance.wav");
    formData.append("model", SARVAM_MODEL);
    formData.append("language_code", "unknown");
    formData.append("mode", "codemix");

    const sarvamRes = await fetch(SARVAM_ENDPOINT, {
      method: "POST",
      headers: { "api-subscription-key": apiKey },
      body: formData,
    });

    if (!sarvamRes.ok) {
      const detail = await sarvamRes.text().catch(() => "");
      console.error(
        `[transcribe] sarvam ${sarvamRes.status}: ${detail.slice(0, 200)}`,
      );
      return NextResponse.json(
        { error: "transcription failed", detail: `sarvam ${sarvamRes.status}` },
        { status: 500 },
      );
    }

    const data = (await sarvamRes.json()) as {
      transcript?: string;
      language_code?: string;
      request_id?: string;
    };
    const text = (data.transcript ?? "").trim();

    return NextResponse.json({ text });
  } catch (e) {
    console.error("[transcribe] failed:", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "transcription failed", detail: message },
      { status: 500 },
    );
  }
}
