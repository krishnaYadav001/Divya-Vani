# Referral Reward System — Session Handoff

> Read this first. It captures the full state of the referral feature, what's
> been fixed, what's still open, and the exact next diagnostic step. The feature
> is built and deployed but **not yet confirmed working end-to-end in production.**

---

## 1. What the feature is

Anonymous referral/share reward for Divya Vani (Next.js 16, Supabase, Vercel,
production at https://divyavani.co.in).

- Every anonymous user (cookie `god_messenger_uid`, row in `users_memory`) gets a
  stable 8-char `referral_code`.
- Invite link: `https://divyavani.co.in?ref=CODE`.
- When a **referred** user reaches **3 free messages** (`message_count >= 3`),
  the **referrer** is credited **120 seconds** to the existing live voice wallet
  `users_memory.voice_seconds_balance`.
- Reward is idempotent, server-side only, silent-fail (never breaks chat).
- Threshold is 3 (founder changed it from the original 10).

Spec lives in `.kiro/specs/referral-reward-system/` (requirements.md, design.md,
tasks.md). All 42 implementation tasks were completed; 124 tests pass locally
(`npm test`), including fast-check property tests P1–P10.

---

## 2. Key files

- `src/lib/referral.ts` — server core: `getOrCreateReferralCode`,
  `validateReferralCode`, `attributeReferral`, `qualifyAndCreditReferral`,
  `getReferralStats`. Service-role, silent-fail. Has a `__setTestClient` seam.
- `src/lib/referralTypes.ts` — shared types.
- `src/lib/referralCapture.ts` — client localStorage capture
  (`captureRefFromUrl`, `readStoredRef`, `clearStoredRef`). Key
  `divya-vani-ref:v1`, format `^[A-Za-z0-9_-]{1,64}$`, first-write-wins.
- `src/app/api/referral/route.ts` — GET returns `{ code, link, stats }`.
  **Contains a TEMP diagnostic probe** (`probeReferralFailure`) that surfaces the
  raw DB error in the 503 response. REMOVE before final.
- `src/app/api/referral/validate/route.ts` — POST `{ code }` → `{ valid }`.
- `src/app/api/referral/debug/route.ts` — **TEMP diagnostic route.** Supports
  `?ref=CODE` (dry-run verdict) and `?ref=CODE&write=1` (runs the real
  `attributeReferral` and returns its outcome). REMOVE before final.
- `src/app/components/ShareDivyaVani.tsx` — Dawn Aarti share panel (redesigned).
- `src/app/components/ChatUI.tsx` — gift icon + share overlay; reads stored ref
  and sends `{ ref, refStoredAt }` on the chat POST; clears after; ALSO captures
  `?ref` on mount (added this session as a robustness fix).
- `src/app/components/LandingClient.tsx` — calls `captureRefFromUrl()` on mount.
- `src/app/api/chat/route.ts` — two hooks: (a) attribution when
  `priorCount === 0 && body.ref` (before persistTurnState); (b) qualification in
  `persistTurnState` when `onFreePool && nextMessageCount >= 3`. Both try/catch
  isolated.
- `scripts/referral-schema.sql` — founder-paste idempotent schema (referral_code
  column, referrals + reward_transactions tables, RLS no-policies). Reuses the
  EXISTING `credit_voice_seconds(p_user_id text, p_seconds int)` RPC from
  `docs/subscriptions-rpcs.sql` — does NOT redefine it.

---

## 3. Production DB state (confirmed via SQL)

- `users_memory.referral_code` column EXISTS.
- `referrals` and `reward_transactions` tables EXIST, RLS enabled.
- `credit_voice_seconds(p_user_id text, p_seconds integer)` EXISTS (parameter is
  `p_seconds`, NOT `p_amount` — referral.ts already calls it with `p_seconds`).
- Referrer test account `user_id = cdcd3f54-735e-4e25-a29c-3740a44c60bb`
  (referral_code `gpA5QtMM`), `voice_seconds_balance = 0`.
- Referred test account `user_id = 26c4dfa0-0aad-414d-9abc-a87299aa9f2a`.
- **`SELECT count(*) FROM referrals;` returns 0** — no referral row has ever been
  created. This is the core unsolved problem.

---

## 4. Bugs already FIXED this session (all pushed to main)

1. **`credit_voice_seconds` 42P13 error** — schema tried to redefine the existing
   RPC with a renamed param. Fixed: schema no longer defines the function;
   reuses the live one.
2. **Post-deletion / no-row 503** — `getOrCreateReferralCode` used a bare UPDATE
   that fails when no `users_memory` row exists. Fixed: upserts an empty row
   first (ignore-on-conflict).
3. **`net` schema does not exist (3F000)** — a trigger `on_new_user_insert` →
   `notify_telegram_new_user()` on `users_memory` calls `net.http_post` but
   `pg_net` wasn't enabled, so EVERY insert into users_memory failed (blocked all
   new users + referral writes). Founder fixed by enabling `pg_net` + hardening
   the function with `BEGIN...EXCEPTION WHEN OTHERS` so it can't block inserts.
   (NOTE: the `x-notify-secret` in that function was exposed in chat/screenshots —
   recommend rotating it before public launch.)
4. **Attribution gate too strict** — was `isNewUser`, but page-load routes mint
   the cookie before first chat, so it never fired. Fixed: gate is now
   `priorCount === 0`.
