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

// flush(2000) is required on Vercel: the serverless lambda freezes its
// execution context as soon as the request handler returns, which strands
// the queued event in the SDK's outbound buffer. Without flush, only the
// first event after a cold start makes it to Sentry — every subsequent
// event is dropped on freeze. 2s is conservative (typical drain is
// 100-300ms) and well under Vercel's 10s default function timeout.
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
  await Sentry.flush(2000);
};
