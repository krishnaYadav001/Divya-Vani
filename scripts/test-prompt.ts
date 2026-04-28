// Phase 3 prompt iteration harness.
// Reads test-cases.json (queries + categories), POSTs each to /api/chat
// (no cookie, so a fresh user_id is generated server-side each call),
// and writes a markdown file to test-results/<timestamp>.md for review.
//
// Each test run accumulates rows in users_memory (one row per query).
// That's a known cost of the "fresh user_id" approach; clean up later if
// it becomes noisy.
//
// Dev server must be running on localhost:3000 (or set CHAT_BASE_URL).

import fs from "node:fs";
import path from "node:path";

const CASES_PATH = "test-cases.json";
const RESULTS_DIR = "test-results";
const BASE = process.env.CHAT_BASE_URL ?? "http://localhost:3000";

type TestCase = {
  category: string;
  language: string;
  query: string;
};

type ApiVerse = {
  reference: string;
  sanskrit: string;
  transliteration: string;
  hindi: string;
  english: string;
};

type ApiResponse = {
  reply?: string;
  paywall?: boolean;
  verses?: ApiVerse[];
};

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

function oneLine(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

async function checkServerReady(): Promise<void> {
  try {
    const res = await fetch(`${BASE}/`, { method: "GET" });
    if (!res.ok && res.status >= 500) {
      throw new Error(`Server returned ${res.status}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Cannot reach ${BASE}. Is dev running? (npm run dev)\n  Underlying error: ${msg}`,
    );
  }
}

async function runOne(c: TestCase): Promise<{
  reply: string;
  verses: ApiVerse[];
  error?: string;
}> {
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: c.query }),
    });
    if (!res.ok) {
      return {
        reply: "",
        verses: [],
        error: `HTTP ${res.status}: ${await res.text()}`,
      };
    }
    const data = (await res.json()) as ApiResponse;
    return {
      reply: data.reply ?? "",
      verses: Array.isArray(data.verses) ? data.verses : [],
    };
  } catch (e) {
    return {
      reply: "",
      verses: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  await checkServerReady();

  const cases: TestCase[] = JSON.parse(fs.readFileSync(CASES_PATH, "utf8"));
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error(`${CASES_PATH} is empty or not a JSON array.`);
  }

  const stamp = timestamp();
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `${stamp}.md`);

  const lines: string[] = [];
  lines.push(`# Phase 3 Prompt Test — ${stamp}`);
  lines.push("");
  lines.push(`Total queries: ${cases.length}`);
  lines.push(`Endpoint: ${BASE}/api/chat`);
  lines.push("");
  lines.push("---");
  lines.push("");

  const startTime = Date.now();

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const queryStart = Date.now();
    process.stdout.write(`[${i + 1}/${cases.length}] ${c.category} (${c.language})...`);

    const { reply, verses, error } = await runOne(c);
    const ms = Date.now() - queryStart;
    process.stdout.write(` ${ms}ms\n`);

    lines.push(`## #${i + 1} — ${c.category}  (${c.language})`);
    lines.push("");
    lines.push("**Query:**");
    lines.push("");
    lines.push(`> ${c.query}`);
    lines.push("");

    if (error) {
      lines.push(`**Error:** ${error}`);
      lines.push("");
    } else {
      lines.push("**Reply:**");
      lines.push("");
      const replyLines = reply.split("\n").filter((l) => l.length > 0);
      if (replyLines.length === 0) {
        lines.push("> (empty reply)");
      } else {
        for (const rl of replyLines) lines.push(`> ${rl}`);
      }
      lines.push("");
      lines.push(`**Verses retrieved:** ${verses.length}`);
      lines.push("");
      for (const v of verses) {
        lines.push(`- **[${v.reference}]**`);
        lines.push(`  - Sanskrit: ${oneLine(v.sanskrit)}`);
        lines.push(`  - Hindi: ${oneLine(v.hindi)}`);
        lines.push(`  - English: ${oneLine(v.english)}`);
      }
      lines.push("");
    }

    lines.push("**Review notes:**");
    lines.push("");
    lines.push("_(annotate during read — what worked, what didn't)_");
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
  lines.push(`Total time: ${totalSec}s`);
  lines.push("");

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
