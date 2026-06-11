import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { embedChatTurn } from "./chatMemory";

/**
 * Phase 7.0 — names commonly mistaken by Haiku's extractMemory for user names
 * but are actually acknowledgments / greetings / common particles. Used as a
 * deny-list at both write (saveMemory) and read (fetchMemory) sides to handle
 * incoming bad extractions AND clean existing bad data already saved.
 */
const BANNED_USER_NAMES: ReadonlySet<string> = new Set([
  "han", "haan", "haa", "hmm", "hm", "mhm", "mm",
  "ok", "okay", "yes", "no", "nahi", "nahin",
  "achha", "accha", "acha", "theek", "thik",
  "namaste", "namaskar", "pranam", "pranaam",
  "hello", "hi", "hey",
  "bye", "goodbye", "alvida",
  "kya", "kyon", "kyun", "kaise",
  "tum", "aap", "main", "mai", "tu",
  "thanks", "thank", "shukriya", "dhanyavad", "dhanyawad",
]);

function isBannedName(name: string | null | undefined): boolean {
  if (!name) return false;
  return BANNED_USER_NAMES.has(name.trim().toLowerCase());
}

export interface UserMemory {
  main_problem?: string | null;
  emotion?: string | null;
  context_summary?: string | null;
  last_active_at?: string | null;
  message_count?: number | null;
  seva_balance?: number | null;
  is_first_time?: boolean | null;
  verses_referenced?: string[] | null;
  user_name?: string | null;
  growing_edge?: string | null;
  // Phase 8 pre-launch — when TRUE, user has opted out of conversation
  // review for product improvement. logChatTurn must skip writes for
  // these users (safety_events + users_memory writes continue per
  // duty-of-care and product function).
  training_opt_out?: boolean | null;
}

export type PaymentStatus = "created" | "verified" | "failed";

export interface PaymentRow {
  id?: string;
  user_id: string;
  razorpay_order_id: string;
  razorpay_payment_id?: string | null;
  amount_paise: number;
  tier: string;
  status: PaymentStatus;
  created_at?: string;
  verified_at?: string | null;
  refunded_at?: string | null;
  razorpay_refund_id?: string | null;
}

// Phase 9 — subscription status mirrors Razorpay's subscription lifecycle, plus
// 'paused' (we never pause in v1 but the column allows it). Only 'active' grants
// entitlements; the partial unique index guarantees ≤1 active row per user.
export type SubscriptionStatus =
  | "created"
  | "authenticated"
  | "active"
  | "pending"
  | "halted"
  | "cancelled"
  | "completed"
  | "expired"
  | "paused";

export interface SubscriptionRow {
  id?: string;
  user_id: string;
  razorpay_subscription_id: string;
  razorpay_customer_id?: string | null;
  plan_key: string;
  currency: string;
  billing_period: string;
  status: SubscriptionStatus;
  // Entitlements are SNAPSHOTTED at creation (see schema) so a later config
  // change never silently alters an existing subscriber's allowance.
  message_pool: number;
  messages_used: number;
  voice_minutes_pool: number;
  voice_seconds_used: number;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end: boolean;
  cancelled_at?: string | null;
  amount?: number | null;
  created_at?: string;
  updated_at?: string;
}

let cachedClient: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[supabase] env vars missing", {
      hasUrl: !!url,
      hasKey: !!key,
    });
    return null;
  }
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

type SaveMemoryFields = Partial<
  Pick<
    UserMemory,
    | "main_problem"
    | "emotion"
    | "context_summary"
    | "message_count"
    | "seva_balance"
    | "is_first_time"
    | "verses_referenced"
    | "user_name"
    | "growing_edge"
  >
>;

/**
 * Upserts the row for `userId`. Always bumps last_active_at + updated_at.
 * Only writes the optional fields that are defined on `fields` — this lets
 * callers update just `message_count`, just the extracted memory, or both,
 * without clobbering unrelated columns.
 */
