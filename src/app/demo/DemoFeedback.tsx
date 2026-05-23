"use client";

import { useEffect, useRef, useState } from "react";

// /demo — visitor feedback card with a required 1–5 star rating and an
// optional comment. POSTs to the shared /api/feedback endpoint (same
// honeypot / rate-limit / 15s-timeout contract as the Settings "Share
// feedback" form), which was extended to carry an optional numeric
// `rating`. Anonymous is fine — the endpoint stores feedback with a
// null user_id when the god_messenger_uid cookie has not been set (a
// demo visitor who has not chatted yet). Star REQUIRED to submit; the
// comment is optional, so the API's text min-length is skipped when a
// rating is present.

type Status = "idle" | "submitting" | "success" | "error";

const FB_MSG_MAX = 5000;
const FB_FETCH_TIMEOUT_MS = 15000;

// Spoken-tone descriptors per score (Hindi-first, English gloss).
const RATING_WORDS_HI: Record<number, string> = {
  1: "और बेहतर हो सकता है",
  2: "ठीक-ठाक",
  3: "अच्छा लगा",
  4: "बहुत अच्छा",
  5: "हृदय छू गया",
};
const RATING_WORDS_EN: Record<number, string> = {
  1: "Needs work",
  2: "It was okay",
  3: "Liked it",
  4: "Very good",
  5: "Touched my heart",
};

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-full w-full"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.4}
      strokeLinejoin="round"
    >
      <path d="M12 2.6l2.7 5.95 6.5.62-4.9 4.32 1.45 6.36L12 16.9l-5.75 3.55 1.45-6.36-4.9-4.32 6.5-.62L12 2.6z" />
    </svg>
  );
}

