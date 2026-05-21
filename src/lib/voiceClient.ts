// Phase 10.2 — client-side voice playback controller (singleton).
//
// One module-level controller drives all per-reply play buttons in
// /chat. It owns: a single shared <audio> element (registered by ChatUI),
// an in-session Map<replyId, blobUrl> cache, the id of whatever is
// currently active, and a set of subscribers (each VoicePlayButton).
//
// Cost discipline: /api/tts is hit ONLY on a user tap that misses the
// in-session cache. Re-playing an already-fetched reply (scrolled back
// into view, paused→resumed) replays the cached blob with no network
// call. A page reload clears the cache; the next play re-fetches, but the
// server-side content-addressed cache makes that fast.
//
// Pure module (no React, no JSX) — safe to import from client components.
// All browser APIs (Audio, fetch, URL) are touched only inside functions,
// never at module top level, so an SSR import is harmless.

export type VoiceStatus = "idle" | "loading" | "playing" | "paused" | "error";

export interface VoiceState {
  replyId: string | null;
  status: VoiceStatus;
  errorCode?: string;
}

// 30s client-side ceiling on a single /api/tts fetch (edge case 10).
const FETCH_TIMEOUT_MS = 30_000;

const audioCache = new Map<string, string>(); // replyId → object URL

let audioEl: HTMLAudioElement | null = null;
let listenersBound = false;

let currentReplyId: string | null = null;
let currentStatus: VoiceStatus = "idle";
let currentError: string | undefined;

let inFlight: AbortController | null = null;
let timedOut = false;

const subscribers = new Set<(state: VoiceState) => void>();

function snapshot(): VoiceState {
  return {
    replyId: currentReplyId,
    status: currentStatus,
    errorCode: currentError,
  };
}

function publish(state: VoiceState): void {
  currentReplyId = state.replyId;
  currentStatus = state.status;
  currentError = state.errorCode;
  for (const cb of subscribers) cb(state);
}

/** ChatUI registers the single hidden <audio> element here (ref callback /
 *  effect). Passing null on unmount stops playback and detaches. */
export function setAudioElement(el: HTMLAudioElement | null): void {
  if (el === audioEl) return;
  if (audioEl && listenersBound) {
    audioEl.removeEventListener("ended", onEnded);
    audioEl.removeEventListener("error", onAudioError);
    listenersBound = false;
  }
  audioEl = el;
  if (audioEl && !listenersBound) {
    audioEl.addEventListener("ended", onEnded);
    audioEl.addEventListener("error", onAudioError);
    listenersBound = true;
  }
}

function onEnded(): void {
  const ended = currentReplyId;
  publish({ replyId: ended, status: "idle" });
  // After publishing "idle" for the ended reply, clear the active id so a
  // fresh tap on the same reply re-plays rather than trying to resume.
  currentReplyId = null;
  currentStatus = "idle";
  currentError = undefined;
}

function onAudioError(): void {
  // Fired when the element fails to decode/load the source (rare —
  // corrupted MP3). The button shows retry; retry re-fetches.
  if (currentReplyId) {
    publish({ replyId: currentReplyId, status: "error", errorCode: "playback" });
  }
}

function mapHttpStatus(status: number): string {
  switch (status) {
    case 401:
      return "auth";
    case 402:
      return "paywall";
    case 429:
      return "rate_limit";
    case 503:
      return "tts_unavailable";
    default:
      return "network";
  }
}

async function playFromUrl(replyId: string, url: string): Promise<void> {
  const el = audioEl ?? new Audio();
  // Keep a handle even in the fallback path so pause/resume work.
  audioEl = el;
  if (!listenersBound) {
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onAudioError);
    listenersBound = true;
  }
  try {
    if (el.src !== url) el.src = url;
    el.currentTime = 0;
    await el.play();
    publish({ replyId, status: "playing" });
  } catch (e) {
    console.error("[voice] audio.play() failed:", e);
    publish({ replyId, status: "error", errorCode: "playback" });
  }
}

