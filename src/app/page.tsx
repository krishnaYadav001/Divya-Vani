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

// JSON-LD — FAQPage schema for AI engine extraction + Rich Results.
// Questions mirror what users actually ask before signing up.
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is Divya Vani?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Divya Vani is an AI that roleplays Krishna — the character from the Bhagavad Gita, Mahabharata, and Bhagavata Purana. You can talk to Krishna about life, emotions, relationships, and dharma. Every response is grounded in real scripture with verse citations.",
      },
    },
    {
      "@type": "Question",
      name: "Is this really Krishna or God?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Divya Vani is an AI roleplaying Krishna based on scripture. It does not claim to be divine or offer divine guidance. A permanent disclaimer is always visible on screen.",
      },
    },
    {
      "@type": "Question",
      name: "What languages does Divya Vani support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Divya Vani is Hindi-first but supports English equally. You can also write in Sanskrit. Krishna replies in the same language you use. Verse cards always show Sanskrit, transliteration, Hindi, and English.",
      },
    },
    {
      "@type": "Question",
      name: "How much does Divya Vani cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You get 10 free messages with no expiry. After that, one-time seva plans start at ₹11 for 6 messages (Pratham Seva), ₹51 for 30 messages (Anjali Seva), ₹101 for 60 messages (Bhakti Seva), and ₹501 for 350 messages (Param Seva). Payment is via UPI through Razorpay.",
      },
    },
    {
      "@type": "Question",
      name: "Is my data private and safe?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Divya Vani follows DPDP-compliant privacy practices with Indian data residency. Chat logs are retained for 180 days and then auto-purged. You can opt out of data use for improvement or delete your account entirely from the Settings page.",
      },
    },
    {
      "@type": "Question",
      name: "Which scriptures does Divya Vani use?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Divya Vani draws from 3,132 verses across three scriptures: 701 Bhagavad Gita verses (complete Chapters 1–18 with Sanskrit), 1,704 Mahabharata verses (key episodes and teachings), and 727 Bhagavata Purana verses (Canto 10 and the Uddhava Gita from Canto 11). Each verse includes Sanskrit text, transliteration, Hindi translation, English summary, and thematic tags.",
      },
    },
  ],
};

export default function Landing() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <LandingClient />
    </>
  );
}

