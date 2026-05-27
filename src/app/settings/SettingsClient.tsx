"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { useLanguage } from "../providers/LanguageProvider";

// Dawn Aarti redesign (2026-05-18) — Settings client island.
// Visual rebuild to the handoff mock (desktop two-column aside +
// card stack; single column on mobile) with EVERY behaviour
// preserved verbatim: the opt-out toggle (training_opt_out,
// optimistic + revert + "saved"), the two-step delete-account flow,
// and the full feedback form (honeypot, IME guard, timeout,
// counter). Only presentational JSX/classes changed. The mock's
// name / Language / Voice controls have no backend in this app and
// are NOT rendered as dead controls — the name is shown read-only
// (Krishna captures it in chat, Locked Decision #3).
//
// State mapping (deliberately inverted): Toggle ON = founder review
// ALLOWED = training_opt_out FALSE.
//
// Phase 12 (i18n, founder 2026-05-26) — every product-authored string here
// now follows the EN/हिन्दी language toggle (English by default; Hindi when
// the user picks it in the footer or the Language card below) instead of the
// prior always-stacked English+Hindi pairs. Krishna's chat/voice REPLIES are
// unaffected — they follow the user's input language at the model layer
// (Locked Decision #12).

const CARD =
  "rounded-2xl border border-[oklch(88%_0.02_60)] bg-white/55 p-6 shadow-[0_1px_0_rgba(255,255,255,.6)_inset,0_12px_28px_-18px_oklch(35%_0.05_30_/_0.35)] backdrop-blur-sm sm:p-8";

// Section heading — single, in the active UI language (devanagari face for
// Hindi; the English display face otherwise).
function CardHeader({ title }: { title: string }) {
  const { lang } = useLanguage();
  return (
    <header className="mb-6">
      <h2
        className={`text-2xl font-normal text-ink ${
          lang === "hi"
            ? "font-[family-name:var(--font-devanagari)] leading-relaxed"
            : "font-[family-name:var(--font-display)]"
        }`}
      >
        {title}
      </h2>
    </header>
  );
}

