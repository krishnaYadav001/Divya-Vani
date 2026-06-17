// Referral Reward System — server-side core (service-role, silent-fail).
//
// Mirrors src/lib/supabase.ts / src/lib/voiceAccess.ts: a module-local cached
// service-role Supabase client via getClient(), `[referral]`-prefixed
// console.error, and try/catch discipline on every DB op. Security-relevant
// operations fail closed (return a non-credit / invalid result on error) so a
// missing table or misconfigured RLS degrades the feature, never the chat.
//
// SCAFFOLD ONLY (task 2.1): the function bodies below are stubs with correct
// signatures and safe fail-closed return values. Subsequent sub-tasks fill in
// the implementations:
//   - 2.2  getOrCreateReferralCode
//   - 2.5  validateReferralCode
//   - 2.6  attributeReferral
//   - 2.10 qualifyAndCreditReferral
//   - 2.16 getReferralStats

import { randomInt } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AttributionOutcome,
  ReferralRow,
  ReferralStats,
} from "./referralTypes";

let cachedClient: SupabaseClient | null = null;

/**
 * Module-local cached service-role client, mirroring src/lib/supabase.ts.
 * Returns null (and logs with a `[referral]` prefix) when the required env
 * vars are missing, so every DB op can fail closed.
 */
function getClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[referral] env vars missing", {
      hasUrl: !!url,
      hasKey: !!key,
    });
    return null;
  }
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

/** URL-safe alphabet for referral codes: [A-Za-z0-9_-], exactly 64 chars. */
const REFERRAL_CODE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const REFERRAL_CODE_LENGTH = 8;
const MAX_GENERATION_ATTEMPTS = 5;

/**
 * Generates an 8-char code from the 64-char URL-safe set [A-Za-z0-9_-].
 * Uses crypto.randomInt for an unbiased pick over the alphabet (64 evenly
 * divides the RNG range, so no modulo bias).
 */
function generateCode(): string {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Returns the stable Referral_Code for userId, generating + persisting one on
 * first request. Returns null on unresolved identity or persistent failure
 * (fail closed).
 */
export async function getOrCreateReferralCode(
  userId: string,
): Promise<string | null> {
  // Unresolved/empty identity → error indication, never a code (Req 1.9).
  if (typeof userId !== "string" || userId.length === 0) {
    console.error("[referral] getOrCreateReferralCode: empty userId");
    return null;
  }

  try {
    const client = getClient();
    if (!client) return null;

    // Stability (Req 1.2): if a code already exists, return it unchanged.
    const { data: existing, error: selectError } = await client
      .from("users_memory")
      .select("referral_code")
      .eq("user_id", userId)
      .maybeSingle();
    if (selectError) {
      console.error(
        "[referral] getOrCreateReferralCode select error:",
        selectError,
      );
      return null;
    }
    if (typeof existing?.referral_code === "string" && existing.referral_code) {
      return existing.referral_code;
    }

    // Ensure a users_memory row exists for this user before the guarded UPDATE.
    // A bare cookie identity that has never chatted — or one freshly rotated by
    // /api/delete-account — has NO row yet, so an UPDATE would touch 0 rows and
    // the share panel would fail to load. Upsert an empty row (ignore-on-
    // conflict so an existing row is untouched, preserving any code/balance).
    if (!existing) {
      const { error: ensureError } = await client
        .from("users_memory")
        .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
      if (ensureError) {
        console.error(
          "[referral] getOrCreateReferralCode ensure-row error:",
          ensureError,
        );
        return null;
      }
    }

    // No code yet — generate + persist, retrying on unique-violation (Req 1.7).
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const code = generateCode();
      // Guarded UPDATE: `referral_code IS NULL` ensures a concurrent generation
      // cannot overwrite an already-set code (stability under races).
      const { data: updated, error: updateError } = await client
        .from("users_memory")
        .update({ referral_code: code })
        .eq("user_id", userId)
        .is("referral_code", null)
        .select("referral_code")
        .maybeSingle();

      if (updateError) {
        // Unique violation — the generated code collided with another user's.
        // Generate a fresh code and retry (Req 1.7).
        if (updateError.code === "23505") {
          continue;
        }
        console.error(
          "[referral] getOrCreateReferralCode update error:",
          updateError,
        );
        return null;
      }

      if (updated?.referral_code) {
        return updated.referral_code;
      }

      // No row affected by the guarded UPDATE: a concurrent request set the
      // code between our SELECT and UPDATE. Re-SELECT and return it (stability).
      const { data: concurrent, error: reSelectError } = await client
        .from("users_memory")
        .select("referral_code")
        .eq("user_id", userId)
        .maybeSingle();
      if (reSelectError) {
        console.error(
          "[referral] getOrCreateReferralCode re-select error:",
          reSelectError,
        );
        return null;
      }
      if (
        typeof concurrent?.referral_code === "string" &&
        concurrent.referral_code
      ) {
        return concurrent.referral_code;
      }
      // No existing row at all (e.g. user_id not in users_memory) → fail closed.
      console.error(
        "[referral] getOrCreateReferralCode: no row updated and none present",
      );
      return null;
    }

    // Exhausted retries on persistent unique-violations (Req 1.7, 1.8).
    console.error(
      "[referral] getOrCreateReferralCode: exhausted generation attempts",
    );
    return null;
  } catch (e) {
    console.error("[referral] getOrCreateReferralCode threw:", e);
    return null;
  }
}

