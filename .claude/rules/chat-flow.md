---
paths:
  - "src/app/api/chat/**/*"
  - "src/lib/messages.ts"
  - "src/lib/supabase.ts"
  - "src/app/components/ChatUI.tsx"
---

# Identity model + Chat turn flow

This rule loads when Claude is touching the chat API, message types, Supabase memory layer, or the ChatUI component. The CLAUDE.md root has only a one-line pointer here.

## Identity model

HTTP-only cookie `god_messenger_uid` (UUID, 1 year, secure in production, sameSite="lax"). Per-browser. Generated on first request.

Optional Supabase email-OTP auth (Phase 5+) for cross-device sync. When the user authenticates, `auth_user_id` is linked to the existing cookie row. Future logins resolve cookie OR auth to the same `user_id`.

## Chat turn flow

1. Client POSTs to `/api/chat` with `{ message }`.
2. Read cookie `god_messenger_uid` or generate a new UUID.
3. `fetchMemory(userId)` reads: `priorCount`, seva state (`seva_balance`, `unlimited_until`), `isFirstTime`, `priorMemory`, `userName`.
4. **Seva paywall guard:** if `message_count >= 10` (free exhausted) AND `seva_balance == 0`, return seva-paywall reply showing the four tier options, no AI call. Otherwise proceed; the eventual write in step 9 decrements `seva_balance` by 1 when the free pool is already spent.
5. Compute `isReturningUser` (12h+ gap), `isFirstTime`.
6. **Embed user message** via `text-embedding-004` (Phase 2+).
7. **Similarity-search** `verses` table → top 5 (Phase 2+).
8. **Three parallel AI calls:**
   - `extractMemory` (Haiku JSON: `main_problem`, `emotion`, `context_summary`).
   - `safetyClassify` (Haiku JSON: `flag` ∈ `self_harm | harm_others | safe`, `confidence`) — Phase 4+.
   - Final reply (Sonnet, system prompt + USER CONTEXT + RELEVANT SCRIPTURE + safety flag context).
9. `saveMemory` writes extraction + `count+1` + name (if newly captured) + `verses_referenced` + activity. Decrement `seva_balance` if applicable.
10. Return `{ reply, verses, paywall, safety_card }`. Set cookie if new user.
