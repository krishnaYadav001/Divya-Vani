/**
 * Phase 9 — One-off Razorpay Subscriptions PLAN provisioning.
 * ───────────────────────────────────────────────────────────────────────────
 * Creates the 6 Razorpay Plans (Plus / Voice / Premium × INR-monthly + USD-
 * annual) that back the subscription tiers, then prints copy-paste-ready
 * `RAZORPAY_PLAN_*=plan_…` env lines for .env.local + Vercel.
 *
 * The source of truth is src/lib/subscriptions.ts — this script reads every
 * offer's amount / currency / period / env-var name from SUBSCRIPTION_PLANS, so
 * the Plans you create here can never drift from the app's pricing config.
 *
 * IDEMPOTENT: each Plan is tagged with notes.dv_env (its target env-var name).
 * Re-running matches on that tag + amount + currency and REUSES the existing
 * Plan instead of creating a duplicate. (Razorpay Plans are IMMUTABLE — you
 * cannot edit a Plan's amount. If you change a price in subscriptions.ts and
 * re-run, this script detects the drift, warns, and creates a NEW Plan for the
 * new price; switch the env var to the new id. The old Plan lingers harmlessly,
 * still honored by anyone already subscribed to it.)
 *
 * TEST vs LIVE: the mode is decided by which key you run with. `rzp_test_…`
 * keys create test-mode Plans (only usable in test mode); `rzp_live_…` keys
 * create live Plans. The script prints the detected mode prominently — make
 * sure it matches the environment whose env vars you're about to set.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/setup-razorpay-plans.ts            (create/reuse)
 *   npx tsx --env-file=.env.local scripts/setup-razorpay-plans.ts --dry-run  (preview only)
 * or via package.json:
 *   npm run setup:razorpay-plans
 *   npm run setup:razorpay-plans:dry
 *
 * Security: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are read from the environment.
 * The secret is NEVER logged; only the (non-sensitive) key_id mode prefix and
 * the resulting plan_ids are printed.
 */

import Razorpay from "razorpay";
import { getPlansInOrder, type PlanOffer } from "../src/lib/subscriptions";

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Razorpay wire shapes (only the fields we read/write) ────────────────────
interface RzpPlanItem {
  name: string;
  amount: number;
  currency: string;
  description?: string;
}
interface RzpPlan {
  id: string;
  period: string;
  interval: number;
  item: RzpPlanItem;
  notes?: Record<string, string>;
}
interface RzpPlanList {
  entity: string;
  count: number;
  items: RzpPlan[];
}
interface RzpPlanCreateBody {
  period: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  item: RzpPlanItem;
  notes: Record<string, string>;
}

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

// Our billing-period vocabulary → Razorpay's `period` enum.
function razorpayPeriod(p: PlanOffer["period"]): RzpPlanCreateBody["period"] {
  return p === "annual" ? "yearly" : "monthly";
}

/**
 * Fetch ALL existing Plans (paginated). A fresh account has ≤6, but we page to
 * be correct on accounts that already have other Plans, so idempotency holds.
 */
async function fetchAllPlans(rzp: Razorpay): Promise<RzpPlan[]> {
  const all: RzpPlan[] = [];
  const count = 100; // Razorpay max page size
  for (let skip = 0; ; skip += count) {
    const page = (await rzp.plans.all({ count, skip })) as unknown as RzpPlanList;
    const items = page.items ?? [];
    all.push(...items);
    if (items.length < count) break;
  }
  return all;
}

