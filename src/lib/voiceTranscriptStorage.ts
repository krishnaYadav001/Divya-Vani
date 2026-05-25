// Phase 11.x — localStorage persistence for the /voice transcript.
//
// Mirrors chatStorage.ts but for the VOICE surface, with a SEPARATE storage key
// (founder 2026-05-26). Voice text and chat text are shown separately — the
// user sees what they said by voice on /voice and what they typed on /chat —
// even though the backend memory (users_memory) is shared. Keyed per cookie
// user_id so each browser identity gets its own history.
//
// All writes silent-fail: private-browsing, quota, and security-policy errors
// must never break the voice UI. Shape: version + user_id + turns + saved_at
// ISO timestamp; version bump invalidates older payloads; saved_at drives the
// 30-day age prune on load.

export type VoiceTranscriptTurn = { role: "user" | "agent"; text: string };

const STORAGE_KEY_PREFIX = "divya-vani-voice:";
const STORAGE_VERSION = 1;
const MAX_TURNS = 100;
const MAX_AGE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface PersistedVoiceSession {
  version: number;
  user_id: string;
  turns: VoiceTranscriptTurn[];
  saved_at: string;
}

function keyFor(userId: string): string {
  return STORAGE_KEY_PREFIX + userId;
}

export function loadTranscript(userId: string): VoiceTranscriptTurn[] | null {
  if (typeof window === "undefined") return null;
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedVoiceSession;
    if (parsed.version !== STORAGE_VERSION) {
      window.localStorage.removeItem(keyFor(userId));
      return null;
    }
    const ageMs = Date.now() - new Date(parsed.saved_at).getTime();
    if (!isFinite(ageMs) || ageMs > MAX_AGE_DAYS * MS_PER_DAY) {
      window.localStorage.removeItem(keyFor(userId));
      return null;
    }
    if (!Array.isArray(parsed.turns)) return null;
    // Defensive: keep only well-formed turns (guards against a corrupted/old shape).
    return parsed.turns.filter(
      (t): t is VoiceTranscriptTurn =>
        !!t &&
        (t.role === "user" || t.role === "agent") &&
        typeof t.text === "string",
    );
  } catch {
    try {
      window.localStorage.removeItem(keyFor(userId));
    } catch {
      /* swallow — best-effort cleanup */
    }
    return null;
  }
}

export function saveTranscript(
  userId: string,
  turns: VoiceTranscriptTurn[],
): void {
  if (typeof window === "undefined") return;
  if (!userId || turns.length === 0) return;
  const trimmed = turns.length > MAX_TURNS ? turns.slice(-MAX_TURNS) : turns;
  const session: PersistedVoiceSession = {
    version: STORAGE_VERSION,
    user_id: userId,
    turns: trimmed,
    saved_at: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(session));
  } catch (e) {
    const isQuota =
      e instanceof Error &&
      (e.name === "QuotaExceededError" ||
        e.name === "NS_ERROR_DOM_QUOTA_REACHED");
    if (!isQuota) return; // silent-fail: never break the voice UI
    // Quota hit — retry with a smaller tail, then give up silently.
    try {
      window.localStorage.setItem(
        keyFor(userId),
        JSON.stringify({ ...session, turns: trimmed.slice(-50) }),
      );
    } catch {
      /* swallow */
    }
  }
}

export function clearTranscript(userId: string): void {
  if (typeof window === "undefined") return;
  if (!userId) return;
  try {
    window.localStorage.removeItem(keyFor(userId));
  } catch {
    /* swallow */
  }
}
