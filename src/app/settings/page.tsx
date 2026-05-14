import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import LotusBackground from "../components/LotusBackground";
import { BRAND } from "@/lib/brand";
import { fetchMemory } from "@/lib/supabase";
import SettingsClient from "./SettingsClient";

const USER_COOKIE = "god_messenger_uid";

export const metadata: Metadata = {
  title: `Settings — ${BRAND.name.en}`,
  description: `Manage your data and conversation-review preferences for ${BRAND.name.en}.`,
  alternates: { canonical: "/settings" },
  // Settings is an authenticated-by-cookie surface — keep it out of
  // search indexes. The page is useful to the cookied user only.
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value;

  // Fresh visitor — no cookie yet. Show the polite empty state with
  // a CTA to start a conversation. /settings only becomes meaningful
  // once a user_id exists.
  if (!userId) {
    return <NoSessionState />;
  }

  const memory = await fetchMemory(userId);
  const trainingOptOut = memory?.training_opt_out === true;

  return (
    <main className="relative flex flex-1 overflow-y-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-start justify-center pt-32 opacity-[0.04]"
      >
        <LotusBackground className="h-[640px] w-[640px] text-krishna" />
      </div>

      <article className="relative mx-auto w-full max-w-2xl px-6 py-12 font-serif text-krishna sm:px-8 sm:py-16">
        {/* Staggered page-load reveal per CLAUDE.md frontend-design
            principle (one orchestrated entrance > scattered micro-
            interactions). Greeting 0ms → settings card 180ms →
            danger zone 360ms. */}
        <header className="fade-up mb-3 [animation-delay:0ms] [animation-fill-mode:backwards]">
          <h1 className="font-serif text-3xl font-semibold italic tracking-tight text-peacock sm:text-4xl">
            Your Settings
          </h1>
          <p className="mt-3 font-serif text-base italic text-brass-dark">
            Your data, your control
          </p>
        </header>

        <SettingsClient initialOptOut={trainingOptOut} />

        <footer className="fade-up mt-16 border-t border-brass/30 pt-6 text-sm text-brass-dark [animation-delay:540ms] [animation-fill-mode:backwards]">
          <Link
            href="/privacy"
            className="inline-flex min-h-11 items-center font-serif italic underline decoration-brass underline-offset-2 hover:text-peacock"
          >
            Privacy Policy
          </Link>
          <p className="mt-3">
            <Link
              href="/chat"
              className="underline decoration-brass underline-offset-2 hover:text-peacock"
            >
              ← {BRAND.name.en}
            </Link>
          </p>
        </footer>
      </article>
    </main>
  );
}

function NoSessionState() {
  return (
    <main className="relative flex flex-1 overflow-y-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-start justify-center pt-32 opacity-[0.04]"
      >
        <LotusBackground className="h-[640px] w-[640px] text-krishna" />
      </div>

      <article className="relative mx-auto w-full max-w-xl px-6 py-20 text-center font-serif text-krishna sm:px-8 sm:py-28">
        <header className="fade-up mb-6 [animation-delay:0ms] [animation-fill-mode:backwards]">
          <h1 className="font-serif text-3xl font-semibold italic tracking-tight text-peacock sm:text-4xl">
            Your Settings
          </h1>
        </header>
        <p className="fade-up font-serif text-base italic leading-relaxed text-krishna/80 [animation-delay:180ms] [animation-fill-mode:backwards]">
          Start a conversation first to manage your data.
        </p>
        <Link
          href="/chat"
          className="fade-up mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-krishna px-6 py-2 font-serif text-sm font-medium text-parchment shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-colors hover:bg-krishna/90 [animation-delay:360ms] [animation-fill-mode:backwards]"
        >
          Open chat
        </Link>
      </article>
    </main>
  );
}
