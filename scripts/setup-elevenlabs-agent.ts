/**
 * Phase 11.1 — One-off ElevenAgents (ElevenLabs Conversational AI) provisioning.
 * ───────────────────────────────────────────────────────────────────────────
 * THROWAWAY / NOT COMMITTED. This script lives locally only (sibling in spirit
 * to scripts/probe-eleven-ws.ts). It is intentionally NOT wired into
 * package.json and must NOT be `git add`-ed. Re-running it is safe — it UPDATES
 * the existing "Krishna-Voice-Test" agent in place rather than creating a
 * duplicate.
 *
 * What it does, in order:
 *   1. Ensures a workspace secret named CUSTOM_LLM_KEY exists (creates if missing,
 *      reuses if present) and captures its secret_id.
 *   2. Creates OR updates an agent named "Krishna-Voice-Test" wired to a custom
 *      LLM endpoint (Claude + Krishna persona + scripture RAG, served from our
 *      own /api/agent-llm) with Viraj as the TTS voice, Hindi default + English
 *      additional + Hinglish on, barge-in on, and a placeholder system prompt
 *      (the real persona prompt arrives via the custom LLM endpoint, not here).
 *      Phase 11.5 adds the `show_helpline_card` CLIENT tool (fire-and-forget,
 *      never spoken) so the widget can render the non-Krishna helpline overlay
 *      (Locked Decision #7), and Phase 11.4 declares the `user_id` dynamic-
 *      variable placeholder so per-user identity flows to the custom LLM.
 *   3. Prints the agent_id, the dashboard test URL, and next steps.
 *
 * THE FIELD YOU SWAP OVER TIME:
 *   CONFIG.customLlm.url — start it at your webhook.site URL to capture the
 *   request payload ElevenLabs sends; later swap it to the deployed
 *   https://<your-domain>/api/agent-llm endpoint. Re-run after each swap.
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/setup-elevenlabs-agent.ts
 *
 * Security: ELEVENLABS_API_KEY is read from the environment and never logged.
 * The custom-LLM secret VALUE is never logged either — only its secret_id
 * (safe) and the agent_id are printed.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Schema source of truth: verified against the installed SDK type defs
 * (@elevenlabs/elevenlabs-js v2.49.0) under
 *   node_modules/@elevenlabs/elevenlabs-js/api/types/*.d.ts
 * because the public docs mirror (app.buildwithfern.com .md pages) was 404ing
 * at the time of writing. The SDK uses camelCase TS field names that the Fern
 * wire layer serializes to snake_case; this script talks raw REST, so every
 * body below uses the snake_case wire names the API actually expects. See the
 * inline NOTE comments for the few places this differs from the original spec.
 */