/**
 * Play (or resume / retry) the voice for `replyId`. Only one reply is ever
 * active; starting a new one stops the previous. Never throws.
 *
 * @param opts.bypassCache  drop any cached blob and re-fetch (error retry,
 *                          edge case 13).
 */
export async function playVoice(
  replyId: string,
  text: string,
  opts: { bypassCache?: boolean } = {},
): Promise<void> {
  // Resume a paused current reply (edge: paused → tap → play). Audio
  // resumes from where it paused; if it had ended this branch isn't taken
  // (onEnded clears currentReplyId).
  if (
    currentReplyId === replyId &&
    currentStatus === "paused" &&
    audioEl &&
    !opts.bypassCache
  ) {
    try {
      await audioEl.play();
      publish({ replyId, status: "playing" });
    } catch (e) {
      console.error("[voice] resume failed:", e);
      publish({ replyId, status: "error", errorCode: "playback" });
    }
    return;
  }

  // Already loading THIS reply → ignore the double tap (edge case 1).
  if (currentReplyId === replyId && currentStatus === "loading") return;

  // Switching to a different reply (or retrying): stop whatever is active
  // and cancel any in-flight fetch (edge cases 2 + 11).
  if (audioEl) audioEl.pause();
  if (inFlight) {
    inFlight.abort();
    inFlight = null;
  }

  if (opts.bypassCache) {
    const stale = audioCache.get(replyId);
    if (stale) {
      URL.revokeObjectURL(stale);
      audioCache.delete(replyId);
    }
  }

  // In-session cache hit → replay the blob, no network, no cost.
  const cached = audioCache.get(replyId);
  if (cached) {
    await playFromUrl(replyId, cached);
    return;
  }

  // Cache miss → fetch from the TTS backend.
  publish({ replyId, status: "loading" });
  const controller = new AbortController();
  inFlight = controller;
  timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (inFlight === controller) inFlight = null;

    if (!res.ok) {
      const errorCode = mapHttpStatus(res.status);
      console.error(`[voice] /api/tts ${res.status} → ${errorCode}`);
      publish({ replyId, status: "error", errorCode });
      return;
    }

    // Defensive: the 200 body must be audio (edge case 19).
    const contentType = res.headers.get("Content-Type") ?? "";
    if (!contentType.startsWith("audio/")) {
      console.error("[voice] unexpected content-type:", contentType);
      publish({ replyId, status: "error", errorCode: "network" });
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    audioCache.set(replyId, url);
    await playFromUrl(replyId, url);
  } catch (e) {
    clearTimeout(timer);
    if (inFlight === controller) inFlight = null;
    if (controller.signal.aborted && !timedOut) {
      // Superseded by a newer tap — the new call already published its own
      // state; stay silent so we don't clobber it with an error.
      return;
    }
    const errorCode = timedOut ? "network" : "network";
    console.error("[voice] fetch failed:", e);
    publish({ replyId, status: "error", errorCode });
  }
}

/** Pause the current reply (playing → paused). The blob stays loaded so a
 *  tap resumes from the paused position. */
export function pauseVoice(): void {
  if (!audioEl || !currentReplyId) return;
  audioEl.pause();
  publish({ replyId: currentReplyId, status: "paused" });
}

/** Fully stop and reset to idle. Used for superseding + ChatUI unmount. */
export function stopVoice(): void {
  if (inFlight) {
    inFlight.abort();
    inFlight = null;
  }
  if (audioEl) audioEl.pause();
  publish({ replyId: null, status: "idle" });
  currentReplyId = null;
}

/**
 * Register a state-change callback. Immediately invoked with the current
 * snapshot so a freshly-mounted button (e.g. scrolled back into view)
 * syncs to whatever is active. Returns an unsubscribe fn.
 */
export function subscribe(cb: (state: VoiceState) => void): () => void {
  subscribers.add(cb);
  cb(snapshot());
  return () => {
    subscribers.delete(cb);
  };
}

/** Debug only — not used by the UI. */
export function getCachedReplyIds(): Set<string> {
  return new Set(audioCache.keys());
}
