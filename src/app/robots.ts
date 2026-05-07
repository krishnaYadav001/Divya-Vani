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

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/design-system", "/api/", "/monitoring/"],
      },
    ],
    sitemap: `${BRAND.url}/sitemap.xml`,
    host: BRAND.url,
  };
}
