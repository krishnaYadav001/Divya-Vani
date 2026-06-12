import type { Metadata } from "next";
import Link from "next/link";
import Atmosphere from "../components/Atmosphere";
import BackToChat from "../components/BackToChat";
import { BRAND } from "@/lib/brand";
import { absoluteUrl, jsonLdScript, RSS_ALTERNATE } from "@/lib/seo";

// Phase 12 — standalone Refund & Cancellation Policy. Razorpay's website
// compliance crawl expects this as a distinct, directly-linkable page
// (not buried in /terms). Mirrors the refund section in /terms verbatim
// in substance, adds an explicit cancellation section + request steps.
// English-only, matching the admin-page convention.

export const metadata: Metadata = {
  title: `Refund & Cancellation Policy — ${BRAND.name.en}`,
  description: `Refund and cancellation policy for ${BRAND.name.en} seva contributions and subscriptions.`,
  alternates: { canonical: "/refund", types: RSS_ALTERNATE },
  openGraph: {
    url: absoluteUrl("/refund"),
    title: `Refund and Cancellation Policy | ${BRAND.name.en}`,
    description: `Refund and cancellation policy for ${BRAND.name.en} seva contributions and subscriptions.`,
  },
  twitter: {
    card: "summary_large_image",
    title: `Refund and Cancellation Policy | ${BRAND.name.en}`,
    description: `Refund and cancellation policy for ${BRAND.name.en} seva contributions and subscriptions.`,
  },
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "2026-05-25";

export default function RefundPage() {
  const refundJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Refund and Cancellation Policy | ${BRAND.name.en}`,
    url: absoluteUrl("/refund"),
    description: `Refund and cancellation policy for ${BRAND.name.en} seva contributions and subscriptions.`,
    dateModified: LAST_UPDATED,
    isPartOf: {
      "@type": "WebSite",
      name: BRAND.name.en,
      url: BRAND.url,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(refundJsonLd)}
      />
      <main className="relative flex flex-1 overflow-y-auto">
        <Atmosphere mode="distant" intensity={0.6} vignette={1} />

      <article className="relative mx-auto w-full max-w-2xl px-6 py-12 font-serif text-krishna sm:px-8 sm:py-16">
        <BackToChat />

        <header className="mb-7">
          <p className="mb-3 font-[family-name:var(--font-display)] text-xs uppercase tracking-[0.22em] text-gold-dim">
Refunds
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,5vw,3.5rem)] font-normal leading-[1.1] text-ivory">
            Refund &amp; Cancellation Policy
          </h1>
        </header>
        <div className="dv-hairline mb-10" />

        <div className="space-y-8 text-base font-medium leading-relaxed">
          <section>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-normal text-gold">
              Seva Contributions (One-Time)
            </h2>
            <p className="mb-3">
              Seva contributions are voluntary offerings that unlock a
              fixed number of messages. They are generally non-refundable,
              with two exceptions:
            </p>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                <strong>Technical failure</strong> — if a seva was charged
                but the corresponding messages were not credited within 72
                hours, you can request a full refund. Refunds in this case
                are processed within 7 working days of the request.
              </li>
              <li>
                <strong>Duplicate accidental charge</strong> — if you were
                charged twice for the same seva contribution, the duplicate
                is fully refundable within 7 working days of the request.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-normal text-gold">
              Subscriptions (When Available)
            </h2>
            <p className="mb-3">
              For any recurring subscription plan:
            </p>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                You may <strong>cancel anytime</strong> from Settings or by
                emailing us. Cancellation stops future renewals; your access
                continues until the end of the period you have already paid
                for.
              </li>
              <li>
                The first charge is refundable within 72 hours if no
                meaningful usage has occurred. Subsequent renewal charges
                are non-refundable except for a billing error.
              </li>
              <li>
                Unused message or voice-minute allowances do not carry over
                and are not separately refundable.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-normal text-gold">
              How to Request a Refund
            </h2>
            <ol className="ml-5 list-decimal space-y-2">
              <li>
                Email{" "}
                <a
                  href={`mailto:${BRAND.contact.email}`}
                  className="underline decoration-brass underline-offset-2 hover:text-peacock"
                >
                  {BRAND.contact.email}
                </a>{" "}
                from the address linked to your account (if any).
              </li>
              <li>
                Include the <strong>Razorpay payment ID</strong> and a brief
                description of the issue.
              </li>
              <li>
                We respond within 2 working days and, where a refund is due,
                process it back to your original payment method via Razorpay
                within 7 working days.
              </li>
            </ol>
            <p className="mt-3">
              Refund requests outside the cases above are considered at our
              discretion. Nothing here limits your rights under the
              Consumer Protection Act, 2019.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-normal text-gold">
              Payments &amp; Currency
            </h2>
            <p>
              Payments are processed by Razorpay; we do not store card or
              bank details. Indian customers are billed in Indian Rupees
              (INR). International customers may be billed in their local
              currency where supported. All prices are inclusive of
              applicable taxes per law.
            </p>
          </section>
        </div>

        <footer className="mt-12 border-t border-brass/30 pt-6 text-sm text-brass-dark">
          <p>Last updated: {LAST_UPDATED}</p>
          <p className="mt-2">
            <Link
              href="/terms"
              className="underline decoration-brass underline-offset-2 hover:text-peacock"
            >
              Terms of Service
            </Link>
            {"  ·  "}
            <Link
              href="/contact"
              className="underline decoration-brass underline-offset-2 hover:text-peacock"
            >
              Contact
            </Link>
          </p>
          <p className="mt-2">
            <Link
              href="/"
              className="underline decoration-brass underline-offset-2 hover:text-peacock"
            >
              ← Back to {BRAND.name.en}
            </Link>
          </p>
        </footer>
      </article>
      </main>
    </>
  );
}
