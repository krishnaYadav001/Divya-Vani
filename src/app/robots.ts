import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// Phase 6.9.1 — Next 16 metadata-route convention. Default-export
// from src/app/robots.ts is auto-served at /robots.txt.
//
// Disallow rationale:
//   /design-system — internal reference page, noindex per Phase 6.6 C-1
//   /api/          — server endpoints, non-content
//   /monitoring/   — Sentry tunnel route from Phase 6.3; no need for
//                    crawlers to hit error-ingest endpoints
//   /settings      — private user settings page, not public content
//
// AEO/GEO — explicit Allow rules for 9 AI crawlers per the improve-aeo-geo
// skill (Priority 1 blocker: if AI bots are blocked, nothing else matters).
// Each bot gets its own rule block so robots.txt parsers that match
// specific user-agent strings before the wildcard see an explicit Allow.

const AI_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
  "OAI-SearchBot",
  "anthropic-ai",
  "ChatGPT-User",
  "Bytespider",
  "CCBot",
] as const;

export default function robots(): MetadataRoute.Robots {
  const host = new URL(BRAND.url).host;

  return {
    rules: [
      // Default rule for all crawlers
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/design-system", "/api/", "/monitoring/", "/settings"],
      },
      // Explicit per-bot rules for AI engines — ensures no accidental
      // blocking even if a future wildcard change adds restrictions.
      ...AI_BOTS.map((bot) => ({
        userAgent: bot,
        allow: ["/", "/verse/"],
        disallow: ["/api/", "/monitoring/", "/settings"],
      })),
    ],
    sitemap: `${BRAND.url}/sitemap.xml`,
    host,
  };
}
