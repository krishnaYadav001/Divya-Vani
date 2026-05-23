/**
 * probe-elevenlabs-stt.ts — THROWAWAY DIAGNOSTIC (Phase 11.0 GO/NO-GO probe)
 * ============================================================================
 *
 * Purpose
 * -------
 * Run Sarvam Saaras V3 and ElevenLabs Scribe v2 on the SAME Hindi audio
 * samples and emit a side-by-side comparison report. This informs the
 * GO/NO-GO decision on migrating Divya Vani's voice mode to ElevenAgents
 * (which bundles ElevenLabs STT, replacing Sarvam). If Scribe v2's Hindi
 * accuracy is far from Sarvam's published 6.95% WER, the migration is unviable.
 *
 * This script is NOT committed, NOT in package.json, and pulls NO new deps.
 * Founder runs it once, reads the report, then deletes it.
 *
 * Folder layout (resolved relative to this script, so cwd doesn't matter)
 * ----------------------------------------------------------------------
 *   <project-root>/
 *   ├── scripts/probe-elevenlabs-stt.ts   ← this file
 *   └── audio-samples/                     ← DROP YOUR RECORDINGS HERE
 *       ├── 01_sample.wav                    (sorted alphabetically; name
 *       ├── 02_sample.mp3                     them 01_, 02_, … to control order)
 *       ├── 03_sample.m4a
 *       └── comparison.md                   ← OUTPUT (overwritten each run)
 *
 *   Accepted input extensions: .wav .mp3 .m4a .ogg
 *   Recommended: record as WAV or MP3 — both STT vendors accept them
 *   natively, so NO format conversion is performed here (deliberately, to
 *   avoid a new dependency). m4a/ogg are forwarded as-is; if a vendor
 *   rejects a container it surfaces as [FAILED: …] in that transcript
 *   column rather than crashing the run. Audio DURATION is computed only
 *   for WAV (parsed from the RIFF header with no dependency); other formats
 *   show "duration unknown".
 *
 * Run
 * ---
 *   npx tsx --env-file=.env.local scripts/probe-elevenlabs-stt.ts
 *
 *   Requires SARVAM_API_KEY and ELEVENLABS_API_KEY in .env.local
 *   (server-only keys — this script never logs them).
 *
 * What it measures (and the honest caveats)
 * -----------------------------------------
 *   • There is NO ground-truth transcript, so "accuracy" here is a RELATIVE
 *     comparison: word-level Levenshtein distance BETWEEN the two vendors'
 *     transcripts. A low distance means they agree (and, given Sarvam's
 *     known-good Hindi, agreement is a reasonable proxy for Scribe being OK).
 *     A high distance flags samples for manual review — it does NOT tell you
 *     which vendor is right. The founder still eyeballs the transcripts.
 *   • Word distance is computed on punctuation- and case-normalized tokens,
 *     so a trailing "?" or danda "।" doesn't inflate the number. The visual
 *     diff below each sample shows the RAW tokens (punctuation included) so
 *     you can see exactly what differed.
 *   • Latency is wall-clock around each HTTP call (serial, one vendor at a
 *     time, one file at a time) — network-dependent, indicative not exact.
 *
 * Config choice worth knowing
 * ---------------------------
 *   Sarvam is called with the PRODUCTION config from
 *   src/app/api/transcribe/route.ts — language_code "unknown" + mode
 *   "codemix" — NOT the "hi-IN" mentioned in the phase prompt. Rationale:
 *   the migration must beat the Sarvam the app actually ships today, and
 *   that path auto-detects + preserves Hindi/Hinglish code-mixing. To force
 *   a fixed Hindi code instead, change SARVAM_LANGUAGE_CODE / SARVAM_MODE
 *   below. ElevenLabs is pinned to language_code "hin" (ISO 639-3 Hindi)
 *   per the live Scribe v2 docs.
 */

import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Config ──────────────────────────────────────────────────────────────────

const SARVAM_ENDPOINT = "https://api.sarvam.ai/speech-to-text";
const SARVAM_MODEL = "saaras:v3";
const SARVAM_LANGUAGE_CODE = "unknown"; // matches production route.ts (auto-detect)
const SARVAM_MODE = "codemix"; // matches production route.ts (preserve script mixing)

