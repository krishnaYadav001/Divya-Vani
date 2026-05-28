import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchMemory } from "@/lib/supabase";

const USER_COOKIE = "god_messenger_uid";

// Phase 9 — read the caller's remaining seva balance (purchased messages, on
// users_memory.seva_balance). Used by the seva-hub Seva tab so the user always
// sees how many messages they have left, before and after a top-up.
export async function GET() {
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value;
  if (!userId) {
    return NextResponse.json({ seva_balance: 0 });
  }
  const memory = await fetchMemory(userId);
  return NextResponse.json({ seva_balance: memory?.seva_balance ?? 0 });
}
