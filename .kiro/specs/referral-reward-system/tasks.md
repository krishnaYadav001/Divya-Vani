# Implementation Plan: Referral Reward System

## Overview

This plan implements the referral + share-reward feature for Divya Vani as a series of incremental, test-driven coding steps. The build order moves foundation-first: manual Supabase SQL and TypeScript types, then the server-side `src/lib/referral.ts` core (with property-based tests for P1–P10), the client capture module, the `/api/referral` route, the surgical chat-route integration hooks, and finally the Share UI and landing `?ref` capture wiring. A final verification task runs the build and the new test suites.

Key invariants honored throughout:
- All reward crediting is **server-side via the service-role key**; the frontend never credits a wallet directly.
- Every referral DB operation **silent-fails** (logs `[referral]`, returns a safe value) so chat never breaks.
- Schema is **manual idempotent SQL** the founder pastes into the Supabase SQL Editor — no migration tooling.
- Stack: Next.js 16 App Router, TypeScript, Tailwind v4, Dawn Aarti design system, `node:test` + `fast-check`.

## Tasks

- [x] 1. Schema SQL and TypeScript types foundation
  - [x] 1.1 Author the manual Supabase schema SQL file
    - Create `scripts/referral-schema.sql` (founder-paste file; no migration tooling) containing the full idempotent schema from design "Data Models"
    - Add `referral_code text` to `users_memory` via `ADD COLUMN IF NOT EXISTS` and `CREATE UNIQUE INDEX IF NOT EXISTS users_memory_referral_code_key` (allows multiple NULLs, rejects duplicate non-NULLs)
    - Create `referrals` table (`IF NOT EXISTS`) with all columns, the `status` CHECK constraint (`pending`/`qualified`/`rejected`, default `pending`), `required_messages` default 3, `reward_seconds` default 120, plus `referrals_referred_user_id_key` UNIQUE index and the referrer/referred lookup indexes
    - Create `reward_transactions` table (`IF NOT EXISTS`) with `reward_transactions_related_referral_id_key` UNIQUE index and the `user_id` lookup index
    - `ENABLE ROW LEVEL SECURITY` on `referrals` and `reward_transactions` with zero policies (service-role bypass convention)
    - Define the `credit_voice_seconds(p_user_id text, p_amount int)` RPC: atomic row-locked additive update clamped to `LEAST(999999999, GREATEST(0, COALESCE(voice_seconds_balance,0) + p_amount))`, setting `updated_at = now()`, `RETURNING voice_seconds_balance`
    - Add a header comment instructing the founder to paste into the Supabase SQL Editor, and that re-running is safe (idempotent)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 10.1, 10.4, 5.3_

  - [x] 1.2 Create the referral types module
    - Create `src/lib/referralTypes.ts` exporting `ReferralStatus`, `ReferralRow`, `ReferralStats`, `ReferralIdentity`, and `AttributionOutcome` exactly as specified in design "Components and Interfaces"
    - Mirror the row/column shapes of the schema from task 1.1 so the types match the new DB rows
    - _Requirements: 6.4, 6.6, 7.1, 7.10_

