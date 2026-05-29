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
 *   2. complimentary account → ALLOWED (operator-granted free access
 *      mirrors a paid `pro` subscription for entitlement purposes;
 *      `is_complimentary_account=true` OR an active fee waiver
 *      (`fee_waiver_active=true` AND (`fee_waiver_until` IS NULL OR
 *      `fee_waiver_until` > now())) bypasses plan/status checks)
 *   3. plan === "free"      → DENIED (subscription_required)
 *   4. status not active/trialing → DENIED (subscription_inactive)
 *   5. plan limits.aiAutoTrade false → DENIED (plan_lacks_ai_auto_trade)
 *   6. otherwise            → ALLOWED
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

export type AiTradingPlan = "free" | "starter" | "pro" | "elite";

export interface AiTradingGate {
  allowed:         boolean;
  plan:            AiTradingPlan;
  isAdmin:         boolean;
  isComplimentary: boolean;
  reason:          string | null;
}

/**
 * Shared helper — also used by `routes/billing.ts` GET /billing/subscription
 * so the gate and the customer-facing entitlement payload never disagree.
 *
 *   complimentary = is_complimentary_account === true
 *                   OR (fee_waiver_active === true
 *                       AND (fee_waiver_until IS NULL
 *                            OR fee_waiver_until > now()))
 */
export function isComplimentaryActive(input: {
  isComplimentaryAccount: boolean | null | undefined;
  feeWaiverActive:        boolean | null | undefined;
  feeWaiverUntil:         Date | string | null | undefined;
}): boolean {
  if (input.isComplimentaryAccount === true) return true;
  if (input.feeWaiverActive !== true) return false;
  if (input.feeWaiverUntil == null) return true; // indefinite waiver
  const until = input.feeWaiverUntil instanceof Date
    ? input.feeWaiverUntil
    : new Date(input.feeWaiverUntil);
  return Number.isFinite(until.getTime()) && until.getTime() > Date.now();
}

export async function resolveAiTradingGate(userId: string): Promise<AiTradingGate> {
  const [user] = await db
    .select({
      plan:                   usersTable.plan,
      planStatus:             usersTable.planStatus,
      role:                   usersTable.role,
      isComplimentaryAccount: usersTable.isComplimentaryAccount,
      feeWaiverActive:        usersTable.feeWaiverActive,
      feeWaiverUntil:         usersTable.feeWaiverUntil,
    })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId))
    .limit(1);

  const role    = user?.role ?? "user";
  const isAdmin = role === "admin" || role === "super-admin";
  const planRaw = user?.plan ?? "free";
  const plan: AiTradingPlan =
    planRaw === "starter" || planRaw === "pro" || planRaw === "elite" ? planRaw : "free";
  const status  = user?.planStatus ?? null;
  const isComplimentary = !!user && isComplimentaryActive(user);

  if (isAdmin) {
    return { allowed: true, plan, isAdmin: true, isComplimentary, reason: null };
  }

  // Complimentary accounts mirror a paid `pro` subscription for entitlement
  // purposes. Bypasses plan/status checks; the operator who toggled the flag
  // assumes responsibility (audit-logged in `user_admin_actions`).
  if (isComplimentary) {
    return { allowed: true, plan, isAdmin: false, isComplimentary: true, reason: null };
  }

  if (plan === "free") {
    return { allowed: false, plan, isAdmin: false, isComplimentary: false, reason: "subscription_required" };
  }

  const isActive = status === "active" || status === "trialing";
  if (!isActive) {
    return { allowed: false, plan, isAdmin: false, isComplimentary: false, reason: "subscription_inactive" };
  }

  const limits = PLAN_FEATURES[plan]?.limits;
  if (!limits?.aiAutoTrade) {
    return { allowed: false, plan, isAdmin: false, isComplimentary: false, reason: "plan_lacks_ai_auto_trade" };
  }

  return { allowed: true, plan, isAdmin: false, isComplimentary: false, reason: null };
}
