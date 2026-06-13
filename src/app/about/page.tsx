import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import {
  absoluteUrl,
  jsonLdScript,
  RSS_ALTERNATE,
  SITE_LAST_MODIFIED,
} from "@/lib/seo";
import AboutClient from "./AboutClient";

// Server shell: page metadata + AboutPage JSON-LD. The trust copy + CTAs live
// in AboutClient ("use client") so they follow the EN/हिन्दी language toggle.

const description =
  "Divya Vani is an AI spiritual companion that lets you chat or speak with Krishna AI, grounded in 3,132 verses from the Bhagavad Gita, Mahabharata, and Bhagavata Purana. Built by Krishna Yadav, a solo founder from India.";

export const metadata: Metadata = {
  title: `About Divya Vani — Krishna AI Spiritual Companion`,
  description,
  alternates: { canonical: "/about", types: RSS_ALTERNATE },
  openGraph: {
    url: absoluteUrl("/about"),
    title: `About Divya Vani — Krishna AI Spiritual Companion`,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: `About Divya Vani — Krishna AI Spiritual Companion`,
    description,
  },
  robots: { index: true, follow: true },
};

const aboutJsonLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: `About ${BRAND.name.en}`,
  url: absoluteUrl("/about"),
  description,
  dateModified: SITE_LAST_MODIFIED,
  isPartOf: {
    "@type": "WebSite",
    name: BRAND.name.en,
    url: BRAND.url,
  },
  mainEntity: {
    "@type": "Organization",
    name: BRAND.name.en,
    alternateName: BRAND.name.hi,
    url: BRAND.url,
    description,
    founder: {
      "@type": "Person",
      name: BRAND.contact.founder,
    },
  },
};

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(aboutJsonLd)}
      />
      <AboutClient />
    </>
  );
}
