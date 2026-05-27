// Phase 10.1 — Voice paywall check.
//
// FOUNDER DECISION (v1): voice is available to anyone who has EVER
// completed a paid seva — i.e., has at least one `payments` row with
// status = 'verified'. Phase 9 (Krishna Plus subscription) may tighten
// this to "active subscription / remaining pool" later.
//
// IMPORTANT SCHEMA NOTE: the spec referenced a `users_memory.message_pool`
// / `total_paid_messages_purchased` field as the paid signal. Neither
// exists in the live schema (see .claude/rules/schema.md). users_memory
// has only `seva_balance` — the *remaining* purchased-message count,
// which drops back to 0 once a paying user spends their messages and would
// therefore WRONGLY deny voice to someone who has paid. The lifetime
// "ever paid" signal is the `payments` table. The spec anticipated this
// ("if unsure, count Razorpay-credited purchases via existing logic"),
// so this check counts verified payments. Surfaced in the CC report for
// founder override.
//
// Fail-closed: any DB error → denied. Voice degrades to text-only on the
// frontend, so a rare DB blip costs a missed voice play, never free voice.

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

// Phase 9 — voice is allowed when ANY of these hold (checked in parallel):
//   • active subscription with voice pool remaining (voice_seconds_used <
//     voice_minutes_pool*60), OR
//   • a one-time wallet balance (users_memory.voice_seconds_balance > 0), OR
//   • legacy: at least one verified seva payment (kept so existing voice users
//     are NOT regressed; metering simply has nothing to debit for them).
// Each check fails closed independently — a DB blip on one branch never grants
// free voice, it just removes that branch from consideration.
export async function hasVoiceAccess(userId: string): Promise<VoiceAccess> {
  const db = getDb();
  if (!db) return { allowed: false, reason: "db_unavailable" };

  const subCheck = (async (): Promise<boolean> => {
    try {
      const { data, error } = await db
        .from("subscriptions")
        .select("voice_minutes_pool, voice_seconds_used")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (error || !data) return false;
      return data.voice_seconds_used < data.voice_minutes_pool * 60;
    } catch {
      return false;
    }
  })();

  const walletCheck = (async (): Promise<boolean> => {
    try {
      const { data, error } = await db
        .from("users_memory")
        .select("voice_seconds_balance")
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !data) return false;
      return (data.voice_seconds_balance ?? 0) > 0;
    } catch {
      return false;
    }
  })();

  const legacyCheck = (async (): Promise<boolean> => {
    try {
      const { count, error } = await db
        .from("payments")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "verified");
      if (error) return false;
      return (count ?? 0) > 0;
    } catch {
      return false;
    }
  })();

  try {
    const [hasSub, hasWallet, hasLegacy] = await Promise.all([
      subCheck,
      walletCheck,
      legacyCheck,
    ]);
    if (hasSub) return { allowed: true, reason: "subscription" };
    if (hasWallet) return { allowed: true, reason: "wallet" };
    if (hasLegacy) return { allowed: true, reason: "seva_legacy" };
    return { allowed: false, reason: "payment_required" };
  } catch (e) {
    console.error("[voiceAccess] hasVoiceAccess threw:", e);
    return { allowed: false, reason: "db_error" };
  }
}
