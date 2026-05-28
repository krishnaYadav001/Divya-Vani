import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchVoiceSecondsBalance } from "@/lib/supabase";

const USER_COOKIE = "god_messenger_uid";

// Phase 9 — read the caller's voice-minute wallet balance (the one-time
// purchased balance, in seconds). Used by the seva-hub Voice-minutes tab so the
// user always sees how many minutes they have, before and after a top-up.
export async function GET() {
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value;
  if (!userId) {
    return NextResponse.json({ voice_seconds: 0 });
  }
  const seconds = await fetchVoiceSecondsBalance(userId);
  return NextResponse.json({ voice_seconds: seconds });
}
