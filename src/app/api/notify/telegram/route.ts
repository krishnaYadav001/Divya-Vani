import { NextResponse } from "next/server";
import {
  escapeTelegramHtml,
  formatTelegramDateTime,
  sendTelegramMessage,
} from "@/lib/telegramNotify";

// Supabase database webhook receiver — fires on INSERT into user_feedback
// and users_memory. Sends a Telegram message to the founder's chat.
// Supabase webhook → POST /api/notify/telegram with x-notify-secret header.

interface SupabaseWebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown> | null;
}

function formatFeedback(record: Record<string, unknown>): string {
  const name = record.user_name
    ? escapeTelegramHtml(String(record.user_name))
    : "Anonymous";
  const rating = record.rating != null ? `⭐ ${record.rating}/5` : null;
  const message = record.message
    ? escapeTelegramHtml(String(record.message).trim())
    : "";
  const time = record.created_at
    ? formatTelegramDateTime(String(record.created_at))
    : "";

  const lines = ["📬 <b>New Feedback</b>"];
  lines.push(`👤 ${name}`);
  if (rating) lines.push(rating);
  if (message) lines.push(`💬 ${message}`);
  if (time) lines.push(`🕐 ${time} IST`);
  return lines.join("\n");
}

function formatNewUser(record: Record<string, unknown>): string {
  const name = record.user_name
    ? escapeTelegramHtml(String(record.user_name))
    : null;
  const userId = record.user_id
    ? escapeTelegramHtml(String(record.user_id).slice(0, 8))
    : null;
  const time = record.updated_at ?? record.last_active_at;
  const timeStr = time ? formatTelegramDateTime(String(time)) : "";

  const lines = ["🌸 <b>New User</b>"];
  if (name) lines.push(`👤 ${name}`);
  if (userId) lines.push(`ID: ${userId}`);
  if (timeStr) lines.push(`🕐 ${timeStr} IST`);
  return lines.join("\n");
}

export async function POST(req: Request) {
  try {
    const secret = process.env.NOTIFY_SECRET;
    if (secret) {
      const incoming = req.headers.get("x-notify-secret");
      if (incoming !== secret) {
        console.error("[notify/telegram] invalid or missing x-notify-secret");
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    let payload: SupabaseWebhookPayload;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const { type, table, record } = payload;

    if (type !== "INSERT") {
      // Only care about new rows; silently ack other event types.
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    let message: string | null = null;

    if (table === "user_feedback") {
      message = formatFeedback(record);
    } else if (table === "users_memory") {
      // Suppress noise: only notify on the very first message (message_count = 0 or 1)
      // so returning-user row touches don't fire. Supabase fires INSERT once per user.
      message = formatNewUser(record);
    }

    if (message) {
      const sent = await sendTelegramMessage(message);
      if (!sent) {
        return NextResponse.json(
          { error: "telegram_send_failed" },
          { status: 502 },
        );
      }
      console.log(`[notify/telegram] sent notification for ${table} INSERT`);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("[notify/telegram] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
