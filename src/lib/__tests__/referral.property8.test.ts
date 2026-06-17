// Feature: referral-reward-system, Property 8: Invalid or re-supplied ref never overwrites an existing attribution
//
// Property-based test spanning BOTH halves of the no-overwrite guarantee:
//
//   SERVER (attributeReferral): for a referred_user_id that already has a
//   Referrals row, any later attribution attempt with a different/invalid/
//   re-supplied code must NOT overwrite the existing association. The fake
//   `referrals` store enforces UNIQUE(referred_user_id) (a second insert for an
//   already-present referred_user_id fails with Postgres code 23505), exactly
//   as the real schema does. A known code → { result: "exists" } and the
//   original row (referrer_user_id + referral_code + status) is unchanged; an
//   unknown/empty code → { result: "noop" } and likewise no record is created.
//
//   CLIENT (captureRefFromUrl): first-write-wins. Given an arbitrary already-
//   stored ref and an arbitrary incoming `?ref` (valid or invalid per
//   /^[A-Za-z0-9_-]{1,64}$/, single or repeated), the stored value is left
//   UNCHANGED; and an invalid incoming ref with empty storage leaves storage
//   empty. window/localStorage are stubbed with minimal in-memory shims and
//   cleaned up after each iteration. referralCapture.ts is NOT modified.
//
// Server side reuses the test-only seam __setTestClient/__resetTestClient and
// the fake-client pattern from referral.codegen.test.ts / referral.property3.
//
// **Validates: Requirements 3.2, 3.3, 4.6, 8.3, 8.6**

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  attributeReferral,
  __setTestClient,
  __resetTestClient,
} from "../referral";
import { captureRefFromUrl } from "../referralCapture";

// ---------------------------------------------------------------------------
// SERVER: fake Supabase client enforcing UNIQUE(referred_user_id) on referrals.
// ---------------------------------------------------------------------------

type ReferralRowShape = {
  referrer_user_id: string;
  referred_user_id: string;
  referral_code: string;
  status: string;
  rejected_reason?: string;
};

/**
 * Fake client tailored to attributeReferral's paths:
 *
 *   owner lookup:  .from("users_memory").select(...).eq("referral_code",code).maybeSingle()
 *                  → resolves the owner via `codeToOwner` (null when unknown).
 *   referred read: .from("users_memory").select("message_count").eq("user_id",id).maybeSingle()
 *                  → message_count 0 so the pre-existing-user guard never trips.
 *   pending insert:.from("referrals").insert({...}).select("*").maybeSingle()
 *   rejected insert:.from("referrals").insert({...})  (awaited directly)
 *
 * The `referrals` store is keyed by referred_user_id and pre-seeded with the
 * ORIGINAL attribution. Any insert for an already-present referred_user_id
 * returns error code 23505 WITHOUT mutating the stored row — modelling the
 * UNIQUE(referred_user_id) constraint and the no-overwrite guarantee.
 */
function createFakeClient(
  codeToOwner: Map<string, string>,
  referrals: Map<string, ReferralRowShape>,
) {
  function makeBuilder(table: string) {
    const state: {
      op: "select" | "insert";
      payload: Record<string, unknown>;
      filters: Record<string, unknown>;
    } = { op: "select", payload: {}, filters: {} };

    // Models the UNIQUE(referred_user_id) constraint for referrals inserts.
    // Standalone closure (not a builder method) so it is strongly typed and
    // callable from both maybeSingle() and then().
    const runInsert = (): { data: unknown; error: { code?: string } | null } => {
      const referredId = state.payload.referred_user_id as string;
      if (referrals.has(referredId)) {
        // Existing association — reject the duplicate, leave the row intact.
        return { data: null, error: { code: "23505" } };
      }
      referrals.set(referredId, state.payload as ReferralRowShape);
      return { data: state.payload, error: null };
    };

    const builder: Record<string, unknown> = {
      select(_cols?: string) {
        return builder;
      },
      insert(payload: Record<string, unknown>) {
        state.op = "insert";
        state.payload = payload;
        return builder;
      },
      eq(col: string, val: unknown) {
        state.filters[col] = val;
        return builder;
      },
      is(_col: string, _val: unknown) {
        return builder;
      },
      // Models the UNIQUE(referred_user_id) constraint for referrals inserts.
      runInsert,
      async maybeSingle() {
        if (state.op === "insert") {
          return runInsert();
        }
        if (table === "users_memory") {
          if ("referral_code" in state.filters) {
            const code = state.filters.referral_code as string;
            const ownerId = codeToOwner.get(code);
            if (!ownerId) return { data: null, error: null };
            return {
              data: {
                user_id: ownerId,
                created_at: new Date(0).toISOString(),
                message_count: 0,
              },
              error: null,
            };
          }
          if ("user_id" in state.filters) {
            // Referred user's message_count — 0 so attribution proceeds to insert.
            return { data: { message_count: 0 }, error: null };
          }
        }
        return { data: null, error: null };
      },
      // Rejected-insert path awaits the builder directly (no maybeSingle()).
      then(
        resolve: (v: { data: unknown; error: { code?: string } | null }) => unknown,
        reject?: (e: unknown) => unknown,
      ) {
        const value =
          state.op === "insert"
            ? runInsert()
            : { data: null, error: null };
        return Promise.resolve(value).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    from(table: string) {
      return makeBuilder(table);
    },
  };
}

afterEach(() => {
  __resetTestClient();
});

test("Property 8 (server): a later/invalid/re-supplied code never overwrites an existing attribution", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 1 }), // referredUserId (already attributed)
      fc.string({ minLength: 1 }), // original referrer user_id
      fc.string({ minLength: 1, maxLength: 64 }), // original referral code
      fc.string({ minLength: 1 }), // a second, different referrer user_id
      fc.string({ minLength: 1, maxLength: 64 }), // a second, valid referral code
      // incoming code: re-supplied same, a different valid code, an unknown
      // string, or empty — exercising every "later code" shape.
      fc.oneof(
        fc.constant("__SAME__"),
        fc.constant("__SECOND__"),
        fc.string(),
        fc.constant(""),
      ),
      async (
        referredUserId,
        originalReferrerId,
        originalCode,
        secondReferrerId,
        secondCode,
        incomingChoice,
      ) => {
        // Map of known codes → owners. Distinct codes only (the second code is
        // dropped if it collides with the original so the map stays well-defined).
        const codeToOwner = new Map<string, string>();
        codeToOwner.set(originalCode, originalReferrerId);
        if (secondCode !== originalCode) {
          codeToOwner.set(secondCode, secondReferrerId);
        }

        // Pre-seed the ORIGINAL attribution as a pending referral.
        const originalRow: ReferralRowShape = {
          referrer_user_id: originalReferrerId,
          referred_user_id: referredUserId,
          referral_code: originalCode,
          status: "pending",
        };
        const referrals = new Map<string, ReferralRowShape>();
        referrals.set(referredUserId, { ...originalRow });

        __setTestClient(createFakeClient(codeToOwner, referrals));

        const incomingCode =
          incomingChoice === "__SAME__"
            ? originalCode
            : incomingChoice === "__SECOND__"
              ? secondCode
              : incomingChoice;

        const outcome = await attributeReferral({
          referrerCode: incomingCode,
          referredUserId,
        });

        // Expected: a known non-empty code resolves an owner and hits the
        // UNIQUE(referred_user_id) wall → "exists"; otherwise → "noop".
        const knownCode =
          incomingCode.length > 0 && codeToOwner.has(incomingCode);
        const expected = knownCode ? "exists" : "noop";

        assert.equal(
          outcome.result,
          expected,
          `incoming=${JSON.stringify(incomingCode)} expected ${expected}, got ${JSON.stringify(outcome)}`,
        );
        // Never a fresh attribution over an existing one.
        assert.notEqual(outcome.result, "created");

        // The persisted association must be byte-for-byte the original.
        assert.equal(referrals.size, 1);
        const persisted = referrals.get(referredUserId);
        assert.deepEqual(persisted, originalRow);
        assert.equal(persisted?.referrer_user_id, originalReferrerId);
        assert.equal(persisted?.referral_code, originalCode);
        assert.equal(persisted?.status, "pending");
      },
    ),
    { numRuns: 150 },
  );
});

