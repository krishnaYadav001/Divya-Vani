import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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
    return NextResponse.json({ error: "referral_unavailable" }, { status: 503 });
  }

  // Shareable invite link off the canonical brand origin (Req 7.1, 7.2).
  const link = `${BRAND.url}?ref=${code}`;

  // Server-computed stats (Req 7.10, 9.1, 9.4). A null return is non-fatal for
  // the link/code: return the identity with stats omitted (null) so the UI can
  // surface a stats-only error while the link stays usable.
  const stats: ReferralStats | null = await getReferralStats(userId);

  return NextResponse.json({ code, link, stats });
}
