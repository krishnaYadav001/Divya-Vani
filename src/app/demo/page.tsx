import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import demoContent from "../../../data/demo-content.json";
import DemoClient, { type DemoContent } from "./DemoClient";

// /demo — lightweight content-only marketing surface for X / Reddit /
// WhatsApp shares. Content is driven by data/demo-content.json + the
// /public/demo/ image directory; no admin UI, no API, no DB. To update
// videos / screenshots / Q&A, the founder edits the JSON and commits
// new files to /public/demo/.
//
// This server shell holds the page metadata (a server-only export) +
// reads the content JSON. The interactive, language-aware body lives in
// DemoClient ("use client") so the marketing chrome follows the EN/हिन्दी
// toggle (Phase 12). The YouTubeFacade (click-to-embed), ScreenshotTile
// (onError fallback), and DemoFeedback client components mount inside it.

export const metadata: Metadata = {
  title: `Demo — ${BRAND.name.en}`,
  description: `See ${BRAND.name.en} in action — example conversations with Krishna, video walkthroughs, and screenshots.`,
  alternates: { canonical: "/demo" },
  openGraph: {
    url: `${BRAND.url}/demo`,
    title: `Demo — ${BRAND.name.en}`,
    description: `See ${BRAND.name.en} in action — example conversations with Krishna, video walkthroughs, and screenshots.`,
  },
};

const content = demoContent as DemoContent;

export default function DemoPage() {
  return <DemoClient content={content} />;
}