- [x] 2. Implement `src/lib/referral.ts` server-side core (service-role, silent-fail)
  - [x] 2.1 Set up the module scaffold and cached service-role client
    - Create `src/lib/referral.ts` mirroring `src/lib/supabase.ts`: module-local cached `getClient()`, `[referral]`-prefixed `console.error`, `try/catch` on every DB op, fail-closed returns
    - Import types from `src/lib/referralTypes.ts`; export all function signatures from the design as stubs to be filled in by subsequent sub-tasks
    - _Requirements: 7.11, 8.9, 8.10_

  - [x] 2.2 Implement `getOrCreateReferralCode`
    - SELECT existing `referral_code` for `user_id`; return unchanged if present (stability)
    - Generate an 8-char code from `[A-Za-z0-9_-]`; persist via `UPDATE ... SET referral_code = $code WHERE user_id = $id AND referral_code IS NULL`
    - Retry up to 5 times on unique violation (`23505`); return `null` (error indication) after exhaustion or on persist failure; return `null` when identity unresolved
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.7, 1.8, 1.9, 7.2_

  - [x]* 2.3 Write property test for code uniqueness and stability
    - **Property 7: Referral code is unique and stable per user_id**
    - Generate many users; assert 8-char URL-safe format, repeat-call stability (same code, no mutation), correct `https://divyavani.co.in?ref=<code>` link, and cross-user uniqueness
    - Tag `// Feature: referral-reward-system, Property 7`; min 100 iterations; `fast-check` + `node:test`; file `src/lib/__tests__/referral.property7.test.ts`
    - **Validates: Requirements 1.2, 1.3, 1.5, 1.6**

  - [x]* 2.4 Write unit tests for code generation collision/exhaustion and no-identity
    - Stub RNG to collide-then-succeed (assert retry) and to collide 5× (assert error indication / `null`)
    - Assert `getOrCreateReferralCode` returns `null` when no identity is resolved
    - File `src/lib/__tests__/referral.codegen.test.ts`
    - _Requirements: 1.7, 1.8, 1.9_

  - [x] 2.5 Implement `validateReferralCode`
    - Read-only lookup of an owner by code; return `true` only when a Referrer exists; never create or modify a record; return `false` on error (fail closed)
    - _Requirements: 7.3, 7.4, 8.6, 3.5_

  - [x] 2.6 Implement `attributeReferral` with all guards
    - Resolve the code owner; enforce guards server-side: self-referral (owner `user_id === referredUserId`) → record `rejected` row with `rejected_reason='self_referral'`, no pending row
    - Invalid/unknown code → `noop` (no record); pre-existing-user guard via `refStoredAt` timestamp and/or `message_count > 0` at attribution time → not attributed
    - INSERT `pending` referral; rely on `UNIQUE(referred_user_id)` so a second attempt returns `exists` and a concurrent loser's `23505` is swallowed
    - Never throw; return `noop` on any DB error so chat continues
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 7.5, 7.6, 7.7, 8.1, 8.2, 8.3, 8.5, 8.6, 8.7_

  - [x]* 2.7 Write property test for self-referral rejection
    - **Property 3: No referral is a self-referral**
    - For any user, attributing their own code to themselves never creates a pending row; result is rejection recorded with a self-referral reason
    - Tag `// Feature: referral-reward-system, Property 3`; min 100 iterations; file `src/lib/__tests__/referral.property3.test.ts`
    - **Validates: Requirements 4.2, 7.6, 8.1**

  - [x]* 2.8 Write property test for one-row-per-referred-user
    - **Property 4: Each referred user appears in at most one referrals row**
    - Repeated/concurrent attribution (same or different codes) for one `referred_user_id` yields exactly one row, first association retained unchanged
    - Tag `// Feature: referral-reward-system, Property 4`; min 100 iterations; file `src/lib/__tests__/referral.property4.test.ts`
    - **Validates: Requirements 4.3, 4.4, 4.7, 8.2, 8.3**

  - [x]* 2.9 Write property test for no-overwrite of attribution
    - **Property 8: Invalid or re-supplied ref never overwrites an existing attribution**
    - For arbitrary stored states and invalid/re-supplied refs, assert storage and persisted association are unchanged; invalid/unknown ref creates no record
    - Tag `// Feature: referral-reward-system, Property 8`; min 100 iterations; file `src/lib/__tests__/referral.property8.test.ts`
    - **Validates: Requirements 3.2, 3.3, 4.6, 8.3, 8.6**

  - [x] 2.10 Implement `qualifyAndCreditReferral` (atomic, status-guarded credit)
    - Status-guarded atomic transition: `UPDATE referrals SET status='qualified', qualified_at=now(), referred_message_count_at_qualification=N WHERE referred_user_id=$1 AND status='pending' RETURNING *`
    - On NULL/empty return (already qualified or absent) → skip crediting (idempotent no-op)
    - On a successful transition: INSERT `reward_transactions` (relying on `UNIQUE(related_referral_id)`), then credit exactly `reward_seconds` (120) to the referrer via the `credit_voice_seconds` RPC
    - On reward-transaction insert or credit failure, leave the referral recoverable and apply no partial seconds; return `null` (no credit); never throw
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 7.9, 8.4, 8.7, 8.8, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x]* 2.11 Write property test for credit-at-most-once
    - **Property 1: A referral is credited at most once**
    - Drive a referral past threshold, then call `qualifyAndCreditReferral` repeatedly and concurrently; assert total wallet delta is exactly 120 and exactly one `reward_transactions` row for that referral
    - Tag `// Feature: referral-reward-system, Property 1`; min 100 iterations; file `src/lib/__tests__/referral.property1.test.ts`
    - **Validates: Requirements 5.5, 8.4, 8.7, 8.8, 10.5**

  - [x]* 2.12 Write property test for exact additive clamped credit
    - **Property 2: Qualification credits exactly 120 seconds, additively and clamped**
    - For arbitrary prior balances (including near the 999,999,999 cap), assert new balance `== min(999999999, B + 120)`
    - Tag `// Feature: referral-reward-system, Property 2`; min 100 iterations; file `src/lib/__tests__/referral.property2.test.ts`
    - **Validates: Requirements 5.3, 10.1, 10.4**

  - [x]* 2.13 Write property test for unique related_referral_id
    - **Property 5: reward_transactions.related_referral_id is unique**
    - Across arbitrary crediting sequences, assert no two reward rows share a non-null `related_referral_id`
    - Tag `// Feature: referral-reward-system, Property 5`; min 100 iterations; file `src/lib/__tests__/referral.property5.test.ts`
    - **Validates: Requirements 6.7, 8.4**

  - [x]* 2.14 Write property test for qualification threshold condition
    - **Property 6: Crediting happens iff message_count >= 3 and the referral was pending**
    - For counts 0,1,2 assert pending + no credit; for counts >=3 assert qualified + credited once
    - Tag `// Feature: referral-reward-system, Property 6`; min 100 iterations; file `src/lib/__tests__/referral.property6.test.ts`
    - **Validates: Requirements 5.2, 5.4, 7.9**

  - [x]* 2.15 Write unit test for credit failure rollback
    - Inject a failure at the reward-transaction insert / wallet credit; assert no balance change and the referral remains `pending`
    - File `src/lib/__tests__/referral.creditFailure.test.ts`
    - _Requirements: 5.8, 10.6_

  - [x] 2.16 Implement `getReferralStats`
    - Server-compute `totalInvited` (count of referrer's referrals), `pending`, `successful` (qualified count), and `voiceMinutesEarned = floor(earnedSeconds / 60)`; return `null` on error
    - _Requirements: 7.10, 9.1, 9.3, 9.4_

  - [x]* 2.17 Write property test for stats correctness
    - **Property 10: Referral stats equal the true server-side aggregates**
    - For arbitrary referral/transaction sets, assert `getReferralStats` matches a reference aggregation and `voiceMinutesEarned == floor(earnedSeconds/60)`
    - Tag `// Feature: referral-reward-system, Property 10`; min 100 iterations; file `src/lib/__tests__/referral.property10.test.ts`
    - **Validates: Requirements 7.10, 9.1, 9.3, 9.4**

- [x] 3. Checkpoint - Ensure all referral-core tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement `src/lib/referralCapture.ts` (client, silent-fail localStorage)
  - [x] 4.1 Implement capture, read, and clear helpers
    - Create `src/lib/referralCapture.ts` mirroring `chatStorage.ts`/`voiceTranscriptStorage.ts`: `typeof window` guard, `try/catch`, never throws, never blocks render
    - `captureRefFromUrl()`: read `URLSearchParams "ref"`; validate single occurrence and `^[A-Za-z0-9_-]{1,64}$`; store `{ code, stored_at }` under `divya-vani-ref:v1` only when nothing already stored (never overwrite); invalid/duplicate → no-op
    - `readStoredRef()`: return `StoredRef | null`; `clearStoredRef()`: remove the stored value
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x]* 4.2 Write unit tests for referral capture
    - Test capture of a valid ref, no-overwrite when a value already exists, invalid ref ignored (empty/whitespace/>64 chars/bad chars/duplicate occurrence) with prior storage preserved, and read/clear round-trip
    - File `src/lib/__tests__/referralCapture.test.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 5. Implement the `/api/referral` route
  - [x] 5.1 Implement GET `/api/referral`
    - Create `src/app/api/referral/route.ts`; resolve `userId` from the `god_messenger_uid` cookie; if no identity, return an error indication and do NOT generate a code
    - Otherwise call `getOrCreateReferralCode` + `getReferralStats` and return `{ code, link, stats }`
    - _Requirements: 1.1, 1.2, 1.6, 7.1, 7.2, 7.10, 9.1, 9.4_

  - [x] 5.2 Implement optional POST `/api/referral/validate`
    - Create `src/app/api/referral/validate/route.ts`; accept `{ code }`, return `{ valid: boolean }` via `validateReferralCode`; read-only, no record creation
    - _Requirements: 7.3, 7.4, 3.5_

  - [x]* 5.3 Write route tests for `/api/referral`
    - Assert GET without a cookie returns an error indication and no code; GET with identity returns `{ code, link, stats }`; validate route returns correct `{ valid }` for known/unknown codes without mutating records
    - File `src/lib/__tests__/referralRoute.test.ts`
    - _Requirements: 1.9, 7.1, 7.3, 7.4, 9.5_

- [x] 6. Integrate referral hooks into the chat route
  - [x] 6.1 Widen the chat request body and add the attribution hook
    - In `src/app/api/chat/route.ts` widen the body type to `{ message, ref?: string, refStoredAt?: string }`
    - When `isNewUser === true` and `body.ref` is a non-empty string, `await attributeReferral({ referrerCode: ref, referredUserId: userId, refStoredAt })` inside its own `try/catch` so chat never breaks
    - _Requirements: 4.1, 4.5, 4.8, 7.5, 8.5, 7.12_

  - [x] 6.2 Add the qualification hook in `persistTurnState`
    - After the `saveMemory` write, when `onFreePool && typeof nextMessageCount === "number" && nextMessageCount >= 3`, `await qualifyAndCreditReferral(userId)` inside its own `try/catch`
    - Preserve `waitUntil`/awaited paths and `withCookie` behavior unchanged; chat response is produced regardless of hook outcome
    - _Requirements: 5.2, 7.8, 7.9, 7.12, 5.8_

  - [x]* 6.3 Write property test for chat independence
    - **Property 9: Chat response success is independent of referral operation success**
    - Inject every referral outcome (success, no-op, failure, thrown error) into both hooks; assert the chat reply is still produced and returned
    - Tag `// Feature: referral-reward-system, Property 9`; min 100 iterations; file `src/lib/__tests__/referral.property9.test.ts`
    - **Validates: Requirements 4.8, 5.8, 7.12**

