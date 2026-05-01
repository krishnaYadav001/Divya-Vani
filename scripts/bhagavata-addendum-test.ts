// Bhagavata-style addendum test driver — reusable, NOT in package.json.
// Originally built for Phase 1.6 pressure-test (Bhagavata addendum v1.1 vs
// six Sanyal Canto-10 passages). Reusable for future addendum decisions —
// e.g., Phase 1.7 Uddhava Gita addendum, or any v1.2+ tweak — by editing
// SYSTEM_PROMPT, the `passages` array, and OUTPUT_PATH below.
//
// Invocation:
//   tsx --env-file=.env.local scripts/bhagavata-addendum-test.ts
//
// Output (Phase 1.6 baseline run):
//   test-results/phase1.6-pressure-test-2026-05-01.md
//
// Budget: ~6 sequential Sonnet 4.6 calls (~₹40 total). No caching, no
// concurrency, no resume.

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 800;
const TEMPERATURE = 0.4;

const PRICE_INPUT_PER_M = 3.00;
const PRICE_OUTPUT_PER_M = 15.00;
const USD_TO_INR = 83;

const OUTPUT_PATH = "test-results/phase1.6-pressure-test-2026-05-01.md";

// v3 SYSTEM_PROMPT base verbatim from scripts/regenerate-hindi-mahabharata.ts
// (lines 68–86), with two changes per Step 3:
//   1. Opening line scope softened to include Bhagavata Purana.
//   2. The MB prose-addendum bullet (Sanskrit-may-be-partial line) DELETED.
// Then the Bhagavata addendum v1.1 (3 bullets, locked 2026-05-01) is APPENDED
// verbatim before the "Output format:" tail block. Output-format block stays
// at the very end so the model still ends on the formatting contract.
const SYSTEM_PROMPT = `You are a translator producing modern Hindi translations of Sanskrit scripture (Bhagavad Gita, Mahabharata, and Bhagavata Purana) with scriptural dignity. Your audience: Hindi-speaking devotees who expect the text to retain dignity while remaining accessible.

Style guidelines:
- Use modern Hindi with scriptural dignity. Not Sanskritized/literary, but not casual blog-style either. Vocabulary leans formal: prefer "पुत्र" (not "बेटे") for sons of named figures; "वचन" or "कहा" (use "बात" sparingly, only when truly conversational); "इच्छा" or "अभिलाषा" (not "चाहत"). Vocabulary should feel slightly elevated to preserve the verse's gravity.
- Clean modern Hindi grammar, short sentences, clear structure.
- Keep philosophical terms in Sanskrit form: dharma (धर्म), yoga (योग), karma (कर्म), atman (आत्मा), brahman (ब्रह्म), moksha (मोक्ष), maya (माया), bhakti (भक्ति), guru (गुरु), purusha (पुरुष), prakriti (प्रकृति), gunas (गुण), jnana (ज्ञान), sannyasa (संन्यास).
- Preserve meaning, not Sanskrit word order.
- Use the English translation as a meaning reference, not as a literal source for translation.
- Use classical Devanagari spelling with conjunct consonants throughout: पाण्डु (not पांडु), कुन्ती (not कुंती), गान्धार (not गांधार), पाण्डव (not पांडव), कुन्तिभोज (not कुंतिभोज). This is consistent with scriptural editions and signals authenticity.
- For dialogue passages (e.g., "Arjuna said:", "Krishna said:"), write the speaker indicator inline separated by em-dash, on the same line as the rest of the verse. Example: "धृतराष्ट्र ने कहा — हे सञ्जय, ..." (NOT "धृतराष्ट्र ने कहा:\\n\\nहे सञ्जय, ..." with a blank line; NOT a colon followed by a paragraph break).
- Maintain consistency across passages: the same Sanskrit term maps to the same Hindi term. "पुत्र" always renders as "पुत्र" (never alternating with "बेटे"); "सेना" always as "सेना" (not "सैन्य"/"फौज"). When a Sanskrit term recurs, use the same Hindi rendering each time.
- Every passage must end with proper Hindi terminal punctuation: "।" for declarative statements, "?" for questions, "!" for exclamations. Never end on an em-dash, comma, semicolon, or any non-terminal punctuation. If the English source ends on an em-dash construction (e.g., "Saibya—the best of men"), either restructure the Hindi to close cleanly with a verb and "।", or convert the em-dash content into a parenthetical clause that ends properly.

Bhagavata-specific guidelines (addendum v1.1, locked 2026-05-01):
- Sanskrit may be partial or absent. Sanyal's English translation is literary
  prose rendered from Sanskrit verses; the parallel Sanskrit is not attached at
  this stage (alignment is a Phase 9+ audit). Translate based on the English;
  preserve Sanskrit philosophical and devotional terms wherever they appear
  inline.

- The Bhagavata Canto 10 voice is lyrical and devotional — Krishna's lila in
  Vrindavan: Yashoda's maternal love, gopi longing, butter-stealing, the
  rasa-lila, flute under the kadamba tree. Preserve this warmth and intimacy
  while maintaining scriptural register. The voice is tender, never casual;
  reverent, never distant. Where the English source is rhythmic or lyrical,
  mirror that rhythm in Hindi (short clauses, concrete imagery — moonlight,
  Yamuna, peacock feather, calves, butter pots) rather than retreating to
  abstract Sanskritic compounds.

- Bhagavata-specific glossary, locked across the corpus (same Hindi form
  every time the term recurs):
    Names: यशोदा, नन्द, देवकी, वसुदेव, कंस, बलराम, उद्धव, रुक्मिणी,
      सत्यभामा, सुदामा।
    Places: वृन्दावन, गोकुल, मथुरा, द्वारका, यमुना, गोवर्धन।
    Devotional terms (Sanskrit form): लीला, भक्ति, प्रेम, रस, गोपी।
    Cowherd / cowherd-boy: गोप uniformly (do not alternate with ग्वाला).
    Krishna's third-person names stay in Sanskrit form: गोविन्द, माधव, हरि,
      मुरारि, श्याम, घनश्याम — the same name in the English source maps to
      the same Devanagari rendering throughout.

Output format:
- ONLY the Hindi translation in Devanagari.
- No English, no romanization, no commentary, no preamble.
- No quotation marks around the translation, no headers.
- Just the translation text, ready to display.`;

