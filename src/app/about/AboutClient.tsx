"use client";

import Link from "next/link";
import { BRAND } from "@/lib/brand";
import Atmosphere from "../components/Atmosphere";
import Wordmark from "../components/motifs/Wordmark";
import { useLanguage } from "../providers/LanguageProvider";

// Phase 12.x — public /about page. A trust surface for the target audience
// (NRIs, global seekers, Krishna devotees) that says, plainly, what Divya
// Vani is, who built it, why it exists, and what it is NOT (the respectful
// AI disclaimer, Locked Decision #1). Bilingual like /demo + the landing —
// the copy follows the EN/हिन्दी toggle. Legal/admin pages stay English-only,
// but /about is a marketing/trust page, so it honours the brand's Hindi-first
// register. Page metadata + JSON-LD live in the server page.tsx.

const ABOUT = {
  en: {
    eyebrow: "About",
    title: "About Divya Vani",
    intro:
      "Divya Vani is built to make Krishna's wisdom easier to access for people living modern lives. It helps you chat or speak with Krishna AI and receive scripture-backed reflections from the Bhagavad Gita, Mahabharata, and Bhagavata Purana.",
    missionTitle: "Our mission",
    mission:
      "To make Indian scripture feel personal, accessible, and practical for people across the world — especially NRIs, global seekers, Krishna devotees, and anyone looking for spiritual reflection in daily life.",
    founderTitle: "Who built it",
    founder: "Built by Krishna Yadav, a solo founder from India.",
    scriptureTitle: "Grounded in 3,132 scripture verses",
    verses: [
      { count: "701", source: "Bhagavad Gita" },
      { count: "1,704", source: "Mahabharata" },
      { count: "727", source: "Bhagavata Purana" },
    ],
    disclaimerTitle: "An honest word",
    disclaimer:
      "Divya Vani is not the real Krishna and does not claim to provide divine guidance. It is an AI-based spiritual reflection tool grounded in selected scriptures. It is not therapy, medical, legal, or financial advice.",
    ctaNote: "Begin whenever you're ready.",
    back: "Back to Divya Vani",
  },
  hi: {
    eyebrow: "हमारे बारे में",
    title: "दिव्य वाणी के बारे में",
    intro:
      "दिव्य वाणी इसलिए बनाई गई है ताकि आधुनिक जीवन जीने वाले लोगों तक कृष्ण का ज्ञान सहज पहुँच सके। यह आपको कृष्ण AI से चैट या आवाज़ में बात करने और भगवद्गीता, महाभारत व भागवत पुराण से शास्त्र-आधारित उत्तर पाने में मदद करती है।",
    missionTitle: "हमारा उद्देश्य",
    mission:
      "भारतीय शास्त्रों को दुनिया भर के लोगों के लिए निजी, सुलभ और व्यावहारिक बनाना — विशेषकर प्रवासी भारतीयों, वैश्विक जिज्ञासुओं, कृष्ण-भक्तों और रोज़मर्रा में आध्यात्मिक चिंतन चाहने वालों के लिए।",
    founderTitle: "किसने बनाया",
    founder: "भारत के एक एकल संस्थापक कृष्ण यादव द्वारा निर्मित।",
    scriptureTitle: "3,132 श्लोकों पर आधारित",
    verses: [
      { count: "701", source: "भगवद्गीता" },
      { count: "1,704", source: "महाभारत" },
      { count: "727", source: "भागवत पुराण" },
    ],
    disclaimerTitle: "एक ईमानदार बात",
    disclaimer:
      "दिव्य वाणी असली कृष्ण नहीं है और दैवीय मार्गदर्शन देने का दावा नहीं करती। यह चुनिंदा शास्त्रों पर आधारित एक AI-आधारित आध्यात्मिक चिंतन साधन है। यह चिकित्सा, कानूनी, वित्तीय या मानसिक-स्वास्थ्य सलाह नहीं है।",
    ctaNote: "जब मन हो, तभी शुरू करें।",
    back: "दिव्य वाणी पर लौटें",
  },
} as const;

const PRIMARY_CTA =
  "inline-flex min-h-12 items-center rounded-full border border-[oklch(80%_0.04_50)] bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] px-8 py-3.5 text-[15px] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_6px_18px_-8px_oklch(50%_0.1_30_/_0.25)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2";
const SECONDARY_CTA =
  "inline-flex min-h-12 items-center rounded-full border border-[oklch(80%_0.04_50)] bg-white/45 px-7 py-3 text-[15px] text-ink backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2";
const TEXT_CTA =
  "inline-flex min-h-12 items-center rounded-full px-3 py-3 text-[15px] text-ink-soft underline decoration-[oklch(80%_0.06_80)] decoration-1 underline-offset-4 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2";

