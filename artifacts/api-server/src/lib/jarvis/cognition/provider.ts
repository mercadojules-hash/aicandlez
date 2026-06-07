/**
 * Cognition provider — the ONLY place the cognition layer talks to the LLM.
 *
 * SOVEREIGNTY PROVIDER PRIORITY (selection by key availability, not error
 * cascade): so Jarvis can reason WITHOUT Replit as the primary compute provider,
 * `callModel` picks its provider in this order:
 *   1. ANTHROPIC_API_KEY present -> direct `@anthropic-ai/sdk` (claude-sonnet-4-6)
 *   2. else OPENAI_API_KEY present -> direct `openai` chat completions
 *      (default gpt-4o, override via JARVIS_OPENAI_COGNITION_MODEL)
 *   3. else -> the Replit AI Integrations proxy via the shared
 *      `@workspace/integrations-anthropic-ai` client (no raw key; billed to
 *      credits) — the original path, now the LAST-resort fallback.
 *
 * Every call is FAIL-SAFE: a provider/timeout/parse failure resolves to
 * `{ ok:false }` (never throws), so an LLM outage degrades cognition without
 * touching the deterministic AICandlez plane.
 *
 * Every provider client is imported LAZILY inside its helper (never at top
 * level). The shared proxy client THROWS at module-eval when its integration env
 * is missing, and the direct SDKs are optional too: a missing/unprovisioned
 * provider must DEGRADE cognition, NOT crash the api-server boot — which would
 * take down the deterministic AICandlez plane with it.
 *
 * The shared `@workspace/integrations-anthropic-ai` library is NOT modified; we
 * only reorder which client `callModel` reaches for first.
 */

export const COGNITION_MODEL = "claude-sonnet-4-6";
export const COGNITION_MAX_TOKENS = 8192;
export const COGNITION_TIMEOUT_MS = 45_000;

/** Default OpenAI chat model for the direct-OpenAI cognition path. */
const DEFAULT_OPENAI_COGNITION_MODEL = "gpt-4o";

// Sonnet pricing expressed in USD-micros per token (1 micro = 1e-6 USD).
// Used only for the cost_micros audit + the cognition budget ledger — it is an
// estimate, never a billing source of truth.
const INPUT_MICROS_PER_TOKEN = 3; // ~$3 / 1M input tokens
const OUTPUT_MICROS_PER_TOKEN = 15; // ~$15 / 1M output tokens

export function estimateCostMicros(
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    inputTokens * INPUT_MICROS_PER_TOKEN +
    outputTokens * OUTPUT_MICROS_PER_TOKEN
  );
}

// gpt-4o list price in USD-micros per token (~$2.50 / 1M input, ~$10 / 1M
// output). Estimate only, for the direct-OpenAI cognition path's cost_micros
// audit + budget ledger — never a billing source of truth. If
// JARVIS_OPENAI_COGNITION_MODEL points at a differently-priced model this stays
// a gpt-4o-rate approximation, mirroring how the Anthropic path approximates.
const OPENAI_INPUT_MICROS_PER_TOKEN = 2.5;
const OPENAI_OUTPUT_MICROS_PER_TOKEN = 10;

export function estimateOpenAiCostMicros(
  inputTokens: number,
  outputTokens: number,
): number {
  return Math.ceil(
    inputTokens * OPENAI_INPUT_MICROS_PER_TOKEN +
      outputTokens * OPENAI_OUTPUT_MICROS_PER_TOKEN,
  );
}

