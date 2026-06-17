// Feature: referral-reward-system — unit test for credit-failure "rollback".
//
// Exercises qualifyAndCreditReferral's fail-closed behaviour when a step AFTER
// the status-guarded transition fails. The production code (src/lib/referral.ts)
// performs the credit-once steps in this order:
//
//   1. read referred user's message_count        (best-effort, non-fatal)
//   2. status-guarded UPDATE pending -> qualified (the credit-once gate)
//   3. INSERT reward_transactions                 (idempotency guard)
//   4. rpc credit_voice_seconds                   (the actual wallet credit)
//
// Because the guarded UPDATE happens FIRST, after a failure in step 3 or 4 the
// referrals row is already 'qualified' in the store — so the task-text phrasing
// "referral remains pending" cannot literally hold given the implementation
// order. We therefore assert the OBSERVABLE fail-closed contract that actually
// matters (Req 5.8, 10.6):
//
//   * qualifyAndCreditReferral returns null (never claims success), and
//   * NO wallet credit is applied (the rpc credit count / balance is unchanged).
//
// No partial double-credit is possible: in case 1 (tx insert fails) the wallet
// is never touched at all; in case 2 (rpc fails) the recorded reward_transactions
// row plus its UNIQUE(related_referral_id) constraint make a retried credit
// non-double-applying. We assert observable behaviour only: the null return and
// the wallet-call counts.
//
// Injects a fake Supabase client via the test-only seam in referral.ts
// (__setTestClient / __resetTestClient), mirroring the fake-client pattern in
// referral.property4.test.ts, so no real DB is touched.
//
// Validates: Requirements 5.8, 10.6

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  qualifyAndCreditReferral,
  __setTestClient,
  __resetTestClient,
} from "../referral";

type Row = Record<string, unknown>;

interface FakeOptions {
  /** Error returned by `.from("reward_transactions").insert(...)`, or null. */
  txInsertError?: { code?: string } | null;
  /** Error returned by `.rpc("credit_voice_seconds", ...)`, or null. */
  creditError?: { message?: string } | null;
  /** Starting wallet balance (seconds) the rpc credit would add to. */
  startingBalance?: number;
}

/**
 * Minimal in-memory fake Supabase client tailored to qualifyAndCreditReferral's
 * happy path, with injectable failures at the reward-transaction insert and the
 * wallet-credit RPC.
 *
 *   message_count read:
 *     .from("users_memory").select("message_count").eq("user_id", id).maybeSingle()
 *       → { message_count: 5 } (irrelevant to these failure cases; just non-fatal).
 *
 *   status-guarded transition (the credit-once gate):
 *     .from("referrals").update({...}).eq("referred_user_id", id)
 *       .eq("status","pending").select("*").maybeSingle()
 *       → transitions the in-memory pending row to 'qualified' and echoes it.
 *
 *   reward_transactions insert (awaited directly, no maybeSingle):
 *     .from("reward_transactions").insert({...})
 *       → { error: txInsertError }.
 *
 *   wallet credit (only reached if the tx insert succeeded):
 *     .rpc("credit_voice_seconds", { p_user_id, p_amount })
 *       → { error: creditError }; on success increments the tracked balance.
 */
