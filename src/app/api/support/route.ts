import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SUPPORT_SYSTEM_PROMPT } from "@/lib/supportKnowledge";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rateLimit";

const client = new Anthropic();

const USER_COOKIE = "god_messenger_uid";

type SupportMessage = { role: "user" | "assistant"; content: string };

// Input caps — support is an unauthenticated Haiku-backed endpoint, so bound
// the payload to keep a single request cheap and prevent abuse. User-friendly
// limits: a real support question is far under 2000 chars, and the last 10
// turns of normal Q&A stay well under the total-history budget.
const SUPPORT_MAX_MESSAGE_CHARS = 2000;
const SUPPORT_MAX_HISTORY_CHARS = 12000;

export async function POST(request: Request) {
  try {
    // Shared rate limit (Upstash) — this endpoint is unauthenticated and calls
    // Haiku per request, so bound it by cookie user-id (if any) + client IP.
    // Fail-open on Redis unavailability.
    const supportJar = await cookies();
    const supportUserId = supportJar.get(USER_COOKIE)?.value ?? null;
    const rl = await checkRateLimit(
      "support",
      supportUserId,
      clientIpFromRequest(request),
    );
    if (!rl.ok) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const body = await request.json();
    const message: string = (body.message ?? "").trim();
    const history: SupportMessage[] = Array.isArray(body.history)
      ? (body.history as SupportMessage[]).slice(-10)
      : [];

    if (!message) {
      return NextResponse.json({ error: "empty" }, { status: 400 });
    }
    if (message.length > SUPPORT_MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        { error: "message_too_long" },
        { status: 400 },
      );
    }
    // Bound the replayed history by total character size (the last 10 turns
    // could individually be large). Trim oldest-first until under budget.
    let trimmedHistory = history;
    let historyChars = trimmedHistory.reduce(
      (n, m) => n + (typeof m?.content === "string" ? m.content.length : 0),
      0,
    );
    while (trimmedHistory.length > 0 && historyChars > SUPPORT_MAX_HISTORY_CHARS) {
      const dropped = trimmedHistory[0];
      historyChars -=
        typeof dropped?.content === "string" ? dropped.content.length : 0;
      trimmedHistory = trimmedHistory.slice(1);
    }

    const messages: SupportMessage[] = [
      ...trimmedHistory,
      { role: "user", content: message },
    ];

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: SUPPORT_SYSTEM_PROMPT,
      messages,
    });

    const reply =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
