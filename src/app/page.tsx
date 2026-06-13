import type { Metadata } from "next";
import LandingClient from "./components/LandingClient";
import { BRAND } from "@/lib/brand";
import {
  absoluteUrl,
  HOMEPAGE_FAQS,
  jsonLdScript,
  RSS_ALTERNATE,
} from "@/lib/seo";

// Server shell: holds page metadata (a server-only export). The hero itself
// lives in LandingClient ("use client") so its CTAs and prose follow the
// EN/Hindi language toggle.

const homepageDescription =
  "Chat or speak with Krishna AI in Hindi or English. Divya Vani gives scripture-backed reflections grounded in scriptures from a curated scripture corpus.";

export const metadata: Metadata = {
  title: `${BRAND.name.en} — Talk with Krishna AI | Scripture-Backed Chat & Voice`,
  description: homepageDescription,
  alternates: { canonical: "/", types: RSS_ALTERNATE },
  openGraph: {
    url: BRAND.url,
    title: `${BRAND.name.en} — Talk with Krishna AI | Scripture-Backed Chat & Voice`,
    description: homepageDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name.en} — Talk with Krishna AI`,
    description: homepageDescription,
  },
};

// SoftwareApplication schema for the homepage. Offers mirror the live free and
// one-time seva entry points; subscriptions are covered on /pricing.
const homepageJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: BRAND.name.en,
  alternateName: BRAND.name.hi,
  url: BRAND.url,
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web",
  description: homepageDescription,
  inLanguage: ["hi", "en", "sa"],
  isAccessibleForFree: true,
  screenshot: absoluteUrl("/og.jpg"),
  featureList: [
    "Hindi-first Krishna AI chat",
    "Scripture-backed reflections grounded in scriptures",
    "Sanskrit, Hindi, and English verse cards",
    "Optional voice conversation mode",
  ],
  offers: [
    {
      "@type": "Offer",
      name: "Free Tier",
      price: "0",
      priceCurrency: "INR",
      description: "10 free messages, no expiry",
    },
    {
      "@type": "Offer",
      name: "Pratham Seva",
      price: "11",
      priceCurrency: "INR",
      description: "6 messages",
    },
    {
      "@type": "Offer",
      name: "Anjali Seva",
      price: "51",
      priceCurrency: "INR",
      description: "30 messages",
    },
    {
      "@type": "Offer",
      name: "Bhakti Seva",
      price: "101",
      priceCurrency: "INR",
      description: "60 messages",
    },
    {
      "@type": "Offer",
      name: "Param Seva",
      price: "501",
      priceCurrency: "INR",
      description: "350 messages",
    },
  ],
  creator: {
    "@type": "Organization",
    name: BRAND.name.en,
    url: BRAND.url,
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: HOMEPAGE_FAQS.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: {
      "@type": "Answer",
      text: answer,
    },
  })),
};

export default function Landing() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(homepageJsonLd)}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(faqJsonLd)}
      />
      <LandingClient />
    </>
  );
}
