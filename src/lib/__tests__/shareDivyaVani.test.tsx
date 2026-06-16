// Source-contract + smoke test for ShareDivyaVani.
//
// WHY source-based (no DOM): this repo has NO React DOM testing harness — no
// @testing-library/react, no jsdom, no react-test-renderer — and tests run via
// `tsx --test` (node:test) with NO DOM available. Adding a full RTL+jsdom stack
// to drive real render/interaction assertions is out of scope and would risk
// destabilizing the toolchain. So instead we verify the component's pure,
// DOM-independent contracts: (1) it has a default export that is a function
// (the component), and (2) the locked product copy + key wiring constants are
// present verbatim in the source file. The copy strings are product-locked
// (Req 2.9, 2.4, 9.2); asserting them verbatim is a meaningful regression guard
// against silent rewording or a threshold regression (e.g. "10 free messages").
//
// Maps to Requirements: 2.4, 2.7, 2.8, 2.9, 9.2 (plus 2.5 copy-failure copy).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import ShareDivyaVani from "../../app/components/ShareDivyaVani";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPONENT_PATH = resolve(
  __dirname,
  "../../app/components/ShareDivyaVani.tsx",
);
const source = readFileSync(COMPONENT_PATH, "utf8");

test("module has a default export that is a function (the component)", () => {
  assert.equal(typeof ShareDivyaVani, "function");
});

test("locked product copy strings are present verbatim", () => {
  const required = [
    // Reward explanation title (Req 2.9).
    "Share Divya Vani",
    // Reward explanation description — exact, must not be reworded (Req 2.9).
    "Share Divya Vani with someone who may need peace, guidance, or Krishna's wisdom. When they use 3 free messages, you receive 2 minutes of free voice talk with Krishna.",
    // Copy-success confirmation (Req 2.4).
    "Your invite link has been copied.",
    // Earned message shown when earned seconds > 0 (Req 9.2).
    "You earned 2 free voice minutes because someone used Divya Vani through your invite.",
  ];
  for (const phrase of required) {
    assert.ok(
      source.includes(phrase),
      `expected ShareDivyaVani.tsx to contain copy: ${JSON.stringify(phrase)}`,
    );
  }
});

test("share wiring constants are present (WhatsApp host, API path, native-share detection)", () => {
  // WhatsApp deep-link host (Req 2.6).
  assert.ok(source.includes("wa.me"), "expected WhatsApp host wa.me");
  // Reads server-computed identity/stats from this path (Req 9.1/9.4).
  assert.ok(source.includes("/api/referral"), "expected /api/referral path");
  // Feature-detects the Web Share API, omitting the control when absent
  // (Req 2.7, 2.8).
  assert.ok(
    source.includes("navigator.share"),
    "expected a navigator.share feature-detection reference",
  );
});

test("timing constants are present (10s fetch ceiling, 3s copy-visible window)", () => {
  // 10s identity-fetch ceiling (Req 9.5).
  assert.ok(
    source.includes("10_000") || source.includes("10000"),
    "expected a 10s (10_000 / 10000) fetch timeout",
  );
  // Copy confirmation visible ~3s (Req 2.4).
  assert.ok(
    source.includes("3_000") || source.includes("3000"),
    "expected a 3s (3_000 / 3000) copy-visible window",
  );
});

test("threshold copy is '3 free messages' and stale '10 free messages' is absent", () => {
  // Guards against a threshold regression in the locked copy (Req 2.9).
  assert.ok(
    source.includes("3 free messages"),
    "expected the '3 free messages' threshold copy",
  );
  assert.ok(
    !source.includes("10 free messages"),
    "stale '10 free messages' phrasing must not be present",
  );
});
