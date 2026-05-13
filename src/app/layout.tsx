import type { Metadata, Viewport } from "next";
import {
  Cormorant_Garamond,
  Geist,
  Geist_Mono,
  Noto_Sans_Devanagari,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const notoDevanagari = Noto_Sans_Devanagari({
  variable: "--font-noto-devanagari",
  subsets: ["devanagari"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: BRAND.name.en,
  description: BRAND.description.en,
  openGraph: {
    type: "website",
    url: BRAND.url,
    siteName: BRAND.name.en,
    title: BRAND.name.en,
    description: BRAND.description.en,
  },
  // Phase 6.6 Stage C-1 — canonical removed from root layout. Each page
  // declares its own alternates.canonical so /chat / /privacy / /terms
  // don't all collapse to the root URL in search-engine indexes.
  robots: {
    index: true,
    follow: true,
  },
};

// maximumScale removed in Phase 2.5 — blocking user zoom is a
// WCAG 2.1 AA failure (users with low vision rely on it). Allows
// pinch-zoom + browser zoom on every device.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} ${notoDevanagari.variable} h-full antialiased`}
    >
      <body
        className="h-dvh flex flex-col overflow-hidden bg-linear-to-b from-parchment to-parchment/95"
        suppressHydrationWarning
      >
        {children}
        {/* Phase 6.6 Stage C-1 — text-sm + py-3 on footer, each link sized
            to inline-flex min-h-11 (44px) so the tap target meets Apple
            HIG and Google MWG. Static © text stays inline. */}
        <footer className="shrink-0 py-3 text-center text-sm text-brass-dark">
          <Link
            href="/privacy"
            className="inline-flex min-h-11 items-center px-3 hover:underline underline-offset-2"
          >
            Privacy
          </Link>
          <span aria-hidden className="text-brass">
            ·
          </span>
          <Link
            href="/terms"
            className="inline-flex min-h-11 items-center px-3 hover:underline underline-offset-2"
          >
            Terms
          </Link>
          <span aria-hidden className="text-brass">
            ·
          </span>
          <Link
            href="/settings"
            className="inline-flex min-h-11 items-center px-3 hover:underline underline-offset-2"
          >
            Settings
          </Link>
          <span aria-hidden className="mx-2 text-brass">
            ·
          </span>
          <span>{BRAND.copyright.text}</span>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
