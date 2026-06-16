"use client";

import { useEffect, useRef, useState } from "react";
import type { ReferralStats } from "@/lib/referralTypes";
import Flute from "./motifs/Flute";

// Phase — ShareDivyaVani: the Referrer-facing Share_UI (Dawn Aarti).
//
// On mount it reads GET /api/referral (server-computed code/link/stats) and
// renders the invite link, share controls, the reward explanation, and the
// referral stats. This component performs NO reward crediting — it only READS
// from /api/referral; all reward values are server-computed and never derived
// on the client (Req 9.4).
//
// Visual direction (Dawn Aarti): a soft watercolor card — peach/rose/lavender
// washes over warm mist, an arched header with a quietly floating flute, a
// gold-leaf hairline + vermillion sindoor seal, and drifting sparkle motes as
// the living ground. Mobile-first (360px). Copy is English (admin/settings
// surfaces are English-only per project i18n).
//
// Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10,
//               9.1, 9.2, 9.3, 9.4, 9.5.

/** Shape of the GET /api/referral success body. `stats` may be null. */
interface ReferralPayload {
  code: string;
  link: string;
  stats: ReferralStats | null;
}

// Exact copy strings (Req 2.9, 2.4, 9.2). Do NOT reword — these are verified
// against the requirements document.
const REWARD_TITLE = "Share Divya Vani";
const REWARD_DESCRIPTION =
  "Share Divya Vani with someone who may need peace, guidance, or Krishna's wisdom. When they use 3 free messages, you receive 2 minutes of free voice talk with Krishna.";
const COPY_SUCCESS = "Your invite link has been copied.";
const EARNED_MESSAGE =
  "You earned 2 free voice minutes because someone used Divya Vani through your invite.";

// The invitation line prefilled into WhatsApp / native share (Req 2.6).
const INVITE_TEXT =
  "Invite someone to Divya Vani. When they use 3 free messages, you receive 2 minutes of free voice talk with Krishna.";

// Hard ceiling on the identity fetch. On a >10s non-response the UI shows an
// error indication and renders no partial/client-computed values (Req 9.5).
const FETCH_TIMEOUT_MS = 10_000;
// How long the copy-success confirmation stays visible (Req 2.4).
const COPY_MESSAGE_VISIBLE_MS = 3_000;

const FONT_DISPLAY = "font-[family-name:var(--font-display)]";
const FONT_BODY = "font-[family-name:var(--font-serif)]";

type LoadState = "loading" | "ready" | "error";

