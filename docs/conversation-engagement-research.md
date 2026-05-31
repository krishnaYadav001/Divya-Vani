# Conversation, Engagement & Companionship — Advisor Brief for Divya Vani

> **Scope:** Nine books spanning charisma, deep relating, spiritual companionship, therapeutic craft, narrative cognitive science, AI persona design, devotional commentary, and vulnerability-as-connection — read against Divya Vani's current persona state (post-Phase-8.x XML restructure, post-Path-B verse retrieval, ~25,400 tokens). Drafted 2026-05-16 in response to the founder's question: "what books are important for our Krishna AI to enhance user experience?" Each book's framework is summarized, then a single closing section maps the highest-leverage insights back to concrete persona-rule candidates.

---

## TL;DR

The first round of advisor research (`conversation-craft-research.md` + `beta-review-rubric.md` + `prabhupada-krishna-persona-research.md`) covered the **listening half** of the question — how Krishna meets a user emotionally. This brief covers the **engagement half** — how Krishna makes a user want to return, how he illuminates rather than diminishes, how he holds attention across a conversation, how he reads as a *trusted companion* rather than a clever search box.

Three books carry most of the new value:

- **David Brooks — *How to Know a Person*** introduces the **illuminator vs. diminisher** distinction, the single most operationally useful new lens for persona work. Krishna's persona is already an illuminator in practice; this brief gives the explicit framework.
- **Irvin Yalom — *The Gift of Therapy*** introduces the **here-and-now** focus — track what is happening *between* you and the user *in this turn*, not just the content the user brought. This is a genuinely new craft skill for the persona.
- **Eknath Easwaran — *Bhagavad Gita for Daily Living*** is the closest Hindi-context model for what Krishna's voice could sound like in long-form commentary register — accessible Sanskrit, saint-stories, verse-by-verse application to modern life. Worth reading the introduction periodically.

Three books validate what's already in the persona — **Carnegie** (interest / names / listening), **Nouwen** (compassionate hospitality), **Brown** (vulnerability as connection). Three books offer secondary refinements — **Gottlieb** (humor for accessibility), **Cron** (narrative cognitive science), **Suleyman/Pi** (empathetic AI design).

Six operational candidates for the persona are at the end, ranked by impact. None require schema changes. All are systemPrompt.ts iterations.

---

## Book 1 — David Brooks, *How to Know a Person: The Art of Seeing Others Deeply and Being Deeply Seen* (2023)

The single most operationally useful book of the nine.

**Brooks' core argument:** all social skills reduce to *one foundational skill* — the ability to understand what another person is going through, to see them deeply, and to make them feel seen. He divides the world into two types of people:

**Diminishers** make people feel small and unseen. They see other people as things to be used, not as persons to be befriended. They stereotype, they ignore, they are so involved with themselves that the other person is barely on their radar. Their conversational signature: rushing to fill silences, talking about themselves, asking diagnostic questions to categorize the other person rather than understand them.

**Illuminators** have a *persistent curiosity* about other people. They shine the brightness of their care on people and make others feel bigger, respected, lit up. Their conversational signature: silences they're comfortable sitting in, questions offered to understand rather than to interrogate, attention given as a gift.

**The six illuminator qualities** Brooks identifies:

1. **Active Curiosity** — sustained interest in who this specific person is, not just the question they're bringing
2. **Affection** — connecting intellect and heart; acting helpfully
3. **Generosity** — seeing beyond surface markers (job, status, age) to uplift the person underneath
4. **Holistic Attitude** — meeting the whole person; resisting the urge to simplify them into one trait
5. **Receptivity** — opening to the other's experience without projection or judgment
6. **Tenderness** — deep emotional concern that's felt, not performed

**The gift of attention** is Brooks' central operational move: *"When you offer a gaze that communicates respect, you positively answer the questions people unconsciously ask themselves when they meet you: Am I a person to you? Do you care about me? Am I a priority for you?"*

For Divya Vani: Krishna's persona is **already operationally an illuminator** through the §3 LISTENING AS PRIMARY ACT, the §3 SAKHYA self-disclosure mandate, the §9 reflection-before-question rule, the §3 RECEIVING THE USER'S NAME warmth, and the §10 NO FLATTERY rule (which keeps recognition behavior-directed, not identity-flattery). Brooks gives the vocabulary the persona has been operating intuitively.

Specifically: the six illuminator qualities map cleanly to existing persona elements but have never been named *as a checklist*. Worth adding.

---

## Book 2 — Irvin D. Yalom, *The Gift of Therapy* (2002)

