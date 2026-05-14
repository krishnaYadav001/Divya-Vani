"use client";

import { useState } from "react";
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
      {/* SECTION 1 — Conversation Review toggle */}
      <section className="fade-up rounded-2xl border border-brass/40 bg-parchment/80 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] [animation-delay:180ms] [animation-fill-mode:backwards] sm:p-8">
        <h2 className="font-serif text-xl font-semibold italic text-sacred">
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
              May the founder review your conversations to improve
              Krishna&apos;s voice?
            </p>
          </div>
        </div>

        <p className="mt-5 font-serif text-sm italic leading-relaxed text-brass-dark">
          If yes, your conversations are kept for 180 days. If no, future
          conversations will not be saved.
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

      {/* SECTION 2 — Danger Zone (DELETE MY DATA).
          Separated visually by extra mt + a different border treatment
          (double border via outer + inner card). NO bright-red danger
          colour — temple aesthetic conveys gravity through typography
          weight, spacing, and the brass border, not chromatic alarm. */}
      <section className="fade-up rounded-2xl border-2 border-brass bg-parchment/60 p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] [animation-delay:360ms] [animation-fill-mode:backwards] sm:p-8">
        <h2 className="font-serif text-xl font-semibold italic text-sacred">
          Delete all my data
        </h2>

        <div className="mt-4 space-y-3">
          <p className="font-serif text-base italic leading-relaxed text-krishna">
            This will remove all your conversations, name, and memory from
            our system. This cannot be undone.
          </p>
          <p className="font-serif text-sm italic leading-relaxed text-brass-dark">
            Payment records are retained as required by Indian financial law.
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
