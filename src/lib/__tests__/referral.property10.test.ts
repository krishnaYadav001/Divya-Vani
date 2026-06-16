// Feature: referral-reward-system, Property 10: Referral stats equal the true server-side aggregates
//
// Property-based test for getReferralStats. The function never trusts the
// client: it derives every figure from server-side queries —
//   - totalInvited:  COUNT(*) of referrals WHERE referrer_user_id = userId
//   - pending:       COUNT(*) of those WHERE status = 'pending'
//   - successful:    COUNT(*) of those WHERE status = 'qualified'
//   - voiceMinutesEarned:
//       floor(SUM(reward_transactions.amount_seconds) / 60)
//         WHERE user_id = userId AND type = 'referral_voice_reward'
//
// This property asserts those returned aggregates equal an independently
// computed reference aggregation over arbitrary in-memory rows — and that rows
// belonging to OTHER referrers / other users are excluded by the eq() filters.
//
// Injects a fake Supabase client via the test-only seam in referral.ts
// (__setTestClient / __resetTestClient), mirroring the fake-client pattern in
// referral.property4.test.ts, so no real DB is touched. The fake honours the
// `count:"exact", head:true` count queries (returning { count, data:null,
// error:null }) and the amount_seconds select (returning { data: rows,
// error:null }), applying whichever eq() filters were chained.
//
// **Validates: Requirements 7.10, 9.1, 9.3, 9.4**

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  getReferralStats,
  __setTestClient,
  __resetTestClient,
} from "../referral";

type Row = Record<string, unknown>;

/**
 * Minimal in-memory fake Supabase client tailored to getReferralStats:
 *
 *   referrals counts:
 *     .from("referrals").select("*", { count:"exact", head:true })
 *       .eq("referrer_user_id", userId)[.eq("status", s)]
 *     → { count, data: null, error: null } over rows matching ALL chained eqs.
 *
 *   reward sum source:
 *     .from("reward_transactions").select("amount_seconds")
 *       .eq("user_id", userId).eq("type", "referral_voice_reward")
 *     → { data: rows, error: null } over rows matching ALL chained eqs.
 */
function createFakeClient(referrals: Row[], rewardTransactions: Row[]) {
  function makeBuilder(table: string) {
    const state: {
      head: boolean;
      cols: string[];
      eqs: Record<string, unknown>;
    } = { head: false, cols: [], eqs: {} };

    const source = table === "referrals" ? referrals : rewardTransactions;

    const matches = (r: Row) =>
      Object.entries(state.eqs).every(([col, val]) => r[col] === val);

    const builder: Record<string, unknown> = {
      select(cols: string, opts?: { count?: string; head?: boolean }) {
        state.cols = cols.split(",").map((c) => c.trim());
        if (opts?.head) state.head = true;
        return builder;
      },
      eq(col: string, val: unknown) {
        state.eqs[col] = val;
        return builder;
      },
      // head:true count query is awaited directly (thenable), no maybeSingle.
      then(resolve: (value: unknown) => void) {
        const filtered = source.filter(matches);
        if (state.head) {
          resolve({ count: filtered.length, data: null, error: null });
          return;
        }
        // Non-head select → project the requested columns.
        const data = filtered.map((r) => {
          const out: Row = {};
          for (const c of state.cols) out[c] = r[c];
          return out;
        });
        resolve({ data, error: null });
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

let cleanup: (() => void) | undefined;

beforeEach(() => {
  // each property iteration installs its own fake; nothing global to set here.
});

afterEach(() => {
  __resetTestClient();
  cleanup?.();
  cleanup = undefined;
});

const STATUSES = ["pending", "qualified", "rejected"] as const;

test("Property 10: getReferralStats equals the true server-side aggregates", async () => {
  await fc.assert(
    fc.asyncProperty(
      // The Referrer under test (non-empty so the guard does not trip).
      fc.string({ minLength: 1 }),
      // A distinct "other" referrer id whose rows must be excluded.
      fc.string({ minLength: 1 }),
      // This referrer's referrals: arbitrary statuses.
      fc.array(fc.constantFrom(...STATUSES), { maxLength: 30 }),
      // Other referrers' referrals (noise) that must NOT be counted.
      fc.array(fc.constantFrom(...STATUSES), { maxLength: 15 }),
      // This user's referral_voice_reward transactions (seconds).
      fc.array(fc.integer({ min: 0, max: 600 }), { maxLength: 20 }),
      // Other/foreign reward rows (other user, or other type) — excluded.
      fc.array(fc.integer({ min: 0, max: 600 }), { maxLength: 15 }),
      async (
        rawUserId,
        rawOtherId,
        myStatuses,
        otherStatuses,
        myAmounts,
        foreignAmounts,
      ) => {
        const userId = `R:${rawUserId}`;
        const otherUserId = `X:${rawOtherId}`;

        // --- Build in-memory rows -----------------------------------------
        const referrals: Row[] = [];
        for (const status of myStatuses) {
          referrals.push({
            referrer_user_id: userId,
            referred_user_id: `u-${referrals.length}`,
            status,
          });
        }
        // Noise: rows for a different referrer (must be excluded by eq).
        for (const status of otherStatuses) {
          referrals.push({
            referrer_user_id: otherUserId,
            referred_user_id: `o-${referrals.length}`,
            status,
          });
        }

        const rewardTransactions: Row[] = [];
        for (const amount of myAmounts) {
          rewardTransactions.push({
            user_id: userId,
            type: "referral_voice_reward",
            amount_seconds: amount,
          });
        }
        // Noise: a foreign user's reward rows (excluded by user_id eq) and
        // wrong-type rows for THIS user (excluded by type eq).
        for (const amount of foreignAmounts) {
          rewardTransactions.push({
            user_id: otherUserId,
            type: "referral_voice_reward",
            amount_seconds: amount,
          });
          rewardTransactions.push({
            user_id: userId,
            type: "some_other_reward",
            amount_seconds: amount,
          });
        }

        // --- Reference aggregation (computed independently) ---------------
        const mine = referrals.filter((r) => r.referrer_user_id === userId);
        const expectedTotal = mine.length;
        const expectedPending = mine.filter(
          (r) => r.status === "pending",
        ).length;
        const expectedSuccessful = mine.filter(
          (r) => r.status === "qualified",
        ).length;
        const expectedSeconds = myAmounts.reduce((s, a) => s + a, 0);
        const expectedMinutes = Math.floor(expectedSeconds / 60);

        // --- Exercise getReferralStats against the fake -------------------
        const fake = createFakeClient(referrals, rewardTransactions);
        __setTestClient(fake);

        const stats = await getReferralStats(userId);

        assert.ok(stats !== null, "stats should not be null");
        assert.equal(
          stats!.totalInvited,
          expectedTotal,
          `totalInvited mismatch: ${JSON.stringify(stats)}`,
        );
        assert.equal(
          stats!.pending,
          expectedPending,
          `pending mismatch: ${JSON.stringify(stats)}`,
        );
        assert.equal(
          stats!.successful,
          expectedSuccessful,
          `successful mismatch: ${JSON.stringify(stats)}`,
        );
        assert.equal(
          stats!.voiceMinutesEarned,
          expectedMinutes,
          `voiceMinutesEarned mismatch: expected floor(${expectedSeconds}/60)=${expectedMinutes}, got ${stats!.voiceMinutesEarned}`,
        );

        __resetTestClient();
      },
    ),
    { numRuns: 100 },
  );
});