function DawnToggle({
  label,
  on,
  onClick,
  disabled,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { lang } = useLanguage();
  return (
    <div className="flex items-center justify-between gap-6 border-b border-[var(--color-ink-line)] py-4">
      <span
        className={`text-base text-ink ${
          lang === "hi"
            ? "font-[family-name:var(--font-devanagari)] leading-relaxed"
            : "font-[family-name:var(--font-serif)] not-italic"
        }`}
      >
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className="relative h-[26px] w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2 disabled:opacity-60"
        style={{
          background: on
            ? "linear-gradient(90deg, oklch(70% 0.13 80), oklch(60% 0.16 50))"
            : "oklch(86% 0.02 60)",
        }}
      >
        <span
          aria-hidden
          className="absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_oklch(40%_0.04_30_/_.35)] transition-[left]"
          style={{ left: on ? 20 : 2 }}
        />
      </button>
    </div>
  );
}

export default function SettingsClient({
  initialOptOut,
  sevaBalance,
  userName,
}: {
  initialOptOut: boolean;
  sevaBalance: number;
  userName: string | null;
}) {
  const [optOut, setOptOut] = useState<boolean>(initialOptOut);
  const [saving, setSaving] = useState(false);
  // "Saved" confirmation flag (boolean, not a timestamp computed in render —
  // keeps render pure). Set true on a successful save, auto-cleared after 3s.
  const [justSaved, setJustSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const router = useRouter();
  // UI-language preference (static chrome only — Krishna's replies follow the
  // user's input language per Locked Decision #12). The footer hosts the same
  // toggle; this is the explicit-choice surface in Settings.
  const { lang, setLang, t } = useLanguage();
  const tt = t.settings;
  const dev = lang === "hi";

  // Font helpers — Hindi text must render in the Tiro Devanagari face
  // (Cormorant / Marcellus have no Devanagari glyphs). English keeps the
  // serif-italic body / display-heading faces.
  const fBody = dev
    ? "font-[family-name:var(--font-devanagari)] leading-relaxed"
    : "font-[family-name:var(--font-serif)] italic";
  const fFaint = dev
    ? "font-[family-name:var(--font-devanagari)] leading-relaxed"
    : "font-[family-name:var(--font-serif)] italic";
  // Display eyebrows: uppercase + wide tracking reads badly in Devanagari, so
  // Hindi drops both and uses the Devanagari face.
  const fEyebrow = (extra = "") =>
    dev
      ? "font-[family-name:var(--font-devanagari)]"
      : `font-[family-name:var(--font-display)] uppercase ${extra}`;

  const reviewAllowed = !optOut;

  async function handleToggle() {
    if (saving) return;
    const nextOptOut = !optOut;
    setOptOut(nextOptOut);
    setSaving(true);
    setJustSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ training_opt_out: nextOptOut }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 3000);
    } catch (e) {
      console.error("[settings] toggle save failed:", e);
      setOptOut(!nextOptOut); // revert optimistic flip
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/delete-account", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      try {
        if (typeof window !== "undefined") {
          for (let i = window.localStorage.length - 1; i >= 0; i--) {
            const key = window.localStorage.key(i);
            if (key && key.startsWith("divya-vani-chat:")) {
              window.localStorage.removeItem(key);
            }
          }
        }
      } catch {
        /* ignore */
      }
      router.push("/?deleted=1");
      router.refresh();
    } catch (e) {
      console.error("[settings] delete failed:", e);
      setDeleting(false);
      setConfirmDelete(false);
      setDeleteError(tt.delete.error);
    }
  }

  // Visual-only progress: cap against the largest tier (Param = 350).
  const balancePct = Math.max(
    4,
    Math.min(100, Math.round((sevaBalance / 350) * 100)),
  );

  const navItems = [
    { label: tt.nav.identity, href: "#identity" },
    { label: tt.nav.language, href: "#language" },
    { label: tt.nav.examples, href: "#examples" },
    { label: tt.nav.privacy, href: "#privacy" },
    { label: tt.nav.feedback, href: "#feedback" },
    { label: tt.nav.delete, href: "#delete" },
    { label: tt.nav.about, href: "#about" },
  ];

  return (
    <div className="relative z-10 mx-auto w-full max-w-[1240px] px-5 py-10 sm:px-8 lg:px-14 lg:py-16">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-16">
        {/* ── Aside ───────────────────────────────────────────── */}
        <aside className="fade-up lg:sticky lg:top-16 lg:self-start [animation-delay:0ms] [animation-fill-mode:backwards]">
          <Link
            href="/chat"
            className={`inline-flex min-h-11 items-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/45 px-4 py-2 text-[11px] text-ink-soft backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] ${fEyebrow(
              "tracking-[0.28em]",
            )}`}
          >
            {tt.backToChat}
          </Link>

          <p
            className={`mt-9 text-[11px] text-ink-faint ${fEyebrow("tracking-[0.4em]")}`}
          >
            {tt.eyebrow}
          </p>
          <h1
            className={`mt-5 whitespace-pre-line text-[clamp(2.5rem,6vw,3.6rem)] font-normal leading-[1.02] text-ink ${
              dev
                ? "font-[family-name:var(--font-devanagari)]"
                : "font-[family-name:var(--font-display)]"
            }`}
          >
            {tt.title}
          </h1>
          <p className={`mt-4 text-lg leading-relaxed text-ink-soft ${fBody}`}>
            {tt.subtitle}
          </p>

          <nav className="mt-10 flex flex-col gap-1">
            {navItems.map((item, i) => (
              <a
                key={item.href}
                href={item.href}
                className={`rounded-[10px] border px-3.5 py-2.5 text-sm transition-colors ${
                  dev
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-display)] tracking-[0.08em]"
                } ${
                  i === 0
                    ? "border-[oklch(86%_0.04_70)] bg-white/70 text-ink"
                    : "border-transparent text-ink-soft hover:bg-white/40 hover:text-ink"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Sevā balance card — real balance */}
          <div className="mt-12 rounded-2xl border border-[oklch(86%_0.03_60)] bg-white/55 p-5">
            <p
              className={`text-[10px] text-ink-faint ${fEyebrow("tracking-[0.3em]")}`}
            >
              {tt.sevaBalance}
            </p>
            <div className="mt-2.5 flex items-baseline gap-1.5">
              <span className="font-[family-name:var(--font-display)] text-4xl text-ink">
                {sevaBalance}
              </span>
              <span className={`text-sm text-ink-soft ${fBody}`}>
                {tt.messages}
              </span>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-[oklch(92%_0.02_60)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${balancePct}%`,
                  background:
                    "linear-gradient(90deg, oklch(78% 0.1 80), oklch(68% 0.14 30))",
                }}
              />
            </div>
            {/* Payments now live only in the chat seva/plans hub (founder
                2026-05-27); this CTA routes there rather than to an in-settings
                section. */}
            <Link
              href="/chat"
              className={`mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/45 px-4 py-2 text-[11px] text-ink-soft backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] ${fEyebrow(
                "tracking-[0.2em]",
              )}`}
            >
              {tt.lightDiya}
            </Link>
          </div>
        </aside>

        {/* ── Main card stack ─────────────────────────────────── */}
        <main className="space-y-6">
          {/* Identity — name is captured in chat (Locked #3); shown
              read-only, no dead Save control. */}
          <section
            id="identity"
            className={`fade-up scroll-mt-20 ${CARD} [animation-delay:120ms] [animation-fill-mode:backwards]`}
          >
            <CardHeader title={tt.identity.title} />
            {userName ? (
              <p className="font-[family-name:var(--font-serif)] text-lg italic text-ink">
                {userName}
              </p>
            ) : (
              <p className={`text-base text-ink-soft ${fBody}`}>
                {tt.identity.nameUnknown}
              </p>
            )}
            <p className={`mt-3 text-sm leading-relaxed text-ink-faint ${fFaint}`}>
              {tt.identity.help}
            </p>
          </section>

          {/* Language — UI-language preference (founder 2026-05-25). Segmented
              English / हिन्दी choice, wired to the same LanguageProvider as the
              footer toggle. Affects static chrome only; Krishna replies in the
              user's input language (Locked Decision #12). */}
          <section
            id="language"
            className={`fade-up scroll-mt-20 ${CARD} [animation-delay:135ms] [animation-fill-mode:backwards]`}
          >
            <CardHeader title={tt.language.title} />
            <p className={`text-base leading-relaxed text-ink ${fBody}`}>
              {tt.language.desc}
            </p>

            <div
              role="group"
              aria-label={tt.language.ariaGroup}
              className="mt-5 inline-flex rounded-full border border-[oklch(86%_0.04_70)] bg-white/50 p-1"
            >
              {(["en", "hi"] as const).map((code) => {
                const active = lang === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLang(code)}
                    aria-pressed={active}
                    className={`min-h-10 rounded-full px-6 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] ${
                      active
                        ? "bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset]"
                        : "text-ink-soft hover:text-ink"
                    } ${
                      code === "hi"
                        ? "font-[family-name:var(--font-devanagari)]"
                        : "font-[family-name:var(--font-display)] tracking-[0.06em]"
                    }`}
                  >
                    {code === "en" ? "English" : "हिन्दी"}
                  </button>
                );
              })}
            </div>

            <p className={`mt-4 text-sm leading-relaxed text-ink-faint ${fFaint}`}>
              {tt.language.note}
            </p>
          </section>

          {/* Payments (subscriptions + seva) moved OUT of Settings into the
              chat seva/plans hub (founder 2026-05-27) — this page is now
              account/preferences only. */}

          {/* Examples — the /demo "see real conversations" surface, moved
              here from the chat header (founder 2026-05-25) so the header
              stays uncrowded on mobile. */}
          <section
            id="examples"
            className={`fade-up scroll-mt-20 ${CARD} [animation-delay:165ms] [animation-fill-mode:backwards]`}
          >
            <CardHeader title={tt.examples.title} />
            <p className={`text-base leading-relaxed text-ink ${fBody}`}>
              {tt.examples.desc}
            </p>
            <div className="mt-5">
              <Link
                href="/demo"
                className={`inline-flex min-h-11 items-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/45 px-4 py-2 text-xs text-ink-soft backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] ${
                  dev
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-display)] tracking-[0.1em]"
                }`}
              >
                {tt.examples.cta}
              </Link>
            </div>
          </section>

          {/* Contact & Grievance Officer (DPDP discoverability) */}
          <section
            className={`fade-up ${CARD} [animation-delay:180ms] [animation-fill-mode:backwards]`}
          >
            <CardHeader title={tt.grievance.title} />
            <p className={`text-base leading-relaxed text-ink ${fBody}`}>
              {tt.grievance.body}
            </p>
            <dl className="mt-5 space-y-1">
              <dt className={`text-sm text-ink-faint ${fFaint}`}>
                {tt.grievance.officer}
              </dt>
              <dd className="font-[family-name:var(--font-display)] text-lg text-ink">
                Krishna Yadav
              </dd>
              <dd>
                <a
                  href="mailto:grievance.divyavani@gmail.com"
                  className="inline-flex min-h-11 items-center break-all font-[family-name:var(--font-serif)] text-base italic text-[oklch(53%_0.19_28)] underline decoration-[oklch(76%_0.12_80)] underline-offset-2 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)]"
                >
                  grievance.divyavani@gmail.com
                </a>
              </dd>
            </dl>
            <p className={`mt-5 text-sm leading-relaxed text-ink-faint ${fFaint}`}>
              {tt.grievance.perSection}
            </p>
          </section>

          {/* Privacy & Data — the real opt-out toggle */}
          <section
            id="privacy"
            className={`fade-up scroll-mt-20 ${CARD} [animation-delay:240ms] [animation-fill-mode:backwards]`}
          >
            <CardHeader title={tt.privacy.title} />
            <DawnToggle
              label={tt.privacy.toggleLabel}
              on={reviewAllowed}
              onClick={handleToggle}
              disabled={saving}
            />
            <p
              role="status"
              aria-live="polite"
              className={`mt-3 text-xs text-[oklch(52%_0.13_205)] transition-opacity duration-500 ${fFaint} ${
                justSaved ? "opacity-100" : "opacity-0"
              }`}
            >
              {tt.privacy.saved}
            </p>
            <p className={`mt-4 text-sm leading-relaxed text-ink-faint ${fFaint}`}>
              {tt.privacy.body}
            </p>
            <div className="mt-5">
              <Link
                href="/privacy"
                className={`inline-flex min-h-11 items-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/45 px-4 py-2 text-xs text-ink-soft backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] ${
                  dev
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-display)] tracking-[0.1em]"
                }`}
              >
                {tt.privacy.readFull}
              </Link>
            </div>
          </section>

          {/* Share Feedback */}
          <FeedbackSection />

          {/* Delete all my data — two-step confirm preserved */}
          <section
            id="delete"
            className={`fade-up scroll-mt-20 rounded-2xl border border-[oklch(60%_0.18_25_/_0.4)] bg-white/55 p-6 shadow-[0_1px_0_rgba(255,255,255,.6)_inset,0_12px_28px_-18px_oklch(45%_0.12_25_/_0.3)] backdrop-blur-sm [animation-delay:360ms] [animation-fill-mode:backwards] sm:p-8`}
          >
            <CardHeader title={tt.delete.title} />
            <p className={`text-base leading-relaxed text-ink ${fBody}`}>
              {tt.delete.body}
            </p>
            <p className={`mt-3 text-sm leading-relaxed text-ink-faint ${fFaint}`}>
              {tt.delete.paymentNote}
            </p>

            {!confirmDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className={`mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-[oklch(60%_0.18_25)] bg-transparent px-6 py-2 text-sm text-[oklch(50%_0.18_25)] transition-colors hover:bg-[oklch(60%_0.18_25_/_0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(60%_0.18_25)] disabled:opacity-50 ${
                  dev
                    ? "font-[family-name:var(--font-devanagari)]"
                    : "font-[family-name:var(--font-display)] tracking-[0.06em]"
                }`}
              >
                {tt.delete.button}
              </button>
            ) : (
              <div
                role="alertdialog"
                aria-labelledby="confirm-delete-heading"
                className="mt-6 rounded-2xl border border-[oklch(60%_0.18_25_/_0.5)] bg-[oklch(60%_0.18_25_/_0.05)] p-5"
              >
                <p
                  id="confirm-delete-heading"
                  className={`text-base font-semibold text-[oklch(50%_0.18_25)] ${
                    dev
                      ? "font-[family-name:var(--font-devanagari)]"
                      : "font-[family-name:var(--font-serif)] italic"
                  }`}
                >
                  {tt.delete.areYouSure}
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[oklch(60%_0.18_25)] bg-[oklch(60%_0.18_25_/_0.1)] px-5 py-2 text-sm text-[oklch(50%_0.18_25)] transition-colors hover:bg-[oklch(60%_0.18_25_/_0.18)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(60%_0.18_25)] disabled:opacity-50 ${
                      dev
                        ? "font-[family-name:var(--font-devanagari)]"
                        : "font-[family-name:var(--font-display)] tracking-[0.04em]"
                    }`}
                  >
                    {deleting ? tt.delete.deleting : tt.delete.confirm}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/55 px-5 py-2 text-sm text-ink transition-colors hover:bg-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] disabled:opacity-50 ${
                      dev
                        ? "font-[family-name:var(--font-devanagari)]"
                        : "font-[family-name:var(--font-display)] tracking-[0.04em]"
                    }`}
                  >
                    {tt.delete.cancel}
                  </button>
                </div>
                {deleteError && (
                  <p
                    role="status"
                    aria-live="polite"
                    className={`mt-3 text-sm text-[oklch(50%_0.18_25)] ${fFaint}`}
                  >
                    {deleteError}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* About us — moved to the bottom (founder 2026-05-27). Who/what
              Divya Vani is, the AI-identity note, and the business details most
              companies surface (operator, registered office, India). Real data
              only, read from BRAND.contact so it stays in sync with /contact +
              the footer. */}
          <section
            id="about"
            className={`fade-up scroll-mt-20 ${CARD} [animation-delay:380ms] [animation-fill-mode:backwards]`}
          >
            <CardHeader title={tt.about.title} />
            <p className={`text-base leading-relaxed text-ink ${fBody}`}>
              {tt.about.body.replace("{brand}", BRAND.name[lang])}
            </p>

            <p className={`mt-4 text-sm leading-relaxed text-ink-faint ${fFaint}`}>
              {BRAND.disclaimer[lang]} {tt.about.notSubstitute}
            </p>

            <dl className="mt-5 space-y-3 border-t border-[var(--color-ink-line)] pt-5">
              <div>
                <dt className={`text-[11px] text-ink-faint ${fEyebrow("tracking-[0.28em]")}`}>
                  {tt.about.operatedBy}
                </dt>
                <dd className="mt-0.5 font-[family-name:var(--font-serif)] text-base italic text-ink">
                  {BRAND.contact.founder} — {tt.about.soleProprietorship}
                </dd>
              </div>
              <div>
                <dt className={`text-[11px] text-ink-faint ${fEyebrow("tracking-[0.28em]")}`}>
                  {tt.about.registeredOffice}
                </dt>
                <dd className="mt-0.5 font-[family-name:var(--font-serif)] text-base italic leading-relaxed text-ink">
                  {BRAND.contact.address}
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { href: "/contact", label: t.footer.contact },
                { href: "/terms", label: t.footer.terms },
                { href: "/privacy", label: t.footer.privacy },
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`inline-flex min-h-11 items-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/45 px-4 py-2 text-xs text-ink-soft backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] ${
                    dev
                      ? "font-[family-name:var(--font-devanagari)]"
                      : "font-[family-name:var(--font-display)] tracking-[0.1em]"
                  }`}
                >
                  {l.label} →
                </Link>
              ))}
            </div>
          </section>

          <p className="pt-2 text-center font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.3em] text-ink-faint">
            v1.0 · divyavani.co.in
          </p>
        </main>
      </div>
    </div>
  );
}

