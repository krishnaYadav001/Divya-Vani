import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { fireMetaEvent } from "@/lib/metaEvents";

const USER_COOKIE = "god_messenger_uid";

export async function POST() {
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value ?? null;

  const headersList = await headers();
  const clientIp =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  const clientUserAgent = headersList.get("user-agent") ?? undefined;

  // Best-effort email lookup — improves Meta match rate for users
  // who completed the journey quiz before hitting the paywall.
  let email: string | undefined;
  if (userId) {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data } = await supabase
      .from("journey_leads")
      .select("email")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    email = data?.email ?? undefined;
  }

  void fireMetaEvent(
    "InitiateCheckout",
    { email, clientIp, clientUserAgent },
    {},
    "https://divyavani.co.in/chat",
  );

  return NextResponse.json({ ok: true });
}
