// Next.js server-side instrumentation hook (App Router, Next 15+).
// register() runs once per server start; onRequestError catches errors
// thrown during React Server Component rendering that wouldn't otherwise
// reach Sentry through the API-route try/catch path.

import { type Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
};
