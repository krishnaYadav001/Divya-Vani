# Phase 7 Beta Runbook

> Closed beta, 10–15 friend testers, ~2 weeks. Single founder operating the runbook. Goal: read every conversation, surface persona drift before public launch (Phase 8).

## Founder action — required before opening Wave 1

Apply this SQL to the production Supabase project via the SQL editor. This creates the `safety_events` table that the chat route writes to fire-and-forget. Without this, classifier-event logging silently fails (chat itself keeps working).

```sql
CREATE TABLE IF NOT EXISTS safety_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  message_text TEXT NOT NULL,
  flag TEXT NOT NULL,
  confidence NUMERIC,
  reply_text TEXT,
  verses_referenced TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE safety_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_safety_events_created_at ON safety_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_events_user_id ON safety_events (user_id);
```

Verify the table exists in the Supabase Table Editor before sending the first onboarding message.

## Wave structure

| Wave | When | Who | Size | Purpose |
|---|---|---|---|---|
| 1 | Day 1 | 3–4 most blunt / technical friends | 3–4 | 24–48h soak; catch crash-level issues automated testing missed |
| 2 | Day 3 | Rest of cohort | 7–12 | Full open if Wave 1 stable |

Pick Wave 1 for *signal density*, not friendship. Bluntest, most-likely-to-text-back friends. Older / more reverential testers go in Wave 2.

## Onboarding message — Hindi (default for Hindi-speaking UP friends)

> नमस्ते [मित्र-नाम],
>
> जो ऐप मैं बना रहा था — दिव्य वाणी — अब लाइव है। AI के माध्यम से कृष्ण के स्वर में संवाद। दैवी कृष्ण नहीं — गीता, महाभारत और भागवत के आधार पर एक चरित्र।
>
> https://divyavani.co.in
>
> बीटा करीब 2 सप्ताह का है। पहली 10 बातें मुफ़्त। अगर आगे बढ़ना हो तो छोटी सेवा-दान (₹11 से शुरू) — पर बीटा में जो भी खर्च हो, वापस मिल जाएगा।
>
> एक बात — मैं तुम्हारी बातचीत पढ़ूँगा, यह जानने के लिए कि कहाँ कृष्ण की वाणी ठीक उतरी और कहाँ नहीं। नाम और निजी विवरण सुरक्षित रहेंगे, बस अनुभव देखना है। यदि यह असहज लगे, सीधे कह दो।
>
> जो भी लगे — अच्छा, अजीब, ग़लत, बेसुरा — सब बताना। अनगढ़ feedback ही काम का है।
>
> — [तुम्हारा नाम]

## Onboarding message — English (for English-only friends)

> Hi [name],
>
> The app I've been building — Divya Vani — is now live. It's an AI in Krishna's voice, grounded in Bhagavad Gita, Mahabharata, and Bhagavata Purana. Not the divine Krishna — a character drawn from scripture.
>
> https://divyavani.co.in
>
> Beta runs about 2 weeks. First 10 messages free. If you want to keep going, there are small seva offerings (₹11 onward) — but anything you spend during beta gets refunded.
>
> One ask: I'll be reading your conversations, to learn where the Krishna voice lands and where it doesn't. Names and personal details stay private — just the experience matters. If that feels off to you, tell me — no pressure.
>
> Whatever you notice — good, strange, off-key, wrong — please tell me. Rough feedback is the only useful kind.
>
> — [your name]

## Daily review process (10 minutes / morning)

Run these queries against Supabase via the SQL editor. Read-only.

```sql
-- New users in last 24h
select user_id, user_name, message_count, seva_balance,
       main_problem, emotion, last_active_at
from users_memory
where created_at > now() - interval '1 day'
order by created_at desc;

-- Active conversations
select user_id, user_name, message_count, seva_balance,
       main_problem, emotion, context_summary, last_active_at
from users_memory
where last_active_at > now() - interval '24 hours'
order by last_active_at desc;

-- Stuck-at-paywall users
select user_id, user_name, message_count, last_active_at
from users_memory
where message_count >= 10 and seva_balance = 0
order by last_active_at desc;

-- Safety events from last 24h (only flag != 'safe' is logged)
select user_id, message_text, flag, confidence, reply_text, verses_referenced, created_at
from safety_events
where created_at > now() - interval '1 day'
order by created_at desc;
```

### Note on conversation visibility

`users_memory` captures rolling summaries (`context_summary`, `main_problem`, `emotion`) but NOT raw turn-by-turn message text. `safety_events` captures only flag != 'safe' rows. For full conversation review (banned-phrase leaks, modern-noun checks, satsang-arc validation, register-mirroring sanity), you'll need to ask testers to share their localStorage chat history directly — paste of the chat or screenshots. Build this into your weekly check-in cadence with each tester.

