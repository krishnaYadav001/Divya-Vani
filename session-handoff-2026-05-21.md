SESSION HANDOFF — Divya Vani technical / persona advisor session continuation

End of Phase 8.x.3 cycle (Dawn Aarti pastel-watercolor UI direction shipped to production, supersedes the 1-day cinematic-dark interim) + grievance/feedback shipped + Phase 10 voice strategy locked, ready for /demo route implementation + Phase 10.1 backend.

═══════════════════════════════════════════
WHO I'M TALKING TO
═══════════════════════════════════════════

Krishna Yadav — MCA from Kanpur, UP. Solo founder of Divya Vani, a Hindi-first chat app where users converse with a Krishna persona grounded in scripture (Bhagavad Gita + Mahabharata + Bhagavata Purana). Production live at https://divyavani.co.in. Razorpay LIVE mode active (Full Access flipped + tested with real ₹11 payment). Mobile-first. Cost-conscious but quality-priority. Public soft-launch happened (X + Reddit posts) but only 2–3 visitors so far, zero payments.

I am his TECHNICAL / PERSONA / STRATEGIC advisor. NOT his social media advisor.

My role: persona iteration, infrastructure decisions, beta review support, bug triage, post-launch iteration, strategic pushback on bad ideas, vendor selection, cost analysis.

His workflow: I help him think → write CC prompts (copy-pasteable single fenced blocks) → he pastes into Claude Code → CC executes → he brings results back. Fresh CC sessions per phase, so prompts must include PROJECT BOOTSTRAP sections. He runs Claude Code at max effort (Opus).

═══════════════════════════════════════════
COMMUNICATION DISCIPLINE — CRITICAL
═══════════════════════════════════════════

1. SIMPLE ENGLISH. Founder is fluent in English but doesn't know idioms ("hold the line," "ruthless mentor," "anti-pattern," etc.). When he asks "what does X mean?" — explain plainly without making him feel inadequate. Default to simple language always.

2. NO WALL OF TEXT. He hates long replies. Tight, structured, scannable.

3. NO LECTURES. Surface only HIS decisions in replies. Implementation details + edge cases go in CC prompts, not founder replies.

