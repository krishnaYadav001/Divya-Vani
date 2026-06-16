// Referral_Reward_System — client-side capture of the `?ref` invite code.
//
// Mirrors chatStorage.ts / voiceTranscriptStorage.ts: every storage access is
// guarded by `typeof window` and wrapped in try/catch so it can NEVER throw and
// NEVER block render. Referral capture is a non-essential side effect — a
// private-browsing, quota, or security-policy error (or a malformed/old payload)
// must degrade silently and leave the app fully usable (Req 3.3, 3.4).
//
// Capture rule (Req 3.1, 3.2): on app load read the URL `ref` param; if it is a
// single, well-formed value (1-64 chars from [A-Za-z0-9_-]) AND nothing is
// already stored, persist { code, stored_at }. An existing stored value is never
// overwritten, and invalid/duplicate refs are a no-op that preserves prior state.
// The stored timestamp drives the server-side pre-existing-user attribution guard.

const REF_STORAGE_KEY = "divya-vani-ref:v1";
const REF_FORMAT = /^[A-Za-z0-9_-]{1,64}$/;

export interface StoredRef {
  code: string;
  stored_at: string; // ISO timestamp
}

/**
 * On app load: read URLSearchParams "ref". If valid (single occurrence,
 * 1-64 chars [A-Za-z0-9_-]) AND nothing already stored, persist
 * { code, stored_at }. Never overwrites an existing stored value. Invalid or
 * duplicate ref → no-op. Never throws; never blocks render.
 */
export function captureRefFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const all = params.getAll("ref");
    // Single occurrence only — a `ref` repeated in the query string is invalid.
    if (all.length !== 1) return;
    const code = all[0];
    if (!REF_FORMAT.test(code)) return;
    // Never overwrite an already-stored ref (first invite wins).
    if (window.localStorage.getItem(REF_STORAGE_KEY) !== null) return;
    const stored: StoredRef = { code, stored_at: new Date().toISOString() };
    window.localStorage.setItem(REF_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* swallow — capture is best-effort and must never break the app */
  }
}

/** Returns the stored ref, or null if absent/invalid/unavailable/malformed. */
export function readStoredRef(): StoredRef | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRef>;
    // Defensive: validate the persisted shape and re-check the code format so a
    // corrupted or tampered payload never yields an invalid attribution value.
    if (
      !parsed ||
      typeof parsed.code !== "string" ||
      typeof parsed.stored_at !== "string" ||
      !REF_FORMAT.test(parsed.code)
    ) {
      return null;
    }
    return { code: parsed.code, stored_at: parsed.stored_at };
  } catch {
    return null;
  }
}

/** Clears the stored ref once attribution has been attempted (silent-fail). */
export function clearStoredRef(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(REF_STORAGE_KEY);
  } catch {
    /* swallow */
  }
}
