import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

// Phase 7.0 voice-input STT — gemini-2.5-flash supports audio via
// inlineData and gives the best Hindi/Hinglish quality in the Flash
// tier. If a future SDK or model deprecation breaks this, the fallback
// is gemini-2.0-flash (same API shape).
const MODEL_NAME = "gemini-2.5-flash";

// 5 MB inbound cap. Client-side caps recording at 30s which at typical
// opus bitrate (~32-64 kbps) produces ~1-2 MB raw + 33% base64 inflation
// → comfortably under both this and Vercel's serverless body limit.
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
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
    if (!mimeType || typeof mimeType !== "string") {
      return NextResponse.json(
        { error: "missing or invalid mimeType" },
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

    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const result = await model.generateContent([
      {
        inlineData: {
          data: audio,
          mimeType,
        },
      },
      {
        text: `Transcribe this audio to text accurately.

The speaker is most likely using Hindi, English, or Hinglish (Hindi-English code-mixed speech, common in Indian users).

Preserve the natural language register:
- Hindi words: write in Devanagari script (e.g., "मेरा मन भारी है")
- English words: keep in Latin script (e.g., "project", "exam")
- Hinglish: mix scripts naturally as the user speaks (e.g., "मेरा project mein बहुत tension है")
- Numbers and named entities: keep the user's original choice

Return ONLY the transcribed text. No commentary, no quotation marks, no introduction like "The speaker said:". If the audio is silent or unintelligible, return an empty string.`,
      },
    ]);

    const text = result.response.text().trim();

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
