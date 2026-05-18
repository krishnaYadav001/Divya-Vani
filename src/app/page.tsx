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

// Dawn Aarti redesign (2026-05-18) — Landing "C · Vrindavan Window"
// from design_handoff_dawn_aarti/ (prototype dawn-landing.jsx →
// LandingC + LandingCMobile). The prototype's fixed 1440×900 absolute
// canvas is reauthored as a responsive Tailwind layout: a two-column
// arch-portal + text composition on desktop that stacks (arch above
// text) on phones. Legal/identity copy stays from BRAND (the
// prototype's mock copy is NOT adopted for the disclaimer — Locked
// Decision #1). The nav About/Seva/Verses are styled spans (no real
// routes — dead links avoided, matching the prototype's own <span>).

const CHIPS = [
  "मन शांत नहीं है",
  "I can't forgive him",
  "काम में जी नहीं लगता",
  "Tell me about karma",
];

const SANSKRIT = "“कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।”";

const ARCH_SHADOW =
  "0 30px 80px -30px oklch(35% 0.08 30 / .35), 0 0 0 1px oklch(78% 0.06 60), inset 0 0 0 6px rgba(255,255,255,.5)";

export default function Landing() {
  const [nameHead, ...nameRest] = BRAND.name.en.split(" ");
  return (
    <main className="dv-scroll relative flex-1 overflow-y-auto overflow-x-hidden">
      <Atmosphere mode="hero" intensity={1} vignette={1} />

      <div className="relative z-10 mx-auto w-full max-w-[1240px] px-5 py-6 sm:px-8 sm:py-8 lg:px-14">
        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <Wordmark size="sm" stack="horizontal" />
          <nav className="flex items-center gap-6 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.26em] text-ink-soft sm:gap-7 sm:text-xs">
            <span className="hidden sm:inline">About</span>
            <span className="hidden sm:inline">Sevā</span>
            <span className="hidden sm:inline">Verses</span>
            <Link
              href="/chat"
              className="inline-flex min-h-9 items-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/45 px-4 py-1.5 text-[11px] tracking-[0.22em] text-ink backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)]"
            >
              Begin →
            </Link>
          </nav>
        </header>

        <div className="dv-hairline mt-6" />

        {/* Composition: arch portal + text. Stacks on mobile (arch
            first), two columns from lg up. */}
        <div className="mt-10 grid grid-cols-1 gap-12 lg:mt-14 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:gap-16">
          {/* ── Arch portal ─────────────────────────────────────── */}
          <div className="fade-up mx-auto w-full max-w-[460px] [animation-delay:0ms] [animation-fill-mode:backwards]">
            <div
              className="relative w-full overflow-hidden rounded-t-[clamp(96px,30vw,230px)] rounded-b-[24px] bg-[var(--color-mist-2)]"
              style={{ aspectRatio: "46 / 70", boxShadow: ARCH_SHADOW }}
            >
              <Image
                src="/dawn-fresco.jpg"
                alt=""
                fill
                priority
                sizes="(max-width: 1024px) 90vw, 460px"
                className="object-cover"
                style={{
                  objectPosition: "center 20%",
                  filter: "saturate(0.95)",
                }}
              />
              {/* Gold-leaf inner trim */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-1.5 rounded-t-[clamp(88px,28vw,224px)] rounded-b-[18px] border border-[oklch(76%_0.12_80_/_0.7)]"
              />
            </div>
            {/* Plinth */}
            <div
              aria-hidden
              className="mx-[-6%] h-7 rounded-[4px] bg-linear-to-b from-[oklch(85%_0.06_60)] to-[oklch(75%_0.07_50)] shadow-[0_6px_14px_-6px_oklch(40%_0.08_30_/_0.3)]"
            />
            <p className="mt-5 text-center font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.36em] text-ink-faint">
              ✦&nbsp;&nbsp;Mūrti · Vrindavan · 1521&nbsp;&nbsp;✦
            </p>
          </div>

          {/* ── Text composition ────────────────────────────────── */}
          <div className="fade-up [animation-delay:180ms] [animation-fill-mode:backwards]">
            <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.42em] text-ink-faint">
              Vol.
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full bg-[oklch(78%_0.1_12)]"
              />
              Mathurā Edition
            </p>

            <h1 className="mt-5 font-[family-name:var(--font-display)] text-[clamp(3.25rem,12vw,8.625rem)] font-normal leading-[0.88] text-ink">
              {nameHead}
              <br />
              {nameRest.join(" ")}.
            </h1>

            <p className="mt-6 max-w-[480px] font-[family-name:var(--font-serif)] text-lg italic leading-relaxed text-ink-soft sm:text-xl">
              Krishna in a chat window. The same flute, a smaller room.
              Ask in Hindi or English; the verses follow you.
            </p>

            {/* CTA */}
            <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href="/chat"
                className="inline-flex min-h-12 items-center rounded-full border border-[oklch(80%_0.04_50)] bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] px-8 py-3.5 font-[family-name:var(--font-devanagari)] text-[15px] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_6px_18px_-8px_oklch(50%_0.1_30_/_0.25)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2"
              >
                पूछें{" "}
                <span className="ml-2 font-[family-name:var(--font-serif)] text-sm italic text-ink-soft">
                  · Ask the first thing
                </span>
              </Link>
              <span className="font-[family-name:var(--font-devanagari)] text-base leading-relaxed text-ink-soft">
                10 निःशुल्क संदेश
                <span className="ml-2 font-[family-name:var(--font-serif)] text-sm italic text-ink-faint">
                  · no account
                </span>
              </span>
            </div>

            {/* Featured-question chips → start a chat */}
            <div className="mt-8 flex max-w-[560px] flex-wrap gap-2.5">
              {CHIPS.map((c) => (
                <Link
                  key={c}
                  href="/chat"
                  className={`inline-flex min-h-9 items-center rounded-full border border-[oklch(86%_0.04_70)] bg-white/50 px-4 py-2 text-[15px] leading-relaxed text-ink transition-colors hover:bg-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] ${scriptFontClass(
                    c,
                  )}`}
                >
                  {c}
                </Link>
              ))}
            </div>

            {/* Sanskrit quote */}
            <div className="mt-9 border-t border-[var(--color-ink-line)] pt-5">
              <p className="font-[family-name:var(--font-devanagari)] text-xl italic leading-[1.6] text-ink-soft">
                {SANSKRIT}
              </p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.3em] text-ink-faint">
                — Bhagavad Gita 2.47
              </p>
            </div>

            {/* Permanent identity disclaimer (Locked Decision #1) —
                copy from BRAND, not the prototype mock. */}
            <div className="mt-9 flex items-start gap-3">
              <SindoorSeal size={30} className="mt-0.5" />
              <div className="space-y-1">
                <p className="font-[family-name:var(--font-devanagari)] text-[13px] leading-[1.6] text-ink-faint">
                  {BRAND.disclaimer.hi}
                </p>
                <p className="font-[family-name:var(--font-serif)] text-[13px] italic leading-relaxed text-ink-faint">
                  {BRAND.disclaimer.en}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DevoteeSilhouettes height={100} opacity={0.3} />
    </main>
  );
}
