import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── requirePlan ───────────────────────────────────────────────────────────────
//
// Middleware factory that gates routes behind a minimum subscription plan.
// Usage:
//   router.post("/simulation/order", requireAuth, requirePlan("pro"), handler)
//
// Returns 402 Payment Required if the user's plan doesn't meet the minimum.

type Plan = "free" | "pro" | "enterprise";

const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, enterprise: 2 };

export function requirePlan(minimum: Plan) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // clerkUserId is set by requireAuth — call after requireAuth in chain
    const userId = (req as Request & { clerkUserId?: string }).clerkUserId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const [user] = await db
        .select({ plan: usersTable.plan, planStatus: usersTable.planStatus })
        .from(usersTable)
        .where(eq(usersTable.clerkUserId, userId))
        .limit(1);

      const userPlan      = (user?.plan ?? "free") as Plan;
      const userPlanRank  = PLAN_RANK[userPlan] ?? 0;
      const requiredRank  = PLAN_RANK[minimum] ?? 0;

      if (userPlanRank < requiredRank) {
        res.status(402).json({
          error:         "Plan upgrade required",
          code:          "PLAN_REQUIRED",
          currentPlan:   userPlan,
          requiredPlan:  minimum,
          upgradeUrl:    "/billing",
        });
        return;
      }

      // Plan status guard — allow active and trialing; block past_due, canceled
      const status = user?.planStatus ?? "none";
      if (minimum !== "free" && status !== "active" && status !== "trialing" && status !== "none") {
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
      req.log?.error({ err }, "requirePlan: DB error");
      next(); // fail open — don't block users on DB errors
    }
  };
}
