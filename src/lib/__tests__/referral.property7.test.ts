// Feature: referral-reward-system, Property 7: Referral code is unique and stable per user_id
//
// Property test for getOrCreateReferralCode covering:
//   1. Format (Req 1.5)       — returns an 8-char code in [A-Za-z0-9_-].
//   2. Stability (Req 1.2)    — repeat calls for the same user return the same
//                               code with no mutation.
//   3. Link format (Req 1.6)  — https://divyavani.co.in?ref=<code> is well-formed.
//   4. Uniqueness (Req 1.3)   — distinct user_ids never hold the same code.
//
// The production code path is exercised through the test-only seam
// (__setTestClient / __resetTestClient). The fake Supabase client is backed by
// a Map<user_id, referral_code> (simulating users_memory) and a global Set of
// issued codes; the guarded UPDATE raises a 23505 (unique violation) when a
// freshly generated code collides with an already-issued code, so the retry
// path in getOrCreateReferralCode is genuinely driven.
//
// _Validates: Requirements 1.2, 1.3, 1.5, 1.6

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  getOrCreateReferralCode,
  __setTestClient,
  __resetTestClient,
} from "../referral";

const CODE_RE = /^[A-Za-z0-9_-]{8}$/;
const LINK_RE = /^https:\/\/divyavani\.co\.in\?ref=[A-Za-z0-9_-]{8}$/;

type DbResult = { data: unknown; error: { code?: string } | null };

/**
 * In-memory fake Supabase client backed by a shared `users` Map (user_id ->
 * referral_code | null) and a global `issuedCodes` Set. Reproduces the
 * chainable query-builder shapes used by getOrCreateReferralCode:
 *   SELECT: .from(t).select(cols).eq(col,val).maybeSingle()
 *   UPDATE: .from(t).update(obj).eq(col,val).is(col,null).select(cols).maybeSingle()
 *
 * SELECT returns the current row for the eq'd user_id.
 * UPDATE (guarded by `referral_code IS NULL`):
 *   - if the code is already issued to another user → returns a 23505 error
 *     (drives the production retry path);
 *   - else if the user already has a code (guard fails) → no row updated;
 *   - else stores the code (claiming it globally) and echoes it back.
 */
function createFakeClient() {
  const users = new Map<string, string | null>();
  const issuedCodes = new Set<string>();

  function makeBuilder() {
    const state: {
      table: string;
      op: "select" | "update";
      payload: Record<string, unknown>;
      eqUserId: string | null;
      requireCodeNull: boolean;
    } = {
      table: "",
      op: "select",
      payload: {},
      eqUserId: null,
      requireCodeNull: false,
    };

    const builder = {
      _state: state,
      select(_cols?: string) {
        return builder;
      },
      update(payload: Record<string, unknown>) {
        state.op = "update";
        state.payload = payload;
        return builder;
      },
      eq(col: string, val: unknown) {
        if (col === "user_id") state.eqUserId = val as string;
        return builder;
      },
      is(col: string, val: unknown) {
        if (col === "referral_code" && val === null) {
          state.requireCodeNull = true;
        }
        return builder;
      },
      async maybeSingle(): Promise<DbResult> {
        const userId = state.eqUserId;
        if (state.op === "select") {
          // Ensure a row exists for this user (users_memory row present).
          if (userId !== null && !users.has(userId)) {
            users.set(userId, null);
          }
          const code = userId !== null ? users.get(userId) ?? null : null;
          return { data: { referral_code: code }, error: null };
        }

        // UPDATE path.
        const code = state.payload.referral_code as string;
        const current = userId !== null ? users.get(userId) ?? null : null;

        // Unique-violation: the generated code is already held by someone.
        if (issuedCodes.has(code)) {
          return { data: null, error: { code: "23505" } };
        }

        // Guard: `referral_code IS NULL` — only set if not already set.
        if (state.requireCodeNull && current) {
          return { data: null, error: null };
        }

        if (userId !== null) {
          users.set(userId, code);
          issuedCodes.add(code);
        }
        return { data: { referral_code: code }, error: null };
      },
    };
    return builder;
  }

  return {
    users,
    issuedCodes,
    from(table: string) {
      const b = makeBuilder();
      b._state.table = table;
      return b;
    },
  };
}

let fake: ReturnType<typeof createFakeClient>;

beforeEach(() => {
  fake = createFakeClient();
  __setTestClient(fake);
});

afterEach(() => {
  __resetTestClient();
});

test("Property 7: code is 8-char URL-safe, stable, well-linked, and unique per user", async () => {
  await fc.assert(
    fc.asyncProperty(
      // Many distinct non-empty user_ids per run.
      fc.uniqueArray(fc.string({ minLength: 1, maxLength: 24 }), {
        minLength: 1,
        maxLength: 20,
      }),
      async (userIds) => {
        // Fresh backing store per property run for independence.
        fake = createFakeClient();
        __setTestClient(fake);

        const codesByUser = new Map<string, string>();

        for (const userId of userIds) {
          const code = await getOrCreateReferralCode(userId);

          // 1. Format (Req 1.5): non-null, 8-char, URL-safe alphabet.
          assert.equal(typeof code, "string", "code must be a string");
          assert.match(code as string, CODE_RE);

          // 3. Link format (Req 1.6): well-formed shareable link.
          const link = `https://divyavani.co.in?ref=${code}`;
          assert.match(link, LINK_RE);

          codesByUser.set(userId, code as string);
        }

        // 2. Stability (Req 1.2): a second call returns the SAME code with no
        //    mutation of the stored value.
        for (const userId of userIds) {
          const before = fake.users.get(userId);
          const again = await getOrCreateReferralCode(userId);
          assert.equal(
            again,
            codesByUser.get(userId),
            "repeat call must return the same code",
          );
          assert.equal(
            fake.users.get(userId),
            before,
            "stored code must not mutate on repeat call",
          );
        }

        // 4. Cross-user uniqueness (Req 1.3): no two distinct user_ids share a code.
        const seen = new Set<string>();
        for (const [, code] of codesByUser) {
          assert.equal(seen.has(code), false, "codes must be unique across users");
          seen.add(code);
        }
      },
    ),
    { numRuns: 100 },
  );
});
