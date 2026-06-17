// Feature: referral-reward-system, Property 2: Qualification credits exactly 120 seconds, additively and clamped
//
// Property-based test for the additive-and-clamped wallet credit in
// qualifyAndCreditReferral. For any pending referral (reward_seconds = 120)
// whose Referrer starts with prior voice_seconds_balance B, the first
// successful qualification must set the new balance to
// min(999999999, B + 120) — ADDING exactly the reward (never overwriting the
// prior balance) and keeping the value within the 0–999,999,999 range.
//
// Injects a fake Supabase client via the test-only seam in referral.ts
// (__setTestClient / __resetTestClient), mirroring the fake-client pattern in
// referral.property4.test.ts, so no real DB is touched. The fake models:
//   - users_memory.message_count lookup (non-fatal best-effort read) → 0.
//   - referrals status-guarded UPDATE: one pending row for referredUserId with
//     reward_seconds = 120; the guarded transition (status 'pending' →
//     'qualified') fires exactly once and echoes the row.
//   - reward_transactions insert: succeeds (no prior row).
//   - rpc("credit_voice_seconds", { p_user_id, p_amount }): updates an
//     in-memory wallet using the SAME clamp as the real Postgres RPC —
//     newBalance = min(999999999, max(0, prior + p_amount)).
//
// **Validates: Requirements 5.3, 10.1, 10.4**

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
const WALLET_CAP = 999999999;

/** The exact clamp the real credit_voice_seconds RPC applies. */
function clampCredit(prior: number, amount: number): number {
  return Math.min(WALLET_CAP, Math.max(0, prior + amount));
}

/**
 * Minimal in-memory fake Supabase client tailored to
 * qualifyAndCreditReferral's happy path, parameterised by the Referrer's
 * starting wallet balance.
 *
 *   referred message_count lookup:
 *     .from("users_memory").select("message_count")
 *       .eq("user_id", referredUserId).maybeSingle()
 *     → { message_count: 0 } (best-effort; non-fatal).
 *
 *   status-guarded qualification UPDATE:
 *     .from("referrals").update({...})
 *       .eq("referred_user_id", id).eq("status", "pending")
 *       .select("*").maybeSingle()
 *     → transitions the single pending row once (pending → qualified) and
 *       echoes it; a second attempt finds no pending row and returns null.
 *
 *   reward_transactions insert:
 *     .from("reward_transactions").insert({...})
 *     → succeeds (no prior row), { error: null }.
 *
 *   rpc("credit_voice_seconds", { p_user_id, p_amount }):
 *     → applies the same clamp as the real RPC to the in-memory wallet.
 */
function createFakeClient(referredUserId: string, startingBalance: number) {
  const referrerUserId = "R:owner";
  // In-memory wallet keyed by user_id. Referrer seeded with the prior balance.
  const wallets: Record<string, number> = { [referrerUserId]: startingBalance };

  const referralRow: Row = {
    id: "ref-1",
    referrer_user_id: referrerUserId,
    referred_user_id: referredUserId,
    referral_code: "CODE1234",
    status: "pending",
    reward_seconds: REWARD_SECONDS,
  };
  const rewardTransactions: Row[] = [];

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
        // reward_transactions insert succeeds (no prior row for this referral).
        if (table === "reward_transactions") {
          rewardTransactions.push({ ...payload });
        }
        return builder;
      },
      eq(col: string, val: unknown) {
        state.eqs[col] = val;
        return builder;
      },
      async maybeSingle() {
        if (table === "referrals" && state.op === "update") {
          // Status-guarded transition: only a still-'pending' row moves.
          if (
            state.eqs.referred_user_id === referralRow.referred_user_id &&
            state.eqs.status === "pending" &&
            referralRow.status === "pending"
          ) {
            Object.assign(referralRow, state.payload);
            return { data: { ...referralRow }, error: null };
          }
          // Already qualified / no pending row → idempotent no-op.
          return { data: null, error: null };
        }
        if (table === "users_memory") {
          // Referred-user message_count lookup (best-effort).
          return { data: { message_count: 0 }, error: null };
        }
        if (table === "reward_transactions") {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      },
    };
    return builder;
  }

  return {
    wallets,
    referrerUserId,
    rewardTransactions,
    from(table: string) {
      return makeBuilder(table);
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      if (fn === "credit_voice_seconds") {
        const userId = String(args.p_user_id);
        const amount = Number(args.p_seconds);
        const prior = wallets[userId] ?? 0;
        const newBalance = clampCredit(prior, amount);
        wallets[userId] = newBalance;
        return { data: newBalance, error: null };
      }
      return { data: null, error: null };
    },
  };
}

let fake: ReturnType<typeof createFakeClient>;

afterEach(() => {
  __resetTestClient();
});

test("Property 2: qualification credits exactly +120 seconds, additively and clamped", async () => {
  await fc.assert(
    fc.asyncProperty(
      // Prior balance B across the full wallet range, biased to include values
      // near the cap (where the clamp bites) as well as small values.
      fc.oneof(
        fc.integer({ min: 0, max: WALLET_CAP }),
        fc.integer({ min: 999999800, max: WALLET_CAP }),
        fc.integer({ min: 0, max: 500 }),
      ),
      async (priorBalance) => {
        const referredUserId = "U:referred";
        fake = createFakeClient(referredUserId, priorBalance);
        __setTestClient(fake);

        const result = await qualifyAndCreditReferral(referredUserId);

        // Qualification succeeded (a pending row transitioned and credited).
        assert.ok(
          result !== null,
          `expected a credited referral for prior=${priorBalance}`,
        );

        // The wallet is additive (not overwritten) and clamped to the cap.
        const expected = Math.min(WALLET_CAP, priorBalance + REWARD_SECONDS);
        assert.equal(
          fake.wallets[fake.referrerUserId],
          expected,
          `prior=${priorBalance}: expected balance ${expected}, got ${fake.wallets[fake.referrerUserId]}`,
        );
      },
    ),
    { numRuns: 100 },
  );
});
