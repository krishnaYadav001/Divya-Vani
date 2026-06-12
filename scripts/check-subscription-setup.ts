// Post-deploy verification that the Phase 9 subscription SQL has been pasted
// into Supabase. Run AFTER docs/subscriptions-schema.sql + subscriptions-rpcs.sql:
//
//   tsx --env-file=.env.local scripts/check-subscription-setup.ts
//
// WHY THIS EXISTS: the subscription pool/voice RPCs are installed by manual SQL
// paste (no migration tooling). If they're missing in prod, the chat route's
// `increment_subscription_messages` call silently returns null and a subscriber
// is served messages WITHOUT decrementing their pool — i.e. unlimited messages.
// This probe catches a half-applied deploy before users do. NOT in package.json.
//
// Every check is side-effect-free: each RPC is called with a non-existent user
// / zero seconds so it short-circuits without writing any row.
import { createClient } from "@supabase/supabase-js";

const PROBE_USER = "__setup_probe_nonexistent__";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — run with --env-file=.env.local");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const results: { name: string; ok: boolean; detail: string }[] = [];
  const record = (name: string, ok: boolean, detail = "") =>
    results.push({ name, ok, detail });

  // 1) subscriptions table exists.
  {
    const { error } = await sb
      .from("subscriptions")
      .select("*", { count: "exact", head: true });
    record("table: subscriptions", !error, error?.message ?? "");
  }

  // 2) users_memory.voice_seconds_balance column exists.
  {
    const { error } = await sb
      .from("users_memory")
      .select("voice_seconds_balance", { head: true })
      .limit(0);
    record("column: users_memory.voice_seconds_balance", !error, error?.message ?? "");
  }

  // 2b) voice_sessions ledger table exists (high-water-mark metering).
  {
    const { error } = await sb
      .from("voice_sessions")
      .select("*", { count: "exact", head: true });
    record("table: voice_sessions", !error, error?.message ?? "");
  }

  // 3) increment_subscription_messages — no active sub for the probe user → NULL,
  //    no write.
  {
    const { error } = await sb.rpc("increment_subscription_messages", {
      p_user_id: PROBE_USER,
    });
    record("rpc: increment_subscription_messages", !error, error?.message ?? "");
  }

  // 4) consume_voice_seconds — p_seconds=0 short-circuits before any UPDATE.
  {
    const { error } = await sb.rpc("consume_voice_seconds", {
      p_user_id: PROBE_USER,
      p_seconds: 0,
    });
    record("rpc: consume_voice_seconds", !error, error?.message ?? "");
  }

  // 5) credit_voice_seconds — p_seconds=0 takes the read-only branch (no INSERT).
  {
    const { error } = await sb.rpc("credit_voice_seconds", {
      p_user_id: PROBE_USER,
      p_seconds: 0,
    });
    record("rpc: credit_voice_seconds", !error, error?.message ?? "");
  }

  // 6) meter_voice_session — p_total_seconds=0 short-circuits before any write.
  {
    const { error } = await sb.rpc("meter_voice_session", {
      p_conversation_id: "__setup_probe_conversation__",
      p_user_id: PROBE_USER,
      p_total_seconds: 0,
      p_source: "client",
    });
    record("rpc: meter_voice_session", !error, error?.message ?? "");
  }

  let allOk = true;
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : `  — ${r.detail}`}`);
    if (!r.ok) allOk = false;
  }
  console.log();
  if (allOk) {
    console.log("All subscription setup checks PASSED — pools will enforce correctly.");
  } else {
    console.error(
      "Some checks FAILED. Paste docs/subscriptions-schema.sql + docs/subscriptions-rpcs.sql\n" +
        "into the Supabase SQL Editor, then re-run. Do NOT take subscriptions live until this passes.",
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