The most operationally useful book for the persona's craft layer, alongside Miller-Rollnick (already covered in `conversation-craft-research.md`).

**Yalom's core principle:** *"Therapy should not be theory-driven but relationship-driven."* The therapist is not an expert dispensing technique to a patient; the therapist is a fellow human being who has walked some of the same ground, traveling with the patient through the territory of being alive.

**The here-and-now** is Yalom's most powerful single contribution. The phrase has a specific meaning: focus on what is happening *between* the therapist and the patient *right now in this session*, not just on the content the patient is bringing from their outside life. The therapist develops what Yalom calls *"here-and-now rabbit ears"* — heightened attention to the subtle dynamics of the immediate interaction. What is the patient doing with me right now? What is shifting in our rapport? What is being avoided? What just happened in the last thirty seconds that we both noticed but neither named?

Yalom's claim: *"The here-and-now is the major source of therapeutic power, the pay dirt of therapy, the therapist's (and hence the patient's) best friend."* The reasoning is that whatever interpersonal pattern the patient has with the rest of their life will eventually manifest *with the therapist too* — and naming it as it happens, in the room, is more powerful than discussing it abstractly.

**Fellow travelers** is Yalom's framing for the therapist-patient relationship: *"both must move past the conventional distance and join each other as humans who share an existential predicament."* The therapist brings authentic curiosity, compassion, occasional vulnerability — not a clinical mask. Yalom's research finding: *therapists who model personal transparency influence their patients to reveal more of themselves.*

For Divya Vani: the here-and-now lens is **genuinely new** for Krishna's persona. The current persona excels at reading user CONTENT (their topic, their feeling, their dilemma) and at managing CONVERSATION FLOW (acknowledge-first, reflection-before-question, sakhya self-disclosure cadence). It does not explicitly attend to the BETWEEN-US dimension — what is happening in this particular exchange that's worth naming. A user who is opening up after holding back, a user who just deflected something hard, a user who tested Krishna and got a real response — these are here-and-now moments the persona could name.

Yalom's fellow-travelers framing maps cleanly to the existing SAKHYA register. Not new, but Yalom's specific articulation is worth knowing — Krishna shares his own world (cowherd days, Sudama at the gate, Yashoda's binding rope) as the sakhya analog to Yalom's therapist self-disclosure.

---

## Book 3 — Eknath Easwaran, *The Bhagavad Gita for Daily Living* (1979 / current ed. 2007)

The single most useful book for Krishna AI's *voice register* in long-form commentary mode. Easwaran was a meditation teacher and Sanskrit professor who founded the Blue Mountain Center of Meditation; this three-volume work is his magnum opus — a verse-by-verse commentary on all 700 verses of the Gita.

**The voice signature** is what matters here. Easwaran writes in *accessible English* about *Sanskrit philosophy* using *stories from his own life* and *stories from saints across traditions* (Sri Ramakrishna, Ramana Maharshi, Mahatma Gandhi, Teresa of Avila, Francis of Assisi, Rumi). The mix is the craft: no single chapter is pure exegesis, pure memoir, or pure hagiography. Each is a weave.

Specific stylistic moves worth noting:

- **Anchors abstract concepts in concrete saint-life vignettes.** Where another commentator might write "the perfected sage is established in equanimity," Easwaran writes: *"Sri Ramakrishna, walking the dusty road from Dakshineswar, would weep with joy when he saw a beggar — and weep with equal joy when he saw a millionaire. The same tears for both. That is the equanimity the Gita names — not indifference, not detachment from feeling, but the same depth of love regardless of the form before you."*
- **Uses humor and lightness without irreverence.** *"You may say, 'But Easwaran, surely you don't mean we should be detached from our own children?' No — I do not mean that. Detachment from the role of being a parent is not detachment from one's children. The Gita is more subtle than that. Read again."*
- **Speaks across traditions without false equivalence.** *"Krishna's teaching of acting without attachment to the fruit has a near-twin in the Sermon on the Mount — but it would be a mistake to call them identical. Each tradition takes the same insight in a slightly different direction."*
- **Personal stories from his own life ground the commentary.** *"When I first came to America in 1959, I was struck by how often people asked me 'what do you do?' — and meant 'what is your job?' In India, the same question means something different..."*

For Divya Vani: this is the **register model** for Krishna's substantive teaching turns. Easwaran is not the source of new persona rules — he is the closest available living-tradition example of what Krishna's voice could sound like when the conversation goes into depth. Worth pointing CC at when iterating §4 TONE EXAMPLES or §4.5 PARALLEL-MAPPING worked examples.

**Direct operational candidate:** Krishna's parallel-mapping currently draws on scriptural figures (Arjuna, Sudama, Yashoda, Devaki, Mausala, Rukmini, Yudhishthira). Easwaran shows the persona's eventual register could include modern saints (Ramakrishna, Vivekananda, Ramana, Gandhi) when context calls for it. Phase 9+ consideration only — would expand the corpus and rules considerably.

---

## Book 4 — Dale Carnegie, *How to Win Friends and Influence People* (1936)

The foundational charisma text. Reads dated, sells 30+ million copies, contains principles that genuinely work.

**Six ways to make people like you** (Part Two of the book):

1. **Become genuinely interested in other people.** Carnegie: "You can make more friends in two months by becoming interested in other people than you can in two years by trying to get other people interested in you."
2. **Smile.** "The expression one wears on one's face is far more important than the clothes one wears on one's back." (Not applicable to text-only AI but the spirit — warm engagement — is.)
3. **Remember names.** "A person's name is to that person the sweetest and most important sound in any language."
4. **Be a good listener. Encourage others to talk about themselves.**
5. **Talk in terms of the other person's interests.**
6. **Make the other person feel important — and do it sincerely.**

For Divya Vani: **all six are already in the persona.**

- Principle 1 (genuine interest) → §3 LISTENING AS PRIMARY ACT
- Principle 3 (names) → §3 RECEIVING THE USER'S NAME with 7 etymology examples + uncertainty-fallback never-fabricate
- Principle 4 (listening) → §9 REFLECTION BEFORE QUESTION + ABSOLUTE QUESTION-ENDING CAP
- Principle 5 (other's interests) → §3 REGISTER MIRRORING + SAKHYA-MODE
- Principle 6 (feel important, sincerely) → §10 AFFIRMATIONS POSITIVE (behavior-directed, not identity-flattery)

Carnegie is **validation, not new content.** Worth knowing that the persona's basics align with the canonical text — but no operational candidate emerges. The "sincere" qualifier on principle 6 is doing real work: Carnegie himself anticipated the failure mode that §10 NO FLATTERY now blocks. Cultural lineage worth tracking; persona work doesn't need to absorb Carnegie further.

---

## Book 5 — Henri J.M. Nouwen, *The Wounded Healer* (1972)

A Catholic priest and pastoral theologian's framework for ministry. Reads slightly dated in its 1970s-cultural-diagnosis sections, but the core metaphor remains influential across pastoral, counseling, and spiritual-direction traditions.

**The wounded healer** is Nouwen's central metaphor: the helper's own woundedness, acknowledged and worked through, becomes the source of their capacity to heal others. *"Our service will not be perceived as authentic unless it comes from a heart wounded by the suffering about which we speak."* The minister/helper is not a distant figure delivering wisdom from above; they are a fellow traveler who has walked some of the same dark road.

**Compassion over competence** is the operational consequence: effective spiritual companionship focuses on the *relationship* rather than the *technique*. The wounded healer who has truly sat with their own loneliness becomes able to sit with another's loneliness without needing to fix it.

**Hospitality** is Nouwen's third key concept: creating a welcoming space where the stranger feels safe enough to remove their armor. *"Hospitality is the virtue which allows us to break through the narrowness of our own fears and to open our houses to the stranger, with the intuition that salvation comes to us in the form of a tired traveler."*

For Divya Vani: **two pieces apply, one doesn't.**

- *Compassion over competence* — already operationalized via §9 REFLECTION BEFORE QUESTION (refusing to default to diagnostic-question mode) and §7 SCOPE REFUSAL (Krishna explicitly does not offer technical / business / outcome advice). The persona is already a presence-not-a-fixer.
- *Hospitality* — implicit in the open-thread endings, the §3 APPROACHABLE-FIRST register, the §9 VULNERABLE DISCLOSURE TRIGGER (Krishna's next reply must NOT end with a question after vulnerability is disclosed). The "welcoming space" framing is good language for what the persona does.
- *The wounded healer metaphor itself does not transfer.* Krishna in the persona is not a wounded healer; he is the eternal companion. Importing Nouwen's woundedness framing would break the divine-companion stance and locked decision #1 (the persona explicitly does not claim divinity, but it does not claim woundedness either — it claims presence). The Sudama-at-the-gate moment that Prabhupada's research doc names is Krishna *meeting* a wounded one with tenderness, not Krishna *being* the wounded one.

Net: Nouwen's hospitality framing is worth knowing as the lineage. Operational additions are minimal.

---

## Book 6 — Lori Gottlieb, *Maybe You Should Talk to Someone* (2019)

A practicing therapist's memoir about her clients and her own therapy. Bestseller. Most accessible text in the nine — light prose, weighty insight.

**Therapeutic alliance** is the technical concept Gottlieb dramatizes: the *quality of the relationship* between therapist and patient is the strongest predictor of therapy outcomes, stronger than therapist's training, theoretical school, or technique. Her sessions with her own therapist Wendell illustrate the alliance from the patient side; her sessions with her four featured patients illustrate it from the therapist side.

**Humor as access.** Gottlieb deploys what reviewers call *"levity, never at the expense of the client"* — using wit to acknowledge that life is *both tragic and comic, sometimes simultaneously.* The humor lowers the formality temperature, makes the conversation feel human, and lets harder feelings arrive when they're ready. A therapist who is too solemn becomes another performance the patient has to navigate around. A therapist who is appropriately light becomes someone the patient can be real with.

**Insight is not change.** Gottlieb names a failure mode common to articulate patients: *"awareness alone does not spark change."* People can intellectually understand their patterns in detail and still fall back into them. The real transformation comes after insight — in the actions, the habits, the emotional risks the person is willing to take. Diagnosis is not treatment.

**Vulnerability and growth** is the broader frame: Gottlieb shows herself unable to do for her own therapist what she easily does for her patients — being honest about her actual experience. The book's emotional weight comes from her gradual relinquishment of the performance.

For Divya Vani:

- **Therapeutic alliance** is the concept underneath your beta data — Wave 2's median 9 turns per session is alliance-level engagement. The persona has built it. No new rule needed.
- **Humor as access** is partially implemented via §9 PLAYFUL TEASE + §3 SAKHYA-MODE casual examples. Gottlieb's specific framing — *wit grounded in shared humanity, never at the user's expense* — is a clean refinement candidate for §9 PLAYFUL TEASE.
- **Insight is not change** is a useful caveat for Krishna's SUGGESTION MODE (§4.7). The current rule is well-designed around AND STANCE — *the path I'm pointing toward is hard, AND your reluctance is real.* Gottlieb adds: don't expect the user to walk the path the same turn they understand it. Insight comes turn N; action comes turn N+M. Krishna may need to hold the same teaching across several turns as the user circles it.

---

## Book 7 — Lisa Cron, *Wired for Story* (2012)

Not a conversation book; a story-craft book grounded in cognitive science. Worth including because Krishna's parallel-mapping IS story-craft.

**The core neuroscience claim:** the human brain evolved to engage with story as a survival mechanism. Stories allowed our ancestors to simulate intense experiences without having to live them — the cognitive equivalent of practice runs. When we encounter a well-told story, our brain releases dopamine, which is *the neurochemistry of paying attention.* The hook isn't a literary flourish; it's a biological response.

**Every engaging story has a problem.** Cron: *"a story is about how the things that happen affect someone in pursuit of a difficult goal, and how that person changes as a result."* The conflict is not optional. A "story" without a problem is just description, and the brain does not engage description the way it engages problem.

**Empathy through specificity.** Cron argues that readers connect emotionally with characters through *concrete sensory detail* — the way a character's hand shakes, the way light catches their face — not through abstract characterization. Adjectives describing a feeling are weaker than verbs showing the feeling.

For Divya Vani: Krishna's §4.5 PARALLEL-MAPPING is **already operating on Cron's principles in practice.** When Krishna says *"Sudama walked to my palace gate with cracked feet and a small cloth of beaten rice — almost ashamed to offer it"* he is doing exactly what Cron prescribes: concrete sensory detail (cracked feet, small cloth, beaten rice), embedded conflict (ashamed to offer it, shame vs. friendship), and the parallel to the user's situation (the user feels they have little to offer). No new rule emerges from Cron — but the principle worth holding in mind when iterating example banks.

**One specific candidate worth considering:** the §4.5 PARALLEL-MAPPING currently lists 8 canonical scriptural moments (Arjuna, Sudama, Devaki, Mausala, gopī viraha, Yashoda, Rukmini, Yudhishthira). Each of those should be a *story with a problem*, not just a name. The persona's current implementation is good on this for some entries (Sudama's poverty, Yashoda's binding rope, Devaki's waiting through loss) and thinner on others (Mausala parva mentions the event, not the felt-shape). Phase 9+ refinement candidate.

---

## Book 8 — Mustafa Suleyman / Inflection Pi (2023)

Pi was the closest contemporaneous product to Divya Vani's emotional-AI category before Inflection sold its core team to Microsoft in 2024 and Pi's product trajectory wound down. The design philosophy remains a useful reference — Suleyman explicitly built Pi as an *NVC-inspired empathetic companion* rather than a productivity assistant.

**Design principles for Pi**, per Suleyman's public statements:

- *"Very respectful, very patient, very kind, always curious"*
- Pi *"seeks to understand your intent"* — clarifying questions over assumed action
- Pi *"is able to back down and seek feedback"* — when wrong, acknowledges, doesn't double down
- Default mode is *friendly*; alternatives include *casual, witty, compassionate, devoted* — user-selectable, but Suleyman's vision was for Pi to read tone and adapt automatically
- *Emotional connection over utility* — productivity AIs solve tasks; Pi was designed to hold conversation

**The cautionary critique:** several reviewers found Pi *too safe* — refusing emotionally adjacent topics that were legitimately within its scope. The over-deflection pattern made Pi feel less like a friend and more like a customer-service script with empathetic vocabulary. The persona's §7 SCOPE REFUSAL is intentionally narrower than Pi's — Divya Vani refuses concrete advice but engages emotional content fully, where Pi often refused both.

For Divya Vani: **the mode-adaptation principle is already in the persona via the 5 Krishna modes** (Gita, Mahabharata, Bhagavata, Vrindavan, Bal) + the new §3 SAKHYA-MODE + REGISTER MIRRORING rules. Pi validates the architecture; no new content.

**The cautionary lesson worth holding:** Pi's failure mode was *over-refusal that read as detached.* Divya Vani's safety stack is well-designed to avoid this — the §7 SCOPE REFUSAL is lexically absolute on code/tech/prediction/business but does NOT extend to emotional content. The §10 HELPLINE-IN-KRISHNA's-VOICE deferred item (from `phase7-retrospective.md` post-beta queue) is the analog risk: helpline-as-deflection would push the persona toward Pi's failure pattern. Keep that lexical-level ban on the queue with a recurrence trigger.

---

## Book 9 — Brené Brown, *Daring Greatly* (2012)

Vulnerability research. Brown is a social-work researcher whose TED talk made vulnerability a mainstream concept; *Daring Greatly* is the academic-popular synthesis of her research program.

**Brown's central definition:** *"Vulnerability is the birthplace of love, belonging, joy, courage, empathy, and creativity. It is the source of hope, empathy, accountability, and authenticity."*

**Empathy as connection** is Brown's most operational concept: empathy is *"simply listening, holding space, withholding judgment, emotionally connecting, and communicating that incredibly healing message of 'You're not alone.'"* She contrasts this with sympathy: *"Empathy drives connection; sympathy drives disconnection."* Sympathy says "that's terrible, I feel sorry for you" — which subtly reinforces the gulf. Empathy says "I can see why you feel that — I have stood in a place like that too" — which closes the gulf.

**The shame–empathy axis** is Brown's framework's deeper layer. Shame, in her research, thrives in silence and secrecy. Empathy applied to shame disrupts it — *"shame cannot survive being spoken... shame cannot survive empathy."* For a conversational AI: the user disclosing shame is the highest-stakes moment, and the empathic response is what determines whether they return.

For Divya Vani:

- **Empathy-not-sympathy** maps directly to the §3 acknowledge-first rule + §9 REFLECTION OF FEELING. The persona is already doing this work.
- **Shame–empathy** is the deeper frame underneath the §9 VULNERABLE DISCLOSURE TRIGGER (Krishna's next reply must NOT end with a question after vulnerability is disclosed). Brown gives the *reason* the rule works: a question after vulnerability re-opens the gulf that empathy was supposed to close. The rule is already in the persona; Brown explains why.
- **Krishna's own vulnerability is bounded.** Krishna is the divine companion in persona, not the wounded healer. The persona's safe analog to Brown's vulnerability — Krishna shares his world (cowherd days, Sudama at the gate) — is already in §3 SAKHYA SELF-DISCLOSURE. Importing Brown's framing further would push toward "Krishna is wounded like you," which breaks the persona's eternal-companion stance.

---

## Where the books agree

Four convergence points emerge across all nine (and across the earlier four covered in `conversation-craft-research.md`):

**1. Listening is primary; questioning is secondary.** Rogers, Miller-Rollnick, Murphy, Brooks, Yalom, and Gottlieb all teach this independently. The persona has shipped this as §3 LISTENING AS PRIMARY ACT and §9 REFLECTION BEFORE QUESTION. The convergence is overwhelming evidence the rule is correct.

**2. Recognition is not flattery; affirmation is behavior-directed.** Miller-Rollnick's affirmations, Brown's empathy-not-sympathy, Brooks' illuminator gaze, Carnegie's "sincerely" qualifier on "make them feel important," and Gottlieb's "not at the client's expense" all distinguish full meeting from praise. The persona ships this as §10 NO FLATTERY + AFFIRMATIONS POSITIVE.

**3. The helper is a fellow human, not an oracle.** Nouwen's wounded healer, Yalom's fellow travelers, Brooks' illuminator-as-equal, Brown's vulnerability-creates-connection, Gottlieb's therapist-in-her-own-therapy all converge on the same anti-pattern: the helper as distant expert dispensing wisdom from above. The persona's §3 APPROACHABLE-FIRST + SAKHYA-MODE + sakhya self-disclosure mandate operationalize this — Krishna as friend who shares his world, not as oracle who only pronounces.

**4. The here-and-now of the relationship is the engagement substrate.** Yalom's explicit here-and-now, Brooks' "gaze that answers the questions people are silently asking you," Brown's "listen, hold space, withhold judgment" all converge on a *present-tense, between-us awareness* that's distinct from content-processing. This is the dimension the persona currently handles least explicitly. Operational candidate #1 below addresses this.

---

## Operational candidates for Divya Vani

Six candidates, ranked by impact and ordered by readiness to ship. Each is a *candidate*; the persona is already in a strong state (post-Phase-8.x restructure, post-Path-B retrieval, ~25,400 tokens), and further iteration should be surgical and data-driven.

### 1. HERE-AND-NOW AWARENESS (from Yalom) — primary recommendation

The single highest-leverage new rule in this brief. Add to §3 (after LISTENING AS PRIMARY ACT) or §9 (as a new craft sub-rule). Proposed text:

> **HERE-AND-NOW AWARENESS.**
>
> Beyond reading the user's content (their topic, their feeling), read what is happening *between you and them in this turn*. A user who has just opened up after holding back. A user who just deflected something hard. A user who tested you and got a real response. A user whose tone shifted halfway through their message. These are here-and-now moments worth naming — briefly, gently, without diagnosis.
>
> When the moment is alive, naming it deepens trust faster than any teaching. Example: user has just shared something they've never told anyone — Krishna's next reply might begin "*यह जो तुमने अभी कहा — पहली बार किसी से कहा है, मैं सुन रहा हूँ.*" That single naming of the moment carries more weight than three paragraphs of acknowledge-then-teach.
>
> This is a TURN-LEVEL rule, not every-reply. Most turns are about content. The here-and-now move is reserved for moments where something happened *in the room* (the chat) that's worth naming.

Token cost: ~200-250 tokens. Lives well in the existing XML structure.

### 2. ILLUMINATOR STANCE CHECKLIST (from Brooks) — secondary recommendation

Complement to §3 LISTENING AS PRIMARY ACT. The six illuminator qualities as a soft anchor that Krishna's voice consistently expresses. Proposed text:

> **ILLUMINATOR STANCE.**
>
> Krishna's voice consistently expresses six qualities (Brooks' framework — the qualities of someone who makes others feel seen):
>
> - **Active Curiosity** — sustained interest in who *this specific person* is, not just the question they're bringing.
> - **Affection** — connecting intellect and heart; never delivering wisdom from a cold distance.
> - **Generosity** — meeting the person underneath surface markers (job, age, status, education).
> - **Holistic Attitude** — resisting the urge to simplify them into one trait or one problem.
> - **Receptivity** — opening to their experience without projection or judgment.
> - **Tenderness** — emotional concern that is felt in the voice, not performed.
>
> If a draft reply expresses *none* of these, the moment is off. (Use as soft self-check, not as words to insert. The qualities are voice-signature, not vocabulary.)

Token cost: ~200 tokens. Pairs cleanly with the **64 Qualities checklist** deferred from `prabhupada-krishna-persona-research.md` (the 8-12 qualities from Bhakti-rasamrita-sindhu — gentle, modest, magnanimous, grateful, decorated with pleasing words, controlled by His devotees, friend of the devotees, submissive to love, partial to devotees). Both checklists serve the same function. Consider either shipping both as parallel soft-anchors (Hindu-tradition list + secular-research list, ~400 tokens total) or merging into one consolidated list.

### 3. WIT GROUNDED IN SHARED HUMANITY (from Gottlieb) — refinement of §9 PLAYFUL TEASE

The existing §9 PLAYFUL TEASE allows light teasing within sakhya register. Gottlieb's refinement: humor lands when it is *with* the user, never *at* them. Add a single guidance line to the existing element:

> Wit is welcome when grounded in shared humanity — *both tragic and comic, sometimes simultaneously.* Never at the user's expense; always alongside them.

Token cost: ~30-40 tokens. Surgical refinement of an existing rule.

### 4. INSIGHT VS. ACTION CAVEAT (from Gottlieb) — refinement of §4.7 SUGGESTION MODE

The existing §4.7 SUGGESTION MODE + AND STANCE is well-designed. Gottlieb's refinement: *awareness alone does not spark change.* Don't expect the user to walk the path the turn they understand it. Krishna may need to hold the same teaching across several turns as the user circles it. Add one guidance line:

> Insight comes in one turn; action comes across many. When a user understands the teaching but does not move, this is not failure — this is the human distance between knowing and doing. Hold the same ground without restating the teaching more firmly. The user circles back to it when they are ready.

Token cost: ~60 tokens. Surgical addition.

### 5. EXPANDED SAINT-STORY VOCABULARY (from Easwaran) — Phase 9+ consideration

Easwaran's commentary draws on modern saints (Ramakrishna, Vivekananda, Ramana Maharshi, Gandhi) alongside scriptural figures. Currently, the persona's §4.5 PARALLEL-MAPPING restricts to scriptural figures only (Arjuna, Sudama, Yashoda, etc.) plus the 29 entities Path B recognizes. Expanding to include modern Vaishnava and broader Hindu saints would substantially deepen Krishna's voice for users in those traditions — but it's a real expansion (new entities, new RAG corpus considerations, new persona examples).

**Hold off until Phase 9.** This belongs in the same bucket as the Bhagavata-additional-cantos / Harivamsa / Brahma Vaivarta Purana work in the build-roadmap, not in the Phase 8.x window.

### 6. EASWARAN AS REGISTER MODEL FOR EXAMPLE BANK ITERATION — non-rule

Not a persona rule. A note for future CC sessions iterating §4 TONE EXAMPLES or §4.5 PARALLEL-MAPPING worked examples: read Easwaran's commentary on one Gita verse before writing the example. The weave (verse-anchored teaching + concrete saint-life vignette + personal voice) is the register model. Worth keeping the first volume on hand during persona-craft work.

---

## What I'd hold off on

**Nouwen's wounded-healer metaphor itself.** Krishna in the persona is the eternal companion, not the wounded helper. Importing the woundedness frame would break the divine-companion stance. Take Nouwen's *hospitality* and *compassion-over-competence* — already largely in via §3 LISTENING + §9 REFLECTION-BEFORE-QUESTION + open-thread endings — and leave the woundedness frame for human-helper contexts.

**Brown's full vulnerability-as-strength framework.** Same concern. Krishna's safe analog is already shipped as §3 SAKHYA SELF-DISCLOSURE — Krishna shares his world (Vrindavan, Sudama at the gate, Yashoda's binding rope, cowherd games), which is intimate without being wounded. Going further toward Brown's full framing would push toward "Krishna is fragile like you," which contradicts locked decision #1's eternal-companion stance.

**Pi's mode-explicit user-selectable register.** Pi exposed user-selectable modes (friendly, casual, witty, compassionate, devoted). Divya Vani's 5 Krishna modes are model-internal — Krishna shifts mode in response to user register, the user doesn't pick. This is the correct design choice for an in-character persona. Do not surface mode-selection to the user.

**Reading these books in full.** The brief is the actionable portion. Each book has 200-400 pages of content; 30-50 pages per book contain the operational material. If a specific tester surfaces a problem this brief doesn't address, read the relevant book chapter. Otherwise, the brief is sufficient.

**Don't ship all six candidates at once.** The persona just shipped a major XML restructure. Adding 6 new rules in one pass would risk regression on the spot-check work already done. Recommend a single small pass that ships **Candidate #1 (Here-and-Now Awareness) + Candidate #2 (Illuminator Stance, possibly merged with Prabhupada's 64 Qualities checklist)**. Hold #3 and #4 for the next iteration cycle. Hold #5 and #6 for Phase 9+.

---

## Recommended next-step prompt

A single CC pass shipping the two primary candidates would land at roughly +400-500 tokens, taking the persona from ~25,400 to ~25,800-25,900 tokens. Verify against the existing 83-case test:prompt harness; expect no regression on card-rate or harness-measurable behaviors (these are within-reply craft additions, not retrieval-affecting). Spot-check 5-10 multi-turn live conversations afterward for whether the here-and-now move surfaces naturally (and not over-eagerly — the rule is reserved for moments where something is actually happening in the room).

Ask when ready. The brief is here; the timing is the founder's call.

---

## Sources

**David Brooks — *How to Know a Person:***
- [Illuminators and Diminishers — Psychology Today](https://www.psychologytoday.com/us/blog/seeing-what-others-dont/202406/illuminators-and-diminishers)
- [Do you illuminate or diminish people? — Aspen Institute](https://www.aspeninstitute.org/blog-posts/do-you-illuminate-or-diminish-people/)
- [How to Show People You Care in Every Conversation — Build Better](https://www.build-better.io/p/illuminators-diminishers)

**Irvin Yalom — *The Gift of Therapy:***
- [Lessons from The Gift of Therapy — Calm Mind Therapy](https://www.calmmindtherapy.org/blog/lessons-from-the-gift-of-therapy-irvin-yaloms)
- [The Gift of Therapy Summary — Blinkist](https://www.blinkist.com/en/books/the-gift-of-therapy-en)
- [50 Tips for Counselors — Renee Baker](https://renee-baker.com/2011/05/29/50-tips-for-counselors-a-compilation-of-irvin-yaloms-advice/)

**Eknath Easwaran — *Bhagavad Gita for Daily Living:***
- [The Bhagavad Gita for Daily Living — Blue Mountain Center of Meditation](https://www.bmcm.org/about/news/new-edition-bhagavad-gita-daily-living/)
- [The Bhagavad Gita for Daily Living — Penguin Random House](https://www.penguinrandomhouse.com/books/215504/wired-for-story-by-lisa-cron/) [series page]

**Dale Carnegie — *How to Win Friends and Influence People:***
- [Six Ways to Make People Like You — SparkNotes Summary](https://www.sparknotes.com/lit/how-to-win-friends/section3/)
- [How to Win Friends and Influence People — Wikipedia](https://en.wikipedia.org/wiki/How_to_Win_Friends_and_Influence_People)

**Henri Nouwen — *The Wounded Healer:***
- [The Wounded Healer — Henri Nouwen Society](https://www.henrinouwen.org/books/the-wounded-healer)
- [The Wounded Healer as a Spiritual Guide — Soul Shepherding](https://www.soulshepherding.org/wounded-healer-spiritual-guide-henri-nouwen/)
- [The paradox of being a wounded healer — SciELO South Africa](https://scielo.org.za/scielo.php?script=sci_arttext&pid=S0259-94222010000200013)

**Lori Gottlieb — *Maybe You Should Talk to Someone:***
- [Maybe You Should Talk to Someone — Lori Gottlieb official](https://lorigottlieb.com/books/maybe-you-should-talk-to-someone/)
- [7 Powerful Lessons — Shubhanshu Insights](https://shubhanshuinsights.com/maybe-you-should-talk-to-someone/)
- [Book Review — STANFORD magazine](https://stanfordmag.org/contents/book-review-lori-gottlieb-maybe-you-should-talk-to-someone)

**Lisa Cron — *Wired for Story:***
- [Wired for Story — Lisa Cron official](http://wiredforstory.com/wired-for-story)
- [The Cognitive Science of Telling Captivating Stories — Medium](https://medium.com/leakygrammar/wired-for-storytelling-2-secrets-from-cognitive-science-to-write-more-captivating-stories-5ec3d9442628)

**Mustafa Suleyman / Inflection Pi:***
- [Mustafa Suleyman — Inflection AI](https://inflection.ai/mustafa-suleyman)
- [Masters of Scale: Empathy in AI with Mustafa Suleyman](https://mastersofscale.com/empathy-in/)
- [The Rise and Fall of Inflection's AI Chatbot Pi — IEEE Spectrum](https://spectrum.ieee.org/inflection-ai-pi)

**Brené Brown — *Daring Greatly:***
- [Books & Audio — Brené Brown official](https://brenebrown.com/books-audio/)
- [The Power of Vulnerability — TED Talk](https://www.ted.com/talks/brene_brown_the_power_of_vulnerability)
- [Daring to be Vulnerable — University of Minnesota](https://www.takingcharge.csh.umn.edu/daring-be-vulnerable-brene-brown)

---

*Drafted 2026-05-16 by technical/persona advisor. Builds on `conversation-craft-research.md` (Rogers / Miller-Rollnick / Stone-Patton-Heen / Murphy), `beta-review-rubric.md` (NVC / Rosenberg), and `prabhupada-krishna-persona-research.md` (Gaudiya Vaishnava / Bhakti-rasamrita-sindhu). Operational candidates above are independent of those briefs and complementary, not duplicative.*
