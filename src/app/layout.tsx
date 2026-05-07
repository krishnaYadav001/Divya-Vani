import type { Metadata, Viewport } from "next";
import {
  Cormorant_Garamond,
  Geist,
  Geist_Mono,
  Noto_Sans_Devanagari,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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
  metadataBase: new URL("https://divyavani.co.in"),
  title: "Divya Vani",
  description:
    "An AI roleplaying Krishna — speak about life, emotions, and dharma. Grounded in the Bhagavad Gita.",
  openGraph: {
    type: "website",
    url: "https://divyavani.co.in",
    siteName: "Divya Vani",
    title: "Divya Vani",
    description:
      "An AI roleplaying Krishna — speak about life, emotions, and dharma. Grounded in the Bhagavad Gita.",
  },
  alternates: {
    canonical: "https://divyavani.co.in",
  },
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
        <Analytics />
      </body>
    </html>
  );
}
