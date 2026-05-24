"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@/lib/brand";

// Global site footer (extracted from layout.tsx). Hidden on /voice — that
// route is an immersive full-bleed night scene (Dawn Aarti voice design)
// with its own back-to-chat control in the header, so a pastel footer
// strip would break the night mood and eat the vertical space the orb
// needs. Every other route keeps the footer.
//
// Phase 6.6 Stage C-1 — text-sm + py-3, each link inline-flex min-h-11
// (44px) so the tap target meets Apple HIG + Google MWG. Static © inline.
export default function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/voice") return null;

  return (
    <footer className="shrink-0 py-3 text-center text-sm text-brass-dark">
      <Link
        href="/demo"
        className="inline-flex min-h-11 items-center px-3 hover:underline underline-offset-2"
      >
        Examples
      </Link>
      <span aria-hidden className="text-brass">
        ·
      </span>
      <Link
        href="/voice"
        className="inline-flex min-h-11 items-center px-3 hover:underline underline-offset-2"
      >
        Voice
      </Link>
      <span aria-hidden className="text-brass">
        ·
      </span>
      <Link
        href="/privacy"
        className="inline-flex min-h-11 items-center px-3 hover:underline underline-offset-2"
      >
        Privacy
      </Link>
      <span aria-hidden className="text-brass">
        ·
      </span>
      <Link
        href="/terms"
        className="inline-flex min-h-11 items-center px-3 hover:underline underline-offset-2"
      >
        Terms
      </Link>
      <span aria-hidden className="text-brass">
        ·
      </span>
      <Link
        href="/settings"
        className="inline-flex min-h-11 items-center px-3 hover:underline underline-offset-2"
      >
        Settings
      </Link>
      <span aria-hidden className="mx-2 text-brass">
        ·
      </span>
      <span>{BRAND.copyright.text}</span>
    </footer>
  );
}
