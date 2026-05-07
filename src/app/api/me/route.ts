import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchMemory } from "@/lib/supabase";

const USER_COOKIE = "god_messenger_uid";
const FREE_MESSAGE_LIMIT = 10;

export async function GET() {
  try {
    const jar = await cookies();
    const userId = jar.get(USER_COOKIE)?.value;

    if (!userId) {
      // Fresh visitor — let the UI initialize cleanly without a 401 dance.
      // user_id is null until the cookie is set on the first /api/chat hit.
      return NextResponse.json(
        {
          user_id: null,
          message_count: 0,
          seva_balance: 0,
          free_limit: FREE_MESSAGE_LIMIT,
        },
        { status: 200 },
      );
    }

    const memory = await fetchMemory(userId);
    // Phase 6.8 — surface user_id so the client can scope localStorage
    // chat-history persistence to the cookie identity. Cookie itself
    // remains HttpOnly; this exposes only the value the browser already
    // implicitly carries.
    return NextResponse.json(
      {
        user_id: userId,
        message_count: memory?.message_count ?? 0,
        seva_balance: memory?.seva_balance ?? 0,
        free_limit: FREE_MESSAGE_LIMIT,
      },
      { status: 200 },
    );
  } catch (e) {
    console.error("[me] error:", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
