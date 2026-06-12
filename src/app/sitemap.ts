import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { absoluteUrl, PUBLIC_ROUTES, SITE_LAST_MODIFIED } from "@/lib/seo";

// Next metadata-route convention: default export is served at /sitemap.xml.
// Static entries come from PUBLIC_ROUTES so noindex/private pages cannot drift
// into the sitemap. Verse entries are appended when Supabase is available.

function getSitemapClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: route.lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  // Dynamic verse entries from the verses table. Silent-fail on error per the
  // project ops invariant; static pages still remain crawlable.
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
            url: absoluteUrl(`/verse/${verse.id}`),
            lastModified: verse.created_at
              ? new Date(verse.created_at)
              : SITE_LAST_MODIFIED,
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
