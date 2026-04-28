import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchMemory } from "@/lib/supabase";

const USER_COOKIE = "god_messenger_uid";

/**
 * Tells the frontend whether to show the first-time onboarding cards.
 * - No cookie or no row yet → first time.
 * - Row with is_first_time still true → first time.
 * - Anything else → not first time.
 */
export async function GET() {
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value;
  if (!userId) {
    return NextResponse.json({ isFirstTime: true });
  }
  const memory = await fetchMemory(userId);
  const isFirstTime = memory?.is_first_time !== false;
  return NextResponse.json({ isFirstTime });
}
