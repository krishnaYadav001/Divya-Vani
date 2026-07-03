# API Key Incident Playbook

Use this when Anthropic, Gemini, Supabase, Razorpay, Sarvam, ElevenLabs, Sentry,
Loops, Upstash, Google Ads, Meta, or any other production key may have leaked.

## Immediate containment

1. Revoke the suspected provider key first. Do not wait for code changes.
2. Create a new key in the provider console.
3. Update the matching Vercel Production/Preview/Development environment
   variables.
4. Redeploy production. Env changes do not protect a running deployment until a
   fresh deployment uses them.
5. Delete local plaintext exports such as `vercel-env*.txt`.
6. Run `npm run security:secrets`.

## Rotate as a set

If one plaintext env export leaked, assume every value in that export leaked.
Rotate the whole set, not only the key where billing abuse appeared:

- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `SARVAM_API_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_WEBHOOK_SECRET`
- `CUSTOM_LLM_KEY`
- `SENTRY_AUTH_TOKEN`
- `UPSTASH_REDIS_REST_TOKEN`
- Email, ads, analytics, or notification tokens

Public-by-design values such as Sentry DSNs, site URLs, and analytics IDs do not
need the same treatment unless their provider specifically marks them secret.

## Hardening checks

- No server secret may use a `NEXT_PUBLIC_` prefix.
- No plaintext env export files may exist in the repo folder.
- `CUSTOM_LLM_KEY`, cron secrets, webhook secrets, and internal bearer tokens
  should be high-entropy and at least 32 characters.
- Production rate limiting must have `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN` set. Without them, protected routes fail closed.
- The ElevenLabs custom LLM endpoint must receive a real `user_id`; fallback
  identity is no-cost in production.

## Monitoring after rotation

- Check Anthropic usage by key/workspace after the new deploy.
- Watch Vercel logs for `[rateLimit]`, `[agent-llm]`, `[chat]`, and provider
  auth errors.
- Watch for repeated 401s on `/api/agent-llm/chat/completions`; that may mean
  the old `CUSTOM_LLM_KEY` is still configured somewhere.
- If suspicious usage continues after rotation and redeploy, treat the Vercel
  project, GitHub account, local machine, and any copied chat transcripts as
  possible exposure points.
