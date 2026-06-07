/**
 * Cognition provider — the ONLY place the cognition layer talks to the LLM.
 * Uses the Replit AI Integrations proxy (no raw key; billed to credits) via the
 * shared `@workspace/integrations-anthropic-ai` client. Every call is FAIL-SAFE:
 * a provider/timeout/parse failure resolves to `{ ok:false }` (never throws), so
 * an LLM outage degrades cognition without touching the deterministic plane.
 *
 * The shared client THROWS at module-eval when the Anthropic integration env is
 * missing. We therefore import it LAZILY inside `callModel` (never at top level):
 * a missing/unprovisioned integration must degrade cognition, NOT crash the
 * api-server boot — which would take down the deterministic AICandlez plane too.
 */

export const COGNITION_MODEL = "claude-sonnet-4-6";
export const COGNITION_MAX_TOKENS = 8192;
export const COGNITION_TIMEOUT_MS = 45_000;

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

/** Single non-streaming advisory call. Never throws — failures are returned. */
export async function callModel(
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
}
