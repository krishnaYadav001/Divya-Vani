import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { SUPPORT_SYSTEM_PROMPT } from "@/lib/supportKnowledge";

const client = new Anthropic();

type SupportMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message: string = (body.message ?? "").trim();
    const history: SupportMessage[] = Array.isArray(body.history)
      ? (body.history as SupportMessage[]).slice(-10)
      : [];

    if (!message) {
      return NextResponse.json({ error: "empty" }, { status: 400 });
    }

    const messages: SupportMessage[] = [
      ...history,
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
