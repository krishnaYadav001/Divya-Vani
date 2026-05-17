import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import Atmosphere from "./components/Atmosphere";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Phase 8 cinematic-dark redesign — Landing. Krishna as a hero
// atmospheric vignette; deep ink ground, gold + ivory. Pre-written
// copy (tagline, description, "शुरू करें") is preserved verbatim;
// only the design treatment + the design's own decorative microcopy
// are added.
export default function Landing() {
  return (
    <main className="relative flex flex-1 items-center overflow-hidden">
      <Atmosphere mode="hero" intensity={1} vignette={1} />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 sm:px-12">
        <div className="w-full max-w-2xl">
          {/* Eyebrow pill */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/[0.04] px-3 py-1.5 sm:mb-9">
            <span className="dv-pulse h-1.5 w-1.5 rounded-full bg-gold" />
            <span className="font-devanagari text-[10px] tracking-[0.16em] text-gold-dim sm:text-xs">
              शांत · सहज · हिंदी
            </span>
          </div>

          {/* Headline — pre-written tagline, unchanged */}
          <h1
            className="font-devanagari text-[clamp(2.5rem,7vw,4.75rem)] font-normal leading-[1.18] text-ivory"
            style={{ textShadow: "0 2px 30px rgba(0,0,0,0.8)" }}
          >
            {/* Gold-italic accent on "बात" per the design — derived from
                the BRAND.tagline.hi constant (no copy change / no desync;
                whole string renders unchanged if the word is absent). */}
            {(() => {
              const t = BRAND.tagline.hi;
              const w = "बात";
              const i = t.indexOf(w);
              if (i === -1) return t;
              return (
                <>
                  {t.slice(0, i)}
                  <span className="italic text-gold">{w}</span>
                  {t.slice(i + w.length)}
                </>
              );
            })()}
          </h1>

          {/* Ornament */}
          <div className="my-7 flex items-center gap-2.5 text-gold-mute">
            <span
              aria-hidden
              className="h-px w-14 bg-linear-to-r from-transparent to-gold-mute"
            />
            <span className="h-[5px] w-[5px] rotate-45 bg-gold" />
            <span
              aria-hidden
              className="h-px w-14 bg-linear-to-l from-transparent to-gold-mute"
            />
          </div>

          {/* Description — pre-written, unchanged */}
          <p className="max-w-xl font-devanagari text-base leading-[1.7] text-ivory/[0.72] sm:text-xl">
            {BRAND.name.en} एक शांत जगह है — जहाँ श्रीकृष्ण की भूमिका में एक AI
            के साथ आप अपनी बात कह सकते हैं, गीता की रोशनी में।
          </p>
          <p className="mt-4 hidden max-w-lg font-serif text-base italic text-ivory/[0.45] sm:block">
            A quiet place — where, in the role of Krishna, an AI listens. In the
            light of the Gita.
          </p>

          {/* CTA */}
          <div className="mt-11 flex flex-wrap items-center gap-5">
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 rounded-full border border-gold bg-linear-to-b from-gold to-gold-dim px-8 py-3.5 font-devanagari text-lg text-ink0 shadow-[0_0_30px_rgba(212,162,74,0.25),0_12px_30px_rgba(0,0,0,0.5)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ink0"
            >
              शुरू करें
              <span className="font-serif text-xs italic opacity-70">
                · begin
              </span>
            </Link>
            <span className="font-serif text-sm italic text-ivory/[0.45]">
              No account · No tracking ·{" "}
              <span className="text-gold-dim">10 free</span>
            </span>
          </div>
        </div>

        {/* Decorative dharma-wheel seal — desktop only */}
        <div
          aria-hidden
          className="dv-drift pointer-events-none absolute right-16 top-1/2 hidden h-80 w-80 -translate-y-1/2 opacity-50 lg:block"
        >
          <svg width="320" height="320" viewBox="0 0 320 320" fill="none">
            <circle
              cx="160"
              cy="160"
              r="155"
              stroke="var(--color-gold-mute)"
              strokeWidth="0.5"
              strokeDasharray="2 6"
            />
            <circle
              cx="160"
              cy="160"
              r="120"
              stroke="var(--color-gold-faint)"
              strokeWidth="0.5"
            />
            <circle
              cx="160"
              cy="160"
              r="80"
              stroke="var(--color-gold-faint)"
              strokeWidth="0.5"
              strokeDasharray="1 4"
            />
            {Array.from({ length: 24 }).map((_, i) => {
              const a = (i * 15 * Math.PI) / 180;
              return (
                <line
                  key={i}
                  x1={160 + Math.cos(a) * 120}
                  y1={160 + Math.sin(a) * 120}
                  x2={160 + Math.cos(a) * 155}
                  y2={160 + Math.sin(a) * 155}
                  stroke="var(--color-gold-faint)"
                  strokeWidth="0.4"
                />
              );
            })}
          </svg>
        </div>
      </div>
    </main>
  );
}
