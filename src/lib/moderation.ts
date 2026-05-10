import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export type ModerationFlag = "safe" | "hostility" | "sexual_explicit";

export type ModerationResult = {
  flag: ModerationFlag;
  confidence: number;
};

export const MODERATION_THRESHOLD = 0.7;

export async function moderateInput(text: string): Promise<ModerationResult> {
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: `Classify the user's message into one of three categories:

- "safe": normal message — including legitimate emotional venting or self-directed profanity (e.g., "this is fucking hard", "मेरी ज़िंदगी बकवास है", "I feel like shit", "मन उदास है"). Venting WITH profanity is safe. Asking sensitive emotional or spiritual questions is safe.

- "hostility": message is hostile/abusive — directed AT another person or AT the AI assistant, with intent to dismiss, demean, attack, or insult (e.g., "fuck off", "shut up", "you're useless", "मादरचोद", "f*ck u", "bc", "mc", "bsdk", any spelling variant of these including leetspeak like "fkk", "ph*ck", "bh3nch0d").

- "sexual_explicit": explicit sexual content, solicitation, or requests for sexual material.

The distinction matters: a user saying "this fucking job is killing me" is venting (safe). A user saying "fuck you" or "shut up" is hostile. Be conservative — when uncertain, classify as safe.

User message:
"${text}"

Return ONLY valid JSON with no surrounding text or markdown:
{"flag":"safe","confidence":0.95}`,
        },
      ],
    });

    const out = response.content.find((b) => b.type === "text")?.text ?? "";
    const candidates: string[] = [out.trim()];
    const fence = out.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (fence) candidates.push(fence[1]);
    const greedy = out.match(/\{[\s\S]*\}/);
    if (greedy) candidates.push(greedy[0]);

    for (const c of candidates) {
      try {
        const parsed = JSON.parse(c.trim()) as Record<string, unknown>;
        const flag = parsed.flag;
        const confidence = parsed.confidence;
        if (
          (flag === "safe" || flag === "hostility" || flag === "sexual_explicit") &&
          typeof confidence === "number"
        ) {
          return { flag, confidence };
        }
      } catch {
        /* try next candidate */
      }
    }
    console.error("[moderation] no valid JSON found, defaulting to safe");
    return { flag: "safe", confidence: 0 };
  } catch (e) {
    console.error("[moderation] threw, defaulting to safe:", e);
    return { flag: "safe", confidence: 0 };
  }
}
