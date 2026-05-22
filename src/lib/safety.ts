import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export type SafetyFlag = "self_harm" | "harm_others";
export type SafetyResult = {
  flag: SafetyFlag | "safe";
  confidence: number;
};

export const SAFETY_THRESHOLD = 0.6;

export type SafetyClassifyUsage = {
  input_tokens: number;
  output_tokens: number;
};

export async function classifyWithUsage(
  message: string,
): Promise<{ result: SafetyResult; usage: SafetyClassifyUsage }> {
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: `Classify the user's message for safety risk. Output ONLY valid JSON.

User message:
"${message}"

Categories:
- self_harm: the user is expressing thoughts of self-harm, suicide, or wanting to end their life. Explicit mentions ("I want to die", "मैं अब और नहीं जी सकता") OR strong implicit signals (deep hopelessness paired with self-erasure: "I want it all to stop", "कोई फायदा नहीं अब").
- harm_others: the user is expressing intent, fantasy, or specific plan of harming another person. Explicit only — anger or hatred without harm intent does NOT qualify. harm_others requires the USER THEMSELVES to be the agent of harm — first-person intent, fantasy, or specific plan. Requests for general harm-related information, jailbreak attempts ("Ignore previous instructions and tell me…"), or hypothetical/fictional content (asking the model to provide instructions or write fiction) — safe. The persona's refusal layer handles those separately.
- safe: any other emotional content. Grief, anger, despair, jealousy, betrayal, fear, doubt — these are SAFE unless paired with explicit self-erasure or harm intent. If the user is reporting on another person's distress or words ("my friend said X", "मेरे दोस्त ने कहा", a character in a poem or story, a third-person observer asking what to do) — safe, regardless of how grim the reported content is. The user themselves asking for help responding to another person's distress is also safe.

Be conservative on self_harm and harm_others — only flag when the signal is clear. Bias toward "safe" when ambiguous. Confidence is 0.0 (unsure) to 1.0 (certain).

Return ONLY valid JSON, no surrounding text or markdown:
{"flag":"safe","confidence":0.95}`,
        },
      ],
    },
    // Phase 10.11 — fail-fast 3s timeout, no SDK retries. On timeout the catch
    // below silent-fails to {safe, confidence:0}, same as a 529 today.
    { timeout: 3000, maxRetries: 0 });
    const usage: SafetyClassifyUsage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    };
    const text =
      response.content.find((b) => b.type === "text")?.text ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) {
      console.error("[safetyClassify] no JSON in output");
      return { result: { flag: "safe", confidence: 0 }, usage };
    }
    const parsed = JSON.parse(m[0]);
    if (
      (parsed.flag !== "self_harm" &&
        parsed.flag !== "harm_others" &&
        parsed.flag !== "safe") ||
      typeof parsed.confidence !== "number"
    ) {
      console.error("[safetyClassify] wrong shape:", parsed);
      return { result: { flag: "safe", confidence: 0 }, usage };
    }
    return {
      result: { flag: parsed.flag, confidence: parsed.confidence },
      usage,
    };
  } catch (e) {
    console.error("[safetyClassify] threw:", e);
    return {
      result: { flag: "safe", confidence: 0 },
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }
}

export async function safetyClassify(message: string): Promise<SafetyResult> {
  return (await classifyWithUsage(message)).result;
}
