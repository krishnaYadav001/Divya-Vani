import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { fireMetaEvent } from "@/lib/metaEvents";
import { fireGoogleAdsConversion } from "@/lib/googleAdsEvents";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rateLimit";

const USER_COOKIE = "god_messenger_uid";

export async function POST(req: Request) {
  let body: { email?: unknown; phone?: unknown; primaryFocus?: unknown; resonantText?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
  const phone =
    typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;
  const primaryFocus =
    typeof body.primaryFocus === "string" ? body.primaryFocus : null;
  const resonantText =
    typeof body.resonantText === "string" ? body.resonantText : null;

  if (!email || !primaryFocus || !resonantText) {
    return NextResponse.json(
      { error: "email, primaryFocus and resonantText are required" },
      { status: 400 },
    );
  }

  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value ?? null;
  const gclid = jar.get("dv_gclid")?.value ?? null;

  // Shared rate limit (Upstash) — lead capture fires conversion events + writes
  // a DB row, so bound spam by cookie user-id (if any) + client IP. Fail-open
  // on Redis unavailability. Placed after validation so a malformed body still
  // 400s without consuming a token.
  {
    const rl = await checkRateLimit("lead", userId, clientIpFromRequest(req));
    if (!rl.ok) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }
  }

  const headersList = await headers();
  const clientIp =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  const clientUserAgent = headersList.get("user-agent") ?? undefined;

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error: dbErr } = await supabase.from("journey_leads").insert({
    email,
    phone,
    primary_focus: primaryFocus,
    resonant_text: resonantText,
    user_id: userId,
  });
  if (dbErr) console.error("[journey/capture-lead] db:", dbErr.message);

  // Fire conversion events non-blocking
  const userData = { email, phone: phone ?? undefined, clientIp, clientUserAgent };
  const customData = {
    content_name: "journey_lead",
    primary_focus: primaryFocus,
    resonant_text: resonantText,
  };
  void fireMetaEvent("Lead", userData, customData, "https://divyavani.co.in/journey");
  void fireGoogleAdsConversion({
    conversionActionId: process.env.GOOGLE_ADS_CONVERSION_LEAD_ID,
    gclid,
    email,
  });

  return NextResponse.json({ ok: true });
}
