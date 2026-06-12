import { BRAND } from "@/lib/brand";
import { absoluteUrl, PUBLIC_ROUTES, SITE_LAST_MODIFIED } from "@/lib/seo";

export const dynamic = "force-static";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function GET() {
  const lastBuildDate = new Date(SITE_LAST_MODIFIED).toUTCString();
  const items = PUBLIC_ROUTES.map((route) => {
    const url = absoluteUrl(route.path);
    return [
      "    <item>",
      `      <title>${escapeXml(route.title)}</title>`,
      `      <link>${escapeXml(url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      `      <description>${escapeXml(route.description)}</description>`,
      `      <pubDate>${new Date(route.lastModified).toUTCString()}</pubDate>`,
      "    </item>",
    ].join("\n");
  }).join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(BRAND.name.en)}</title>`,
    `    <link>${escapeXml(BRAND.url)}</link>`,
    `    <description>${escapeXml(BRAND.description.en)}</description>`,
    "    <language>en-IN</language>",
    `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(`${BRAND.url}/feed.xml`)}" rel="self" type="application/rss+xml" />`,
    items,
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
