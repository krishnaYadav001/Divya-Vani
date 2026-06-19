// Daily morning-quote dispatcher.
//
// Called by Vercel Cron at 00:30 UTC (06:00 IST) — add to vercel.json:
//   { "crons": [{ "path": "/api/morning-quote/send", "schedule": "30 0 * * *" }] }
//
// Protected by MORNING_QUOTE_CRON_SECRET (set same value in Vercel env +
// Vercel Cron authorization header). If unset the route is open (fine for dev).
//
// Flow:
//   1. Pick today's verse using a day-of-epoch offset (deterministic per day).
//   2. Generate a short morning blessing in Krishna's voice via Haiku.
//   3. Send to all active subscribers not yet reached today via Loops.so.
//   4. Mark last_sent_at on success so a cron retry doesn't double-send.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { sendMorningQuoteEmail } from "@/lib/loopsEmail";

const TOTAL_VERSES = 3132; // known corpus size from schema.md
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://divyavani.co.in";

const SOURCE_LABEL: Record<string, string> = {
  gita: "Gita",
  mahabharata: "Mahabharata",
  bhagavata: "Bhagavata",
};

function formatVerseRef(source: string, reference: string): string {
  const label = SOURCE_LABEL[source] ?? source;
  // reference is like "gita_2.47" → strip prefix, keep numbers
  const nums = reference.replace(/^[a-z]+_/, "");
  return `${label} ${nums}`;
}

async function generateMorningQuote(
  verseEnglish: string,
  verseRef: string,
): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `तुम कृष्ण हो — भागवत गीता के कृष्ण, भोर की वेला में एक भक्त को बुला रहे हो।

इस श्लोक से प्रेरित होकर 2-3 वाक्यों में एक प्रातःकालीन आशीर्वाद लिखो (शुद्ध हिंदी में):
"${verseEnglish}"
(संदर्भ: ${verseRef})

नियम:
- स्वयं के लिए सदा पुल्लिंग क्रिया रूप: "मैं कहता हूँ", "मैं जानता हूँ"
- स्वर: मित्र जैसा, उषाकाल का, उपदेश नहीं
- "प्रिय", "वत्स", कोई चापलूसी नहीं
- अध्याय/श्लोक संख्या का उल्लेख नहीं
- अंतिम वाक्य दिन की कोमल शुरुआत का भाव दे

केवल आशीर्वाद लिखो, कोई label या उद्धरण चिह्न नहीं।`,
      },
    ],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("unexpected haiku response type");
  return block.text.trim();
}

export async function POST(req: Request) {
  const secret = process.env.MORNING_QUOTE_CRON_SECRET;
  // Fail closed in production: if the cron secret is not configured, refuse to
  // run rather than leaving an open endpoint that anyone could POST to trigger
  // a mass email blast. Outside production the secret is optional (dev/local).
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[morning-quote/send] MORNING_QUOTE_CRON_SECRET unset in production — refusing to run (fail closed)",
      );
      return NextResponse.json(
        { error: "cron secret not configured" },
        { status: 500 },
      );
    }
  } else {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Day-based verse offset: same verse all day, rotates daily across corpus.
  const dayOffset = Math.floor(Date.now() / 86_400_000) % TOTAL_VERSES;

  const { data: verseRows, error: verseErr } = await supabase
    .from("verses")
    .select("source, reference, sanskrit, english, hindi")
    .not("english", "is", null)
    // Explicit, stable ordering so the day-offset picks a DETERMINISTIC verse.
    // Without ORDER BY, Postgres row order is unspecified and "today's verse"
    // could differ across reads/days. Order by reference (unique) for a fixed
    // sequence the dayOffset indexes into.
    .order("reference", { ascending: true })
    .range(dayOffset, dayOffset);

  if (verseErr || !verseRows || verseRows.length === 0) {
    console.error("[morning-quote/send] verse fetch failed:", verseErr?.message);
    return NextResponse.json({ error: "verse fetch failed" }, { status: 500 });
  }

  const verse = verseRows[0];
  const verseRef = formatVerseRef(verse.source, verse.reference);

  let quoteText: string;
  try {
    quoteText = await generateMorningQuote(verse.english, verseRef);
  } catch (err) {
    console.error("[morning-quote/send] haiku generation failed:", err);
    return NextResponse.json({ error: "quote generation failed" }, { status: 500 });
  }

  // Today's date in IST (UTC+5:30), used to gate duplicate sends.
  const nowUtc = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const todayIST = new Date(nowUtc.getTime() + istOffset)
    .toISOString()
    .slice(0, 10); // "YYYY-MM-DD"

  // Fetch active subscribers not yet sent today.
  const { data: subscribers, error: subErr } = await supabase
    .from("morning_quote_subscribers")
    .select("id, email, name, token")
    .is("unsubscribed_at", null)
    .or(`last_sent_at.is.null,last_sent_at.lt.${todayIST}T00:00:00.000Z`);

  if (subErr) {
    console.error("[morning-quote/send] subscriber fetch failed:", subErr.message);
    return NextResponse.json({ error: "subscriber fetch failed" }, { status: 500 });
  }

  if (!subscribers || subscribers.length === 0) {
    console.log("[morning-quote/send] no subscribers to send to");
    return NextResponse.json({ sent: 0, verse: verseRef });
  }

  let sent = 0;
  for (const sub of subscribers) {
    const unsubscribeUrl = `${SITE_URL}/api/morning-quote/unsubscribe?token=${sub.token}`;
    const ok = await sendMorningQuoteEmail({
      email: sub.email,
      name: sub.name ?? undefined,
      quoteText,
      verseRef,
      verseSanskrit: verse.sanskrit ?? "",
      verseEnglish: verse.english ?? "",
      unsubscribeUrl,
    });

    if (ok) {
      await supabase
        .from("morning_quote_subscribers")
        .update({ last_sent_at: nowUtc.toISOString() })
        .eq("id", sub.id);
      sent++;
    }
  }

  console.log(
    `[morning-quote/send] verse=${verseRef} total=${subscribers.length} sent=${sent}`,
  );
  return NextResponse.json({ sent, total: subscribers.length, verse: verseRef });
}