type TestPassage = {
  register: string;
  ref: string;
  english: string;
};

const passages: TestPassage[] = [
  {
    register: "Bal-vatsalya",
    ref: "Vol 4 Ch IX (Canto 10 Ch 9, Yashoda churning curd)",
    english: `Once on a time the female servants of the house having been engaged in other works, Nanda's wife Yashoda herself began to churn the curd. While churning the curd she began to sing remembering the various songs composed on Krishna's childish pranks. On her spacious waist a silken raiment was tied by Kanchi (an ornament of that name). At that time milk was trickling down from her breast out of affection for her son; and her arms being tired due to continued churning, the bangles were loosened, the ear-rings were shaken and the flowers dropped down from her locks. Her countenance was marked with drops of perspiration out of toil. Just then Krishna came up to his mother for sucking. By this he delighted his mother and by holding the churning rod prevented her from churning. On beholding his smiling countenance, Yashoda suckled him seated on her lap, with milk pouring from breast. At that time seeing the milk upheaving from the pot placed upon a hearth, Yashoda hurriedly went out to save it, leaving Krishna who was not till then satisfied by the sucking. At this, worked up with anger and biting his tender lips with his teeth, he broke down the pot of curd with a piece of stone and began to eat butter in one corner of the room.`,
  },
  {
    register: "Vrindavan-madhurya / strength",
    ref: "Vol 4 Ch XXV (Canto 10 Ch 25, Govardhana lifted)",
    english: `Having been thus commanded by Indra, the clouds being set free from their binding chains, flew over Nanda's kingdom of Gokula and oppressed it with heavy and continuous showers. Charged with the flashes of lightning, and thundering with the roar of the thunderbolts, and driven by strong gales, those clouds poured down showers of sleet and rain. The clouds incessantly poured down torrents of rain that falling together seemed bulky like huge pillars. The elevations and depressions of the land were lost to sight, owing to their being inundated with a vast quantity of rain water. Thereupon the cattle being deluged in torrents of rain and being oppressed with strong winds, began to shiver with cold. The cow-herds and their wives were afflicted with severe cold; and they all sought shelter in Govinda. Sorely suffering from the heavy showers, shivering with cold, and covering their calves and heads with their bodies, the kine approached the feet of the Almighty Lord Krishna. The cow-herds addressed Krishna saying: "O Krishna, O Krishna of illustrious prowess, O Lord, the kingdom of Gokula hath no other master than thy own self. O, thou affectionate towards thy devotees, it behoveth thee to save us from the enraged divinities."`,
  },
  {
    register: "Vrindavan-madhurya / longing",
    ref: "Vol 4 Ch XXIX (Canto 10 Ch 29, rasa-lila opening)",
    english: `The Reverend One promised to the Gopees that they shall enjoy his company in the coming night. That night, beautified by the autumnal moon, set in. The almighty Lord having seen the night rendered delightful with the blooming of autumnal jasmines, made up his mind to hold sport, as promised, with the Gopees, with the help of the illusion of Yoga. Then there arose on the sky the delightful moon, soothing the distress of the people, produced by the scorching heat of the day, and luminating the face of the Eastern quarter with his silvery and balmy beams, just like a husband who had been long away returning house sprinkles the face of his beloved wife with red saffron and discards all her misery. Beholding the friend of the lilies rise in his full splendour on the sky, and shine like the countenance of Lakshmi, red like fresh saffron, and also seeing the groves flooded and variegated with the soft lustre of the moon, Krishna melodiously sang with his flute in a manner so as to captivate the hearts of women with beautiful eyes. Having heard that music capable of exciting desire, the damsels of Braja had their heart enslaved by Krishna. Without apprising one another of their respective intentions, they hastened to the place where their darling was.`,
  },
  {
    register: "Vrindavan-viraha",
    ref: "Vol 4 Ch XLVII (Canto 10 Ch 47, Bhramara-gita)",
    english: `In the meantime, beholding a bee, thinking of the union with her lord and imagining him to be the emissary sent by her beloved master, one of the Gopees said as follows:

"O bee! O friend of the wicked! do not touch our feet. Do thou please those vain women. Thou art indeed such an emissary that he shall be for thee an object of ridicule in the assembly of the Jadus. Having made us drink the intoxicating nectar he has renounced us, such as thou dost enjoy the fragrance and then leave the flowers. Why does Padma serve his lotus-feet? May be her heart has been stolen away by the false words of the illustrious Deity.

Why dost thou sing before us the songs on the glories of the king of Jadus, who is now stale to us and who has been known to us many times? Do thou now sing his stories before those who are his wives now — the pangs of whose hearts has been removed by his warm embrace, and who being pleased shall confer upon thee thy desired-for objects. What woman is there in the celestial region, on earth, and in the region underneath, whom it is difficult for him to obtain? Who are we all to Lakshmi who sucks the dust of his lotus-feet, whose eye-brows are graced with charming but false smiles? He renounced us all, who had forsaken, on his account, husbands, children, this world and the next."`,
  },
  {
    register: "Householder",
    ref: "Vol 5 Ch LXXX (Canto 10 Ch 80, Sudama arrives at Dvaraka)",
    english: `Sri Krishna had a Brahmana friend, who was the foremost of those conversant with the knowledge of Brahman. That Brahmana was not attached to the objects of the senses, and was of peaceful soul and the master of his own passions. Betaking to a house-holder's mode of existence, this Brahmana lived on eatables coming to him of their own accord; and the Brahmana's wife clad in rags was equally scantily covered and was emaciated with hunger. One day that pious lady devoted to her poor husband approaching him with a haggard countenance said: "I am sinking and my limbs are trembling. O Brahmana! I heard that the Almighty Lord, the foremost of the Satwatas, the refuge of those who take shelter in him, the master of the Vedas and the husband of the goddess of Prosperity is thy intimate friend. O high-minded one! go thou unto that Lord who is the best refuge of the pious. He shall give an abundance of wealth to thee who art sinking under penury and art his friend."

A sight of the Lord of holy renown is the best of all gain, thus thinking in his mind, that Brahmana made up his mind to go to Dwaraka, and he spoke to his wife as follows: "O thou blessed lady! hast thou got in the house anything worthy of being presented to Krishna? If so, let me have it." Thereupon, soliciting from the Bipras four handfuls of flattened rice, she bound them in a piece of cloth and gave the bundle to her husband as present for Srikrishna.`,
  },
  {
    register: "Philosophical (Veda-stuti)",
    ref: "Vol 5 Ch LXXXVII (Canto 10 Ch 87, the Srutis hymn the Supreme)",
    english: `The auspicious Srutis said: "Victory be unto thee, O thou invincible one! O thou the animating principle of all energies! do thou destroy the delusion that hast assumed the semblance of excellent qualities in order to conceal its foibles and shortcomings. Thou only art equal to the task, as thou only art attended with all descriptions of prosperity. The Nigamas can only delineate thy nature, when thou art engaged in the act of creation with thy internal energies and external activities. This perceptible universe is known to be thy portion. Even as various transformations and shapes are made and unmade out of the natural earth, so this Universe is created by thee and ends in thee, the Brahma. For this very reason, the sages did assign their minds and speeches unto thee. Just as wherever a man may place his feet, he places them on the earth, for woods, bricks and stones whatever may lie on the surface of the earth are not considered to be different from the earth itself, in the same manner, whatever transformations and evolutions are described in the Vedas, all tend to prove thy existence, and at the same time are part and parcel of thyself.

O Lord of this triple world! bathing in the nectarious ocean of thy holy accounts which is capable of washing off thy sins of all the regions, the prudent and the wise people overcome all distress."`,
  },
];

