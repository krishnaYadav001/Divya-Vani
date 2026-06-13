import type { Metadata } from "next";
import ChatUI from "@/app/components/ChatUI";
import { BRAND } from "@/lib/brand";
import {
  absoluteUrl,
  jsonLdScript,
  RSS_ALTERNATE,
  SITE_LAST_MODIFIED,
} from "@/lib/seo";

const description =
  "Chat casually, learn stories, or reflect through Krishna’s wisdom in Hindi or English. Divya Vani replies with scripture-backed verse cards from its curated scripture corpus.";

export const metadata: Metadata = {
  title: `Chat with Krishna AI | ${BRAND.name.en}`,
  description,
  alternates: { canonical: "/chat", types: RSS_ALTERNATE },
  openGraph: {
    url: absoluteUrl("/chat"),
    title: `Chat with Krishna AI | ${BRAND.name.en}`,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: `Chat with Krishna AI | ${BRAND.name.en}`,
    description,
  },
  robots: { index: true, follow: true },
};

const chatJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: `Chat with Krishna AI | ${BRAND.name.en}`,
  url: absoluteUrl("/chat"),
  description,
  dateModified: SITE_LAST_MODIFIED,
  inLanguage: ["hi", "en", "sa"],
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
  },
  potentialAction: {
    "@type": "CommunicateAction",
    name: "Start a Krishna AI chat",
    target: {
      "@type": "EntryPoint",
      urlTemplate: absoluteUrl("/chat"),
    },
  },
};

export default function ChatPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(chatJsonLd)}
      />
      <ChatUI />
    </>
  );
}
