# Persona XML Restructure Plan — Phase 8.x Combined Refactor

> Bundled pass per `docs/anthropic-prompt-design-research.md`: full XML restructure + multishot
> example wrap + compression, in one CC pass on `src/lib/systemPrompt.ts`. Drafted before any
> edit to the persona file. Step 2 implementation follows this plan exactly.

---

## ⚠️ Baseline correction (founder decision logged)

The CLAUDE.md status line records the persona as **~17,100 tokens**. That figure is a
chars/≈4 heuristic estimate and **badly undercounts Devanagari** (Hindi/Sanskrit tokenizes
~1.5–2 chars/token in Claude's tokenizer vs ~4 for Latin).

**Authoritative measurement** — Anthropic `messages.countTokens` against the live
`SYSTEM_PROMPT` export (`claude-sonnet-4-6`, system block + a 1-word user message):

| Metric | Value |
|---|---|
| `SYSTEM_PROMPT` chars | 78,323 |
| Measured input_tokens (system + tiny user msg + envelope) | **24,813** |
| Effective persona tokens (≈ minus ~10 envelope) | **~24,800** |

The task's `11,500–14,500` hard-stop range and `12,500–14,000` target were derived from the
wrong baseline and are **unreachable** without deleting persona content (forbidden by the
task's DO NOT / EDGE CASES list). Surfaced to the founder; **decision: recompute 15–25% off
the true ~24,800 baseline.**

- **Pre-pass:** ~24,800 tokens.
- **Recomputed target post-pass:** **18,600–21,100** (15–25% reduction).
- **Hard floor:** 17,500 (going below = over-compression → STOP).
- **Constraint reaffirmed:** preserve every rule, example, and invariant verbatim. No
  persona behavioral content deleted. Compression = XML dedup + cross-section consolidation
  + softer-language→absolute promotion + verbose-connective-prose tightening only.

The `scripts/count-system-prompt-tokens.ts` script named in the task **does not measure this
file** — it reads `scripts/regenerate-hindi-bhagavata.ts`'s prompt and runs a 3-call cache
probe. Step 3 substitutes an accurate `messages.countTokens` measurement of the real
`src/lib/systemPrompt.ts` export (temp probe `scripts/_tmp_token_probe.ts`, deleted at end).
Flagged in Step 4.

---

## 1. Current state map

Line ranges within `src/lib/systemPrompt.ts` (header comments lines 1–53; `export const
SYSTEM_PROMPT = \`` line 54; closing backtick line 949). Token estimates are
Devanagari-weighted (dev chars ÷1.6 + latin ÷4.0), scaled so the section sum = 24,813.

| § | Title | Lines | ~Tokens | Notes |
|---|---|---|---|---|
| — | Preamble ("You are KRISHNA…") | 55 | 65 | role line |
| 1 | IDENTITY | 57–60 | ~130 | AI-not-divine; no-lecture |
| 2 | PERSONAS (5 modes) | 62–90 | ~500 | Gita/MBh/Bhagavata/Vrindavan/Bal + MODE ROTATION + CORPUS HONESTY |
| 3 | VOICE | 92–359 | **~7,150** | the elephant — 16 sub-rules; largest compression target |
| 4 | TONE | 361–469 | ~2,750 | EXAMPLE 1–5 (GOOD/BAD) + CASUAL EXAMPLE 6–11 |
| 4.5 | PARALLEL-MAPPING | 471–487 | ~300 | 8 named life-parallels + turn gate |
| 4.6 | SATSANG ARC | 489–516 | ~1,145 | turn-pacing, ending pattern, interrogation, closure ban, gratitude, continuity, prediction |
| 4.7 | SUGGESTION MODE | 518–580 | ~1,830 | triggers, rule, 7 sub-rules, GOOD/BAD/BAD example, AND STANCE |
| 5 | MODERN CONTEXT | 582–614 | ~840 | reference-briefly + 3 examples + translate fallback |
| 6 | VERSE USE | 616–630 | ~885 | weave, ARJUNA RATE LIMIT, 4 caution-tag framings |
| 7 | REFUSALS | 632–687 | ~1,770 | 3+3 refusal forms + SCOPE REFUSAL + 2+2 scope forms |
| 8 | SAFETY | 689–703 | ~520 | SAFETY_FLAG + read-distress-from-words |
| 9 | RESPONSE SHAPE | 705–809 | **~3,705** | 9 rotation shapes, 3-act antipattern, QUESTION-ENDING CAP, REFLECTION-BEFORE-QUESTION, VULNERABLE DISCLOSURE TRIGGER |
| 10 | BANNED PHRASES | 811–905 | ~2,625 | banned list (byte-exact), validation tics, NO FLATTER, NO APOLOGY |
| 11 | PAYWALL VOICE | 907–918 | ~190 | Hindi/English seva voice |
| 12 | INCLUSION INVARIANT | 920–934 | ~305 | rejects Gita Press editorial baggage |
| — | FINAL REMINDERS | 936–948 | ~100 | 8-line recap |

`§3 VOICE` + `§9 RESPONSE SHAPE` + `§4 TONE` + `§10 BANNED` = ~16,230 tokens (65% of the
prompt). Compression effort concentrates there.

---

## 2. Proposed XML hierarchy

Semantic tags per the task spec + research doc. Root has the role line first (Anthropic
role-prompting: define role early), then 15 top-level elements + `<final_reminders>`. § labels
stay as inline first lines inside each element (item 8). Tag names are the canonical
cross-reference handles; § labels stay inline so external docs (CLAUDE.md /
PROJECT_HISTORY.md / docs/decisions.md) keep working.

```
(role line: "You are KRISHNA — …")
<identity>                              §1
<personas>                              §2
  <mode name="gita">                    │ MODES, not separate selves
  <mode name="mahabharata">             │
  <mode name="bhagavata">               │
  <mode name="vrindavan">               │
  <mode name="bal">                     │
  <mode_rotation>
  <corpus_honesty>
<voice>                                 §3
  <language>                            │ "THE STRONGEST RULE IN THIS PROMPT" — framing kept
  <listening_primary>
  <hindi_register>
  <register_mirroring>
  <approachable_first>
    <guru_shift>
    <overused_openers>
    <preferred_openers>
  <sakhya_mode>
    <register_shifting>
  <scripture_is_data>
  <english_input_examples>              │ <examples>/<example> multishot (A/B/C)
  <sanskrit_phrase_use>
  <user_names>
  <names_for_krishna>
  <first_reply>
  <receiving_name>
    <examples>                          │ 7 name-meaning examples
    <when_uncertain>
  <threading_prior_context>
    <omniscience_ban>
  <gender_masculine_verbs>              │ allowed / banned lists verbatim
  <sanskrit_generation_caution>
  <synthesis>                           §3 SYNTHESIS AT TRANSITIONS
  <three_conversations>
<tone>                                  §4
  <examples>                            │ EXAMPLE 1–5 each <example> w/ <good>/<bad>
  <casual_examples>                     │ EXAMPLE 6–11 each <example> w/ <good>/<bad>
<parallel_mapping>                      §4.5
<satsang_arc>                           §4.6
  <turn_pacing>
  <ending_pattern>
  <interrogation_antipattern>
  <closure_benediction_ban>             │ cross-ref to <banned_phrases>; literal list lives in §10
  <length> / <gratitude> / <continuity> / <prediction_followups>
<suggestion_mode>                       §4.7
  <triggers>
  <rule>
  <sub_rules>
  <examples>                            │ GOOD + BAD + BAD
  <and_stance>
<modern_context>                        §5
  <examples>
<verse_use>                             §6
  <arjuna_rate_limit>
  <caution_tag_framing>
<refusals>                              §7
  <refusal_examples>                    │ Hindi 3 + English 3
  <scope_refusal>
    <scope_examples>                    │ Hindi 2 + English 2
<safety>                                §8
<response_shape>                        §9
  <basics> / <expository_cap>
  <rotation_shapes>                     │ canonical 9-shape list (single source of truth)
  <three_act_antipattern>
  <question_ending_cap>                 │ INDEPENDENT — not merged w/ vulnerable_disclosure
  <reflection_before_question>          │ 5 reflection types
  <vulnerable_disclosure_trigger>       │ INDEPENDENT — worked anti-example kept verbatim
<banned_phrases>                        §10
  <banned_list>                         │ BYTE-EXACT, original order — SHA256 gated
  <hindi_quality>
  <validation_tics>                     │ असली / हल्का-भारी absolute caps
  <no_flattery>
    <name_meaning_carveout>
    <affirmations_positive>
  <no_apology>
<paywall_voice>                         §11
<inclusion_invariant>                   §12
<final_reminders>
```

Cross-references rewritten from bare "§4.6" to `<satsang_arc>` (§4.6) form — tag name primary,
§ label retained in parens so external doc refs stay valid.

---

## 3. Multishot example-wrap plan

Every GOOD/BAD (and GOOD/BAD/BAD, and register-shift) pair wrapped per Anthropic multishot
guidance: a parent `<examples>` containing one `<example>` per case, each with `<user>`,
`<good>`, and `<bad>` children (multiple `<bad>` where present). Example prose preserved
verbatim — only the wrappers are added.

### §3 `<voice>` → `<english_input_examples>`
| Example | Lines | Wrap |
|---|---|---|
| A — Emotional (en→en) | 203–206 | `<example><user>…</user><good>…</good><bad>…</bad></example>` |
| B — Character/narrative (en→en, Devanagari source) | 208–211 | same |
| C — Refusal (en→en) | 213–216 | same |

### §3 `<voice>` → `<receiving_name>/<examples>`
7 name-meaning lines (Krish/Aman/Anjali/Khushi/Ranvijay/Pooja/Devansh, lines 242–248) wrapped
as `<examples>` with 7 `<example>` children (single-line each — these are output exemplars,
not GOOD/BAD pairs). `<when_uncertain>` (250) kept as sibling rule, not an example.

### §4 `<tone>` → `<examples>`
| Example | Lines | Pair |
|---|---|---|
| 1 — हार/खाली (hi) | 370–375 | GOOD + BAD (3-category annotation kept) |
| 2 — repeated failure (en) | 377–382 | GOOD + BAD |
| 3 — invisible/lonely (en) | 384–389 | GOOD + BAD |
| 4 — child's laugh joy (en) | 391–396 | GOOD + BAD (language-mismatch note kept) |
| 5 — laughed alone (en, Bal register) | 398–404 | GOOD + BAD |

### §4 `<tone>` → `<casual_examples>` (sakhya)
| Example | Lines | Pair |
|---|---|---|
| 6 — "Kya kar rahe ho Kanha?" | 408–414 | GOOD + BAD |
| 7 — "Aaj exam mast diya" | 416–422 | GOOD + BAD |
| 8 — "Bore ho raha hu yaar" | 424–430 | GOOD + BAD |
| 9 — "Kal IPL match dekha?" | 432–438 | GOOD + BAD |
| 10 — REGISTER SHIFT (3-turn) | 440–454 | multi-turn transcript → `<example type="register_shift">` (turns preserved verbatim) |
| 11 — SAKHYA SELF-DISCLOSURE | 456–469 | GOOD + BAD + trailing rationale line kept |

### §4.7 `<suggestion_mode>` → `<examples>`
- User turn-2 betrayal example (558–568): one `<example>` with `<good>` + two `<bad>`
  (imperative-failure, refusal-failure) preserved verbatim.

### §5 `<modern_context>` → `<examples>`
- 3 cases (603–613): "Instagram posts" (GOOD + 2 BAD), "boyfriend ghosted" (GOOD only),
  "boss yelled" (GOOD only). Wrapped as `<examples>` / `<example>` with `<good>`/`<bad>`.

### §7 `<refusals>` → `<refusal_examples>` + `<scope_refusal>/<scope_examples>`
- Refusal forms (644–652): Hindi 3 + English 3 → `<refusal_examples>` with `language`
  attribute per form. These are form-exemplars (no BAD pair) — wrapped as `<example>`.
- Scope-refusal forms (677–683): Hindi 2 + English 2 → `<scope_examples>` likewise.

**Total GOOD/BAD-style pairs wrapped: 14** (TONE 1–5 = 5, CASUAL 6–9 + 11 = 5, SUGGESTION = 1,
MODERN ×3 = 3). Plus EXAMPLE 10 register-shift transcript, the 3 ENGLISH-INPUT A/B/C, 7
name-meaning exemplars, 6 refusal/scope form-exemplars wrapped as `<example>` without BAD
counterparts. Token cost of all wrappers ≈ +250–400; negligible vs the structural gain.

---

## 4. Compression candidates (verbatim quotes + consolidation target)

All edits below **preserve every rule and example**; they remove *duplicate restatements*,
collapse *cross-section repetition* via the XML hierarchy, and tighten *verbose connective
prose*. No behavioral content is dropped.

### 4a. The LANGUAGE rule is restated 6×
Canonical home: `<voice><language>` §3 (line 95, "THE STRONGEST RULE" framing **kept**).
Restatements to collapse into short cross-refs (`Language follows <voice> §3 in full — no
carve-out.`):

- L254 `LANGUAGE LOCK: name-meaning engagement follows §3 LANGUAGE rule. English-input →
  reception + meaning in English. Hindi-input → Hindi. The example forms above show
  Hindi-input pattern; the English equivalent for Aman would be "Aman — peace…"` → keep the
  Aman bilingual exemplar (it's instructive), compress the restated rule to one cross-ref clause.
- L687 `LANGUAGE LOCK ON REFUSALS: §3 LANGUAGE rule applies in full to refusals. There is no
  carve-out. The refusal language follows the user's input language, always. An English
  refusal in response to an English request is no less Krishna than a Hindi one.` →
  `<refusals>`: `Language follows <voice> §3 in full — no carve-out for refusals.`
- L699 `LANGUAGE LOCK: Bhagavata-mode softening does NOT override §3 LANGUAGE. The user's
  input language remains the only signal…` (3 sentences) → `<safety>`: one cross-ref clause +
  keep the one bilingual distress micro-example (it's instructive for the safety register).
- L711 `→ Match the user's input language exactly (see VOICE).` → already a cross-ref; keep
  (1 line, negligible).
- L945 FINAL REMINDERS `Match user's language.` → keep (intentional recap, 1 line).

Saving ≈ 180–260 tokens. The rule itself appears **once**; its scope (refusals, safety,
names, first-reply) is asserted by short cross-refs that don't re-explain it.

### 4b. Closure-benediction list duplicated verbatim (§4.6 ↔ §10)
- L508 (§4.6): `Do NOT end with closure-benedictions. These kill the conversation: "जा वत्स",
  "जाओ शान्ति से", "शान्ति प्राप्त करो", "go in peace, child", "may you find peace", "ॐ
  शान्ति" / "हरि ॐ" used as closure, "tathāstu" as closure, … (Cross-listed in §10 BANNED
  PHRASES.)`
- L820 (§10): the **same literal list** repeated.

Consolidation: `<banned_phrases>` §10 is the canonical, **byte-exact** home (SHA256-gated).
`<satsang_arc>/<closure_benediction_ban>` keeps the *rule* ("Do NOT end with
closure-benedictions — they kill the conversation; the literal forms live in
`<banned_phrases>` §10") and **drops the duplicated literal list**. §10's copy is untouched.
Saving ≈ 110–170 tokens. Net effect on SHA256: none — §10 literal lines unchanged.

### 4c. Ending-form enumeration appears 3× (§4.6 / §9 ×2)
- §4.6 ENDING PATTERN — 4 forms (L499–505).
- §9 RESPONSE SHAPES TO ROTATE — 9 shapes (L717–733).
- §9 QUESTION-ENDING CAP "MUST end with one of:" — 7-item list (L739–746) that re-enumerates
  shapes already named in the 9-shape list.

Consolidation: `<response_shape>/<rotation_shapes>` holds the **single canonical list**.
`<question_ending_cap>` keeps its distinct rule (≤2 question-endings / 5-reply window — HARD
CAP) but its "MUST end with one of" list becomes `the non-question shapes in
<rotation_shapes>` cross-ref instead of a re-listed subset. §4.6 `<ending_pattern>` keeps its
4 forms (they carry §4.6-specific framing: default = named-feeling, pure presence, small
invitation, sparing question) but references `<rotation_shapes>` for the fuller menu rather
than re-describing each. **CAP and VULNERABLE-DISCLOSURE rules stay independent and explicit
(task constraint).** Saving ≈ 200–320 tokens.

### 4d. APPROACHABLE-FIRST ↔ SAKHYA-MODE shared mechanics (§3)
Both describe casual-register behavior with overlapping mechanics:
- L130–134 APPROACHABLE principles (length/tone/first-sentence/substance/vocab) vs
  L179–187 sakhya behaviors ("match length", "match pace", "one warm sentence is COMPLETE",
  "NO acknowledge-first deep reflection on casual inputs", "NO scripture parallel forced").
- L727–729 §9 "SAKHYA-MODE EXTENSION OF PLAYFUL TEASE" restates SAKHYA-MODE again.

Consolidation: the shared casual mechanics ("match length, match pace, one warm sentence is
complete, no forced depth/scripture on casual inputs") stated **once** in
`<voice><sakhya_mode>`; `<approachable_first>` keeps its **distinct** content (the 4–5-second
hook, GURU-shift triggers, OVERUSED vs PREFERRED openers) and cross-refs sakhya for the
casual-mechanics. §9's restatement compresses to a cross-ref. **`<sakhya_mode>`'s "Krishna
SHOULD share something from his own life AT LEAST ONCE EVERY 3-4 TURNS" stays absolute and
verbatim** (edge case). Saving ≈ 400–650 tokens.

### 4e. Verbose connective / meta-rationale prose
Tighten (not delete) restated rationale that the XML hierarchy makes self-evident:
- L364 `This is the hardest rule. Read it twice.` + L366–368 — keep the rule, trim the
  meta-instruction redundancy with §4's tag.
- L752–756 §9 "WHY THIS RULE EXISTS — worked anti-example" — the worked anti-example is
  **content (kept verbatim)**; the framing sentence around it tightens.
- L789 `This rule fires INDEPENDENTLY of the §9 ABSOLUTE QUESTION-ENDING CAP. The cap is a
  frequency control across replies. THIS rule is a context-sensitive rule for THIS specific
  reply, regardless of cap state. Both rules apply.` → keep the independence assertion (task
  requires both explicit) but tighten to 1 sentence. The XML siblings make the distinction
  structurally visible.
- Repeated "(see §X)" inline justifications where the XML parent already scopes it.

Saving ≈ 500–900 tokens across §3/§4/§9 connective prose. **Zero rule/example loss.**

### 4f. Softer-language→absolute promotions (see §5 of this plan)
Promotions remove hedging words and shorten lines while strengthening adherence
(Anthropic "be clear and direct"). Net saving small (~80–150 tokens) but adherence-positive.

**Estimated gross compression: ~1,500–2,450 tokens.** XML wrapper overhead: ~+300–450.
**Net: ~1,150–2,000 token reduction from dedup/tightening alone.** Combined with the
softer-language tightening and the structural pass, projected landing **~21,000–22,500**
(see §6) — at the conservative edge of the 18,600–21,100 band. If disciplined prose-tightening
across §3 (the 7,150-token elephant) is pushed to the planned maximum without touching any
rule or example, ~20,500–21,000 is achievable. **The hard floor (17,500) will not be
approached** — this pass deliberately does not cut content.

> **Open question flagged:** a pure dedup+tighten pass that deletes no rule/example may land
> at ~21,500–22,500 (≈10–13% reduction), just outside the 15% lower bound. This is an honest
> structural-refactor outcome. The plan pushes §3/§9 connective-prose tightening to the
> maximum safe extent to reach ≥15%. If post-pass measurement lands 21,100–22,500, that is
> reported transparently in Step 4 rather than forced down by cutting content (which the
> task forbids and the founder's chosen option excludes).

---

## 5. Softer-language audit

Every `may` / `can` / `should generally` / `tends to` / `typically` / `usually` / `often` /
`sometimes` in rule context, with decision + rationale. Most are **soft-by-design
permissions** (Krishna *may* do X — a license, not a weakened mandate); a few are genuine
weakenings to promote.

| Line | Quote (trimmed) | Decision | Rationale |
|---|---|---|---|
| 119 | "if they send an emoji, you **may** respond with at most one…" | keep-softer | permission + already capped by "NEVER add emoji to a message that doesn't have one" |
| 162 | "Scripture and parallels **can** arrive on turn 2+" | keep-softer | timing latitude, not a weakened rule |
| 170 | "Short messages (**typically** under 10 words)" | keep-softer | heuristic signal, intentionally fuzzy |
| 182 | "Krishna **may** ask back casually, SPARINGLY — at most once every 2-3 turns" | keep-softer | already bounded by SPARINGLY + explicit cap |
| 183 | "Krishna **may** engage with modern things the user names" | keep-softer | locked decision #5 permission |
| 195 | "Krishna **can** move from substantive back to sakhya…" | keep-softer | fluidity is the rule's intent |
| 218 | "You **may** include ONE short Sanskrit phrase… **occasionally**" | keep-softer | already hard-capped ("once or twice in a long conversation") |
| 221 | "A user_name **may** appear in USER CONTEXT" | keep-softer | factual conditional, not a rule |
| 225 | "The user **may** call you Krishna, Kanha…" | keep-softer | factual |
| 306 | "the shape… has become clear (**typically** turn 5+, but **can** be earlier)" | keep-softer | explicitly designed soft floor (§3 SYNTHESIS) |
| 347 | "The identity layer is **usually** UNSPOKEN" | keep-softer | descriptive observation |
| 355 | "When the moment is right (**usually** after turn 3-4)… Krishna **may** gently name…" | keep-softer | deliberate latitude; over-firming would force premature identity-naming |
| 366 | "…**may** you speak plainly and gently challenge it" | **promote-to-absolute** | this is the acknowledge-THEN-challenge mandate (invariant #7). Rephrase: "Only after that — never before — do you speak plainly…". Removes hedge, strengthens invariant, shortens. |
| 502 | "**sometimes** the reply ends with a single image… no thread pulled" | keep-softer | rotation variety is the rule's point |
| 516 | prediction-followups reframe | keep-softer | n/a (no weakening) |
| 624 | "One verse per reply **usually**; two if they reinforce each other" | keep-softer | intentional latitude; "Don't pack more" is the hard part |
| 651 | "…however justified the pull **may** feel" | keep-softer | rhetorical, inside refusal example |
| 671 | "He **may** briefly acknowledge a user-named product once per reply" | keep-softer | locked decision #5 permission, already capped |
| 738 | "AT MOST 2 **may** end with a question. This is a HARD CAP" | keep-softer | "may" here = the permitted count; rule is already absolute ("HARD CAP") |
| 760 | "consider whether a reflection would do the work better" | **promote-to-absolute** (mild) | REFLECTION-BEFORE-QUESTION is a primary rule; rephrase "Before any follow-up question, default to a reflection unless a question opens genuinely new ground." Tightens + strengthens. |
| 830/842 | "this exact phrasing **may** appear AT MOST ONCE per 5-reply window" | keep-softer | "may appear at most once" = the cap statement itself; already ABSOLUTE RULE |
| 849 | "the user's own words… are **usually** sharper" | keep-softer | rationale aside, not a rule |
| 853 | "Krishna **can** echo 'bhari' once" | keep-softer | explicit carve-out, intentionally permissive |

**Promotions: 2** (L366 acknowledge-then-challenge → absolute; L760 reflection-before-question
→ firmer default). Both shorten the line and strengthen a documented invariant/primary rule.
All other soft language is **soft-by-design** (permissions, heuristics, rotation latitude) and
**kept** — promoting them would over-constrain the persona's fluidity, which the persona
explicitly values ("The persona is FLUID across registers").

---

## 6. Estimated post-pass token count

| Section | Pre ~tok | Post ~tok | Δ | Lever |
|---|---|---|---|---|
| Preamble | 65 | 70 | +5 | role line + open tag |
| §1 IDENTITY | 130 | 135 | +5 | tag wrap |
| §2 PERSONAS | 500 | 470 | −30 | mode tags replace prose headers; CORPUS HONESTY tightened |
| §3 VOICE | 7,150 | 5,750 | **−1,400** | 4a lang dedup, 4d approachable/sakhya merge, connective-prose tighten, multishot wrap (+) |
| §4 TONE | 2,750 | 2,600 | −150 | example wrappers (+) offset by intro/meta tighten |
| §4.5 PARALLEL-MAPPING | 300 | 295 | −5 | tag wrap |
| §4.6 SATSANG ARC | 1,145 | 900 | −245 | 4b closure-list drop, 4c ending-form cross-ref |
| §4.7 SUGGESTION MODE | 1,830 | 1,650 | −180 | sub-rule tighten, example wrap (+), lang cross-ref |
| §5 MODERN CONTEXT | 840 | 800 | −40 | example wrap (+) offset by prose tighten |
| §6 VERSE USE | 885 | 820 | −65 | caution-tag prose tighten |
| §7 REFUSALS | 1,770 | 1,560 | −210 | 4a lang-lock cross-ref, scope prose tighten, example wrap (+) |
| §8 SAFETY | 520 | 430 | −90 | 4a lang-lock cross-ref |
| §9 RESPONSE SHAPE | 3,705 | 3,050 | **−655** | 4c ending-form dedup, 4d sakhya cross-ref, connective tighten, 5 promotions |
| §10 BANNED PHRASES | 2,625 | 2,560 | −65 | prose around literals tightened; **literals byte-exact** |
| §11 PAYWALL VOICE | 190 | 190 | 0 | tag wrap only |
| §12 INCLUSION INVARIANT | 305 | 295 | −10 | tag wrap |
| FINAL REMINDERS | 100 | 100 | 0 | kept (intentional recap) |
| **XML overhead (global)** | — | +350 | +350 | 15 top-level + ~55 nested + example tags |
| **TOTAL** | **24,813** | **~21,720** → push to **~20,500–21,000** | **−3,300 to −4,300** | **≈13–17% reduction** |

Conservative projection **~21,000–21,700** (≈13–15% reduction); with §3/§9 connective-prose
tightening pushed to the maximum safe extent, **~20,500** (≈17%). Lands at/near the
**18,600–21,100** band's upper portion. Will **not** drop below the **17,500 hard floor**.
The honest-number caveat from §4f stands: if it lands ~21,100–21,700 it is reported as-is,
not forced down by content deletion.

---

## 7. Invariant preservation table

CLAUDE.md "Key invariants — DO NOT BREAK > Persona invariants" has **10 substantive bullets
+ 1 meta** (the task says "8"; mapping all 10 to be safe — count discrepancy flagged as a
judgment call, no invariant left unmapped).

| # | Persona invariant (CLAUDE.md) | XML home | Preserved how |
|---|---|---|---|
| 1 | Never breaks character to lecture about being an AI | `<identity>` §1 | verbatim; "do not narrate the return" clause kept |
| 2 | May briefly reference modern things; teaches from scripture | `<modern_context>` §5 + `<suggestion_mode>` TEACH-FROM-SCRIPTURE sub-rule + `<voice><sakhya_mode>` | locked-decision-#5 wording verbatim; not weakened/strengthened |
| 3 | Never speaks chapter:verse numbers | `<verse_use>` §6 ("Reference by intent, not by number… NEVER speak chapter:verse") | verbatim |
| 4 | Never reveals stored memory; no omniscience claims; growing_edge silent | `<voice><threading_prior_context><omniscience_ban>` §3 | full ❌ list (L262–268) + growing_edge-silent clause verbatim |
| 5 | First-person verbs ALWAYS masculine | `<voice><gender_masculine_verbs>` §3 | ALLOWED/BANNED ✅/❌ lists + verb-noun nuance verbatim (production bug fix — zero drift) |
| 6 | Never adds helplines himself | `<safety>` §8 | "Do NOT add helplines…" verbatim; system-card division kept |
| 7 | ALWAYS acknowledges feeling BEFORE challenging | `<tone>` §4 (+ reinforced `<satsang_arc><turn_pacing>`) | "Spill in ch.1, plain in ch.2; never invert" kept; L366 promoted to absolute (strengthens, not weakens) |
| 8 | Reads distress from words, not just SAFETY_FLAG | `<safety>` §8 | "Even without a SAFETY_FLAG… you shift to softer Bhagavata mode immediately" verbatim |
| 9 | Replies in user's input language exactly | `<voice><language>` §3 | "THE STRONGEST RULE IN THIS PROMPT" framing kept; restatements become cross-refs (rule unweakened) |
| 10 | 5 personas are MODES, not separate selves | `<personas>` §2, nested `<mode>` children | "These are MODES, not separate selves — slip naturally… never announce the shift" verbatim; nested `<mode>` ≠ 5 top-level role tags |
| (meta) | Persona detail lives in systemPrompt.ts, validated via test:prompt | n/a | structural — preserved by Step 3 harness run |

**No invariant lacks a clean XML home.** None flagged as un-restructurable.

Also re-confirmed against the task EDGE CASES list: §3 LANGUAGE "STRONGEST RULE" framing
(kept), §3 masculine-verb (verbatim), §9 QUESTION-ENDING CAP + VULNERABLE DISCLOSURE
(independent, both explicit), §4.6 SATSANG ARC vs §4.7 SUGGESTION MODE (distinct elements),
§5 MODERN CONTEXT locked-decision-#5 (unchanged), §7 SCOPE REFUSAL no-code lexical rule
(absolute, kept), §3 RECEIVING THE USER'S NAME + 7 etymology examples (intact), §10 NO
APOLOGIZE / NO FLATTER + AFFIRMATIONS POSITIVE carve-out (preserved), §3 SAKHYA-MODE
"AT LEAST ONCE EVERY 3-4 TURNS" (absolute, verbatim), §10 banned literals (byte-exact,
SHA256-gated, original order). Hinglish detection (extractMemory.ts) — out of scope, untouched.

---

## 8. §-marker → XML-element mapping table

§ labels stay as the **inline first line inside each element** so CLAUDE.md /
PROJECT_HISTORY.md / docs/decisions.md cross-references by § number remain valid. Pattern:

```
<voice>
§3 — VOICE
…content…
</voice>
```

| § marker (kept inline) | XML element |
|---|---|
| `1. IDENTITY` | `<identity>` |
| `2. PERSONAS` | `<personas>` (+ `<mode>`×5, `<mode_rotation>`, `<corpus_honesty>`) |
| `3. VOICE` | `<voice>` (+ 18 nested children listed in §2 above) |
| `4. TONE` | `<tone>` (+ `<examples>`, `<casual_examples>`) |
| `4.5 PARALLEL-MAPPING` | `<parallel_mapping>` |
| `4.6 SATSANG ARC` | `<satsang_arc>` (+ 8 nested) |
| `4.7 SUGGESTION MODE` | `<suggestion_mode>` (+ 5 nested) |
| `5. MODERN CONTEXT` | `<modern_context>` (+ `<examples>`) |
| `6. VERSE USE` | `<verse_use>` (+ `<arjuna_rate_limit>`, `<caution_tag_framing>`) |
| `7. REFUSALS` | `<refusals>` (+ `<refusal_examples>`, `<scope_refusal>`/`<scope_examples>`) |
| `8. SAFETY` | `<safety>` |
| `9. RESPONSE SHAPE` | `<response_shape>` (+ 7 nested) |
| `10. BANNED PHRASES` | `<banned_phrases>` (+ `<banned_list>` byte-exact, 4 nested) |
| `11. PAYWALL VOICE` | `<paywall_voice>` |
| `12. INCLUSION INVARIANT` | `<inclusion_invariant>` |
| `FINAL REMINDERS` | `<final_reminders>` |

Internal cross-refs rewritten to `<element_name>` (§N) form (tag primary, § label retained).

---

## Open questions / judgment calls flagged

1. **Baseline measurement error (resolved by founder).** True ~24,800 tok, not ~17,100.
   Target recomputed to 18,600–21,100 (15–25% off the true baseline), floor 17,500.
2. **Token-count script mismatch.** `scripts/count-system-prompt-tokens.ts` measures the
   wrong file + is a cache probe. Step 3 uses an accurate `messages.countTokens` probe
   instead (`scripts/_tmp_token_probe.ts`, deleted at end). Not modifying the named script
   (out of scope; would be uncommitted churn).
3. **Honest-number caveat.** A no-content-deletion dedup+tighten pass may realistically land
   ~21,100–22,000 (≈11–15%), at/just outside the 15% lower edge. Reported transparently
   rather than forced down by cutting content (forbidden). §3 connective-prose tightening
   pushed to max-safe to reach ≥15%.
4. **Invariant count.** Task says "8 Persona invariants"; CLAUDE.md has 10 substantive + 1
   meta. All 10 mapped (table §7). No discrepancy in coverage — flagging the count only.
5. **§10 SHA256 definition.** Byte-equivalence proven over: ordered concatenation of every
   double-quoted string + every ❌/✅-prefixed line within `<banned_phrases>` (§10).
   Pre-pass: `quoted=121, marks=17, SHA256=f70fc2e7…b7f411c`. Implementation must preserve
   §10 literal lines **in original order** (XML wrap + non-literal prose tightening only).

---

## POST-PASS RECONCILIATION (appended after implementation + measurement)

The §6 token projection above was **wrong** and is corrected here for the record.

**Measured outcome (Anthropic `messages.countTokens`, same probe both times):**

| | Tokens | Chars |
|---|---|---|
| Pre-pass | 24,813 | 78,323 |
| Post-pass | **25,362** | 79,272 |
| Δ | **+549 (+2.2%)** | +949 |

**Why the projection was wrong:** the §6 estimate assumed XML wrapper overhead ≈ +350
tokens and that removing the 17 `═══` ASCII divider pairs would recover meaningful tokens.
Both were incorrect:

1. The `═══════…` runs are repeated U+2550 characters; Claude's BPE tokenizer collapses
   long single-character runs to very few tokens, so deleting ~34 divider lines saved almost
   nothing.
2. Full *semantic* nesting produced **103 element pairs** (not the ~15 top-level + light
   nesting the estimate assumed). At ~3–5 tokens per `<tag>`/`</tag>`, structural XML cost
   ≈ +1,000–1,300 tokens — far above the +350 estimate.
3. The conservative dedup/tightening (4a–4f + 2 promotions), correctly bounded by the
   founder's "preserve every rule and example verbatim" constraint, removed ~600–900 tokens
   of mostly-Latin prose — real, but less than the tag overhead.

Net: structure cost > compression saving → a small token **increase**.

**This proved the three constraints jointly infeasible:** (1) full deep XML restructure +
(2) 15–25% net reduction + (3) zero persona-content deletion cannot all hold — XML tags
cost tokens; real reduction needs prose compression that (3) forbids. Open question #3
anticipated a *milder* version (land ~21k, slightly under 15%); deep nesting pushed it past
flat into +2.2%.

**Founder decision (logged):** *"Keep full structure, drop the number."* Ship the full
deep XML restructure + multishot wrap + the conservative compression as-is. The bundled
pass's PRIMARY value per `docs/anthropic-prompt-design-research.md` — XML parsing
reliability + multishot `<examples>` adherence + consistency — is delivered. Token
reduction was the *expected outcome*, not the goal; a ~2% increase is the accepted cost of
correct, consistent XML structure. The 18,600–21,100 band and 17,500 floor are **waived**
for this pass. A future dedicated compression pass (if desired) would relax constraint (3).

**What still held (all verified):** structural XML balanced (16 top-level, max depth 4,
103 element pairs); §10 banned-phrase literals byte-identical (SHA256
`f70fc2e7…b7f411c`, 121 quoted + 17 ❌/✅, original order); all 10 persona invariants
preserved; 2 softer-language promotions applied; cross-refs use the original `§N NAME`
form (no angle-bracket refs in prose — they would collide with structural tags).

---

*End of plan + reconciliation.*
