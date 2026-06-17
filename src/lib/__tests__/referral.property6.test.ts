// Feature: referral-reward-system, Property 6: Crediting happens iff message_count >= 3 and the referral was pending
//
// Property-based test for the qualification-threshold condition. Per the
// design, the 3-message threshold is enforced by the CALLER (the chat route
// invokes qualifyAndCreditReferral only once the Referred_User's
// nextMessageCount >= 3), while qualifyAndCreditReferral itself atomically
// credits ANY pending referral exactly once. To faithfully model that split,
// this test wraps the production function in a tiny local `onTurn` helper that
// mimics the chat hook's guard:
//
//   function onTurn(messageCount, referredUserId) {
//     if (messageCount >= 3) return qualifyAndCreditReferral(referredUserId);
//     return null;
//   }
//
// The property then asserts, for an arbitrary messageCount in [0, 50] against a
// fresh pending referral each run:
//   - messageCount < 3  → onTurn returns null, referral stays 'pending',
//                          wallet unchanged (no credit).
//   - messageCount >= 3 → referral becomes 'qualified', wallet increased by
//                          exactly 120, and exactly one reward_transactions row
//                          exists. A second onTurn at/above threshold does NOT
//                          credit again (idempotency).
//
// Injects a fake Supabase client via the test-only seam in referral.ts
// (__setTestClient / __resetTestClient), modelled on referral.property4.test.ts,
// so no real DB is touched. The fake is backed by in-memory `referrals`,
// `reward_transactions`, and a wallet map. It models: one pending referral for
// referredUserId (reward_seconds=120); a status-guarded UPDATE that transitions
// 'pending'→'qualified' exactly once; reward_transactions insert enforcing
// UNIQUE(related_referral_id); and an rpc("credit_voice_seconds") that
// increments the wallet.
//
// **Validates: Requirements 5.2, 5.4, 7.9**

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  qualifyAndCreditReferral,
  __setTestClient,
  __resetTestClient,
} from "../referral";

type Row = Record<string, unknown>;

const REFERRED_USER_ID = "U:referred";
const REFERRER_USER_ID = "R:referrer";
const REWARD_SECONDS = 120;

/**
 * Minimal in-memory fake Supabase client tailored to qualifyAndCreditReferral's
 * crediting path:
 *
 *   referred-user message_count read:
 *     .from("users_memory").select("message_count")
 *       .eq("user_id", referredUserId).maybeSingle()
 *     → echoes the configured messageCount (recorded at qualification).
 *
 *   status-guarded transition:
 *     .from("referrals").update({...})
 *       .eq("referred_user_id", id).eq("status", "pending")
 *       .select("*").maybeSingle()
 *     → transitions the single seeded referral 'pending'→'qualified' exactly
 *       once; a repeat finds no pending row and resolves { data: null }.
 *
 *   reward_transactions insert:
 *     .from("reward_transactions").insert({...})
 *     → enforces UNIQUE(related_referral_id): a second insert for the same
 *       related_referral_id resolves { data: null, error: { code: "23505" } }.
 *
 *   wallet credit:
 *     .rpc("credit_voice_seconds", { p_user_id, p_amount })
 *     → increments the in-memory wallet for p_user_id by p_amount.
 */
