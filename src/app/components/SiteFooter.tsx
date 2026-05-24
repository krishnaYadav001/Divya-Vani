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

export default function SiteFooter() {
  const pathname = usePathname();
  const { lang, toggle, t } = useLanguage();
  if (pathname === "/voice") return null;

  return (
    <footer className="shrink-0 py-3 text-center text-sm text-brass-dark">
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
      <Link href="/privacy" className={LINK_CLASS}>
        {t.footer.privacy}
      </Link>
      {DOT}
      <Link href="/terms" className={LINK_CLASS}>
        {t.footer.terms}
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
    </footer>
  );
}
