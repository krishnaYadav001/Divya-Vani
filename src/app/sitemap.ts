import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// Phase 6.9.1 — Next 16 metadata-route convention. Default-export
// from src/app/sitemap.ts is auto-served at /sitemap.xml. Only the
// four user-facing routes are listed; /design-system is noindex
// (Phase 6.6 stage C-1) and /api/* is non-content. Sitemap is
// regenerated on each build, so lastModified reflects deploy time.

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: BRAND.url,
      lastModified,
      changeFrequency: "monthly",
      priority: 1.0,
    },
    {
      url: `${BRAND.url}/chat`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BRAND.url}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BRAND.url}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