export async function saveMemory(
  userId: string,
  fields: SaveMemoryFields,
): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      user_id: userId,
      last_active_at: now,
      updated_at: now,
    };
    if (fields.main_problem !== undefined) {
      payload.main_problem = fields.main_problem ?? null;
    }
    if (fields.emotion !== undefined) {
      payload.emotion = fields.emotion ?? null;
    }
    if (fields.context_summary !== undefined) {
      payload.context_summary = fields.context_summary ?? null;
    }
    if (fields.message_count !== undefined) {
      payload.message_count = fields.message_count;
    }
    if (fields.seva_balance !== undefined) {
      payload.seva_balance = fields.seva_balance;
    }
    if (fields.is_first_time !== undefined) {
      payload.is_first_time = fields.is_first_time;
    }
    if (fields.verses_referenced !== undefined) {
      payload.verses_referenced = fields.verses_referenced ?? [];
    }
    if (fields.user_name !== undefined) {
      if (isBannedName(fields.user_name)) {
        console.log(
          "[supabase] saveMemory skipped banned user_name:",
          fields.user_name,
        );
        // do not include user_name in the update payload
      } else {
        payload.user_name = fields.user_name ?? null;
      }
    }
    if (fields.growing_edge !== undefined) {
      payload.growing_edge = fields.growing_edge ?? null;
    }
    const { error } = await client
      .from("users_memory")
      .upsert(payload, { onConflict: "user_id" });
    if (error) {
      console.error("[supabase] saveMemory error:", error);
    }
  } catch (e) {
    console.error("[supabase] saveMemory threw:", e);
  }
}

/**
 * Bump just `last_active_at` for the user. Used when no extraction or save
 * would otherwise happen but we still want to mark the user as active.
 */
export async function touchActivity(userId: string): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;
    const { error } = await client.from("users_memory").upsert(
      {
        user_id: userId,
        last_active_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      console.error("[supabase] touchActivity error:", error);
    }
  } catch (e) {
    console.error("[supabase] touchActivity threw:", e);
  }
}

/**
 * Inserts an audit row for an order just created with Razorpay. The row is
 * keyed by razorpay_order_id (UNIQUE) so the verify endpoint can look it
 * up later and enforce idempotent crediting.
 */