- [x] 7. Checkpoint - Ensure all backend + integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Wire referral capture and ref-passing into the client
  - [x] 8.1 Send the stored ref from ChatUI on the first message
    - In `src/app/components/ChatUI.tsx`, read the stored ref via `readStoredRef()` and include `ref`/`refStoredAt` in the first `POST /api/chat` body only when present
    - Call `clearStoredRef()` after attribution has been attempted (first send)
    - Add a mount point for the Share entry near the existing Settings gear in the chat header
    - _Requirements: 3.1, 4.1_

  - [x] 8.2 Capture `?ref` on landing/page mount
    - Call `captureRefFromUrl()` on landing/page mount (client effect) without blocking render; ensure invalid refs are ignored and rendering always proceeds
    - _Requirements: 3.1, 3.3, 3.4_

- [x] 9. Implement `src/app/components/ShareDivyaVani.tsx` (Dawn Aarti)
  - [x] 9.1 Build the Share UI component
    - Create `src/app/components/ShareDivyaVani.tsx`; on mount `fetch GET /api/referral`; display the selectable Referral_Link when available and disable Copy/WhatsApp/native-share while unavailable
    - Copy control via Clipboard API: on success show "Your invite link has been copied." within 1s, visible 3s; on failure show an error indication and keep the link selectable
    - WhatsApp control opens `https://wa.me/?text=<encoded invite text + link>`; native-share via `navigator.share` feature-detected (omit the control entirely when absent)
    - Render the reward explanation with exact title "Share Divya Vani" and the exact description string from the design; show stats (total invited, pending, successful, voice minutes earned) from the API only (never client-computed)
    - When earned seconds > 0, show "You earned 2 free voice minutes because someone used Divya Vani through your invite."
    - On stats fetch failure or >10s non-response, show an error indication and render no partial/client-computed values
    - Apply Dawn Aarti styling (semantic CSS vars, Marcellus/Cormorant Garamond italic/Tiro Devanagari, CSS-only motion with `prefers-reduced-motion` off-switch, mobile-first at 360px)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x]* 9.2 Write component tests for ShareDivyaVani
    - Render with/without an available link and with/without `navigator.share`; assert controls present/disabled/omitted, copy-success message appears within 1s and persists 3s, earned message shows when earned seconds > 0, and stats failure/timeout shows an error indication with no partial values
    - File `src/lib/__tests__/shareDivyaVani.test.tsx`
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.7, 2.8, 9.2, 9.5_

