import { createClient } from "@supabase/supabase-js";

const SITE_NAME = "Divya Vani";
const CHAT_URL = "https://divyavani.co.in/chat";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return new Response("Invalid unsubscribe link.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await supabase
    .from("morning_quote_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("token", token)
    .is("unsubscribed_at", null);

  if (error) {
    console.error("[morning-quote/unsubscribe] db:", error.message);
    return new Response("Something went wrong. Please try again later.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const html = `<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Unsubscribed — ${SITE_NAME}</title>
  <style>
    body { font-family: serif; max-width: 420px; margin: 80px auto; text-align: center;
           color: #3d2c1e; padding: 24px; background: #faf7f2; }
    h1 { font-size: 1.4rem; margin-bottom: 12px; font-weight: normal; }
    p { line-height: 1.75; color: #6b5544; }
    a { color: #8B6914; text-decoration: none; border-bottom: 1px solid #8B6914; }
  </style>
</head>
<body>
  <h1>आपको हटा दिया गया है</h1>
  <p>आप ${SITE_NAME} के प्रातःकालीन संदेशों से unsubscribe हो गए हैं।</p>
  <p style="margin-top: 28px">
    <a href="${CHAT_URL}">Krishna से बात करें →</a>
  </p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
