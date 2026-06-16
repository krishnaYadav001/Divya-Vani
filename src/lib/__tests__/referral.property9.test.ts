// Feature: referral-reward-system, Property 9: Chat response success is independent of referral operation success
//
// The chat route (src/app/api/chat/route.ts) invokes the two referral hooks —
// attributeReferral (before the AI work) and qualifyAndCreditReferral (after,
// once the 3-message threshold is reached) — each wrapped in its OWN try/catch:
//
//   try { await attributeReferral({...}); }
//   catch (e) { console.error("[referral] attribution hook threw:", e); }
//
//   if (onFreePool && nextMessageCount >= 3) {
//     try { await qualifyAndCreditReferral(userId); }
//     catch (e) { console.error("[referral] qualification hook threw:", e); }
//   }
//
// Because each hook is isolated in its own try/catch and its result is never
// inspected, NO referral outcome — a resolved AttributionOutcome / ReferralRow,
// a no-op, a rejected promise, or a synchronous throw — can break the chat
// flow. The chat handler always produces and returns its reply.
//
// Importing the real POST handler under tsx is impractical (cookies(),
// Anthropic, Supabase, Vercel runtime), so we model the EXACT isolation wrapper
// the route uses and prove the property over it (`chatTurnWithReferralHooks`
// below mirrors the two guarded blocks verbatim). We then strengthen the proof
// by tying it to the real lib: with a fake client whose every method throws
// injected via the test-only seam, the REAL attributeReferral /
// qualifyAndCreditReferral still RESOLVE (noop / null) rather than reject —
// which is precisely what makes the route's isolation hold.
//
// **Validates: Requirements 4.8, 5.8, 7.12**

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  attributeReferral,
  qualifyAndCreditReferral,
  __setTestClient,
  __resetTestClient,
} from "../referral";
import type { AttributionOutcome, ReferralRow } from "../referralTypes";

const REPLY = "krishna-reply";

/**
 * Local replica of the route's two guarded referral blocks. Each hook runs in
 * its own try/catch whose error is swallowed (logged in the route); the chat
 * work ALWAYS produces and returns the reply regardless of hook behaviour.
 */
async function chatTurnWithReferralHooks(
  refFn: () => Promise<unknown>,
  qualFn: () => Promise<unknown>,
): Promise<string> {
  // mimics the route's isolation: attribution hook in its own try/catch
  try {
    await refFn();
  } catch {
    /* swallowed like the route ("[referral] attribution hook threw:") */
  }

  // ... chat work produces a reply ...
  const reply = REPLY;

  // qualification hook in its own try/catch
  try {
    await qualFn();
  } catch {
    /* swallowed like the route ("[referral] qualification hook threw:") */
  }

  return reply; // chat ALWAYS returns its reply
}

// A representative ReferralRow used by the "resolves with a row" behaviours.
const SAMPLE_ROW: ReferralRow = {
  id: "ref-1",
  referrer_user_id: "R:owner",
  referred_user_id: "U:referred",
  referral_code: "CODE1234",
  status: "qualified",
  required_messages: 3,
  reward_seconds: 120,
  referred_message_count_at_qualification: 3,
  created_at: new Date(0).toISOString(),
  qualified_at: new Date(1).toISOString(),
  rejected_reason: null,
};

// Every AttributionOutcome shape attributeReferral can return.
const ATTRIBUTION_OUTCOMES: AttributionOutcome[] = [
  { result: "created", referral: SAMPLE_ROW },
  { result: "rejected", reason: "self_referral" },
  { result: "rejected", reason: "pre_existing_user" },
  { result: "exists" },
  { result: "noop" },
];

// Every ReferralRow | null shape qualifyAndCreditReferral can return.
const QUALIFICATION_RESULTS: (ReferralRow | null)[] = [SAMPLE_ROW, null];

/**
 * A fast-check arbitrary over hook *behaviours*. Each behaviour describes how a
 * hook resolves or fails, and `build()` turns it into the actual `() =>
 * Promise<unknown>` the wrapper invokes. Covers: resolves with a value,
 * resolves with undefined (no-op), rejects with an Error, and throws
 * synchronously (before returning a promise).
 */
type Behaviour =
  | { kind: "resolve"; value: unknown }
  | { kind: "resolveUndefined" }
  | { kind: "reject"; message: string }
  | { kind: "throwSync"; message: string };

function buildFn(b: Behaviour): () => Promise<unknown> {
  switch (b.kind) {
    case "resolve":
      return async () => b.value;
    case "resolveUndefined":
      return async () => undefined;
    case "reject":
      return () => Promise.reject(new Error(b.message));
    case "throwSync":
      // Throws synchronously, before any promise is produced.
      return () => {
        throw new Error(b.message);
      };
  }
}

