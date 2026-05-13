import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteUserData } from "@/lib/supabase";

const USER_COOKIE = "god_messenger_uid";

// Phase 8 pre-launch — DPDP-compliant account deletion endpoint. Removes
// chat_logs + safety_events + users_memory rows for the cookie-identified
// user, then clears the cookie in the response so subsequent requests
// start with a fresh identity. Service-role Supabase client (server-only).
//
// Intentionally NOT deleted (per Indian financial law + audit invariants):
//   - payments table: retained per Income Tax Act + RBI reconciliation
//     requirements, typically 7+ years.
//   - webhook_events table: payment-audit + idempotency; deletion would
//     break Razorpay refund reconciliation.
//
// Disclosed to the user in /privacy and on the /settings danger-zone copy.
export async function POST() {
  try {
    const jar = await cookies();
    const userId = jar.get(USER_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json(
        { error: "no_session" },
        { status: 401 },
      );
    }

    await deleteUserData(userId);

    const res = NextResponse.json({ ok: true }, { status: 200 });
    // Clear the identity cookie. Same security flags as the cookie set
    // in /api/chat (httpOnly, sameSite=lax, secure in prod) so it
    // overrides the existing cookie cleanly rather than leaving stale
    // state in the browser jar.
    res.cookies.set(USER_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
      path: "/",
    });

    return res;
  } catch (e) {
    console.error("[delete-account] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
