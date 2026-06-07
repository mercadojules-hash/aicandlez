/**
 * Creative provider abstraction (Phase 0).
 *
 * The TEXT path reuses the cognition sovereign LLM client (`callModel`) — same
 * provider precedence (ANTHROPIC_API_KEY → OPENAI_API_KEY → Replit proxy), same
 * fail-safe contract (never throws), same cost accounting. This keeps ONE audited
 * LLM path for the whole Jarvis product.
 *
 * The IMAGE and VIDEO paths are reserved for Vision (Phase 2) and Phoenix
 * (Phase 3). They are intentionally NOT implemented here and require NO new
 * secrets — when built they will route through the media-generation skill
 * (programmatic / Tier-1) and store binaries in object storage, with the DB
 * holding only the storage key + metadata. `MEDIA_PROVIDER_STATUS` advertises
 * current availability so callers degrade gracefully instead of failing.
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
    available: false,
    note: "Vision (Phase 2) — programmatic/Tier-1 media generation, not yet built",
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

export {
  type ProviderCallInput,
  type ProviderCallResult,
} from "../cognition/provider.js";