async function main(): Promise<void> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    fail(
      "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set. Run with:\n" +
        "  npx tsx --env-file=.env.local scripts/setup-razorpay-plans.ts",
    );
  }

  const mode = keyId.startsWith("rzp_live_")
    ? "LIVE"
    : keyId.startsWith("rzp_test_")
      ? "TEST"
      : "UNKNOWN";

  console.log("\n══════════════════════════════════════════════════════════");
  console.log(` Razorpay Plan provisioning — mode: ${mode}${DRY_RUN ? "  (DRY RUN)" : ""}`);
  console.log(`   key_id: ${keyId.slice(0, 12)}…  (secret not shown)`);
  if (mode === "UNKNOWN") {
    console.log("   ⚠ key_id has neither rzp_test_ nor rzp_live_ prefix — verify it.");
  }
  if (mode === "LIVE" && !DRY_RUN) {
    console.log("   ⚠ Creating LIVE plans — these are real, billable plans.");
  }
  console.log("══════════════════════════════════════════════════════════\n");

  const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

  // Existing plans (for idempotency). Skip the network call on dry runs only if
  // we still want the preview to show reuse/drift — so fetch even on dry-run.
  let existing: RzpPlan[] = [];
  try {
    existing = await fetchAllPlans(rzp);
  } catch (e) {
    fail(
      `Could not list existing plans (auth or network). Verify the keys + that ` +
        `Subscriptions is enabled on this account.\n${e instanceof Error ? e.message : e}`,
    );
  }

  // Collect the (env var → plan_id) results to print at the end.
  const results: { env: string; planId: string; status: string; display: string }[] = [];

  for (const plan of getPlansInOrder()) {
    for (const offer of plan.offers) {
      const env = offer.planIdEnv;
      const period = razorpayPeriod(offer.period);
      const label = `${plan.displayName} (${offer.currency} / ${offer.period}, ${offer.display})`;

      // Full match → reuse.
      const full = existing.find(
        (p) =>
          p.notes?.dv_env === env &&
          p.item?.amount === offer.amount &&
          p.item?.currency === offer.currency &&
          p.period === period,
      );
      if (full) {
        console.log(`• ${label}\n    reused existing → ${full.id}`);
        results.push({ env, planId: full.id, status: "reused", display: offer.display });
        continue;
      }

      // Tagged for this env but a DIFFERENT amount → price drift (plans are immutable).
      const stale = existing.find((p) => p.notes?.dv_env === env);
      if (stale) {
        console.log(
          `• ${label}\n    ⚠ a plan tagged ${env} exists at ${stale.item?.amount} ` +
            `${stale.item?.currency} (config now ${offer.amount} ${offer.currency}). ` +
            `Razorpay plans are immutable → creating a NEW plan for the new price.`,
        );
      }

      const body: RzpPlanCreateBody = {
        period,
        interval: 1,
        item: {
          name: `${plan.displayName} — ${offer.display}/${offer.period}`,
          amount: offer.amount,
          currency: offer.currency,
          description: plan.blurb,
        },
        notes: {
          dv_env: env,
          dv_plan_key: plan.key,
          dv_currency: offer.currency,
          dv_period: offer.period,
        },
      };

      if (DRY_RUN) {
        console.log(`• ${label}\n    would CREATE → ${JSON.stringify(body.item)} period=${period}`);
        results.push({ env, planId: "(dry-run, not created)", status: "would-create", display: offer.display });
        continue;
      }

      try {
        const created = (await rzp.plans.create(
          body as unknown as Parameters<typeof rzp.plans.create>[0],
        )) as unknown as RzpPlan;
        if (!created?.id) {
          fail(`Plan create for ${env} returned no id: ${JSON.stringify(created)}`);
        }
        console.log(`• ${label}\n    created → ${created.id}`);
        results.push({ env, planId: created.id, status: "created", display: offer.display });
      } catch (e) {
        fail(
          `Failed to create plan for ${env} (${label}).\n` +
            `${e instanceof Error ? e.message : JSON.stringify(e)}\n` +
            `If this is a USD plan, confirm International payments is ACTIVE on the account.`,
        );
      }
    }
  }

  // ─── Final copy-paste block ────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════");
  console.log(` Done — ${results.filter((r) => r.status === "created").length} created, ` +
    `${results.filter((r) => r.status === "reused").length} reused` +
    `${DRY_RUN ? " (dry run — nothing was created)" : ""}.`);
  console.log("══════════════════════════════════════════════════════════");
  console.log(
    `\nPaste these into .env.local AND Vercel (Project → Settings → Environment\n` +
      `Variables). They are ${mode}-mode plan ids:\n`,
  );
  for (const r of results) {
    console.log(`${r.env}=${r.planId}`);
  }
  console.log(
    `\nReminder: after setting them in Vercel you must REDEPLOY — Vercel does not\n` +
      `pick up new env vars without a redeploy.\n`,
  );
}

main().catch((err) => {
  console.error("\n✗ Unexpected error:", err instanceof Error ? err.message : err);
  process.exit(1);
});

// Mark as a module so top-level `main` doesn't collide with the other one-off
// scripts in the shared global scope (TS2393). No runtime effect.
export {};
