// Test endpoint for verifying Sentry error capture.
//
// In production this is GATED behind a secret so it can't be triggered freely
// (an always-on 500 generator is noise + a minor abuse surface). To use it in
// prod, set SENTRY_TEST_SECRET in Vercel env and call:
//   GET /api/sentry-test?secret=<SENTRY_TEST_SECRET>
// Outside production (dev/preview without the var) it throws unconditionally so
// local verification still works.
//
// SAFE to keep in repo — does not affect any chat or seva functionality.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.SENTRY_TEST_SECRET;
  if (process.env.NODE_ENV === "production") {
    // In production, require the secret. Without it, this route is a no-op 404
    // rather than an open error generator.
    const provided = new URL(req.url).searchParams.get("secret");
    if (!secret || provided !== secret) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  throw new Error(
    "[Phase 6.3 Sentry test] If you see this in Sentry dashboard, error capture is working correctly. Triggered intentionally — safe to ignore.",
  );
}
