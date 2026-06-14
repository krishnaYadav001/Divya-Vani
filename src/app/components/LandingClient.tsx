"use client";

import Link from "next/link";
import Image from "next/image";
import { BRAND } from "@/lib/brand";
import Atmosphere from "./Atmosphere";
import Wordmark from "./motifs/Wordmark";
import DevoteeSilhouettes from "./motifs/DevoteeSilhouettes";
import { useLanguage } from "../providers/LanguageProvider";

// Phase 12.x — simplified landing copy. Redundant sections (FAQ grid,
// audience list, standalone verse-count section) merged into 3 lean
// below-fold blocks: "What can you ask?", "Why trust?", and "Private by
// design". Scripture corpus details appear exactly ONCE (the verse cards).

const ARCH_SHADOW =
  "0 28px 70px -30px oklch(35% 0.08 30 / .35), 0 0 0 1px oklch(78% 0.06 60), inset 0 0 0 6px rgba(255,255,255,.5)";

// Verse-count cards — the ONE place corpus stats appear on the landing page.
const VERSE_CARDS = {
  en: [
    { count: "701", source: "Bhagavad Gita" },
    { count: "1,704", source: "Mahabharata" },
    { count: "727", source: "Bhagavata Purana" },
  ],
  hi: [
    { count: "701", source: "\u092D\u0917\u0935\u0926\u094D\u0917\u0940\u0924\u093E" },
    { count: "1,704", source: "\u092E\u0939\u093E\u092D\u093E\u0930\u0924" },
    { count: "727", source: "\u092D\u093E\u0917\u0935\u0924 \u092A\u0941\u0930\u093E\u0923" },
  ],
} as const;

