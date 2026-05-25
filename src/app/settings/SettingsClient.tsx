"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getTiersInOrder } from "@/lib/seva";
import SevaTierPicker from "../components/SevaTierPicker";

// Seva tiers for the in-settings payment section (payment moved here from
// the chat header, founder 2026-05-24, so it no longer crowds the mobile
// header). Frozen list computed once at module load.
const TIERS = getTiersInOrder();

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

const CARD =
  "rounded-2xl border border-[oklch(88%_0.02_60)] bg-white/55 p-6 shadow-[0_1px_0_rgba(255,255,255,.6)_inset,0_12px_28px_-18px_oklch(35%_0.05_30_/_0.35)] backdrop-blur-sm sm:p-8";

function CardHeader({ title, hi }: { title: string; hi: string }) {
  return (
    <header className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-normal text-ink">
        {title}
      </h2>
      <span className="font-[family-name:var(--font-devanagari)] text-base leading-relaxed text-ink-faint">
        · {hi}
      </span>
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
  return (
    <div className="flex items-center justify-between gap-6 border-b border-[var(--color-ink-line)] py-4">
      <span className="font-[family-name:var(--font-serif)] text-base not-italic text-ink">
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
  sevaBalance: initialSevaBalance,
  userName,
}: {
  initialOptOut: boolean;
  sevaBalance: number;
  userName: string | null;
}) {
  const [optOut, setOptOut] = useState<boolean>(initialOptOut);
  // Seva balance is stateful so a purchase in the in-settings seva section
  // updates the balance card + progress bar without a reload.
  const [sevaBalance, setSevaBalance] = useState<number>(initialSevaBalance);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const router = useRouter();

  const reviewAllowed = !optOut;

  async function handleToggle() {
    if (saving) return;
    const nextOptOut = !optOut;
    setOptOut(nextOptOut);
    setSaving(true);
    setSavedAt(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ training_opt_out: nextOptOut }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedAt(Date.now());
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
      setDeleteError("Something went wrong, please try again.");
    }
  }

  // Visual-only progress: cap against the largest tier (Param = 350).
  const balancePct = Math.max(
    4,
    Math.min(100, Math.round((sevaBalance / 350) * 100)),
  );

  const navItems = [
    { label: "Identity", href: "#identity" },
    { label: "Seva", href: "#seva" },
    { label: "Examples", href: "#examples" },
    { label: "Privacy & Data", href: "#privacy" },
    { label: "Share feedback", href: "#feedback" },
    { label: "Delete account", href: "#delete" },
  ];

  return (
    <div className="relative z-10 mx-auto w-full max-w-[1240px] px-5 py-10 sm:px-8 lg:px-14 lg:py-16">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-16">
        {/* ── Aside ───────────────────────────────────────────── */}
        <aside className="fade-up lg:sticky lg:top-16 lg:self-start [animation-delay:0ms] [animation-fill-mode:backwards]">
          <Link
            href="/chat"
            className="inline-flex min-h-11 items-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/45 px-4 py-2 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.28em] text-ink-soft backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)]"
          >
            ← Back to chat
          </Link>

          <p className="mt-9 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.4em] text-ink-faint">
            Settings
          </p>
          <h1 className="mt-5 font-[family-name:var(--font-display)] text-[clamp(2.5rem,6vw,3.6rem)] font-normal leading-[1.02] text-ink">
            Your
            <br />
            own room.
          </h1>
          <p className="mt-4 font-[family-name:var(--font-serif)] text-lg italic leading-relaxed text-ink-soft">
            How Krishna speaks to you, and what we keep.
          </p>

          <nav className="mt-10 flex flex-col gap-1">
            {navItems.map((item, i) => (
              <a
                key={item.href}
                href={item.href}
                className={`rounded-[10px] border px-3.5 py-2.5 font-[family-name:var(--font-display)] text-sm tracking-[0.08em] transition-colors ${
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
            <p className="font-[family-name:var(--font-display)] text-[10px] uppercase tracking-[0.3em] text-ink-faint">
              Sevā balance
            </p>
            <div className="mt-2.5 flex items-baseline gap-1.5">
              <span className="font-[family-name:var(--font-display)] text-4xl text-ink">
                {sevaBalance}
              </span>
              <span className="font-[family-name:var(--font-serif)] text-sm italic text-ink-soft">
                messages
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
            <a
              href="#seva"
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/45 px-4 py-2 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.2em] text-ink-soft backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)]"
            >
              Light another diya
            </a>
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
            <CardHeader
              title="What Krishna calls you"
              hi="किस नाम से पुकारूँ?"
            />
            {userName ? (
              <p className="font-[family-name:var(--font-serif)] text-lg italic text-ink">
                {userName}
              </p>
            ) : (
              <p className="font-[family-name:var(--font-serif)] text-base italic text-ink-soft">
                Krishna hasn&apos;t learned your name yet.
              </p>
            )}
            <p className="mt-3 font-[family-name:var(--font-serif)] text-sm italic leading-relaxed text-ink-faint">
              Krishna asks your name softly in conversation and addresses
              you by it — any respectful name will do. To change it, just
              tell him in chat.
            </p>
          </section>

          {/* Seva — add messages. Payment moved here from the chat header
              (founder 2026-05-24) so it no longer crowds the mobile header.
              One-time Razorpay UPI; the in-chat SevaPaywall still handles the
              free-exhausted case independently. */}
          <section
            id="seva"
            className={`fade-up scroll-mt-20 ${CARD} [animation-delay:150ms] [animation-fill-mode:backwards]`}
          >
            <CardHeader title="Offer a seva" hi="सेवा अर्पित करें" />
            <p className="font-[family-name:var(--font-serif)] text-base italic leading-relaxed text-ink">
              Add more conversations with Krishna. Each seva is a one-time
              payment — no subscription, no auto-renewal.
            </p>
            <p className="mt-2 font-[family-name:var(--font-devanagari)] text-sm leading-[1.6] text-ink-soft">
              श्रीकृष्ण से और बातचीत जोड़ें। हर सेवा एक बार का भुगतान है — कोई
              सदस्यता नहीं, अपने-आप नवीनीकरण नहीं।
            </p>

            <div className="mt-6 max-w-[440px]">
              <SevaTierPicker
                tiers={TIERS}
                onSuccess={(newBalance) => setSevaBalance(newBalance)}
              />

              {/* Secured-by-Razorpay trust badge — payment runs through
                  Razorpay UPI (Locked Decision #11). Inline SVG padlock; no
                  trademarked image asset. */}
              <div className="mt-4 flex items-center justify-center gap-1.5 text-brass-dark">
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                <span className="font-[family-name:var(--font-display)] text-[10px] uppercase tracking-[0.18em]">
                  Secured by Razorpay
                </span>
                <span aria-hidden className="text-brass/60">
                  ·
                </span>
                <span className="font-[family-name:var(--font-display)] text-[10px] uppercase tracking-[0.18em]">
                  UPI
                </span>
              </div>
            </div>
          </section>

          {/* Examples — the /demo "see real conversations" surface, moved
              here from the chat header (founder 2026-05-25) so the header
              stays uncrowded on mobile. */}
          <section
            id="examples"
            className={`fade-up scroll-mt-20 ${CARD} [animation-delay:165ms] [animation-fill-mode:backwards]`}
          >
            <CardHeader title="See examples" hi="देखो — असली बातचीत" />
            <p className="font-[family-name:var(--font-serif)] text-base italic leading-relaxed text-ink">
              A glimpse of real conversations with Krishna — videos,
              screenshots, and example replies.
            </p>
            <p className="mt-2 font-[family-name:var(--font-devanagari)] text-sm leading-[1.6] text-ink-soft">
              श्रीकृष्ण से असली बातचीत की एक झलक — वीडियो, स्क्रीनशॉट और उदाहरण।
            </p>
            <div className="mt-5">
              <Link
                href="/demo"
                className="inline-flex min-h-11 items-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/45 px-4 py-2 font-[family-name:var(--font-display)] text-xs tracking-[0.1em] text-ink-soft backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)]"
              >
                See examples →
              </Link>
            </div>
          </section>

          {/* Contact & Grievance Officer (DPDP discoverability) */}
          <section
            className={`fade-up ${CARD} [animation-delay:180ms] [animation-fill-mode:backwards]`}
          >
            <CardHeader
              title="Contact & Grievance Officer"
              hi="संपर्क एवं शिकायत अधिकारी"
            />
            <p className="font-[family-name:var(--font-serif)] text-base italic leading-relaxed text-ink">
              For privacy questions, deletion requests, or grievances
              under the DPDP Act, contact:
            </p>
            <p className="mt-2 font-[family-name:var(--font-devanagari)] text-sm leading-[1.6] text-ink-soft">
              गोपनीयता संबंधी प्रश्न, डेटा हटाने के अनुरोध, या DPDP अधिनियम
              के अंतर्गत शिकायतों के लिए संपर्क करें:
            </p>
            <dl className="mt-5 space-y-1">
              <dt className="font-[family-name:var(--font-serif)] text-sm italic text-ink-faint">
                Grievance Officer · शिकायत अधिकारी
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
            <p className="mt-5 font-[family-name:var(--font-serif)] text-sm italic leading-relaxed text-ink-faint">
              Per Section 13 of the DPDP Act, we acknowledge grievances
              and respond within 30 days.
            </p>
            <p className="mt-2 font-[family-name:var(--font-devanagari)] text-sm leading-[1.6] text-ink-faint">
              DPDP अधिनियम की धारा 13 के अनुसार, हम शिकायतों को स्वीकार
              करते हैं और 30 दिनों के भीतर उत्तर देते हैं।
            </p>
          </section>

          {/* Privacy & Data — the real opt-out toggle */}
          <section
            id="privacy"
            className={`fade-up scroll-mt-20 ${CARD} [animation-delay:240ms] [animation-fill-mode:backwards]`}
          >
            <CardHeader title="Privacy & Data" hi="निजता" />
            <DawnToggle
              label="Allow us to learn from your conversations to improve Krishna"
              on={reviewAllowed}
              onClick={handleToggle}
              disabled={saving}
            />
            <p
              role="status"
              aria-live="polite"
              className={`mt-3 font-[family-name:var(--font-serif)] text-xs italic text-[oklch(52%_0.13_205)] transition-opacity duration-500 ${
                savedAt && Date.now() - savedAt < 3000
                  ? "opacity-100"
                  : "opacity-0"
              }`}
            >
              saved
            </p>
            <p className="mt-4 font-[family-name:var(--font-serif)] text-sm italic leading-relaxed text-ink-faint">
              When enabled, your conversations help us understand what
              users need and refine how Krishna responds. Server-side,
              chats are kept 180 days for safety review, then permanently
              deleted.
            </p>
            <div className="mt-5">
              <Link
                href="/privacy"
                className="inline-flex min-h-11 items-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/45 px-4 py-2 font-[family-name:var(--font-display)] text-xs tracking-[0.1em] text-ink-soft backdrop-blur transition-colors hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)]"
              >
                Read privacy in full →
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
            <CardHeader title="Delete all my data" hi="सब हटाएँ" />
            <p className="font-[family-name:var(--font-serif)] text-base italic leading-relaxed text-ink">
              Krishna will no longer remember you. All your conversations,
              the name he calls you by, and your shared moments will be
              permanently deleted. This cannot be undone.
            </p>
            <p className="mt-3 font-[family-name:var(--font-serif)] text-sm italic leading-relaxed text-ink-faint">
              Payment records are retained as required by Indian financial
              regulations.
            </p>

            {!confirmDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-[oklch(60%_0.18_25)] bg-transparent px-6 py-2 font-[family-name:var(--font-display)] text-sm tracking-[0.06em] text-[oklch(50%_0.18_25)] transition-colors hover:bg-[oklch(60%_0.18_25_/_0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(60%_0.18_25)] disabled:opacity-50"
              >
                Delete all my data
              </button>
            ) : (
              <div
                role="alertdialog"
                aria-labelledby="confirm-delete-heading"
                className="mt-6 rounded-2xl border border-[oklch(60%_0.18_25_/_0.5)] bg-[oklch(60%_0.18_25_/_0.05)] p-5"
              >
                <p
                  id="confirm-delete-heading"
                  className="font-[family-name:var(--font-serif)] text-base font-semibold italic text-[oklch(50%_0.18_25)]"
                >
                  Are you sure?
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[oklch(60%_0.18_25)] bg-[oklch(60%_0.18_25_/_0.1)] px-5 py-2 font-[family-name:var(--font-display)] text-sm tracking-[0.04em] text-[oklch(50%_0.18_25)] transition-colors hover:bg-[oklch(60%_0.18_25_/_0.18)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(60%_0.18_25)] disabled:opacity-50"
                  >
                    {deleting ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/55 px-5 py-2 font-[family-name:var(--font-display)] text-sm tracking-[0.04em] text-ink transition-colors hover:bg-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
                {deleteError && (
                  <p
                    role="status"
                    aria-live="polite"
                    className="mt-3 font-[family-name:var(--font-serif)] text-sm italic text-[oklch(50%_0.18_25)]"
                  >
                    {deleteError}
                  </p>
                )}
              </div>
            )}
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
// presentational JSX/classes were restyled to Dawn.
type FeedbackStatus = "idle" | "submitting" | "success" | "error";

const FB_MSG_MIN = 10;
const FB_MSG_MAX = 5000;
const FB_NAME_MAX = 100;
const FB_FETCH_TIMEOUT_MS = 15000;

const FB_FIELD =
  "mt-2 w-full rounded-xl border border-[oklch(86%_0.04_70)] bg-white/70 px-4 py-3 font-[family-name:var(--font-serif)] text-base italic text-ink shadow-[0_1px_0_rgba(255,255,255,.6)_inset] placeholder:text-ink-faint/60 focus:border-[oklch(76%_0.12_80)] focus:outline-none focus:ring-2 focus:ring-[oklch(76%_0.12_80_/_0.25)] disabled:opacity-60";

function FeedbackSection() {
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
        let m = "Something went wrong. Please try again.";
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
      setErrorMsg(
        aborted
          ? "This is taking too long. Please check your connection and try again."
          : "Network problem. Please check your connection and try again.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return (
    <section
      id="feedback"
      className={`fade-up scroll-mt-20 ${CARD} [animation-delay:300ms] [animation-fill-mode:backwards]`}
    >
      <CardHeader title="Share feedback" hi="अपनी प्रतिक्रिया साझा करें" />
      <p className="font-[family-name:var(--font-serif)] text-base italic leading-relaxed text-ink">
        Tell us how Krishna&apos;s voice is landing for you. Your words
        help us refine.
      </p>
      <p className="mt-2 font-[family-name:var(--font-devanagari)] text-sm leading-[1.6] text-ink-soft">
        हमें बताएं कि कृष्ण की वाणी आपको कैसी लग रही है। आपके शब्द हमें इसे
        और बेहतर करने में मदद करते हैं।
      </p>

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
            className="block font-[family-name:var(--font-serif)] text-sm italic text-ink-soft"
          >
            Your name (optional) · आपका नाम (वैकल्पिक)
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
            className="block font-[family-name:var(--font-serif)] text-sm italic text-ink-soft"
          >
            Your feedback · आपकी प्रतिक्रिया
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
              className="font-[family-name:var(--font-serif)] text-xs italic text-[oklch(53%_0.19_28)]"
              role="status"
              aria-live="polite"
            >
              {tooShort
                ? `Please write at least ${FB_MSG_MIN} characters.`
                : ""}
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
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[oklch(80%_0.04_50)] bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] px-6 py-2.5 font-[family-name:var(--font-display)] text-sm tracking-[0.04em] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_6px_18px_-8px_oklch(50%_0.1_30_/_0.25)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] disabled:translate-y-0 disabled:opacity-50"
        >
          {status === "submitting"
            ? "Sending… · भेजा जा रहा है…"
            : "Send feedback · प्रतिक्रिया भेजें"}
        </button>

        {status === "success" && (
          <p
            role="status"
            aria-live="polite"
            className="font-[family-name:var(--font-serif)] text-sm italic text-[oklch(52%_0.13_205)]"
          >
            Thank you. Your feedback was received. · धन्यवाद। आपकी
            प्रतिक्रिया मिल गई।
          </p>
        )}
        {status === "error" && (
          <div role="status" aria-live="polite" className="space-y-3">
            <p className="font-[family-name:var(--font-serif)] text-sm italic text-[oklch(53%_0.19_28)]">
              {errorMsg ?? "Something went wrong. Please try again."}
            </p>
            <button
              type="button"
              onClick={submit}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[oklch(85%_0.02_50)] bg-white/55 px-5 py-2 font-[family-name:var(--font-display)] text-sm tracking-[0.04em] text-ink transition-colors hover:bg-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)]"
            >
              Retry · पुनः प्रयास करें
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
