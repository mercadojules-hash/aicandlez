/**
 * AI Trading entitlement gate — single source of truth for whether a
 * given user is allowed to enable AI auto-execution.
 *
 * Mirrors the canonical truth table used in `routes/billing.ts`
 * (`PLAN_FEATURES` + `users.planStatus`) so the gate cannot drift from
 * the subscription state Stripe webhooks write into `users`.
 *
 * Rules (top-to-bottom, short-circuit on first match):
 *   1. admin / super-admin  → ALLOWED (operator bypass, used on
 *      admintrade.aicandlez.com — never grants live execution to
 *      customer accounts, only operator role rows)
 *   2. plan === "free"      → DENIED (subscription_required)
 *   3. status not active/trialing → DENIED (subscription_inactive)
 *   4. plan limits.aiAutoTrade false → DENIED (plan_lacks_ai_auto_trade)
 *   5. otherwise            → ALLOWED
 *
 * Used by:
 *   - GET /user/ai-trading/state  — hydration
 *   - POST /user/ai-trading/enable — flip persistence
 *   - PUT /user/settings (autoMode=true) — defense-in-depth
 *   - POST /exchange/alpaca/activate — paper-account activation
 *   - placeLiveAutoOrderForUser (lib/liveUserExecution.ts) already
 *     re-validates plan + concurrent cap before broker submit; this
 *     gate sits in front of all of those.
 */

import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { PLAN_FEATURES } from "../routes/billing.js";

export type AiTradingPlan = "free" | "starter" | "pro";

export interface AiTradingGate {
  allowed: boolean;
  plan:    AiTradingPlan;
  isAdmin: boolean;
  reason:  string | null;
}

export async function resolveAiTradingGate(userId: string): Promise<AiTradingGate> {
  const [user] = await db
    .select({
      plan:       usersTable.plan,
      planStatus: usersTable.planStatus,
      role:       usersTable.role,
    })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId))
    .limit(1);

  const role    = user?.role ?? "user";
  const isAdmin = role === "admin" || role === "super-admin";
  const planRaw = user?.plan ?? "free";
  const plan: AiTradingPlan =
    planRaw === "starter" || planRaw === "pro" ? planRaw : "free";
  const status  = user?.planStatus ?? null;

  if (isAdmin) {
    return { allowed: true, plan, isAdmin: true, reason: null };
  }

  if (plan === "free") {
    return { allowed: false, plan, isAdmin: false, reason: "subscription_required" };
  }

  const isActive = status === "active" || status === "trialing";
  if (!isActive) {
    return { allowed: false, plan, isAdmin: false, reason: "subscription_inactive" };
  }

  const limits = PLAN_FEATURES[plan]?.limits;
  if (!limits?.aiAutoTrade) {
    return { allowed: false, plan, isAdmin: false, reason: "plan_lacks_ai_auto_trade" };
  }

  return { allowed: true, plan, isAdmin: false, reason: null };
}
