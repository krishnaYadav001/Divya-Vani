// Feature: referral-reward-system, Property 4: Each referred user appears in at most one referrals row
//
// Property-based test for the one-row-per-referred-user invariant in
// attributeReferral. The `referrals` table carries UNIQUE(referred_user_id);
// attributeReferral relies on it (plus a 23505 → "exists" branch) so that any
// number of attribution attempts for the same referred user — with the same or
// different valid referral codes, issued sequentially OR concurrently — settle
// on EXACTLY ONE persisted row, and the first successfully-persisted
// association (referrer_user_id + referral_code) is never overwritten by later
// attempts (which instead report { result: "exists" }).
//
// Injects a fake Supabase client via the test-only seam in referral.ts
// (__setTestClient / __resetTestClient), mirroring the fake-client pattern in
// referral.codegen.test.ts, so no real DB is touched. The fake is backed by an
// in-memory `referrals` array whose insert handler ENFORCES
// UNIQUE(referred_user_id): a second insert for an already-present
// referred_user_id resolves { data: null, error: { code: "23505" } }. The
// check-and-append is performed synchronously within a single microtask so it
// is atomic under concurrent (Promise.all) interleaving, faithfully modelling
// the DB unique constraint.
//
// **Validates: Requirements 4.3, 4.4, 4.7, 8.2, 8.3**

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  attributeReferral,
  __setTestClient,
  __resetTestClient,
} from "../referral";

type Row = Record<string, unknown>;

/**
 * Maps a referral code to its (distinct, non-self) owner user_id. Owner ids are
 * prefixed "R:" while referred ids are prefixed "U:" (see the property), so an
 * owner can never collide with the referred user — every attempt below is a
 * valid, non-self referral whose only gate is UNIQUE(referred_user_id).
 */
function ownerIdForCode(code: string): string {
  return `R:${code}`;
}

/**
 * Minimal in-memory fake Supabase client tailored to attributeReferral's
 * pending-attribution path:
 *
 *   owner lookup:
 *     .from("users_memory").select("user_id, created_at, message_count")
 *       .eq("referral_code", code).maybeSingle()
 *     → a valid owner whose user_id = ownerIdForCode(code) (≠ referredUserId).
 *
 *   referred-user lookup:
 *     .from("users_memory").select("message_count")
 *       .eq("user_id", referredUserId).maybeSingle()
 *     → message_count 0 (a fresh user; pre-existing-user guard does not trip).
 *
 *   pending insert:
 *     .from("referrals").insert({...}).select("*").maybeSingle()
 *     → enforces UNIQUE(referred_user_id): appends + echoes the row on success,
 *       or resolves { data: null, error: { code: "23505" } } if a row already
 *       exists for that referred_user_id.
 */
function createFakeClient() {
  const referrals: Row[] = [];
  let idSeq = 0;

  function makeBuilder(table: string) {
    const state: {
      op: "select" | "insert";
      payload: Record<string, unknown>;
      eqs: Record<string, unknown>;
    } = { op: "select", payload: {}, eqs: {} };

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
        state.eqs[col] = val;
        return builder;
      },
      is(_col: string, _val: unknown) {
        return builder;
      },
      async maybeSingle() {
        if (state.op === "insert") {
          // referrals insert — atomic check-and-append (UNIQUE constraint).
          const referredId = state.payload.referred_user_id;
          const clash = referrals.some(
            (r) => r.referred_user_id === referredId,
          );
          if (clash) {
            return { data: null, error: { code: "23505" } };
          }
          const row: Row = { id: `ref-${idSeq++}`, ...state.payload };
          referrals.push(row);
          return { data: row, error: null };
        }
        // users_memory SELECTs, distinguished by which column was filtered.
        if (table === "users_memory") {
          if ("referral_code" in state.eqs) {
            // Owner lookup: a valid Referrer distinct from any referred user.
            const code = String(state.eqs.referral_code);
            return {
              data: {
                user_id: ownerIdForCode(code),
                created_at: new Date(0).toISOString(),
                message_count: 0,
              },
              error: null,
            };
          }
          // Referred-user lookup: fresh user, no prior messages.
          return { data: { message_count: 0 }, error: null };
        }
        return { data: null, error: null };
      },
    };
    return builder;
  }

  return {
    referrals,
    from(table: string) {
      return makeBuilder(table);
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

test("Property 4: repeated/concurrent attribution yields exactly one row, first association retained", async () => {
  await fc.assert(
    fc.asyncProperty(
      // An arbitrary referred user id (prefixed "U:" so it never equals an
      // owner id, ruling out the self-referral path).
      fc.string({ minLength: 1 }),
      // A non-empty sequence (1..5) of valid referral codes, possibly repeated.
      fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
      async (rawReferredId, codes) => {
        const referredUserId = `U:${rawReferredId}`;

        // --- Sequential attempts -------------------------------------------
        fake = createFakeClient();
        __setTestClient(fake);

        const outcomes = [];
        for (const referrerCode of codes) {
          outcomes.push(
            await attributeReferral({ referrerCode, referredUserId }),
          );
        }

        // Exactly one row persisted for this referred user.
        const rows = fake.referrals.filter(
          (r) => r.referred_user_id === referredUserId,
        );
        assert.equal(
          rows.length,
          1,
          `expected exactly one referrals row, got ${rows.length}: ${JSON.stringify(rows)}`,
        );

        // The first attempt (valid code, fresh user) persists the association;
        // every later attempt reports "exists" and changes nothing.
        assert.equal(
          outcomes[0].result,
          "created",
          `first attempt should create: ${JSON.stringify(outcomes[0])}`,
        );
        for (let i = 1; i < outcomes.length; i++) {
          assert.equal(
            outcomes[i].result,
            "exists",
            `later attempt ${i} should report exists: ${JSON.stringify(outcomes[i])}`,
          );
        }

        // The retained row carries the FIRST attempt's association, unchanged.
        const row = rows[0];
        assert.equal(row.referrer_user_id, ownerIdForCode(codes[0]));
        assert.equal(row.referral_code, codes[0]);
        assert.equal(row.status, "pending");

        // --- Concurrent burst (Promise.all) --------------------------------
        fake = createFakeClient();
        __setTestClient(fake);

        const burst = await Promise.all(
          codes.map((referrerCode) =>
            attributeReferral({ referrerCode, referredUserId }),
          ),
        );

        // Still exactly one row despite the concurrent interleaving.
        const burstRows = fake.referrals.filter(
          (r) => r.referred_user_id === referredUserId,
        );
        assert.equal(
          burstRows.length,
          1,
          `concurrent burst created ${burstRows.length} rows: ${JSON.stringify(burstRows)}`,
        );

        // Exactly one winner ("created"); all other attempts report "exists".
        const created = burst.filter((o) => o.result === "created");
        const exists = burst.filter((o) => o.result === "exists");
        assert.equal(
          created.length,
          1,
          `exactly one concurrent attempt should win: ${JSON.stringify(burst)}`,
        );
        assert.equal(created.length + exists.length, burst.length);

        // The single persisted row's association comes from one of the codes
        // and is internally consistent (referrer matches its own code).
        const burstRow = burstRows[0];
        assert.ok(codes.includes(burstRow.referral_code as string));
        assert.equal(
          burstRow.referrer_user_id,
          ownerIdForCode(burstRow.referral_code as string),
        );
      },
    ),
    { numRuns: 100 },
  );
});
