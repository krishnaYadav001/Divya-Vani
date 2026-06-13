import type { Metadata } from "next";
import { preconnect } from "react-dom";
import StarField from "./StarField";
import AgentVoiceClient from "./AgentVoiceClient";
import { BRAND } from "@/lib/brand";
import {
  absoluteUrl,
  jsonLdScript,
  RSS_ALTERNATE,
  SITE_LAST_MODIFIED,
} from "@/lib/seo";

const description =
  "Talk with Krishna in voice: speak your question and hear a reply grounded in scripture from an AI roleplaying Krishna.";

export const metadata: Metadata = {
  title: `Talk with Krishna AI by Voice — ${BRAND.name.en}`,
  description,
  alternates: { canonical: "/voice", types: RSS_ALTERNATE },
  openGraph: {
    url: absoluteUrl("/voice"),
    title: `Talk with Krishna AI by Voice — ${BRAND.name.en}`,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: `Talk with Krishna AI by Voice — ${BRAND.name.en}`,
    description,
  },
  robots: { index: true, follow: true },
};

const voiceJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: `Voice Conversation with Krishna | ${BRAND.name.en}`,
  url: absoluteUrl("/voice"),
  description,
  dateModified: SITE_LAST_MODIFIED,
  inLanguage: ["hi", "en"],
  isPartOf: {
    "@type": "WebSite",
    name: BRAND.name.en,
    url: BRAND.url,
  },
  mainEntity: {
    "@type": "SoftwareApplication",
    name: BRAND.name.en,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      category: "Paid voice access",
      priceCurrency: "INR",
    },
  },
  potentialAction: {
    "@type": "CommunicateAction",
    name: "Start a Krishna voice conversation",
    target: {
      "@type": "EntryPoint",
      urlTemplate: absoluteUrl("/voice"),
    },
  },
};

export default function VoicePage() {
  preconnect("https://api.elevenlabs.io");
  return (
    <main className="bg-night relative flex h-full flex-1 flex-col overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(voiceJsonLd)}
      />
      <StarField className="z-0" count={70} />
      <AgentVoiceClient />
    </main>
  );
}
