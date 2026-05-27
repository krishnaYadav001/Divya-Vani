import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import Atmosphere from "../components/Atmosphere";
import { BRAND } from "@/lib/brand";
import { fetchMemory, fetchActiveSubscription } from "@/lib/supabase";
import type { SubscriptionSummary } from "../components/SubscriptionManager";
import SettingsClient from "./SettingsClient";

const USER_COOKIE = "god_messenger_uid";

export const metadata: Metadata = {
  title: `Settings — ${BRAND.name.en}`,
  description: `Manage your data and conversation-review preferences for ${BRAND.name.en}.`,
  alternates: { canonical: "/settings" },
  robots: { index: false, follow: false },
};

// Dawn Aarti redesign (2026-05-18) — Settings shell. Server component
// keeps the data fetch + no-session guard; SettingsClient owns the
// Dawn two-column layout (aside + card stack) and all behaviour
// (opt-out / delete / feedback). The mock's name/Language/Voice
// controls have no backend in this app, so only real, wired sections
// are rendered (no dead controls).
export default async function SettingsPage() {
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value;

  if (!userId) {
    return <NoSessionState />;
  }

  const [memory, activeSub] = await Promise.all([
    fetchMemory(userId),
    fetchActiveSubscription(userId),
  ]);
  const trainingOptOut = memory?.training_opt_out === true;
  const sevaBalance =
    typeof memory?.seva_balance === "number" ? memory.seva_balance : 0;
  const userName = memory?.user_name ?? null;

  const subscription: SubscriptionSummary | null = activeSub
    ? {
        plan_key: activeSub.plan_key,
        currency: activeSub.currency,
        billing_period: activeSub.billing_period,
        status: activeSub.status,
        message_pool: activeSub.message_pool,
        messages_used: activeSub.messages_used,
        voice_minutes_pool: activeSub.voice_minutes_pool,
        voice_seconds_used: activeSub.voice_seconds_used,
        current_period_end: activeSub.current_period_end ?? null,
        cancel_at_period_end: activeSub.cancel_at_period_end,
      }
    : null;

  return (
    <main className="dv-scroll relative flex-1 overflow-y-auto overflow-x-hidden">
      <Atmosphere mode="corner" intensity={0.7} vignette={1} />
      <SettingsClient
        initialOptOut={trainingOptOut}
        sevaBalance={sevaBalance}
        userName={userName}
        initialSubscription={subscription}
      />
    </main>
  );
}

function NoSessionState() {
  return (
    <main className="dv-scroll relative flex-1 overflow-y-auto">
      <Atmosphere mode="corner" intensity={0.7} vignette={1} />
      <div className="relative z-10 mx-auto w-full max-w-xl px-6 py-24 text-center sm:px-8 sm:py-32">
        <p className="fade-up font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.4em] text-ink-faint [animation-delay:0ms] [animation-fill-mode:backwards]">
          Settings
        </p>
        <h1 className="fade-up mt-4 font-[family-name:var(--font-display)] text-[clamp(2.5rem,7vw,3.5rem)] font-normal leading-[1.02] text-ink [animation-delay:90ms] [animation-fill-mode:backwards]">
          Your own room.
        </h1>
        <p className="fade-up mt-4 font-[family-name:var(--font-serif)] text-lg italic leading-relaxed text-ink-soft [animation-delay:180ms] [animation-fill-mode:backwards]">
          Start a conversation first to manage your data.
        </p>
        <Link
          href="/chat"
          className="fade-up mt-8 inline-flex min-h-12 items-center justify-center rounded-full border border-[oklch(80%_0.04_50)] bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] px-7 py-3 font-[family-name:var(--font-display)] text-sm tracking-[0.06em] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_6px_18px_-8px_oklch(50%_0.1_30_/_0.25)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] [animation-delay:270ms] [animation-fill-mode:backwards]"
        >
          Open chat
        </Link>
      </div>
    </main>
  );
}