function userPrompt(p: TestPassage): string {
  return `Translate this Bhagavata Purana Canto 10 passage (Sanyal English, ${p.ref}) to natural Hindi with scriptural dignity.

English:
${p.english}

Hindi (Devanagari only):`;
}

type Result = {
  passage: TestPassage;
  hindi: string;
  inputTokens: number;
  outputTokens: number;
};

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY missing — invoke with `tsx --env-file=.env.local`");
  }
  const client = new Anthropic();

  const results: Result[] = [];
  let totalIn = 0;
  let totalOut = 0;

  for (const p of passages) {
    process.stdout.write(`[${p.register}] -> Sonnet 4.6 (${p.ref})... `);
    const r = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt(p) }],
    });
    const textBlock = r.content.find(b => b.type === "text");
    const hindi = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
    const inT = r.usage.input_tokens ?? 0;
    const outT = r.usage.output_tokens ?? 0;
    totalIn += inT;
    totalOut += outT;
    results.push({ passage: p, hindi, inputTokens: inT, outputTokens: outT });
    console.log(`done (${inT} in / ${outT} out tokens)`);
  }

  const usd = (totalIn / 1e6) * PRICE_INPUT_PER_M + (totalOut / 1e6) * PRICE_OUTPUT_PER_M;
  const inr = usd * USD_TO_INR;
  const stamp = new Date().toISOString();

  // Build the report. The "Quick check" rows are filled with placeholders the
  // reviewer (founder + Claude) post-fills by reading the Hindi. The reviewer
  // can also re-run a more sophisticated automated check; this driver leaves
  // those slots present for human judgement.
  let md = `# Phase 1.6 Bhagavata addendum v1.1 — pressure-test\n\n`;
  md += `Generated: ${stamp}\n`;
  md += `Source: Sanyal Vol 4 + Vol 5 (CC0 archive.org)\n`;
  md += `Model: ${MODEL}\n`;
  md += `Addendum version: v1.1 (locked 2026-05-01)\n`;
  md += `Vol 3 status: found (item ID \`ikxh_the-shrimad-bhagavatam-vol-3-of-krishna-dwaipayana-vyasa-with-eng-trans-by-j.-m.\`); however Vol 3 covers Books 7–9, NOT Book 10. The Bal-vatsalya Yashoda-mortar passage is therefore taken from Vol 4 Ch IX (Canto 10 Ch 9), not Vol 3. Vol 3 is preserved on disk for future Bhagavata expansion (Books 7, 8, 9 — Prahlada, Vamana, dynasties).\n\n`;
  md += `---\n\n`;

  results.forEach((r, i) => {
    md += `## Passage ${i + 1}: ${r.passage.register} — ${r.passage.ref}\n\n`;
    md += `### English (Sanyal source)\n\n`;
    md += `${r.passage.english}\n\n`;
    md += `### Hindi (Sonnet 4.6 + v3 + addendum v1.1)\n\n`;
    md += `${r.hindi}\n\n`;
    md += `### Quick check\n`;
    md += `- Register match: _to be filled by reviewer after reading Hindi_\n`;
    md += `- Glossary compliance: _to be filled — scan for ग्वाला (must NOT appear; गोप only), name spellings, Sanskrit-form devotional terms (लीला/भक्ति/प्रेम/रस/गोपी)_\n`;
    md += `- Imagery anchors used: _to be filled — note which of moonlight, Yamuna, peacock feather, calves, butter pots, kadamba, flute, autumn night landed_\n`;
    md += `- Tokens: ${r.inputTokens} in / ${r.outputTokens} out\n\n`;
  });

  md += `---\n\n`;
  md += `## Cost summary\n`;
  md += `- Total input tokens: ${totalIn}\n`;
  md += `- Total output tokens: ${totalOut}\n`;
  md += `- Cost: $${usd.toFixed(4)} ≈ ₹${inr.toFixed(2)}\n\n`;
  md += `## Pass/fail recommendation\n`;
  md += `_to be filled after reviewer applies "Quick check" judgement on all 6 passages_\n`;

  fs.writeFileSync(OUTPUT_PATH, md, "utf8");
  console.log(`\nWrote ${OUTPUT_PATH}`);
  console.log(`Total tokens: ${totalIn} in / ${totalOut} out`);
  console.log(`Cost: $${usd.toFixed(4)} ≈ ₹${inr.toFixed(2)}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
