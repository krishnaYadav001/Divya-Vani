import type { Metadata } from "next";
import Link from "next/link";
import Atmosphere from "../components/Atmosphere";
import BackToChat from "../components/BackToChat";
import { BRAND } from "@/lib/brand";
import { getTiersInOrder } from "@/lib/seva";

// Phase 12 — public Pricing page. Required by Razorpay's website crawl +
// Google Ads (transparent pricing on a linkable page). Reads the live
// seva config from src/lib/seva.ts so the page can NEVER drift from what
// the checkout actually charges. Only CURRENTLY-PURCHASABLE tiers are
// listed (free + one-time seva) — subscriptions are not advertised here
// until they ship, so the page always matches what a user can really buy.
// English-only, matching the admin-page convention.

export const metadata: Metadata = {
  title: `Pricing — ${BRAND.name.en}`,
  description: `Pricing for ${BRAND.name.en}: a free tier plus one-time seva contributions that unlock more messages.`,
  alternates: { canonical: "/pricing" },
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "2026-05-25";

export default function PricingPage() {
  const tiers = getTiersInOrder();

  return (
    <main className="relative flex flex-1 overflow-y-auto">
      <Atmosphere mode="distant" intensity={0.6} vignette={1} />

      <article className="relative mx-auto w-full max-w-2xl px-6 py-12 font-serif text-krishna sm:px-8 sm:py-16">
        <BackToChat />

        <header className="mb-7">
          <p className="mb-3 font-[family-name:var(--font-display)] text-xs uppercase tracking-[0.22em] text-gold-dim">
Pricing
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,5vw,3.5rem)] font-normal leading-[1.1] text-ivory">
            Pricing
          </h1>
        </header>
        <div className="dv-hairline mb-10" />

        <div className="space-y-8 text-base font-medium leading-relaxed">
          <section>
            <p>
              Start free. When you want to keep talking, offer a{" "}
              <em>seva</em> — a one-time contribution that unlocks more
              messages. There is no subscription and no auto-renewal in the
              current version.
            </p>
          </section>

          <section>
            <h2 className="mb-4 font-[family-name:var(--font-display)] text-2xl font-normal text-gold">
              Plans
            </h2>
            <ul className="space-y-3">
              <li className="flex items-baseline justify-between gap-4 border-b border-brass/20 pb-3">
                <span>
                  <strong>Free</strong>
                  <span className="block text-sm text-brass-dark">
                    10 messages, no expiry
                  </span>
                </span>
                <span className="whitespace-nowrap font-[family-name:var(--font-display)] text-gold">
                  ₹0
                </span>
              </li>
              {tiers.map((tier) => (
                <li
                  key={tier.id}
                  className="flex items-baseline justify-between gap-4 border-b border-brass/20 pb-3"
                >
                  <span>
                    <strong>
                      {tier.symbol} {tier.displayName}
                    </strong>
                    <span className="block text-sm text-brass-dark">
                      {tier.messages} messages
                    </span>
                  </span>
                  <span className="whitespace-nowrap font-[family-name:var(--font-display)] text-gold">
                    ₹{tier.priceInr}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-normal text-gold">
              Billing &amp; Currency
            </h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                All seva contributions are <strong>one-time</strong> and
                non-recurring. There is no subscription billing in the
                current version.
              </li>
              <li>
                Payments are processed securely by Razorpay. We never store
                your card or bank details.
              </li>
              <li>
                Indian customers are billed in Indian Rupees (INR).
                International customers may be billed in their local
                currency where supported.
              </li>
              <li>Prices are inclusive of applicable taxes per law.</li>
            </ul>
          </section>

          <section>
            <p>
              See our{" "}
              <Link
                href="/refund"
                className="underline decoration-brass underline-offset-2 hover:text-peacock"
              >
                Refund &amp; Cancellation Policy
              </Link>{" "}
              and{" "}
              <Link
                href="/terms"
                className="underline decoration-brass underline-offset-2 hover:text-peacock"
              >
                Terms of Service
              </Link>
              . Questions? <Link
                href="/contact"
                className="underline decoration-brass underline-offset-2 hover:text-peacock"
              >
                Contact us
              </Link>
              .
            </p>
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
