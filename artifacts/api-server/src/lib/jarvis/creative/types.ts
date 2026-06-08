/**
 * Jarvis Creative Intelligence Division — shared types (Phase 0 / Phase 1).
 *
 * The creative plane is ADVISORY-ONLY, mirroring cognition. Agents (Prometheus
 * marketing, Vision images, Phoenix video) PROPOSE drafts grounded on the
 * Business Registry, per-business Brand Profile, and Executive Memory. They never
 * act, never publish, and never auto-post. Publication is the governed action
 * (see publishGate.ts). Scoped to `jarvis_`-prefixed tables only.
 */

import type { RetrievedRef } from "../cognition/types.js";

/** The creative agents. Vision/Phoenix are reserved for later phases. */
export type CreativeAgent = "prometheus" | "vision" | "phoenix";

/**
 * Artifact types a creative agent can produce. Text kinds carry `bodyText`;
 * binary kinds (image/video — later phases) carry an object-storage `storageKey`.
 */
export type CreativeAssetKind =
  | "strategy"
  | "content_calendar"
  | "ad_concept"
  | "ad_copy"
  | "creative_brief"
  | "social_post"
  | "social_schedule"
  | "funnel_plan"
  | "launch_plan"
  | "image"
  | "storyboard"
  | "scene_breakdown"
  | "video";

/** A single dated entry in the content calendar. */
export interface ContentCalendarEntry {
  day: number;
  channel: string;
  theme: string;
  format: string;
  copy: string;
  cta?: string;
}

/** A single advertising concept (advisory — never auto-trafficked). */
export interface AdConcept {
  title: string;
  channel: string;
  angle: string;
  headline: string;
  primaryText: string;
  cta: string;
  visualDirection: string;
}

/** A creative brief handed to a designer / Vision / Phoenix downstream. */
export interface CreativeBrief {
  title: string;
  objective: string;
  deliverable: string;
  audience: string;
  keyMessage: string;
  toneNotes: string;
  specs?: string;
}

/** A single scheduled social post (advisory — never auto-posted). */
export interface SocialScheduleEntry {
  day: number;
  platform: string;
  time?: string;
  postType: string;
  caption: string;
  hashtags?: string[];
}

/** A marketing-funnel stage plan. */
export interface FunnelStage {
  stage: string;
  goal: string;
  tactic: string;
  metric: string;
}

/** A launch-plan phase. */
export interface LaunchPhase {
  phase: string;
  window: string;
  actions: string[];
}

/**
 * The structured campaign proposal returned by Prometheus (parsed + normalized).
 * Everything is advisory text; citations are validated against the retrieval set.
 */
export interface CampaignProposal {
  name: string;
  objective: string;
  audience: string;
  durationDays: number;
  strategy: string;
  contentCalendar: ContentCalendarEntry[];
  adConcepts: AdConcept[];
  creativeBriefs: CreativeBrief[];
  socialSchedule: SocialScheduleEntry[];
  funnelPlan: FunnelStage[];
  launchPlan: LaunchPhase[];
  citations: RetrievedRef[];
}

/** Aspect ratios Vision can request for a generated image. */
export type VisionImageAspect = "1:1" | "4:3" | "16:9" | "3:4" | "9:16";

/**
 * A single Vision creative concept: the advisory ad concept (copy + direction)
 * PLUS the image-generation brief (prompt/negativePrompt/aspect) used to draft a
 * marketing image for it. Copy may be original; business facts stay grounded.
 */
export interface VisionConcept {
  title: string;
  channel: string;
  angle: string;
  headline: string;
  primaryText: string;
  cta: string;
  visualDirection: string;
  imagePrompt: string;
  negativePrompt?: string;
  aspect?: VisionImageAspect;
}

/** Parsed + normalized Vision proposal (a draft creative package). */
export interface VisionProposal {
  packageName: string;
  objective: string;
  audience: string;
  concepts: VisionConcept[];
  citations: RetrievedRef[];
}

