// Sentry SDK init for Next.js nodejs runtime (server-side API routes,
// React Server Components). Imported by src/instrumentation.ts when
// NEXT_RUNTIME === 'nodejs'. Errors-only — no Performance, no Replay,
// no Profiling — to keep quota predictable and bundle small.

import * as Sentry from "@sentry/nextjs";

// Phase 6.9.2 — explicit defaultIntegrations: false + minimal error-capture
// integration list, parallel to the client-side prune in
// instrumentation-client.ts. The Node defaults pull in performance
// instrumentation for many libraries (express, mongo, postgres, etc.)
// even though our tracesSampleRate is 0; opt out and keep only what's
// needed for error capture:
//   - dedupe                       — drop duplicate exceptions
//   - functionToString             — preserve fn names through wrappers
//   - inboundFilters               — drop noise (e.g. /healthz spam)
//   - linkedErrors                 — walk Error.cause chains
//   - onUncaughtException          — process-level uncaught exceptions
//   - onUnhandledRejection         — process-level promise rejections
//   - contextLines                 — source-code context around errors
//   - requestData                  — attach safe request data to events
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  defaultIntegrations: false,
  integrations: [
    Sentry.dedupeIntegration(),
    Sentry.functionToStringIntegration(),
    Sentry.inboundFiltersIntegration(),
    Sentry.linkedErrorsIntegration(),
    Sentry.onUncaughtExceptionIntegration(),
    Sentry.onUnhandledRejectionIntegration(),
    Sentry.contextLinesIntegration(),
    Sentry.requestDataIntegration(),
  ],
});
