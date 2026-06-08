/**
 * Voice interface shared types (Voice v1).
 *
 * The control plane — NOT the model — owns intent. A transcript is classified
 * deterministically into exactly one of the 7 read/advisory capabilities or a
 * control outcome (`clarify`/`reject`). There is NO state-changing capability in
 * v1, so the router can never route to an effector.
 */

export const VOICE_CAPABILITIES = [
  "executive_briefing",
  "memory_query",
  "knowledge_search",
  "agent_status",
  "task_lookup",
  "project_lookup",
  "report_generation",
] as const;

export type VoiceCapability = (typeof VOICE_CAPABILITIES)[number];

/** Capability ids plus deterministic control outcomes. */
export type VoiceIntent = VoiceCapability | "clarify" | "reject";

/** A citation to a read entity surfaced to the executive. Free-form by design. */
export interface VoiceLink {
  type: string;
  id: string;
}

/** Output of the deterministic classifier. Pure data, no side effects. */
export interface IntentClassification {
  intent: VoiceIntent;
  /** The resolved capability, or null for clarify/reject. */
  capability: VoiceCapability | null;
  /** 0–100 deterministic confidence (pattern-match strength, NOT an LLM score). */
  confidence: number;
  /** Filler-stripped topic forwarded to the handler. */
  query: string;
  /** Human-readable reason when intent is clarify/reject. */
  reason: string | null;
}

/** Read scope passed to a capability handler. */
export interface VoiceCapabilityContext {
  query: string;
  businessId?: string | null;
  createdBy?: string | null;
  executiveUserId?: string | null;
  /** Bounded prior-turn context (S9 token-budgeted) folded into cognition drafts. */
  priorContext?: string | null;
}

/** Result of a capability handler — advisory only, never an effector outcome. */
export interface VoiceCapabilityResult {
  ok: boolean;
  capability: VoiceCapability;
  /** Concise spoken-back advisory text. */
  replyText: string;
  /** Read entities cited in the reply. */
  links: VoiceLink[];
  /** Linked cognition ledger row when a draft was reasoned (briefing/report). */
  cognitionRunId: string | null;
  /** Provider cost attributable to THIS handler (cognition self-meters its own). */
  costMicros: number;
  /** "ok" | "empty" | "degraded" | "error". */
  status: string;
  error: string | null;
}
