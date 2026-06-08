/**
 * Creative provider abstraction.
 *
 * The TEXT path reuses the cognition sovereign LLM client (`callModel`) — same
 * provider precedence (ANTHROPIC_API_KEY → OPENAI_API_KEY → Replit proxy), same
 * fail-safe contract (never throws), same cost accounting. This keeps ONE audited
 * LLM path for the whole Jarvis product.
 *
 * The IMAGE path (Vision, Phase 2) follows the SAME sovereignty rule: a direct
 * provider first, a Replit-managed fallback only if available. Selection is by
 * key availability, not error cascade:
 *   1. OPENAI_API_KEY present → direct OpenAI Images API (`gpt-image-1`).
 *   2. else → no image provider wired (degrades; NEVER throws). A Replit-proxy
 *      image fallback is reserved for when a managed image client lib exists; we
 *      do not invent a dependency. Anthropic has no image API, so it is skipped.
 * Bytes are returned in-memory; the caller uploads them to object storage and the
 * DB holds only the storage key + metadata (never the bytes).
 *
 * The VIDEO path is reserved for Phoenix (Phase 3) and intentionally NOT built.
 * `MEDIA_PROVIDER_STATUS` advertises current availability so callers degrade
 * gracefully instead of failing.
 */

import {
  callModel,
  type ProviderCallInput,
  type ProviderCallResult,
} from "../cognition/provider.js";

export type CreativeMediaKind = "text" | "image" | "video";

export interface CreativeProviderStatus {
  kind: CreativeMediaKind;
  available: boolean;
  note: string;
}

/** True when a direct image provider key is present (OpenAI Images). */
export function imageProviderAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export const MEDIA_PROVIDER_STATUS: Record<
  CreativeMediaKind,
  CreativeProviderStatus
> = {
  text: {
    kind: "text",
    available: true,
    note: "sovereign LLM via cognition callModel",
  },
  image: {
    kind: "image",
    available: imageProviderAvailable(),
    note: imageProviderAvailable()
      ? "Vision (Phase 2) — direct OpenAI Images (gpt-image-1)"
      : "Vision (Phase 2) — no image provider key present (set OPENAI_API_KEY); degrades",
  },
  video: {
    kind: "video",
    available: false,
    note: "Phoenix (Phase 3) — programmatic video, not yet built",
  },
};

/** Text generation for creative agents. Thin, audited pass-through to cognition. */
export async function callCreativeText(
  call: ProviderCallInput,
): Promise<ProviderCallResult> {
  return callModel(call);
}

/** Image aspect ratios Vision can request (mapped to provider sizes). */
export type CreativeImageAspect = "1:1" | "4:3" | "16:9" | "3:4" | "9:16";

const DEFAULT_IMAGE_MODEL = "gpt-image-1";
const IMAGE_TIMEOUT_MS = 90_000;

/**
 * Fixed per-image cost estimate in USD-micros for the budget ledger (gpt-image-1
 * medium-quality 1024px ≈ $0.04). Estimate only, never a billing SoT. Overridable
 * via JARVIS_IMAGE_COST_MICROS for a different model/quality tier.
 */
function imageCostMicros(): number {
  const raw = process.env.JARVIS_IMAGE_COST_MICROS;
  if (raw && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return 40_000;
}

/** OpenAI Images supports a fixed size set; map aspect → nearest supported size. */
function aspectToSize(aspect: CreativeImageAspect): string {
  switch (aspect) {
    case "16:9":
    case "4:3":
      return "1536x1024";
    case "9:16":
    case "3:4":
      return "1024x1536";
    case "1:1":
    default:
      return "1024x1024";
  }
}

export interface CreativeImageInput {
  prompt: string;
  aspect?: CreativeImageAspect;
  timeoutMs?: number;
}

export interface CreativeImageResult {
  ok: boolean;
  /** PNG bytes when ok; null otherwise. Never persisted to Postgres. */
  bytes: Buffer | null;
  mimeType: string;
  model: string;
  costMicros: number;
  latencyMs: number;
  error: string | null;
}

function imageFailure(
  startedAt: number,
  model: string,
  err: unknown,
): CreativeImageResult {
  return {
    ok: false,
    bytes: null,
    mimeType: "image/png",
    model,
    costMicros: 0,
    latencyMs: Date.now() - startedAt,
    error: err instanceof Error ? err.message : String(err),
  };
}

/** Direct OpenAI Images path — used when OPENAI_API_KEY is present. */
async function generateImageOpenAi(
  input: CreativeImageInput,
  apiKey: string,
): Promise<CreativeImageResult> {
  const startedAt = Date.now();
  const model =
    process.env.JARVIS_OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({
      apiKey,
      timeout: input.timeoutMs ?? IMAGE_TIMEOUT_MS,
    });
    const result = await client.images.generate({
      model,
      prompt: input.prompt,
      size: aspectToSize(input.aspect ?? "1:1") as never,
      n: 1,
    });
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      return {
        ok: false,
        bytes: null,
        mimeType: "image/png",
        model,
        costMicros: 0,
        latencyMs: Date.now() - startedAt,
        error: "image provider returned no image data",
      };
    }
    return {
      ok: true,
      bytes: Buffer.from(b64, "base64"),
      mimeType: "image/png",
      model,
      costMicros: imageCostMicros(),
      latencyMs: Date.now() - startedAt,
      error: null,
    };
  } catch (err) {
    return imageFailure(startedAt, model, err);
  }
}

/**
 * Generate a single image. Never throws — a missing provider / outage / timeout
 * resolves to `{ ok:false }` so Vision degrades (no draft image) without touching
 * the deterministic plane. Direct provider first; no fabricated fallback.
 */
export async function callCreativeImage(
  input: CreativeImageInput,
): Promise<CreativeImageResult> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return generateImageOpenAi(input, openaiKey);
  }
  return {
    ok: false,
    bytes: null,
    mimeType: "image/png",
    model: "none",
    costMicros: 0,
    latencyMs: 0,
    error: "no image provider available (set OPENAI_API_KEY)",
  };
}

export {
  type ProviderCallInput,
  type ProviderCallResult,
} from "../cognition/provider.js";
