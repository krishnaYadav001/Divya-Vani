import type { Message } from "@/lib/messages";

// Phase 6.8 — localStorage chat history persistence.
//
// Centralizes all browser localStorage access for the chat surface.
// Keyed per cookie-derived user_id so each browser identity gets its
// own history, matching the anonymous-by-default identity model
// (locked decision #14). All writes silent-fail: private-browsing,
// quota, and security-policy errors must never break the chat UI.
//
// Storage shape (PersistedSession): version + user_id + messages +
// saved_at ISO timestamp. Version bump invalidates older payloads;
// saved_at drives the 30-day age prune on hydrate.

const STORAGE_KEY_PREFIX = "divya-vani-chat:";
const STORAGE_VERSION = 1;
const MAX_MESSAGES = 100;
const MAX_AGE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface PersistedSession {
  version: number;
  user_id: string;
  messages: Message[];
  saved_at: string;
}

function keyFor(userId: string): string {
  return STORAGE_KEY_PREFIX + userId;
}

export function loadSession(userId: string): Message[] | null {
  if (typeof window === "undefined") return null;
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (parsed.version !== STORAGE_VERSION) {
      window.localStorage.removeItem(keyFor(userId));
      return null;
    }
    const ageMs = Date.now() - new Date(parsed.saved_at).getTime();
    if (!isFinite(ageMs) || ageMs > MAX_AGE_DAYS * MS_PER_DAY) {
      window.localStorage.removeItem(keyFor(userId));
      return null;
    }
    if (!Array.isArray(parsed.messages)) return null;
    return parsed.messages;
  } catch {
    try {
      window.localStorage.removeItem(keyFor(userId));
    } catch {
      /* swallow — best-effort cleanup */
    }
    return null;
  }
}

export function saveSession(userId: string, messages: Message[]): void {
  if (typeof window === "undefined") return;
  if (!userId || messages.length === 0) return;
  const trimmed =
    messages.length > MAX_MESSAGES ? messages.slice(-MAX_MESSAGES) : messages;
  const session: PersistedSession = {
    version: STORAGE_VERSION,
    user_id: userId,
    messages: trimmed,
    saved_at: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(session));
  } catch (e) {
    const isQuota =
      e instanceof Error &&
      (e.name === "QuotaExceededError" ||
        e.name === "NS_ERROR_DOM_QUOTA_REACHED");
    if (!isQuota) throw e;
    try {
      const pruned: PersistedSession = {
        ...session,
        messages: trimmed.slice(-50),
      };
      window.localStorage.setItem(keyFor(userId), JSON.stringify(pruned));
    } catch {
      // Caller decides whether to report; rethrow original quota error so
      // the call site can capture it once via Sentry.
      throw e;
    }
  }
}

export function clearSession(userId: string): void {
  if (typeof window === "undefined") return;
  if (!userId) return;
  try {
    window.localStorage.removeItem(keyFor(userId));
  } catch {
    /* swallow */
  }
}