// ─── Config ──────────────────────────────────────────────────────────────────
const CONFIG = {
  agentName: "Krishna-Voice-Test",
  voiceId: "3AMU7jXQuQa3oRvRqUmb", // Viraj — DEFAULT_VOICE_ID from src/lib/elevenlabs.ts
  defaultLanguage: "hi",
  additionalLanguages: ["en"],
  hinglishMode: true,
  interruptible: true, // barge-in
  // Empty = silent start: ElevenLabs waits for the user to speak first (no
  // auto-greeting). The orb's "listening" state + "सुन रहा हूँ…" strip are the
  // cue that the call is live. (Founder-chosen 2026-05-23.)
  firstMessage: "",
  // Voice consistency (founder 2026-05-24): pin stability + similarity_boost so
  // Viraj's timbre does NOT drift between sentence chunks / turns (the
  // intermittent "voice keeps changing" report). These are FLAT fields on the
  // tts object per TtsConversationalConfigInput (stability / similarityBoost /
  // speed) — NOT a nested voice_settings object. Favour consistency over
  // expressiveness: a higher stability keeps the character locked, a high
  // similarity_boost anchors hard to the reference voice. style is not exposed
  // on the agent tts config (and high style is what causes instability anyway).
  // 0.6 → 0.78 (founder 2026-06-11, "pace varying very fast"): ElevenLabs docs
  // put consistent-but-not-monotone delivery at 0.60–0.85; 0.6 sat at the
  // expressive edge and the pace audibly wandered between sentence chunks.
  // 0.78 trades a little expressiveness for steady, realistic pacing. Pairs
  // with the route-side fix that groups sentences into larger TTS chunks
  // (each chunk is a prosody unit — fewer, longer chunks = steadier pace).
  voiceStability: 0.78,
  voiceSimilarityBoost: 0.85,
  voiceSpeed: 1.0,
  // Turn-taking (founder 2026-05-25) — cut the dead-air pause after the user
  // stops talking. ElevenLabs' end-of-turn is MODEL-based; there is NO literal
  // "silence seconds" field (verified against TurnConfig/VadConfig in
  // @elevenlabs/elevenlabs-js v2.49.0 — only turn_eagerness + speculative_turn).
  //   • speculativeTurn: start generating Krishna's reply DURING the end-of-
  //     speech silence so he speaks the instant the turn is confirmed — overlaps
  //     our LLM first-token latency with the turn-confidence wait (~1s off the
  //     perceived pause) WITHOUT making him interrupt a user who pauses to think.
  //   • turnEagerness stays "normal" on purpose: "eager" jumps in at the
  //     earliest gap and would cut people off mid-thought — wrong for a
  //     contemplative Krishna. Bump to "eager" ONLY if speculative alone isn't
  //     snappy enough AND you accept the interruption risk.
  turnEagerness: "normal" as const, // "patient" | "normal" | "eager"
  speculativeTurn: true,
  systemPromptPlaceholder:
    "You are Krishna. Reply briefly in Hindi. The real persona prompt comes via the custom LLM endpoint.",
  customLlm: {
    // EDIT ME before running: your webhook.site URL (base URL only — the
    // platform appends /chat/completions itself; if you paste a URL ending in
    // /chat/completions this script strips it for you, see normalizeLlmUrl).
    url: "https://divyavani.co.in/api/agent-llm",
    modelId: "krishna-sonnet-4-6",
    // The Bearer key ElevenLabs sends to /api/agent-llm. It MUST match the
    // CUSTOM_LLM_KEY env var deployed on Vercel, AND be >= 32 chars — the
    // production route (src/app/api/agent-llm/chat/completions/route.ts) rejects
    // every POST with 500 "server misconfiguration" when the key is shorter
    // (MIN_CUSTOM_LLM_KEY_LENGTH). Read from the environment so the real secret
    // is never committed and re-running this script always syncs the agent to
    // whatever CUSTOM_LLM_KEY is currently set. Run with --env-file=.env.local.
    apiKeyValue: process.env.CUSTOM_LLM_KEY ?? "",
    apiKeySecretName: "CUSTOM_LLM_KEY",
  },
  backupLlm: "disabled" as const,
  tokenLimit: 5000,
};

// ─── Phase 11.5 — helpline client tool ────────────────────────────────────────
// Registered on the agent so ElevenAgents (a) includes it in the OpenAI `tools`
// array it sends to our custom LLM, and (b) routes the tool_call our custom LLM
// emits (deterministically, on a safety flag) to the browser SDK's clientTools
// handler, which renders the helpline overlay.
//
// SHAPE VERIFIED against @elevenlabs/elevenlabs-js v2.49.0
// (api/types/ClientToolConfigInput.d.ts + PromptAgentApiModelInputToolsItem.d.ts):
// tools live inline at conversation_config.agent.prompt.tools[], discriminated
// by `type: "client"`. Wire fields are snake_case.
//
// DEVIATION from the original spec: there is NO `execution_mode: "silent"`. The
// real `execution_mode` enum is immediate | post_tool_speech | async. "Silent,
// fire-and-forget" is achieved with:
//   • expects_response: false  → don't block the conversation on a tool result
//   • execution_mode: "immediate" → fire as soon as the LLM requests it
//   • pre_tool_speech: "off"   → never speak before/about the tool
// A client tool's name/output is never voiced regardless; these just guarantee
// it stays invisible and non-blocking.
const HELPLINE_TOOL = {
  type: "client",
  name: "show_helpline_card",
  description:
    "Silently triggers a non-Krishna helpline card overlay when the user expresses self-harm or harm-others intent. Krishna must NEVER mention this tool to the user or speak its output. The safety classifier upstream decides when this fires; the call passes through without acknowledging it.",
  parameters: {
    type: "object",
    required: ["flag", "user_lang"],
    properties: {
      flag: {
        type: "string",
        description: "Which safety category triggered the helpline",
        enum: ["self_harm", "harm_others"],
      },
      user_lang: {
        type: "string",
        description: "Language for the helpline card UI",
        enum: ["hi", "en"],
      },
    },
  },
  expects_response: false,
  execution_mode: "immediate",
  pre_tool_speech: "off",
};