export async function insertPayment(
  payment: Pick<
    PaymentRow,
    "user_id" | "razorpay_order_id" | "amount_paise" | "tier" | "status"
  >,
): Promise<boolean> {
  try {
    const client = getClient();
    if (!client) return false;
    const { error } = await client.from("payments").insert(payment);
    if (error) {
      console.error("[supabase] insertPayment error:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[supabase] insertPayment threw:", e);
    return false;
  }
}

/**
 * Looks up a payment row by Razorpay order id. Used by the verify route
 * to validate the order exists and belongs to the requesting user.
 */
export async function findPaymentByOrderId(
  orderId: string,
): Promise<PaymentRow | null> {
  try {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client
      .from("payments")
      .select("*")
      .eq("razorpay_order_id", orderId)
      .maybeSingle();
    if (error) {
      console.error("[supabase] findPaymentByOrderId error:", error);
      return null;
    }
    return (data as PaymentRow | null) ?? null;
  } catch (e) {
    console.error("[supabase] findPaymentByOrderId threw:", e);
    return null;
  }
}

/**
 * Looks up a payment row by Razorpay payment id. Used by the webhook
 * handler when a refund.created event arrives — the refund payload
 * references the payment id, not the order id.
 */
export async function findPaymentByPaymentId(
  paymentId: string,
): Promise<PaymentRow | null> {
  try {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client
      .from("payments")
      .select("*")
      .eq("razorpay_payment_id", paymentId)
      .maybeSingle();
    if (error) {
      console.error("[supabase] findPaymentByPaymentId error:", error);
      return null;
    }
    return (data as PaymentRow | null) ?? null;
  } catch (e) {
    console.error("[supabase] findPaymentByPaymentId threw:", e);
    return null;
  }
}

/**
 * Atomic state transition: 'created' → 'verified'. Sets razorpay_payment_id
 * and verified_at on success. Returns the updated row, or null if no row
 * matched (race: another verify already ran, or order not in 'created').
 * The WHERE status='created' clause makes this race-safe.
 */
export async function markPaymentVerifiedAtomic(
  orderId: string,
  paymentId: string,
): Promise<PaymentRow | null> {
  try {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client
      .from("payments")
      .update({
        status: "verified",
        razorpay_payment_id: paymentId,
        verified_at: new Date().toISOString(),
      })
      .eq("razorpay_order_id", orderId)
      .eq("status", "created")
      .select("*")
      .maybeSingle();
    if (error) {
      console.error("[supabase] markPaymentVerifiedAtomic error:", error);
      return null;
    }
    return (data as PaymentRow | null) ?? null;
  } catch (e) {
    console.error("[supabase] markPaymentVerifiedAtomic threw:", e);
    return null;
  }
}

/**
 * Marks a payment as failed (e.g. signature mismatch). Only transitions
 * from 'created' so an already-verified payment cannot be flipped.
 */
export async function markPaymentFailed(orderId: string): Promise<boolean> {
  try {
    const client = getClient();
    if (!client) return false;
    const { error } = await client
      .from("payments")
      .update({ status: "failed" })
      .eq("razorpay_order_id", orderId)
      .eq("status", "created");
    if (error) {
      console.error("[supabase] markPaymentFailed error:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[supabase] markPaymentFailed threw:", e);
    return false;
  }
}

/**
 * Marks a payment as refunded. Idempotent on refund_id: re-delivery of
 * the same refund webhook updates harmlessly; a different refund_id for
 * an already-refunded order is rejected by the WHERE clause (guards
 * against partial-then-full refund races overwriting the first record).
 * v1 only tracks the refund — seva_balance is NOT auto-debited; refunds
 * are handled manually until Phase 6+.
 */
export async function markPaymentRefunded(
  orderId: string,
  refundId: string,
): Promise<boolean> {
  try {
    const client = getClient();
    if (!client) return false;
    // Razorpay refund IDs are always "rfnd_" + alphanumeric. Reject anything
    // else before interpolating into the PostgREST DSL filter string.
    if (!/^rfnd_[A-Za-z0-9]+$/.test(refundId)) {
      console.error("[supabase] markPaymentRefunded: invalid refundId format:", refundId);
      return false;
    }
    const { error } = await client
      .from("payments")
      .update({
        refunded_at: new Date().toISOString(),
        razorpay_refund_id: refundId,
      })
      .eq("razorpay_order_id", orderId)
      .or(`razorpay_refund_id.is.null,razorpay_refund_id.eq.${refundId}`);
    if (error) {
      console.error("[supabase] markPaymentRefunded error:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[supabase] markPaymentRefunded threw:", e);
    return false;
  }
}

/**
 * Atomic increment of seva_balance via stored procedure. Returns the new
 * balance, or null if no row was updated (unknown user) or on error.
 * Required for the verify path to handle concurrent purchases by the same
 * user without losing credits.
 */
export async function creditSevaBalance(
  userId: string,
  count: number,
): Promise<number | null> {
  try {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client.rpc("credit_seva_balance", {
      p_user_id: userId,
      p_amount: count,
    });
    if (error) {
      console.error("[supabase] creditSevaBalance error:", error);
      return null;
    }
    return typeof data === "number" ? data : null;
  } catch (e) {
    console.error("[supabase] creditSevaBalance threw:", e);
    return null;
  }
}

/**
 * Atomic decrement of seva_balance via stored procedure. Returns the new
 * balance, or null if balance was already zero or on error. The SQL guards
 * against going negative; null here means "did not decrement, do not allow."
 */
export async function decrementSevaBalance(
  userId: string,
): Promise<number | null> {
  try {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client.rpc("decrement_seva_balance", {
      p_user_id: userId,
    });
    if (error) {
      console.error("[supabase] decrementSevaBalance error:", error);
      return null;
    }
    return typeof data === "number" ? data : null;
  } catch (e) {
    console.error("[supabase] decrementSevaBalance threw:", e);
    return null;
  }
}

export async function fetchMemory(
  userId: string,
): Promise<UserMemory | null> {
  try {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client
      .from("users_memory")
      .select(
        "main_problem, emotion, context_summary, last_active_at, message_count, seva_balance, is_first_time, verses_referenced, user_name, growing_edge, training_opt_out",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[supabase] fetchMemory error:", error);
      return null;
    }
    if (!data) return null;
    // Pre-migration environments may not have the training_opt_out column
    // yet — graceful default to false so the chat route's opt-out gate
    // continues to log normally until the ALTER TABLE is applied.
    const normalized: UserMemory = {
      ...data,
      training_opt_out: data.training_opt_out === true,
    };
    if (isBannedName(normalized.user_name)) {
      return { ...normalized, user_name: null };
    }
    return normalized;
  } catch (e) {
    console.error("[supabase] fetchMemory threw:", e);
    return null;
  }
}

/**
 * Returns true if a webhook_events row already exists for `eventId`.
 * The Razorpay webhook handler short-circuits on duplicate delivery —
 * x-razorpay-event-id is unique per event and reused on retries.
 */
export async function hasProcessedEvent(eventId: string): Promise<boolean> {
  try {
    const client = getClient();
    if (!client) return false;
    const { data, error } = await client
      .from("webhook_events")
      .select("event_id")
      .eq("event_id", eventId)
      .maybeSingle();
    if (error) {
      console.error("[supabase] hasProcessedEvent error:", error);
      return false;
    }
    return data !== null;
  } catch (e) {
    console.error("[supabase] hasProcessedEvent threw:", e);
    return false;
  }
}

/**
 * Records a webhook event via INSERT ... ON CONFLICT DO NOTHING (supabase-js
 * upsert with ignoreDuplicates). Returns true if the row was inserted (new
 * event), false if it was a duplicate or on error. Combined with
 * hasProcessedEvent at the top of the handler this is belt-and-braces
 * idempotency against concurrent retries.
 */
export async function recordEvent(
  eventId: string,
  eventType: string,
  payload: unknown,
): Promise<boolean> {
  try {
    const client = getClient();
    if (!client) return false;
    const { data, error } = await client
      .from("webhook_events")
      .upsert(
        {
          event_id: eventId,
          event_type: eventType,
          payload,
        },
        { onConflict: "event_id", ignoreDuplicates: true },
      )
      .select("event_id");
    if (error) {
      console.error("[supabase] recordEvent error:", error);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (e) {
    console.error("[supabase] recordEvent threw:", e);
    return false;
  }
}

/**
 * Phase 7.0 — audit row for safety-classifier-flagged turns. No-ops on
 * `flag === 'safe'` so route.ts can call unconditionally. Silent-fail on
 * insert error per ops invariant; chat must keep working even if the
 * table is missing or RLS misconfigured.
 */
export async function logSafetyEvent(params: {
  userId: string;
  messageText: string;
  flag: string;
  confidence?: number;
  replyText?: string;
  versesReferenced?: string[];
}): Promise<void> {
  if (params.flag === "safe") return;
  try {
    const client = getClient();
    if (!client) return;
    const { error } = await client.from("safety_events").insert({
      user_id: params.userId,
      message_text: params.messageText,
      flag: params.flag,
      confidence: params.confidence ?? null,
      reply_text: params.replyText ?? null,
      verses_referenced: params.versesReferenced ?? [],
    });
    if (error) {
      console.error("[supabase] logSafetyEvent error:", error);
    }
  } catch (e) {
    console.error("[supabase] logSafetyEvent threw:", e);
  }
}

/**
 * Phase 7.0 — full conversation log for beta visibility. Written from
 * persistTurnState for every turn that produces a Krishna reply (paywall
 * replies are NOT logged — they short-circuit before persistTurnState).
 * Silent-fail per ops invariant.
 */
export async function logChatTurn(params: {
  userId: string;
  userMessage: string;
  replyText: string;
  language?: string;
  versesReferenced?: string[];
  safetyFlag?: string;
  messageCountAfter?: number;
  // 'chat' (default) or 'voice' — tags which surface produced the turn so the
  // two can be told apart in storage / shown separately. The chat route omits
  // it (→ 'chat'); the voice route passes 'voice'. Requires the chat_logs.source
  // column (manual SQL — run BEFORE deploying this change; see deploy runbook).
  source?: string;
}): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;
    const { data, error } = await client
      .from("chat_logs")
      .insert({
        user_id: params.userId,
        user_message: params.userMessage,
        reply_text: params.replyText,
        language: params.language ?? null,
        verses_referenced: params.versesReferenced ?? [],
        safety_flag: params.safetyFlag ?? null,
        message_count_after: params.messageCountAfter ?? null,
        source: params.source ?? "chat",
      })
      .select("id")
      .single();
    if (error) {
      console.error("[supabase] logChatTurn error:", error);
      return;
    }
    // Phase 8.x memory layer #4 — embed the turn for semantic retrieval
    // (src/lib/chatMemory.ts). A SEPARATE best-effort UPDATE after the insert,
    // never part of it: if the chat_logs.embedding column hasn't been added
    // yet (manual SQL pending) or Gemini hiccups, the log row itself is
    // already safely written. Runs post-stream inside waitUntil — zero user
    // latency.
    try {
      const embedding = await embedChatTurn(params.userMessage, params.replyText);
      if (embedding && data?.id) {
        const { error: embErr } = await client
          .from("chat_logs")
          .update({ embedding })
          .eq("id", data.id);
        if (embErr) {
          console.warn(
            "[supabase] chat_logs embedding update failed (column missing? run the chat-memory SQL):",
            embErr.message,
          );
        }
      }
    } catch (e) {
      console.warn("[supabase] chat_logs embedding step threw:", e);
    }
  } catch (e) {
    console.error("[supabase] logChatTurn threw:", e);
  }
}

/**
 * Phase 7.0 Recommendation C — read the resolved conversation language
 * from the most recent chat_logs row for a user, used as a deterministic
 * priorLang signal in route.ts (replacing the unreliable Haiku-summary
 * derivation that 0b2cce7 tried to fix via prompt instruction).
 *
 * Returns undefined if the user has no chat_logs rows yet (new user, or
 * pre-854772c user whose chats predate the table). Caller should fall
 * back to the existing context_summary-based derivation in that case.
 */
export async function fetchLastChatLanguage(
  userId: string,
): Promise<"hi" | "en" | undefined> {
  try {
    const client = getClient();
    if (!client) return undefined;
    const { data, error } = await client
      .from("chat_logs")
      .select("language")
      .eq("user_id", userId)
      .order("turn_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[supabase] fetchLastChatLanguage error:", error);
      return undefined;
    }
    if (!data || !data.language) return undefined;
    const lang = data.language;
    return lang === "hi" || lang === "en" ? lang : undefined;
  } catch (e) {
    console.error("[supabase] fetchLastChatLanguage threw:", e);
    return undefined;
  }
}

/**
 * Phase 7.0 — within-session context restoration. Sonnet sees the
 * verbatim recent dialogue alongside the rolling context_summary so
 * short replies like "Project" or "han" land as answers to turn N-1
 * rather than as topic switches. Returns chronological order
 * (oldest first); the in-flight turn is excluded because chat_logs
 * is written via fire-and-forget after the response. Silent-fail.
 */
export async function fetchRecentChatHistory(
  userId: string,
  limit: number = 8,
): Promise<Array<{ user_message: string; reply_text: string }>> {
  try {
    const client = getClient();
    if (!client) return [];
    const { data, error } = await client
      .from("chat_logs")
      .select("user_message, reply_text")
      .eq("user_id", userId)
      .order("turn_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[supabase] fetchRecentChatHistory error:", error);
      return [];
    }
    if (!data) return [];
    return [...data].reverse();
  } catch (e) {
    console.error("[supabase] fetchRecentChatHistory threw:", e);
    return [];
  }
}

/**
 * Phase 8 pre-launch — update a user's settings row. Currently supports
 * only `training_opt_out`; future settings can be added without breaking
 * callers. Writes through the service-role client. Silent-fails per ops
 * invariant; the /settings UI shows the toast independently.
 */
export async function updateUserSettings(
  userId: string,
  settings: { training_opt_out?: boolean },
): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;
    const payload: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };
    if (settings.training_opt_out !== undefined) {
      payload.training_opt_out = settings.training_opt_out;
    }
    const { error } = await client
      .from("users_memory")
      .upsert(payload, { onConflict: "user_id" });
    if (error) {
      console.error("[supabase] updateUserSettings error:", error);
    }
  } catch (e) {
    console.error("[supabase] updateUserSettings threw:", e);
  }
}

