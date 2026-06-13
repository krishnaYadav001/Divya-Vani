"use client";

import Link from "next/link";
import { BRAND } from "@/lib/brand";
import Atmosphere from "../components/Atmosphere";
import Wordmark from "../components/motifs/Wordmark";
import YouTubeFacade from "./YouTubeFacade";
import { ScreenshotTile } from "./DemoSections";
import DemoFeedback from "./DemoFeedback";
import { useLanguage } from "../providers/LanguageProvider";

// Phase 12 (i18n) — client body of /demo, split out of the (server) page so
// its marketing chrome (hero, section headers, CTAs, free-messages line, the
// voice teaser, empty states, disclaimer) follows the EN/हिन्दी toggle instead
// of always stacking both. The example Q&A replies + the video/screenshot
// content come from data/demo-content.json and are NOT product chrome — the
// example questions/replies render verbatim (a Krishna sample reply is content,
// not a label), while video/screenshot titles show the active language. The
// page metadata stays in the server page.tsx.

type Video = { id: string; title_hi: string; title_en: string; short?: boolean };
type Screenshot = { src: string; alt_hi: string; alt_en: string };
type Example = {
  question_lang: "hi" | "en";
  question: string;
  reply: string;
};

export type DemoContent = {
  videos: Video[];
  screenshots: Screenshot[];
  examples: Example[];
};