// ── Share Feedback — Dawn card. ALL form behaviour preserved
// verbatim (honeypot, IME composition guard, 15s timeout, counter,
// idle/submitting/success(auto-dismiss)/error+retry); only the
// presentational JSX/classes + copy (now language-aware) changed.
type FeedbackStatus = "idle" | "submitting" | "success" | "error";

const FB_MSG_MIN = 10;
const FB_MSG_MAX = 5000;
const FB_NAME_MAX = 100;
const FB_FETCH_TIMEOUT_MS = 15000;

const FB_FIELD =
  "mt-2 w-full rounded-xl border border-[oklch(86%_0.04_70)] bg-white/70 px-4 py-3 font-[family-name:var(--font-serif)] text-base italic text-ink shadow-[0_1px_0_rgba(255,255,255,.6)_inset] placeholder:text-ink-faint/60 focus:border-[oklch(76%_0.12_80)] focus:outline-none focus:ring-2 focus:ring-[oklch(76%_0.12_80_/_0.25)] disabled:opacity-60";

function FeedbackSection() {
  const { lang, t } = useLanguage();
  const tf = t.settings.feedback;
  const dev = lang === "hi";
  const fBody = dev
    ? "font-[family-name:var(--font-devanagari)] leading-relaxed"
    : "font-[family-name:var(--font-serif)] italic";

  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [hp, setHp] = useState(""); // honeypot — humans never fill this
  const [status, setStatus] = useState<FeedbackStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const composingRef = useRef(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const trimmedLen = message.trim().length;
  const tooShort = message.length > 0 && trimmedLen < FB_MSG_MIN;
  const counterWarn = message.length >= 4500;
  const canSubmit =
    status !== "submitting" &&
    trimmedLen >= FB_MSG_MIN &&
    message.length <= FB_MSG_MAX &&
    name.trim().length <= FB_NAME_MAX;

  async function submit() {
    if (composingRef.current) return;
    if (status === "submitting") return;
    if (!canSubmit) return;

    setStatus("submitting");
    setErrorMsg(null);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      FB_FETCH_TIMEOUT_MS,
    );
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          user_name: name.trim() || undefined,
          website: hp, // honeypot field — server treats non-empty as bot
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        let m = tf.errorGeneric;
        try {
          const j = await res.json();
          if (j && typeof j.message === "string" && j.message) m = j.message;
        } catch {
          /* keep generic message */
        }
        setStatus("error");
        setErrorMsg(m);
        return;
      }
      setName("");
      setMessage("");
      setStatus("success");
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setStatus((s) => (s === "success" ? "idle" : s));
      }, 5000);
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      setStatus("error");
      setErrorMsg(aborted ? tf.timeout : tf.network);
    } finally {
      clearTimeout(timeout);
    }
  }

  return (
    <section
      id="feedback"
      className={`fade-up scroll-mt-20 ${CARD} [animation-delay:300ms] [animation-fill-mode:backwards]`}
    >
      <CardHeader title={tf.title} />
      <p className={`text-base leading-relaxed text-ink ${fBody}`}>{tf.body}</p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden opacity-0"
        >
          <label htmlFor="fb-website">Website</label>
          <input
            id="fb-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
          />
        </div>

        <div>
          <label
            htmlFor="fb-name"
            className={`block text-sm text-ink-soft ${fBody}`}
          >
            {tf.nameLabel}
          </label>
          <input
            id="fb-name"
            type="text"
            value={name}
            maxLength={FB_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            onFocus={(e) =>
              e.currentTarget.scrollIntoView({
                block: "center",
                behavior: "smooth",
              })
            }
            disabled={status === "submitting"}
            className={FB_FIELD}
          />
        </div>

        <div>
          <label
            htmlFor="fb-message"
            className={`block text-sm text-ink-soft ${fBody}`}
          >
            {tf.messageLabel}
          </label>
          <textarea
            id="fb-message"
            value={message}
            rows={5}
            onChange={(e) => setMessage(e.target.value)}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            onFocus={(e) =>
              e.currentTarget.scrollIntoView({
                block: "center",
                behavior: "smooth",
              })
            }
            disabled={status === "submitting"}
            aria-describedby="fb-counter"
            className={`${FB_FIELD} resize-y not-italic leading-relaxed`}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p
              className={`text-xs text-[oklch(53%_0.19_28)] ${fBody}`}
              role="status"
              aria-live="polite"
            >
              {tooShort ? tf.minChars.replace("{n}", String(FB_MSG_MIN)) : ""}
            </p>
            <span
              id="fb-counter"
              className={`shrink-0 font-[family-name:var(--font-serif)] text-xs italic ${
                counterWarn ? "text-[oklch(53%_0.19_28)]" : "text-ink-faint"
              }`}
            >
              {message.length}/{FB_MSG_MAX}
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className={`inline-flex min-h-11 items-center justify-center rounded-full border border-[oklch(80%_0.04_50)] bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] px-6 py-2.5 text-sm text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_6px_18px_-8px_oklch(50%_0.1_30_/_0.25)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] disabled:translate-y-0 disabled:opacity-50 ${
            dev
              ? "font-[family-name:var(--font-devanagari)]"
              : "font-[family-name:var(--font-display)] tracking-[0.04em]"
          }`}
        >
          {status === "submitting" ? tf.sending : tf.send}
        </button>

        {status === "success" && (
          <p
            role="status"
            aria-live="polite"
            className={`text-sm text-[oklch(52%_0.13_205)] ${fBody}`}
          >
            {tf.success}
          </p>
        )}
        {status === "error" && (
          <div role="status" aria-live="polite" className="space-y-3">
            <p className={`text-sm text-[oklch(53%_0.19_28)] ${fBody}`}>
              {errorMsg ?? tf.errorGeneric}
            </p>
            <button
              type="button"
              onClick={submit}
              className={`inline-flex min-h-11 items-center justify-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/55 px-5 py-2 text-sm text-ink transition-colors hover:bg-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] ${
                dev
                  ? "font-[family-name:var(--font-devanagari)]"
                  : "font-[family-name:var(--font-display)] tracking-[0.04em]"
              }`}
            >
              {tf.retry}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
