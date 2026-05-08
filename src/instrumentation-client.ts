// Next.js client-side instrumentation hook (Next 15+ replacement for
// the legacy sentry.client.config.ts). Loaded once per page in the
// browser bundle. Errors-only — Replay/Performance/Profiling all off
// at sample rate 0 to minimize quota use and bundle size.

import * as Sentry from "@sentry/nextjs";

// Phase 6.9.2 — explicit defaultIntegrations: false + minimal error-capture
// integration list. Sentry's default set otherwise pulls in Replay,
// browserTracing, and Profiling code paths even though our sample rates
// are 0 — pruning them shrinks the client bundle and reduces the
// Phase 6.6 audit's bootup-time cost. The 6 integrations below are
// the minimum needed to receive useful errors:
//   - breadcrumbs       — UI/network breadcrumbs attached to errors
//   - dedupe            — drop duplicate errors (browser fires the same
//                          error multiple times for cross-frame scripts)
//   - functionToString  — preserve fn names through transports/wrappers
//   - globalHandlers    — capture window.onerror + unhandledrejection
//   - httpContext       — attach request context (URL, UA) to events
//   - linkedErrors      — walk Error.cause chains so wrapped errors
//                          show the full stack
// Notably ABSENT (intentional opt-out):
//   - replayIntegration         (Session Replay)
//   - browserTracingIntegration (Performance Monitoring)
//   - browserProfilingIntegration (Profiling)
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,
  defaultIntegrations: false,
  integrations: [
    Sentry.breadcrumbsIntegration(),
    Sentry.dedupeIntegration(),
    Sentry.functionToStringIntegration(),
    Sentry.globalHandlersIntegration(),
    Sentry.httpContextIntegration(),
    Sentry.linkedErrorsIntegration(),
  ],
});

// Required by Sentry's App Router instrumentation to track navigation
// events as breadcrumbs. Zero perf cost (traces are off); just enriches
// any later error with the route the user was on when it fired.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
