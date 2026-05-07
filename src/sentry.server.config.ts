// Sentry SDK init for Next.js nodejs runtime (server-side API routes,
// React Server Components). Imported by src/instrumentation.ts when
// NEXT_RUNTIME === 'nodejs'. Errors-only — no Performance, no Replay,
// no Profiling — to keep quota predictable and bundle small.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
