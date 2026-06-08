import { db } from "@workspace/db";
import { jarvisBudgetsTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { isWindowExpired } from "../governance/budgets.js";

/**
 * Cognition cost budget — reuses the existing `jarvis_budgets` table (decision
 * D3, NO schema change). Cognition budgets are rows with `scopeType="cognition"`;
 * `limitCount` is interpreted as a cost ceiling in USD-micros and `consumed` as
 * micros spent in the current rolling window. The governance budget engine does
 * NOT match `scopeType="cognition"`, so cognition owns this ledger separately —
 * keeping the deterministic governance budgets untouched.
 *
 * Absence of a cognition budget = unmetered (returns null ⇒ allowed). A present,
 * exhausted budget denies the run BEFORE any LLM call (fail-safe, no spend).
 */

const COGNITION_SCOPE = "cognition";

export interface CognitionBudgetState {
  budgetId: string;
  name: string;
  consumedMicros: number;
  limitMicros: number;
  windowSeconds: number;
  exceeded: boolean;
}

async function loadCognitionBudgets() {
  return db
    .select()
    .from(jarvisBudgetsTable)
    .where(
      and(
        eq(jarvisBudgetsTable.enabled, true),
        eq(jarvisBudgetsTable.scopeType, COGNITION_SCOPE),
      ),
    )
    .orderBy(asc(jarvisBudgetsTable.createdAt), asc(jarvisBudgetsTable.id));
}

/** Most-constraining cognition budget, or null if none apply (unmetered). */
export async function checkCognitionBudget(): Promise<CognitionBudgetState | null> {
  const now = new Date();
  const rows = await loadCognitionBudgets();
  const states: CognitionBudgetState[] = rows
    .filter((b) => b.limitCount > 0)
    .map((b) => {
      const expired = isWindowExpired(b.windowStartedAt, b.windowSeconds, now);
      const consumed = expired ? 0 : b.consumed;
      return {
        budgetId: b.id,
        name: b.name,
        consumedMicros: consumed,
        limitMicros: b.limitCount,
        windowSeconds: b.windowSeconds,
        exceeded: consumed >= b.limitCount,
      };
    });
  if (states.length === 0) return null;
  return (
    states.find((s) => s.exceeded) ??
    states.sort(
      (a, b) =>
        b.consumedMicros / b.limitMicros - a.consumedMicros / a.limitMicros,
    )[0] ??
    null
  );
}

/** Add spent micros to every cognition budget, rolling expired windows first. */
export async function consumeCognitionBudget(costMicros: number): Promise<void> {
  if (costMicros <= 0) return;
  const now = new Date();
  const rows = await loadCognitionBudgets();
  for (const b of rows) {
    if (b.limitCount <= 0) continue;
    const expired = isWindowExpired(b.windowStartedAt, b.windowSeconds, now);
    await db
      .update(jarvisBudgetsTable)
      .set({
        consumed: expired ? costMicros : b.consumed + costMicros,
        windowStartedAt: expired ? now : b.windowStartedAt,
        updatedAt: now,
      })
      .where(eq(jarvisBudgetsTable.id, b.id));
  }
}
