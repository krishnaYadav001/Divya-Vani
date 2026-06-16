// Feature: referral-reward-system, Property 5: reward_transactions.related_referral_id is unique
//
// Property-based test for the credit-once invariant in qualifyAndCreditReferral.
// The `reward_transactions` table carries UNIQUE(related_referral_id), and
// qualifyAndCreditReferral relies on it (plus a status-guarded UPDATE that
// transitions a pending referral exactly once, and a 23505 → null branch) so
// that ANY number of qualification attempts for the same referred user — issued
// sequentially OR concurrently — record AT MOST ONE reward_transactions row per
// referral. Across the whole reward_transactions table every non-null
// related_referral_id is therefore UNIQUE (no referral is ever credited twice).
//
// Injects a fake Supabase client via the test-only seam in referral.ts
// (__setTestClient / __resetTestClient), mirroring referral.property4.test.ts,
// so no real DB is touched. The fake is backed by:
//   - an in-memory `referrals` store seeded with N distinct pending referrals
//     (distinct referred_user_ids, each a unique id + reward_seconds = 120).
//     The status-guarded UPDATE (referred_user_id = X AND status = 'pending')
//     transitions a given referred user's pending row exactly once; a repeated
//     or concurrent attempt finds no pending row and resolves { data: null }.
//   - a `reward_transactions` array ENFORCING UNIQUE(related_referral_id): an
//     insert appends a row, but if a row with that related_referral_id already
//     exists it resolves { error: { code: "23505" } } and does NOT append.
//   - an rpc("credit_voice_seconds", ...) that increments an in-memory wallet
//     map by p_amount.
// The check-and-set in each handler runs synchronously within a single
// microtask, so it is atomic under concurrent (Promise.all) interleaving,
// faithfully modelling the DB constraints.
//
// **Validates: Requirements 6.7, 8.4**

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  qualifyAndCreditReferral,
  __setTestClient,
  __resetTestClient,
} from "../referral";

type Row = Record<string, unknown>;

const REWARD_SECONDS = 120;

/**
 * Minimal in-memory fake Supabase client tailored to qualifyAndCreditReferral's
 * qualify-and-credit path:
 *
 *   referred-user lookup:
 *     .from("users_memory").select("message_count")
 *       .eq("user_id", referredUserId).maybeSingle()
 *     → message_count 0 (best-effort, non-fatal).
 *
 *   status-guarded transition:
 *     .from("referrals").update({...})
 *       .eq("referred_user_id", X).eq("status", "pending").select("*").maybeSingle()
 *     → transitions the matching pending row to 'qualified' exactly once and
 *       echoes it; a repeat / concurrent loser finds no pending row → null.
 *
 *   reward transaction insert (awaited directly, no .select()):
 *     .from("reward_transactions").insert({...})
 *     → enforces UNIQUE(related_referral_id): appends + resolves { error:null }
 *       on success, or resolves { error: { code: "23505" } } (no append) when a
 *       row already exists for that related_referral_id.
 *
 *   wallet credit:
 *     .rpc("credit_voice_seconds", { p_user_id, p_amount })
 *     → increments wallet[p_user_id] by p_amount.
 *
 * @param referredUserIds distinct referred user ids to seed pending referrals for.
 */