/**
 * Phase 8 pre-launch — DPDP-compliant data deletion for a user. Removes
 * chat_logs + safety_events + users_memory rows for the user.
 *
 * Intentionally NOT deleted:
 *   - payments: retained per Indian financial law (Income Tax Act + RBI
 *     reconciliation requirements, typically 7+ years).
 *   - webhook_events: payment-audit + idempotency table, no user-facing
 *     impact; deletion would break Razorpay refund reconciliation.
 *
 * Each table delete is independent — a failure on one doesn't roll back
 * the others. Silent-fail per ops invariant; the /api/delete-account
 * route logs the outcome but always tries to clear the cookie regardless.
 */
export async function deleteUserData(userId: string): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;
    const { error: chatErr } = await client
      .from("chat_logs")
      .delete()
      .eq("user_id", userId);
    if (chatErr) {
      console.error("[supabase] deleteUserData chat_logs error:", chatErr);
    }
    const { error: safetyErr } = await client
      .from("safety_events")
      .delete()
      .eq("user_id", userId);
    if (safetyErr) {
      console.error(
        "[supabase] deleteUserData safety_events error:",
        safetyErr,
      );
    }
    const { error: memErr } = await client
      .from("users_memory")
      .delete()
      .eq("user_id", userId);
    if (memErr) {
      console.error("[supabase] deleteUserData users_memory error:", memErr);
    }
  } catch (e) {
    console.error("[supabase] deleteUserData threw:", e);
  }
}

