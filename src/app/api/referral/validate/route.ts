import { NextResponse } from "next/server";
import { validateReferralCode } from "@/lib/referral";

// Referral Reward System — optional read-only code validation (Req 7.3, 7.4, 3.5).
//
// Intentionally simple and safe: always responds 200 with { valid: boolean }.
// An unparseable body or a missing/empty code is treated as invalid rather than
// an error — this endpoint must never 500, since a failed validation should
// silently degrade to "invalid" and never block the referred user's flow.
// Read-only: validateReferralCode does NOT create or modify any record, so no
// user cookie/identity is required here.
export async function POST(req: Request) {
  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    // Unparseable body → invalid, never 500.
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  // Only a non-empty string can be a candidate code (Req 7.4).
  if (typeof body.code !== "string" || body.code.length === 0) {
    return NextResponse.json({ valid: false });
  }

  const valid = await validateReferralCode(body.code);
  return NextResponse.json({ valid });
}
