/**
 * Shared TypeScript types for the Referral Reward System.
 *
 * These mirror the row/column shapes of the manual Supabase schema
 * (`scripts/referral-schema.sql`): the `referrals` table, the derived
 * referrer stats, the referral identity (code + link), and the discriminated
 * union describing the outcome of an attribution attempt.
 *
 * Types only — the server-side service-role functions live in
 * `src/lib/referral.ts`.
 */

/** Lifecycle status of a referral, matching the `referrals.status` CHECK. */
export type ReferralStatus = "pending" | "qualified" | "rejected";

/**
 * One row of the `referrals` table. Field names and nullability mirror the
 * schema columns exactly so DB reads can be typed without remapping.
 */
export interface ReferralRow {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
  referral_code: string;
  status: ReferralStatus;
  required_messages: number; // default 3
  reward_seconds: number; // default 120
  referred_message_count_at_qualification: number | null;
  created_at: string;
  qualified_at: string | null;
  rejected_reason: string | null;
}

/**
 * Server-computed stats for a Referrer. All values are aggregated server-side;
 * the client never computes reward values.
 */
export interface ReferralStats {
  totalInvited: number;
  pending: number;
  successful: number; // qualified count
  voiceMinutesEarned: number; // integer division of earned seconds by 60
}

/** A Referrer's stable code and the corresponding shareable invite link. */
export interface ReferralIdentity {
  code: string;
  link: string; // https://divyavani.co.in?ref=<code>
}

/**
 * Result of an attribution attempt.
 *   - "created":  a new pending referral was persisted.
 *   - "rejected": guard tripped (self-referral, pre-existing user, invalid code);
 *                 `reason` describes which.
 *   - "exists":   the referred_user_id was already attributed.
 *   - "noop":     code absent/unresolved or a silently-swallowed DB error.
 */
export type AttributionOutcome =
  | { result: "created"; referral: ReferralRow }
  | { result: "rejected"; reason: string }
  | { result: "exists" }
  | { result: "noop" };
