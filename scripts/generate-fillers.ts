// Phase 10.6 — one-time filler-clip generator (ADMIN, manual only).
//
// Generates the 5 short "filler" MP3s that /voice plays the instant the VAD
// detects end-of-speech, masking the transcribe→chat→tts latency while
// Krishna's real reply is prepared. They are Krishna's own voice (Viraj),
// eleven_v3 — SAME voice + model as the real reply, so there is no audible
// switch between filler and reply (persona invariant: fillers speak in
// Krishna's voice; they are neutral interjections, not Krishna on a topic).
//
// This script is NOT wired into the app and does NOT run automatically. The
// founder runs it ONCE locally, listens to each clip, then commits the MP3s:
//
//   npm run generate-fillers          # writes public/voice/fillers/filler-1..5.mp3
//   # listen to each; confirm Krishna's voice sounds natural
//   git add public/voice/fillers/     # commit the static assets
//   # then push
//
// Needs ELEVENLABS_API_KEY in the environment; the npm script loads
// .env.local (same as every other script in package.json).
//
// Invocation: npm run generate-fillers
//   (= tsx --env-file=.env.local scripts/generate-fillers.ts)

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { convertToAudio, DEFAULT_VOICE_ID } from "../src/lib/elevenlabs";

// Default filler phrases — Krishna-natural, neutral interjections (NOT
// topic-specific). The founder may replace these with final-approved phrases.
const FILLERS = [
  "हाँ...",
  "सुनो...",
  "एक पल...",
  "ठीक है...",
  "बेटा...",
];

// Same voice + model as the real reply path (no audible switch).
const MODEL = "eleven_v3";
const OUT_DIR = resolve(process.cwd(), "public/voice/fillers");

/** Drain a web ReadableStream<Uint8Array> into a single Buffer. */
async function collect(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error(
      "ELEVENLABS_API_KEY missing (run with: npm run generate-fillers, which loads .env.local)",
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });

  let totalBytes = 0;
  for (let i = 0; i < FILLERS.length; i++) {
    const phrase = FILLERS[i];
    const n = i + 1;
    process.stdout.write(`Generating filler-${n} ("${phrase}") … `);
    const stream = await convertToAudio(phrase, {
      voiceId: DEFAULT_VOICE_ID,
      model: MODEL,
    });
    const bytes = await collect(stream);
    const outPath = resolve(OUT_DIR, `filler-${n}.mp3`);
    writeFileSync(outPath, bytes);
    totalBytes += bytes.length;
    console.log(`${(bytes.length / 1024).toFixed(1)} KB → ${outPath}`);
  }

  console.log(
    `\nGenerated ${FILLERS.length} fillers (~${(totalBytes / 1024).toFixed(
      0,
    )} KB total). Commit public/voice/fillers/ to ship.`,
  );
}

main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
