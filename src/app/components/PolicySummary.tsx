// Dawn Aarti redesign (2026-05-18) — bilingual policy summary.
// Ported from the handoff (dawn-settings.jsx → PrivacyPage): a
// title + lede + 2×2 plain-language card grid + footer links, sitting
// ABOVE the full verbatim legal text (which stays unchanged for the
// lawyer review). The "What we never do" card carries a SindoorSeal.
//
// Card content is plain-language and matches the prototype exactly;
// it summarises — it does not replace — the binding policy below
// (a "full policy below ↓" pointer makes that explicit).

import Link from "next/link";
import SindoorSeal from "./motifs/SindoorSeal";

type Card = {
  kicker: string;
  hi: string;
  seal?: boolean;
  bullets: [string, string][];
};

const PRIVACY_CARDS: Card[] = [
  {
    kicker: "What we collect",
    hi: "क्या एकत्र करते हैं",
    bullets: [
      ["anonymous device id", "no name, no phone, no email by default"],
      ["the messages you send", "stored encrypted on Indian servers"],
      ["payment receipt", "only when you offer sevā"],
    ],
  },
  {
    kicker: "What we never do",
    hi: "जो हम कभी नहीं करते",
    seal: true,
    bullets: [
      ["sell or share your chats with anyone", ""],
      ["train other companies' models on your words", ""],
      ["claim that the AI is the divine Krishna himself", ""],
    ],
  },
  {
    kicker: "How long we keep things",
    hi: "कितने समय रखते हैं",
    bullets: [
      ["chats — 180 days, then auto-deleted", ""],
      ["voice audio — never stored, transcript only", ""],
      ["payment record — 7 years (Indian law)", ""],
    ],
  },
  {
    kicker: "Your rights",
    hi: "आपके अधिकार",
    bullets: [
      ["delete everything in one tap, from Settings", ""],
      ["opt out of model improvement, on by default", ""],
      ["write to grievance.divyavani@gmail.com", ""],
    ],
  },
];

export default function PolicySummary({
  lastUpdated,
}: {
  lastUpdated: string;
}) {
  return (
    <section aria-label="Privacy summary" className="mb-14">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.36em] text-ink-faint">
          Privacy · Updated {lastUpdated}
        </p>
        <p className="font-[family-name:var(--font-serif)] text-sm italic text-ink-soft">
          Bilingual summary · full policy below ↓
        </p>
      </div>

      <h1 className="mt-5 max-w-[18ch] font-[family-name:var(--font-display)] text-[clamp(2.5rem,7vw,4.5rem)] font-normal leading-[1.04] text-ink">
        What we keep,{" "}
        <em className="font-[family-name:var(--font-serif)] not-italic text-ink-soft">
          <span className="italic">and what we don&apos;t.</span>
        </em>
      </h1>

      <p className="mt-5 max-w-[60ch] font-[family-name:var(--font-serif)] text-lg italic leading-relaxed text-ink-soft">
        Divya Vani is anonymous by default. You can use it without an
        account. Anything you tell Krishna stays between you, the founder,
        and Indian servers.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {PRIVACY_CARDS.map((c) => (
          <article
            key={c.kicker}
            className="relative rounded-2xl border border-[oklch(88%_0.02_60)] bg-white/55 p-7 shadow-[0_1px_0_rgba(255,255,255,.6)_inset,0_12px_28px_-18px_oklch(35%_0.05_30_/_0.35)] backdrop-blur-sm sm:p-8"
          >
            <header className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pr-10">
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-normal text-ink">
                {c.kicker}
              </h2>
              <span className="font-[family-name:var(--font-devanagari)] text-base leading-relaxed text-ink-soft">
                {c.hi}
              </span>
            </header>
            <ul className="flex flex-col gap-3.5">
              {c.bullets.map((b) => (
                <li key={b[0]} className="flex items-baseline gap-3">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[oklch(76%_0.12_80)]"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-[family-name:var(--font-serif)] text-base italic text-ink">
                      {b[0]}
                    </span>
                    {b[1] && (
                      <span className="font-[family-name:var(--font-serif)] text-[13px] italic text-ink-faint">
                        · {b[1]}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {c.seal && (
              <SindoorSeal
                size={36}
                className="absolute right-6 top-6 opacity-90"
              />
            )}
          </article>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[var(--color-ink-line)] pt-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.26em] text-ink-soft">
          <a
            href="#full-policy"
            className="inline-flex min-h-9 items-center transition-colors hover:text-ink"
          >
            Read full policy ↓
          </a>
          <Link
            href="/terms"
            className="inline-flex min-h-9 items-center transition-colors hover:text-ink"
          >
            Terms of service →
          </Link>
        </div>
        <span className="font-[family-name:var(--font-serif)] text-sm italic text-ink-soft">
          Grievance officer — grievance.divyavani@gmail.com
        </span>
      </div>
    </section>
  );
}