// ---------------------------------------------------------------------------
// CLIENT: stub window.location + window.localStorage, test captureRefFromUrl.
// ---------------------------------------------------------------------------

// Mirror of the private constant in referralCapture.ts (kept in sync here so
// the test can pre-seed the exact key the module reads). The module is NOT
// modified by this test.
const REF_STORAGE_KEY = "divya-vani-ref:v1";
const REF_FORMAT = /^[A-Za-z0-9_-]{1,64}$/;

const originalWindow = (globalThis as { window?: unknown }).window;

/**
 * Installs a minimal window with a localStorage shim (Map-backed) and a
 * location whose `search` is the given query string. Returns the backing Map.
 */
function installWindow(search: string, initial?: Map<string, string>) {
  const store = initial ?? new Map<string, string>();
  const localStorage = {
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
  (globalThis as { window?: unknown }).window = {
    location: { search },
    localStorage,
  };
  return store;
}

function uninstallWindow() {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
}

/** Builds a query string from an ordered list of `ref` values (URL-encoded). */
function buildSearch(refValues: string[]): string {
  if (refValues.length === 0) return "";
  return "?" + refValues.map((v) => `ref=${encodeURIComponent(v)}`).join("&");
}

test("Property 8 (client): an already-stored ref is never overwritten by an incoming ?ref", () => {
  try {
    fc.assert(
      fc.property(
        // The already-stored raw value (any non-empty string — first write wins
        // regardless of its shape).
        fc.string({ minLength: 1 }),
        // Zero, one, or many incoming `ref` values (valid or invalid).
        fc.array(fc.string(), { maxLength: 3 }),
        (storedValue, refValues) => {
          const store = installWindow(
            buildSearch(refValues),
            new Map([[REF_STORAGE_KEY, storedValue]]),
          );

          captureRefFromUrl();

          // First-write-wins: the stored value is byte-for-byte unchanged.
          assert.equal(store.get(REF_STORAGE_KEY), storedValue);
        },
      ),
      { numRuns: 150 },
    );
  } finally {
    uninstallWindow();
  }
});

test("Property 8 (client): capture into empty storage stores iff valid+single, never otherwise", () => {
  try {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { maxLength: 3 }),
        (refValues) => {
          const store = installWindow(buildSearch(refValues)); // empty storage

          captureRefFromUrl();

          const valid =
            refValues.length === 1 && REF_FORMAT.test(refValues[0]);
          const raw = store.has(REF_STORAGE_KEY)
            ? (store.get(REF_STORAGE_KEY) as string)
            : null;

          if (valid) {
            // A single, well-formed ref is captured (first write into empty
            // storage) with the exact code preserved.
            assert.notEqual(raw, null);
            const parsed = JSON.parse(raw as string) as { code: string };
            assert.equal(parsed.code, refValues[0]);
          } else {
            // Invalid / missing / repeated ref → storage left empty (no-op).
            assert.equal(raw, null);
          }
        },
      ),
      { numRuns: 150 },
    );
  } finally {
    uninstallWindow();
  }
});
