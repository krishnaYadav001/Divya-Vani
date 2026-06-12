// Phase 10.1 / Phase 9 — Voice paywall check.
//
// FOUNDER DECISION (revised 2026-06-12): voice is a PAID-VOICE feature, NOT a
// "ever paid anything" perk. The legacy rule — "anyone with at least one
// verified seva payment gets voice forever" — is REMOVED. It granted unlimited
// voice (≈₹16/min cost, nothing to debit) to any ₹11 seva buyer, an unbounded
// cost leak. Voice now requires a real voice allowance:
//
//   • an ACTIVE subscription whose voice pool still has minutes left, OR
//   • a one-time voice-minute WALLET balance (users_memory.voice_seconds_balance).
//
// A seva-only user (chat credits, no voice plan / wallet) gets NO voice and is
// shown the top-up paywall. Voice is not live-tested yet, so this regresses no
// real user; if a genuine grandfathered voice user ever surfaces, add an
// explicit allowlist here rather than reopening the blanket seva grant.
//
// ENTRY FLOOR (Phase 9 hardening): entry requires at least
// VOICE_MIN_START_SECONDS of COMBINED remaining balance (pool + wallet). Voice
// metering is debited after the fact from the client-reported duration, so a
// balance of "1 second remaining" must NOT buy a full unmetered session — the
// floor bounds that. A user below the floor is sent to top up.
//
// Fail-closed: any DB error → denied. Voice degrades to text-only on the
// frontend, so a rare DB blip costs a missed voice play, never free voice. Each
// balance probe fails closed INDEPENDENTLY (returns 0), so a blip on one branch
// never inflates the combined total.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

function getDb(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[voiceAccess] supabase env vars missing", {
      hasUrl: !!url,
      hasKey: !!key,
    });
    return null;
  }
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

export type VoiceAccess = { allowed: boolean; reason: string };

// Minimum combined remaining voice balance (seconds) needed to START a session.
// Bounds the "a sliver of balance buys a whole session" exposure: a user at or
// below this floor tops up first. Modest so it never blocks a genuine call.
export const VOICE_MIN_START_SECONDS = 60;

/**
 * Remaining voice seconds available to `userId` right now, split by source.
 * Each source is read independently and floored at 0; any error on a source
 * yields 0 for that source (fail-closed) rather than throwing.
 */
async function readVoiceBalances(
  db: SupabaseClient,
  userId: string,
): Promise<{ subRemaining: number; walletRemaining: number }> {
  const subRemaining = (async (): Promise<number> => {
    try {
      const { data, error } = await db
        .from("subscriptions")
        .select("voice_minutes_pool, voice_seconds_used")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (error || !data) return 0;
      return Math.max(0, data.voice_minutes_pool * 60 - data.voice_seconds_used);
    } catch {
      return 0;
    }
  })();

  const walletRemaining = (async (): Promise<number> => {
    try {
      const { data, error } = await db
        .from("users_memory")
        .select("voice_seconds_balance")
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !data) return 0;
      return Math.max(0, data.voice_seconds_balance ?? 0);
    } catch {
      return 0;
    }
  })();

  const [sub, wallet] = await Promise.all([subRemaining, walletRemaining]);
  return { subRemaining: sub, walletRemaining: wallet };
}

// Phase 9 — voice is allowed when the user has at least VOICE_MIN_START_SECONDS
// of combined remaining balance across (active subscription pool + wallet).
export async function hasVoiceAccess(userId: string): Promise<VoiceAccess> {
  const db = getDb();
  if (!db) return { allowed: false, reason: "db_unavailable" };

  try {
    const { subRemaining, walletRemaining } = await readVoiceBalances(db, userId);
    const total = subRemaining + walletRemaining;
    if (total >= VOICE_MIN_START_SECONDS) {
      return {
        allowed: true,
        reason: subRemaining > 0 ? "subscription" : "wallet",
      };
    }
    // Has *some* balance but below the start floor → top-up, not first purchase.
    if (total > 0) return { allowed: false, reason: "insufficient_balance" };
    return { allowed: false, reason: "payment_required" };
  } catch (e) {
    console.error("[voiceAccess] hasVoiceAccess threw:", e);
    return { allowed: false, reason: "db_error" };
  }
}
