import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { timingSafeEqualHex } from "../secureCompare";

test("equal hex signatures compare true", () => {
  const sig = createHmac("sha256", "secret").update("payload").digest("hex");
  const same = createHmac("sha256", "secret").update("payload").digest("hex");
  assert.equal(timingSafeEqualHex(sig, same), true);
});

test("different signatures compare false", () => {
  const a = createHmac("sha256", "secret").update("payload").digest("hex");
  const b = createHmac("sha256", "secret").update("tampered").digest("hex");
  assert.equal(timingSafeEqualHex(a, b), false);
});

test("a forged signature from the wrong secret compares false", () => {
  const real = createHmac("sha256", "real-secret").update("p").digest("hex");
  const forged = createHmac("sha256", "guessed-secret").update("p").digest("hex");
  assert.equal(timingSafeEqualHex(real, forged), false);
});

test("different-length inputs do not throw and compare false", () => {
  assert.equal(timingSafeEqualHex("abc", "abcdef0123"), false);
});

test("nullish inputs compare false without throwing", () => {
  assert.equal(timingSafeEqualHex(null, "abc"), false);
  assert.equal(timingSafeEqualHex("abc", undefined), false);
  assert.equal(timingSafeEqualHex(null, null), false);
  assert.equal(timingSafeEqualHex(undefined, undefined), false);
});

test("empty string equals empty string (degenerate but defined)", () => {
  assert.equal(timingSafeEqualHex("", ""), true);
});
