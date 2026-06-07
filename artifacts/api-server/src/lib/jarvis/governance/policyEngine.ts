import type { JarvisPolicy } from "@workspace/db";
import type { GovernanceDecision, GovernedSubject } from "./types.js";

/**
 * Pure deterministic policy engine. Given a subject and a snapshot of policies it
 * resolves a base decision with NO side effects (the caller records the
 * evaluation and folds in trust/budget signals).
 *
 * Resolution (spec §1):
 *   1. keep `enabled` policies whose scope matches the subject
 *   2. effect precedence: deny > require_approval > allow (strongest wins)
 *   3. within the strongest effect: higher priority, then more-specific scope,
 *      then createdAt asc, then id asc
 *   4. default = allow when nothing matches
 *
 * Note: deny/require_approval beat allow REGARDLESS of priority — governance is
 * conservative by construction and can only narrow authority.
 */

const EFFECT_RANK: Record<string, number> = {
  deny: 3,
  require_approval: 2,
  allow: 1,
};

const SCOPE_SPECIFICITY: Record<string, number> = {
  action: 5,
  verb: 4,
  workflow: 4,
  agent_type: 3,
  category: 2,
  global: 1,
};

export interface PolicyDecision {
  decision: GovernanceDecision;
  policy: JarvisPolicy | null;
  reason: string;
}

function normalizeEffect(effect: string): GovernanceDecision {
  if (effect === "deny" || effect === "require_approval") return effect;
  return "allow";
}

export function scopeSpecificity(scopeType: string): number {
  return SCOPE_SPECIFICITY[scopeType] ?? 0;
}

/** Pure predicate: does this policy's scope apply to the subject? */
export function scopeMatches(policy: JarvisPolicy, subject: GovernedSubject): boolean {
  const value = policy.scopeValue?.toLowerCase().trim() ?? null;
  switch (policy.scopeType) {
    case "global":
      return true;
    case "agent_type":
      return !!subject.agentType && value === subject.agentType.toLowerCase();
    case "action":
      return !!subject.action && value === subject.action.toLowerCase();
    case "verb":
      return (
        (!!subject.verb && value === subject.verb.toLowerCase()) ||
        (!!subject.action && value === subject.action.toLowerCase())
      );
    case "category":
      return !!subject.category && value === subject.category.toLowerCase();
    case "workflow":
      return !!subject.workflowName && value === subject.workflowName.toLowerCase();
    default:
      return false;
  }
}

export function evaluatePolicy(
  subject: GovernedSubject,
  policies: JarvisPolicy[],
): PolicyDecision {
  const matched = policies.filter(
    (p) => p.enabled && scopeMatches(p, subject),
  );
  if (matched.length === 0) {
    return {
      decision: "allow",
      policy: null,
      reason: "no matching policy — default allow",
    };
  }

  const strongest = Math.max(
    ...matched.map((p) => EFFECT_RANK[p.effect] ?? EFFECT_RANK.allow),
  );
  const group = matched.filter(
    (p) => (EFFECT_RANK[p.effect] ?? EFFECT_RANK.allow) === strongest,
  );
  group.sort(
    (a, b) =>
      b.priority - a.priority ||
      scopeSpecificity(b.scopeType) - scopeSpecificity(a.scopeType) ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
      a.id.localeCompare(b.id),
  );
  const winner = group[0]!;
  return {
    decision: normalizeEffect(winner.effect),
    policy: winner,
    reason: `policy "${winner.name}" (${winner.scopeType}:${winner.scopeValue ?? "*"}) → ${winner.effect}`,
  };
}
