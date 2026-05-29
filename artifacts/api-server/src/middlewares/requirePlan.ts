import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isComplimentaryActive } from "../lib/aiTradingGate.js";

// ─────────────────────────────────────────────────────────────────────────────
// requirePlan — gate routes behind a minimum subscription plan.
// ─────────────────────────────────────────────────────────────────────────────
// Usage:
//   router.post("/user/exchanges/connect",
//               requireAuth, requirePlan("starter"), requireDisclaimer, handler)
//
// Behavior:
//   • Admin / super-admin → bypass (operators never see paywalls)
//   • Plan >= minimum + status active/trialing/none → next()
//   • Otherwise → 402 Payment Required with structured payload so the
//     frontend can show the membership-upgrade modal:
//       { error, code: "MEMBERSHIP_REQUIRED" | "SUBSCRIPTION_INACTIVE",
//         currentPlan, requiredPlan, upgradeUrl }
//
// Used to enforce the "paid-only" promise for live exchange connectivity:
//   • POST /api/user/exchanges/connect           (store credentials)
//   • POST /api/user/exchanges/:exchange/test    (re-validate credentials)
//   • POST /api/user/exchanges/:exchange/mode    (paper ↔ live switch)
//   • POST /api/user/exchanges/:exchange/default (pick default broker)
//
// Note: this middleware FAILS CLOSED on DB errors when a paid plan is
// required. A previous version failed open; for credential mutations that
// is unsafe (would leak the gate). Free-tier reads remain unaffected
// because they don't go through this middleware.
// ─────────────────────────────────────────────────────────────────────────────

type Plan = "free" | "starter" | "pro" | "elite" | "enterprise";

const PLAN_RANK: Record<Plan, number> = { free: 0, starter: 1, pro: 2, elite: 3, enterprise: 4 };

export function requirePlan(minimum: Plan) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = (req as Request & { clerkUserId?: string }).clerkUserId;
    if (!userId) {
      req.log?.warn?.({
        tag:    "REQUIRE_PLAN_REJECT",
        reason: "no_clerk_user_id_on_req",
        method: req.method,
        url:    req.originalUrl,
        minimum,
        status: 401,
      }, "[REQUIRE_PLAN_REJECT] no_clerk_user_id_on_req → 401");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
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

      // ── Admin bypass ──────────────────────────────────────────────────────
      // Operators are not customers. They never see paywalls / upgrade prompts
      // and retain full Kraken LIVE access on admintrade.aicandlez.com.
      if (user?.role === "admin" || user?.role === "super-admin") {
        next();
        return;
      }

      // ── Complimentary bypass ──────────────────────────────────────────────
      // Operator-granted complimentary accounts (is_complimentary_account=true
      // OR an active fee waiver) mirror a paid `pro` subscription for
      // entitlement purposes. Without this bypass, complimentary users
      // pass `resolveAiTradingGate` (AI auto-trade allowed) but still 402
      // on `/user/exchanges/connect` — leaving them unable to wire their
      // Coinbase / Kraken / Binance keys. Source of truth for the
      // complimentary predicate is `isComplimentaryActive` (also used by
      // `resolveAiTradingGate` and `/billing/subscription` so the three
      // surfaces never disagree).
      if (user && isComplimentaryActive(user)) {
        next();
        return;
      }

      const userPlan      = (user?.plan ?? "free") as Plan;
      const userPlanRank  = PLAN_RANK[userPlan] ?? 0;
      const requiredRank  = PLAN_RANK[minimum] ?? 0;

      if (userPlanRank < requiredRank) {
        req.log?.warn?.({
          tag:          "REQUIRE_PLAN_REJECT",
          reason:       "MEMBERSHIP_REQUIRED",
          userId,
          method:       req.method,
          url:          req.originalUrl,
          currentPlan:  userPlan,
          requiredPlan: minimum,
          userRole:     user?.role ?? null,
          status:       402,
        }, "[REQUIRE_PLAN_REJECT] MEMBERSHIP_REQUIRED → 402");
        res.status(402).json({
          error:         "Membership required for live exchange connectivity",
          code:          "MEMBERSHIP_REQUIRED",
          currentPlan:   userPlan,
          requiredPlan:  minimum,
          upgradeUrl:    "/subscribe",
        });
        return;
      }

      const status = user?.planStatus ?? "none";
      if (minimum !== "free" && status !== "active" && status !== "trialing" && status !== "none") {
        req.log?.warn?.({
          tag:        "REQUIRE_PLAN_REJECT",
          reason:     "SUBSCRIPTION_INACTIVE",
          userId,
          method:     req.method,
          url:        req.originalUrl,
          planStatus: status,
          currentPlan: userPlan,
          status:     402,
        }, "[REQUIRE_PLAN_REJECT] SUBSCRIPTION_INACTIVE → 402");
        res.status(402).json({
          error:       "Subscription is not active",
          code:        "SUBSCRIPTION_INACTIVE",
          planStatus:  status,
          upgradeUrl:  "/billing",
        });
        return;
      }

      next();
    } catch (err) {
      req.log?.error({ err }, "requirePlan: DB error — failing closed");
      // Fail closed for paid gates — never let a DB blip leak free access.
      // Trade-off: this also temporarily blocks admin/super-admin operators
      // during a DB outage, since the role lookup itself failed. That is
      // acceptable here — credential mutations are sensitive, and an admin
      // can retry once the DB recovers. We deliberately do NOT attempt a
      // role inference from auth claims because clerkUserId alone does not
      // carry role data, and any in-memory cache would skew over time.
      res.status(503).json({ error: "Plan verification unavailable. Please try again." });
    }
  };
}
