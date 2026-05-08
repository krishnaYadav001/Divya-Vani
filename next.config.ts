import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Phase 6.9.2 — opt into AVIF (modern Chrome / Firefox / Safari 16.1+).
  // ~30-50% smaller than WebP at the same visual quality. Older browsers
  // automatically fall back to WebP, then PNG. The order here is the
  // negotiation priority: AVIF first, WebP as fallback. Affects every
  // image served via next/image, including the peacock-feather PNG that
  // dominates the chat page header.
  images: {
    formats: ["image/avif", "image/webp"],
  },
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
