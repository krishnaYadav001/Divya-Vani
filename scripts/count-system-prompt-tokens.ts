// Measures the REAL token count of the production Krishna persona prompt
// (src/lib/systemPrompt.ts → SYSTEM_PROMPT) via Anthropic's
// /v1/messages/count_tokens endpoint (client.messages.countTokens).
//
// Why this exists: the persona is Devanagari-heavy. Character-count / ÷4
// estimates undercount Devanagari badly (the "~17,100 tokens" figure in
// CLAUDE.md history was actually ~24,813 by real measurement). This script
// gives future advisor sessions a ground-truth number without estimating.
//
// countTokens generates NO completion — it is free / near-free. It needs
// at least one message in the array, so a 1-char placeholder user message
// is sent; a second placeholder-only call measures that overhead so the
// reported persona-only figure subtracts it out cleanly.
//
// Supersedes the old Phase 1.7 cache-probe (3× messages.create on the
// Bhagavata-regen prompt — wrong target, ~₹2-4/run); cache has worked
// since the Phase 2.6 fix, so the probe is no longer needed.
//
// One-off diagnostic, NOT in package.json. Invocation:
//   tsx --env-file=.env.local scripts/count-system-prompt-tokens.ts

import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "../src/lib/systemPrompt";

// The SDK blocks the "@anthropic-ai/sdk/package.json" subpath in its
// exports map, so read the version straight off disk (cwd-relative —
// the documented invocation runs from the project root). Knowing which
// SDK measured the count matters: token counting can vary by SDK/API
// version, so a reproducible figure must record it.
function sdkVersion(): string {
  try {
    return JSON.parse(
      readFileSync("node_modules/@anthropic-ai/sdk/package.json", "utf8"),
    ).version as string;
  } catch {
    return "unknown";
  }
}

// Matches the production reply model — token counting can vary slightly
// by model family, so measure against the model actually used in chat.
const MODEL = "claude-sonnet-4-6";

// countTokens requires >=1 message. Smallest possible placeholder.
const PLACEHOLDER_MESSAGES: Anthropic.MessageParam[] = [
  { role: "user", content: "x" },
];

// Last reported production reading (per handoff). Output should land near
// this; a large drift means the persona changed since the handoff.
const HANDOFF_REFERENCE = 26_327;

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY missing (run with: tsx --env-file=.env.local ...)");
  }

  const client = new Anthropic();

  // 1. system (persona) + placeholder message → total input tokens.
  const withPersona = await client.messages.countTokens({
    model: MODEL,
    system: [{ type: "text", text: SYSTEM_PROMPT }],
    messages: PLACEHOLDER_MESSAGES,
  });

  // 2. placeholder message only (no system) → message-framing overhead,
  //    so we can subtract it and report a clean persona-only number.
  const placeholderOnly = await client.messages.countTokens({
    model: MODEL,
    messages: PLACEHOLDER_MESSAGES,
  });

  const total = withPersona.input_tokens;
  const overhead = placeholderOnly.input_tokens;
  const personaOnly = total - overhead;
  const drift = personaOnly - HANDOFF_REFERENCE;
  const driftPct = ((drift / HANDOFF_REFERENCE) * 100).toFixed(2);

  console.log("=== src/lib/systemPrompt.ts — SYSTEM_PROMPT token count ===");
  console.log(`  SDK version:                 ${sdkVersion()}`);
  console.log(`  Model (for counting):        ${MODEL}`);
  console.log(`  SYSTEM_PROMPT chars:         ${SYSTEM_PROMPT.length.toLocaleString()}`);
  console.log();
  console.log(`  system + 1-char placeholder: ${total.toLocaleString()} tokens`);
  console.log(`  placeholder-only overhead:   ${overhead.toLocaleString()} tokens`);
  console.log(`  PERSONA-ONLY (total−overhead): ${personaOnly.toLocaleString()} tokens`);
  console.log();
  console.log(`  Handoff reference:           ${HANDOFF_REFERENCE.toLocaleString()} tokens`);
  console.log(`  Drift vs handoff:            ${drift >= 0 ? "+" : ""}${drift.toLocaleString()} (${drift >= 0 ? "+" : ""}${driftPct}%)`);
}

main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
