// Client-side Google Ads gtag helpers — import only in "use client" components.

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function gtagSetUserData(email: string, phone?: string | null) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("set", "user_data", {
    email_address: email.toLowerCase().trim(),
    ...(phone ? { phone_number: phone } : {}),
  });
}

export function gtagFireConversion(label: string | undefined, value?: number) {
  if (typeof window === "undefined" || !window.gtag || !label) return;
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  if (!adsId) return;
  window.gtag("event", "conversion", {
    send_to: `${adsId}/${label}`,
    ...(value !== undefined ? { value, currency: "INR" } : {}),
  });
}
