import type { Metadata, Viewport } from "next";
import {
  Cormorant_Garamond,
  Geist,
  Geist_Mono,
  Marcellus,
  Tiro_Devanagari_Hindi,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import { BRAND } from "@/lib/brand";
import { jsonLdScript, SOCIAL_PROFILES } from "@/lib/seo";
import "@/lib/startup";
import SiteFooter from "./components/SiteFooter";
import SupportWidget from "./components/SupportWidget";
import VisitTracker from "./components/VisitTracker";
import { LanguageProvider } from "./providers/LanguageProvider";
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

// Phase 8 cinematic-dark redesign — type system flipped to the
// temple-aarti direction: Marcellus for English display/UI, Cormorant
// Garamond italic for English body, Tiro Devanagari Hindi for all
// Devanagari. notoDevanagari (Noto Sans Devanagari) retired — the
// `--font-noto-devanagari` CSS alias is repointed at Tiro in
// globals.css so every existing `font-devanagari` usage inherits the
// new face without per-component edits.
const marcellus = Marcellus({
  variable: "--font-marcellus",
  subsets: ["latin"],
  weight: ["400"],
});

const tiroDevanagari = Tiro_Devanagari_Hindi({
  variable: "--font-tiro-devanagari",
  subsets: ["devanagari", "latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: {
    default: `${BRAND.name.en} — Speak with Krishna AI`,
    template: "%s",
  },
  description: BRAND.description.en,
  applicationName: BRAND.name.en,
  appleWebApp: {
    capable: true,
    title: BRAND.name.en,
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
  keywords: [
    "Krishna AI",
    "Bhagavad Gita AI",
    "Hindu spirituality",
    "dharma",
    "Divya Vani",
    "divyavani",
    "Krishna chat",
    "dharma AI"
  ],
  // Brand icon set — the Sudarshan Chakra mark from the Dawn Aarti
  // handoff, rasterized at every standard size into /public. The SVG is
  // the canonical source (modern browsers prefer it); the PNGs cover
  // older browsers, Android, and PWA install. The legacy app/favicon.ico
  // stays as the .ico fallback. apple-touch-icon is the iOS home-screen
  // tile (180×180).
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    url: BRAND.url,
    siteName: BRAND.name.en,
    title: `${BRAND.name.en} — Speak with Krishna AI`,
    description: BRAND.description.en,
    // og.jpg, NOT og.png — DO NOT revert to PNG. The 1024×541 PNG was
    // 847 KB; WhatsApp silently drops any og:image over 600 KB (uses
    // Facebook's crawler/cache; HTTPS-only), so the preview never
    // rendered on WhatsApp. Re-encoded to JPEG q88 → 133 KB at the
    // same dimensions (well under the 600 KB cap, under the 300 KB
    // recommended target), visually identical for a photographic hero.
    // og.png is kept in /public as the un-optimised source for the
    // future 1200×630 final re-export — when that lands, re-encode it
    // to JPEG too, keep it < ~300 KB, and bump these width/height.
    // Declared dims must match the real file or Twitter/Facebook
    // validators letterbox/reject the card. Relative /og.jpg resolves
    // against metadataBase (set above) → absolute HTTPS URL.
    images: [
      {
        url: "/og.jpg",
        width: 1024,
        height: 541,
        alt: `${BRAND.name.en} — ${BRAND.description.en}`,
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name.en} — Speak with Krishna AI`,
    description: BRAND.description.en,
    images: ["/og.jpg"],
  },
  // Phase 6.6 Stage C-1 — canonical removed from root layout. Each page
  // declares its own alternates.canonical so /chat / /privacy / /terms
  // don't all collapse to the root URL in search-engine indexes.
  alternates: {
    types: {
      "application/rss+xml": "/feed.xml",
    },
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
  themeColor: "#faf7f2",
  // viewport-fit=cover lets the Dawn Aarti atmosphere bleed to the
  // physical screen edges on notched iPhones (no flat letterbox strips —
  // CLAUDE.md principle 6). Interactive surfaces (chat header, voice
  // controls, footer, transcript sheet) re-inset themselves with
  // env(safe-area-inset-*) so nothing hides under the Dynamic Island or
  // home indicator. No-op on every non-notched device (env() = 0px there).
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} ${marcellus.variable} ${tiroDevanagari.variable} h-full antialiased`}
    >
      <body
        className="h-dvh flex flex-col overflow-hidden"
        suppressHydrationWarning
      >
        {/* ---- Global JSON-LD structured data (AEO/GEO) ----
            WebSite + Organization schemas live in the layout so every
            page (including the homepage) is detectable by Google Rich
            Results Test, AI engine crawlers, and knowledge-graph
            extractors. Per-page schemas (Article, FAQPage) are added
            by individual routes (e.g. /verse/[id]). */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: BRAND.name.en,
              alternateName: BRAND.name.hi,
              url: BRAND.url,
              description: BRAND.description.en,
              inLanguage: ["hi", "en", "sa"],
              publisher: {
                "@type": "Organization",
                name: BRAND.name.en,
                url: BRAND.url,
              },
          })}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: BRAND.name.en,
              legalName: BRAND.name.en,
              alternateName: BRAND.name.hi,
              url: BRAND.url,
              description: BRAND.description.en,
              logo: `${BRAND.url}/favicon-512.png`,
              contactPoint: {
                "@type": "ContactPoint",
                telephone: BRAND.contact.phone,
                contactType: "customer service",
                email: BRAND.contact.email,
                areaServed: "IN",
                availableLanguage: ["Hindi", "English"],
              },
              address: {
                "@type": "PostalAddress",
                streetAddress: "255 EWS, Barra-4, Janta Nagar",
                addressLocality: "Kanpur",
                addressRegion: "Uttar Pradesh",
                postalCode: "208027",
                addressCountry: "IN",
              },
              founder: {
                "@type": "Person",
                name: BRAND.contact.founder,
              },
              sameAs: SOCIAL_PROFILES,
          })}
        />
        <LanguageProvider>
          <VisitTracker />
          {children}
          <SiteFooter />
          <SupportWidget />
        </LanguageProvider>
        <Analytics />
        {/* Phase 8 — Plausible (privacy-friendly, cookieless) runs
            alongside Vercel Analytics: Vercel for aggregate pageviews,
            Plausible for funnel + event visibility (Phase 7 retro
            surfaced 95.7% top-of-funnel drop-off). Next 16 <Script>
            with afterInteractive so it loads post-hydration and never
            blocks first render. Goal-event calls are a later pass. */}
        <Script
          defer
          src="https://plausible.io/js/pa-sq9uxOjl7qHjRhcDeza2w.js"
          strategy="afterInteractive"
        />
        <Script id="plausible-init" strategy="afterInteractive">
          {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()`}
        </Script>
        {/* Microsoft Clarity — session recordings + heatmaps (free, no cookie
            consent needed, IP anonymized by default). Sign up at
            clarity.microsoft.com → New Project → copy the 10-char Project ID
            and replace wy3cag5b9r below, then redeploy. */}
        <Script id="clarity-init" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","wy3cag5b9r");`}
        </Script>
        {/* Google Ads — global site tag + Enhanced Conversions.
            Set NEXT_PUBLIC_GOOGLE_ADS_ID (e.g. "AW-1234567890") in Vercel
            env vars to activate. No-op until set. */}
        {process.env.NEXT_PUBLIC_GOOGLE_ADS_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GOOGLE_ADS_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-ads-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${process.env.NEXT_PUBLIC_GOOGLE_ADS_ID}',{allow_enhanced_conversions:true});`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
