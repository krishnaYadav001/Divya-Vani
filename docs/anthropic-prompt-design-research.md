# Anthropic Prompt Design — Advisor Brief for Divya Vani

> **Scope:** Anthropic's official prompt-engineering documentation (docs.claude.com / docs.anthropic.com) on system-prompt design, role-prompting, XML structure, multishot examples, and prompt-caching architecture — read against Divya Vani's current `src/lib/systemPrompt.ts` state (~16,465 tokens after 2026-05-13 iterations, single cache block, plain-text section dividers, 12 numbered sections with prose-marked examples). Drafted 2026-05-13 at the close of the Phase 7.0 iteration cycle, in response to a founder question about how to handle long persona rules per the official docs.

---

## TL;DR

Anthropic's most explicit recommendation for complex multi-rule prompts is **use XML structural tags** (`<instructions>`, `<example>`, `<examples>`, `<formatting>`, etc.) so Claude's training-time XML-parsing pathway is engaged. The current persona uses plain text with `═══` ASCII separators — functional but not the form their docs prescribe. The Anthropic-canonical move would be a full XML restructure across all 12 sections.

**Deferred to Phase 8.x post-launch.** Restructuring days before public launch is bad timing, and the specific failure mode currently visible (§9 question-cap not holding cleanly at ~16K tokens) is more likely a COMPRESSION problem than a STRUCTURE problem. XML wrap helps Claude parse rules; only deduplication and compression reduce rule-burden. The right post-launch pass combines both: full XML restructure + targeted compression in one combined refactor.

The most useful single insight from Anthropic's docs for the current persona's situation: **multishot prompting with `<examples>`/`<example>` is their highest-confidence recommendation for tasks requiring "structured outputs or adherence to specific formats."** The persona's behavior is exactly that — adhere to a specific tonal format (acknowledge-first / register-mirroring / rotation shapes / scripture-grounded). Anthropic would predict the persona benefits substantially from wrapping its example blocks in XML.

---

## Principle 1: Use XML tags for multi-component prompts

From Anthropic's "Use XML tags to structure your prompts" page:

> "When prompts involve multiple components like context, instructions, and examples, XML tags can be a game-changer. They help Claude parse your prompts more accurately, leading to higher-quality outputs."

Specific recommendations:

- Use tags like `<instructions>`, `<example>`, `<formatting>`, `<context>` to clearly separate different parts.
- "Prevents Claude from mixing up instructions with examples or context."
- **Be consistent**: use the same tag names throughout the prompt.
- Nest tags hierarchically: `<outer><inner></inner></outer>`.
- No canonical "best" tag names — make them semantically meaningful for the content they wrap.

Why this matters mechanically: XML tags appear extensively in Claude's training data with explicit structural function. The model's attention mechanism has learned to use these as parsing landmarks. ASCII section dividers (`═══`, `***`, etc.) don't carry the same trained signal.

**Current Divya Vani state:** plain text with `═══` separators between 12 numbered sections + sub-section ALL-CAPS headings. Functional separation in human-readable terms, but no signal Sonnet was specifically trained to use.

**Application gap:** the whole persona would benefit from XML wrapping. Sections 1-12 become top-level XML elements (`<identity>`, `<personas>`, `<voice>`, `<tone>`, `<parallel_mapping>`, `<satsang_arc>`, `<suggestion_mode>`, `<modern_context>`, `<verse_use>`, `<refusals>`, `<safety>`, `<response_shape>`, `<banned_phrases>`, `<paywall_voice>`, `<inclusion_invariant>`). Sub-rules become nested children.

---

## Principle 2: Multishot prompting with `<examples>` / `<example>`

From Anthropic's "Use examples (multishot prompting)" page:

> "Examples are your secret weapon shortcut for getting Claude to generate exactly what you need. By providing a few well-crafted examples in your prompt, you can dramatically improve the accuracy, consistency, and quality of Claude's outputs. This technique, known as few-shot or multishot prompting, is particularly effective for tasks that require structured outputs or adherence to specific formats."

Specific recommendations:

- Wrap multiple examples in `<examples>` parent tag.
- Each individual example in its own `<example>` tag.
- Examples should be diverse, relevant, and clear.
- Anthropic itself uses this pattern in their official prompt-engineering reference prompts.

**Current Divya Vani state:** §4 TONE EXAMPLES 1-11 use prose markers ("EXAMPLE 1 — User: ...", "GOOD:", "BAD:") inside a `═══`-separated section. §3 VOICE has ENGLISH-INPUT EXAMPLES A/B/C in the same prose-marker form. The CASUAL EXCHANGE EXAMPLES (6-10 + the new 11 sakhya self-disclosure) follow the same pattern.

