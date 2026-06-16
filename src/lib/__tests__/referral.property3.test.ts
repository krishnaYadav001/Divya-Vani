// Feature: referral-reward-system, Property 3: No referral is a self-referral
//
// Property-based test for the self-referral guard in attributeReferral. When a
// referral code resolves to an owner (Referrer) whose user_id EQUALS the
// referred user's id, attribution must reject the self-referral and MUST NOT
// create a Pending_Referral. A 'rejected' row with rejected_reason
// 'self_referral' is acceptable; a 'pending' row is never acceptable.
//
// Injects a fake Supabase client via the test-only seam in referral.ts
// (__setTestClient / __resetTestClient), mirroring the fake-client pattern in
// referral.codegen.test.ts, so no real DB is touched. Inserted rows are
// recorded in an in-memory array so the test can assert no 'pending' row was
// created for the self-referral.
//
// **Validates: Requirements 4.2, 7.6, 8.1**

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  attributeReferral,
  __setTestClient,
  __resetTestClient,
} from "../referral";

type InsertedRow = Record<string, unknown>;

/**
 * Minimal in-memory fake Supabase client tailored to attributeReferral's
 * self-referral path:
 *
 *   owner lookup:
 *     .from("users_memory").select("user_id, created_at, message_count")
 *       .eq("referral_code", code).maybeSingle()
 *     → returns an owner whose user_id is forced to equal `referredUserId`,
 *       producing a self-referral.
 *
 *   rejected insert:
 *     .from("referrals").insert({...})  (awaited directly)
 *     → records the inserted row in `inserted` and resolves { data, error:null }.
 *
 * The fake also supports the pending-insert shape
 *   .from("referrals").insert({...}).select("*").maybeSingle()
 * defensively, recording any inserted row, so a regression that reached the
 * pending path would still be observable via `inserted`.
 */
function createFakeClient(referredUserId: string) {
  const inserted: InsertedRow[] = [];

  function makeBuilder(table: string) {
    const state: {
      op: "select" | "insert";
      payload: Record<string, unknown>;
      selectCols: string;
    } = { op: "select", payload: {}, selectCols: "" };

    const builder: Record<string, unknown> = {
      select(cols?: string) {
        state.selectCols = cols ?? "";
        return builder;
      },
      insert(payload: Record<string, unknown>) {
        state.op = "insert";
        state.payload = payload;
        inserted.push(payload);
        return builder;
      },
      eq(_col: string, _val: unknown) {
        return builder;
      },
      is(_col: string, _val: unknown) {
        return builder;
      },
      async maybeSingle() {
        if (state.op === "insert") {
          // Pending-path shape (.insert().select().maybeSingle()).
          return { data: state.payload, error: null };
        }
        // SELECT owner lookup on users_memory → force a self-referral.
        if (table === "users_memory") {
          return {
            data: {
              user_id: referredUserId,
              created_at: new Date(0).toISOString(),
              message_count: 0,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      // The rejected-insert path awaits the builder directly (no maybeSingle).
      then(
        resolve: (v: { data: unknown; error: null }) => unknown,
        reject?: (e: unknown) => unknown,
      ) {
        try {
          return Promise.resolve({ data: state.payload, error: null }).then(
            resolve,
            reject,
          );
        } catch (e) {
          return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
        }
      },
    };
    return builder;
  }

  return {
    inserted,
    from(table: string) {
      return makeBuilder(table);
    },
  };
}

let fake: ReturnType<typeof createFakeClient>;

beforeEach(() => {
  // Replaced per-iteration inside the property; this keeps a default in place.
  fake = createFakeClient("seed");
  __setTestClient(fake);
});

afterEach(() => {
  __resetTestClient();
});

test("Property 3: a self-referral is rejected and never creates a pending referral", async () => {
  await fc.assert(
    fc.asyncProperty(
      // Arbitrary non-empty user ids; the referrer code is also non-empty so
      // the owner lookup runs. The fake forces owner.user_id === referredUserId.
      fc.string({ minLength: 1 }),
      fc.string({ minLength: 1 }),
      async (referredUserId, referrerCode) => {
        fake = createFakeClient(referredUserId);
        __setTestClient(fake);

        const outcome = await attributeReferral({
          referrerCode,
          referredUserId,
        });

        // The self-referral must be rejected (or already settled as "exists"),
        // never created.
        assert.ok(
          (outcome.result === "rejected" &&
            outcome.reason === "self_referral") ||
            outcome.result === "exists",
          `expected rejected/self_referral or exists, got ${JSON.stringify(outcome)}`,
        );
        assert.notEqual(outcome.result, "created");

        // No inserted row may carry status 'pending' for this self-referral.
        const pendingRows = fake.inserted.filter(
          (row) => row.status === "pending",
        );
        assert.equal(
          pendingRows.length,
          0,
          `a pending referral row was created for a self-referral: ${JSON.stringify(pendingRows)}`,
        );
      },
    ),
    { numRuns: 100 },
  );
});