const ELEVEN_ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text";
const ELEVEN_MODEL = "scribe_v2"; // batch model (NOT scribe_v2_realtime), per live docs
const ELEVEN_LANGUAGE_CODE = "hin"; // ISO 639-3 Hindi, per live Scribe v2 docs

const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".m4a", ".ogg"]);
const MIME_BY_EXT: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
};

const DIVERGENCE_THRESHOLD = 0.1; // 10% word divergence flags a sample

// audio-samples/ + comparison.md, resolved relative to this file (not cwd)
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const SAMPLES_DIR = path.join(PROJECT_ROOT, "audio-samples");
const REPORT_PATH = path.join(SAMPLES_DIR, "comparison.md");

// ── Types ─────────────────────────────────────────────────────────────────

type ProbeResult = {
  ok: boolean;
  transcript: string;
  latencyMs: number;
  error?: string;
};

type SampleRow = {
  file: string;
  durationSec: number | null;
  sarvam: ProbeResult;
  eleven: ProbeResult;
};

// ── STT calls ─────────────────────────────────────────────────────────────

async function transcribeSarvam(
  audio: Buffer,
  filename: string,
  mime: string,
  apiKey: string,
): Promise<ProbeResult> {
  const t0 = performance.now();
  try {
    const form = new FormData();
    // new Uint8Array(audio) — @types/node 20.19 types Buffer as
    // Buffer<ArrayBufferLike>, which isn't a valid BlobPart; the view narrows it.
    form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), filename);
    form.append("model", SARVAM_MODEL);
    form.append("language_code", SARVAM_LANGUAGE_CODE);
    form.append("mode", SARVAM_MODE);

    const res = await fetch(SARVAM_ENDPOINT, {
      method: "POST",
      headers: { "api-subscription-key": apiKey },
      body: form,
    });
    const latencyMs = Math.round(performance.now() - t0);

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        transcript: "",
        latencyMs,
        error: `sarvam HTTP ${res.status}: ${detail.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as { transcript?: string };
    return { ok: true, transcript: (data.transcript ?? "").trim(), latencyMs };
  } catch (e) {
    return {
      ok: false,
      transcript: "",
      latencyMs: Math.round(performance.now() - t0),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function transcribeEleven(
  audio: Buffer,
  filename: string,
  mime: string,
  apiKey: string,
): Promise<ProbeResult> {
  const t0 = performance.now();
  try {
    const form = new FormData();
    // new Uint8Array(audio) — @types/node 20.19 types Buffer as
    // Buffer<ArrayBufferLike>, which isn't a valid BlobPart; the view narrows it.
    form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), filename);
    form.append("model_id", ELEVEN_MODEL);
    form.append("language_code", ELEVEN_LANGUAGE_CODE);

    const res = await fetch(ELEVEN_ENDPOINT, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });
    const latencyMs = Math.round(performance.now() - t0);

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        transcript: "",
        latencyMs,
        error: `elevenlabs HTTP ${res.status}: ${detail.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as { text?: string };
    return { ok: true, transcript: (data.text ?? "").trim(), latencyMs };
  } catch (e) {
    return {
      ok: false,
      transcript: "",
      latencyMs: Math.round(performance.now() - t0),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ── Text comparison helpers ─────────────────────────────────────────────────

const PUNCT_EDGE = /^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu;

/** Whitespace tokens, surrounding punctuation stripped, lowercased. Empty → []. */
function normalizeTokens(text: string): string[] {
  return text
    .split(/\s+/)
    .map((t) => t.replace(PUNCT_EDGE, "").toLowerCase())
    .filter((t) => t.length > 0);
}

/** Raw whitespace tokens, punctuation kept (for the visual diff). */
function rawTokens(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0);
}

/** Word-level Levenshtein (sub/ins/del each cost 1). */
function wordEditDistance(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** LCS-based inline diff: [-only in Sarvam-]  {+only in ElevenLabs+}. */
function wordDiff(a: string[], b: string[]): string {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push(a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`[-${a[i]}-]`);
      i++;
    } else {
      out.push(`{+${b[j]}+}`);
      j++;
    }
  }
  while (i < m) out.push(`[-${a[i++]}-]`);
  while (j < n) out.push(`{+${b[j++]}+}`);
  return out.join(" ");
}

