// Loops.so transactional email client.
// Wire up by setting LOOPS_API_KEY + LOOPS_RETENTION_TEMPLATE_ID in Vercel env vars.
// Until those are set, sendRetentionEmail is a no-op (returns false) — the
// /api/retention/check route logs the skip so you can see it in Vercel logs.

export interface MorningQuoteEmailPayload {
  email: string;
  name?: string;
  quoteText: string;
  verseRef: string;
  verseSanskrit: string;
  verseEnglish: string;
  unsubscribeUrl: string;
}

export async function sendMorningQuoteEmail(payload: MorningQuoteEmailPayload): Promise<boolean> {
  const apiKey = process.env.LOOPS_API_KEY;
  const templateId = process.env.LOOPS_MORNING_QUOTE_TEMPLATE_ID;
  if (!apiKey || !templateId) {
    console.log("[loops] morning-quote skipped — LOOPS_API_KEY or LOOPS_MORNING_QUOTE_TEMPLATE_ID not set");
    return false;
  }

  try {
    const res = await fetch("https://app.loops.so/api/v1/transactional", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        transactionalId: templateId,
        email: payload.email,
        dataVariables: {
          name: payload.name ?? "भक्त",
          quoteText: payload.quoteText,
          verseRef: payload.verseRef,
          verseSanskrit: payload.verseSanskrit,
          verseEnglish: payload.verseEnglish,
          unsubscribeUrl: payload.unsubscribeUrl,
        },
      }),
    });
    if (!res.ok) {
      console.error("[loops] morning-quote error:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[loops] morning-quote fetch error:", err);
    return false;
  }
}

export interface RetentionEmailPayload {
  email: string;
  primaryFocus: string;
  resonantText: string;
}

const FOCUS_LABELS: Record<string, string> = {
  stress: "overcoming stress and anxiety",
  direction: "finding life's direction",
  knowledge: "deepening spiritual knowledge",
  peace: "finding inner peace",
};

const TEXT_LABELS: Record<string, string> = {
  gita: "Bhagavad Gita",
  mahabharata: "Mahabharata",
  bhagavata: "Bhagavata Purana",
  guided: "Krishna's guidance",
};

export async function sendRetentionEmail(payload: RetentionEmailPayload): Promise<boolean> {
  const apiKey = process.env.LOOPS_API_KEY;
  const templateId = process.env.LOOPS_RETENTION_TEMPLATE_ID;
  if (!apiKey || !templateId) {
    console.log("[loops] skipped — LOOPS_API_KEY or LOOPS_RETENTION_TEMPLATE_ID not set");
    return false;
  }

  try {
    const res = await fetch("https://app.loops.so/api/v1/transactional", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        transactionalId: templateId,
        email: payload.email,
        dataVariables: {
          focusLabel: FOCUS_LABELS[payload.primaryFocus] ?? payload.primaryFocus,
          textLabel: TEXT_LABELS[payload.resonantText] ?? payload.resonantText,
        },
      }),
    });
    if (!res.ok) {
      console.error("[loops] transactional error:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[loops] fetch error:", err);
    return false;
  }
}