function createFakeClient(referredUserIds: readonly string[]) {
  const referrals: Row[] = referredUserIds.map((referredUserId, i) => ({
    id: `ref-${i}`,
    referred_user_id: referredUserId,
    referrer_user_id: `R:${i}`,
    referral_code: `C${i}`,
    status: "pending",
    reward_seconds: REWARD_SECONDS,
  }));
  const reward_transactions: Row[] = [];
  const wallet = new Map<string, number>();
  let txSeq = 0;

  function makeBuilder(table: string) {
    const state: {
      op: "select" | "insert" | "update";
      payload: Record<string, unknown>;
      eqs: Record<string, unknown>;
    } = { op: "select", payload: {}, eqs: {} };

    function execute(): { data: unknown; error: unknown } {
      if (state.op === "insert") {
        if (table === "reward_transactions") {
          // Atomic check-and-append enforcing UNIQUE(related_referral_id).
          const rel = state.payload.related_referral_id;
          const clash = reward_transactions.some(
            (r) => r.related_referral_id === rel,
          );
          if (clash) {
            return { data: null, error: { code: "23505" } };
          }
          reward_transactions.push({ id: `tx-${txSeq++}`, ...state.payload });
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }

      if (state.op === "update") {
        if (table === "referrals") {
          // Status-guarded atomic transition: only a still-pending row for this
          // referred user transitions, and only once.
          const referredId = state.eqs.referred_user_id;
          const wantStatus = state.eqs.status;
          const row = referrals.find(
            (r) =>
              r.referred_user_id === referredId && r.status === wantStatus,
          );
          if (!row) {
            return { data: null, error: null };
          }
          Object.assign(row, state.payload); // sets status -> 'qualified', etc.
          return { data: { ...row }, error: null };
        }
        return { data: null, error: null };
      }

      // SELECT.
      if (table === "users_memory") {
        return { data: { message_count: 0 }, error: null };
      }
      return { data: null, error: null };
    }

    const builder: Record<string, unknown> = {
      select(_cols?: string) {
        return builder;
      },
      insert(payload: Record<string, unknown>) {
        state.op = "insert";
        state.payload = payload;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        state.op = "update";
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
      maybeSingle() {
        return Promise.resolve(execute());
      },
      // Make the builder awaitable for the direct `await ...insert(...)` path.
      then(
        onFulfilled?: (v: { data: unknown; error: unknown }) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return Promise.resolve(execute()).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return {
    referrals,
    reward_transactions,
    wallet,
    from(table: string) {
      return makeBuilder(table);
    },
    async rpc(_fn: string, args: { p_user_id: string; p_amount: number }) {
      wallet.set(
        args.p_user_id,
        (wallet.get(args.p_user_id) ?? 0) + args.p_amount,
      );
      return { data: null, error: null };
    },
  };
}

/**
 * Asserts the Property-5 invariants over a fake client's reward_transactions:
 *   - every non-null related_referral_id is UNIQUE (set size === row count), and
 *   - each referral contributed at most one transaction.
 */
function assertUniqueRelatedReferralIds(
  fake: ReturnType<typeof createFakeClient>,
) {
  const relIds = fake.reward_transactions
    .map((tx) => tx.related_referral_id)
    .filter((id) => id !== null && id !== undefined);
  const unique = new Set(relIds);
  assert.equal(
    unique.size,
    relIds.length,
    `duplicate related_referral_id detected: ${JSON.stringify(
      fake.reward_transactions,
    )}`,
  );
  // Each referral contributed at most one transaction.
  for (const id of unique) {
    const count = fake.reward_transactions.filter(
      (tx) => tx.related_referral_id === id,
    ).length;
    assert.ok(
      count <= 1,
      `referral ${String(id)} credited ${count} times: ${JSON.stringify(
        fake.reward_transactions,
      )}`,
    );
  }
}

let fake: ReturnType<typeof createFakeClient>;

afterEach(() => {
  __resetTestClient();
});

test("Property 5: across many qualify calls (sequential + concurrent), related_referral_id stays unique", async () => {
  await fc.assert(
    fc.asyncProperty(
      // N distinct referred user ids, each seeded with a pending referral.
      fc
        .uniqueArray(fc.string({ minLength: 1 }), {
          minLength: 1,
          maxLength: 6,
        })
        .chain((ids) =>
          fc.record({
            ids: fc.constant(ids),
            // A multiset of qualify calls over the seeded ids (with repeats).
            callIdx: fc.array(fc.nat({ max: ids.length - 1 }), {
              minLength: 1,
              maxLength: 15,
            }),
          }),
        ),
      async ({ ids, callIdx }) => {
        const calls = callIdx.map((i) => ids[i]);

        // --- Sequential qualification --------------------------------------
        fake = createFakeClient(ids);
        __setTestClient(fake);
        for (const referredUserId of calls) {
          await qualifyAndCreditReferral(referredUserId);
        }
        assertUniqueRelatedReferralIds(fake);
        // No more transactions than distinct referrals attempted.
        assert.ok(fake.reward_transactions.length <= ids.length);

        // --- Concurrent burst (Promise.all) --------------------------------
        fake = createFakeClient(ids);
        __setTestClient(fake);
        await Promise.all(
          calls.map((referredUserId) =>
            qualifyAndCreditReferral(referredUserId),
          ),
        );
        assertUniqueRelatedReferralIds(fake);
        assert.ok(fake.reward_transactions.length <= ids.length);
      },
    ),
    { numRuns: 100 },
  );
});
