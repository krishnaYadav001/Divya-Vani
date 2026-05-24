import type { Metadata } from "next";
import Link from "next/link";
import Atmosphere from "../components/Atmosphere";
import BackToChat from "../components/BackToChat";
import { BRAND } from "@/lib/brand";

// Phase 12 — standalone Contact page. Required by Razorpay's website
// compliance crawl (Contact Us with a physical address) and Google Ads'
// business-information policy (legal name + address + phone on the site).
// English-only, matching the /privacy + /terms admin-page convention.
// Business identity reads from BRAND.contact — update the address there.

export const metadata: Metadata = {
  title: `Contact — ${BRAND.name.en}`,
  description: `Contact ${BRAND.name.en}: support email, phone, business address, and grievance officer.`,
  alternates: { canonical: "/contact" },
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "2026-05-25";

export default function ContactPage() {
  return (
    <main className="relative flex flex-1 overflow-y-auto">
      <Atmosphere mode="distant" intensity={0.6} vignette={1} />

      <article className="relative mx-auto w-full max-w-2xl px-6 py-12 font-serif text-krishna sm:px-8 sm:py-16">
        <BackToChat />

        <header className="mb-7">
          <p className="mb-3 font-[family-name:var(--font-display)] text-xs uppercase tracking-[0.22em] text-gold-dim">
            संपर्क · contact
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,5vw,3.5rem)] font-normal leading-[1.1] text-ivory">
            Contact Us
          </h1>
        </header>
        <div className="dv-hairline mb-10" />

        <div className="space-y-8 text-base font-medium leading-relaxed">
          <section>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-normal text-gold">
              Business
            </h2>
            <p>
              {BRAND.name.en} ({BRAND.name.hi})
              <br />
              Proprietor: {BRAND.contact.founder}
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-normal text-gold">
              Reach Us
            </h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                <strong>Email:</strong>{" "}
                <a
                  href={`mailto:${BRAND.contact.email}`}
                  className="underline decoration-brass underline-offset-2 hover:text-peacock"
                >
                  {BRAND.contact.email}
                </a>
              </li>
              <li>
                <strong>Phone:</strong>{" "}
                <a
                  href={`tel:${BRAND.contact.phone}`}
                  className="underline decoration-brass underline-offset-2 hover:text-peacock"
                >
                  {BRAND.contact.phoneDisplay}
                </a>{" "}
                ({BRAND.contact.phoneHours})
              </li>
              <li>
                <strong>Address:</strong> {BRAND.contact.address}
              </li>
            </ul>
            <p className="mt-3">
              We aim to respond to support queries within 2 working days.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-normal text-gold">
              Grievance Officer
            </h2>
            <p>
              For privacy questions, data-deletion requests, payment
              disputes, or grievances under the DPDP Act, contact:
            </p>
            <p className="mt-3">
              {BRAND.contact.founder}
              <br />
              <a
                href={`mailto:${BRAND.contact.email}`}
                className="underline decoration-brass underline-offset-2 hover:text-peacock"
              >
                {BRAND.contact.email}
              </a>
            </p>
            <p className="mt-3">
              Per Section 13 of the DPDP Act, we acknowledge grievances and
              respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-normal text-gold">
              Policies
            </h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                <Link
                  href="/pricing"
                  className="underline decoration-brass underline-offset-2 hover:text-peacock"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="/refund"
                  className="underline decoration-brass underline-offset-2 hover:text-peacock"
                >
                  Refund &amp; Cancellation Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="underline decoration-brass underline-offset-2 hover:text-peacock"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="underline decoration-brass underline-offset-2 hover:text-peacock"
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </section>
        </div>

        <footer className="mt-12 border-t border-brass/30 pt-6 text-sm text-brass-dark">
          <p>Last updated: {LAST_UPDATED}</p>
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
  );
}
