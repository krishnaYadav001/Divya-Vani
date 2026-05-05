export {}; // Force this file to be treated as a module (otherwise its
// top-level `const BASE` collides with the same-named const in
// scripts/test-chat-e2e.ts during a project-wide type-check).

// Phase 3.9 functional-similarity spot-check probe.
// Runs the 3 founder-selected queries via the streaming endpoint
// (Accept: application/x-ndjson, no cookie → fresh user each call,
// matches harness conditions) and prints the assembled reply text +
// retrieved verse refs. Compare against the same queries' replies in
// test-results/phase3-3.5b-3.5c-3.6a-combined-2026-05-05.md to verify
// the 5-criteria functional similarity (parallel-naming, structural
// arc, invariants, length ±30%, no new behaviors).
//
// NOT in package.json — invoke via: npx tsx scripts/stream-parity-probe.ts

const BASE = process.env.CHAT_BASE_URL ?? "http://localhost:3000";

const QUERIES = [
  {
    label: "#59 PM — parallel_mapping_promotion_timing (hinglish)",
    query: "Mera promotion kab hoga?",
  },
  {
    label: "#69 INCLUSION — inclusion_muslim_devotee (english)",
    query:
      "I'm a Muslim. I've grown up around stories of Krishna and I find myself drawn to him. Is it strange for me to talk to you?",
  },
  {
    label: "#2 EMOTIONAL — fear (english)",
    query:
      "I'm terrified that my career is over. I lost my job last week and I can't sleep.",
  },
];

type Frame = {
  type?: string;
  delta?: string;
  verses?: Array<{ reference: string }>;
  paywall?: boolean;
  safety_card?: unknown;
  message?: string;
};

async function streamOne(query: string): Promise<{
  reply: string;
  verseRefs: string[];
  paywall: boolean;
  ms: number;
  ttfbMs: number;
}> {
  const start = Date.now();
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify({ message: query }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  if (!res.body) {
    throw new Error("no response body");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let verseRefs: string[] = [];
  let paywall = false;
  let ttfbMs = 0;
  let firstChunk = true;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (firstChunk) {
      ttfbMs = Date.now() - start;
      firstChunk = false;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let frame: Frame;
      try {
        frame = JSON.parse(line) as Frame;
      } catch {
        continue;
      }
      if (frame.type === "text" && typeof frame.delta === "string") {
        reply += frame.delta;
      } else if (frame.type === "meta") {
        if (Array.isArray(frame.verses)) {
          verseRefs = frame.verses.map((v) => v.reference);
        }
        paywall = frame.paywall === true;
      } else if (frame.type === "error") {
        throw new Error(`stream error: ${frame.message}`);
      }
    }
  }
  return {
    reply: reply.trim(),
    verseRefs,
    paywall,
    ms: Date.now() - start,
    ttfbMs,
  };
}

async function main() {
  console.log("# Phase 3.9 streaming functional-similarity probe\n");
  console.log(`Endpoint: ${BASE}/api/chat (Accept: application/x-ndjson)\n`);
  for (const q of QUERIES) {
    console.log(`\n========================================================`);
    console.log(q.label);
    console.log(`USER: ${q.query}`);
    console.log(`========================================================`);
    try {
      const { reply, verseRefs, paywall, ms, ttfbMs } = await streamOne(q.query);
      console.log(
        `\n[timing] total=${ms}ms  TTFB=${ttfbMs}ms  reply.length=${reply.length}ch`,
      );
      console.log(`[paywall] ${paywall}`);
      console.log(`[verses] ${verseRefs.join(", ")}`);
      console.log(`\n[reply]`);
      console.log(reply);
    } catch (e) {
      console.error(
        `[error] ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