const refBehaviour: fc.Arbitrary<Behaviour> = fc.oneof(
  fc
    .constantFrom(...ATTRIBUTION_OUTCOMES)
    .map((value) => ({ kind: "resolve", value }) as Behaviour),
  fc.constant<Behaviour>({ kind: "resolveUndefined" }),
  fc.string().map((message) => ({ kind: "reject", message }) as Behaviour),
  fc.string().map((message) => ({ kind: "throwSync", message }) as Behaviour),
);

const qualBehaviour: fc.Arbitrary<Behaviour> = fc.oneof(
  fc
    .constantFrom(...QUALIFICATION_RESULTS)
    .map((value) => ({ kind: "resolve", value }) as Behaviour),
  fc.constant<Behaviour>({ kind: "resolveUndefined" }),
  fc.string().map((message) => ({ kind: "reject", message }) as Behaviour),
  fc.string().map((message) => ({ kind: "throwSync", message }) as Behaviour),
);

afterEach(() => {
  __resetTestClient();
});

test("Property 9: chat reply is always produced regardless of either hook's outcome", async () => {
  await fc.assert(
    fc.asyncProperty(refBehaviour, qualBehaviour, async (rb, qb) => {
      const reply = await chatTurnWithReferralHooks(buildFn(rb), buildFn(qb));
      // The chat flow ALWAYS resolves to its reply, never rejects, for every
      // generated combination of (attribution outcome, qualification outcome).
      assert.equal(reply, REPLY);
    }),
    { numRuns: 200 },
  );
});

test("Property 9: chatTurnWithReferralHooks never rejects even when both hooks throw/reject", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.string(),
      fc.string(),
      fc.boolean(),
      fc.boolean(),
      async (m1, m2, refSync, qualSync) => {
        const refFn = refSync
          ? () => {
              throw new Error(m1);
            }
          : () => Promise.reject(new Error(m1));
        const qualFn = qualSync
          ? () => {
              throw new Error(m2);
            }
          : () => Promise.reject(new Error(m2));

        // Must resolve (not reject) and yield the reply.
        await assert.doesNotReject(async () => {
          const reply = await chatTurnWithReferralHooks(refFn, qualFn);
          assert.equal(reply, REPLY);
        });
      },
    ),
    { numRuns: 100 },
  );
});

/**
 * A fake Supabase client whose EVERY method throws synchronously. This is the
 * worst case the route's isolation must tolerate: even if the lib internals hit
 * an exploding client, the lib functions themselves are wrapped in try/catch
 * and must RESOLVE to safe values (noop / null) rather than reject.
 */
function createExplodingClient() {
  const boom = (): never => {
    throw new Error("exploding client: method invoked");
  };
  // A builder where every chained method throws. `from` itself throws too, so
  // any DB access path inside the lib is forced through its try/catch.
  return {
    from: boom,
    rpc: boom,
  };
}

test("Property 9 (lib-tied): real attributeReferral resolves (never rejects) under an exploding client", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 1 }),
      fc.string({ minLength: 1 }),
      async (referrerCode, rawReferredId) => {
        __setTestClient(createExplodingClient());
        const referredUserId = `U:${rawReferredId}`;

        let outcome: AttributionOutcome | undefined;
        await assert.doesNotReject(async () => {
          outcome = await attributeReferral({ referrerCode, referredUserId });
        }, "attributeReferral must never reject — that is what lets the route's try/catch hold");

        // It resolves to a safe, fail-closed outcome (the client threw, so the
        // top-level catch returns noop).
        assert.deepEqual(outcome, { result: "noop" });
      },
    ),
    { numRuns: 100 },
  );
});

test("Property 9 (lib-tied): real qualifyAndCreditReferral resolves to null (never rejects) under an exploding client", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 1 }),
      async (rawReferredId) => {
        __setTestClient(createExplodingClient());
        const referredUserId = `U:${rawReferredId}`;

        let result: ReferralRow | null = SAMPLE_ROW;
        await assert.doesNotReject(async () => {
          result = await qualifyAndCreditReferral(referredUserId);
        }, "qualifyAndCreditReferral must never reject — that is what lets the route's try/catch hold");

        // Fail-closed: no credit, returns null.
        assert.equal(result, null);
      },
    ),
    { numRuns: 100 },
  );
});

test("Property 9 (lib-tied + route isolation): exploding-client lib calls drive the route wrapper, reply still returned", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 1 }),
      fc.string({ minLength: 1 }),
      async (referrerCode, rawReferredId) => {
        __setTestClient(createExplodingClient());
        const referredUserId = `U:${rawReferredId}`;

        // Feed the REAL lib functions (over an exploding client) into the exact
        // isolation wrapper the route uses. End to end, the chat reply stands.
        const reply = await chatTurnWithReferralHooks(
          () => attributeReferral({ referrerCode, referredUserId }),
          () => qualifyAndCreditReferral(referredUserId),
        );
        assert.equal(reply, REPLY);
      },
    ),
    { numRuns: 100 },
  );
});
