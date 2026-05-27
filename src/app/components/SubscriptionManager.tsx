"use client";

import { useState } from "react";
import { getPlan } from "@/lib/subscriptions";
import { useLanguage } from "../providers/LanguageProvider";
import SubscribeButton from "./SubscribeButton";

// Phase 9 — Settings management panel content (the outer card + heading are
// supplied by SettingsClient). Shows the active subscription with per-cycle
// usage + renewal/cancel state and a two-step cancel; when there's no active
// sub it shows the SubscribeButton. Activation is webhook-driven, so after a
// successful checkout we re-poll /api/subscriptions/status a few times.

export interface SubscriptionSummary {
  plan_key: string;
  currency: string;
  billing_period: string;
  status: string;
  message_pool: number;
  messages_used: number;
  voice_minutes_pool: number;
  voice_seconds_used: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

function fmtDate(iso: string | null, hi: boolean): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(hi ? "hi-IN" : "en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function SubscriptionManager({
  initial,
}: {
  initial: SubscriptionSummary | null;
}) {
  const { lang, t } = useLanguage();
  const tt = t.subscribe;
  const dev = lang === "hi";
  const [sub, setSub] = useState<SubscriptionSummary | null>(initial);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fBody = dev
    ? "font-[family-name:var(--font-devanagari)] leading-relaxed"
    : "font-[family-name:var(--font-serif)] italic";
  const fFaint = fBody;

  async function handleCancel() {
    if (!confirmOpen) {
      setConfirmOpen(true);
      return;
    }
    if (cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch("/api/subscriptions/cancel", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCancelDone(true);
      setConfirmOpen(false);
      setSub((s) => (s ? { ...s, cancel_at_period_end: true } : s));
    } catch (e) {
      console.error("[settings] cancel failed:", e);
      setError(tt.cancelError);
    } finally {
      setCancelling(false);
    }
  }

  // ── No active subscription → invite to subscribe. ──
  if (!sub) {
    return (
      <div>
        <p className={`text-base leading-relaxed text-ink ${fBody}`}>
          {tt.noActive}
        </p>
        <div className="mt-5 max-w-[300px]">
          <SubscribeButton label={tt.seePlans} variant="solid" />
        </div>
      </div>
    );
  }

  // ── Active subscription. ──
  const plan = getPlan(sub.plan_key);
  const name = dev ? plan.displayNameHi : plan.displayName;
  const endDate = fmtDate(sub.current_period_end, dev);
  const cancelling_ = sub.cancel_at_period_end;
  const voiceUsedMin = Math.floor(sub.voice_seconds_used / 60);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p
          className={`text-xl text-ink ${
            dev
              ? "font-[family-name:var(--font-devanagari)]"
              : "font-[family-name:var(--font-display)]"
          }`}
        >
          {name}
        </p>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] ${
            cancelling_
              ? "bg-[oklch(60%_0.18_25_/_0.12)] text-[oklch(50%_0.18_25)]"
              : "bg-[oklch(60%_0.13_205_/_0.12)] text-[oklch(45%_0.12_205)]"
          } ${
            dev
              ? "font-[family-name:var(--font-devanagari)]"
              : "font-[family-name:var(--font-display)] tracking-[0.08em]"
          }`}
        >
          {cancelling_
            ? tt.statusCancelling.replace("{date}", endDate)
            : tt.statusActive}
        </span>
      </div>

      {!cancelling_ && (
        <p className={`mt-1 text-sm text-ink-faint ${fFaint}`}>
          {tt.renewsOn.replace("{date}", endDate)}
        </p>
      )}

      {/* Per-cycle usage */}
      <dl className="mt-4 space-y-1.5 border-t border-[var(--color-ink-line)] pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <dt className={`text-sm text-ink-soft ${fBody}`}>
            {tt.msgUsage
              .replace("{used}", String(sub.messages_used))
              .replace("{pool}", String(sub.message_pool))}
          </dt>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className={`text-sm text-ink-soft ${fBody}`}>
            {tt.voiceUsage
              .replace("{used}", String(voiceUsedMin))
              .replace("{pool}", String(sub.voice_minutes_pool))}
          </dt>
        </div>
      </dl>

      {/* Cancel (two-step) — hidden once already scheduled to cancel. */}
      {!cancelling_ && !cancelDone && (
        <div className="mt-5">
          {!confirmOpen ? (
            <button
              type="button"
              onClick={handleCancel}
              className={`inline-flex min-h-11 items-center justify-center rounded-full border border-[oklch(60%_0.18_25)] bg-transparent px-5 py-2 text-sm text-[oklch(50%_0.18_25)] transition-colors hover:bg-[oklch(60%_0.18_25_/_0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(60%_0.18_25)] ${
                dev
                  ? "font-[family-name:var(--font-devanagari)]"
                  : "font-[family-name:var(--font-display)] tracking-[0.06em]"
              }`}
            >
              {tt.cancelButton}
            </button>
          ) : (
            <div className="rounded-2xl border border-[oklch(60%_0.18_25_/_0.5)] bg-[oklch(60%_0.18_25_/_0.05)] p-4">
              <p className={`text-sm text-[oklch(50%_0.18_25)] ${fBody}`}>
                {tt.cancelConfirm.replace("{date}", endDate)}
              </p>
              <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[oklch(60%_0.18_25)] bg-[oklch(60%_0.18_25_/_0.1)] px-4 py-2 text-sm text-[oklch(50%_0.18_25)] transition-colors hover:bg-[oklch(60%_0.18_25_/_0.18)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(60%_0.18_25)] disabled:opacity-50 ${
                    dev
                      ? "font-[family-name:var(--font-devanagari)]"
                      : "font-[family-name:var(--font-display)] tracking-[0.04em]"
                  }`}
                >
                  {cancelling ? tt.cancelling : tt.cancelYes}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  disabled={cancelling}
                  className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/55 px-4 py-2 text-sm text-ink transition-colors hover:bg-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] disabled:opacity-50 ${
                    dev
                      ? "font-[family-name:var(--font-devanagari)]"
                      : "font-[family-name:var(--font-display)] tracking-[0.04em]"
                  }`}
                >
                  {tt.cancelNo}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {(cancelling_ || cancelDone) && (
        <p
          role="status"
          aria-live="polite"
          className={`mt-4 text-sm leading-relaxed text-ink-faint ${fFaint}`}
        >
          {tt.cancelDone}
        </p>
      )}

      {error && (
        <p role="alert" className={`mt-3 text-sm text-[oklch(53%_0.19_28)] ${fFaint}`}>
          {error}
        </p>
      )}
    </div>
  );
}
