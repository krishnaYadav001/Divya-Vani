import { NextResponse } from "next/server";

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

async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("[notify/telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing");
    return;
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[notify/telegram] Telegram API error:", res.status, body);
  }
}

function formatFeedback(record: Record<string, unknown>): string {
  const name = record.user_name ? String(record.user_name) : "Anonymous";
  const rating = record.rating != null ? `⭐ ${record.rating}/5` : null;
  const message = record.message ? String(record.message).trim() : "";
  const time = record.created_at
    ? new Date(String(record.created_at)).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

  const lines = ["📬 <b>New Feedback</b>"];
  lines.push(`👤 ${name}`);
  if (rating) lines.push(rating);
  if (message) lines.push(`💬 ${message}`);
  if (time) lines.push(`🕐 ${time} IST`);
  return lines.join("\n");
}

function formatNewUser(record: Record<string, unknown>): string {
  const name = record.user_name ? `${String(record.user_name)}` : null;
  const time = record.updated_at ?? record.last_active_at;
  const timeStr = time
    ? new Date(String(time)).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

  const lines = ["🌸 <b>New User</b>"];
  if (name) lines.push(`👤 ${name}`);
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
      await sendTelegram(message);
      console.log(`[notify/telegram] sent notification for ${table} INSERT`);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("[notify/telegram] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
