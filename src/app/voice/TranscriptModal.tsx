"use client";

// Phase 10.5 — post-exit transcript reader. In voice mode the turns are never
// shown on screen (the orb is the whole interface), so on exit the user can
// open this dialog to READ what was said. The turns are buffered in
// voiceSession's memory (no extra network call); VoiceClient pulls them with
// getTranscript() and passes them in. Verse cards are intentionally NOT shown
// (the user wasn't reading them live — surfacing them post-hoc is jarring;
// per the spec voice mode is plain text Q&A).
//
// Accessibility: role="dialog" + aria-modal, a labelled heading, Escape to
// close, focus moved to the close button on open and a focus trap on Tab, and
// turns rendered with a clear speaker heading per turn.

import { useEffect, useRef } from "react";
import { BRAND } from "@/lib/brand";
import type { TranscriptTurn } from "@/lib/voiceSession";

export default function TranscriptModal({
  isOpen,
  onClose,
  turns,
}: {
  isOpen: boolean;
  onClose: () => void;
  turns: TranscriptTurn[];
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const C = BRAND.voiceCopy;

  // Move focus to the close button on open; restore on close.
  useEffect(() => {
    if (!isOpen) return;
    const prevActive = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        // Simple focus trap within the panel.
        const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prevActive?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dv-transcript-title"
        onClick={(e) => e.stopPropagation()}
        className="dv-scroll fade-up flex max-h-[82vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-3xl border border-gold-leaf/40 bg-mist shadow-[0_-12px_48px_-12px_oklch(40%_0.08_30_/_0.35)] sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gold-leaf/25 px-5 py-4">
          <h2
            id="dv-transcript-title"
            className="font-[family-name:var(--font-display)] text-lg text-ink"
          >
            <span className="font-devanagari">{C.transcriptTitle.hi}</span>
            <span aria-hidden className="mx-2 text-gold-leaf">
              ·
            </span>
            <span className="font-serif italic">{C.transcriptTitle.en}</span>
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={`${C.close.hi} · ${C.close.en}`}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-gold-leaf/10 hover:text-ink focus:outline-none focus:ring-2 focus:ring-gold-leaf/40"
          >
            <span aria-hidden className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>

        <div className="dv-scroll flex-1 overflow-y-auto px-5 pt-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom,0px))]">
          {turns.length === 0 ? (
            <p className="py-8 text-center font-devanagari text-base leading-relaxed text-ink-soft">
              {C.transcriptEmpty.hi}
              <span aria-hidden className="mx-2 text-gold-leaf">
                ·
              </span>
              <span className="font-serif italic">{C.transcriptEmpty.en}</span>
            </p>
          ) : (
            <ol className="flex flex-col gap-5">
              {turns.map((turn, i) => {
                const isUser = turn.role === "user";
                return (
                  <li key={i} className={isUser ? "text-right" : "text-left"}>
                    <h3
                      className={
                        "mb-1 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-[0.16em] " +
                        (isUser ? "text-gold-leaf" : "text-peacock")
                      }
                    >
                      {isUser
                        ? `${C.youLabel.hi} · ${C.youLabel.en}`
                        : `${C.krishnaLabel.hi} · ${C.krishnaLabel.en}`}
                    </h3>
                    <p
                      className={
                        "inline-block max-w-[88%] whitespace-pre-wrap rounded-2xl border px-4 py-2.5 text-left font-devanagari text-base leading-relaxed text-ink " +
                        (isUser
                          ? "border-gold-leaf/30 bg-peach/40"
                          : "border-gold-leaf/20 bg-cloud/70")
                      }
                    >
                      {turn.content}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