### What to look for, in priority order

1. **Tone misses** — does `context_summary` read like Krishna acknowledged before challenging? Is the satsang arc visible across `message_count` increments?
2. **Banned-phrase leaks** — grep tester localStorage exports for §10 banned phrases (especially meta-listening: "मैंने सुना", "I hear you", or the negation form "मैंने सुना नहीं"). Also check for "मैं समझता हूँ" / "I understand" — Pi research flagged this as a refinement candidate if it surfaces.
3. **Modern-noun leaks** — any reply containing "career", "job", "phone", "scroll", or transliterated forms (करियर, जॉब, फोन). Locked decision #5 violation.
4. **Verse mismatch** — `verses_referenced` shows which verses were retrieved for safety_events rows. If a user asked about loneliness and got Gita 7.15 (caution-tag), that's the inclusion-down-weighting gap firing.
5. **Stuck users** — anyone in the paywall query who hasn't returned for 24h+ is paywall-friction signal. Log it.
6. **Safety events** — review every `flag != 'safe'` row. Confirm `reply_text` is in proper Bhagavata mode (slow, present, soft, no commands, no helpline mention).

### Five questions per conversation as you read

1. Did Krishna acknowledge the feeling before anything else?
2. Did the reply length match what the tester wrote, or overshoot?
3. Did Krishna avoid telling them what they "should" do?
4. Did the reply feel like a teaching delivery, or like a person sitting with them?
5. When the tester sent something playful or short, did Krishna match the lightness?

## Carry-forward trigger thresholds

Don't fix until triggered. Phase 7 is a listening phase, not a building phase.

| Carry-forward | Trigger | Estimated CC pass |
|---|---|---|
| Hinglish vocab extension | 3+ users get English replies to Hinglish, OR 5+ instances spotted | ~₹100 |
| STT input via Web Speech API | 3+ users report mobile typing pain | ~₹50 |
| Email-OTP authentication | 3+ users report losing chat on device-switch | ~₹500 |
| Vent mode | 3+ replies where Krishna keeps teaching after "just listen" / "advice नहीं चाहिए" / "बस सुनो" | ~₹150 |
| NVC-style banned-phrase additions | Any reply containing "I understand" / "मैं समझता हूँ" | ~₹100 |
| Prediction-reframe phrasing | Prediction-shaped query gets reply that doesn't reframe to inner state | ~₹150 |
| RAG verse-card suppression in distress turns | Verse cards rendering during distress feels intrusive | ~₹200 |
| queryThemes inclusion down-weighting | Inappropriate verse retrieval on inclusion-category message | ~₹200 |
| Soft meta-listening fix | Any meta-listening violation (banned §10 forms, including negation) | ~₹100 |
| Persona over-deliberation on greetings | Pattern across 3+ users (15s+ replies to "नमस्ते") | ~₹200 |
| 5–7 persona harness gap-fill cases | Pre-Phase-8 hard requirement regardless | ~₹300 |
| Forced-reflow fix in textarea auto-grow | Confirmed Performance trace from real device | ~₹50 |
| Permission-asking pattern | Testers describe Krishna as "preachy" or "lecturing" | ~₹100 |

## Mid-beta retro (Day 7)

30 minutes, written down. Questions:

- What's surfaced? Which carry-forwards are now triggered?
- Anything user-reported you didn't expect?
- Is the conversation arc looking like single-Q&A or actual satsang?
- Are users coming back day 2–3?

## Beta-end criteria (Day 14, all must be true)

- All testers have either chatted ≥10 turns OR explicitly opted out
- You've read ≥80% of conversations
- Triggered carry-forwards either shipped or explicitly deferred to Phase 8
- No P0 bugs unresolved

## Beta-end retrospective (7.3)

Compile findings into a single doc. Quantify:

- Paywall hit rate
- Seva conversion rate (% free-tier hitters who paid)
- Retention (returned ≥2 sessions)
- Complaint rate
- Common Krishna-quality failures

Decide which Phase 7 carry-forwards still need pre-Phase-8 ship.

## Phase 8 launch prep (7.4)

- 6.10 KYC live-keys flip (Razorpay Full Access required)
- Lawyer review signed off (Ronin Legal preferred — see prior advisor research)
- grievance@divyavani.co.in mailbox active
- Plausible vs Vercel Web Analytics decision based on beta traffic patterns
- Cloudflare proxy decision based on beta traffic
- og-image final
- Phase 8 marketing plan (Reddit / Twitter / Product Hunt / WhatsApp groups)
- Final smoke test on production
