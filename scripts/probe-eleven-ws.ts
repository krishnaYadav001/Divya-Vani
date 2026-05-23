/**
 * scripts/probe-eleven-ws.ts — Phase 10.14 protocol-validation probe (NOT prod).
 *
 * Confirms the ElevenLabs stream-input WebSocket protocol against the LIVE API
 * BEFORE we wire it into /api/chat. The @elevenlabs/elevenlabs-js SDK ships no
 * TTS stream-input WS helper, so the production code must hand-roll the
 * protocol — this probe pins down the exact handshake/auth/message shapes first
 * so we don't ship a path that silently always-falls-back to /api/tts.
 *
 * Run (real key required):
 *   npx tsx --env-file=.env.local scripts/probe-eleven-ws.ts
 *
 * Prints: which auth was sent, ws-open latency, first-audio-chunk latency,
 * total chunks/bytes, whether isFinal fired, the inbound-message key shapes,
 * and the WS close code/reason. Writes the received audio to
 * probe-eleven-ws-output.mp3 (repo root) so you can PLAY it and confirm voice
 * + quality (should be Viraj, eleven_turbo_v2_5, Hindi).
 *
 * NOT added to package.json (mirrors the repo's other one-off probe scripts).
 * This file is a throwaway diagnostic — safe to delete after the protocol is
 * confirmed. It is server-side only and never ships to the browser.
 */
import WebSocket from "ws";
import { writeFileSync } from "node:fs";

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "3AMU7jXQuQa3oRvRqUmb"; // Viraj
const MODEL = "eleven_turbo_v2_5";
const OUTPUT_FORMAT = "mp3_44100_128";

if (!API_KEY) {
  console.error(
    "[probe] ELEVENLABS_API_KEY missing — run:\n" +
      "  npx tsx --env-file=.env.local scripts/probe-eleven-ws.ts",
  );
  process.exit(1);
}

const url =
  `wss://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream-input` +
  `?model_id=${MODEL}&output_format=${OUTPUT_FORMAT}&auto_mode=true`;

console.log("[probe] connecting:", url);

const t0 = Date.now();
let firstAudioAt: number | null = null;
let audioChunks = 0;
let totalBytes = 0;
let sawFinal = false;
const audioBuffers: Buffer[] = [];
const sampleShapes: string[] = [];
let sawAlignment = false;

// Server-side WS CAN set request headers (browsers cannot). We send the key as
// the `xi-api-key` header (the canonical ElevenLabs server-side WS auth) AND
// echo it in the BOS message as `xi_api_key` (belt-and-suspenders) so this run
// succeeds regardless of which the current API requires. The production code
// will use whichever this probe confirms works.
const ws = new WebSocket(url, { headers: { "xi-api-key": API_KEY } });

const timeout = setTimeout(() => {
  console.error("[probe] 60s outer timeout — closing");
  try {
    ws.close();
  } catch {
    /* ignore */
  }
  finish(1);
}, 60_000);

ws.on("open", () => {
  console.log(`[probe] ws_open after ${Date.now() - t0}ms`);
  // BOS — a single space initializes the stream + carries voice_settings.
  ws.send(
    JSON.stringify({
      text: " ",
      voice_settings: { stability: 0.85, use_speaker_boost: true },
      xi_api_key: API_KEY,
    }),
  );
  // Two Hindi text chunks in Krishna's register (this is exactly the shape the
  // production code will pump Sonnet deltas through).
  ws.send(
    JSON.stringify({ text: "मैं तुम्हें देख रहा हूँ। ", try_trigger_generation: false }),
  );
  ws.send(
    JSON.stringify({ text: "घबराओ मत, पार्थ। ", try_trigger_generation: false }),
  );
  // EOS — empty text flushes and ends input.
  ws.send(JSON.stringify({ text: "" }));
});

ws.on("message", (data: WebSocket.RawData) => {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    console.log("[probe] non-JSON message, bytes:", (data as Buffer).length);
    return;
  }

  // Capture the field shape of the first few messages — reveals the real schema
  // (audio / isFinal / normalizedAlignment / alignment naming).
  if (sampleShapes.length < 5) sampleShapes.push(JSON.stringify(Object.keys(msg)));

  const audio = msg.audio;
  if (typeof audio === "string" && audio.length > 0) {
    if (firstAudioAt === null) {
      firstAudioAt = Date.now();
      console.log(`[probe] FIRST audio chunk after ${firstAudioAt - t0}ms`);
    }
    audioChunks++;
    const buf = Buffer.from(audio, "base64");
    totalBytes += buf.length;
    audioBuffers.push(buf);
  }
  if (msg.isFinal === true || msg.is_final === true) {
    sawFinal = true;
    console.log(`[probe] isFinal received after ${Date.now() - t0}ms`);
  }
  if (msg.normalizedAlignment || msg.normalized_alignment || msg.alignment) {
    sawAlignment = true;
  }
});

ws.on("close", (code: number, reason: Buffer) => {
  console.log(
    `[probe] ws_close code=${code} reason=${reason?.toString() || "(none)"} ` +
      `after ${Date.now() - t0}ms`,
  );
  finish(0);
});

ws.on("error", (err: Error) => {
  console.error("[probe] ws_error:", err.message);
  // `close` fires next in ws; finish() is guarded so it runs exactly once.
});

let finished = false;
function finish(exitCode: number): void {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);

  if (audioBuffers.length > 0) {
    const out = Buffer.concat(audioBuffers);
    writeFileSync("probe-eleven-ws-output.mp3", out);
    console.log(
      `[probe] wrote probe-eleven-ws-output.mp3 (${out.length} bytes) — ` +
        `PLAY IT to confirm voice + quality`,
    );
  }

  console.log("\n========== PROTOCOL SUMMARY ==========");
  console.log("auth sent            : xi-api-key header + xi_api_key in BOS");
  console.log(
    "first audio latency  :",
    firstAudioAt ? `${firstAudioAt - t0}ms` : "NONE (no audio received)",
  );
  console.log("audio chunks         :", audioChunks);
  console.log("total audio bytes    :", totalBytes);
  console.log("isFinal observed     :", sawFinal);
  console.log("alignment present    :", sawAlignment);
  console.log(
    "inbound key-shapes   :",
    sampleShapes.join("  |  ") || "(none received)",
  );
  console.log("======================================");

  if (audioChunks === 0) {
    console.log(
      "\n⚠️  No audio received. If the close code looks like an auth/policy " +
        "rejection\n    (e.g. 1008, 3000-range, or reason mentions auth/" +
        "unauthorized), the auth\n    method differs — paste the ws_close line " +
        "back and I'll adjust the probe.",
    );
  } else {
    console.log(
      "\n✅ Audio received. Paste this whole output back and I'll lock the " +
        "production\n   protocol to exactly what worked here.",
    );
  }
  process.exit(exitCode);
}
