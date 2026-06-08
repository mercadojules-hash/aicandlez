/**
 * Jarvis Governance Layer (Sprint 7) — shared types.
 *
 * Governance is a deterministic policy layer that gates every orchestration
 * action (command / delegation / workflow step / escalation) BEFORE it executes.
 * It is advisory-safe and MONOTONIC: it can only NARROW agent authority
 * (allow → require_approval → deny), never widen it. Pure decision logic lives in
 * `policyEngine.ts`; trust + budget signals fold in via `index.ts`.
 * Spec: `.local/docs/jarvis-governance-spec.md`.
 */

export type GovernanceDecision = "allow" | "deny" | "require_approval";

export type GovernedSubjectType =
  | "command"
  | "delegation"
  | "workflow_step"
  | "escalation";

/** A single governed action presented to the policy engine. */
export interface GovernedSubject {
  subjectType: GovernedSubjectType;
  subjectId: string;
  agentId?: string | null;
  agentType?: string | null;
  /** The action/verb the agent is about to perform. */
  action?: string | null;
  verb?: string | null;
  category?: string | null;
  workflowName?: string | null;
}

/** Effective state of the most-constraining budget matched by a subject. */
export interface BudgetState {
  budgetId: string;
  name: string;
  consumed: number;
  limitCount: number;
  windowSeconds: number;
  exceeded: boolean;
}

/** Optional per-policy conditions that escalate (never relax) a decision. */
export interface PolicyConditions {
  minTrustScore?: number;
  maxPerWindow?: number;
  windowSeconds?: number;
}

/** The combined governance verdict for a subject. */
export interface GovernanceResult {
  decision: GovernanceDecision;
  policyId: string | null;
  policyName: string | null;
  reason: string;
  requireApprovalRole: string;
  trustScore: number | null;
  matchedBudget: BudgetState | null;
}
