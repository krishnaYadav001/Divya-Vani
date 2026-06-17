// Unit tests for getOrCreateReferralCode generation: collision retry,
// exhaustion, no-identity short-circuit, and existing-code stability.
//
// These inject a fake Supabase client via the test-only seam in referral.ts
// (__setTestClient / __resetTestClient) so no real DB is touched. The fake
// reproduces the chainable query-builder shapes used by
// getOrCreateReferralCode:
//   SELECT: .from(t).select(cols).eq(col,val).maybeSingle()
//   UPDATE: .from(t).update(obj).eq(col,val).is(col,null).select(cols).maybeSingle()
//
// _Requirements: 1.7, 1.8, 1.9 (plus stability 1.2)

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getOrCreateReferralCode,
  __setTestClient,
  __resetTestClient,
} from "../referral";

const CODE_RE = /^[A-Za-z0-9_-]{8}$/;

type DbResult = { data: unknown; error: { code?: string } | null };

/**
 * Minimal in-memory fake Supabase client. Each test scripts the responses by
 * setting `selectHandler` / `updateHandler`. The fake records call counts so a
 * test can assert whether a retry happened or whether any UPDATE was issued.
 */
function createFakeClient() {
  const calls = { from: 0, select: 0, update: 0, maybeSingle: 0, upsert: 0 };
  let selectHandler: () => DbResult = () => ({ data: null, error: null });
  let updateHandler: (payload: Record<string, unknown>) => DbResult = () => ({
    data: null,
    error: null,
  });
  let upsertHandler: (payload: Record<string, unknown>) => { error: { code?: string } | null } =
    () => ({ error: null });

  function makeBuilder() {
    const state: { op: "select" | "update" | "upsert"; payload: Record<string, unknown> } =
      { op: "select", payload: {} };
    const builder = {
      select(_cols?: string) {
        calls.select++;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        calls.update++;
        state.op = "update";
        state.payload = payload;
        return builder;
      },
      // Awaited directly (no .maybeSingle()) by the ensure-row step.
      upsert(payload: Record<string, unknown>) {
        calls.upsert++;
        return upsertHandler(payload);
      },
      eq(_col: string, _val: unknown) {
        return builder;
      },
      is(_col: string, _val: unknown) {
        return builder;
      },
      async maybeSingle(): Promise<DbResult> {
        calls.maybeSingle++;
        return state.op === "update"
          ? updateHandler(state.payload)
          : selectHandler();
      },
    };
    return builder;
  }

  return {
    calls,
    setSelectHandler(fn: () => DbResult) {
      selectHandler = fn;
    },
    setUpdateHandler(fn: (payload: Record<string, unknown>) => DbResult) {
      updateHandler = fn;
    },
    setUpsertHandler(fn: (payload: Record<string, unknown>) => { error: { code?: string } | null }) {
      upsertHandler = fn;
    },
    from(_table: string) {
      calls.from++;
      return makeBuilder();
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

test("collision then success: retries on 23505 and returns a valid code", async () => {
  // No existing code yet.
  fake.setSelectHandler(() => ({ data: { referral_code: null }, error: null }));
  // First guarded UPDATE collides (unique violation); second succeeds, echoing
  // the freshly generated code back as the DB would.
  let attempts = 0;
  fake.setUpdateHandler((payload) => {
    attempts += 1;
    if (attempts === 1) return { data: null, error: { code: "23505" } };
    return { data: { referral_code: payload.referral_code }, error: null };
  });

  const code = await getOrCreateReferralCode("user-1");

  assert.equal(typeof code, "string");
  assert.match(code as string, CODE_RE);
  // Proof it retried: the UPDATE was issued exactly twice.
  assert.equal(attempts, 2);
  assert.equal(fake.calls.update, 2);
});

test("exhaustion: returns null after 5 consecutive 23505 collisions", async () => {
  fake.setSelectHandler(() => ({ data: { referral_code: null }, error: null }));
  let attempts = 0;
  fake.setUpdateHandler(() => {
    attempts += 1;
    return { data: null, error: { code: "23505" } };
  });

  const code = await getOrCreateReferralCode("user-2");

  assert.equal(code, null);
  // All 5 generation attempts were exhausted on unique violations.
  assert.equal(attempts, 5);
  assert.equal(fake.calls.update, 5);
});

test("no identity: empty userId returns null without any DB call", async () => {
  const code = await getOrCreateReferralCode("");

  assert.equal(code, null);
  assert.equal(fake.calls.from, 0);
  assert.equal(fake.calls.update, 0);
});

test("stability: an existing code is returned unchanged with no UPDATE", async () => {
  const existing = "Ab3_xY9Z";
  fake.setSelectHandler(() => ({
    data: { referral_code: existing },
    error: null,
  }));
  // If any UPDATE were issued the test should fail loudly.
  fake.setUpdateHandler(() => {
    throw new Error("UPDATE must not be issued when a code already exists");
  });

  const code = await getOrCreateReferralCode("user-3");

  assert.equal(code, existing);
  assert.equal(fake.calls.update, 0);
});

test("no row yet (post-deletion / never chatted): upserts a row, then generates a code", async () => {
  // The SELECT returns no row at all (data: null) — this is the freshly-rotated
  // identity after /api/delete-account, or a bare cookie that has never chatted.
  // Without the ensure-row upsert, the guarded UPDATE would touch 0 rows and the
  // share panel would fail to load (Req 1.1).
  let rowExists = false;
  fake.setSelectHandler(() => ({
    data: rowExists ? { referral_code: null } : null,
    error: null,
  }));
  fake.setUpsertHandler(() => {
    rowExists = true; // the upsert creates the empty row
    return { error: null };
  });
  // After the row exists, the guarded UPDATE sets the generated code.
  fake.setUpdateHandler((payload) => ({
    data: { referral_code: payload.referral_code },
    error: null,
  }));

  const code = await getOrCreateReferralCode("rotated-user");

  assert.equal(typeof code, "string");
  assert.match(code as string, CODE_RE);
  // The ensure-row upsert was issued exactly once before the UPDATE.
  assert.equal(fake.calls.upsert, 1);
});
