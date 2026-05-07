import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  org: "innovita",
  project: "javascript-nextjs",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: process.env.NODE_ENV !== "production",
  widenClientFileUpload: true,
  // Modern replacement for hideSourceMaps: deletes .map files from the
  // build output after Sentry has received them, so browsers can't fetch
  // them from public/_next/static/. Sentry still has the maps for stack
  // trace symbolication.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  // Tunnel /monitoring → Sentry so adblockers (uBlock, Brave shields)
  // that block *.sentry.io don't drop our error envelopes.
  tunnelRoute: "/monitoring",
  // disableLogger and automaticVercelMonitors are intentionally omitted:
  // both options are deprecated in v10.51 AND not supported with Turbopack.
  // Turbopack's own treeshaking handles the disableLogger intent; Sentry
  // Cron monitors require webpack instrumentation Turbopack doesn't have,
  // so automaticVercelMonitors would be a no-op regardless.
});