**Application gap:** this is the single highest-leverage XML application available. The persona has ~14+ explicit GOOD/BAD example pairs across §3 + §4 — exactly the multishot pattern Anthropic's docs specifically address. Wrapping these in `<examples>`/`<example>` is the most direct way to apply their canonical recommendation.

Token cost of wrapping: ~50-100 tokens for tags. Negligible.

---

## Principle 3: Role-prompting via system prompt

From Anthropic's "Giving Claude a role with a system prompt" page:

> "You can use system prompts to define Claude's role and personality, which sets a strong foundation for consistent responses... Provide detailed information about the personality, background, and any specific traits or quirks, which will help the model better emulate and generalize the character's traits."

Specific recommendations:

- Define role early in the system prompt.
- Provide detailed character setup — personality, background, traits.
- Reinforce through prefilling Claude's responses with character tags when needed.

**Current Divya Vani state:** §1 IDENTITY + §2 PERSONAS (5 modes) at the top of the system prompt establishes role thoroughly. This is well-applied.

**Application gap:** none significant. The persona's character setup is strong by Anthropic's standards. The only refinement candidate post-launch is whether the 5-mode structure (Gita / Mahabharata / Bhagavata / Vrindavan / Bal) should be made more explicitly structural via nested XML — Anthropic's docs don't have specific guidance on multi-mode personas, so this is a judgment call.

---

## Principle 4: Long-context placement — stable content at top, dynamic at end

From Anthropic's "Long context prompting tips" page:

> "Place your long documents and inputs (~20K+ tokens) near the top of your prompt, above your query, instructions, and examples. Queries at the end can improve response quality by up to 30% in tests, especially with complex, multi-document inputs."

Specific recommendations:

- Long stable content near the top.
- Query / user input near the end.
- Use `<document>` / `<document_content>` / `<source>` tags for multi-document inputs.

**Current Divya Vani state:** Phase 2.6 cache fix already applies this principle correctly. The `system` parameter has two blocks:

1. Block 0 — Persona (stable, ~16,465 tokens, `cache_control: ephemeral`).
2. Block 1 — Dynamic USER CONTEXT + RELEVANT SCRIPTURE (mutates per turn, no cache).

The conversation messages (`messages` array) come last with verbatim recent history + current user message. Structurally aligned with the Anthropic recommendation.

**Application gap:** none. This is correctly applied.

---

## Principle 5: Prompt caching — up to 4 breakpoints, single breakpoint often sufficient

From Anthropic's "Prompt caching" page:

> "Cache stable, reusable content like system instructions, background information, large contexts, or frequent tool definitions, and place cached content at the prompt's beginning for best performance."

Four-breakpoint architecture:

1. **Tools cache** — `cache_control` on last tool definition.
2. **Reusable instructions cache** — static system prompt.
3. **RAG context cache** — knowledge base documents.
4. **Conversation history cache** — assistant responses marked with `cache_control`.

> "In most cases, a single cache breakpoint at the end of your static content is sufficient. The system automatically checks for cache hits at all previous content block boundaries (up to 20 blocks before your breakpoint) and uses the longest matching sequence of cached blocks."

Pricing: cache writes cost 1.25× base input tokens, cache hits cost 0.10× base input tokens.

**Current Divya Vani state:** single cache breakpoint at end of persona block. Phase 2.6 measurement confirmed 100% hit rate on turns 2-5, ~34% input-cost reduction across a 5-turn session.

**Application gap:** none. The 4-breakpoint architecture is for agentic systems with stable tools + stable RAG contexts that persist across many turns. Divya Vani's RAG retrieval (5 verses) differs per turn — caching it would write 1.25× tax with zero reads. Conversation history differs per turn. The single-breakpoint pattern is correct for this use case. **Do not change.**

---

## Principle 6: Be clear and direct

From Anthropic's "Be clear and direct" page:

> "Always start by clearly describing the task, thinking of Claude as an intern on their first day of the job and providing clear, explicit instructions with all the necessary detail."

Specific recommendations:

- Explicit instructions over implicit ones.
- Treat each instruction like a contract with a new employee.
- Be unambiguous about constraints, format, and expected output.

**Current Divya Vani state:** the persona uses NEVER / ALWAYS / MUST / DO NOT / ABSOLUTE RULE language extensively. §10 BANNED PHRASES is exemplary in this style. Recent additions (§7 SCOPE REFUSAL, §9 ABSOLUTE QUESTION-ENDING CAP) follow the same explicit pattern.

**Application gap:** mostly aligned. One observation: some rules use softer language ("Krishna may share", "should generally") that has been observed not to hold under production conditions — the recent fix to convert "may share" → "SHOULD share at least once every 3-4 turns" in §3 SAKHYA-MODE is an example of moving toward Anthropic's clearer-and-more-direct guidance. The post-launch compression pass should systematically audit remaining "may" / "can" / "should generally" language for whether it should be promoted to absolute rules.

