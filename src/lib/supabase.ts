import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
      payload.user_name = fields.user_name ?? null;
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
        "main_problem, emotion, context_summary, last_active_at, message_count, seva_balance, is_first_time, verses_referenced, user_name",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[supabase] fetchMemory error:", error);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.error("[supabase] fetchMemory threw:", e);
    return null;
  }
}
