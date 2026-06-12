import type { Metadata } from "next";
import Link from "next/link";
import Atmosphere from "../components/Atmosphere";
import BackToChat from "../components/BackToChat";
import SubscribeButton from "../components/SubscribeButton";
import { BRAND } from "@/lib/brand";
import {
  absoluteUrl,
  jsonLdScript,
  RSS_ALTERNATE,
  SITE_LAST_MODIFIED,
} from "@/lib/seo";
import { getTiersInOrder } from "@/lib/seva";
import { getPlansInOrder, getOffer } from "@/lib/subscriptions";

// Phase 12 — public Pricing page. Required by Razorpay's website crawl +
// Google Ads (transparent pricing on a linkable page). Reads the live
// seva config from src/lib/seva.ts so the page can NEVER drift from what
// the checkout actually charges. Only CURRENTLY-PURCHASABLE tiers are
// listed (free + one-time seva) — subscriptions are not advertised here
// until they ship, so the page always matches what a user can really buy.
// English-only, matching the admin-page convention.

const PRICING_DESCRIPTION = `Pricing for ${BRAND.name.en}: a free tier plus one-time seva contributions that unlock more messages.`;

export const metadata: Metadata = {
  title: `Pricing — ${BRAND.name.en}`,
  description: PRICING_DESCRIPTION,
  alternates: { canonical: "/pricing", types: RSS_ALTERNATE },
  openGraph: {
    url: absoluteUrl("/pricing"),
    title: `Pricing and Seva Plans | ${BRAND.name.en}`,
    description: `Pricing for ${BRAND.name.en}: free messages, one-time seva tiers, subscriptions, billing, and refunds.`,
  },
  twitter: {
    card: "summary_large_image",
    title: `Pricing and Seva Plans | ${BRAND.name.en}`,
    description: `Pricing for ${BRAND.name.en}: free messages, seva tiers, subscriptions, billing, and refunds.`,
  },
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "2026-05-25";

export default function PricingPage() {
  const tiers = getTiersInOrder();
  const plans = getPlansInOrder();
  const oneTimeOffers = [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "INR",
      description: "10 messages, no expiry",
    },
    ...tiers.map((tier) => ({
      "@type": "Offer",
      name: tier.displayName,
      price: String(tier.priceInr),
      priceCurrency: "INR",
      description: `${tier.messages} messages`,
      url: absoluteUrl("/pricing"),
    })),
  ];
  const subscriptionOffers = plans.flatMap((plan) => {
    const inr = getOffer(plan.key, "INR", "monthly");
    const usd = getOffer(plan.key, "USD", "annual");
    return [
      {
        "@type": "Offer",
        name: `${plan.displayName} monthly`,
        price: String(inr.amount / 100),
        priceCurrency: "INR",
        description: `${plan.entitlement.messagePool} messages and ${plan.entitlement.voiceMinutes} voice minutes per cycle`,
        url: absoluteUrl("/pricing"),
      },
      {
        "@type": "Offer",
        name: `${plan.displayName} annual`,
        price: String(usd.amount / 100),
        priceCurrency: "USD",
        description: `${plan.entitlement.messagePool} messages and ${plan.entitlement.voiceMinutes} voice minutes per cycle`,
        url: absoluteUrl("/pricing"),
      },
    ];
  });
  const pricingJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Pricing and Seva Plans | ${BRAND.name.en}`,
    url: absoluteUrl("/pricing"),
    description: PRICING_DESCRIPTION,
    dateModified: SITE_LAST_MODIFIED,
    mainEntity: {
      "@type": "SoftwareApplication",
      name: BRAND.name.en,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web",
      offers: [...oneTimeOffers, ...subscriptionOffers],
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(pricingJsonLd)}
      />
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
              messages — or choose a monthly subscription for ongoing text and
              voice with Krishna.
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
                    <span className="text-brass-dark"> · </span>
                    {tier.priceUsdDisplay}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 font-[family-name:var(--font-display)] text-2xl font-normal text-gold">
              Monthly subscriptions
            </h2>
            <p className="mb-4 text-sm text-brass-dark">
              Ongoing access with a pool of messages and voice minutes each
              cycle. Indian customers are billed monthly in INR; international
              customers are billed annually in USD.
            </p>
            <ul className="space-y-3">
              {plans.map((plan) => {
                const inr = getOffer(plan.key, "INR", "monthly");
                const usd = getOffer(plan.key, "USD", "annual");
                return (
                  <li
                    key={plan.key}
                    className="flex items-baseline justify-between gap-4 border-b border-brass/20 pb-3"
                  >
                    <span>
                      <strong>{plan.displayName}</strong>
                      <span className="block text-sm text-brass-dark">
                        {plan.entitlement.messagePool} messages +{" "}
                        {plan.entitlement.voiceMinutes} voice min / cycle
                      </span>
                    </span>
                    <span className="whitespace-nowrap font-[family-name:var(--font-display)] text-gold">
                      {inr.display}
                      <span className="text-brass-dark">/mo</span>
                      <span className="mx-1 text-brass-dark">·</span>
                      {usd.display}
                      <span className="text-brass-dark">/yr</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 max-w-xs">
              <SubscribeButton label="See subscription plans" variant="solid" />
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-normal text-gold">
              Billing &amp; Currency
            </h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                Seva contributions are <strong>one-time</strong> and
                non-recurring. Subscriptions renew automatically each cycle
                until cancelled — cancel anytime and access continues to the
                end of the paid period.
              </li>
              <li>
                Payments are processed securely by Razorpay. We never store
                your card or bank details. We accept UPI, Indian debit and
                credit cards, net banking, and international Visa &amp;
                Mastercard.
              </li>
              <li>
                One-time <em>seva</em> is priced by region: Indian visitors are
                charged in Indian Rupees (INR); international visitors are
                charged in US Dollars (USD) — both prices are shown as
                {" "}
                <strong>₹ · $</strong> on each tier above.
              </li>
              <li>
                For subscriptions, Indian customers are billed monthly in INR
                (UPI AutoPay / e-mandate); international customers are billed
                annually in US Dollars (USD).
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
    </>
  );
}