export default function DemoFeedback() {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState("");
  const [hp, setHp] = useState(""); // honeypot — humans never fill this
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const composingRef = useRef(false); // IME composition guard
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const starRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(
    () => () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    },
    [],
  );

  // Visual fill follows hover when hovering, otherwise the committed value.
  const shown = hover || rating;
  const canSubmit =
    status !== "submitting" && rating >= 1 && message.length <= FB_MSG_MAX;

  // Roving-tabindex radiogroup keyboard handling.
  function onStarKey(e: React.KeyboardEvent, n: number) {
    let next = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowUp")
      next = Math.min(5, (rating || n) + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown")
      next = Math.max(1, (rating || n) - 1);
    else if (e.key === "Home") next = 1;
    else if (e.key === "End") next = 5;
    else return;
    e.preventDefault();
    setRating(next);
    starRefs.current[next - 1]?.focus();
  }

  async function submit() {
    if (composingRef.current) return; // mid-IME-composition Enter
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
          rating,
          message: message.trim() || undefined,
          website: hp, // honeypot — server treats non-empty as bot
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
      setRating(0);
      setHover(0);
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
    <section className="fade-up mt-10 [animation-delay:180ms] [animation-fill-mode:backwards] sm:mt-14">
      <div className="mx-auto max-w-[640px] rounded-2xl border border-[oklch(86%_0.04_70)] bg-white/55 px-5 py-6 shadow-[0_8px_24px_-16px_oklch(40%_0.08_30_/_0.25)] backdrop-blur sm:px-7 sm:py-7">
        <h2 className="font-[family-name:var(--font-devanagari)] text-[clamp(1.35rem,3.5vw,1.9rem)] leading-[1.2] text-ink">
          आपको कैसा लगा?
        </h2>
        <p className="mt-1 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.3em] text-ink-faint">
          Rate your experience
        </p>

        <form
          className="relative mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {/* Honeypot — off-screen, never filled by a human. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden opacity-0"
          >
            <label htmlFor="dfb-website">Website</label>
            <input
              id="dfb-website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={hp}
              onChange={(e) => setHp(e.target.value)}
            />
          </div>

          {/* Stars */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div
              role="radiogroup"
              aria-label="Rate your experience from 1 to 5 stars"
              aria-required="true"
              className="flex items-center gap-1"
              onMouseLeave={() => setHover(0)}
            >
              {[1, 2, 3, 4, 5].map((n) => {
                const active = shown >= n;
                return (
                  <button
                    key={n}
                    ref={(el) => {
                      starRefs.current[n - 1] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
                    tabIndex={rating === n || (rating === 0 && n === 1) ? 0 : -1}
                    disabled={status === "submitting"}
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHover(n)}
                    onFocus={() => setHover(n)}
                    onBlur={() => setHover(0)}
                    onKeyDown={(e) => onStarKey(e, n)}
                    className={`h-10 w-10 rounded-md p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] disabled:cursor-not-allowed motion-reduce:transition-none motion-reduce:hover:scale-100 ${
                      active
                        ? "text-[var(--color-gold-leaf)]"
                        : "text-[oklch(82%_0.03_70)]"
                    }`}
                  >
                    <StarIcon filled={active} />
                  </button>
                );
              })}
            </div>
            <span className="ml-2 min-h-6 font-[family-name:var(--font-serif)] text-sm italic text-ink-soft">
              {shown ? (
                <>
                  <span className="font-[family-name:var(--font-devanagari)] not-italic">
                    {RATING_WORDS_HI[shown]}
                  </span>
                  <span aria-hidden className="mx-1.5 text-brass">
                    ·
                  </span>
                  {RATING_WORDS_EN[shown]}
                </>
              ) : (
                ""
              )}
            </span>
          </div>

          {/* Optional comment */}
          <label
            htmlFor="dfb-message"
            className="mt-5 block font-[family-name:var(--font-serif)] text-sm italic text-ink-soft"
          >
            कुछ और कहना चाहो? · Anything to add? (optional)
          </label>
          <textarea
            id="dfb-message"
            value={message}
            rows={3}
            maxLength={FB_MSG_MAX}
            disabled={status === "submitting"}
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
            className="mt-2 w-full resize-y rounded-xl border border-[oklch(86%_0.04_70)] bg-white/70 px-4 py-3 font-[family-name:var(--font-devanagari)] text-base leading-relaxed text-ink shadow-[0_1px_0_rgba(255,255,255,.6)_inset] placeholder:text-ink-faint/60 focus:border-[oklch(76%_0.12_80)] focus:outline-none focus:ring-2 focus:ring-[oklch(76%_0.12_80_/_0.25)] disabled:opacity-60"
          />

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[oklch(80%_0.04_50)] bg-linear-to-b from-[oklch(96%_0.018_60)] to-[oklch(91%_0.04_50)] px-6 py-2.5 font-[family-name:var(--font-devanagari)] text-[14px] text-ink shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_6px_18px_-8px_oklch(50%_0.1_30_/_0.25)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(76%_0.12_80)] disabled:translate-y-0 disabled:opacity-50 motion-reduce:hover:translate-y-0"
            >
              {status === "submitting" ? (
                <>
                  भेजा जा रहा है…
                  <span className="ml-2 font-[family-name:var(--font-serif)] text-xs italic text-ink-soft">
                    · Sending…
                  </span>
                </>
              ) : (
                <>
                  प्रतिक्रिया भेजो
                  <span className="ml-2 font-[family-name:var(--font-serif)] text-xs italic text-ink-soft">
                    · Send
                  </span>
                </>
              )}
            </button>

            {status === "success" && (
              <p
                role="status"
                aria-live="polite"
                className="font-[family-name:var(--font-serif)] text-sm italic text-[oklch(52%_0.13_205)]"
              >
                <span className="font-[family-name:var(--font-devanagari)] not-italic">
                  धन्यवाद। आपकी प्रतिक्रिया मिल गई।
                </span>{" "}
                · Thank you for your feedback.
              </p>
            )}
            {status === "error" && errorMsg && (
              <p
                role="alert"
                aria-live="assertive"
                className="font-[family-name:var(--font-serif)] text-sm italic text-[oklch(53%_0.19_28)]"
              >
                {errorMsg}
              </p>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
