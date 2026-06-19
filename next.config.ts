import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// =============================================================================
// Security headers (defense-in-depth hardening).
// =============================================================================
// Static headers are ENFORCED immediately (low risk, no script breakage).
// The Content-Security-Policy is shipped in REPORT-ONLY mode for now: it does
// NOT block anything, it only reports violations (visible in the browser
// console / Sentry). This lets us observe what the real third-party script set
// (Razorpay, ElevenLabs, Google Ads/gtag, Sentry, Plausible, Vercel Analytics,
// Microsoft Clarity, Supabase, Sarvam) actually needs before flipping to an
// ENFORCED CSP in a later pass. Do NOT rename this to `Content-Security-Policy`
// (enforcing) until the report stream is clean — that would risk breaking
// payments/voice/analytics.
//
// 'unsafe-inline' on script-src is required for now because layout.tsx emits
// inline JSON-LD + inline gtag/plausible/clarity bootstraps. Tightening to
// nonces/hashes is a follow-up, not part of this low-risk pass.
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://www.googletagmanager.com https://www.google-analytics.com https://plausible.io https://www.clarity.ms https://*.sentry.io https://va.vercel-scripts.com https://*.elevenlabs.io",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://api.sarvam.ai https://*.supabase.co https://*.sentry.io https://plausible.io https://www.google-analytics.com https://www.clarity.ms https://*.elevenlabs.io wss://*.elevenlabs.io https://va.vercel-scripts.com",
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://*.elevenlabs.io https://www.youtube.com https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  // Force HTTPS for two years incl. subdomains. The site is HTTPS-only on
  // Vercel + the custom domain, so this is safe.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Stop MIME-type sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Clickjacking protection (legacy header; CSP frame-ancestors is the modern
  // equivalent and is also set in the report-only CSP above).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Trim referrer leakage to other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Lock down powerful features. Microphone is intentionally allowed on 'self'
  // for the voice-input (STT) + voice-call surfaces.
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), browsing-topics=(), microphone=(self)",
  },
  // Report-only CSP — observe, do not block (see note above).
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

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
  async headers() {
    return [
      {
        // Apply to every route.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
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
