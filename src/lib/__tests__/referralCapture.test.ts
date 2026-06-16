// Unit tests for client-side referral capture (referralCapture.ts):
// captureRefFromUrl(), readStoredRef(), clearStoredRef().
//
// The module reads window.location.search and window.localStorage, both guarded
// by `typeof window`. These tests install a minimal `globalThis.window` stub
// with a Map-backed localStorage shim before each scenario and restore/delete
// the original window afterwards, so no real browser environment is required.
//
// _Requirements: 3.1, 3.2, 3.3, 3.4

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  captureRefFromUrl,
  readStoredRef,
  clearStoredRef,
} from "../referralCapture";

const REF_STORAGE_KEY = "divya-vani-ref:v1";

// Preserve whatever (if anything) was on globalThis.window so each test starts
// clean and the global is fully restored afterwards.
const ORIGINAL_WINDOW = (globalThis as Record<string, unknown>).window;

/** Map-backed minimal localStorage shim (getItem/setItem/removeItem). */
function makeLocalStorage(initial?: Record<string, string>) {
  const store = new Map<string, string>(
    initial ? Object.entries(initial) : [],
  );
  return {
    store,
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
    removeItem(key: string): void {
      store.delete(key);
    },
  };
}

/**
 * (Re)install globalThis.window with the given URL search string and optional
 * initial localStorage contents. Returns the installed window so tests can
 * inspect the underlying store directly.
 */
function installWindow(search: string, initialStore?: Record<string, string>) {
  const localStorage = makeLocalStorage(initialStore);
  const win = { location: { search }, localStorage };
  (globalThis as Record<string, unknown>).window = win;
  return win;
}

afterEach(() => {
  if (ORIGINAL_WINDOW === undefined) {
    delete (globalThis as Record<string, unknown>).window;
  } else {
    (globalThis as Record<string, unknown>).window = ORIGINAL_WINDOW;
  }
});

test("captures a valid ref into empty storage", () => {
  installWindow("?ref=abc123");

  captureRefFromUrl();

  const stored = readStoredRef();
  assert.notEqual(stored, null);
  assert.equal(stored?.code, "abc123");
  assert.equal(typeof stored?.stored_at, "string");
  // stored_at must be a valid ISO timestamp.
  assert.equal(new Date(stored!.stored_at).toISOString(), stored!.stored_at);
});

test("does not overwrite an already-stored ref (first-write-wins)", () => {
  const existing = JSON.stringify({
    code: "first",
    stored_at: "2024-01-01T00:00:00.000Z",
  });
  installWindow("?ref=other", { [REF_STORAGE_KEY]: existing });

  captureRefFromUrl();

  const stored = readStoredRef();
  assert.equal(stored?.code, "first");
  assert.equal(stored?.stored_at, "2024-01-01T00:00:00.000Z");
});

test("ignores invalid refs and leaves storage empty", () => {
  const invalidSearches: Array<[string, string]> = [
    ["missing ref", "?x=1"],
    ["empty ref", "?ref="],
    ["whitespace ref", "?ref=%20%20"],
    ["too long ref", "?ref=" + "a".repeat(65)],
    ["bad chars ref", "?ref=bad!char"],
    ["duplicate ref", "?ref=a&ref=b"],
  ];

  for (const [label, search] of invalidSearches) {
    installWindow(search);
    captureRefFromUrl();
    assert.equal(readStoredRef(), null, `expected null for ${label}`);
  }
});

test("read/clear round-trip: capture then clear yields null", () => {
  installWindow("?ref=keepme");

  captureRefFromUrl();
  assert.notEqual(readStoredRef(), null);

  clearStoredRef();
  assert.equal(readStoredRef(), null);
});

test("SSR safety: no window means no throw and null read", () => {
  delete (globalThis as Record<string, unknown>).window;

  assert.doesNotThrow(() => captureRefFromUrl());
  assert.doesNotThrow(() => clearStoredRef());
  let result: unknown = "unset";
  assert.doesNotThrow(() => {
    result = readStoredRef();
  });
  assert.equal(result, null);
});
