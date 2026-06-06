"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-dvh gap-6 px-6 text-center bg-[var(--color-mist)]">
      <p
        className="text-2xl"
        style={{ fontFamily: "var(--font-devanagari)", lineHeight: 1.6 }}
      >
        कुछ गड़बड़ हो गई
      </p>
      <p className="text-sm italic text-[var(--color-ink-soft)]" style={{ fontFamily: "var(--font-serif)" }}>
        Something went wrong. Please try again.
      </p>
      <button
        onClick={reset}
        className="px-6 py-2 rounded-full text-sm border border-[var(--color-gold-leaf)] text-[var(--color-ink)] hover:bg-[var(--color-buttermilk)] transition-colors"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Try again
      </button>
    </div>
  );
}