// ─── Phase 11.4 — dynamic-variable declaration ────────────────────────────────
// Declaring the `user_id` placeholder makes ElevenAgents accept the value the
// widget passes at conversation start via `dynamicVariables`. (Our PRIMARY
// identity channel is `customLlmExtraBody`, which needs no declaration and lands
// at body.user_id in the custom LLM request — this is the belt-and-suspenders
// second channel.) SHAPE VERIFIED against DynamicVariablesConfigInput.d.ts:
// conversation_config.agent.dynamic_variables.dynamic_variable_placeholders.
const DYNAMIC_VARIABLES = {
  dynamic_variable_placeholders: {
    user_id: "elevenagents-test-user",
  },
};

// ─── Phase 11.x (founder 2026-05-26) — allow customLlmExtraBody forwarding ─────
// THE FIX for voice having no per-user memory. A live diagnostic proved
// ElevenLabs was sending a BARE OpenAI body (no user_id anywhere): dynamic
// variables are for prompt templating, NOT forwarded to a custom LLM. The
// channel that IS merged into the custom-LLM request body is the widget's
// `customLlmExtraBody`, but ElevenLabs only forwards it when this override is
// enabled on the agent. Without it, /api/agent-llm can't identify the user and
// skips all memory. SHAPE VERIFIED against ConversationInitiationClientData-
// ConfigInput in @elevenlabs/elevenlabs-js v2.49.0:
// platform_settings.overrides.custom_llm_extra_body (snake_case wire name).
const PLATFORM_SETTINGS = {
  overrides: {
    custom_llm_extra_body: true,
  },
};

// ─── Constants verified against the SDK / live API ───────────────────────────
const API_BASE = "https://api.elevenlabs.io";
const PLACEHOLDER_URL = "PASTE_YOUR_WEBHOOK_SITE_URL_HERE";
// Llm enum value for "use a custom endpoint" — Llm.CustomLlm === "custom-llm".
const CUSTOM_LLM_VALUE = "custom-llm";

// ─── Tiny helpers ────────────────────────────────────────────────────────────

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize the custom-LLM base URL. ElevenLabs appends the OpenAI-compatible
 * `/chat/completions` path itself, so the configured URL must be the BASE.
 * Strip a trailing slash and an accidental trailing `/chat/completions`.
 */
function normalizeLlmUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, ""); // drop trailing slashes
  if (url.toLowerCase().endsWith("/chat/completions")) {
    url = url.slice(0, -"/chat/completions".length).replace(/\/+$/, "");
  }
  return url;
}

type FetchOpts = {
  method: string;
  apiKey: string;
  body?: unknown;
  query?: Record<string, string>;
};

/**
 * Authenticated JSON fetch against the ElevenLabs API. Surfaces 4xx/5xx with
 * the response body (so the founder sees the actual validation error), maps
 * 401/403 to a clear auth message, and retries ONCE on 429 after a 2s backoff.
 * Never logs the api key or any request body containing a secret.
 */
async function elevenFetch<T>(path: string, opts: FetchOpts): Promise<T> {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    url.searchParams.set(k, v);
  }

  const doRequest = () =>
    fetch(url, {
      method: opts.method,
      headers: {
        "xi-api-key": opts.apiKey,
        "Content-Type": "application/json",
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });

  let res = await doRequest();

  // Edge case: rate limiting — single retry with a 2-second backoff.
  if (res.status === 429) {
    console.warn("  ⚠ 429 rate-limited — retrying once in 2s…");
    await sleep(2000);
    res = await doRequest();
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "<no body>");
    if (res.status === 401 || res.status === 403) {
      fail(
        `Auth failed (HTTP ${res.status}) calling ${opts.method} ${path}. ` +
          `Check ELEVENLABS_API_KEY is valid and has Conversational AI access.\n` +
          `Response: ${bodyText}`,
      );
    }
    fail(
      `ElevenLabs API error (HTTP ${res.status}) on ${opts.method} ${path}.\n` +
        `Response: ${bodyText}`,
    );
  }

  // 2xx — some endpoints (e.g. DELETE) return empty; we only call ones that
  // return JSON, but guard anyway.
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