export default function DemoClient({ content }: { content: DemoContent }) {
  const { lang, t } = useLanguage();
  const td = t.demo;
  const trustCopy = BRAND.trust[lang];
  const casualCopy = BRAND.casual[lang];

  // CTA + prose fonts switch with language (Devanagari face for Hindi; the
  // English serif/display otherwise — Cormorant/Marcellus have no Devanagari).
  const ctaFont =
    lang === "hi"
      ? "font-[family-name:var(--font-devanagari)]"
      : "font-[family-name:var(--font-serif)]";
  const proseFont =
    lang === "hi"
      ? "font-[family-name:var(--font-devanagari)]"
      : "font-[family-name:var(--font-serif)] italic";

  // Repeated CTA button styling — the gold-rim peach-cream hero button. Font is
  // appended per-language at each use.
  const PRIMARY_CTA =
    "inline-flex min-h-12 items-center rounded-full border border-[oklch(80%_0.04_50)] bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] px-8 py-3.5 text-[15px] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_6px_18px_-8px_oklch(50%_0.1_30_/_0.25)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2";

  return (
    <main className="relative flex-1 overflow-x-hidden overflow-y-auto">
      <Atmosphere mode="distant" intensity={1} vignette={0.5} />

      <div className="relative z-10 mx-auto w-full max-w-[1120px] px-5 pb-16 pt-5 sm:px-8 lg:px-12">
        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            aria-label={BRAND.name.en}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] rounded-md"
          >
            <Wordmark size="sm" stack="horizontal" />
          </Link>
          <nav className="flex items-center gap-6 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.26em] text-ink-soft sm:gap-8">
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
        <section className="fade-up mt-10 max-w-[720px] [animation-delay:0ms] [animation-fill-mode:backwards] sm:mt-14">
          <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.4em] text-ink-faint">
            Demo
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full bg-[oklch(78%_0.1_12)]"
            />
            Vol. 01
          </p>
          <h1
            className={`mt-3 text-[clamp(2rem,6vw,4rem)] font-normal leading-[1.05] text-ink ${
              lang === "hi"
                ? "font-[family-name:var(--font-devanagari)]"
                : "font-[family-name:var(--font-display)]"
            }`}
          >
            {td.hero}
          </h1>
          <p
            className={`mt-3 max-w-[520px] text-base leading-relaxed text-ink-soft sm:text-lg ${proseFont}`}
          >
            {td.heroBody}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href="/chat" className={`${PRIMARY_CTA} ${ctaFont}`}>
              {t.landing.ctaAsk}
            </Link>
            <Link
              href="/voice"
              className={`inline-flex min-h-12 items-center rounded-full border border-[oklch(80%_0.04_50)] bg-white/45 px-7 py-3 text-[15px] text-ink backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2 ${ctaFont}`}
            >
              🎤&nbsp;{t.landing.ctaTalk}
            </Link>
            <span className={`text-base leading-relaxed text-ink-soft ${ctaFont}`}>
              {t.landing.freeMessages}
            </span>
          </div>
        </section>

        {/* ── Feedback (star rating, near top per founder) ────────── */}
        <section
          aria-labelledby="demo-trust-title"
          className="mt-12 border-t border-[var(--color-ink-line)] pt-8"
        >
          <div className="grid gap-8 md:grid-cols-[1fr_0.9fr] md:items-start">
            <div>
              <p
                className={`font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.32em] text-ink-faint ${
                  lang === "hi"
                    ? "font-[family-name:var(--font-devanagari)] tracking-[0.08em]"
                    : ""
                }`}
              >
                {trustCopy.eyebrow}
              </p>
              <h2
                id="demo-trust-title"
                className={`mt-3 text-[clamp(1.65rem,4vw,2.75rem)] font-normal leading-tight text-ink ${
                  lang === "hi"
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-display)]"
                }`}
              >
                {trustCopy.title}
              </h2>
              <p
                className={`mt-4 text-base leading-relaxed text-ink-soft ${
                  lang === "hi"
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-serif)] italic"
                }`}
              >
                {trustCopy.body}
              </p>
              <p
                className={`mt-3 text-sm leading-relaxed text-ink-soft ${
                  lang === "hi"
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-serif)] italic"
                }`}
              >
                {trustCopy.supporting}
              </p>
            </div>
            <div className="border-t border-[var(--color-ink-line)] pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
              <p
                className={`font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.32em] text-ink-faint ${
                  lang === "hi"
                    ? "font-[family-name:var(--font-devanagari)] tracking-[0.08em]"
                    : ""
                }`}
              >
                {casualCopy.eyebrow}
              </p>
              <h3
                className={`mt-3 text-2xl font-normal leading-tight text-ink ${
                  lang === "hi"
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-display)]"
                }`}
              >
                {casualCopy.title}
              </h3>
              <p
                className={`mt-3 text-sm leading-relaxed text-ink-soft ${
                  lang === "hi"
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-serif)] italic"
                }`}
              >
                {casualCopy.body}
              </p>
              <ul className="mt-4 space-y-2">
                {casualCopy.prompts.slice(0, 4).map((prompt) => (
                  <li
                    key={prompt}
                    className={`border-t border-[var(--color-ink-line)] pt-2 text-sm leading-relaxed text-ink-soft ${
                      lang === "hi"
                        ? "font-[family-name:var(--font-devanagari)]"
                        : "font-[family-name:var(--font-serif)] italic"
                    }`}
                  >
                    {prompt}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p
            className={`mt-7 max-w-[760px] text-xs leading-relaxed text-ink-faint ${
              lang === "hi"
                ? "font-[family-name:var(--font-devanagari)]"
                : "font-[family-name:var(--font-serif)] italic"
            }`}
          >
            {BRAND.disclaimer[lang]}
          </p>
        </section>

        <DemoFeedback />

        {/* ── Demo videos ─────────────────────────────────────────── */}
        <section className="mt-16 sm:mt-20">
          <SectionHeader label={td.sectionRealConversations} />
          {content.videos.length === 0 ? (
            <EmptyState />
          ) : (
            <div className={`mt-7 ${
              content.videos.length === 1 && content.videos[0].short
                ? "flex justify-center"
                : "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
            }`}>
              {content.videos.map((v, i) => (
                <div
                  key={`${v.id}-${i}`}
                  className={v.short ? "w-full max-w-[320px]" : undefined}
                >
                  <YouTubeFacade
                    id={v.id}
                    titleHi={v.title_hi}
                    titleEn={v.title_en}
                    short={v.short}
                  />
                  <p
                    className={`mt-2 text-sm leading-relaxed text-ink-soft ${
                      lang === "hi"
                        ? "font-[family-name:var(--font-devanagari)]"
                        : "font-[family-name:var(--font-serif)] italic"
                    } ${v.short ? "text-center" : ""}`}
                  >
                    {lang === "hi" ? v.title_hi : v.title_en}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Screenshot gallery ──────────────────────────────────── */}
        <section className="mt-16 sm:mt-20">
          <SectionHeader label={td.sectionHowItLooks} />
          {content.screenshots.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="mt-7 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4">
              {content.screenshots.map((s, i) => (
                <ScreenshotTile
                  key={`${s.src}-${i}`}
                  src={s.src}
                  altHi={s.alt_hi}
                  altEn={s.alt_en}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Disclaimer (above Q&A — Locked Decision #1) ─────────── */}
        <div className="dv-hairline mt-16 sm:mt-20" />
        <p
          className={`mx-auto mt-5 max-w-[640px] text-center text-xs leading-relaxed text-brass-dark ${
            lang === "hi"
              ? "font-[family-name:var(--font-devanagari)]"
              : "font-[family-name:var(--font-serif)] italic"
          }`}
        >
          {BRAND.disclaimer[lang]}
        </p>

        {/* ── Example Q&A ─────────────────────────────────────────── */}
        <section className="mt-10">
          <SectionHeader label={td.sectionHowKrishnaReplies} />
          {content.examples.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="mx-auto mt-7 flex max-w-[640px] flex-col gap-6">
              {content.examples.map((ex, i) => {
                const isHi = ex.question_lang === "hi";
                const exFont = isHi
                  ? "font-[family-name:var(--font-devanagari)]"
                  : "font-[family-name:var(--font-serif)] italic";
                return (
                  <article
                    key={i}
                    className="rounded-2xl border border-[oklch(86%_0.04_70)] bg-white/55 px-5 py-5 shadow-[0_8px_24px_-16px_oklch(40%_0.08_30_/_0.25)] backdrop-blur sm:px-7 sm:py-6"
                  >
                    <p
                      className={`${exFont} text-sm leading-relaxed text-ink-soft sm:text-[15px]`}
                    >
                      {ex.question}
                    </p>
                    <div className="dv-hairline my-4" />
                    <p
                      className={`${exFont} text-base leading-[1.65] text-ink sm:text-lg`}
                    >
                      {ex.reply}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Krishna Voice — LIVE ────────────────────────────────── */}
        <section className="mt-16 sm:mt-20">
          <SectionHeader label={td.sectionVoiceLive} />
          <div className="mx-auto mt-7 max-w-[640px] rounded-2xl border border-[oklch(86%_0.04_70)] bg-linear-to-br from-[var(--color-buttermilk)] to-[var(--color-peach)] px-5 py-6 text-center sm:px-7 sm:py-8">
            <p
              className={`text-base leading-relaxed text-ink sm:text-lg ${
                lang === "hi"
                  ? "font-[family-name:var(--font-devanagari)]"
                  : "font-[family-name:var(--font-serif)] italic"
              }`}
            >
              {td.voiceTeaserBody}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href="/voice" className={`${PRIMARY_CTA} ${ctaFont}`}>
                🎤&nbsp;{td.tryVoiceFree}
              </Link>
            </div>
          </div>
        </section>

        {/* ── Footer CTA — start in chat or voice, or see pricing ──── */}
        <section className="mt-16 flex flex-col items-center gap-4 sm:mt-20">
          <p
            className={`max-w-[520px] text-center text-base leading-relaxed text-ink-soft ${
              lang === "hi"
                ? "font-[family-name:var(--font-devanagari)]"
                : "font-[family-name:var(--font-serif)] italic"
            }`}
          >
            {td.closingNote}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
            <Link href="/chat" className={`${PRIMARY_CTA} ${ctaFont}`}>
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
        </section>
      </div>
    </main>
  );
}

function SectionHeader({ label }: { label: string }) {
  const { lang } = useLanguage();
  return (
    <div className="flex flex-col gap-1">
      <h2
        className={`text-[clamp(1.5rem,4vw,2.25rem)] leading-[1.2] text-ink ${
          lang === "hi"
            ? "font-[family-name:var(--font-devanagari)]"
            : "font-[family-name:var(--font-display)]"
        }`}
      >
        {label}
      </h2>
    </div>
  );
}

function EmptyState() {
  const { lang, t } = useLanguage();
  return (
    <div className="mt-7 rounded-2xl border border-dashed border-[oklch(86%_0.04_70)] bg-white/30 px-5 py-10 text-center">
      <p
        className={`text-base text-ink-soft ${
          lang === "hi"
            ? "font-[family-name:var(--font-devanagari)]"
            : "font-[family-name:var(--font-serif)] italic"
        }`}
      >
        {t.demo.comingSoon}
      </p>
    </div>
  );
}
