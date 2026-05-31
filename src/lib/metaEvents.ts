import crypto from "crypto";

const API_VERSION = "v19.0";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export interface MetaUserData {
  email?: string;
  phone?: string;
  clientIp?: string;
  clientUserAgent?: string;
}

export async function fireMetaEvent(
  eventName: string,
  userData: MetaUserData = {},
  customData: Record<string, string | number> = {},
  sourceUrl = "https://divyavani.co.in",
  eventId?: string,
): Promise<void> {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CONVERSIONS_ACCESS_TOKEN;
  if (!pixelId || !accessToken) return;

  const user_data: Record<string, string | string[]> = {};
  if (userData.email) user_data.em = [sha256(userData.email)];
  if (userData.phone) user_data.ph = [sha256(normalizePhone(userData.phone))];
  if (userData.clientIp) user_data.client_ip_address = userData.clientIp;
  if (userData.clientUserAgent) user_data.client_user_agent = userData.clientUserAgent;

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: sourceUrl,
        ...(eventId ? { event_id: eventId } : {}),
        user_data,
        ...(Object.keys(customData).length > 0 ? { custom_data: customData } : {}),
      },
    ],
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${pixelId}/events?access_token=${accessToken}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    );
    if (!res.ok) console.error("[meta-events]", res.status, await res.text());
  } catch (err) {
    console.error("[meta-events] fetch error:", err);
  }
}
