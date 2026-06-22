import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  grantFreeVoiceTrial,
  recordVisit,
  type VisitRecordResult,
} from "@/lib/supabase";
import {
  escapeTelegramHtml,
  formatTelegramDateTime,
  sendTelegramMessage,
} from "@/lib/telegramNotify";

const USER_COOKIE = "god_messenger_uid";
const VISIT_DAY_COOKIE = "god_messenger_visit_day";

function istDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
}

function wasActiveBeforeToday(value: string | null, today: string): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return istDateKey(date) !== today;
}

function formatReturningVisit(result: VisitRecordResult): string {
  const lines = ["<b>Returning Visitor</b>"];
  if (result.userName) {
    lines.push(`Name: ${escapeTelegramHtml(result.userName)}`);
  }
  lines.push(`ID: ${escapeTelegramHtml(result.userId.slice(0, 8))}`);
  if (typeof result.messageCount === "number") {
    lines.push(`Messages: ${result.messageCount}`);
  }
  lines.push(`Visited: ${formatTelegramDateTime(new Date())} IST`);
  if (result.previousLastActiveAt) {
    lines.push(
      `Previous: ${formatTelegramDateTime(result.previousLastActiveAt)} IST`,
    );
  }
  return lines.join("\n");
}

async function notifyReturningVisit(
  result: VisitRecordResult,
  alreadySeenToday: boolean,
  today: string,
): Promise<void> {
  if (result.status !== "touched") return;
  if (alreadySeenToday) return;
  if (!wasActiveBeforeToday(result.previousLastActiveAt, today)) return;

  const sent = await sendTelegramMessage(formatReturningVisit(result));
  if (!sent) {
    console.error("[visits] returning visitor Telegram notification failed");
  }
}

function withCookie(
  res: NextResponse,
  isNewCookie: boolean,
  userId: string,
  today: string,
  setVisitDay = true,
): NextResponse {
  if (isNewCookie) {
    res.cookies.set(USER_COOKIE, userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  if (setVisitDay) {
    res.cookies.set(VISIT_DAY_COOKIE, today, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 48,
    });
  }
  return res;
}

export async function POST() {
  try {
    const jar = await cookies();
    let userId = jar.get(USER_COOKIE)?.value;
    const today = istDateKey(new Date());
    const alreadySeenToday = jar.get(VISIT_DAY_COOKIE)?.value === today;
    const isNewCookie = !userId;
    if (!userId) {
      userId = randomUUID();
    }

    const result = await recordVisit(userId);
    if (result.status === "failed") {
      return withCookie(
        NextResponse.json({ ok: false }, { status: 500 }),
        isNewCookie,
        userId,
        today,
        false,
      );
    }

    await grantFreeVoiceTrial(userId);

    await notifyReturningVisit(result, alreadySeenToday, today);

    return withCookie(
      NextResponse.json({ ok: true, status: result.status }, { status: 200 }),
      isNewCookie,
      userId,
      today,
    );
  } catch (e) {
    console.error("[visits] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
