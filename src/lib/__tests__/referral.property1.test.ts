// Feature: referral-reward-system, Property 1: A referral is credited at most once
//
// Property-based test for the credit-once invariant in qualifyAndCreditReferral.
// A single Referred_User has exactly ONE pending referrals row (reward_seconds
// fixed at 120). No matter how many times qualifyAndCreditReferral is invoked
// for that user — sequentially OR as a concurrent Promise.all burst — the
// Referrer's wallet must increase by EXACTLY the reward amount (120) ONCE, and
// EXACTLY ONE reward_transactions row may exist for that referral.
//
// Two independent idempotency gates are exercised together, mirroring
// production:
//   1. The status-guarded atomic UPDATE pending → qualified
//      (.update(...).eq("referred_user_id", id).eq("status","pending")...):
//      only the FIRST attempt matches a 'pending' row and gets it back; every
//      later attempt finds no pending row and receives { data: null }.
//   2. UNIQUE(related_referral_id) on reward_transactions: a second insert for
//      the same referral resolves { error: { code: "23505" } }.
//
// Injects a fake Supabase client via the test-only seam in referral.ts
// (__setTestClient / __resetTestClient), mirroring referral.property4.test.ts,
// so no real DB is touched. The fake's status-guarded UPDATE performs its
// check-and-transition synchronously within a single microtask (no await before
// the mutation), faithfully modelling the DB's atomic guarded update under
// concurrent (Promise.all) interleaving; reward_transactions' insert enforces
// UNIQUE(related_referral_id) the same way.
//
// **Validates: Requirements 5.5, 8.4, 8.7, 8.8, 10.5**

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
 * qualify-and-credit path, backed by:
 *
 *   referrals store — seeded with ONE pending row for `referredUserId`
 *     (referrer_user_id, reward_seconds: 120). The status-guarded UPDATE
 *       .from("referrals").update({status:'qualified',...})
 *         .eq("referred_user_id", id).eq("status","pending").select("*").maybeSingle()
 *     atomically transitions pending → qualified and echoes the row ONLY the
 *     first time; once the row is already 'qualified', the status='pending'
 *     filter matches nothing → { data: null, error: null }.
 *
 *   reward_transactions store — enforces UNIQUE(related_referral_id):
 *       .from("reward_transactions").insert({ related_referral_id, ... })
 *     appends on success, or resolves { error: { code: "23505" } } when a row
 *     with that related_referral_id already exists.
 *
 *   users_memory select — message_count lookup returns a fresh user.
 *
 *   rpc("credit_voice_seconds", { p_user_id, p_amount }) — increments an
 *     in-memory wallet balance for p_user_id by p_amount and returns the new
 *     balance.
 */
