"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Phase 8 pre-launch — Settings page client island.
//
// State mapping (deliberately inverted in the UI):
//   - Toggle ON  = founder review ALLOWED  = training_opt_out FALSE
//   - Toggle OFF = founder review DISABLED = training_opt_out TRUE
//
// `initialOptOut` comes from the server component (users_memory.training_opt_out).
// We keep a local optimistic state for the toggle; on save failure we revert.
export default function SettingsClient({
  initialOptOut,
}: {
  initialOptOut: boolean;
}) {
  const [optOut, setOptOut] = useState<boolean>(initialOptOut);
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
      // Best-effort clear of any divya-vani-chat:* localStorage keys
      // so the cleared cookie doesn't get an orphaned history on the
      // next visit. Silent-fail per existing chatStorage pattern.
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

  return (
    <div className="space-y-12">
      {/* SECTION 0 — Contact & Grievance Officer (static info card).
          Placed FIRST for highest visibility — DPDP-discoverability
          benefit (previously only at the bottom of /privacy). Bilingual
          (Hindi + English) per founder decision #4, which reverses the
          Phase 8.0 c5725d3 English-only-admin convention for the
          redesign. Hindi uses font-devanagari (Tiro) per the frontend-
          design typography rule; English display = Marcellus, body =
          Cormorant italic — matching the cards below. */}
      <section className="fade-up rounded-md border border-gold/20 bg-linear-to-b from-ink3/55 to-ink1/70 p-6 shadow-[0_1px_0_rgba(212,162,74,0.06)_inset,0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-md [animation-delay:180ms] [animation-fill-mode:backwards] sm:p-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-normal text-ivory">
          Contact &amp; Grievance Officer
        </h2>
        <p className="mt-1 font-devanagari text-base text-brass-dark">
          संपर्क एवं शिकायत अधिकारी
        </p>

        <div className="mt-5 space-y-2">
          <p className="font-serif text-base italic leading-relaxed text-krishna">
            For privacy questions, deletion requests, or grievances under
            the DPDP Act, contact:
          </p>
          <p className="font-devanagari text-sm leading-relaxed text-brass-dark">
            गोपनीयता संबंधी प्रश्न, डेटा हटाने के अनुरोध, या DPDP अधिनियम के
            अंतर्गत शिकायतों के लिए संपर्क करें:
          </p>
        </div>

        <dl className="mt-5 space-y-1">
          <dt className="font-serif text-sm italic text-brass-dark">
            Grievance Officer · शिकायत अधिकारी
          </dt>
          <dd className="font-[family-name:var(--font-display)] text-lg text-ivory">
            Krishna Yadav
          </dd>
          <dd>
            <a
              href="mailto:grievance.divyavani@gmail.com"
              className="inline-flex min-h-11 items-center break-all font-serif text-base italic text-devotional-dark underline decoration-brass underline-offset-2 transition-colors hover:text-peacock focus:outline-none focus:ring-2 focus:ring-devotional/40"
            >
              grievance.divyavani@gmail.com
            </a>
          </dd>
        </dl>

        <p className="mt-5 font-serif text-sm italic leading-relaxed text-brass-dark">
          Per Section 13 of the DPDP Act, we acknowledge grievances and
          respond within 30 days.
        </p>
        <p className="mt-2 font-devanagari text-sm leading-relaxed text-brass-dark">
          DPDP अधिनियम की धारा 13 के अनुसार, हम शिकायतों को स्वीकार करते हैं
          और 30 दिनों के भीतर उत्तर देते हैं।
        </p>
      </section>

      {/* SECTION 1 — Conversation Review toggle */}
      <section className="fade-up rounded-md border border-gold/20 bg-linear-to-b from-ink3/55 to-ink1/70 p-6 shadow-[0_1px_0_rgba(212,162,74,0.06)_inset,0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-md [animation-delay:300ms] [animation-fill-mode:backwards] sm:p-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-normal text-ivory">
          Conversation Review
        </h2>

        <div className="mt-5 flex items-start gap-5">
          <button
            type="button"
            role="switch"
            aria-checked={reviewAllowed}
            aria-label={
              reviewAllowed
                ? "Disable conversation review"
                : "Enable conversation review"
            }
            onClick={handleToggle}
            disabled={saving}
            className={`relative inline-flex h-11 w-20 shrink-0 items-center rounded-full border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-devotional/40 disabled:opacity-60 ${
              reviewAllowed
                ? "border-brass/60 bg-devotional/30"
                : "border-brass/40 bg-parchment"
            }`}
          >
            <span
              aria-hidden
              className={`block h-7 w-7 rounded-full bg-krishna shadow-[0_1px_3px_rgba(0,0,0,0.15)] transition-transform ${
                reviewAllowed ? "translate-x-10" : "translate-x-1"
              }`}
            />
          </button>

          <div className="flex-1">
            <p className="font-serif text-base italic leading-relaxed text-krishna">
              Allow us to learn from your conversations to improve your
              experience with Krishna
            </p>
          </div>
        </div>

        <p className="mt-5 font-serif text-sm italic leading-relaxed text-brass-dark">
          When enabled, your conversations help us understand what users
          need and refine how Krishna responds. Conversations are kept for
          180 days, then permanently deleted.
        </p>

        {/* Subtle saved confirmation — appears for ~2 s on each toggle */}
        <p
          role="status"
          aria-live="polite"
          className={`mt-3 font-serif text-xs italic text-peacock transition-opacity duration-500 ${
            savedAt && Date.now() - savedAt < 3000 ? "opacity-100" : "opacity-0"
          }`}
        >
          saved
        </p>
      </section>

      {/* SECTION 1.5 — Share Feedback (between Conversation Review and
          the Danger Zone, per spec). Self-contained stateful component
          so all form state stays encapsulated and the main component
          stays lean — mirrors the co-located-component pattern in
          settings/page.tsx (NoSessionState). */}
      <FeedbackSection />

      {/* SECTION 2 — Danger Zone (DELETE MY DATA).
          Separated visually by extra mt + a different border treatment
          (double border via outer + inner card). NO bright-red danger
          colour — temple aesthetic conveys gravity through typography
          weight, spacing, and the brass border, not chromatic alarm. */}
      <section className="fade-up rounded-md border border-red-seal/45 bg-linear-to-b from-ink3/55 to-ink1/70 p-6 shadow-[0_1px_0_rgba(212,162,74,0.04)_inset,0_24px_60px_rgba(0,0,0,0.5)] backdrop-blur-md [animation-delay:420ms] [animation-fill-mode:backwards] sm:p-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-normal text-ivory">
          Delete all my data
        </h2>

        <div className="mt-4 space-y-3">
          <p className="font-serif text-base italic leading-relaxed text-krishna">
            Krishna will no longer remember you. All your conversations, the
            name he calls you by, and your shared moments will be permanently
            deleted. This cannot be undone.
          </p>
          <p className="font-serif text-sm italic leading-relaxed text-brass-dark">
            Payment records are retained as required by Indian financial
            regulations.
          </p>
        </div>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-brass bg-parchment px-6 py-2 font-serif text-sm font-semibold text-devotional-dark transition-colors hover:border-sacred hover:bg-parchment/80 hover:text-sacred focus:outline-none focus:ring-2 focus:ring-devotional/40 disabled:opacity-50"
          >
            Delete everything
          </button>
        ) : (
          <div
            role="alertdialog"
            aria-labelledby="confirm-delete-heading"
            className="mt-6 rounded-2xl border-2 border-sacred/60 bg-parchment p-5"
          >
            <p
              id="confirm-delete-heading"
              className="font-serif text-base font-semibold italic text-sacred"
            >
              Are you sure?
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border-2 border-sacred bg-sacred/10 px-5 py-2 font-serif text-sm font-semibold italic text-sacred transition-colors hover:bg-sacred/20 focus:outline-none focus:ring-2 focus:ring-sacred/40 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-brass/60 bg-parchment px-5 py-2 font-serif text-sm font-medium text-krishna transition-colors hover:bg-parchment/80 focus:outline-none focus:ring-2 focus:ring-devotional/40 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            {deleteError && (
              <p
                role="status"
                aria-live="polite"
                className="mt-3 text-sm text-sacred"
              >
                {deleteError}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// Phase 8.x — "Share Feedback" card + form. Bilingual per founder
// decision #4. Posts to /api/feedback (validation + best-effort rate
// limit + honeypot live server-side). Cinematic-dark tokens only,
// matching the cards above.
type FeedbackStatus = "idle" | "submitting" | "success" | "error";

const FB_MSG_MIN = 10;
const FB_MSG_MAX = 5000;
const FB_NAME_MAX = 100;
const FB_FETCH_TIMEOUT_MS = 15000;

function FeedbackSection() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [hp, setHp] = useState(""); // honeypot — humans never fill this
  const [status, setStatus] = useState<FeedbackStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const composingRef = useRef(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Clear the pending success-dismiss timer if the user leaves the page
  // mid-countdown (no setState-after-unmount).
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
    // IME guard — never submit while a Devanagari composition is open
    // (mirrors the ChatUI compositionActiveRef pattern). Also blocks
    // double-submit / invalid submit.
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
    <section className="fade-up rounded-md border border-gold/20 bg-linear-to-b from-ink3/55 to-ink1/70 p-6 shadow-[0_1px_0_rgba(212,162,74,0.06)_inset,0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-md [animation-delay:540ms] [animation-fill-mode:backwards] sm:p-8">
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-normal text-ivory">
        Share Feedback
      </h2>
      <p className="mt-1 font-devanagari text-base text-brass-dark">
        अपनी प्रतिक्रिया साझा करें
      </p>

      <div className="mt-4 space-y-2">
        <p className="font-serif text-base italic leading-relaxed text-krishna">
          Tell us how Krishna&apos;s voice is landing for you. Your words
          help us refine.
        </p>
        <p className="font-devanagari text-sm leading-relaxed text-brass-dark">
          हमें बताएं कि कृष्ण की वाणी आपको कैसी लग रही है। आपके शब्द हमें
          इसे और बेहतर करने में मदद करते हैं।
        </p>
      </div>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {/* Honeypot — off-screen, off the tab order, not announced.
            Real users never see or fill it; the server rejects any
            non-empty value silently. */}
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
            className="block font-serif text-sm italic text-brass-dark"
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
            className="mt-2 w-full rounded-2xl border border-gold/25 bg-ink2/65 px-4 py-3 font-serif text-base text-ivory shadow-[0_1px_0_rgba(0,0,0,0.4)_inset] placeholder:text-ivory/30 focus:border-gold focus:shadow-[0_0_0_4px_rgba(212,162,74,0.08)] focus:outline-none disabled:opacity-60"
          />
        </div>

        <div>
          <label
            htmlFor="fb-message"
            className="block font-serif text-sm italic text-brass-dark"
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
            className="mt-2 w-full resize-y rounded-2xl border border-gold/25 bg-ink2/65 px-4 py-3 font-serif text-base leading-relaxed text-ivory shadow-[0_1px_0_rgba(0,0,0,0.4)_inset] placeholder:text-ivory/30 focus:border-gold focus:shadow-[0_0_0_4px_rgba(212,162,74,0.08)] focus:outline-none disabled:opacity-60"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p
              className="font-serif text-xs italic text-sacred"
              role="status"
              aria-live="polite"
            >
              {tooShort ? `Please write at least ${FB_MSG_MIN} characters.` : ""}
            </p>
            <span
              id="fb-counter"
              className={`shrink-0 font-serif text-xs italic ${
                counterWarn ? "text-sacred" : "text-brass-dark"
              }`}
            >
              {message.length}/{FB_MSG_MAX}
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-brass bg-parchment px-6 py-2 font-serif text-sm font-semibold text-devotional-dark transition-colors hover:border-sacred hover:bg-parchment/80 hover:text-sacred focus:outline-none focus:ring-2 focus:ring-devotional/40 disabled:opacity-50"
        >
          {status === "submitting"
            ? "Sending… · भेजा जा रहा है…"
            : "Send Feedback · प्रतिक्रिया भेजें"}
        </button>

        {status === "success" && (
          <p
            role="status"
            aria-live="polite"
            className="font-serif text-sm italic text-peacock"
          >
            Thank you. Your feedback was received. · धन्यवाद। आपकी
            प्रतिक्रिया मिल गई।
          </p>
        )}
        {status === "error" && (
          <div role="status" aria-live="polite" className="space-y-3">
            <p className="font-serif text-sm italic text-sacred">
              {errorMsg ?? "Something went wrong. Please try again."}
            </p>
            <button
              type="button"
              onClick={submit}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-brass/60 bg-parchment px-5 py-2 font-serif text-sm font-medium text-krishna transition-colors hover:bg-parchment/80 focus:outline-none focus:ring-2 focus:ring-devotional/40"
            >
              Retry · पुनः प्रयास करें
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