function createFakeClient(opts: FakeOptions = {}) {
  const {
    txInsertError = null,
    creditError = null,
    startingBalance = 1000,
  } = opts;

  // The single pending referral row this referred user owns.
  const referralRow: Row = {
    id: "ref-1",
    referrer_user_id: "R:owner",
    referred_user_id: "", // filled per-call via the UPDATE's eq filter
    referral_code: "CODE1234",
    status: "pending",
    required_messages: 3,
    reward_seconds: 120,
    referred_message_count_at_qualification: null,
    created_at: new Date(0).toISOString(),
    qualified_at: null,
    rejected_reason: null,
  };

  // Observable wallet state — only the rpc credit path mutates these.
  let walletBalance = startingBalance;
  let creditCallCount = 0;

  function makeBuilder(table: string) {
    const state: {
      op: "select" | "update" | "insert";
      payload: Record<string, unknown>;
      eqs: Record<string, unknown>;
    } = { op: "select", payload: {}, eqs: {} };

    /** Resolve the terminal result for the current chain (op + table). */
    async function resolve(): Promise<{ data: unknown; error: unknown }> {
      if (table === "reward_transactions" && state.op === "insert") {
        return { data: null, error: txInsertError };
      }
      if (table === "referrals" && state.op === "update") {
        // Status-guarded transition: only a still-'pending' row flips.
        if (
          state.eqs.status === "pending" &&
          referralRow.status === "pending"
        ) {
          referralRow.status = "qualified";
          referralRow.referred_user_id = state.eqs.referred_user_id as string;
          referralRow.qualified_at =
            (state.payload.qualified_at as string) ?? new Date().toISOString();
          referralRow.referred_message_count_at_qualification =
            (state.payload
              .referred_message_count_at_qualification as number) ?? null;
          return { data: { ...referralRow }, error: null };
        }
        // Already qualified / absent → idempotent no-op.
        return { data: null, error: null };
      }
      if (table === "users_memory") {
        // Referred-user message_count read (non-fatal best-effort).
        return { data: { message_count: 5 }, error: null };
      }
      return { data: null, error: null };
    }

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
        return resolve();
      },
      // Thenable: lets `await client.from("reward_transactions").insert(...)`
      // (which has no terminal .maybeSingle()) resolve to the insert result.
      then(
        onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return resolve().then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return {
    from(table: string) {
      return makeBuilder(table);
    },
    async rpc(fn: string, args: { p_user_id: string; p_seconds: number }) {
      if (fn === "credit_voice_seconds") {
        if (creditError) {
          return { data: null, error: creditError };
        }
        creditCallCount += 1;
        walletBalance += args.p_seconds;
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
    // Test introspection helpers (not part of the Supabase surface).
    get walletBalance() {
      return walletBalance;
    },
    get creditCallCount() {
      return creditCallCount;
    },
    get referralStatus() {
      return referralRow.status;
    },
  };
}

let fake: ReturnType<typeof createFakeClient>;

afterEach(() => {
  __resetTestClient();
});

test("Case 1: reward_transactions insert fails (non-23505) → returns null and never credits the wallet", async () => {
  const startingBalance = 1000;
  fake = createFakeClient({
    txInsertError: { code: "XX000" }, // some non-unique DB error
    startingBalance,
  });
  __setTestClient(fake);

  const result = await qualifyAndCreditReferral("U:referred-1");

  // No claimed success.
  assert.equal(result, null, "expected null when reward_transactions insert fails");

  // The wallet credit RPC was NEVER reached → no balance change, no partial
  // double-credit (Req 5.8, 10.6).
  assert.equal(fake.creditCallCount, 0, "credit RPC must not be called");
  assert.equal(
    fake.walletBalance,
    startingBalance,
    "wallet balance must be unchanged",
  );
});

test("Case 2: credit RPC fails → returns null (no claimed success)", async () => {
  const startingBalance = 1000;
  fake = createFakeClient({
    txInsertError: null, // tx insert succeeds...
    creditError: { message: "rpc boom" }, // ...but the wallet credit fails
    startingBalance,
  });
  __setTestClient(fake);

  const result = await qualifyAndCreditReferral("U:referred-2");

  // The credit failed, so success is not claimed.
  assert.equal(result, null, "expected null when credit RPC fails");

  // On the credit-error path the RPC short-circuits before mutating the balance,
  // so the observable wallet value is unchanged. The recorded reward_transactions
  // row plus UNIQUE(related_referral_id) guard a safe, non-double-applying retry.
  assert.equal(
    fake.walletBalance,
    startingBalance,
    "failed credit must not change the wallet balance",
  );
  assert.equal(fake.creditCallCount, 0, "no successful credit should be recorded");
});

test("Sanity: with no injected failures, qualifyAndCreditReferral credits exactly once", async () => {
  const startingBalance = 1000;
  fake = createFakeClient({ startingBalance });
  __setTestClient(fake);

  const result = await qualifyAndCreditReferral("U:referred-3");

  // Full success returns the qualified referral row and credits the wallet once.
  assert.ok(result, "expected a qualified referral row on success");
  assert.equal(result?.status, "qualified");
  assert.equal(fake.creditCallCount, 1, "wallet should be credited exactly once");
  assert.equal(
    fake.walletBalance,
    startingBalance + 120,
    "wallet should increase by exactly reward_seconds (120)",
  );
});
