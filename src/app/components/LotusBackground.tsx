"use client";

import dynamic from "next/dynamic";

// Phase 6.9.2 — lazy-loaded lotus background for long-content pages
// (/privacy, /terms). dynamic({ ssr: false }) requires a client
// boundary in App Router, which this thin wrapper provides. Privacy
// and terms pages stay Server Components so article text renders in
// the initial HTML and becomes the LCP; the lotus hydrates in as
// pure decoration ~100-200ms after first paint.
//
// LotusMandala is a default export — next/dynamic resolves default
// exports without any .then() shim.
//
// Do NOT use this wrapper on /chat or / — those pages render the
// lotus as immediate atmosphere and should keep the SSR inline path.

const LotusMandala = dynamic(
  () => import("@/app/components/motifs/LotusMandala"),
  { ssr: false },
);

export default function LotusBackground({
  className,
}: {
  className: string;
}) {
  return <LotusMandala className={className} />;
}
