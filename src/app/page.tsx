import type { Metadata } from "next";
import LandingClient from "./components/LandingClient";
import { BRAND } from "@/lib/brand";

// Server shell: holds page metadata (a server-only export). The hero itself
// lives in LandingClient ("use client") so its CTAs / prose / disclaimer can
// follow the EN/हिन्दी language toggle. Layout + design are unchanged from the
// Dawn Aarti "Landing C · Vrindavan Window" mock.

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// JSON-LD — SoftwareApplication schema for the homepage. Gives Rich
// Results Test an entity to detect beyond the global WebSite/Organization
// in layout.tsx. Offers array mirrors the live seva pricing tiers.
const homepageJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: BRAND.name.en,
  alternateName: BRAND.name.hi,
  url: BRAND.url,
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web",
  description: BRAND.description.en,
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

export default function Landing() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageJsonLd) }}
      />
      <LandingClient />
    </>
  );
}

