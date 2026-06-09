import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { BRAND } from "@/lib/brand";

// Phase 6.9.1 — Next 16 metadata-route convention. Default-export
// from src/app/sitemap.ts is auto-served at /sitemap.xml.
//
// AEO/GEO — sitemap is now async: queries the verses table for all
// 3,132 verse IDs and generates a canonical /verse/{id} entry for each.
// Static pages are always included; verse entries are added when the
// Supabase query succeeds. Silent-fail on error per ops invariant.

function getSitemapClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  // Static pages — always included regardless of Supabase status.
  const staticEntries: MetadataRoute.Sitemap = [
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
      // Phase 10.5 — voice-to-voice mode (paid seva; orb UI).
      url: `${BRAND.url}/voice`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BRAND.url}/demo`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${BRAND.url}/pricing`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BRAND.url}/contact`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${BRAND.url}/journey`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
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
    {
      url: `${BRAND.url}/refund`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  // Dynamic verse entries — fetched from the verses table.
  // Silent-fail: if Supabase is unavailable, only static entries are returned.
  let verseEntries: MetadataRoute.Sitemap = [];
  try {
    const client = getSitemapClient();
    if (client) {
      const { data, error } = await client
        .from("verses")
        .select("id, created_at");
      if (error) {
        console.error("[sitemap] verses query error:", error);
      } else if (data) {
        verseEntries = data.map(
          (verse: { id: string; created_at: string }) => ({
            url: `${BRAND.url}/verse/${verse.id}`,
            lastModified: verse.created_at
              ? new Date(verse.created_at)
              : lastModified,
            changeFrequency: "yearly" as const,
            priority: 0.6,
          }),
        );
      }
    }
  } catch (e) {
    console.error("[sitemap] verses fetch threw:", e);
  }

  return [...staticEntries, ...verseEntries];
}

