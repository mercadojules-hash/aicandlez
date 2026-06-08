import { db } from "@workspace/db";
import { jarvisRoutingRulesTable, type JarvisRoutingRule } from "@workspace/db";
import { asc } from "drizzle-orm";

/**
 * Deterministic command router. Given a normalized RouteInput, it picks the
 * single best enabled routing rule whose predicate matches — ordered by
 * `priority` desc, then `createdAt,id` for a stable tie-break — and resolves the
 * target agent type. When nothing matches it falls back to `chief_of_staff`.
 *
 * Pure logic (`matchRule`/`selectRule`) is separated from the DB read so it can
 * be reasoned about and unit-tested in isolation.
 */

const DEFAULT_FALLBACK_AGENT = "chief_of_staff";

export interface RouteInput {
  /** Executive command verb (exact match against rule.matchValue). */
  verb?: string | null;
  /** Domain category, e.g. "ops" / "risk" / "qa". */
  category?: string | null;
  /** A required capability the target must advertise. */
  capability?: string | null;
  /** Free-text + extra keywords for substring keyword matching. */
  text?: string | null;
  keywords?: string[];
}

export interface RouteResult {
  targetAgentType: string;
  ruleId: string | null;
  chainId: string | null;
  reason: string;
  fallback: boolean;
}

export function matchRule(rule: JarvisRoutingRule, input: RouteInput): boolean {
  const value = rule.matchValue?.toLowerCase() ?? null;
  switch (rule.matchType) {
    case "any":
      return true;
    case "command":
      return !!input.verb && value === input.verb.toLowerCase();
    case "category":
      return !!input.category && value === input.category.toLowerCase();
    case "capability":
      return !!input.capability && value === input.capability.toLowerCase();
    case "keyword": {
      if (!value) return false;
      const hay = [input.text ?? "", ...(input.keywords ?? [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(value);
    }
    default:
      return false;
  }
}

/**
 * Selects the winning rule from a pre-ordered snapshot. Filters to enabled +
 * matching, then sorts by priority desc, createdAt asc, id asc. Pure.
 */
export function selectRule(
  rules: JarvisRoutingRule[],
  input: RouteInput,
): JarvisRoutingRule | null {
  const matches = rules
    .filter((r) => r.enabled)
    .filter((r) => matchRule(r, input));
  if (matches.length === 0) return null;
  matches.sort(
    (a, b) =>
      b.priority - a.priority ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
      a.id.localeCompare(b.id),
  );
  return matches[0] ?? null;
}

export async function routeCommand(input: RouteInput): Promise<RouteResult> {
  const rules = await db
    .select()
    .from(jarvisRoutingRulesTable)
    .orderBy(asc(jarvisRoutingRulesTable.createdAt), asc(jarvisRoutingRulesTable.id));
  const rule = selectRule(rules, input);
  if (rule) {
    return {
      targetAgentType:
        rule.targetAgentType ?? rule.fallbackAgentType ?? DEFAULT_FALLBACK_AGENT,
      ruleId: rule.id,
      chainId: rule.chainId ?? null,
      reason: `matched rule "${rule.name}" (${rule.matchType}:${rule.matchValue ?? "*"})`,
      fallback: false,
    };
  }
  return {
    targetAgentType: DEFAULT_FALLBACK_AGENT,
    ruleId: null,
    chainId: null,
    reason: "no routing rule matched — fallback to chief_of_staff",
    fallback: true,
  };
}
