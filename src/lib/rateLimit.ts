// =============================================================================
// Shared rate limiting — Upstash Redis (serverless-safe, cross-instance).
// =============================================================================
// WHY Upstash (not in-memory): Vercel serverless memory is per-instance —
// cold starts reset it and concurrent lambdas shard it, so an in-memory Map is
// only spam-dampening, never a real cap (the existing /api/feedback limiter
// documents this). Upstash is a shared HTTP-based Redis that every lambda
// instance reads/writes, so the limit holds globally.
//
// FAILURE MODE: production defaults to fail-closed. If Redis env vars are
// absent, Redis init fails, or a Redis call throws, protected routes reject the
// request before spending AI/STT/TTS/payment resources. Local/dev defaults to
// fail-open for convenience. Set RATE_LIMIT_FAILURE_MODE=open only for an
// explicit emergency override.
//
// IDENTITY: every protected route limits on BOTH the anonymous cookie user-id
// AND the client IP, and blocks if EITHER bucket is exhausted. This stops both
// a single cookie hammering an endpoint AND a cookie-rotating attacker from one
// IP. IP is read from x-forwarded-for (Vercel sets it); first hop is the client.
//
// ENV (set in Vercel; absent locally defaults to fail-open):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ── Singleton Redis client (lazy) ────────────────────────────────────────────
let cachedRedis: Redis | null = null;
let redisUnavailable = false;

function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  if (redisUnavailable) return null;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    // Not configured (local dev, or env not yet set in Vercel). Mark
    // unavailable so we don't re-check env every call.
    redisUnavailable = true;
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN unset in production — protected routes will fail closed. Set them in Vercel to enable.",
      );
    }
    return null;
  }
  try {
    cachedRedis = new Redis({ url, token });
    return cachedRedis;
  } catch (e) {
    console.error("[rateLimit] Redis init failed:", e);
    redisUnavailable = true;
    return null;
  }
}

// ── Per-route-group limit definitions ────────────────────────────────────────
// Sliding window. Tunable; chosen generous enough that a real human never hits
// them, tight enough to bound automated abuse + per-call third-party cost.
// `requests` per `window`, applied INDEPENDENTLY to the user bucket and the IP
// bucket. The IP window is wider (shared NAT / families / offices) on the
// cheaper routes and tighter on the expensive AI/STT/TTS routes.
export type RateLimitRoute =
  | "chat"
  | "agent_llm"
  | "support"
  | "transcribe"
  | "tts"
  | "seva_create_order"
  | "lead";

type Limits = { user: [number, Duration]; ip: [number, Duration] };
type Duration = `${number} s` | `${number} m` | `${number} h` | `${number} d`;

const LIMITS: Record<RateLimitRoute, Limits> = {
  // Streaming Sonnet + several Haiku calls per turn — the costliest path.
  chat: { user: [12, "1 m"], ip: [30, "1 m"] },
  agent_llm: { user: [20, "1 m"], ip: [120, "1 m"] },
  // Haiku-backed, unauthenticated support widget.
  support: { user: [10, "1 m"], ip: [25, "1 m"] },
  // Sarvam paid STT — chunked, so allow bursts but bound the minute.
  transcribe: { user: [60, "1 m"], ip: [120, "1 m"] },
  // ElevenLabs paid TTS (also has its own 24h DB caps; this is the burst guard).
  tts: { user: [40, "1 m"], ip: [80, "1 m"] },
  // Razorpay order creation — should be rare per user.
  seva_create_order: { user: [10, "1 m"], ip: [20, "1 m"] },
  // Lead capture — fires conversion events; bound spam.
  lead: { user: [10, "1 h"], ip: [20, "1 h"] },
};

// ── Lazily-built Ratelimit instances, one per (route, scope) ─────────────────
// Each Ratelimit needs its own analytics prefix so user/ip buckets and routes
// never collide. Built on first use, cached thereafter.
const limiters = new Map<string, Ratelimit>();

function getLimiter(
  redis: Redis,
  route: RateLimitRoute,
  scope: "user" | "ip",
): Ratelimit {
  const key = `${route}:${scope}`;
  const existing = limiters.get(key);
  if (existing) return existing;
  const [requests, window] = LIMITS[route][scope];
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `dv:rl:${key}`,
    analytics: false,
  });
  limiters.set(key, limiter);
  return limiter;
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; scope: "user" | "ip" | "system"; retryAfterSec: number };

function shouldFailOpen(): boolean {
  const mode = process.env.RATE_LIMIT_FAILURE_MODE?.trim().toLowerCase();
  if (mode === "open") return true;
  if (mode === "closed") return false;
  return process.env.NODE_ENV !== "production";
}

function unavailableResult(context: string, err?: unknown): RateLimitResult {
  if (shouldFailOpen()) {
    if (err) {
      console.error(`[rateLimit] ${context} - fail-open:`, err);
    }
    return { ok: true };
  }
  if (err) {
    console.error(`[rateLimit] ${context} - fail-closed:`, err);
  } else {
    console.error(`[rateLimit] ${context} - fail-closed`);
  }
  return { ok: false, scope: "system", retryAfterSec: 60 };
}

/**
 * Check the rate limit for a route, against BOTH the user-id bucket and the IP
 * bucket. Blocks if EITHER is exhausted. Production fails closed on limiter
 * unavailability unless RATE_LIMIT_FAILURE_MODE=open is explicitly set.
 *
 * @param route   which route-group limit set to apply
 * @param userId  the anonymous cookie user id (or null/undefined if none yet)
 * @param ip      client IP (first hop of x-forwarded-for), or null
 */
export async function checkRateLimit(
  route: RateLimitRoute,
  userId: string | null | undefined,
  ip: string | null | undefined,
): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) return unavailableResult("Redis unavailable");

  try {
    // Build the checks we actually have an identity for. If neither a userId
    // nor an IP is available, there is nothing to key on → allow.
    const checks: Array<Promise<{ scope: "user" | "ip"; res: RateLimitOutcome }>> =
      [];
    if (userId) {
      checks.push(
        getLimiter(redis, route, "user")
          .limit(`u:${userId}`)
          .then((res) => ({ scope: "user" as const, res })),
      );
    }
    if (ip) {
      checks.push(
        getLimiter(redis, route, "ip")
          .limit(`ip:${ip}`)
          .then((res) => ({ scope: "ip" as const, res })),
      );
    }
    if (checks.length === 0) return { ok: true };

    const results = await Promise.all(checks);
    // Block on the first exhausted bucket. Both limit() calls have already run
    // (we want both counters to advance), so order here only affects which
    // scope is reported.
    for (const { scope, res } of results) {
      if (!res.success) {
        const retryAfterSec = Math.max(
          1,
          Math.ceil((res.reset - Date.now()) / 1000),
        );
        return { ok: false, scope, retryAfterSec };
      }
    }
    return { ok: true };
  } catch (e) {
    // Network / Redis error follows the configured failure mode. Production
    // defaults closed so paid provider routes do not run unbounded.
    return unavailableResult("check threw", e);
  }
}

// Minimal shape of what Ratelimit.limit() returns that we depend on.
type RateLimitOutcome = { success: boolean; reset: number };

/**
 * Extract the client IP from a request's x-forwarded-for header. Vercel sets
 * this; the first comma-separated hop is the originating client. Returns null
 * when absent (e.g. local dev) so the caller keys on user-id only.
 */
export function clientIpFromRequest(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}