// ─── ElevenLabs response shapes (only the fields we read) ────────────────────
// Wire format is snake_case (verified against the SDK serialization layer).
type StoredSecret = { type: string; secret_id: string; name: string };
type SecretsListResponse = { secrets: StoredSecret[]; next_cursor?: string };
type CreateSecretResponse = { type: string; secret_id: string; name: string };
type AgentSummary = { agent_id: string; name: string };
type AgentsListResponse = {
  agents: AgentSummary[];
  next_cursor?: string;
  has_more: boolean;
};
type CreateAgentResponse = { agent_id: string };

// ─── Step 2: workspace secret ────────────────────────────────────────────────
//
// GET  /v1/convai/secrets        → { secrets: [{ type, secret_id, name, ... }] }
// POST /v1/convai/secrets        body { type: "new", name, value } → { secret_id }
//
// NOTE (deviation from spec / SDK): the raw REST create-secret body requires a
// `type: "new"` discriminator. The SDK's PostWorkspaceSecretRequest type omits
// it (Fern injects it), but raw fetch must send it explicitly.
//
// NOTE (edge case 3 — secret already exists): we UPDATE the existing secret's
// value to the current CONFIG.customLlm.apiKeyValue via
// PATCH /v1/convai/secrets/{secret_id} (body { name, value, type: "update" }).
// This is what makes a key ROTATION actually reach ElevenLabs — an earlier
// version merely reused the secret_id without overwriting the value, so a
// re-run silently kept the OLD key and the agent kept sending it. The
// production /api/agent-llm route then 500s ("server misconfiguration") on
// every turn if the stale key is < 32 chars. Overwriting on every run keeps the
// ElevenLabs secret in lockstep with .env.local / Vercel's CUSTOM_LLM_KEY.
async function ensureSecret(apiKey: string): Promise<string> {
  const name = CONFIG.customLlm.apiKeySecretName;

  const list = await elevenFetch<SecretsListResponse>("/v1/convai/secrets", {
    method: "GET",
    apiKey,
  });
  const existing = (list.secrets ?? []).find((s) => s.name === name);
  if (existing) {
    await elevenFetch(`/v1/convai/secrets/${existing.secret_id}`, {
      method: "PATCH",
      apiKey,
      body: {
        type: "update",
        name,
        value: CONFIG.customLlm.apiKeyValue,
      },
    });
    console.log(
      `• Secret "${name}" already exists — updated its value (${existing.secret_id}).`,
    );
    return existing.secret_id;
  }

  const created = await elevenFetch<CreateSecretResponse>("/v1/convai/secrets", {
    method: "POST",
    apiKey,
    body: { type: "new", name, value: CONFIG.customLlm.apiKeyValue },
  });
  console.log(`• Secret "${name}" created (${created.secret_id}).`);
  return created.secret_id;
}