- [x] 10. Final verification
  - [x] 10.1 Run build and the new test suites, then clean up
    - Run `npm run build` and the new `node:test` suites (`npm test`); fix any failures surfaced
    - Remove any temporary files created during verification; confirm no client-accessible path mutates `voice_seconds_balance`
    - _Requirements: 5.7, 7.11_

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP, but they map directly to design properties P1–P10 and the requirements' testing list.
- Each task references specific granular requirement clauses for traceability.
- Property-based tests use `fast-check` + `node:test` (min 100 iterations each), tagged `// Feature: referral-reward-system, Property {n}`. `fast-check` is not yet a dependency and will need to be added as a dev dependency before running the property suites.
- Checkpoints (tasks 3, 7) ensure incremental validation at natural seams.
- The schema SQL (task 1.1) is founder-paste manual SQL — no migration tooling runs it automatically.
- All reward crediting stays server-side via the service-role key; the frontend never credits a wallet directly.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "2.5", "2.6", "2.10", "2.16", "4.2"] },
    { "id": 3, "tasks": ["2.3", "2.4", "2.7", "2.8", "2.9", "2.11", "2.12", "2.13", "2.14", "2.15", "2.17"] },
    { "id": 4, "tasks": ["5.1", "5.2"] },
    { "id": 5, "tasks": ["5.3", "6.1", "6.2"] },
    { "id": 6, "tasks": ["6.3", "8.1", "8.2", "9.1"] },
    { "id": 7, "tasks": ["9.2", "10.1"] }
  ]
}
```