export default function AboutClient() {
  const { lang, t } = useLanguage();
  const a = ABOUT[lang];

  const headingFont =
    lang === "hi"
      ? "font-[family-name:var(--font-devanagari)]"
      : "font-[family-name:var(--font-display)]";
  const proseFont =
    lang === "hi"
      ? "font-[family-name:var(--font-devanagari)]"
      : "font-[family-name:var(--font-serif)] italic";
  const ctaFont =
    lang === "hi"
      ? "font-[family-name:var(--font-devanagari)]"
      : "font-[family-name:var(--font-serif)]";

  return (
    <main className="relative flex-1 overflow-x-hidden overflow-y-auto">
      <Atmosphere mode="distant" intensity={1} vignette={0.5} />

      <div className="relative z-10 mx-auto w-full max-w-[920px] px-5 pb-16 pt-5 sm:px-8 lg:px-12">
        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            aria-label={BRAND.name.en}
            className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)]"
          >
            <Wordmark size="sm" stack="horizontal" />
          </Link>
          <nav className="flex items-center gap-6 text-[11px] uppercase tracking-[0.26em] text-ink-soft sm:gap-8">
            <Link
              href="/chat"
              className="inline-flex min-h-9 items-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/45 px-4 py-1.5 text-[11px] tracking-[0.2em] text-ink backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)]"
            >
              Begin →
            </Link>
          </nav>
        </header>

        <div className="dv-hairline mt-5" />

        {/* ── Hero ────────────────────────────────────────────────── */}
        <section className="fade-up mt-10 max-w-[680px] [animation-delay:0ms] [animation-fill-mode:backwards] sm:mt-14">
          <p
            className={`font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.4em] text-ink-faint ${
              lang === "hi" ? "font-[family-name:var(--font-devanagari)] tracking-[0.08em]" : ""
            }`}
          >
            {a.eyebrow}
          </p>
          <h1
            className={`mt-3 text-[clamp(2rem,6vw,3.75rem)] font-normal leading-[1.05] text-ink ${headingFont}`}
          >
            {a.title}
          </h1>
          <p className={`mt-5 text-base leading-relaxed text-ink-soft sm:text-lg ${proseFont}`}>
            {a.intro}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link href="/chat" className={`${PRIMARY_CTA} ${ctaFont}`}>
              {t.landing.ctaAsk}
            </Link>
            <Link href="/voice" className={`${SECONDARY_CTA} ${ctaFont}`}>
              🎤&nbsp;{t.landing.ctaTalk}
            </Link>
            <Link href="/pricing" className={`${TEXT_CTA} ${ctaFont}`}>
              {t.landing.ctaPricing}
            </Link>
          </div>
        </section>

        {/* ── Mission ─────────────────────────────────────────────── */}
        <section className="mt-14 border-t border-[var(--color-ink-line)] pt-8">
          <h2 className={`text-[clamp(1.4rem,4vw,2rem)] leading-tight text-ink ${headingFont}`}>
            {a.missionTitle}
          </h2>
          <p className={`mt-3 max-w-[640px] text-base leading-relaxed text-ink-soft sm:text-lg ${proseFont}`}>
            {a.mission}
          </p>
        </section>

        {/* ── Founder ─────────────────────────────────────────────── */}
        <section className="mt-14 border-t border-[var(--color-ink-line)] pt-8">
          <h2 className={`text-[clamp(1.4rem,4vw,2rem)] leading-tight text-ink ${headingFont}`}>
            {a.founderTitle}
          </h2>
          <p className={`mt-3 max-w-[640px] text-base leading-relaxed text-ink-soft sm:text-lg ${proseFont}`}>
            {a.founder}
          </p>
        </section>

        {/* ── Scripture corpus ────────────────────────────────────── */}
        <section className="mt-14 border-t border-[var(--color-ink-line)] pt-8">
          <h2 className={`text-[clamp(1.4rem,4vw,2rem)] leading-tight text-ink ${headingFont}`}>
            {a.scriptureTitle}
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {a.verses.map((v) => (
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
        </section>

        {/* ── Honest word / disclaimer (Locked Decision #1) ───────── */}
        <section className="mt-14 border-t border-[var(--color-ink-line)] pt-8">
          <h2 className={`text-[clamp(1.4rem,4vw,2rem)] leading-tight text-ink ${headingFont}`}>
            {a.disclaimerTitle}
          </h2>
          <p className={`mt-3 max-w-[640px] text-base leading-relaxed text-ink-soft ${proseFont}`}>
            {a.disclaimer}
          </p>
          <p className={`mt-3 max-w-[640px] text-sm leading-relaxed text-ink-faint ${proseFont}`}>
            {BRAND.disclaimer[lang]}
          </p>
        </section>

        {/* ── Closing CTA ─────────────────────────────────────────── */}
        <section className="mt-16 flex flex-col items-center gap-4 sm:mt-20">
          <p className={`text-center text-base leading-relaxed text-ink-soft ${proseFont}`}>
            {a.ctaNote}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
            <Link href="/chat" className={`${PRIMARY_CTA} ${ctaFont}`}>
              {t.landing.ctaAsk}
            </Link>
            <Link href="/voice" className={`${SECONDARY_CTA} ${ctaFont}`}>
              🎤&nbsp;{t.landing.ctaTalk}
            </Link>
          </div>
          <Link href="/" className={`mt-2 text-sm text-ink-faint underline decoration-[oklch(80%_0.06_80)] underline-offset-4 hover:text-ink ${ctaFont}`}>
            ← {a.back}
          </Link>
        </section>
      </div>
    </main>
  );
}
