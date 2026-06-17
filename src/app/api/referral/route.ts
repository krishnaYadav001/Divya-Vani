import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { BRAND } from "@/lib/brand";
import { getOrCreateReferralCode, getReferralStats } from "@/lib/referral";
import type { ReferralStats } from "@/lib/referralTypes";

const USER_COOKIE = "god_messenger_uid";

// Phase — GET /api/referral: returns the caller's stable referral code, the
// shareable invite link, and server-computed stats for the ShareDivyaVani UI.
//
// Server-side only: getOrCreateReferralCode / getReferralStats use the
// service-role lib (src/lib/referral.ts). The client never computes rewards
// and never adds seconds to a wallet.
//
// Requirements: 1.1, 1.2, 1.6, 7.1, 7.2, 7.10, 9.1, 9.4.
export async function GET(_req: Request) {
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value;

  // No identity on the request → error indication; never generate a code
  // (Req 1.9). The share UI surfaces this as an error.
  if (!userId) {
    return NextResponse.json(
      { error: "no user identity on this request" },
      { status: 400 },
    );
  }

  // Stable, generated-on-first-request code (Req 1.1, 1.2, 1.6). Fail closed:
  // a null return means unresolved identity or persistent failure, so the
  // share UI shows an error indication rather than a guessed code.
  const code = await getOrCreateReferralCode(userId);
  if (!code) {
    // TEMP DIAGNOSTIC: getOrCreateReferralCode silent-fails to null and only
    // logs server-side. To pinpoint a production failure without log access,
    // run a direct probe here and surface the real reason in the response.
    // (Safe to remove once the root cause is fixed — it leaks only a schema /
    // permission error string, never user data.)
    const debug = await probeReferralFailure(userId);
    return NextResponse.json(
      { error: "referral_unavailable", debug },
      { status: 503 },
    );
  }

  // Shareable invite link off the canonical brand origin (Req 7.1, 7.2).
  const link = `${BRAND.url}?ref=${code}`;

  // Server-computed stats (Req 7.10, 9.1, 9.4). A null return is non-fatal for
  // the link/code: return the identity with stats omitted (null) so the UI can
  // surface a stats-only error while the link stays usable.
  const stats: ReferralStats | null = await getReferralStats(userId);

  return NextResponse.json({ code, link, stats });
}

// TEMP DIAGNOSTIC helper — runs the same queries getOrCreateReferralCode does,
// but returns the raw error so the Network tab reveals the true cause
// (missing env, missing column/table, RLS/permission, etc.). Remove later.
async function probeReferralFailure(userId: string): Promise<Record<string, unknown>> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { stage: "env", hasUrl: !!url, hasKey: !!key };
  }
  try {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const sel = await client
      .from("users_memory")
      .select("referral_code")
      .eq("user_id", userId)
      .maybeSingle();
    if (sel.error) {
      return { stage: "select", message: sel.error.message, code: sel.error.code };
    }
    const up = await client
      .from("users_memory")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
    if (up.error) {
      return { stage: "upsert", message: up.error.message, code: up.error.code };
    }
    const upd = await client
      .from("users_memory")
      .update({ referral_code: "DBGPROBE" })
      .eq("user_id", userId)
      .is("referral_code", null)
      .select("referral_code")
      .maybeSingle();
    if (upd.error) {
      return { stage: "update", message: upd.error.message, code: upd.error.code };
    }
    return {
      stage: "ok-no-error",
      note: "queries succeeded in probe; race or stale build likely",
      updatedRow: upd.data ?? null,
    };
  } catch (e) {
    return { stage: "threw", message: e instanceof Error ? e.message : String(e) };
  }
}
