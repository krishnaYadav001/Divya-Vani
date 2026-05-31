// Retention loop processor.
//
// Called by Vercel Cron (add to vercel.json):
//   { "crons": [{ "path": "/api/retention/check", "schedule": "*/10 * * * *" }] }
//
// Protected by RETENTION_CRON_SECRET env var (add the same value to Vercel env +
// Vercel Cron authorization header). If the env var is unset, the route is open
// (acceptable during dev; set the secret before going live).
//
// The pg_cron job (SQL given separately) queues leads by setting
// retention_email_queued_at. This endpoint reads the queue, sends via Loops.so,
// and marks retention_email_sent_at on success.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendRetentionEmail } from "@/lib/loopsEmail";

export async function POST(req: Request) {
  const secret = process.env.RETENTION_CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: leads, error } = await supabase
    .from("journey_leads")
    .select("id, email, primary_focus, resonant_text")
    .not("retention_email_queued_at", "is", null)
    .is("retention_email_sent_at", null)
    .limit(50);

  if (error) {
    console.error("[retention/check] db error:", error.message);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
  if (!leads || leads.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0 });
  }

  let sent = 0;
  for (const lead of leads) {
    if (!lead.email) continue;
    const ok = await sendRetentionEmail({
      email: lead.email,
      primaryFocus: lead.primary_focus ?? "peace",
      resonantText: lead.resonant_text ?? "gita",
    });
    if (ok) {
      await supabase
        .from("journey_leads")
        .update({ retention_email_sent_at: new Date().toISOString() })
        .eq("id", lead.id);
      sent++;
    }
  }

  console.log(`[retention/check] processed=${leads.length} sent=${sent}`);
  return NextResponse.json({ processed: leads.length, sent });
}