/**
 * Reports whether `code` maps to an existing Referrer. Read-only; never creates
 * or modifies a record. Returns false on error (fail closed).
 */
export async function validateReferralCode(code: string): Promise<boolean> {
  // Empty/non-string code → false without hitting the DB (Req 7.4, 8.6).
  if (typeof code !== "string" || code.length === 0) {
    return false;
  }

  try {
    const client = getClient();
    if (!client) return false;

    // Read-only owner lookup: a Referrer exists iff a users_memory row carries
    // this referral_code. Never creates or modifies a record.
    const { data, error } = await client
      .from("users_memory")
      .select("user_id")
      .eq("referral_code", code)
      .maybeSingle();
    if (error) {
      console.error("[referral] validateReferralCode select error:", error);
      return false;
    }

    // true only when a matching Referrer row exists (Req 7.3).
    return !!data?.user_id;
  } catch (e) {
    console.error("[referral] validateReferralCode threw:", e);
    return false;
  }
}

/**
 * Creates a Pending_Referral linking the code owner (Referrer) to
 * referredUserId, enforcing the self-referral / invalid-code / pre-existing-user
 * / one-per-referred guards server-side. Never throws; returns "noop" on any DB
 * error so chat continues.
 */
export async function attributeReferral(args: {
  referrerCode: string;
  referredUserId: string;
  refStoredAt?: string; // ISO timestamp from browser storage, pre-existing-user guard
}): Promise<AttributionOutcome> {
  const { referrerCode, referredUserId } = args;

  // Empty/non-string inputs → noop without hitting the DB (Req 4.6, 8.6).
  if (
    typeof referrerCode !== "string" ||
    referrerCode.length === 0 ||
    typeof referredUserId !== "string" ||
    referredUserId.length === 0
  ) {
    return { result: "noop" };
  }

  try {
    const client = getClient();
    if (!client) return { result: "noop" };

    // 1. Resolve the code owner (Referrer). No owner → invalid/unknown code:
    //    noop, no record created (Req 4.6, 8.6).
    const { data: owner, error: ownerError } = await client
      .from("users_memory")
      .select("user_id, created_at, message_count")
      .eq("referral_code", referrerCode)
      .maybeSingle();
    if (ownerError) {
      console.error("[referral] attributeReferral owner lookup error:", ownerError);
      return { result: "noop" };
    }
    if (!owner?.user_id) {
      return { result: "noop" };
    }

    // 2. Self-referral guard (Req 4.2, 7.6, 8.1): record a rejected row and
    //    never create a pending referral.
    if (owner.user_id === referredUserId) {
      const { error: rejectError } = await client.from("referrals").insert({
        referrer_user_id: owner.user_id,
        referred_user_id: referredUserId,
        referral_code: referrerCode,
        status: "rejected",
        rejected_reason: "self_referral",
      });
      if (rejectError) {
        // A row already exists for this referred user (e.g. a prior attempt) →
        // the one-per-referred association is already settled (Req 4.3, 8.2).
        if (rejectError.code === "23505") {
          return { result: "exists" };
        }
        console.error("[referral] attributeReferral self-referral insert error:", rejectError);
        return { result: "noop" };
      }
      return { result: "rejected", reason: "self_referral" };
    }

    // 3. Pre-existing-user guard (Req 4.5, 8.5): defense-in-depth — if the
    //    referred user already started chatting (message_count > 0) before
    //    attribution, do not attribute.
    const { data: referred, error: referredError } = await client
      .from("users_memory")
      .select("message_count")
      .eq("user_id", referredUserId)
      .maybeSingle();
    if (referredError) {
      console.error("[referral] attributeReferral referred lookup error:", referredError);
      return { result: "noop" };
    }
    if (typeof referred?.message_count === "number" && referred.message_count > 0) {
      return { result: "rejected", reason: "pre_existing_user" };
    }

    // 4. Create the pending referral. Rely on UNIQUE(referred_user_id) for the
    //    one-per-referred guard + concurrent-loser handling (Req 4.3, 4.4, 4.7,
    //    8.2, 8.3).
    const { data: inserted, error: insertError } = await client
      .from("referrals")
      .insert({
        referrer_user_id: owner.user_id,
        referred_user_id: referredUserId,
        referral_code: referrerCode,
        status: "pending",
      })
      .select("*")
      .maybeSingle();
    if (insertError) {
      // Already attributed / concurrent loser → leave the existing row
      // unchanged and report it exists.
      if (insertError.code === "23505") {
        return { result: "exists" };
      }
      console.error("[referral] attributeReferral insert error:", insertError);
      return { result: "noop" };
    }
    if (!inserted) {
      // Insert reported no row (unexpected) → fail closed (Req 4.8).
      console.error("[referral] attributeReferral: insert returned no row");
      return { result: "noop" };
    }

    return { result: "created", referral: inserted as ReferralRow };
  } catch (e) {
    console.error("[referral] attributeReferral threw:", e);
    return { result: "noop" };
  }
}