5. **Production build was FAILING on tsc** (debug route `never` type + property8
   test `unknown` type). A failed Vercel build keeps serving the OLD deploy, so
   fixes #2 and #4 never reached production until this was fixed. Now
   `tsc --noEmit` is clean. THIS was why nothing changed in prod for a while.

---

## 5. CURRENT STATE — what's deployed

Latest commit on `main`: **b3ee2db** "debug(referral): add write-mode attribution
probe + capture ref on chat mount". Pushed; should be the live Vercel deploy
(verify it shows **Ready**, not Error, in the Vercel dashboard — a failed build
silently keeps old code live).

Diagnostic dry-run already returned (referred browser `26c4…`, ref `gpA5QtMM`):
```
verdict: "WOULD_CREATE_PENDING" — fresh, eligible, owner is a different user.
```
So the logic SHOULD create a row. But after sending 3 messages, `referrals`
count was still 0 → the `ref` is apparently NOT reaching the chat POST, OR the
insert is failing silently.

---

## 6. THE NEXT STEP (do this first in the new session)

Confirm Vercel deployed b3ee2db (status Ready). Then, in the **referred** browser
(cookie `26c4…`), open the **write-mode** probe:

```
https://divyavani.co.in/api/referral/debug?ref=gpA5QtMM&write=1
```

This calls the REAL `attributeReferral` directly (bypasses localStorage / chat
POST / all client uncertainty). Read the **`writeOutcome`** field:

- `{"result":"created"}` → attribution logic works. The only problem was the
  `ref` not reaching the chat POST (client capture). The ChatUI-mount capture
  added in b3ee2db should fix that — re-test the real flow.
- `{"result":"rejected","reason":"..."}` → the reason names the guard.
- `{"result":"noop"}` → code didn't resolve to an owner, or a swallowed DB error.
- `{"threw":"..."}` → an exception — MOST LIKELY a trigger on `referrals` (or one
  that fires on the referrals insert) still hitting the `net`/pg_net issue, OR
  RLS. Check for triggers on `referrals`:
  ```sql
  SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
  WHERE tgrelid = 'referrals'::regclass AND NOT tgisinternal;
  ```

Then re-check:
```sql
SELECT count(*) FROM referrals;
SELECT status, referrer_user_id, referred_user_id, referred_message_count_at_qualification
FROM referrals ORDER BY created_at DESC LIMIT 5;
```

### Leading hypotheses (in order)
1. The `ref` code is never stored in the referred browser's localStorage (user
   opened `/chat` or the debug URL directly, not the landing page with `?ref=`).
   The debug URL does NOT store; only landing/chat mount does. → b3ee2db's
   ChatUI-mount capture should fix.
2. A DB trigger on `referrals` (or shared with users_memory) throws on insert
   (same `net`/pg_net family of issue). → the `&write=1` `threw` outcome reveals.
3. The referred browser shares identity with the referrer (not truly separate) →
   self-referral. Ruled out here: owner `cdcd…` ≠ referred `26c4…`.

---

## 7. Correct manual test procedure (production)

1. Referrer browser (e.g. normal Chrome): open `/chat`, gift icon → copy code.
2. Referred user: a SEPARATE browser or **Incognito** (NOT a new tab — tabs share
   cookies → self-referral).
3. Open the **landing page** with the ref FIRST so capture runs:
   `https://divyavani.co.in/?ref=CODE`. Verify in DevTools → Application → Local
   Storage that key `divya-vani-ref:v1` exists with the code.
4. Go to chat, send **3 messages**.
5. `SELECT count(*) FROM referrals;` → expect ≥1; after msg 3 status `qualified`.
6. Check the **REFERRER's** wallet (NOT the referred user's):
   `SELECT voice_seconds_balance FROM users_memory WHERE user_id = '<referrer>';`
   → expect +120.

Common mistakes that produced false negatives this session:
- Querying the referred user's balance instead of the referrer's.
- Using the production link (`divyavani.co.in?ref=`) while testing on localhost.
- New tab instead of incognito (self-referral).
- Only sending 1 message (threshold is 3).
- Testing while the Vercel build was failing (old code live).

---

## 8. CLEANUP owed once it works (before considering done)

1. Remove the TEMP diagnostic probe from `src/app/api/referral/route.ts`
   (`probeReferralFailure` + the `debug` field in the 503 response).
2. Delete the TEMP route `src/app/api/referral/debug/route.ts`.
3. Rotate the `x-notify-secret` used in `notify_telegram_new_user()` (exposed).
4. Consider a CI check (`tsc --noEmit` on push) so a failed build can't silently
   freeze production on old code again.
5. The `595 minutes` the founder saw earlier was leftover voice-wallet top-up
   balance, NOT referral credit (referral only ever adds even 2-min amounts).
   Not a bug.

---

## 9. Environment / workflow notes

- Windows + PowerShell. `&&` is NOT a valid separator; use `;` or separate calls.
- `git push` prints to stderr which PowerShell flags as an "error" — check the
  final `x..y main -> main` line; that means success.
- Vercel auto-deploys from GitHub `main`. A failing build = old deploy stays live.
- Tests: `npm test` (tsx --test). PBT uses fast-check (dev dep added this session).
- Supabase migrations are MANUAL (paste SQL into SQL Editor). No tooling.
- Founder wants autopilot / no per-command approval (that's a Kiro IDE setting /
  possibly a stray preToolUse hook, not something controllable from chat).
- Commits this session, newest first: b3ee2db, a12b697, ca9b10a, 5bff143,
  0230fd5, 8870c36, 9f80572.
