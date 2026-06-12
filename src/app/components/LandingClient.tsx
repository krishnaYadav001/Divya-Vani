"use client";

import Link from "next/link";
import Image from "next/image";
import { BRAND } from "@/lib/brand";
import Atmosphere from "./Atmosphere";
import Wordmark from "./motifs/Wordmark";
import DevoteeSilhouettes from "./motifs/DevoteeSilhouettes";
import { useLanguage } from "../providers/LanguageProvider";

// Phase 12 — client hero split out of the (server) landing page so the CTAs,
// body prose, free-messages line, and disclaimer can follow the EN/हिन्दी
// toggle. Layout is byte-for-byte the Dawn Aarti "Landing C" mock; only the
// language-dependent strings + their per-language font change. The Latin
// masthead (nav, "Mathurā Edition"), the Sanskrit quote + attribution, the
// mūrti caption, and the wordmark are intentionally NOT switched.

const SANSKRIT = "“कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।”";

const ARCH_SHADOW =
  "0 28px 70px -30px oklch(35% 0.08 30 / .35), 0 0 0 1px oklch(78% 0.06 60), inset 0 0 0 6px rgba(255,255,255,.5)";

const LANDING_FACTS = {
  en: {
    eyebrow: "Direct answers",
    title: "What Divya Vani gives you",
    items: [
      {
        question: "What is Divya Vani?",
        answer:
          "Divya Vani is an AI that roleplays Krishna from the Bhagavad Gita, Mahabharata, and Bhagavata Purana. You can speak about life, emotions, relationships, and dharma while seeing scripture-grounded verse references.",
      },
      {
        question: "Is this really Krishna?",
        answer:
          "No. Divya Vani is an AI roleplaying Krishna based on scripture. It does not claim to be divine, and a permanent disclaimer stays visible in the chat and voice experience.",
      },
      {
        question: "Which scriptures are used?",
        answer:
          "The current corpus has 3,132 verses: 701 from the Bhagavad Gita, 1,704 from the Mahabharata, and 727 from the Bhagavata Purana.",
      },
      {
        question: "How does pricing work?",
        answer:
          "Divya Vani includes 10 free messages. One-time seva tiers start at INR 11, and paid voice or subscription plans are shown on the Pricing page when available.",
      },
    ],
  },
  hi: {
    eyebrow: "सीधे उत्तर",
    title: "दिव्य वाणी आपको क्या देती है",
    items: [
      {
        question: "दिव्य वाणी क्या है?",
        answer:
          "दिव्य वाणी एक AI है जो भगवद्गीता, महाभारत और भागवत पुराण के कृष्ण-स्वरूप का अभिनय करता है। आप जीवन, भावनाओं, रिश्तों और धर्म पर बात कर सकते हैं; उत्तरों में शास्त्र-संदर्भ दिखाए जाते हैं।",
      },
      {
        question: "क्या यह सचमुच भगवान कृष्ण हैं?",
        answer:
          "नहीं। यह शास्त्र-आधारित AI अभिनय है, दैवीय मार्गदर्शन का दावा नहीं। चैट और आवाज़ अनुभव में यह पहचान-सूचना हमेशा दिखाई जाती है।",
      },
      {
        question: "कौन-सी भाषाएँ और ग्रंथ हैं?",
        answer:
          "दिव्य वाणी हिंदी-प्रथम है, अंग्रेज़ी और संस्कृत भी समझती है। वर्तमान संग्रह में 3,132 श्लोक हैं: गीता के 701, महाभारत के 1,704 और भागवत पुराण के 727।",
      },
      {
        question: "कितना खर्च है?",
        answer:
          "10 संदेश निःशुल्क मिलते हैं। उसके बाद एक-बार की सेवा ₹11 से शुरू होती है; आवाज़ और सदस्यता योजनाएँ Pricing पेज पर दी गई हैं।",
      },
    ],
  },
} as const;

