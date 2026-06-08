import { db } from "@workspace/db";
import { jarvisBudgetsTable, type JarvisBudget } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import type { BudgetState, GovernedSubject } from "./types.js";

/**
 * Deterministic quota / rate-limit budgets. A budget caps how many governed
 * actions of a given scope may run within a rolling window. Window math is
 * explicit: `windowStartedAt + windowSeconds <= now` ⇒ the window has rolled and
 * `consumed` resets to 0. Pure window/scope helpers are separated from the DB.
 */

/** Pure: has the budget's rolling window elapsed? */
export function isWindowExpired(
  windowStartedAt: Date | null,
  windowSeconds: number,
  now: Date,
): boolean {
  if (!windowStartedAt) return true;
  return windowStartedAt.getTime() + windowSeconds * 1000 <= now.getTime();
}

/** Pure predicate: does this budget's scope apply to the subject? */
export function budgetMatches(budget: JarvisBudget, subject: GovernedSubject): boolean {
  const value = budget.scopeValue?.toLowerCase().trim() ?? null;
  switch (budget.scopeType) {
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
    default:
      return false;
  }
}

function effectiveState(budget: JarvisBudget, now: Date): BudgetState {
  const expired = isWindowExpired(budget.windowStartedAt, budget.windowSeconds, now);
  const consumed = expired ? 0 : budget.consumed;
  return {
    budgetId: budget.id,
    name: budget.name,
    consumed,
    limitCount: budget.limitCount,
    windowSeconds: budget.windowSeconds,
    exceeded: budget.limitCount > 0 && consumed >= budget.limitCount,
  };
}

/**
 * Returns the most-constraining matched budget for a subject, or null if none
 * apply. Read-only — `consumeBudget` performs the increment when an action is
 * allowed.
 */
export async function checkBudget(
  subject: GovernedSubject,
): Promise<BudgetState | null> {
  const now = new Date();
  const budgets = await db
    .select()
    .from(jarvisBudgetsTable)
    .where(eq(jarvisBudgetsTable.enabled, true))
    .orderBy(asc(jarvisBudgetsTable.createdAt), asc(jarvisBudgetsTable.id));
  const matched = budgets
    .filter((b) => b.limitCount > 0 && budgetMatches(b, subject))
    .map((b) => effectiveState(b, now));
  if (matched.length === 0) return null;
  const exceeded = matched.find((s) => s.exceeded);
  if (exceeded) return exceeded;
  matched.sort(
    (a, b) => b.consumed / b.limitCount - a.consumed / a.limitCount,
  );
  return matched[0] ?? null;
}

/** Increment every matched budget by one, rolling the window first if expired. */
export async function consumeBudget(subject: GovernedSubject): Promise<void> {
  const now = new Date();
  const budgets = await db
    .select()
    .from(jarvisBudgetsTable)
    .where(eq(jarvisBudgetsTable.enabled, true))
    .orderBy(asc(jarvisBudgetsTable.createdAt), asc(jarvisBudgetsTable.id));
  const matched = budgets.filter(
    (b) => b.limitCount > 0 && budgetMatches(b, subject),
  );
  for (const b of matched) {
    const expired = isWindowExpired(b.windowStartedAt, b.windowSeconds, now);
    await db
      .update(jarvisBudgetsTable)
      .set({
        consumed: expired ? 1 : b.consumed + 1,
        windowStartedAt: expired ? now : b.windowStartedAt,
        updatedAt: now,
      })
      .where(eq(jarvisBudgetsTable.id, b.id));
  }
}

/** Maintenance pass: reset enabled budgets whose rolling window has elapsed. */
export async function resetExpiredBudgets(): Promise<number> {
  const now = new Date();
  const budgets = await db
    .select()
    .from(jarvisBudgetsTable)
    .where(and(eq(jarvisBudgetsTable.enabled, true)))
    .orderBy(asc(jarvisBudgetsTable.createdAt), asc(jarvisBudgetsTable.id));
  let reset = 0;
  for (const b of budgets) {
    if (b.consumed > 0 && isWindowExpired(b.windowStartedAt, b.windowSeconds, now)) {
      await db
        .update(jarvisBudgetsTable)
        .set({ consumed: 0, windowStartedAt: now, updatedAt: now })
        .where(eq(jarvisBudgetsTable.id, b.id));
      reset += 1;
    }
  }
  return reset;
}
