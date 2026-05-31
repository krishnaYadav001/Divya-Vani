"use client";

import { useState } from "react";

interface Props {
  onSubscribed: () => void;
  onDismiss: () => void;
}

export default function MorningQuoteCard({ onSubscribed, onDismiss }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/morning-quote/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("done");
      setTimeout(onSubscribed, 1600);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div
      className="fade-up mx-auto my-2 w-full max-w-[480px] rounded-2xl border border-[var(--color-gold-leaf)]/30 bg-[var(--color-parchment)] px-5 py-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] [animation-delay:120ms] [animation-fill-mode:backwards]"
      role="complementary"
      aria-label="प्रातःकालीन आशीर्वाद"
    >
      {status === "done" ? (
        // Success state
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <span className="text-xl" aria-hidden>
            🌅
          </span>
          <p className="font-devanagari text-sm leading-relaxed text-[var(--color-ink)]">
            हर सुबह Krishna का संदेश आपके inbox में मिलेगा।
          </p>
          <p className="font-[family-name:var(--font-serif)] text-xs italic text-[var(--color-ink-faint)]">
            हरे कृष्ण 🙏
          </p>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {/* Sunrise glyph — CSS-only, no extra dependency */}
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-buttermilk)] text-base"
              >
                🌅
              </span>
              <div>
                <p className="font-devanagari text-sm font-medium leading-snug text-[var(--color-ink)]">
                  प्रातःकालीन आशीर्वाद
                </p>
                <p className="font-devanagari text-xs leading-snug text-[var(--color-ink-soft)]">
                  हर सुबह Krishna का एक संदेश
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="बंद करें"
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-faint)] transition-colors hover:bg-[var(--color-mist-2)] hover:text-[var(--color-ink-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--color-gold-leaf)]/40"
            >
              <span aria-hidden className="text-base leading-none">
                ×
              </span>
            </button>
          </div>

          {/* Decorative divider */}
          <div aria-hidden className="mb-3 flex items-center gap-2">
            <span className="h-px flex-1 bg-[var(--color-gold-leaf)]/20" />
            <span className="h-1 w-1 rotate-45 bg-[var(--color-gold-leaf)]/40" />
            <span className="h-px flex-1 bg-[var(--color-gold-leaf)]/20" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubscribe} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status === "error") setStatus("idle");
              }}
              placeholder="आपका email"
              required
              aria-label="Email address"
              className={`min-w-0 flex-1 rounded-xl border bg-[var(--color-mist-2)]/60 px-3 py-2 font-[family-name:var(--font-serif)] text-sm italic text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-gold-leaf)]/40 ${
                status === "error"
                  ? "border-[var(--color-vermillion)]/40"
                  : "border-[var(--color-ink-line)]/50"
              }`}
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="shrink-0 rounded-xl bg-[var(--color-gold-leaf)] px-4 py-2 font-devanagari text-sm text-[var(--color-parchment)] shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-gold-leaf)]/60 disabled:opacity-60"
            >
              {status === "loading" ? "…" : "पाएं"}
            </button>
          </form>

          {status === "error" && (
            <p
              role="alert"
              className="mt-2 font-devanagari text-xs text-[var(--color-vermillion)]"
            >
              कुछ गड़बड़ हुई। दोबारा कोशिश करें।
            </p>
          )}

          <p className="mt-2.5 font-[family-name:var(--font-serif)] text-xs italic text-[var(--color-ink-faint)]">
            Unsubscribe anytime · No spam
          </p>
        </>
      )}
    </div>
  );
}
