"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { fireMetaEvent } from "@/lib/metaEvents";
import { fireGoogleAdsConversion } from "@/lib/googleAdsEvents";

const USER_COOKIE = "god_messenger_uid";
const GCLID_COOKIE = "dv_gclid";

export async function captureJourneyLead({
  email,
  quizPayload,
  eventId,
}: {
  email: string;
  quizPayload: { q1: string; q2: string };
  eventId: string;
}): Promise<{ ok: boolean }> {
  const jar = await cookies();
  const userId = jar.get(USER_COOKIE)?.value ?? null;
  const gclid = jar.get(GCLID_COOKIE)?.value ?? null;

  const headersList = await headers();
  const clientIp =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  const clientUserAgent = headersList.get("user-agent") ?? undefined;

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error: dbErr } = await supabase.from("journey_leads").insert({
    email: email.trim().toLowerCase(),
    user_id: userId,
    primary_focus: quizPayload.q1,
    resonant_text: quizPayload.q2,
    quiz_payload: quizPayload,
    status: "lead_captured",
  });
  if (dbErr) console.error("[journey/capture-lead] db:", dbErr.message);

  void fireMetaEvent(
    "Lead",
    { email, clientIp, clientUserAgent },
    { content_name: "journey_lead", primary_focus: quizPayload.q1 },
    "https://divyavani.co.in/journey",
    eventId,
  );

  void fireGoogleAdsConversion({
    conversionActionId: process.env.GOOGLE_ADS_LEAD_CONVERSION_ACTION_ID,
    gclid,
    email,
  });

  return { ok: true };
}