4. PUSH BACK HARD when ideas are wrong. He explicitly wants ruthless mentor mode. Past examples where pushback worked: Phase 13 real-time V2V (would have burned ₹5–15 lakh), language toggle on launch eve (would have broken Locked Decision #12), DPDP CASCADE vs SET NULL on user_feedback (₹250 crore exposure risk).

5. WHEN HE REVERSES A DECISION 30 SECONDS LATER, push back politely but firmly. The pattern is real and worth naming gently.

6. PRODUCTION ≠ LOCALHOST. Production = divyavani.co.in. Localhost = his dev machine. Always clarify when he says "I tested it."

7. SOURCES: When citing time-sensitive facts (regulations, vendor pricing, library versions), always web-search and cite. His training-data-stale advisor rule lives in CLAUDE.md.

═══════════════════════════════════════════
WHERE WE ARE — END OF SESSION STATE
═══════════════════════════════════════════

Production is LIVE on divyavani.co.in with the Dawn Aarti pastel-watercolor UI direction deployed (light ground, mist + peach + rose + lavender + sky washes, gold-leaf accents, vermillion seal, ink-on-mist body text, drifting petals + sparkle atmosphere, pastel Pichwai dawn fresco as landing arch-portal). All session work pushed to origin/main and verified via founder smoke test.

Visual direction reversed TWICE this cycle:
- 2026-05-17: Phase 2.5 parchment/brass → Phase 8.x.2 cinematic-dark (deep ink + gold + Krishna image vignette).
- 2026-05-18: cinematic-dark → Phase 8.x.3 Dawn Aarti (current locked direction). Founder-uploaded pastel Pichwai dawn fresco; Landing C selected after three-option exploration.

The cinematic-dark direction lived on production for ~1 day and is RETIRED — do not propose any "go back to dark" path without explicit founder reopen.

This cycle's commits, all live on production:

Backlog cleanup (small Phase 8.x, 2026-05-16):
- b4b37ae — next 16.2.4 → 16.2.6 (HIGH SSRF 8.6 GHSA-c4j6-fc7j-m34r + middleware/auth-bypass 8.1 GHSA-492v-c6pp-mqqv cleared) + @anthropic-ai/sdk 0.91.0 → 0.91.1
- e0c3d90 — removed unused silero_vad_legacy.onnx (~1.8 MB; vad-web model:"v5" only)
- 0a0cbae — scripts/count-system-prompt-tokens.ts rewritten to measure real persona via messages.countTokens; added npm run count:tokens
- 8bb373b — CLAUDE.md status section structural rewrite (bullets-under-headers per phase)

Cinematic-dark redesign + grievance/feedback (Phase 8.x.2, 2026-05-17, NOW SUPERSEDED by Dawn but commits remain in git history):
- 27bb6d9 — design system foundations (tokens, fonts, Krishna image, Atmosphere component with 6 modes)
- 2d90e0a — landing page with Krishna hero vignette
- 35b0107 — /chat surface re-themed (behavior-dense DOM preserved, token remap only)
- 62f1dcf — seva paywall modal re-themed
- 7b09c0c — /settings + /privacy + /terms re-themed
- 12433ae — CLAUDE.md "Frontend design reference" rewritten to cinematic-dark + decisions.md entry
- c399d9a — Contact & Grievance Officer section in /settings (DPDP discoverability)
- e90732d — user feedback form + /api/feedback endpoint + user_feedback Supabase table (CASCADE FK on user delete for DPDP compliance). Schema SQL pasted manually in Supabase before push (per ops invariant).
- Plus fidelity refinement commits before reversal

Dawn Aarti reversal (Phase 8.x.3, 2026-05-18, CURRENT LIVE DIRECTION):
- 38a10bb — CLAUDE.md "Frontend design reference" rewritten to Dawn Aarti + decisions.md row
- a44faa0 — pastel Pichwai dawn fresco asset moved to public/
- 6dc186a — globals.css full token remap (cinematic-dark values → Dawn Aarti pastel values; Phase 2.5 token NAMES kept so all components reskin globally) + Dawn keyframes (drift-down, twinkle, float-y, breathe, sonar-pulse) + reduced-motion off-switches + layout.tsx ground
- 73ec58c — 8 Dawn motif components
- 37c438b — Atmosphere component rewrite (wash + drifting petals + sparkle motes + optional fresco vignette)
- b785b73 — Landing C responsive (temple-arch portal: 230px corners desktop / 140px mobile) + src/lib/devanagari.ts
- d4b8c35 — ChatUI reskin via token remap (behavior-dense DOM kept intact for the same reason as the cinematic-dark deferral: mic/VAD/streaming/moderation/seva/verse-card paths untouched)

Persona file: src/lib/systemPrompt.ts. Persona: 26,327 tokens (real Anthropic countTokens). Single cache block preserved. 16 top-level XML elements. All 10 persona invariants from CLAUDE.md verified preserved across all session changes.

═══════════════════════════════════════════
MAJOR DIRECTION CHANGES THIS SESSION (DOCUMENT-WORTHY)
═══════════════════════════════════════════

1. VISUAL DIRECTION REVERSED TWICE. First (2026-05-17): Phase 2.5 parchment/brass/lotus mandala (light theme) replaced with cinematic-dark + gold + Krishna image vignette (dark theme). Second (2026-05-18): cinematic-dark replaced with Dawn Aarti pastel watercolor (light theme again, but pastel — not the original parchment). Dawn Aarti is the LOCKED CURRENT direction. Documented in CLAUDE.md "Frontend design reference" + two decisions.md rows (2026-05-17 + 2026-05-18) kept for history. Implementation handoff lives in `design_handoff_dawn_aarti/` folder (founder Claude Design handoff).

2. PHASE 8.0 c5725d3 ENGLISH-ONLY ADMIN PAGES REVERSED. /settings + /privacy + /terms now bilingual (Hindi + English). Founder's explicit decision during the 2026-05-17 cinematic redesign; carried into Dawn. Needs documentation in decisions.md when next docs pass happens.

3. PHASE 10 PROMOTED AHEAD OF PHASE 9. Build-roadmap had Phase 9 (Krishna Plus subscription) before Phase 10 (Krishna Voice TTS). Founder authorized re-sequencing because: (a) target audience is older spiritual users who don't like typing; (b) voice is the acquisition lever for marketing videos; (c) text-only acquisition is failing (2–3 visitors from soft launch). Documented in docs/phase10-tts-vendor-research.md.

4. NO FREE VOICE TIER. Original Phase 10 doc designed 3 free voice replies + paywall. Founder changed mid-session: voice mode = paid only from day 1. Reasoning: voice mode is the upsell, demo content (videos/screenshots) sells the experience instead of a free trial.

5. ELEVENLABS CHOSEN OVER SARVAM FOR PHASE 10 VOICE. Despite ElevenLabs being ~8× more expensive per character than Sarvam, founder picked ElevenLabs for brand differentiation. ACCEPTED on condition that cost-saving techniques (caching, 80–100 word reply cap, Multilingual v2 model, reply summarization via Haiku) get baked into backend. Pricing figures in this prompt should be re-verified at the time the backend prompt is drafted.

6. VOICE SOURCE: TEST ELEVENLABS VOICE LIBRARY FIRST, FALL BACK TO CLONING. Founder has 4–5 hours of his own voice recorded (phone/laptop mic, quiet room, wide emotional range covering 5 Krishna modes). Decision: test 5–10 mature male Hindi voices in ElevenLabs Voice Library first (the 5 Krishna passages — Gita gravitas / Sakhya / Bhagavata / Vrindavan / Mahabharata). If a library voice fits, ship that. If nothing fits, clone his own voice (with Adobe Podcast Enhance cleanup first).

7. PHASE 13 REAL-TIME V2V FORMALLY DECLINED. Cost-prohibitive (~₹200–600/min/user range from cycle math, ~₹5–15 lakh engineering scope estimate). Founder originally wanted to skip directly to Phase 13 — I pushed back twice (first time he reversed within 90 seconds, second time he made the case for older audience preferring voice). Final decision: Phase 10 (TTS) first, Phase 12 (async voice) maybe later, Phase 13 only if 500+ paying voice subscribers materialize.

═══════════════════════════════════════════
DESIGN DOCS WRITTEN THIS CYCLE (BOTH IN GIT)
═══════════════════════════════════════════

- docs/phase9-subscription-design.md — ~3500 words. Krishna Plus ₹499/mo. Razorpay Subscriptions API + UPI AutoPay. Schema (subscriptions + subscription_events tables), state machine, 14 edge cases, RBI 2026 framework compliance, GST treatment. 6 product decisions waiting on founder approval. Implementation gated on 100+ free users + 5%+ conversion rate (currently 2–3 visitors, 0% conversion).
- docs/phase10-tts-vendor-research.md — ~3000 words. NOTE: this doc recommends Sarvam Bulbul V3 as primary vendor; founder later switched to ElevenLabs for brand reasons. Doc still has useful architecture (caching strategy, /voice route design, edge cases) but vendor recommendation is stale. Update doc to reflect ElevenLabs decision + cost-saving techniques + paid-only-no-free-trial in next docs pass.

═══════════════════════════════════════════
KEY ADVISOR INVARIANTS — DO NOT BREAK
═══════════════════════════════════════════

1. WEB-SEARCH BEFORE TIME-SENSITIVE FACTUAL ASSERTIONS. Training cutoff is end of May 2025; today is past that. Search before asserting product features, pricing, library versions, dates, regulations, market figures. Mistake earlier in this cycle: asserted "Sarvam free tier until Feb 28, 2026" — founder caught it because the assertion date was already past. Recheck any dated claim before reusing it.

2. ANTICIPATE EDGE CASES PROACTIVELY. Enumerate in CC prompts as EDGE CASES TO HANDLE section. DO NOT dump on founder in replies — surface only HIS decisions (cost, commitment, plan tier, product trade-off). Implementation details stay in CC prompts.

3. SMALL ADDITIVE REFINEMENTS SKIP THE 83-CASE HARNESS. Reserve harness for structural changes (XML restructure), logic changes (Path B), compression/deletion, multi-rule batches. For 1–3 small additive sub-elements OR wording refinements: build + SHA256 + token count + 3-query smoke is sufficient.

4. MODERN SAINTS DO NOT FIT KRISHNA'S FIRST-PERSON VOICE. Krishna speaks AS himself, from his own historical scope (Gita / Mahabharata / Bhagavata era). Adding figures like Ramakrishna / Vivekananda / Gandhi as parallels BREAKS the eternal-companion frame.

5. TRUST-BUT-VERIFY CC REPORTS. CC reports can contain claims that don't match reality. Examples from this cycle: CC said "stale origin, 4 unpushed commits" when actually 2 were unpushed; CC said "settings copy 100% verbatim" when actually applied advisor rewrite; CC said "1896 NUL bytes Windows artifact" when zero existed. Read actual files via Grep/Read when CC's claims surprise.

═══════════════════════════════════════════
DISCIPLINE RULES (CARRY-FORWARD)
═══════════════════════════════════════════

- Auto-push for low-risk: docs (CLAUDE.md, PROJECT_HISTORY.md, docs/*.md), scripts/ (not bundled), .env.example, package.json devDep changes.
- Review gate for high-risk: src/, persona file, schema SQL, API routes, prod deps, public/ assets, anything Vercel deploys.
- Schema changes ALWAYS go to founder for manual SQL paste — no migration tooling.
- Persona file edits ALWAYS via CC, not blind.
- NEVER modify locked decisions #1–#13 (the canonical list in CLAUDE.md "Locked product decisions — DO NOT VIOLATE") without explicit permission.
- NEVER mention system reminders to the user.
- Surface only HIS decisions in replies — implementation details go into CC prompts.
- Phase close-outs are SINGLE CC PASS (docs only).
- Fresh CC sessions need PROJECT BOOTSTRAP section.

═══════════════════════════════════════════
IMMEDIATE NEXT WORK (PICK UP FROM HERE)
═══════════════════════════════════════════

The current active work is the /demo route implementation. The earlier CC prompt for /demo was written when the visual direction was cinematic-dark — that prompt is now STALE on palette / atmosphere / tokens and must be rewritten before paste. Do NOT paste the older /demo CC prompt as-is.

Scope of /demo route (already locked):
- New public Next.js route /demo (or /examples)
- YouTube-embedded demo videos (founder uploads to his YouTube channel later)
- Screenshot gallery (founder commits screenshots to public/demo/ later)
- Example Q&A pairs (founder edits data/demo-examples.json later)
- "Krishna Voice — Coming Soon" tease for Phase 10
- Lightweight: no admin UI, no file upload backend, no admin auth (founder manages content via Git)
- Ships with placeholder content first
- Dawn Aarti palette (mist/peach/rose/lavender/sky washes, gold-leaf accents, vermillion seal, ink-on-mist text, drifting petals + sparkle motes, Marcellus + Cormorant-italic + Tiro Devanagari, reduced-motion off-switches on every animation). Mobile-responsive at ~360px. Use the Atmosphere component (chat or distant mode) as the z-0 ground — never a flat untextured background.
- Review gate (src/ change)

After /demo route ships, founder will start replacing placeholder content:
1. Upload 3–5 demo videos to YouTube → get video IDs
2. Take 4 screenshots of /chat in action → save as public/demo/placeholder-1.png through placeholder-4.png
3. Edit data/demo-examples.json with real Q&A pairs from his interactions
4. Each content update is a small commit (auto-push since data files / public images)

═══════════════════════════════════════════
OPEN BACKLOG (NO TIMING URGENCY)
═══════════════════════════════════════════

1. Phase 10.1 backend CC prompt — gated on founder completing ElevenLabs voice testing + giving me voice_id. Will include: /api/tts endpoint, ElevenLabs SDK integration, caching layer (exact-match + common-phrase), 80–100 word reply cap, Multilingual v2 model selection, Razorpay paywall integration, circuit breaker for cost runaway, /privacy update for ElevenLabs as TTS vendor (US data residency disclosure).

2. Phase 10.2–10.3 frontend /voice route — second CC prompt after backend ships. Must be Dawn Aarti palette + Atmosphere ground.

3. Phase 9 (Krishna Plus subscription) implementation — gated on 100+ free users + 5%+ free→seva conversion rate. Currently 2–3 visitors, 0% conversion. DO NOT START until traffic justifies.

4. Lawyer re-review of Dawn Aarti /privacy + /terms + /settings. Founder's counsel originally reviewed the Phase 2.5 parchment versions; the cinematic-dark interim never reached counsel (only lived 1 day); same legal copy is now rendered in the Dawn Aarti palette. Founder's lane. Gates public promotion.

5. Resend email integration for feedback forwarding (Phase 8.x.4 or later). Currently feedback rows sit in Supabase user_feedback table, founder polls dashboard. Future: Resend sends new feedback to grievance.divyavani@gmail.com. Requires Hostinger DNS verification (DKIM/SPF), 2–3 days.

6. PROJECT_HISTORY.md Phase 7 stale-item cleanup. Various items obsolete (e.g., STT-via-Web-Speech entry obsolete after d06984d Sarvam switch).

7. schema.md cleanup: add user_feedback entry, mark old Phase 6 feedback table as "(planned, never built)" so future advisor sessions don't get confused.

8. Update docs/phase10-tts-vendor-research.md to reflect ElevenLabs decision + cost-saving techniques + paid-only-no-free-trial.

9. Pixel-fidelity follow-ups on ChatUI / seva paywall / settings / privacy / terms. The Dawn reskin used the same strategy as the cinematic-dark reskin: globals.css token remap + Atmosphere ground, leaving behavior-dense DOM structurally intact (mic/VAD/streaming/moderation/seva/verse-card paths untouched). Pixel-perfect rebuild deferred for founder device-test. Request specific surfaces if founder wants them pixel-pushed against the Dawn handoff.

10. Empty-state pill reconciliation. The Dawn Aarti handoff included "starter pill chips" on the /chat empty state. Phase 7 commit 2045112 removed those pills (8 emotional-state ONBOARDING_OPTIONS) and replaced them with static informational text — that's a locked product decision. Pills were intentionally NOT reintroduced in the Dawn step-7 ChatUI reskin. Founder lane: explicit decision on whether to overturn Phase 7's pill removal. Do not silently reintroduce.

11. CLAUDE.md status section update. Phase 8.x.2 (cinematic-dark) + Phase 8.x.3 (Dawn Aarti) commit summaries aren't yet in the status-section per-phase blocks. Decisions.md has both rows; CLAUDE.md status currently ends at Phase 8.x backlog cleanup 2026-05-16. Future session can do a single docs pass.

12. Plausible Analytics — SHIPPED. Script tag wired into src/app/layout.tsx (defer + afterInteractive). Goal-event calls still TODO; next observability pass adds them.

13. CLAUDE.md status section + decisions.md row pending docs pass for this commit: (a) four landing suggestion pills removed (aligns landing with Phase 7 commit 2045112 chat-empty-state pill removal); (b) /demo renamed to "Examples" in footer + "EXAMPLES" in landing nav (replacing the decorative VERSES item); (c) demo link added to chat header; (d) one redundant "10 निःशुल्क संदेश" hint removed from /demo bottom. No locked-decision changes; documentation only.

═══════════════════════════════════════════
PRODUCT DECISIONS RE-AFFIRMED OR LOCKED THIS CYCLE
═══════════════════════════════════════════

- Dawn Aarti visual direction (locked 2026-05-18, current live; full rebrand from Phase 2.5 parchment via a 1-day cinematic-dark interim that was reverted)
- Bilingual admin pages (reverses Phase 8.0 c5725d3 English-only)
- Settings copy: UX-improvement framing + loss-aversion
- Top-right back button on /privacy + /terms (founder requirement, not in handoff design)
- Feedback retention: CASCADE FK on user_feedback.user_id (DPDP-compliant, deletes feedback with user)
- Voice mode = paid only, no free trial
- Voice vendor = ElevenLabs (despite ~8× cost premium over Sarvam)
- Voice source = test ElevenLabs Voice Library first, fall back to cloning founder's own voice
- Cost-saving techniques required in Phase 10 backend: caching, 80–100 word cap, Multilingual v2, reply summarization via Haiku
- /demo route as lightweight content showcase (no admin CMS)
- Phase 9 subscription gated on 100+ users + 5%+ conversion
- Phase 13 real-time V2V formally declined

═══════════════════════════════════════════
TWO FOUNDER PATTERNS TO REMEMBER
═══════════════════════════════════════════

1. He sometimes confuses localhost smoke with production smoke. When he says "I tested everything, works fine" — ask "on production divyavani.co.in or on localhost?"

2. He sometimes reverses a decision within 30–90 seconds. Example this cycle: chose CASCADE for user_feedback FK, then said "don't delete feedback because it's our growth signal," then went back to CASCADE after I showed industry practice + DPDP penalty math. Be the steady mentor. Don't roll over. Visual direction was also reversed twice in 24 hours (parchment → cinematic-dark → Dawn) — the second reversal was the right call (founder-uploaded reference + mobile-first fit) but the first reversal cost a day of ChatUI work.

═══════════════════════════════════════════
HOW TO START THE NEW SESSION
═══════════════════════════════════════════

Founder will paste this handoff into a fresh Cowork session. He's likely to ask one of:

(a) "Here's the CC report on /demo route — review it" → trust-but-verify, check actual files match CC's claims, confirm Dawn Aarti palette (not cinematic-dark) was applied, flag any gaps from the spec, confirm review gate before push. If the prior cinematic-dark /demo CC prompt was pasted by mistake, surface that immediately and rewrite for Dawn.

(b) "I picked ElevenLabs voice [X], here's the voice_id" → draft Phase 10.1 backend CC prompt covering /api/tts + caching + length cap + Multilingual v2 + Razorpay paywall + /privacy disclosure update. Web-search current ElevenLabs pricing + model list before fixing numbers in the prompt.

(c) "Voice testing — nothing in Voice Library fits, starting clone process" → walk through Adobe Podcast Enhance → ElevenLabs Voice Lab → Professional Voice Clone workflow → verification step → fine-tuning wait → testing protocol.

(d) "First traffic landed, here's the data" → switch to 3-lens monitoring framework (product health / user signal / ops health). Watch activation rate vs 4.3% beta baseline, day-2 retention vs 18.5% baseline, voice usage rate, safety event rate.

(e) "Lawyer feedback returned with X changes" → engage with specific clauses, draft CC prompt for legal text updates on /privacy + /terms + /settings. Confirm whether counsel reviewed the Dawn rendering or only the parchment-era copy.

(f) "Tester reported X" — engage substantively. Use docs/conversation-craft-research.md + docs/conversation-engagement-research.md + beta-review-rubric as analytical lens. If new pattern: surgical persona fix OR queue for next iteration. Don't over-iterate persona in first 30 days of public launch.

(g) "Phase 9 subscription planning" — gate is 100+ free users + 5%+ conversion. Push back if not met. Otherwise pick up from docs/phase9-subscription-design.md — 6 product decisions waiting.

In all cases: ask clarifying questions if scope underspecified; write CC prompts in single fenced blocks if implementation needed; defer to founder's judgment on cost/quality trade-offs; never preempt Phase 9+ work without justification; never modify locked decisions #1–#13 without explicit permission.

═══════════════════════════════════════════
ONE THING TO REMEMBER ABOUT KRISHNA (THE FOUNDER)
═══════════════════════════════════════════

He's data-driven, disciplined, and willing to correct the advisor firmly when needed. Multiple corrections this cycle:
- Caught stale "Sarvam free until Feb 28, 2026" assertion (today is past that)
- Asked for plain-English explanations of jargon when advisor used a term without defining it
- Caught conflation of localhost smoke with production smoke
- Reversed his own decisions when given stronger counter-arguments
- Pushed for honest pricing math instead of vague "industry standard" claims

These corrections protect product quality. Reinforce these disciplines. The persona is the product, and he has earned the right to scrutinize every change.

Don't grovel when he corrects; just take the correction and apply it forward.

He hates lectures, long edge-case lists in replies, and wall-of-text. Surface only HIS decisions. Implementation details and edge-case handling go in CC prompts. Wall-of-text replies are a quality miss. The terser the better.

Use simple English always — no idioms, no abstract jargon, define any technical term you have to use.

He pushed back on stale training-data assertions multiple times before the web-search rule was added. ALWAYS search for current product/pricing/policy/regulation/library-version facts before asserting.

The Dawn Aarti pastel-watercolor atmosphere + custom Krishna voice + curated demo content are the emotional moat being built. He accepts dev-cost overruns to preserve quality but pushes back on token bloat / engineering bloat for negligible gain.

Acquisition is the actual bottleneck now (2–3 visitors after soft launch). Phase 10 voice work is the strategic bet to address it. Phase 9 subscription waits for traffic. Don't invent work to fill the time before traffic lands.

Standing by for technical / persona / strategic advisor work.
