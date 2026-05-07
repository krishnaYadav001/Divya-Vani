import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Landing() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
        <h1 className="text-2xl font-medium leading-snug tracking-tight text-zinc-900 sm:text-3xl md:text-4xl">
          {BRAND.tagline.hi}
        </h1>
        <p className="mt-6 text-base leading-relaxed text-zinc-700 sm:text-lg">
          {BRAND.name.en} एक शांत जगह है — जहाँ श्रीकृष्ण की भूमिका में एक AI के साथ आप अपनी बात कह सकते हैं, गीता की रोशनी में।
        </p>
        <Link
          href="/chat"
          className="mt-10 rounded-full bg-zinc-900 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          शुरू करें
        </Link>
      </div>
    </main>
  );
}