/** Input to Vision concept generation. */
export interface GenerateVisionInput {
  businessId: string;
  /** Free-text brief — e.g. "5 Facebook ad concepts". */
  query: string;
  channel?: string | null;
  objective?: string | null;
  audience?: string | null;
  /** How many concepts to draft (clamped server-side). */
  conceptCount?: number | null;
  instructions?: string | null;
  /** Attach to an existing campaign instead of creating a package. */
  campaignId?: string | null;
  createdBy?: string | null;
  executiveUserId?: string | null;
}

/* ---------------------------------------------------------------------------
 * Phoenix (Phase 3) — programmatic video creative agent.
 *
 * Phoenix drafts a STORYBOARD + SCENE BREAKDOWN (grounded text) and renders
 * best-effort MP4 renditions PROGRAMMATICALLY (local ffmpeg) — no AI video clip
 * provider, no ElevenLabs, no new secrets. The scene breakdown doubles as a
 * portable, re-renderable RENDER MANIFEST: a Vault-safe SoT that can be rendered
 * anywhere ffmpeg exists, so the durable intelligence never depends on a binary.
 * ------------------------------------------------------------------------- */

/** Output renditions Phoenix can render. 16:9 = marketing video, 9:16 = reel. */
export type PhoenixVideoFormat = "16:9" | "9:16" | "1:1";

/**
 * A single storyboard scene — the atomic render unit. Colors are validated hex
 * (honoring the brand palette); `voiceover` is a NARRATION SCRIPT only (Tier-1
 * never synthesizes audio — no ElevenLabs). `motion` is an advisory hint.
 */
export interface PhoenixScene {
  index: number;
  /** Seconds on screen (clamped 1–10 at render). */
  durationSec: number;
  /** Background fill, 6-digit hex (no leading #). */
  bgColor: string;
  /** Text color, 6-digit hex (no leading #). */
  textColor: string;
  title: string;
  caption: string;
  /** Narration script (advisory text; NOT synthesized in Tier-1). */
  voiceover?: string;
  /** Advisory motion hint (e.g. "fade", "slide", "zoom"). */
  motion?: string;
}

/**
 * Parsed + normalized Phoenix storyboard (a draft creative package). This object
 * IS the render manifest — serialized into the scene_breakdown asset so the video
 * is re-renderable from Postgres metadata alone (Vault portability).
 */
export interface PhoenixStoryboard {
  packageName: string;
  objective: string;
  audience: string;
  /** One-line creative concept. */
  logline: string;
  /** Target total length in seconds (clamped). */
  durationSec: number;
  scenes: PhoenixScene[];
  citations: RetrievedRef[];
}

/** Input to Phoenix storyboard + video synthesis. */
export interface GeneratePhoenixInput {
  businessId: string;
  /** Free-text brief — e.g. "30-second promotional video". */
  query: string;
  objective?: string | null;
  audience?: string | null;
  /** Target length in seconds (clamped server-side). */
  durationSec?: number | null;
  /** Which renditions to render; default ["16:9", "9:16"]. */
  formats?: PhoenixVideoFormat[] | null;
  instructions?: string | null;
  /** Attach to an existing campaign instead of creating a package. */
  campaignId?: string | null;
  createdBy?: string | null;
  executiveUserId?: string | null;
}

/** Terminal status of a creative synthesis run (mirrors CognitionStatus). */
export type CreativeStatus =
  | "ok"
  | "degraded"
  | "error"
  | "budget_exceeded"
  | "disabled";

/** Input to Prometheus campaign synthesis. */
export interface GenerateCampaignInput {
  businessId: string;
  /** Free-text focus — e.g. "30-day marketing campaign". */
  query: string;
  objective?: string | null;
  channel?: string | null;
  audience?: string | null;
  durationDays?: number | null;
  instructions?: string | null;
  createdBy?: string | null;
  /** Optional executive scope — personalizes memory recall. */
  executiveUserId?: string | null;
}