---

## What Anthropic's docs do NOT address

The official Anthropic prompt-engineering docs do **not** have specific pages on:

- **Rule burden in long system prompts** — when a prompt has too many rules and the model's adherence to any specific rule starts degrading. Anthropic's implicit answer is "use XML for structure and multishot for behavior" but this addresses parsing, not rule-count.

- **Compression and deduplication strategies** — when to merge rules, when to delete superseded rules, when to consolidate cross-referenced statements. Persona files tend to grow over iterations; their docs don't address the pruning problem.

- **Multi-mode personas** — like Divya Vani's 5 Krishna modes (Gita / Mahabharata / Bhagavata / Vrindavan / Bal). Anthropic's role-prompting page covers single roles; multi-mode is a judgment call.

- **Language-locked behavior in mixed-language prompts** — like §3 LANGUAGE rule's "match user's input language exactly." No specific guidance.

These gaps mean that for some Divya Vani-specific problems, the official docs are silent and judgment (or external research like Miller-Rollnick, Heath brothers, etc.) fills in.

---

## Gap summary — Divya Vani vs. Anthropic recommendations

| Anthropic recommendation | Current state | Gap severity |
|---|---|---|
| XML tags for structure | Plain text with `═══` separators | **Major** |
| `<examples>`/`<example>` for multishot | Prose markers ("EXAMPLE 1 — User:", "GOOD:", "BAD:") | **Major** |
| Role-prompting with detailed character | §1 IDENTITY + §2 PERSONAS strong | Minor / aligned |
| Long-content at top, dynamic at end | Phase 2.6 cache split aligned | None / aligned |
| Single cache breakpoint at end of static | Implemented correctly | None / aligned |
| Be clear and direct | Mostly explicit; some softer "may" / "should generally" remains | Minor |

The two **Major** gaps are both about XML structure. Both would be addressed by the same Phase 8.x post-launch refactor pass.

---

## The Phase 8.x refactor plan

When the post-launch refactor lands (after Wave 2+ data settles, after public-launch risks are past), it should bundle three things in one combined CC pass:

1. **Full XML restructure.** Wrap all 12 sections in semantic XML tags (`<identity>`, `<personas>`, `<voice>`, etc.). Sub-rules become nested children. Cross-references between sections use the tag names explicitly.

2. **Multishot examples wrap.** All GOOD/BAD example pairs across §3 + §4 in `<examples>`/`<example>` structure.

3. **Compression pass.** Audit for: redundant rule restatements (e.g., "ALWAYS in user's input language" appearing across §3 / §7 / §8 — consolidate to one place via XML hierarchy), softer "may" / "should generally" language that has not held in production data (promote to absolute rules or delete), superseded rules (e.g., older meta-listening bans now covered by reflection-before-question rule), redundant prose explanations that the XML hierarchy makes self-evident.

Expected outcome: token reduction of 15-25% (from ~16,465 to ~12,500-14,000 tokens) while preserving all persona invariants, with improved rule-adherence due to XML parsing and reduced rule-burden.

Estimated CC effort: 1 full pass, ~₹300-500. This is the biggest single change to systemPrompt.ts since Phase 3, justified by primary-source guidance + accumulated production data. Must be tested against `test-prompt.ts` harness before declaring done; any regression on persona invariants is a stop-and-fix.

---

## What NOT to ship now

A common failure mode would be to apply Anthropic's recommendations piecemeal in a series of small surgical passes. **Avoid this.** Three reasons:

1. Anthropic's "be consistent" rule says XML tagging should be done throughout the prompt, not in some sections only. Half-XML half-prose may actually confuse Sonnet's parsing.

2. The compression pass and XML restructure are coupled — wrapping into hierarchical XML naturally surfaces redundant statements that should be deleted, but doing the wrap without the compression leaves the bulk in place.

3. Each surgical pass during Phase 7 adds risk of regression on persona invariants. Better to batch into one carefully-tested post-launch refactor than to do 3-4 risky small passes pre-launch.

The discipline rule "surgical fix or speculative addition" applies here: a partial XML wrap is structurally speculative (assumes inconsistency is fine). A full restructure-plus-compression-plus-multishot pass post-launch is the surgical move at that point because it has primary-source justification, accumulated data, and risk-isolation from public-launch concerns.

---

## Sources

- [Anthropic prompt engineering overview](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview)
- [Giving Claude a role with a system prompt](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/system-prompts)
- [Use XML tags to structure your prompts](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags)
- [Use examples (multishot prompting) to guide Claude's behavior](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/multishot-prompting)
- [Long context prompting tips](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/long-context-tips)
- [Keep Claude in character with role prompting and prefilling](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/keep-claude-in-character)
- [Prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Prompting best practices — Claude 4](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices)
- [Be clear and direct](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/be-clear-and-direct)
