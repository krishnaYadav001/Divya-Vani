import crypto from "crypto";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function toGoogleDateTime(date: Date): string {
  // Google Ads requires "YYYY-MM-DD HH:MM:SS+HH:MM" — IST is UTC+05:30
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ` +
    `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}+05:30`
  );
}

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export async function fireGoogleAdsConversion({
  conversionActionId,
  gclid,
  email,
  valueRupees,
}: {
  conversionActionId: string | undefined;
  gclid: string | null | undefined;
  email?: string;
  valueRupees?: number;
}): Promise<void> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  // gclid is required by the Google Ads uploadClickConversions endpoint
  if (!developerToken || !customerId || !conversionActionId || !gclid) return;

  const accessToken = await getAccessToken();
  if (!accessToken) return;

  const body = {
    conversions: [
      {
        gclid,
        conversionAction: `customers/${customerId}/conversionActions/${conversionActionId}`,
        conversionDateTime: toGoogleDateTime(new Date()),
        ...(valueRupees !== undefined && {
          conversionValue: valueRupees,
          currencyCode: "INR",
        }),
        ...(email && {
          userIdentifiers: [{ hashedEmail: sha256(email) }],
        }),
      },
    ],
    partialFailure: true,
  };

  try {
    const res = await fetch(
      `https://googleads.googleapis.com/v17/customers/${customerId}:uploadClickConversions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok)
      console.error("[google-ads] upload failed:", res.status, await res.text());
  } catch (err) {
    console.error("[google-ads] fetch error:", err);
  }
}
