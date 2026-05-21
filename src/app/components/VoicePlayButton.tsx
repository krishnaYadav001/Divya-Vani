"use client";

import { useEffect, useRef, useState } from "react";
import {
  playVoice,
  pauseVoice,
  subscribe,
  type VoiceStatus,
} from "@/lib/voiceClient";

// Phase 10.2 — per-reply "play Krishna's voice" button.
//
// Subscribes to the singleton voiceClient and reflects ONLY this reply's
// state (any other reply being active forces this button back to idle —
// only one reply plays at a time). A tap routes to play / pause / resume /
// retry depending on the current status. Never auto-plays; the first
// sound is always a direct response to this tap (Locked v1 rule + the
// mobile-Safari gesture requirement, edge case 14).
//
// System-layer control — NOT Krishna speaking. The bilingual aria-labels
// ("Play Krishna's voice / कृष्ण की आवाज़ सुनो") describe the UI action;
// no first-person persona text, no suggestion-pill semantics (Phase 7
// invariant intact).

type Props = {
  replyId: string;
  text: string;
  /** Called when this reply's TTS request is rejected for payment (402).
   *  ChatUI opens the existing seva panel. */
  onPaywall?: () => void;
};

const ERROR_TITLES: Record<string, string> = {
  auth: "Session expired — reload the page / सत्र समाप्त — पेज रिफ्रेश करें",
  paywall: "Seva needed to hear Krishna's voice / आवाज़ के लिए सेवा आवश्यक",
  rate_limit:
    "Too many voice plays — try again later / थोड़ी देर बाद कोशिश करें",
  tts_unavailable:
    "Voice unavailable right now — tap to retry / आवाज़ अभी उपलब्ध नहीं — दोबारा कोशिश करें",
  network: "Voice failed — tap to retry / दोबारा कोशिश करें",
  playback: "Couldn't play audio — tap to retry / दोबारा कोशिश करें",
};

function ariaLabelFor(status: VoiceStatus): string {
  switch (status) {
    case "playing":
      return "Pause / रुको";
    case "loading":
      return "Loading voice / आवाज़ ला रहे हैं";
    case "error":
      return "Voice failed — tap to retry / दोबारा कोशिश करें";
    case "paused":
    case "idle":
    default:
      return "Play Krishna's voice / कृष्ण की आवाज़ सुनो";
  }
}

export default function VoicePlayButton({ replyId, text, onPaywall }: Props) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);

  // Keep the latest onPaywall without forcing a re-subscribe.
  const onPaywallRef = useRef(onPaywall);
  onPaywallRef.current = onPaywall;
  // Skip the immediate snapshot invocation when detecting a paywall
  // transition (we only want to react to a fresh 402, not to mount state).
  const initializedRef = useRef(false);
  const prevStatusRef = useRef<VoiceStatus>("idle");

  useEffect(() => {
    const unsub = subscribe((s) => {
      const mine = s.replyId === replyId;
      const nextStatus: VoiceStatus = mine ? s.status : "idle";
      const nextError = mine ? s.errorCode : undefined;

      if (
        initializedRef.current &&
        mine &&
        nextStatus === "error" &&
        nextError === "paywall" &&
        prevStatusRef.current !== "error"
      ) {
        onPaywallRef.current?.();
      }
      initializedRef.current = true;
      prevStatusRef.current = nextStatus;

      setStatus(nextStatus);
      setErrorCode(nextError);
    });
    return unsub;
  }, [replyId]);

  function handleClick() {
    if (status === "loading") return; // disabled mid-fetch (edge case 1)
    if (status === "playing") {
      pauseVoice();
      return;
    }
    if (status === "error") {
      // Retry re-fetches; bypass any stale/corrupt blob (edge case 13).
      void playVoice(replyId, text, { bypassCache: true });
      return;
    }
    // idle or paused → play / resume.
    void playVoice(replyId, text);
  }

  const isPlaying = status === "playing";
  const isLoading = status === "loading";
  const isError = status === "error";
  const isPaused = status === "paused";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      aria-label={ariaLabelFor(status)}
      aria-busy={isLoading || undefined}
      title={isError ? ERROR_TITLES[errorCode ?? "network"] : undefined}
      className={
        "group relative inline-flex h-11 w-11 items-center justify-center " +
        "rounded-full focus:outline-none focus-visible:ring-2 " +
        "focus-visible:ring-[oklch(76%_0.12_80)] focus-visible:ring-offset-2 " +
        "disabled:cursor-default"
      }
    >
      {/* Pulse ring while playing — existing keyframe, already disabled
          under prefers-reduced-motion in globals.css. */}
      {isPlaying && (
        <span
          aria-hidden
          className="dv-pulse pointer-events-none absolute inset-1.5 rounded-full ring-2 ring-[oklch(76%_0.12_80_/_0.5)]"
        />
      )}

      {/* Visible 28px circle. */}
      <span
        aria-hidden
        className={
          "relative flex h-7 w-7 items-center justify-center rounded-full border " +
          "transition-transform motion-reduce:transition-none " +
          "group-hover:-translate-y-px motion-reduce:group-hover:translate-y-0 " +
          (isError
            ? "border-[oklch(53%_0.19_28_/_0.4)] bg-white/55"
            : "border-[oklch(76%_0.12_80)] bg-white/55") +
          // Paused: thin inner gold ring marks "loaded, tap to resume".
          (isPaused ? " ring-1 ring-inset ring-[oklch(76%_0.12_80)]" : "")
        }
      >
        {isLoading ? (
          // Spinner: built-in animate-spin, stilled under reduced motion.
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 animate-spin text-[var(--color-gold-leaf)] motion-reduce:animate-none"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="3"
            />
            <path
              d="M12 3a9 9 0 0 1 9 9"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        ) : isError ? (
          // Error: filled vermillion dot at reduced opacity.
          <span
            className="h-3 w-3 rounded-full bg-[oklch(53%_0.19_28_/_0.7)]"
          />
        ) : isPlaying ? (
          // Pause icon.
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 text-[var(--color-vermillion)]"
            fill="currentColor"
          >
            <path d="M6 5 V19 H9 V5 Z" />
            <path d="M15 5 V19 H18 V5 Z" />
          </svg>
        ) : (
          // Play icon (idle + paused).
          <svg
            viewBox="0 0 24 24"
            className="ml-0.5 h-3.5 w-3.5 text-[var(--color-vermillion)]"
            fill="currentColor"
          >
            <path d="M8 5 L19 12 L8 19 Z" />
          </svg>
        )}
      </span>
    </button>
  );
}
