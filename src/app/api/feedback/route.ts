import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { insertFeedback } from "@/lib/supabase";

// Phase 8.x — user feedback intake (Settings → "Share Feedback").
// Mirrors the /api/settings route shape exactly (async cookies(),
// NextResponse.json, try/catch, console.error). Sentry capture is
// automatic via the Next SDK server instrumentation
// (sentry.server.config.ts) — no route in this project calls
// captureException explicitly; console.error is the greppable trail
// per the ops invariant ([feedback] prefix).

const USER_COOKIE = "god_messenger_uid";

const MESSAGE_MIN = 10;
const MESSAGE_MAX = 5000;
const NAME_MAX = 100;
const RATING_MIN = 1;
const RATING_MAX = 5;

// Honeypot: a direct POST that carries any of these fields with a
// non-empty value is a bot. We pretend success (200) so it does not
// learn it was caught, and never touch the DB. The Settings form binds
// a hidden, off-screen `website` input to satisfy DOM-filling bots too.
const HONEYPOT_FIELDS = ["website", "url", "company", "honeypot", "hp"];

// Best-effort in-memory rate limit: 5 submissions / rolling hour / key.
// NOTE (deliberate, per task): Vercel serverless memory is per-instance
// — cold starts reset it and concurrent lambdas shard it, so this is
// spam-dampening, not a hard guarantee. The size cap keeps a long-lived
// warm instance from leaking memory.
const RATE_LIMIT_MAX = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAP_MAX_KEYS = 5000;
const rateMap = new Map<string, number[]>();

function rateLimit(
  key: string,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();

  // Opportunistic eviction so the Map cannot grow without bound.
  if (rateMap.size > RATE_MAP_MAX_KEYS) {
    for (const [k, ts] of rateMap) {
      const fresh = ts.filter((t) => now - t < RATE_WINDOW_MS);
      if (fresh.length === 0) rateMap.delete(k);
      else rateMap.set(k, fresh);
    }
    if (rateMap.size > RATE_MAP_MAX_KEYS) rateMap.clear(); // degrade open
  }

  const prev = (rateMap.get(key) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  if (prev.length >= RATE_LIMIT_MAX) {
    const oldest = Math.min(...prev);
    const retryAfterSec = Math.max(
      1,
      Math.ceil((RATE_WINDOW_MS - (now - oldest)) / 1000),
    );
    rateMap.set(key, prev);
    return { ok: false, retryAfterSec };
  }
  prev.push(now);
  rateMap.set(key, prev);
  return { ok: true };
}

export async function POST(req: Request) {
  try {
    const jar = await cookies();
    // No cookie is fine — feedback is still accepted (stored with a
    // null user_id). insertFeedback also nulls a dangling cookie that
    // has no users_memory row, so the FK can never reject valid input.
    const userId = jar.get(USER_COOKIE)?.value ?? null;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: "invalid_json",
          message: "Could not read your submission. Please try again.",
        },
        { status: 400 },
      );
    }

    const raw = (body ?? {}) as Record<string, unknown>;

    // Honeypot — silent success, no DB write.
    for (const f of HONEYPOT_FIELDS) {
      const v = raw[f];
      if (typeof v === "string" && v.trim().length > 0) {
        return NextResponse.json({ ok: true }, { status: 200 });
      }
    }

    const message =
      typeof raw.message === "string" ? raw.message.trim() : "";
    const rawName =
      typeof raw.user_name === "string" ? raw.user_name.trim() : "";
    const userName = rawName.length > 0 ? rawName : null;

    // Optional 1–5 star rating (the /demo feedback card). Absent =>
    // null (the Settings "Share feedback" path, which carries no
    // rating). A present-but-malformed rating is rejected rather than
    // silently coerced, so bad data never reaches the DB.
    let rating: number | null = null;
    if (raw.rating !== undefined && raw.rating !== null) {
      const r = raw.rating;
      if (
        typeof r === "number" &&
        Number.isInteger(r) &&
        r >= RATING_MIN &&
        r <= RATING_MAX
      ) {
        rating = r;
      } else {
        return NextResponse.json(
          {
            error: "invalid_rating",
            message: `Rating must be a whole number from ${RATING_MIN} to ${RATING_MAX}.`,
          },
          { status: 400 },
        );
      }
    }

    // The written message is REQUIRED only when there is no star rating
    // (text-only feedback, e.g. the Settings form). When a rating is
    // present the comment is optional — a rating-only submission is
    // valid, so an empty/short message is allowed and the min-length
    // gate is skipped.
    if (rating === null && message.length < MESSAGE_MIN) {
      return NextResponse.json(
        {
          error: "message_too_short",
          message: `Please write at least ${MESSAGE_MIN} characters.`,
        },
        { status: 400 },
      );
    }
    if (message.length > MESSAGE_MAX) {
      return NextResponse.json(
        {
          error: "message_too_long",
          message: `Please keep your feedback under ${MESSAGE_MAX} characters.`,
        },
        { status: 400 },
      );
    }
    if (userName !== null && userName.length > NAME_MAX) {
      return NextResponse.json(
        {
          error: "name_too_long",
          message: `Name must be ${NAME_MAX} characters or fewer.`,
        },
        { status: 400 },
      );
    }

    // Rate-limit key: cookie user when present, else best-effort client
    // IP from the proxy header (Vercel sets x-forwarded-for), else a
    // shared anon bucket.
    const ipHeader = req.headers.get("x-forwarded-for");
    const ip = ipHeader ? ipHeader.split(",")[0]?.trim() : "";
    const rlKey = userId ? `u:${userId}` : ip ? `ip:${ip}` : "anon";
    const rl = rateLimit(rlKey);
    if (!rl.ok) {
      return NextResponse.json(
        {
          error: "rate_limited",
          message:
            "You've sent feedback a few times recently. Please try again a little later.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSec) },
        },
      );
    }

    const result = await insertFeedback({ userId, message, userName, rating });
    if (!result.ok) {
      // Intentional departure from the chat-path "silent-fail": a
      // feedback form must confirm receipt honestly, so a failed write
      // surfaces as 500 (Sentry auto-captures via console.error).
      console.error(
        "[feedback] insert failed for user:",
        userId ?? "(anon)",
      );
      return NextResponse.json(
        { error: "internal_error" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("[feedback] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