export interface ProviderCallInput {
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ProviderCallResult {
  ok: boolean;
  text: string | null;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  latencyMs: number;
  model: string;
  error: string | null;
}

function failure(
  startedAt: number,
  model: string,
  err: unknown,
): ProviderCallResult {
  return {
    ok: false,
    text: null,
    inputTokens: 0,
    outputTokens: 0,
    costMicros: 0,
    latencyMs: Date.now() - startedAt,
    model,
    error: err instanceof Error ? err.message : String(err),
  };
}

/** Direct Anthropic SDK path — used when ANTHROPIC_API_KEY is present. */
async function callAnthropicDirect(
  input: ProviderCallInput,
  apiKey: string,
): Promise<ProviderCallResult> {
  const startedAt = Date.now();
  const model = COGNITION_MODEL;
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create(
      {
        model,
        max_tokens: input.maxTokens ?? COGNITION_MAX_TOKENS,
        system: input.system,
        messages: [{ role: "user", content: input.user }],
      },
      { timeout: input.timeoutMs ?? COGNITION_TIMEOUT_MS },
    );

    const text = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    const inputTokens = message.usage?.input_tokens ?? 0;
    const outputTokens = message.usage?.output_tokens ?? 0;

    return {
      ok: true,
      text: text.length > 0 ? text : null,
      inputTokens,
      outputTokens,
      costMicros: estimateCostMicros(inputTokens, outputTokens),
      latencyMs: Date.now() - startedAt,
      model,
      error: null,
    };
  } catch (err) {
    return failure(startedAt, model, err);
  }
}

/** Direct OpenAI SDK path — used when OPENAI_API_KEY is present (no Anthropic). */
async function callOpenAiDirect(
  input: ProviderCallInput,
  apiKey: string,
): Promise<ProviderCallResult> {
  const startedAt = Date.now();
  const model =
    process.env.JARVIS_OPENAI_COGNITION_MODEL?.trim() ||
    DEFAULT_OPENAI_COGNITION_MODEL;
  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({
      apiKey,
      timeout: input.timeoutMs ?? COGNITION_TIMEOUT_MS,
    });
    const completion = await client.chat.completions.create({
      model,
      max_tokens: input.maxTokens ?? COGNITION_MAX_TOKENS,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    });

    const text = (completion.choices[0]?.message?.content ?? "").trim();
    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;

    return {
      ok: true,
      text: text.length > 0 ? text : null,
      inputTokens,
      outputTokens,
      // OpenAI-rate estimate (gpt-4o) — keeps the budget ledger attribution
      // correct for this provider; estimate only, never a billing SoT.
      costMicros: estimateOpenAiCostMicros(inputTokens, outputTokens),
      latencyMs: Date.now() - startedAt,
      model,
      error: null,
    };
  } catch (err) {
    return failure(startedAt, model, err);
  }
}

/** Replit AI Integrations proxy path — last-resort fallback (no raw key). */
async function callReplitProxy(
  input: ProviderCallInput,
): Promise<ProviderCallResult> {
  const startedAt = Date.now();
  const model = COGNITION_MODEL;
  try {
    const { anthropic } = await import("@workspace/integrations-anthropic-ai");
    const message = await anthropic.messages.create(
      {
        model,
        max_tokens: input.maxTokens ?? COGNITION_MAX_TOKENS,
        system: input.system,
        messages: [{ role: "user", content: input.user }],
      },
      { timeout: input.timeoutMs ?? COGNITION_TIMEOUT_MS },
    );

    const text = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    const inputTokens = message.usage?.input_tokens ?? 0;
    const outputTokens = message.usage?.output_tokens ?? 0;

    return {
      ok: true,
      text: text.length > 0 ? text : null,
      inputTokens,
      outputTokens,
      costMicros: estimateCostMicros(inputTokens, outputTokens),
      latencyMs: Date.now() - startedAt,
      model,
      error: null,
    };
  } catch (err) {
    return failure(startedAt, model, err);
  }
}

/**
 * Single non-streaming advisory call. Never throws — failures are returned.
 * Provider is selected by key availability (see file header): direct Anthropic ->
 * direct OpenAI -> Replit proxy. Selection is independent of call outcome; a
 * provider failure returns `{ ok:false }` rather than cascading to the next one,
 * so cost + audit attribution stay deterministic.
 */
export async function callModel(
  input: ProviderCallInput,
): Promise<ProviderCallResult> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    return callAnthropicDirect(input, anthropicKey);
  }
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return callOpenAiDirect(input, openaiKey);
  }
  return callReplitProxy(input);
}