/**
 * Phase 8.x — store a user-submitted feedback message (Settings →
 * "Share Feedback"). Founder reads these from the Supabase dashboard;
 * no email-forwarding yet (deferred to Phase 8.x.3).
 *
 * FK safety — two real edge cases the `user_feedback.user_id REFERENCES
 * users_memory(user_id)` constraint creates, both handled here so a
 * valid feedback submission is NEVER lost:
 *
 *   1. Dangling cookie. `god_messenger_uid` is set by /api/chat, but the
 *      users_memory row is only created on the first completed chat turn
 *      / settings write. A user who got the cookie but never finished a
 *      turn has no users_memory row — inserting feedback.user_id for
 *      them would violate the FK. We probe users_memory first and null
 *      the user_id out if the row is absent (feedback still saved, just
 *      unattributed — strictly better than erroring on real feedback).
 *   2. Probe failure. If the existence SELECT itself errors (network),
 *      we conservatively null the user_id rather than risk an FK reject.
 *
 * Unlike the chat-persistence helpers this does NOT silent-fail-as-
 * success: it returns { ok } so /api/feedback can surface a real error
 * to the user (a feedback form must confirm receipt honestly). The
 * schema's `ON DELETE SET NULL` (see final report SQL) keeps the
 * existing /api/delete-account → deleteUserData flow working — a plain
 * FK would make the users_memory delete fail once a user has feedback
 * rows, silently breaking DPDP erasure.
 */
