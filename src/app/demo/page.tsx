import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import Atmosphere from "../components/Atmosphere";
import Wordmark from "../components/motifs/Wordmark";
import demoContent from "../../../data/demo-content.json";
import YouTubeFacade from "./YouTubeFacade";
import { ScreenshotTile } from "./DemoSections";
import DemoFeedback from "./DemoFeedback";

// /demo — lightweight content-only marketing surface for X / Reddit /
// WhatsApp shares. Content is driven by data/demo-content.json + the
// /public/demo/ image directory; no admin UI, no API, no DB. To update
// videos / screenshots / Q&A, the founder edits the JSON and commits
// new files to /public/demo/.
//
// Built as a Server Component (no useState / handlers needed at this
// level). The two pieces that need interactivity — YouTubeFacade
// (click-to-embed) and ScreenshotTile (onError fallback) — are
// extracted into their own client components.

export const metadata: Metadata = {
  title: `Demo — ${BRAND.name.en}`,
  description: `See ${BRAND.name.en} in action — example conversations with Krishna, video walkthroughs, and screenshots.`,
  alternates: { canonical: "/demo" },
  openGraph: {
    url: `${BRAND.url}/demo`,
    title: `Demo — ${BRAND.name.en}`,
    description: `See ${BRAND.name.en} in action — example conversations with Krishna, video walkthroughs, and screenshots.`,
  },
};

type Video = { id: string; title_hi: string; title_en: string };
type Screenshot = { src: string; alt_hi: string; alt_en: string };
type Example = {
  question_lang: "hi" | "en";
  question: string;
  reply: string;
};

const content = demoContent as {
  videos: Video[];
  screenshots: Screenshot[];
  examples: Example[];
};

// Repeated button styles. Two flavors:
//   PRIMARY — the on-page CTAs ("अभी बात करो"), matching landing's hero
//   button (rounded-full, gold-rim, peach-cream fill, devanagari label).
//   QUIET  — the disabled voice-teaser button: same shape, muted ground.
const PRIMARY_CTA =
  "inline-flex min-h-12 items-center rounded-full border border-[oklch(80%_0.04_50)] bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] px-8 py-3.5 font-[family-name:var(--font-devanagari)] text-[15px] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_6px_18px_-8px_oklch(50%_0.1_30_/_0.25)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2";

