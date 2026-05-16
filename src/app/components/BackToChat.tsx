import Link from "next/link";

// Phase 8 pre-launch — top-of-page return link for the long /privacy
// and /terms admin pages. Previously only a footer "← Back to Divya
// Vani" link existed (→ home); a cold-acquired user landing on the
// legal text had to scroll the entire page to get back into the app.
// This is a separate, subtle top-right return that goes straight to
// /chat.
//
// English-only per the Phase 8.0 c5725d3 admin-page convention.
// min-h-11 = 44px touch target (Phase 7.0 mobile QA rule). Colour:
// devotional-dark is the design-system AA-safe text variant on
// parchment — full-saturation --devotional is explicitly NOT AA as
// text (see globals.css §palette note); peacock-on-hover matches
// every other link on /privacy + /terms. Inline arrow SVG (no icon
// library) matching the MicIcon/SendIcon pattern in ChatUI.tsx.
export default function BackToChat() {
  return (
    <div className="mb-8 flex justify-end">
      <Link
        href="/chat"
        className="group inline-flex min-h-11 items-center gap-2 font-serif text-sm italic text-devotional-dark underline-offset-4 transition-colors hover:text-peacock hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-devotional/40 focus-visible:ring-offset-2 focus-visible:ring-offset-parchment"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform group-hover:-translate-x-0.5"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back to Krishna
      </Link>
    </div>
  );
}