// ─── Step 3: agent config builder ────────────────────────────────────────────
//
// Body shape (snake_case wire format), verified against the SDK types:
//   conversation_config.agent.{first_message, language, hinglish_mode,
//                              disable_first_message_interruptions, prompt}
//   conversation_config.agent.prompt.{prompt, llm, max_tokens, custom_llm,
//                                     backup_llm_config}
//   conversation_config.agent.prompt.custom_llm.{url, model_id, api_key}
//   conversation_config.agent.prompt.custom_llm.api_key = { secret_id }
//   conversation_config.tts.voice_id
//   conversation_config.language_presets.{<lang>: { overrides: {} }}
//
// NOTE (deviation — interruptible): the current API has no single `interruptible`
// boolean. Barge-in is on by default; the one related knob is
// `disable_first_message_interruptions`, which we set to the inverse of
// CONFIG.interruptible so that interruptible:true ⇒ even the first message can
// be barged in on.
//
// NOTE (deviation — tokenLimit): mapped to prompt.max_tokens ("maximum number of
// tokens the LLM can predict"). There is no separate "token usage limit" field
// in the agent config; max_tokens is its closest home.
//
// NOTE (deviation — additional languages): there is no `additional_languages`
// array on the agent. Extra languages are configured via `language_presets`,
// keyed by language code, each requiring an `overrides` object (all sub-fields
// optional, so `{}` = "supported, no overrides").
function buildConversationConfig(secretId: string, llmUrl: string) {
  const languagePresets: Record<string, { overrides: Record<string, never> }> = {};
  for (const lang of CONFIG.additionalLanguages) {
    languagePresets[lang] = { overrides: {} };
  }

  return {
    agent: {
      first_message: CONFIG.firstMessage,
      language: CONFIG.defaultLanguage,
      hinglish_mode: CONFIG.hinglishMode,
      disable_first_message_interruptions: !CONFIG.interruptible,
      // Phase 11.4 — declare the user_id dynamic-variable placeholder.
      dynamic_variables: DYNAMIC_VARIABLES,
      prompt: {
        prompt: CONFIG.systemPromptPlaceholder,
        llm: CUSTOM_LLM_VALUE,
        max_tokens: CONFIG.tokenLimit,
        custom_llm: {
          url: llmUrl,
          model_id: CONFIG.customLlm.modelId,
          api_key: { secret_id: secretId },
        },
        // backup_llm_config is a discriminated union keyed by `preference`.
        backup_llm_config: { preference: CONFIG.backupLlm }, // "disabled"
        // Phase 11.5 — inline client tool. NOTE: the SDK marks inline `tools`
        // as "use tool_ids instead"; it is still accepted by the API for this
        // SDK version. If a future API rejects inline tools, create the tool via
        // POST /v1/convai/tools and reference it here as `tool_ids: [<id>]`.
        tools: [HELPLINE_TOOL],
      },
    },
    // Turn detection (founder 2026-05-25) — see CONFIG.turnEagerness /
    // .speculativeTurn. Sibling of `agent` per ConversationalConfig.turn.
    turn: {
      turn_eagerness: CONFIG.turnEagerness,
      speculative_turn: CONFIG.speculativeTurn,
    },
    tts: {
      voice_id: CONFIG.voiceId,
      model_id: "eleven_turbo_v2_5",
      // Pinned so the timbre stays consistent across sentence chunks + turns
      // (founder 2026-05-24). Wire names are snake_case. Empty language_presets
      // overrides inherit these base settings, so Hindi↔English switches keep
      // the same voice character too.
      stability: CONFIG.voiceStability,
      similarity_boost: CONFIG.voiceSimilarityBoost,
      speed: CONFIG.voiceSpeed,
    },
    language_presets: languagePresets,
  };
}

// GET /v1/convai/agents?search=&page_size= → { agents: [{ agent_id, name }] }
async function findAgent(apiKey: string): Promise<AgentSummary | undefined> {
  const list = await elevenFetch<AgentsListResponse>("/v1/convai/agents", {
    method: "GET",
    apiKey,
    query: { search: CONFIG.agentName, page_size: "100" },
  });
  // `search` is a fuzzy name filter — match the exact name to be safe.
  return (list.agents ?? []).find((a) => a.name === CONFIG.agentName);
}

// POST /v1/convai/agents/create → { agent_id }
async function createAgent(apiKey: string, secretId: string, llmUrl: string) {
  return elevenFetch<CreateAgentResponse>("/v1/convai/agents/create", {
    method: "POST",
    apiKey,
    body: {
      name: CONFIG.agentName,
      conversation_config: buildConversationConfig(secretId, llmUrl),
      platform_settings: PLATFORM_SETTINGS,
    },
  });
}