function createFakeClient(messageCount: number) {
  // Seed exactly one pending referral for the referred user.
  const referrals: Row[] = [
    {
      id: "ref-1",
      referrer_user_id: REFERRER_USER_ID,
      referred_user_id: REFERRED_USER_ID,
      referral_code: "CODE1234",
      status: "pending",
      reward_seconds: REWARD_SECONDS,
    },
  ];
  const rewardTransactions: Row[] = [];
  const wallet: Record<string, number> = { [REFERRER_USER_ID]: 0 };

  function makeBuilder(table: string) {
    const state: {
      op: "select" | "insert" | "update";
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
      // Resolves the staged operation. Shared by maybeSingle() (used by the
      // SELECT/UPDATE paths) and then() (the reward_transactions insert is
      // awaited directly, without .maybeSingle()).
      __resolve() {
        if (table === "referrals" && state.op === "update") {
          // Status-guarded transition: only a row still 'pending' (matching the
          // referred_user_id filter) transitions, and only once.
          const row = referrals.find(
            (r) =>
              r.referred_user_id === state.eqs.referred_user_id &&
              r.status === state.eqs.status,
          );
          if (!row) {
            // No pending row → idempotent no-op (already qualified / absent).
            return { data: null, error: null };
          }
          Object.assign(row, state.payload);
          return { data: { ...row }, error: null };
        }

        if (table === "reward_transactions" && state.op === "insert") {
          // UNIQUE(related_referral_id) idempotency guard.
          const relatedId = state.payload.related_referral_id;
          const clash = rewardTransactions.some(
            (t) => t.related_referral_id === relatedId,
          );
          if (clash) {
            return { data: null, error: { code: "23505" } };
          }
          const row: Row = { id: `tx-${rewardTransactions.length}`, ...state.payload };
          rewardTransactions.push(row);
          return { data: row, error: null };
        }

        if (table === "users_memory") {
          // Referred-user message_count lookup.
          return { data: { message_count: messageCount }, error: null };
        }

        return { data: null, error: null };
      },
      async maybeSingle() {
        return (builder as { __resolve(): unknown }).__resolve();
      },
      // Thenable: awaiting the builder directly (e.g. the reward_transactions
      // insert) resolves the staged operation, mirroring supabase-js.
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(
          (builder as { __resolve(): unknown }).__resolve(),
        ).then(onFulfilled, onRejected);
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
    async rpc(fn: string, args: Record<string, unknown>) {
      if (fn === "credit_voice_seconds") {
        const userId = String(args.p_user_id);
        const amount = Number(args.p_seconds);
        wallet[userId] = (wallet[userId] ?? 0) + amount;
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  };
}

let fake: ReturnType<typeof createFakeClient>;

afterEach(() => {
  __resetTestClient();
});

test("Property 6: credit happens iff messageCount >= 3 and referral was pending", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: 50 }),
      async (messageCount) => {
        // Fresh pending referral + zeroed wallet for each run.
        fake = createFakeClient(messageCount);
        __setTestClient(fake);

        // The chat-hook guard: only call the crediting core when the running
        // message count reaches the 3-message threshold.
        const onTurn = (count: number, referredUserId: string) => {
          if (count >= 3) return qualifyAndCreditReferral(referredUserId);
          return Promise.resolve(null);
        };

        const result = await onTurn(messageCount, REFERRED_USER_ID);
        const referral = fake.referrals[0];

        if (messageCount < 3) {
          // Below threshold: the caller never invokes the core. Nothing changes.
          assert.equal(
            result,
            null,
            `expected null below threshold, got ${JSON.stringify(result)}`,
          );
          assert.equal(
            referral.status,
            "pending",
            `referral should remain pending for count=${messageCount}`,
          );
          assert.equal(
            fake.wallet[REFERRER_USER_ID],
            0,
            `wallet should be unchanged for count=${messageCount}`,
          );
          assert.equal(
            fake.rewardTransactions.length,
            0,
            `no reward transaction should exist for count=${messageCount}`,
          );
        } else {
          // At/above threshold: the pending referral qualifies and credits once.
          assert.ok(
            result !== null,
            `expected a credited referral for count=${messageCount}`,
          );
          assert.equal(
            referral.status,
            "qualified",
            `referral should be qualified for count=${messageCount}`,
          );
          assert.equal(
            fake.wallet[REFERRER_USER_ID],
            REWARD_SECONDS,
            `wallet should increase by exactly ${REWARD_SECONDS} for count=${messageCount}`,
          );
          assert.equal(
            fake.rewardTransactions.length,
            1,
            `exactly one reward transaction should exist for count=${messageCount}`,
          );

          // Idempotency: a second turn at/above threshold does not credit again.
          const second = await onTurn(messageCount, REFERRED_USER_ID);
          assert.equal(
            second,
            null,
            `repeat at/above threshold should not re-credit, got ${JSON.stringify(second)}`,
          );
          assert.equal(
            fake.wallet[REFERRER_USER_ID],
            REWARD_SECONDS,
            `wallet should stay at ${REWARD_SECONDS} after repeat for count=${messageCount}`,
          );
          assert.equal(
            fake.rewardTransactions.length,
            1,
            `still exactly one reward transaction after repeat for count=${messageCount}`,
          );
        }
      },
    ),
    { numRuns: 100 },
  );
});