export default function LandingClient() {
  const { lang, t } = useLanguage();
  const trustCopy = BRAND.trust[lang];
  const casualCopy = BRAND.casual[lang];
  const verses = VERSE_CARDS[lang];

  // CTA + prose fonts switch with language: Devanagari for Hindi, the English
  // serif for English (rather than rendering Latin in the Devanagari face).
  const ctaFont =
    lang === "hi"
      ? "font-[family-name:var(--font-devanagari)]"
      : "font-[family-name:var(--font-serif)]";
  const proseFont =
    lang === "hi"
      ? "font-[family-name:var(--font-devanagari)] not-italic"
      : "font-[family-name:var(--font-serif)] italic";
  const displayFont =
    lang === "hi"
      ? "font-[family-name:var(--font-devanagari)]"
      : "font-[family-name:var(--font-display)]";

  return (
    <main className="relative flex-1 overflow-x-hidden overflow-y-auto">
      <Atmosphere mode="hero" intensity={1} vignette={1} />

      <div className="relative z-10 mx-auto flex w-full max-w-[1320px] flex-col px-5 py-5 sm:px-8 lg:min-h-full lg:justify-center lg:px-14 lg:py-4">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-4">
          <Wordmark size="sm" stack="horizontal" />
          <nav className="flex items-center gap-6 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.26em] text-ink-soft sm:gap-8">
            <Link
              href="/about"
              className="hidden text-ink-soft transition-colors hover:text-ink sm:inline"
            >
              ABOUT
            </Link>
            <Link
              href="/pricing"
              className="hidden text-ink-soft transition-colors hover:text-ink sm:inline"
            >
              SEVĀ
            </Link>
            <Link
              href="/demo"
              className="hidden text-ink-soft transition-colors hover:text-ink sm:inline"
            >
              EXAMPLES
            </Link>
            <Link
              href="/chat"
              className="inline-flex min-h-9 items-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/45 px-4 py-1.5 text-[11px] tracking-[0.2em] text-ink backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)]"
            >
              Begin →
            </Link>
          </nav>
        </header>

        <div className="dv-hairline mt-5 shrink-0" />

        {/* Two columns, vertically centered on desktop. */}
        <div className="mt-7 grid grid-cols-1 gap-9 lg:mt-3 lg:flex-1 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-16">
          {/* \u2500\u2500 Arch portal (height-driven on desktop) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
          <div className="fade-up flex justify-center [animation-delay:0ms] [animation-fill-mode:backwards]">
            <div className="w-full max-w-[280px] lg:w-auto lg:max-w-none">
              <div
                className="relative w-full overflow-hidden rounded-t-[clamp(90px,22vw,210px)] rounded-b-[22px] bg-[var(--color-mist-2)] lg:h-[60vh] lg:w-auto"
                style={{ aspectRatio: "46 / 62", boxShadow: ARCH_SHADOW }}
              >
                <Image
                  src="/dawn-fresco.jpg"
                  alt=""
                  fill
                  priority
                  sizes="(max-width: 1024px) 80vw, 45vh"
                  className="object-cover"
                  style={{
                    objectPosition: "center 22%",
                    filter: "saturate(0.95)",
                  }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-1.5 rounded-t-[clamp(82px,20vw,200px)] rounded-b-[17px] border border-[oklch(76%_0.12_80_/_0.7)]"
                />
              </div>
              <div
                aria-hidden
                className="mx-[-7%] h-6 rounded-[4px] bg-linear-to-b from-[oklch(85%_0.06_60)] to-[oklch(75%_0.07_50)] shadow-[0_6px_14px_-6px_oklch(40%_0.08_30_/_0.3)]"
              />
              <p className="mt-4 text-center font-[family-name:var(--font-display)] text-[10px] uppercase tracking-[0.34em] text-ink-faint">
                ✦&nbsp;&nbsp;Mūrti · Vrindavan · 1521&nbsp;&nbsp;✦
              </p>
            </div>
          </div>

          {/* \u2500\u2500 Text composition \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
          <div className="fade-up min-w-0 [animation-delay:180ms] [animation-fill-mode:backwards]">
            {/* Hero headline */}
            <h1
              className={`text-[clamp(2.5rem,7vw,5.5rem)] font-normal leading-[0.95] text-ink ${
                lang === "hi"
                  ? "font-[family-name:var(--font-devanagari)] leading-[1.1]"
                  : "font-[family-name:var(--font-display)]"
              }`}
            >
              {t.landing.headline}
            </h1>

            {/* Subheadline */}
            <p
              className={`mt-5 max-w-[480px] text-base leading-relaxed text-ink-soft lg:text-lg ${proseFont}`}
            >
              {t.landing.subheadline}
            </p>

            {/* Supporting copy */}
            <p
              className={`mt-4 max-w-[480px] text-sm leading-relaxed text-ink-faint ${proseFont}`}
            >
              {t.landing.body}
            </p>

            {/* Trust + feature lines */}
            <p
              className={`mt-4 max-w-[480px] text-sm leading-relaxed text-ink-soft ${proseFont}`}
            >
              {t.landing.trustLine}
            </p>
            <p
              className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-faint ${
                lang === "hi"
                  ? "font-[family-name:var(--font-devanagari)] text-[13px] leading-relaxed"
                  : "font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.16em]"
              }`}
            >
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full bg-[oklch(78%_0.1_12)]"
              />
              {t.landing.featureLine}
            </p>

            {/* CTAs */}
            <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
              <Link
                href="/chat"
                className={`inline-flex min-h-12 items-center rounded-full border border-[oklch(80%_0.04_50)] bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] px-8 py-3.5 text-[15px] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_6px_18px_-8px_oklch(50%_0.1_30_/_0.25)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2 ${ctaFont}`}
              >
                {t.landing.ctaAsk}
              </Link>
              <Link
                href="/voice"
                className={`inline-flex min-h-12 items-center rounded-full border border-[oklch(80%_0.04_50)] bg-white/45 px-7 py-3 text-[15px] text-ink backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2 ${ctaFont}`}
              >
                🎤&nbsp;{t.landing.ctaTalk}
              </Link>
              <Link
                href="/demo"
                className={`inline-flex min-h-12 items-center rounded-full px-3 py-3 text-[15px] text-ink-soft underline decoration-[oklch(80%_0.06_80)] decoration-1 underline-offset-4 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2 ${ctaFont}`}
              >
                {t.landing.ctaGlimpse}
              </Link>
            </div>

            {/* Private by design */}
            <div className="mt-8 border-t border-[var(--color-ink-line)] pt-6">
              <div className="flex items-start gap-3 rounded-[20px] border border-[oklch(85%_0.02_50)] bg-white/40 p-5 shadow-[0_4px_20px_-8px_oklch(50%_0.1_30_/_0.15)] backdrop-blur lg:max-w-[560px]">
                <div className="mt-0.5 shrink-0 rounded-full bg-[oklch(94%_0.03_60)] p-1.5 text-[oklch(78%_0.1_12)] shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div>
                  <p className={`text-[14px] font-medium text-ink ${ctaFont}`}>
                    {t.landing.dataTitle}
                  </p>
                  <p className={`mt-0.5 text-[13px] leading-relaxed text-ink-soft ${proseFont}`}>
                    {t.landing.dataDisclaimer}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* \u2500\u2500 What can you ask? \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        <section
          aria-labelledby="landing-questions-title"
          className="fade-up mt-14 border-t border-[var(--color-ink-line)] pt-8 [animation-delay:360ms] [animation-fill-mode:backwards] lg:mt-10"
        >
          <p
            className={`font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.32em] text-ink-faint ${
              lang === "hi" ? "font-[family-name:var(--font-devanagari)] tracking-[0.08em]" : ""
            }`}
          >
            {casualCopy.eyebrow}
          </p>
          <h2
            id="landing-questions-title"
            className={`mt-3 max-w-[760px] text-[clamp(1.65rem,4vw,2.75rem)] font-normal leading-tight text-ink ${displayFont}`}
          >
            {casualCopy.title}
          </h2>
          <p
            className={`mt-4 max-w-[760px] text-base leading-relaxed text-ink-soft ${proseFont}`}
          >
            {casualCopy.body}
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {casualCopy.prompts.map((q, i) => (
              <p
                key={i}
                className={`rounded-2xl border border-[oklch(86%_0.04_70)] bg-white/45 px-5 py-3.5 text-base leading-relaxed text-ink backdrop-blur ${
                  lang === "hi"
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-serif)] italic"
                }`}
              >
                <span aria-hidden className="text-[var(--color-gold-leaf)]">“</span>
                {q}
                <span aria-hidden className="text-[var(--color-gold-leaf)]">”</span>
              </p>
            ))}
          </div>
          {/* "You don't need to be a scripture expert" */}
          <p
            className={`mt-5 max-w-[520px] text-sm leading-relaxed text-ink-soft ${proseFont}`}
          >
            {t.landing.naturalLine}
          </p>
        </section>

        {/* \u2500\u2500 Why trust Divya Vani? \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
        <section
          aria-labelledby="landing-trust-title"
          className="mt-14 border-t border-[var(--color-ink-line)] pt-8 lg:mt-12"
        >
          <p
            className={`font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.32em] text-ink-faint ${
              lang === "hi" ? "font-[family-name:var(--font-devanagari)] tracking-[0.08em]" : ""
            }`}
          >
            {trustCopy.eyebrow}
          </p>
          <h2
            id="landing-trust-title"
            className={`mt-3 max-w-[760px] text-[clamp(1.65rem,4vw,2.75rem)] font-normal leading-tight text-ink ${displayFont}`}
          >
            {trustCopy.title}
          </h2>
          <p
            className={`mt-4 max-w-[760px] text-base leading-relaxed text-ink-soft ${proseFont}`}
          >
            {trustCopy.body}
          </p>
          {/* Verse-count cards — the single place corpus breakdown appears. */}
          <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {verses.map((v) => (
              <div
                key={v.source}
                className="rounded-[20px] border border-[oklch(86%_0.04_70)] bg-white/55 px-6 py-6 text-center shadow-[0_8px_24px_-16px_oklch(40%_0.08_30_/_0.25)] backdrop-blur"
              >
                <p className="font-[family-name:var(--font-display)] text-[clamp(2rem,6vw,2.75rem)] leading-none text-[var(--color-gold-leaf)]">
                  {v.count}
                </p>
                <p
                  className={`mt-2 text-sm text-ink-soft ${
                    lang === "hi"
                      ? "font-[family-name:var(--font-devanagari)]"
                      : "font-[family-name:var(--font-display)] uppercase tracking-[0.14em]"
                  }`}
                >
                  {v.source}
                </p>
              </div>
            ))}
          </div>
          {/* Goal line */}
          <p
            className={`mt-6 max-w-[520px] text-sm leading-relaxed text-ink-soft ${proseFont}`}
          >
            {t.landing.goalLine}
          </p>
        </section>

        {/* ────── Bottom CTAs + Disclaimer ─────────────────────────── */}
        <section className="mt-10 border-t border-[var(--color-ink-line)] pt-8 lg:mt-10">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link
              href="/chat"
              className={`inline-flex min-h-12 items-center rounded-full border border-[oklch(80%_0.04_50)] bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] px-8 py-3.5 text-[15px] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_6px_18px_-8px_oklch(50%_0.1_30_/_0.25)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2 ${ctaFont}`}
            >
              {t.landing.ctaAsk}
            </Link>
            <Link
              href="/voice"
              className={`inline-flex min-h-12 items-center rounded-full border border-[oklch(80%_0.04_50)] bg-white/45 px-7 py-3 text-[15px] text-ink backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2 ${ctaFont}`}
            >
              🎤&nbsp;{t.landing.ctaTalk}
            </Link>
            <Link
              href="/pricing"
              className={`inline-flex min-h-12 items-center rounded-full px-3 py-3 text-[15px] text-ink-soft underline decoration-[oklch(80%_0.06_80)] decoration-1 underline-offset-4 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2 ${ctaFont}`}
            >
              {t.landing.ctaPricing}
            </Link>
          </div>

          {/* Full disclaimer — visible, calm */}
          <p
            className={`mt-8 max-w-[680px] text-xs leading-relaxed text-ink-faint ${proseFont}`}
          >
            {BRAND.disclaimer[lang]}
            {" "}
            {lang === "hi"
              ? "यह चिकित्सा, कानूनी, वित्तीय या मानसिक-स्वास्थ्य सलाह नहीं है।"
              : "It is not therapy, medical, legal, or financial advice."}
          </p>
        </section>
      </div>

      <DevoteeSilhouettes height={84} opacity={0.28} />
    </main>
  );
}
