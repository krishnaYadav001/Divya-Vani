import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { scriptFontClass } from "@/lib/devanagari";
import Atmosphere from "./components/Atmosphere";
import Wordmark from "./components/motifs/Wordmark";
import SindoorSeal from "./components/motifs/SindoorSeal";
import DevoteeSilhouettes from "./components/motifs/DevoteeSilhouettes";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Dawn Aarti redesign — Landing "C · Vrindavan Window". Desktop is
// LOCKED to one viewport (lg:overflow-hidden, content centered, sized
// to fit — no scroll, founder requirement). Mobile keeps a normal
// scroll (the stacked composition cannot fit a phone height). The
// prototype's fixed 1440×900 canvas is reauthored responsively;
// legal/identity copy stays from BRAND (Locked Decision #1).

const CHIPS = [
  "मन शांत नहीं है",
  "I can't forgive him",
  "काम में जी नहीं लगता",
  "Tell me about karma",
];

const SANSKRIT = "“कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।”";

const ARCH_SHADOW =
  "0 24px 60px -30px oklch(35% 0.08 30 / .35), 0 0 0 1px oklch(78% 0.06 60), inset 0 0 0 5px rgba(255,255,255,.5)";

export default function Landing() {
  const [nameHead, ...nameRest] = BRAND.name.en.split(" ");
  return (
    <main className="relative flex-1 overflow-x-hidden overflow-y-auto lg:overflow-hidden">
      <Atmosphere mode="hero" intensity={1} vignette={1} />

      <div className="relative z-10 mx-auto flex w-full max-w-[1200px] flex-col px-5 py-5 sm:px-8 lg:min-h-full lg:justify-center lg:px-12 lg:py-3">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-4">
          <Wordmark size="sm" stack="horizontal" />
          <nav className="flex items-center gap-5 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-[0.24em] text-ink-soft sm:gap-7 sm:text-[11px]">
            <span className="hidden sm:inline">About</span>
            <span className="hidden sm:inline">Sevā</span>
            <span className="hidden sm:inline">Verses</span>
            <Link
              href="/chat"
              className="inline-flex min-h-9 items-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/45 px-4 py-1.5 text-[10px] tracking-[0.2em] text-ink backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] sm:text-[11px]"
            >
              Begin →
            </Link>
          </nav>
        </header>

        <div className="dv-hairline mt-4 shrink-0 lg:mt-3" />

        {/* Composition: arch + text. Stacks on mobile (arch first);
            two centered columns from lg up. */}
        <div className="mt-6 grid grid-cols-1 gap-8 lg:mt-3 lg:flex-1 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:items-center lg:gap-12">
          {/* ── Arch portal ─────────────────────────────────────── */}
          <div className="fade-up mx-auto w-full max-w-[220px] lg:max-w-[260px] [animation-delay:0ms] [animation-fill-mode:backwards]">
            <div
              className="relative w-full overflow-hidden rounded-t-[clamp(70px,20vw,150px)] rounded-b-[18px] bg-[var(--color-mist-2)]"
              style={{ aspectRatio: "46 / 56", boxShadow: ARCH_SHADOW }}
            >
              <Image
                src="/dawn-fresco.jpg"
                alt=""
                fill
                priority
                sizes="(max-width: 1024px) 70vw, 260px"
                className="object-cover"
                style={{
                  objectPosition: "center 20%",
                  filter: "saturate(0.95)",
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-1.5 rounded-t-[clamp(64px,18vw,144px)] rounded-b-[14px] border border-[oklch(76%_0.12_80_/_0.7)]"
              />
            </div>
            <div
              aria-hidden
              className="mx-[-6%] h-6 rounded-[4px] bg-linear-to-b from-[oklch(85%_0.06_60)] to-[oklch(75%_0.07_50)] shadow-[0_6px_14px_-6px_oklch(40%_0.08_30_/_0.3)]"
            />
            <p className="mt-4 text-center font-[family-name:var(--font-display)] text-[10px] uppercase tracking-[0.34em] text-ink-faint">
              ✦&nbsp;&nbsp;Mūrti · Vrindavan · 1521&nbsp;&nbsp;✦
            </p>
          </div>

          {/* ── Text composition ────────────────────────────────── */}
          <div className="fade-up [animation-delay:180ms] [animation-fill-mode:backwards]">
            <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-[0.38em] text-ink-faint">
              Vol.
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full bg-[oklch(78%_0.1_12)]"
              />
              Mathurā Edition
            </p>

            <h1 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(2.25rem,5.5vw,3.75rem)] font-normal leading-[0.92] text-ink">
              {nameHead}
              <br />
              {nameRest.join(" ")}.
            </h1>

            <p className="mt-3 max-w-[440px] font-[family-name:var(--font-serif)] text-sm italic leading-relaxed text-ink-soft sm:text-base">
              Krishna in a chat window. The same flute, a smaller room.
              Ask in Hindi or English; the verses follow you.
            </p>

            {/* CTA */}
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href="/chat"
                className="inline-flex min-h-11 items-center rounded-full border border-[oklch(80%_0.04_50)] bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] px-7 py-3 font-[family-name:var(--font-devanagari)] text-[15px] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_6px_18px_-8px_oklch(50%_0.1_30_/_0.25)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2"
              >
                पूछें{" "}
                <span className="ml-2 font-[family-name:var(--font-serif)] text-sm italic text-ink-soft">
                  · Ask the first thing
                </span>
              </Link>
              <span className="font-[family-name:var(--font-devanagari)] text-sm leading-relaxed text-ink-soft">
                10 निःशुल्क संदेश
                <span className="ml-2 font-[family-name:var(--font-serif)] text-xs italic text-ink-faint">
                  · no account
                </span>
              </span>
            </div>

            {/* Featured-question chips → start a chat */}
            <div className="mt-4 flex max-w-[560px] flex-wrap gap-2">
              {CHIPS.map((c) => (
                <Link
                  key={c}
                  href="/chat"
                  className={`inline-flex min-h-9 items-center rounded-full border border-[oklch(86%_0.04_70)] bg-white/50 px-3.5 py-1.5 text-[13px] leading-relaxed text-ink transition-colors hover:bg-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] ${scriptFontClass(
                    c,
                  )}`}
                >
                  {c}
                </Link>
              ))}
            </div>

            {/* Sanskrit quote */}
            <div className="mt-5 border-t border-[var(--color-ink-line)] pt-3">
              <p className="font-[family-name:var(--font-devanagari)] text-base italic leading-[1.55] text-ink-soft">
                {SANSKRIT}
              </p>
              <p className="mt-1.5 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-[0.28em] text-ink-faint">
                — Bhagavad Gita 2.47
              </p>
            </div>

            {/* Permanent identity disclaimer (Locked Decision #1) */}
            <div className="mt-5 flex items-start gap-3">
              <SindoorSeal size={26} className="mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-[family-name:var(--font-devanagari)] text-xs leading-[1.55] text-ink-faint">
                  {BRAND.disclaimer.hi}
                </p>
                <p className="font-[family-name:var(--font-serif)] text-xs italic leading-relaxed text-ink-faint">
                  {BRAND.disclaimer.en}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DevoteeSilhouettes height={56} opacity={0.26} />
    </main>
  );
}