export async function insertFeedback(params: {
  userId: string | null;
  message: string;
  userName: string | null;
  // Phase 11.x — optional 1–5 star rating (the /demo feedback card sends
  // it; the Settings "Share feedback" form leaves it null). Column is a
  // nullable smallint with a 1..5 CHECK; null is the legitimate
  // text-only-feedback case.
  rating: number | null;
}): Promise<{ ok: boolean }> {
  try {
    const client = getClient();
    if (!client) return { ok: false };

    let userId = params.userId;
    if (userId) {
      const { data, error } = await client
        .from("users_memory")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        // Don't know if the row exists — degrade to unattributed rather
        // than risk an FK rejection on otherwise-valid feedback.
        console.error(
          "[supabase] insertFeedback users_memory probe error:",
          error,
        );
        userId = null;
      } else if (!data) {
        userId = null;
      }
    }

    const { error } = await client.from("user_feedback").insert({
      user_id: userId,
      message: params.message,
      user_name: params.userName,
      rating: params.rating,
    });
    if (error) {
      console.error("[supabase] insertFeedback error:", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.error("[supabase] insertFeedback threw:", e);
    return { ok: false };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 9 — Subscriptions data layer.
//
// Lifecycle: /api/subscriptions/create inserts a row at status 'created', then
// Razorpay webhooks drive it through authenticated → active → (charged resets
// the cycle) → cancelled/halted/completed. Reads are by user_id (gating, the
// Settings panel) or by razorpay_subscription_id (webhooks). All silent-fail
// per the ops invariant EXCEPT insertSubscription, which returns a boolean so
// the create route can refuse to hand back a checkout it couldn't record.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Insert a subscription row when the Razorpay subscription is first created
 * (status 'created'). Entitlements are snapshotted here. messages_used /
 * voice_seconds_used / cancel_at_period_end take their schema defaults (0 / 0 /
 * false). Returns false on error so the route doesn't return a checkout it
 * failed to persist (which would later orphan the webhook).
 */
export async function insertSubscription(sub: {
  user_id: string;
  razorpay_subscription_id: string;
  razorpay_customer_id?: string | null;
  plan_key: string;
  currency: string;
  billing_period: string;
  status: SubscriptionStatus;
  message_pool: number;
  voice_minutes_pool: number;
  amount: number;
}): Promise<boolean> {
  try {
    const client = getClient();
    if (!client) return false;
    const { error } = await client.from("subscriptions").insert(sub);
    if (error) {
      console.error("[supabase] insertSubscription error:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[supabase] insertSubscription threw:", e);
    return false;
  }
}

/**
 * The user's currently-active subscription, or null. The partial unique index
 * (status = 'active') guarantees at most one. Used by chat gating, voice
 * metering, and the Settings panel. A subscription scheduled to cancel at
 * period end is still 'active' until then — entitlements continue, as intended.
 */
export async function fetchActiveSubscription(
  userId: string,
): Promise<SubscriptionRow | null> {
  try {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (error) {
      console.error("[supabase] fetchActiveSubscription error:", error);
      return null;
    }
    return (data as SubscriptionRow | null) ?? null;
  } catch (e) {
    console.error("[supabase] fetchActiveSubscription threw:", e);
    return null;
  }
}

/**
 * Look up a subscription by its Razorpay id. Used by the webhook handler to
 * resolve the row a subscription.* event refers to.
 */
export async function fetchSubscriptionByRazorpayId(
  razorpaySubscriptionId: string,
): Promise<SubscriptionRow | null> {
  try {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client
      .from("subscriptions")
      .select("*")
      .eq("razorpay_subscription_id", razorpaySubscriptionId)
      .maybeSingle();
    if (error) {
      console.error("[supabase] fetchSubscriptionByRazorpayId error:", error);
      return null;
    }
    return (data as SubscriptionRow | null) ?? null;
  } catch (e) {
    console.error("[supabase] fetchSubscriptionByRazorpayId threw:", e);
    return null;
  }
}

/**
 * Update a subscription's lifecycle fields by Razorpay id. Only the provided
 * fields are written (always bumps updated_at). Webhook-driven; absolute SETs
 * (no read-modify-write), so no atomicity concern.
 *
 * Edge case — activating a second subscription while one is already active
 * violates the partial unique index. v1 blocks that at the create route (one
 * active sub per user); if it still happens, the UPDATE to 'active' errors here
 * and we log it rather than corrupting the first active row. Returns false on
 * error so the webhook can decide whether to 200 (idempotent ack) anyway.
 */
export async function updateSubscriptionStatus(
  razorpaySubscriptionId: string,
  fields: {
    status?: SubscriptionStatus;
    razorpay_customer_id?: string | null;
    current_period_start?: string | null;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean;
    cancelled_at?: string | null;
  },
): Promise<boolean> {
  try {
    const client = getClient();
    if (!client) return false;
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (fields.status !== undefined) payload.status = fields.status;
    if (fields.razorpay_customer_id !== undefined) {
      payload.razorpay_customer_id = fields.razorpay_customer_id;
    }
    if (fields.current_period_start !== undefined) {
      payload.current_period_start = fields.current_period_start;
    }
    if (fields.current_period_end !== undefined) {
      payload.current_period_end = fields.current_period_end;
    }
    if (fields.cancel_at_period_end !== undefined) {
      payload.cancel_at_period_end = fields.cancel_at_period_end;
    }
    if (fields.cancelled_at !== undefined) {
      payload.cancelled_at = fields.cancelled_at;
    }
    const { error } = await client
      .from("subscriptions")
      .update(payload)
      .eq("razorpay_subscription_id", razorpaySubscriptionId);
    if (error) {
      console.error("[supabase] updateSubscriptionStatus error:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[supabase] updateSubscriptionStatus threw:", e);
    return false;
  }
}

/**
 * On subscription.charged (each renewal): reset per-cycle usage to zero and
 * roll the billing window forward. Also re-asserts status='active' so a sub
 * that recovered from 'halted' via a successful retry charge is usable again.
 */
export async function resetSubscriptionCycleUsage(
  razorpaySubscriptionId: string,
  period: { current_period_start?: string | null; current_period_end?: string | null },
): Promise<boolean> {
  try {
    const client = getClient();
    if (!client) return false;
    const { error } = await client
      .from("subscriptions")
      .update({
        messages_used: 0,
        voice_seconds_used: 0,
        status: "active",
        current_period_start: period.current_period_start ?? null,
        current_period_end: period.current_period_end ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("razorpay_subscription_id", razorpaySubscriptionId);
    if (error) {
      console.error("[supabase] resetSubscriptionCycleUsage error:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[supabase] resetSubscriptionCycleUsage threw:", e);
    return false;
  }
}

/**
 * Atomically consume one message from the user's active subscription pool.
 * Returns the new messages_used, or null if there is no active subscription OR
 * the pool is already exhausted (messages_used >= message_pool). The WHERE
 * guard in the SQL function makes this race-safe (mirrors decrement_seva_balance).
 * Requires the increment_subscription_messages SQL function — see
 * docs/subscriptions-rpcs.sql (manual paste).
 */
export async function incrementSubscriptionMessagesUsed(
  userId: string,
): Promise<number | null> {
  try {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client.rpc("increment_subscription_messages", {
      p_user_id: userId,
    });
    if (error) {
      console.error("[supabase] incrementSubscriptionMessagesUsed error:", error);
      return null;
    }
    return typeof data === "number" ? data : null;
  } catch (e) {
    console.error("[supabase] incrementSubscriptionMessagesUsed threw:", e);
    return null;
  }
}

export interface VoiceConsumeResult {
  from_pool: number;
  from_wallet: number;
  shortfall: number;
}

/**
 * Meter a finished voice session: debit the active subscription's voice pool
 * first, then the one-time wallet (users_memory.voice_seconds_balance). Returns
 * the breakdown, or null on error. Row-locked + floored in SQL — see
 * consume_voice_seconds in docs/subscriptions-rpcs.sql (manual paste). Silent-
 * fail per ops invariant: a metering miss must never block the voice flow.
 */
export async function consumeVoiceSeconds(
  userId: string,
  seconds: number,
): Promise<VoiceConsumeResult | null> {
  try {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client.rpc("consume_voice_seconds", {
      p_user_id: userId,
      p_seconds: Math.round(seconds),
    });
    if (error) {
      console.error("[supabase] consumeVoiceSeconds error:", error);
      return null;
    }
    return (data as VoiceConsumeResult | null) ?? null;
  } catch (e) {
    console.error("[supabase] consumeVoiceSeconds threw:", e);
    return null;
  }
}

/**
 * Atomic credit of purchased wallet minutes (as seconds) to a user's one-time
 * voice balance. Returns the new balance, or null on error. Handles a voice-
 * first buyer with no users_memory row yet (the RPC upserts). Mirrors
 * creditSevaBalance; see credit_voice_seconds in docs/subscriptions-rpcs.sql.
 */
export async function creditVoiceSeconds(
  userId: string,
  seconds: number,
): Promise<number | null> {
  try {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client.rpc("credit_voice_seconds", {
      p_user_id: userId,
      p_seconds: Math.round(seconds),
    });
    if (error) {
      console.error("[supabase] creditVoiceSeconds error:", error);
      return null;
    }
    return typeof data === "number" ? data : null;
  } catch (e) {
    console.error("[supabase] creditVoiceSeconds threw:", e);
    return null;
  }
}

/**
 * Read the voice-minute wallet balance (seconds) for a user, or 0. Used by the
 * voice-access gate. Defensive: a missing voice_seconds_balance column (pre-
 * migration env) returns 0 rather than throwing.
 */
export async function fetchVoiceSecondsBalance(userId: string): Promise<number> {
  try {
    const client = getClient();
    if (!client) return 0;
    const { data, error } = await client
      .from("users_memory")
      .select("voice_seconds_balance")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[supabase] fetchVoiceSecondsBalance error:", error);
      return 0;
    }
    const bal = (data as { voice_seconds_balance?: number } | null)
      ?.voice_seconds_balance;
    return typeof bal === "number" && bal > 0 ? bal : 0;
  } catch (e) {
    console.error("[supabase] fetchVoiceSecondsBalance threw:", e);
    return 0;
  }
}