function createFakeClient(referrerUserId: string, referredUserId: string) {
  const referrals: Row[] = [
    {
      id: `ref-${referredUserId}`,
      referrer_user_id: referrerUserId,
      referred_user_id: referredUserId,
      referral_code: "CODE1234",
      status: "pending",
      reward_seconds: REWARD_SECONDS,
    },
  ];
  const rewardTransactions: Row[] = [];
  const wallet = new Map<string, number>();

  function makeBuilder(table: string) {
    const state: {
      op: "select" | "update" | "insert";
      payload: Record<string, unknown>;
      eqs: Record<string, unknown>;
    } = { op: "select", payload: {}, eqs: {} };

    const builder: Record<string, unknown> = {
      select(_cols?: string) {
        return builder;
      },
      update(payload: Record<string, unknown>) {
        state.op = "update";
        state.payload = payload;
        return builder;
      },
      insert(payload: Record<string, unknown>) {
        state.op = "insert";
        state.payload = payload;
        // reward_transactions insert is awaited directly (no .maybeSingle()),
        // so the builder must be thenable. The check-and-append runs
        // synchronously inside the executor — atomic per microtask, modelling
        // UNIQUE(related_referral_id).
        return {
          then(
            resolve: (v: { data: unknown; error: unknown }) => void,
          ) {
            if (table === "reward_transactions") {
              const relatedId = state.payload.related_referral_id;
              const clash = rewardTransactions.some(
                (t) => t.related_referral_id === relatedId,
              );
              if (clash) {
                resolve({ data: null, error: { code: "23505" } });
                return;
              }
              rewardTransactions.push({ ...state.payload });
              resolve({ data: null, error: null });
              return;
            }
            resolve({ data: null, error: null });
          },
        };
      },
      eq(col: string, val: unknown) {
        state.eqs[col] = val;
        return builder;
      },
      is(_col: string, _val: unknown) {
        return builder;
      },
      async maybeSingle() {
        if (state.op === "update" && table === "referrals") {
          // Status-guarded atomic transition: match a row by
          // referred_user_id AND status='pending'. The check-and-mutate runs
          // synchronously (no await before it), so it is atomic under
          // concurrent interleaving — only the FIRST attempt finds a pending
          // row; later attempts match nothing.
          const referredId = state.eqs.referred_user_id;
          const requiredStatus = state.eqs.status;
          const row = referrals.find(
            (r) =>
              r.referred_user_id === referredId &&
              r.status === requiredStatus,
          );
          if (!row) {
            return { data: null, error: null };
          }
          Object.assign(row, state.payload);
          return { data: { ...row }, error: null };
        }
        // users_memory message_count lookup: fresh user.
        if (table === "users_memory") {
          return { data: { message_count: 0 }, error: null };
        }
        return { data: null, error: null };
      },
    };
    return builder;
  }

  return {
    referrals,
    rewardTransactions,
    wallet,
    from(table: string) {
      return makeBuilder(table);
    },
    async rpc(fn: string, params: Record<string, unknown>) {
      if (fn === "credit_voice_seconds") {
        const userId = String(params.p_user_id);
        const amount = Number(params.p_amount);
        const next = (wallet.get(userId) ?? 0) + amount;
        wallet.set(userId, next);
        return { data: next, error: null };
      }
      return { data: null, error: null };
    },
  };
}

afterEach(() => {
  __resetTestClient();
});

test("Property 1: repeated/concurrent qualification credits exactly once (120s, one tx)", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 1 }),
      fc.string({ minLength: 1 }),
      // Number of qualification attempts to fire (2..6).
      fc.integer({ min: 2, max: 6 }),
      async (rawReferrer, rawReferred, attempts) => {
        const referrerUserId = `R:${rawReferrer}`;
        const referredUserId = `U:${rawReferred}`;

        // --- Sequential attempts -------------------------------------------
        {
          const fake = createFakeClient(referrerUserId, referredUserId);
          __setTestClient(fake);

          for (let i = 0; i < attempts; i++) {
            await qualifyAndCreditReferral(referredUserId);
          }

          // Wallet credited by EXACTLY the reward amount, once.
          assert.equal(
            fake.wallet.get(referrerUserId) ?? 0,
            REWARD_SECONDS,
            `sequential: wallet should be ${REWARD_SECONDS}, got ${fake.wallet.get(referrerUserId)}`,
          );

          // EXACTLY ONE reward_transactions row for this referral.
          const txs = fake.rewardTransactions.filter(
            (t) => t.related_referral_id === `ref-${referredUserId}`,
          );
          assert.equal(
            txs.length,
            1,
            `sequential: expected exactly one reward tx, got ${txs.length}`,
          );
        }

        // --- Concurrent burst (Promise.all) --------------------------------
        {
          const fake = createFakeClient(referrerUserId, referredUserId);
          __setTestClient(fake);

          await Promise.all(
            Array.from({ length: attempts }, () =>
              qualifyAndCreditReferral(referredUserId),
            ),
          );

          assert.equal(
            fake.wallet.get(referrerUserId) ?? 0,
            REWARD_SECONDS,
            `concurrent: wallet should be ${REWARD_SECONDS}, got ${fake.wallet.get(referrerUserId)}`,
          );

          const txs = fake.rewardTransactions.filter(
            (t) => t.related_referral_id === `ref-${referredUserId}`,
          );
          assert.equal(
            txs.length,
            1,
            `concurrent: expected exactly one reward tx, got ${txs.length}`,
          );
        }
      },
    ),
    { numRuns: 100 },
  );
});