/** Duration in seconds from a WAV RIFF header. null for non-WAV / unparseable. */
function wavDurationSec(buf: Buffer): number | null {
  try {
    if (buf.length < 44) return null;
    if (buf.toString("ascii", 0, 4) !== "RIFF") return null;
    if (buf.toString("ascii", 8, 12) !== "WAVE") return null;
    let offset = 12;
    let byteRate = 0;
    let dataSize = 0;
    while (offset + 8 <= buf.length) {
      const id = buf.toString("ascii", offset, offset + 4);
      const size = buf.readUInt32LE(offset + 4);
      const body = offset + 8;
      if (id === "fmt ") {
        // fmt body: audioFormat(2) channels(2) sampleRate(4) byteRate(4) …
        byteRate = buf.readUInt32LE(body + 8);
      } else if (id === "data") {
        dataSize = size;
      }
      offset = body + size + (size % 2); // chunks are word-aligned
    }
    return byteRate > 0 && dataSize > 0 ? dataSize / byteRate : null;
  } catch {
    return null;
  }
}

// ── Report rendering ──────────────────────────────────────────────────────

function fmtDuration(sec: number | null): string {
  return sec == null ? "duration unknown" : `${sec.toFixed(1)} sec`;
}

function fmtTranscript(r: ProbeResult): string {
  if (!r.ok) return `[FAILED: ${r.error ?? "unknown error"}]`;
  if (r.transcript.length === 0) return "_(empty transcript)_";
  return `> ${r.transcript}`;
}

