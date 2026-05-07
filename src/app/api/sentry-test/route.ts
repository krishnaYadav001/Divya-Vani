// Test endpoint for verifying Sentry error capture in production.
// Hit this URL: https://<deploy>/api/sentry-test
// Expected: 500 response, error appears in Sentry dashboard within ~30s.
// SAFE to keep in repo — does not affect any chat or seva functionality.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  throw new Error(
    "[Phase 6.3 Sentry test] If you see this in Sentry dashboard, error capture is working correctly. Triggered intentionally — safe to ignore.",
  );
  // Unreachable, satisfies TS:
  return NextResponse.json({ ok: true });
}