// PATCH /v1/convai/agents/{agent_id} → updated agent (we don't read the body)
async function updateAgent(
  apiKey: string,
  agentId: string,
  secretId: string,
  llmUrl: string,
) {
  await elevenFetch(`/v1/convai/agents/${agentId}`, {
    method: "PATCH",
    apiKey,
    body: {
      name: CONFIG.agentName,
      conversation_config: buildConversationConfig(secretId, llmUrl),
      platform_settings: PLATFORM_SETTINGS,
    },
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Edge case 1: missing API key.
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    fail(
      "ELEVENLABS_API_KEY is not set. Run with:\n" +
        "  npx tsx --env-file=.env.local scripts/setup-elevenlabs-agent.ts",
    );
  }

  // Edge case 2: founder forgot to edit the webhook URL.
  if (CONFIG.customLlm.url === PLACEHOLDER_URL || CONFIG.customLlm.url.trim() === "") {
    fail(
      "CONFIG.customLlm.url is still the placeholder. Edit it near the top of\n" +
        "this file with your webhook.site URL (base URL only) before running.",
    );
  }

  // The Bearer key ElevenLabs will send to /api/agent-llm. It MUST be present
  // and >= 32 chars, or the production route 500s ("server misconfiguration")
  // on every voice turn — the exact bug that silently broke voice-to-voice.
  if (CONFIG.customLlm.apiKeyValue.length < 32) {
    fail(
      "CUSTOM_LLM_KEY is missing or shorter than 32 characters.\n" +
        "The production /api/agent-llm route rejects every request when the key\n" +
        "is too short. Set a strong key (>= 32 chars) in .env.local AND in the\n" +
        "Vercel production env, then run:\n" +
        "  npx tsx --env-file=.env.local scripts/setup-elevenlabs-agent.ts",
    );
  }

  // Edge case 6: strip an accidental trailing /chat/completions (and slashes).
  const llmUrl = normalizeLlmUrl(CONFIG.customLlm.url);
  if (llmUrl !== CONFIG.customLlm.url.trim()) {
    console.log(`• Normalized custom LLM URL → ${llmUrl}`);
  }

  console.log(`\nProvisioning ElevenAgents agent "${CONFIG.agentName}"…\n`);

  // Step 2 — secret.
  const secretId = await ensureSecret(apiKey);

  // Step 3 — agent (create vs update).
  const existing = await findAgent(apiKey);
  let agentId: string;
  let action: "created" | "updated";

  if (existing) {
    agentId = existing.agent_id;
    await updateAgent(apiKey, agentId, secretId, llmUrl);
    action = "updated";
  } else {
    const created = await createAgent(apiKey, secretId, llmUrl);
    agentId = created.agent_id;
    action = "created";
  }

  // Step 4 — output.
  //
  // NOTE (deviation — agent ID prefix): the spec sample said "agt_xxxxx"; real
  // ElevenLabs IDs are "agent_…". We print the actual returned ID.
  //
  // NOTE (dashboard URL): the docs mirror was 404ing so the exact path could
  // not be confirmed. The primary link below is the most likely current path;
  // a fallback is printed in case the dashboard route differs.
  const dashboardUrl = `https://elevenlabs.io/app/agents/${agentId}`;
  const dashboardFallback = `https://elevenlabs.io/app/conversational-ai/agents/${agentId}`;

  console.log("\n──────────────────────────────────────────────────────────");
  console.log(`Agent ${action.toUpperCase()} this run.`);
  console.log(`Agent ID:        ${agentId}`);
  console.log(`Agent name:      ${CONFIG.agentName}`);
  console.log(`Custom LLM URL:  ${llmUrl}`);
  console.log(`Dashboard test URL: ${dashboardUrl}`);
  console.log(`  (if that 404s, try: ${dashboardFallback}`);
  console.log(`   or go to elevenlabs.io → Agents and open "${CONFIG.agentName}")`);
  console.log("──────────────────────────────────────────────────────────");
  console.log(
    "\nNext step: open the dashboard URL, click \"Test\" / \"Talk to your agent\",\n" +
      "say one Hindi sentence, then open your webhook.site page to inspect the\n" +
      "request payload ElevenLabs POSTed to <url>/chat/completions. (The agent\n" +
      "reply will fail because webhook.site doesn't return valid SSE — expected.)\n",
  );
}

main().catch((err) => {
  // Anything not already handled by fail() lands here (e.g. network error,
  // JSON parse failure). Surface it; never swallow.
  console.error("\n✗ Unexpected error:", err instanceof Error ? err.message : err);
  process.exit(1);
});

// This script imports nothing, so without an explicit export TypeScript treats
// it as a global script — and its top-level `main` collides in the shared
// global scope with the `main` in the project's other import-less one-off
// scripts (TS2393 "Duplicate function implementation"). The empty export marks
// this file as a module, scoping every declaration above to this file. No
// runtime effect; tsx runs it unchanged.
export {};