function buildReport(rows: SampleRow[]): string {
  const both = rows.filter((r) => r.sarvam.ok && r.eleven.ok);

  const avg = (nums: number[]): number =>
    nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;

  const avgSarvamLatency = Math.round(
    avg(rows.filter((r) => r.sarvam.ok).map((r) => r.sarvam.latencyMs)),
  );
  const avgElevenLatency = Math.round(
    avg(rows.filter((r) => r.eleven.ok).map((r) => r.eleven.latencyMs)),
  );

  // Per-sample distance + divergence over the both-succeeded set.
  const perSample = both.map((r) => {
    const ns = normalizeTokens(r.sarvam.transcript);
    const ne = normalizeTokens(r.eleven.transcript);
    const dist = wordEditDistance(ns, ne);
    const denom = Math.max(ns.length, ne.length);
    const pct = denom === 0 ? 0 : dist / denom;
    return { file: r.file, dist, denom, pct };
  });

  const avgDist = avg(perSample.map((p) => p.dist));
  const diverged = perSample.filter((p) => p.pct > DIVERGENCE_THRESHOLD).length;

  const lines: string[] = [];
  lines.push("# Sarvam vs ElevenLabs Scribe v2 — Hindi STT smoke test");
  lines.push("");
  lines.push(`Run at: ${new Date().toISOString()}`);
  lines.push(`Total samples: ${rows.length}`);
  lines.push(`Successful (both vendors): ${both.length} / ${rows.length}`);
  lines.push(`Avg Sarvam latency: ${avgSarvamLatency} ms`);
  lines.push(`Avg ElevenLabs latency: ${avgElevenLatency} ms`);
  lines.push(
    `Avg word-level Levenshtein between transcripts: ${avgDist.toFixed(1)} words`,
  );
  lines.push(
    `Samples with >${Math.round(DIVERGENCE_THRESHOLD * 100)}% word divergence: ${diverged} / ${both.length} (of successful comparisons)`,
  );
  lines.push("");
  lines.push(
    "_No ground truth: word distance is a RELATIVE Sarvam-vs-ElevenLabs comparison, not accuracy. " +
      "Distance is on punctuation/case-normalized tokens; the diff shows raw tokens. " +
      "Diff legend: `[-only in Sarvam-]`  `{+only in ElevenLabs+}`._",
  );
  lines.push("");
  lines.push(
    `_Sarvam config: model=${SARVAM_MODEL}, language_code=${SARVAM_LANGUAGE_CODE}, mode=${SARVAM_MODE} (production). ` +
      `ElevenLabs config: model_id=${ELEVEN_MODEL}, language_code=${ELEVEN_LANGUAGE_CODE}._`,
  );
  lines.push("");
  lines.push("## Per-sample comparison");
  lines.push("");

  for (const row of rows) {
    lines.push(`### ${row.file} (${fmtDuration(row.durationSec)})`);
    lines.push("");
    lines.push(`**Sarvam** (${row.sarvam.latencyMs} ms):`);
    lines.push(fmtTranscript(row.sarvam));
    lines.push("");
    lines.push(`**ElevenLabs** (${row.eleven.latencyMs} ms):`);
    lines.push(fmtTranscript(row.eleven));
    lines.push("");

    if (row.sarvam.ok && row.eleven.ok) {
      const ns = normalizeTokens(row.sarvam.transcript);
      const ne = normalizeTokens(row.eleven.transcript);
      const dist = wordEditDistance(ns, ne);
      const denom = Math.max(ns.length, ne.length);
      const pct = denom === 0 ? 0 : Math.round((dist / denom) * 100);

      const rawS = rawTokens(row.sarvam.transcript);
      const rawE = rawTokens(row.eleven.transcript);
      const rawIdentical = rawS.join(" ") === rawE.join(" ");

      let note = "";
      if (rawIdentical) note = " (identical)";
      else if (dist === 0) note = " (punctuation/casing only)";

      lines.push(`**Word distance**: ${dist} words / ${denom} = ${pct}%${note}`);
      if (!rawIdentical) {
        lines.push("");
        lines.push(`**Diff**: ${wordDiff(rawS, rawE)}`);
      }
    } else {
      lines.push("**Word distance**: n/a (one or both transcripts failed)");
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const sarvamKey = process.env.SARVAM_API_KEY;
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (!sarvamKey || !elevenKey) {
    console.error(
      "Missing API key(s). Need SARVAM_API_KEY and ELEVENLABS_API_KEY in .env.local.\n" +
        "Run with: npx tsx --env-file=.env.local scripts/probe-elevenlabs-stt.ts",
    );
    process.exit(1);
  }

  await mkdir(SAMPLES_DIR, { recursive: true });

  let entries: string[];
  try {
    entries = await readdir(SAMPLES_DIR);
  } catch (e) {
    console.error(`Could not read ${SAMPLES_DIR}: ${String(e)}`);
    process.exit(1);
  }

  const files = entries
    .filter((f) => AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.error(
      `No audio files in ${SAMPLES_DIR}\n` +
        `Drop .wav/.mp3/.m4a/.ogg recordings there (name them 01_, 02_, … to order them), then re-run.`,
    );
    process.exit(0);
  }

  console.log(`Found ${files.length} sample(s) in audio-samples/. Probing serially…\n`);

  const rows: SampleRow[] = [];
  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    const ext = path.extname(file).toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
    const prefix = `[${idx + 1}/${files.length}] ${file}`;

    let buf: Buffer;
    try {
      buf = await readFile(path.join(SAMPLES_DIR, file));
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.log(`${prefix} — read FAILED: ${err}`);
      rows.push({
        file,
        durationSec: null,
        sarvam: { ok: false, transcript: "", latencyMs: 0, error: `read failed: ${err}` },
        eleven: { ok: false, transcript: "", latencyMs: 0, error: `read failed: ${err}` },
      });
      continue;
    }

    const durationSec = ext === ".wav" ? wavDurationSec(buf) : null;

    process.stdout.write(`${prefix} — Sarvam…`);
    const sarvam = await transcribeSarvam(buf, file, mime, sarvamKey);
    process.stdout.write(
      sarvam.ok ? ` ok (${sarvam.latencyMs} ms)` : ` FAILED (${sarvam.error})`,
    );

    process.stdout.write(` | ElevenLabs…`);
    const eleven = await transcribeEleven(buf, file, mime, elevenKey);
    process.stdout.write(
      eleven.ok ? ` ok (${eleven.latencyMs} ms)\n` : ` FAILED (${eleven.error})\n`,
    );

    rows.push({ file, durationSec, sarvam, eleven });
  }

  const report = buildReport(rows);
  await writeFile(REPORT_PATH, report, "utf8");

  console.log(`\nReport written to:\n${REPORT_PATH}`);
}

main().catch((e) => {
  console.error("Probe crashed:", e);
  process.exit(1);
});
