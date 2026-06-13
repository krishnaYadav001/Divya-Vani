import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import {
  absoluteUrl,
  jsonLdScript,
  RSS_ALTERNATE,
  SITE_LAST_MODIFIED,
} from "@/lib/seo";
import demoContent from "../../../data/demo-content.json";
import DemoClient, { type DemoContent } from "./DemoClient";

const description = `See ${BRAND.name.en} in action: scripture-backed Krishna AI chat and voice examples, video walkthroughs, and screenshots.`;

export const metadata: Metadata = {
  title: `${BRAND.name.en} Demo — See Krishna AI Chat & Voice Examples`,
  description,
  alternates: { canonical: "/demo", types: RSS_ALTERNATE },
  openGraph: {
    url: absoluteUrl("/demo"),
    title: `${BRAND.name.en} Demo — See Krishna AI Chat & Voice Examples`,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name.en} Demo — See Krishna AI Chat & Voice Examples`,
    description,
  },
  robots: { index: true, follow: true },
};

const content = demoContent as DemoContent;

function buildDemoJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Demo Conversations | ${BRAND.name.en}`,
    url: absoluteUrl("/demo"),
    description,
    dateModified: SITE_LAST_MODIFIED,
    isPartOf: {
      "@type": "WebSite",
      name: BRAND.name.en,
      url: BRAND.url,
    },
    mainEntity: {
      "@type": "ItemList",
      name: "Divya Vani demo content",
      itemListElement: [
        ...content.videos.map((video, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "VideoObject",
            name: video.title_en,
            description: `Demo video for ${BRAND.name.en}: ${video.title_en}`,
            embedUrl: `https://www.youtube.com/embed/${video.id}`,
            url: `https://www.youtube.com/watch?v=${video.id}`,
          },
        })),
        ...content.examples.map((example, index) => ({
          "@type": "ListItem",
          position: content.videos.length + index + 1,
          item: {
            "@type": "Question",
            name: example.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: example.reply,
            },
          },
        })),
      ],
    },
  };
}

export default function DemoPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(buildDemoJsonLd())}
      />
      <DemoClient content={content} />
    </>
  );
}
