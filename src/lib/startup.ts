// Validates required server-side env vars at module load time (cold start).
// Import this file from the root layout so the check runs before any request
// is served. Throws loudly in production; warns in development so local dev
// works with a partial .env.local.
const REQUIRED = [
  "ANTHROPIC_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "SARVAM_API_KEY",
] as const;

const missing = REQUIRED.filter((k) => !process.env[k]);

if (missing.length > 0) {
  const msg = `Missing required environment variables: ${missing.join(", ")}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error(msg);
  } else {
    console.warn("[startup] " + msg);
  }
}