/**
 * Atomic, status-guarded qualification + credit for referredUserId's pending
 * referral. Credits at most once. Returns the credited referral or null (no
 * credit) on no-op or error.
 */
export async function qualifyAndCreditReferral(
  referredUserId: string,
): Promise<ReferralRow | null> {
  // Unresolved/empty identity → never credit (Req 5.8).
  if (typeof referredUserId !== "string" || referredUserId.length === 0) {
    return null;
  }

  try {
    const client = getClient();
    if (!client) return null;

    // 1. Best-effort read of the referred user's current message_count to
    //    record at qualification (Req 5.6). A failure here is non-fatal: we
    //    fall back to null and still attempt the atomic transition.
    let messageCountAtQualification: number | null = null;
    const { data: referred, error: referredError } = await client
      .from("users_memory")
      .select("message_count")
      .eq("user_id", referredUserId)
      .maybeSingle();
    if (referredError) {
      console.error(
        "[referral] qualifyAndCreditReferral message_count lookup error:",
        referredError,
      );
    } else if (typeof referred?.message_count === "number") {
      messageCountAtQualification = referred.message_count;
    }

    // 2. Status-guarded atomic transition — the credit-once gate (Req 5.5,
    //    8.4, 8.8). Mirrors markPaymentVerifiedAtomic: only a row still in
    //    'pending' transitions; a concurrent/repeated attempt finds no
    //    pending row and returns null (idempotent no-op, no crediting).
    const { data: referral, error: updateError } = await client
      .from("referrals")
      .update({
        status: "qualified",
        qualified_at: new Date().toISOString(),
        referred_message_count_at_qualification: messageCountAtQualification,
      })
      .eq("referred_user_id", referredUserId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (updateError) {
      console.error(
        "[referral] qualifyAndCreditReferral transition error:",
        updateError,
      );
      return null;
    }
    // No row transitioned → already qualified or absent → idempotent no-op.
    if (!referral) {
      return null;
    }

    const credited = referral as ReferralRow;

    // 3a. Record the reward transaction. UNIQUE(related_referral_id) is the
    //     second idempotency guard: a 23505 means this referral was already
    //     credited → return null without re-crediting (Req 5.5, 6.7, 8.4).
    const { error: txError } = await client.from("reward_transactions").insert({
      user_id: credited.referrer_user_id,
      type: "referral_voice_reward",
      amount_seconds: credited.reward_seconds,
      related_referral_id: credited.id,
    });
    if (txError) {
      if (txError.code === "23505") {
        // Already credited for this referral → do not double-credit.
        return null;
      }
      // Could not record the transaction → do not apply partial credit
      // (Req 5.8, 10.6). The transition row remains; a retry is safe because
      // the unique constraint prevents double-application.
      console.error(
        "[referral] qualifyAndCreditReferral reward_transactions insert error:",
        txError,
      );
      return null;
    }

    // 3b. Credit the Referrer's wallet by exactly reward_seconds via the
    //     atomic, row-locked RPC (additive, clamped) (Req 5.3, 10.1–10.4).
    //     Reuses the EXISTING credit_voice_seconds(p_user_id, p_seconds) RPC
    //     defined in docs/subscriptions-rpcs.sql — the same RPC
    //     /api/wallet/verify uses. The parameter name is p_seconds (not
    //     p_amount); Postgres rejects parameter renames on existing functions.
    const { error: creditError } = await client.rpc("credit_voice_seconds", {
      p_user_id: credited.referrer_user_id,
      p_seconds: credited.reward_seconds,
    });
    if (creditError) {
      // The transaction row was recorded but the wallet credit failed. Do not
      // claim success; the recorded transaction + unique constraint make a
      // retried credit non-double-applying (Req 5.8, 10.6).
      console.error(
        "[referral] qualifyAndCreditReferral credit_voice_seconds RPC error:",
        creditError,
      );
      return null;
    }

    // 3d. Full success → return the qualified referral row.
    return credited;
  } catch (e) {
    console.error("[referral] qualifyAndCreditReferral threw:", e);
    return null;
  }
}

/**
 * Server-computed stats for the Referrer userId. Returns null on error (the
 * route surfaces an error indication; no partial values).
 */
export async function getReferralStats(
  userId: string,
): Promise<ReferralStats | null> {
  // Unresolved/empty identity → error indication, no partial values (Req 9.4).
  if (typeof userId !== "string" || userId.length === 0) {
    console.error("[referral] getReferralStats: empty userId");
    return null;
  }

  try {
    const client = getClient();
    if (!client) return null;

    // totalInvited — count of all of this Referrer's referrals (every status,
    // so the founder sees full attribution). count:exact + head:true avoids
    // transferring rows (Req 9.1).
    const { count: totalCount, error: totalError } = await client
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_user_id", userId);
    if (totalError) {
      console.error("[referral] getReferralStats total count error:", totalError);
      return null;
    }

    // pending — referrals still awaiting the Referred_User's 3rd message.
    const { count: pendingCount, error: pendingError } = await client
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_user_id", userId)
      .eq("status", "pending");
    if (pendingError) {
      console.error("[referral] getReferralStats pending count error:", pendingError);
      return null;
    }

    // successful — qualified referrals (Req 9.3).
    const { count: successfulCount, error: successfulError } = await client
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_user_id", userId)
      .eq("status", "qualified");
    if (successfulError) {
      console.error("[referral] getReferralStats successful count error:", successfulError);
      return null;
    }

    // voiceMinutesEarned — sum the actual credited reward seconds for accuracy,
    // then floor to whole minutes (Req 7.10, 9.4). Summing reward_transactions
    // rather than deriving from successful*120 reflects exactly what was credited.
    const { data: rewardRows, error: rewardError } = await client
      .from("reward_transactions")
      .select("amount_seconds")
      .eq("user_id", userId)
      .eq("type", "referral_voice_reward");
    if (rewardError) {
      console.error("[referral] getReferralStats reward sum error:", rewardError);
      return null;
    }
    const earnedSeconds = (rewardRows ?? []).reduce(
      (sum, row) =>
        sum +
        (typeof row?.amount_seconds === "number" ? row.amount_seconds : 0),
      0,
    );

    return {
      totalInvited: totalCount ?? 0,
      pending: pendingCount ?? 0,
      successful: successfulCount ?? 0,
      voiceMinutesEarned: Math.floor(earnedSeconds / 60),
    };
  } catch (e) {
    console.error("[referral] getReferralStats threw:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Test-only seams (NOT used by production code paths).
//
// These let unit/property tests inject a fake Supabase client in place of the
// module-local cached service-role client, so tests never touch a real DB.
// `getClient()` returns `cachedClient` when set, so `__setTestClient` fully
// overrides client resolution. Production code never calls these.
// ---------------------------------------------------------------------------

/** Test-only: override the module-local cached client with a fake. */
export function __setTestClient(client: unknown): void {
  cachedClient = client as SupabaseClient | null;
}

/** Test-only: clear any injected fake client, restoring lazy resolution. */
export function __resetTestClient(): void {
  cachedClient = null;
}