export default function LandingClient() {
  const { lang, t } = useLanguage();
  const [nameHead, ...nameRest] = BRAND.name.en.split(" ");
  const facts = LANDING_FACTS[lang];

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

  return (
    <main className="relative flex-1 overflow-x-hidden overflow-y-auto">
      <Atmosphere mode="hero" intensity={1} vignette={1} />

      <div className="relative z-10 mx-auto flex w-full max-w-[1320px] flex-col px-5 py-5 sm:px-8 lg:min-h-full lg:justify-center lg:px-14 lg:py-4">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-4">
          <Wordmark size="sm" stack="horizontal" />
          <nav className="flex items-center gap-6 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.26em] text-ink-soft sm:gap-8">
            <Link
              href="/contact"
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
          {/* ── Arch portal (height-driven on desktop) ──────────── */}
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

          {/* ── Text composition ────────────────────────────────── */}
          <div className="fade-up min-w-0 [animation-delay:180ms] [animation-fill-mode:backwards]">
            <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.75rem,8vw,6.5rem)] font-normal leading-[0.88] text-ink">
              {nameHead}
              <br />
              {nameRest.join(" ")}.
            </h1>

            <p
              className={`mt-5 max-w-[460px] text-base leading-relaxed text-ink-soft lg:text-lg ${proseFont}`}
            >
              {t.landing.body}
            </p>

            {/* Verse-citation proof — the credibility hook for the
                scripture-literate visitor. Kept understated (smaller, soft)
                so it reads as a credential, not a second tagline. */}
            <p
              className={`mt-3 max-w-[460px] text-sm leading-relaxed text-ink-soft ${proseFont}`}
            >
              {t.landing.proof}
            </p>

            {/* CTA */}
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href="/chat"
                className={`inline-flex min-h-12 items-center rounded-full border border-[oklch(80%_0.04_50)] bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] px-8 py-3.5 text-[15px] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_6px_18px_-8px_oklch(50%_0.1_30_/_0.25)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2 ${ctaFont}`}
              >
                {t.landing.ctaAsk}
              </Link>
              <Link
                href="/demo"
                className={`inline-flex min-h-12 items-center rounded-full border border-[oklch(80%_0.04_50)] bg-white/45 px-7 py-3 text-[15px] text-ink backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2 ${ctaFont}`}
              >
                {t.landing.ctaGlimpse}
              </Link>
              {/* Phase 10.5 — voice-to-voice mode entry. */}
              <Link
                href="/voice"
                className={`inline-flex min-h-12 items-center rounded-full border border-[oklch(80%_0.04_50)] bg-white/45 px-7 py-3 text-[15px] text-ink backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2 ${ctaFont}`}
              >
                🎤&nbsp;{t.landing.ctaTalk}
              </Link>
              <span
                className={`text-base leading-relaxed text-ink-soft ${ctaFont}`}
              >
                {t.landing.freeMessages}
              </span>
            </div>

            {/* Privacy Card */}
            <div className="mt-8 flex items-start gap-3 rounded-[20px] border border-[oklch(85%_0.02_50)] bg-white/40 p-4 shadow-[0_4px_20px_-8px_oklch(50%_0.1_30_/_0.15)] backdrop-blur lg:max-w-[480px]">
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

            {/* Sanskrit quote */}
            <div className="mt-8 border-t border-[var(--color-ink-line)] pt-4">
              <p className="font-[family-name:var(--font-devanagari)] text-lg italic leading-[1.55] text-ink-soft">
                {SANSKRIT}
              </p>
              <p className="mt-1.5 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-[0.3em] text-ink-faint">
                — Bhagavad Gita 2.47
              </p>
            </div>

            {/* Subtle identity line (Locked Decision #1) — follows the
                language toggle; BRAND.disclaimer carries both en + hi. */}
            <p
              className={`mt-5 text-xs leading-relaxed text-ink-faint ${proseFont}`}
            >
              {BRAND.disclaimer[lang]}
            </p>
          </div>
        </div>

        <section
          aria-labelledby="landing-facts-title"
          className="fade-up mt-14 border-t border-[var(--color-ink-line)] pt-8 [animation-delay:360ms] [animation-fill-mode:backwards] lg:mt-10"
        >
          <p
            className={`font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.32em] text-ink-faint ${
              lang === "hi" ? "font-[family-name:var(--font-devanagari)] tracking-[0.08em]" : ""
            }`}
          >
            {facts.eyebrow}
          </p>
          <h2
            id="landing-facts-title"
            className={`mt-3 max-w-[760px] text-[clamp(1.65rem,4vw,2.75rem)] font-normal leading-tight text-ink ${
              lang === "hi"
                ? "font-[family-name:var(--font-devanagari)]"
                : "font-[family-name:var(--font-display)]"
            }`}
          >
            {facts.title}
          </h2>
          <div className="mt-7 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {facts.items.map((item) => (
              <article
                key={item.question}
                className="border-t border-[var(--color-ink-line)] pt-4"
              >
                <h3
                  className={`text-lg font-normal leading-snug text-ink ${
                    lang === "hi"
                      ? "font-[family-name:var(--font-devanagari)]"
                      : "font-[family-name:var(--font-display)]"
                  }`}
                >
                  {item.question}
                </h3>
                <p
                  className={`mt-2 text-sm leading-relaxed text-ink-soft ${
                    lang === "hi"
                      ? "font-[family-name:var(--font-devanagari)]"
                      : "font-[family-name:var(--font-serif)] italic"
                  }`}
                >
                  {item.answer}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <DevoteeSilhouettes height={84} opacity={0.28} />
    </main>
  );
}
