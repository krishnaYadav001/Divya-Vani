// Phase 1.7 cache investigation. Two-call probe with the Bhagavata regen
// SYSTEM_PROMPT — first call should create cache (cache_creation > 0,
// cache_read = 0), second should read it (cache_read > 0). If both come
// back zero, cache_control is being silently ignored despite being above
// the 1024-token threshold. One-off, NOT in package.json.
//
// Cost: ~₹2–4 for 2 calls of ~1300 input tokens + small output.
//
// Invocation:
//   tsx --env-file=.env.local scripts/count-system-prompt-tokens.ts

import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";

async function probe(client: Anthropic, systemPrompt: string, userMsg: string, label: string) {
  const r = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 50,
    temperature: 0.4,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMsg }],
  });
  const u = r.usage;
  console.log(`[${label}]`);
  console.log(`  input_tokens (standard):     ${u.input_tokens ?? 0}`);
  console.log(`  cache_creation_input_tokens: ${u.cache_creation_input_tokens ?? 0}`);
  console.log(`  cache_read_input_tokens:     ${u.cache_read_input_tokens ?? 0}`);
  console.log(`  output_tokens:               ${u.output_tokens ?? 0}`);
  return u;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");

  const regenSrc = fs.readFileSync("scripts/regenerate-hindi-bhagavata.ts", "utf8");
  const m = regenSrc.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
  if (!m) throw new Error("SYSTEM_PROMPT not found");
  const systemPrompt = m[1];

  console.log(`SYSTEM_PROMPT chars: ${systemPrompt.length}`);
  console.log(`SDK version: ${(Anthropic as { VERSION?: string }).VERSION ?? "unknown"}`);
  console.log();

  const client = new Anthropic();

  console.log("=== Probe 1 (should write cache) ===");
  await probe(client, systemPrompt, "Translate to Hindi: 'peace'.", "probe-1");

  console.log("\n=== Probe 2 (should read cache; same SYSTEM_PROMPT, different user) ===");
  await probe(client, systemPrompt, "Translate to Hindi: 'wisdom'.", "probe-2");

  console.log("\n=== Probe 3 (should read cache; concurrency-style burst — fires immediately after probe 2) ===");
  await probe(client, systemPrompt, "Translate to Hindi: 'devotion'.", "probe-3");
}

main().catch(e => {
  console.error("Fatal:", e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
