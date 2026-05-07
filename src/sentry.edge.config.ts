// Sentry SDK init for Next.js edge runtime (middleware, edge API routes).
// Imported by src/instrumentation.ts when NEXT_RUNTIME === 'edge'.
// Divya Vani currently has zero edge-runtime routes — this file is
// future-proofing so adding middleware.ts later doesn't silently lose
// error visibility. Same errors-only config as the server.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
