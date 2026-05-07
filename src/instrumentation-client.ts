// Next.js client-side instrumentation hook (Next 15+ replacement for
// the legacy sentry.client.config.ts). Loaded once per page in the
// browser bundle. Errors-only — Replay/Performance/Profiling all off
// at sample rate 0 to minimize quota use and bundle size.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,
});

// Required by Sentry's App Router instrumentation to track navigation
// events as breadcrumbs. Zero perf cost (traces are off); just enriches
// any later error with the route the user was on when it fired.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