export default function ShareDivyaVani() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [data, setData] = useState<ReferralPayload | null>(null);
  // Copy feedback: "idle" | "copied" | "error". Kept separate from load state.
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  // navigator.share is feature-detected after mount to avoid an SSR mismatch;
  // when absent the native-share control is omitted entirely (Req 2.7, 2.8).
  const [canNativeShare, setCanNativeShare] = useState(false);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feature-detect the Web Share API on the client only.
  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      setCanNativeShare(true);
    }
  }, []);

  // Load the referral identity + stats once on mount. AbortController gives us
  // the 10s ceiling; any failure (network, non-OK, abort, parse) collapses to a
  // single error state with NO partial values rendered (Req 9.5).
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/referral", {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`referral fetch failed: ${res.status}`);
        const body = (await res.json()) as ReferralPayload;
        if (cancelled) return;
        if (typeof body?.link !== "string" || typeof body?.code !== "string") {
          throw new Error("malformed referral payload");
        }
        setData({
          code: body.code,
          link: body.link,
          stats: body.stats ?? null,
        });
        setLoadState("ready");
      } catch {
        if (cancelled) return;
        // No partial state — clear any data so nothing is rendered (Req 9.5).
        setData(null);
        setLoadState("error");
      } finally {
        clearTimeout(timeout);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  // Clear the copy-confirmation timer on unmount.
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const link = data?.link ?? null;
  const linkAvailable = loadState === "ready" && typeof link === "string" && link.length > 0;
  const stats = data?.stats ?? null;

  async function handleCopy() {
    if (!linkAvailable || !link) return;
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
    try {
      await navigator.clipboard.writeText(link);
      // Success: show the confirmation and keep it visible ~3s (Req 2.4).
      setCopyState("copied");
      copyTimerRef.current = setTimeout(() => {
        setCopyState("idle");
        copyTimerRef.current = null;
      }, COPY_MESSAGE_VISIBLE_MS);
    } catch {
      // Failure: error indication; the link stays selectable for manual copy
      // (Req 2.5) — it remains rendered as selectable text below.
      setCopyState("error");
      copyTimerRef.current = setTimeout(() => {
        setCopyState("idle");
        copyTimerRef.current = null;
      }, COPY_MESSAGE_VISIBLE_MS);
    }
  }

  function handleWhatsApp() {
    if (!linkAvailable || !link) return;
    // Open WhatsApp with the invite line + link prefilled (Req 2.6).
    const text = encodeURIComponent(`${INVITE_TEXT} ${link}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  async function handleNativeShare() {
    if (!linkAvailable || !link) return;
    try {
      await navigator.share({
        title: REWARD_TITLE,
        text: INVITE_TEXT,
        url: link,
      });
    } catch {
      // User dismissal or share failure is non-fatal; the link stays available.
    }
  }

  const controlsDisabled = !linkAvailable;

  return (
    <section
      aria-label="Share Divya Vani"
      className="fade-up relative overflow-hidden rounded-[28px] border border-[var(--color-gold-soft)] shadow-[0_30px_80px_-32px_oklch(35%_0.08_30/0.45),0_0_0_1px_oklch(98%_0.01_70/0.6)_inset]"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 80% 55% at 50% -5%, var(--color-peach) 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 12% 108%, var(--color-rose) 0%, transparent 55%), radial-gradient(ellipse 75% 55% at 92% 100%, var(--color-lavender) 0%, transparent 55%), linear-gradient(180deg, var(--color-cloud) 0%, var(--color-mist) 100%)",
      }}
    >
      {/* Drifting sparkle motes — the living Dawn ground (reduced-motion safe
          via .dawn-sparkle's global off-switch). Purely decorative. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span
          className="dawn-sparkle absolute left-[14%] top-[18%] h-1 w-1 rounded-full bg-[var(--color-gold-leaf)]"
          style={{ ["--star-dur" as string]: "4.5s", animationDelay: "0s" }}
        />
        <span
          className="dawn-sparkle absolute right-[20%] top-[30%] h-1.5 w-1.5 rounded-full bg-[var(--color-gold-soft)]"
          style={{ animationDelay: "1.2s" }}
        />
        <span
          className="dawn-sparkle absolute left-[24%] bottom-[26%] h-1 w-1 rounded-full bg-[var(--color-gold-leaf)]"
          style={{ animationDelay: "2.1s" }}
        />
        <span
          className="dawn-sparkle absolute right-[14%] bottom-[34%] h-1 w-1 rounded-full bg-[var(--color-gold-soft)]"
          style={{ animationDelay: "0.6s" }}
        />
      </div>

      {/* ── Arched header: a quietly floating flute over a gold-leaf hairline,
          the vermillion sindoor seal, then the reward explanation (Req 2.9). */}
      <header className="relative px-6 pt-8 pb-6 text-center sm:px-9 sm:pt-9">
        <div className="mx-auto mb-4 flex flex-col items-center">
          <Flute className="dawn-float h-7 w-auto text-[var(--color-gold-leaf)] opacity-90" />
          {/* Vermillion sindoor seal under the flute. */}
          <span
            aria-hidden
            className="mt-3 inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-[var(--color-vermillion)] shadow-[0_0_0_4px_oklch(89%_0.06_12/0.5)]"
          />
        </div>
        <h2
          className={`${FONT_DISPLAY} text-[26px] leading-tight tracking-[0.04em] text-ink sm:text-[30px]`}
        >
          {REWARD_TITLE}
        </h2>
        {/* Gold-leaf flourish hairline. */}
        <div aria-hidden className="mx-auto my-4 flex items-center justify-center gap-2.5">
          <span className="h-px w-12 bg-gradient-to-r from-transparent to-[var(--color-gold-soft)]" />
          <span className="h-[5px] w-[5px] rotate-45 bg-[var(--color-gold-leaf)]" />
          <span className="h-px w-12 bg-gradient-to-l from-transparent to-[var(--color-gold-soft)]" />
        </div>
        <p
          className={`${FONT_BODY} mx-auto max-w-[44ch] text-[15px] italic leading-relaxed text-ink-soft sm:text-base`}
        >
          {REWARD_DESCRIPTION}
        </p>
      </header>

      <div className="relative px-6 pb-7 sm:px-9 sm:pb-8">
        {/* Error indication — shown on fetch failure / >10s non-response. No
            partial or client-computed values are rendered in this branch
            (Req 9.5): no link, no controls, no stats. */}
        {loadState === "error" && (
          <p
            role="alert"
            className={`${FONT_BODY} rounded-2xl border border-[var(--color-rose)] bg-[oklch(89%_0.06_12/0.35)] px-4 py-3.5 text-center text-sm italic leading-relaxed text-ink-soft`}
          >
            Your invite details couldn&apos;t be loaded right now. Please try
            again in a moment.
          </p>
        )}

        {/* Link + controls + stats. Rendered in both loading and ready states so
            the controls are PRESENT-but-DISABLED while the link is unavailable
            (Req 2.2). The error state above renders none of this (Req 9.5). */}
        {loadState !== "error" && (
          <>
            {/* The invite link as selectable text once available (Req 2.1). It
                stays selectable for manual copy even if the clipboard write
                fails (Req 2.5). While unavailable, a quiet placeholder holds
                the space. */}
            <div className="rounded-2xl border border-[var(--color-gold-soft)] bg-[var(--color-cloud)]/75 px-4 py-3 shadow-[0_2px_10px_-6px_oklch(35%_0.06_30/0.3)]">
              <p
                className={`${FONT_DISPLAY} text-[10px] uppercase tracking-[0.28em] text-ink-faint`}
              >
                Your invite link
              </p>
              {linkAvailable ? (
                <p
                  className={`${FONT_BODY} mt-1.5 select-all break-all text-sm text-ink`}
                >
                  {link}
                </p>
              ) : (
                <p
                  role="status"
                  aria-live="polite"
                  className={`${FONT_BODY} mt-1.5 text-sm italic text-ink-faint`}
                >
                  Preparing your invite link…
                </p>
              )}
            </div>

            {/* Share controls. Disabled while the link is unavailable (Req 2.2). */}
            <div className="mt-3.5 flex flex-wrap gap-2.5">
              <ControlButton
                label={copyState === "copied" ? "Copied" : "Copy link"}
                onClick={handleCopy}
                disabled={controlsDisabled}
                primary
                icon={
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                }
              />
              <ControlButton
                label="WhatsApp"
                onClick={handleWhatsApp}
                disabled={controlsDisabled}
                icon={
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.84 9.84 0 0 0 12.04 2Zm5.8 14.16c-.25.7-1.45 1.32-1.99 1.36-.53.04-.53.42-3.34-.7-2.81-1.12-4.6-3.99-4.74-4.18-.14-.18-1.13-1.5-1.13-2.86 0-1.36.71-2.03.97-2.31.25-.28.55-.35.74-.35.18 0 .37 0 .53.01.17.01.4-.07.62.48.25.6.84 2.07.91 2.22.07.14.12.32.02.5-.09.18-.14.28-.28.44-.14.16-.29.35-.42.47-.14.14-.28.28-.12.55.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.18.69-.8.87-1.08.18-.28.37-.23.62-.14.25.09 1.6.76 1.87.9.28.14.46.21.53.32.07.12.07.65-.18 1.35Z" />
                  </svg>
                }
              />
              {/* Native share control is omitted entirely when navigator.share
                  is absent (Req 2.7, 2.8). */}
              {canNativeShare && (
                <ControlButton
                  label="Share"
                  onClick={handleNativeShare}
                  disabled={controlsDisabled}
                  icon={
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  }
                />
              )}
            </div>

            {/* Copy feedback: success message (Req 2.4) or failure indication
                (Req 2.5). aria-live so assistive tech announces it. */}
            <div role="status" aria-live="polite" className="min-h-5">
              {copyState === "copied" && (
                <p className={`${FONT_BODY} mt-2.5 flex items-center gap-1.5 text-sm italic text-[var(--color-peacock-deep)]`}>
                  <span aria-hidden className="text-[var(--color-gold-leaf)]">✓</span>
                  {COPY_SUCCESS}
                </p>
              )}
              {copyState === "error" && (
                <p className={`${FONT_BODY} mt-2.5 text-sm italic text-ink-soft`}>
                  Couldn&apos;t copy automatically — select the link above to
                  copy it.
                </p>
              )}
            </div>

            {/* Stats (Req 9.1) — all values from the API, never client-computed
                (Req 9.4). Only meaningful once loaded; while loading, nothing is
                shown. If stats is null but the link is present, the link/actions
                remain usable and we indicate the stats are unavailable. */}
            {loadState === "ready" &&
              (stats ? (
                <div className="mt-6">
                  {/* Earned message when earned seconds > 0 (Req 9.2). */}
                  {stats.voiceMinutesEarned > 0 && (
                    <p
                      className={`${FONT_BODY} mb-4 flex items-start gap-2.5 rounded-2xl border border-[var(--color-gold-soft)] bg-[var(--color-buttermilk)]/55 px-4 py-3 text-sm italic leading-relaxed text-ink shadow-[0_2px_12px_-8px_oklch(76%_0.12_80/0.6)]`}
                    >
                      <span aria-hidden className="mt-0.5 shrink-0 text-base text-[var(--color-gold-leaf)]">
                        ✦
                      </span>
                      {EARNED_MESSAGE}
                    </p>
                  )}

                  <p className={`${FONT_DISPLAY} mb-2.5 text-center text-[10px] uppercase tracking-[0.28em] text-ink-faint`}>
                    Your invitations
                  </p>
                  <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <StatCell label="Invited" value={stats.totalInvited} />
                    <StatCell label="Pending" value={stats.pending} />
                    <StatCell label="Successful" value={stats.successful} accent />
                    <StatCell
                      label="Voice minutes"
                      value={stats.voiceMinutesEarned}
                      accent
                    />
                  </dl>
                </div>
              ) : (
                <p
                  role="status"
                  className={`${FONT_BODY} mt-6 text-center text-sm italic text-ink-faint`}
                >
                  Your invite stats aren&apos;t available right now. Your link
                  above still works.
                </p>
              ))}
          </>
        )}
      </div>
    </section>
  );
}

/** A single share-action button in the Dawn Aarti pill style. */
function ControlButton({
  label,
  onClick,
  disabled,
  primary,
  icon,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${FONT_DISPLAY} inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-leaf)]/45 disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "bg-[var(--color-vermillion)] text-white shadow-[0_8px_22px_-10px_oklch(53%_0.19_28/0.8)] hover:-translate-y-px hover:shadow-[0_12px_26px_-10px_oklch(53%_0.19_28/0.9)]"
          : "border border-[var(--color-gold-soft)] bg-[var(--color-cloud)]/70 text-ink-soft hover:bg-[var(--color-cloud)] hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/** A single labelled stat numeral. `accent` warms the reward-bearing cells. */
function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-3 py-3.5 text-center transition-colors ${
        accent
          ? "border-[var(--color-gold-soft)] bg-[var(--color-buttermilk)]/45"
          : "border-[var(--color-ink-line)] bg-[var(--color-cloud)]/55"
      }`}
    >
      <dd
        className={`${FONT_DISPLAY} text-[26px] leading-none tabular-nums ${
          accent ? "text-[var(--color-vermillion)]" : "text-ink"
        }`}
      >
        {value}
      </dd>
      <dt
        className={`${FONT_DISPLAY} mt-1.5 text-[9px] uppercase leading-tight tracking-[0.16em] text-ink-faint`}
      >
        {label}
      </dt>
    </div>
  );
}
