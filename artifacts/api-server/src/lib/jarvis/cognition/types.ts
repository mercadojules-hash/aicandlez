/**
 * Jarvis Cognition Layer (Sprint 8) — shared types.
 *
 * The cognition plane is ADVISORY-ONLY. It reasons over the Jarvis knowledge
 * corpus via an LLM and PROPOSES content (briefing drafts); it NEVER acts. The
 * deterministic control plane (orchestration + governance) is unchanged — the
 * governed action is PUBLISH, never the draft itself (decision D1). Cognition is
 * isolated to the `jarvis` product: `jarvis_`-prefixed tables only, no embeddings
 * (lexical retrieval + one-hop graph expansion only), no external integrations.
 * Spec: `.local/docs/jarvis-cognition-architecture.md`.
 */

/** Cognition surfaces enabled this sprint. Briefings are the only vertical slice. */
export type CognitionKind = "briefing";

/**
 * A reference into the Jarvis knowledge graph. `type` is one of the canonical
 * graph node types (matches `KNOWLEDGE_NODE_TYPES` in routes/jarvis.ts), so refs
 * are resolvable AND graph-expandable via `jarvis_knowledge_relationships`.
 */
export type GraphNodeType =
  | "memory"
  | "asset"
  | "category"
  | "decision"
  | "task";

export interface RetrievedRef {
  type: GraphNodeType;
  id: string;
}

export interface RetrievedDoc {
  type: GraphNodeType;
  id: string;
  title: string;
  text: string;
  /** Lexical overlap score (count of distinct query terms matched). */
  score: number;
  /** 0 = direct lexical hit, 1 = one-hop graph expansion. */
  hop: 0 | 1;
}

export interface RetrievalResult {
  docs: RetrievedDoc[];
  refs: RetrievedRef[];
}

/** A single proposed section, with the refs the model cited as support. */
export interface CognitionProposalSection {
  heading: string;
  body: string;
  citations: RetrievedRef[];
}

/** The advisory proposal returned by the model (parsed + normalized). */
export interface CognitionProposal {
  title: string;
  summary: string;
  /** Assembled markdown body built from the sections. */
  content: string;
  sections: CognitionProposalSection[];
  /** Union of all section citations, deduped + validated against retrieval. */
  citations: RetrievedRef[];
}

/**
 * Terminal status of a cognition run. Everything except "ok" is a fail-safe
 * outcome — the caller keeps the existing surface unchanged (no draft written on
 * degraded/error/budget_exceeded/disabled).
 */
export type CognitionStatus =
  | "ok"
  | "degraded"
  | "error"
  | "budget_exceeded"
  | "disabled";

export interface CognitionResult {
  runId: string | null;
  status: CognitionStatus;
  proposal: CognitionProposal | null;
  /** 0..100 — fraction of cited refs that exist in the retrieval set. */
  groundingScore: number | null;
  citations: RetrievedRef[];
  retrievedRefs: RetrievedRef[];
  model: string | null;
  promptHash: string | null;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  latencyMs: number | null;
  error: string | null;
  /** Human-readable reason when status !== "ok". */
  degradedReason: string | null;
}

/** Input to `think()` — describes the reasoning task, NOT how to act on it. */
export interface ThinkInput {
  kind: CognitionKind;
  /** Free-text focus / topic used for lexical retrieval. */
  query: string;
  /** Optional extra task guidance folded into the user prompt. */
  instructions?: string | null;
  period?: string | null;
  audience?: string | null;
  businessId?: string | null;
  createdBy?: string | null;
  agentId?: string | null;
  agentType?: string | null;
  /** Max direct (hop-0) docs to retrieve. Default 8. */
  maxDocs?: number;
}
