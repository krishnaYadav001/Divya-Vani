import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const USER_COOKIE = "god_messenger_uid";

export async function POST(req: Request) {
  let body: { email?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : null;

  if (!email || !email.includes("@") || !email.includes(".")) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }

  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value ?? null;

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // upsert: if user was previously unsubscribed, re-activates them
  const { error } = await supabase.from("morning_quote_subscribers").upsert(
    {
      email,
      name,
      user_id: userId,
      unsubscribed_at: null,
    },
    { onConflict: "email" },
  );

  if (error) {
    console.error("[morning-quote/subscribe] db:", error.message);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  console.log(`[morning-quote/subscribe] subscribed: ${email}`);
  return NextResponse.json({ ok: true });
}