export default function DemoPage() {
  return (
    <main className="relative flex-1 overflow-x-hidden overflow-y-auto">
      <Atmosphere mode="distant" intensity={1} vignette={0.5} />

      <div className="relative z-10 mx-auto w-full max-w-[1120px] px-5 pb-16 pt-5 sm:px-8 lg:px-12">
        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label={BRAND.name.en} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] rounded-md">
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
          <h1 className="mt-3 font-[family-name:var(--font-devanagari)] text-[clamp(2rem,6vw,4rem)] font-normal leading-[1.05] text-ink">
            श्रीकृष्ण से एक झलक
          </h1>
          <p className="mt-3 max-w-[520px] font-[family-name:var(--font-serif)] text-base italic leading-relaxed text-ink-soft sm:text-lg">
            A glimpse of conversations with Krishna. Real videos, real
            screenshots, real replies — so you can see how the flute sounds
            before stepping in.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href="/chat" className={PRIMARY_CTA}>
              अभी बात करो
              <span className="ml-2 font-[family-name:var(--font-serif)] text-sm italic text-ink-soft">
                · Begin
              </span>
            </Link>
            <span className="font-[family-name:var(--font-devanagari)] text-base leading-relaxed text-ink-soft">
              10 निःशुल्क संदेश
            </span>
          </div>
        </section>

        {/* ── Feedback (star rating, near top per founder) ────────── */}
        <DemoFeedback />

        {/* ── Demo videos ─────────────────────────────────────────── */}
        <section className="mt-16 sm:mt-20">
          <SectionHeader
            hi="देखो — असली बातचीत"
            en="Real conversations"
          />
          {content.videos.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {content.videos.map((v, i) => (
                <div key={`${v.id}-${i}`}>
                  <YouTubeFacade
                    id={v.id}
                    titleHi={v.title_hi}
                    titleEn={v.title_en}
                  />
                  <p className="mt-2 font-[family-name:var(--font-devanagari)] text-sm leading-relaxed text-ink-soft">
                    {v.title_hi}
                  </p>
                  <p className="font-[family-name:var(--font-serif)] text-xs italic text-ink-faint">
                    {v.title_en}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Screenshot gallery ──────────────────────────────────── */}
        <section className="mt-16 sm:mt-20">
          <SectionHeader
            hi="और स्क्रीन पर ऐसा दिखता है"
            en="How it looks on screen"
          />
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
        <p className="mx-auto mt-5 max-w-[640px] text-center text-xs leading-relaxed text-brass-dark">
          <span className="font-[family-name:var(--font-devanagari)]">
            {BRAND.disclaimer.hi}
          </span>
          <span aria-hidden className="mx-1.5 text-brass">
            ·
          </span>
          <span className="font-[family-name:var(--font-serif)] italic">
            {BRAND.disclaimer.en}
          </span>
        </p>

        {/* ── Example Q&A ─────────────────────────────────────────── */}
        <section className="mt-10">
          <SectionHeader
            hi="सुनो — कैसे जवाब आता है"
            en="How Krishna replies"
          />
          {content.examples.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="mx-auto mt-7 flex max-w-[640px] flex-col gap-6">
              {content.examples.map((ex, i) => {
                const isHi = ex.question_lang === "hi";
                const qFont = isHi
                  ? "font-[family-name:var(--font-devanagari)]"
                  : "font-[family-name:var(--font-serif)] italic";
                const rFont = isHi
                  ? "font-[family-name:var(--font-devanagari)]"
                  : "font-[family-name:var(--font-serif)] italic";
                return (
                  <article
                    key={i}
                    className="rounded-2xl border border-[oklch(86%_0.04_70)] bg-white/55 px-5 py-5 shadow-[0_8px_24px_-16px_oklch(40%_0.08_30_/_0.25)] backdrop-blur sm:px-7 sm:py-6"
                  >
                    <p
                      className={`${qFont} text-sm leading-relaxed text-ink-soft sm:text-[15px]`}
                    >
                      {ex.question}
                    </p>
                    <div className="dv-hairline my-4" />
                    <p
                      className={`${rFont} text-base leading-[1.65] text-ink sm:text-lg`}
                    >
                      {ex.reply}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Krishna Voice teaser ────────────────────────────────── */}
        <section className="mt-16 sm:mt-20">
          <SectionHeader
            hi="जल्द — कृष्ण की आवाज़ में"
            en="Coming soon — Krishna in voice"
          />
          <div className="mx-auto mt-7 max-w-[640px] rounded-2xl border border-[oklch(86%_0.04_70)] bg-linear-to-br from-[var(--color-buttermilk)] to-[var(--color-peach)] px-5 py-6 text-center sm:px-7 sm:py-8">
            <p className="font-[family-name:var(--font-devanagari)] text-base leading-relaxed text-ink sm:text-lg">
              जो शब्द अभी पढ़ रहे हो, वो जल्द कानों में भी सुनाई देंगे। श्रीकृष्ण की आवाज़ में।
            </p>
            <p className="mt-3 font-[family-name:var(--font-serif)] text-sm italic leading-relaxed text-ink-soft">
              The words you’re reading will soon reach your ears too. In
              Krishna’s own voice.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="inline-flex min-h-12 cursor-not-allowed items-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/40 px-7 py-3 font-[family-name:var(--font-devanagari)] text-[14px] text-ink-faint"
              >
                आवाज़ सुनो
                <span className="ml-2 font-[family-name:var(--font-serif)] text-xs italic text-ink-faint">
                  · Listen
                </span>
              </button>
              <span className="inline-flex items-center rounded-full border border-[oklch(80%_0.06_80)] bg-white/50 px-3 py-1 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-[0.26em] text-[var(--color-gold-leaf)]">
                In development
              </span>
            </div>
          </div>
        </section>

        {/* ── Footer CTA ──────────────────────────────────────────── */}
        <section className="mt-16 flex flex-col items-center gap-3 sm:mt-20">
          <Link href="/chat" className={PRIMARY_CTA}>
            अभी बात करो
            <span className="ml-2 font-[family-name:var(--font-serif)] text-sm italic text-ink-soft">
              · Begin
            </span>
          </Link>
        </section>
      </div>
    </main>
  );
}

function SectionHeader({ hi, en }: { hi: string; en: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-[family-name:var(--font-devanagari)] text-[clamp(1.5rem,4vw,2.25rem)] leading-[1.2] text-ink">
        {hi}
      </h2>
      <p className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.3em] text-ink-faint">
        {en}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-7 rounded-2xl border border-dashed border-[oklch(86%_0.04_70)] bg-white/30 px-5 py-10 text-center">
      <p className="font-[family-name:var(--font-devanagari)] text-base text-ink-soft">
        जल्द आ रहा है
      </p>
      <p className="mt-1 font-[family-name:var(--font-serif)] text-sm italic text-ink-faint">
        Coming soon
      </p>
    </div>
  );
}
