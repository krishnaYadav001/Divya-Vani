import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { attributeReferral } from "@/lib/referral";

const USER_COOKIE = "god_messenger_uid";

// TEMP DIAGNOSTIC — reports why referral attribution would or would not happen
// for the CURRENT cookie identity given a ?ref=CODE.
//
//   /api/referral/debug?ref=CODE          → DRY RUN (read-only verdict)
//   /api/referral/debug?ref=CODE&write=1  → actually calls attributeReferral
//                                            and returns its real outcome
//
// The &write=1 mode removes every client-side variable (localStorage, the chat
// POST body, cookie timing) and tests the attribution LOGIC directly against
// the live DB. Open it on the REFERRED browser (the invitee's cookie).
// Remove this route once the root cause is fixed.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref");
  const doWrite = url.searchParams.get("write") === "1";

  const jar = await cookies();
  const cookieUserId = jar.get(USER_COOKIE)?.value ?? null;

  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaKey) {
    return NextResponse.json({ stage: "env", hasUrl: !!supaUrl, hasKey: !!supaKey });
  }
  const client = createClient(supaUrl, supaKey, { auth: { persistSession: false } });

  type MyRow = { user_id: string; message_count: number | null; referral_code: string | null };
  type OwnerRow = { user_id: string; message_count: number | null };

  // Current user's state (the prospective REFERRED user).
  let myRow: MyRow | null = null;
  if (cookieUserId) {
    const { data } = await client
      .from("users_memory")
      .select("user_id, message_count, referral_code")
      .eq("user_id", cookieUserId)
      .maybeSingle();
    myRow = (data as unknown as MyRow | null) ?? null;
  }

  // Resolve the ref code to its owner (the prospective REFERRER).
  let owner: OwnerRow | null = null;
  if (ref) {
    const { data } = await client
      .from("users_memory")
      .select("user_id, message_count")
      .eq("referral_code", ref)
      .maybeSingle();
    owner = (data as unknown as OwnerRow | null) ?? null;
  }

  // Any existing referral row for this referred user?
  let existingReferral: unknown = null;
  if (cookieUserId) {
    const { data } = await client
      .from("referrals")
      .select("status, referrer_user_id, referral_code, rejected_reason, created_at")
      .eq("referred_user_id", cookieUserId)
      .maybeSingle();
    existingReferral = data ?? null;
  }

  // What WOULD attribution decide right now (dry run, no write)?
  let verdict: string;
  if (!cookieUserId) verdict = "NO_COOKIE — attribution cannot run (no identity on this request)";
  else if (!ref) verdict = "NO_REF — open this URL with ?ref=CODE to test a specific code";
  else if (!owner) verdict = "UNKNOWN_CODE — ref does not map to any user → attributeReferral returns noop, no row";
  else if (owner.user_id === cookieUserId) verdict = "SELF_REFERRAL — owner is the same user → rejected, no pending row";
  else if (existingReferral) verdict = "ALREADY_ATTRIBUTED — a referral row already exists for this referred user";
  else if (typeof myRow?.message_count === "number" && myRow.message_count > 0)
    verdict = `PRE_EXISTING_USER — this user already chatted (message_count=${myRow.message_count}) → rejected, no pending row`;
  else verdict = "WOULD_CREATE_PENDING — a fresh, eligible referral would be created on the next chat message carrying this ref";

  // &write=1 → actually run the real attributeReferral and report its outcome.
  let writeOutcome: unknown = null;
  if (doWrite && cookieUserId && ref) {
    try {
      writeOutcome = await attributeReferral({
        referrerCode: ref,
        referredUserId: cookieUserId,
      });
    } catch (e) {
      writeOutcome = { threw: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({
    cookieUserId,
    refParam: ref,
    me: myRow,
    owner,
    existingReferral,
    verdict,
    writeOutcome,
  });
}
