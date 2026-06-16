"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { useLanguage } from "../providers/LanguageProvider";

// Global site footer (extracted from layout.tsx). Hidden on /voice — that
// route is an immersive full-bleed night scene (Dawn Aarti voice design)
// with its own back-to-chat control in the header, so a pastel footer
// strip would break the night mood and eat the vertical space the orb
// needs. Every other route keeps the footer.
//
// Phase 6.6 Stage C-1 — text-sm + py-3, each link inline-flex min-h-11
// (44px) so the tap target meets Apple HIG + Google MWG. Static © inline.
//
// Phase 12 (i18n) — link labels now come from the UI dictionary and the
// footer hosts the EN/हिन्दी language toggle (the only site-wide switcher).
// The toggle shows the OTHER language as its label.
const DOT = (
  <span aria-hidden className="text-brass">
    ·
  </span>
);

const LINK_CLASS =
  "inline-flex min-h-11 items-center px-3 hover:underline underline-offset-2";

const SOCIAL_LINKS = [
  {
    href: "https://www.youtube.com/@DivyaVani_All",
    label: "Divya Vani on YouTube",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
        <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
      </svg>
    ),
  },
  {
    href: "https://x.com/divyavani_ai",
    label: "Divya Vani on X",
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.736-8.857L1.254 2.25H8.08l4.253 5.622 5.912-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    href: "https://www.reddit.com/user/Unhappy_Database6796/",
    label: "Divya Vani on Reddit",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
      </svg>
    ),
  },
];

export default function SiteFooter() {
  const pathname = usePathname();
  const { lang, toggle, t } = useLanguage();
  // The chat and voice surfaces are full-height app shells with their own
  // bottom chrome (composer / mic). A site footer below them adds clutter
  // and competes with the input row, so it's suppressed on both.
  if (pathname === "/voice" || pathname === "/chat") return null;

  return (
    <footer className="shrink-0 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom,0px))] text-center text-sm text-brass-dark">
      <Link href="/demo" className={LINK_CLASS}>
        {t.footer.examples}
      </Link>
      {DOT}
      <Link href="/voice" className={LINK_CLASS}>
        {t.footer.voice}
      </Link>
      {DOT}
      <Link href="/pricing" className={LINK_CLASS}>
        {t.footer.pricing}
      </Link>
      {DOT}
      <Link href="/about" className={LINK_CLASS}>
        {t.footer.about}
      </Link>
      {DOT}
      <Link href="/privacy" className={LINK_CLASS}>
        {t.footer.privacy}
      </Link>
      {DOT}
      <Link href="/terms" className={LINK_CLASS}>
        {t.footer.terms}
      </Link>
      {DOT}
      <Link href="/refund" className={LINK_CLASS}>
        {t.footer.refund}
      </Link>
      {DOT}
      <Link href="/settings" className={LINK_CLASS}>
        {t.footer.settings}
      </Link>
      {DOT}
      <Link href="/contact" className={LINK_CLASS}>
        {t.footer.contact}
      </Link>
      <span aria-hidden className="mx-2 text-brass">
        ·
      </span>
      <span>{BRAND.copyright.text}</span>
      <span aria-hidden className="mx-2 text-brass">
        ·
      </span>
      <button
        type="button"
        onClick={toggle}
        aria-label={
          lang === "en" ? "हिन्दी में बदलें · Switch to Hindi" : "Switch to English"
        }
        className={`${LINK_CLASS} font-[family-name:var(--font-tiro-devanagari)]`}
      >
        {lang === "en" ? "हिन्दी" : "English"}
      </button>
      <div className="flex items-center justify-center gap-1 mt-0.5">
        {SOCIAL_LINKS.map(({ href, label, icon }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full opacity-60 hover:opacity-100 transition-opacity"
          >
            {icon}
          </a>
        ))}
      </div>
    </footer>
  );
}
