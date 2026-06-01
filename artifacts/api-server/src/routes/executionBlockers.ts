/**
 * GET /api/user/execution-blockers — per-customer execution-blocker report
 * (Profit Optimization P5).
 *
 * Reads the authenticated customer's own attribution funnel and classifies
 * every blocked reason as tunable-via-preset / entitlement / core-safety so
 * the portal can show which blockers a preset can address and which are
 * protecting the customer on purpose. Read-only, requireAuth-gated.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getExecutionBlockerReport } from "../lib/executionBlockerReport.js";

type AuthReq = Request & { clerkUserId: string };

const router: IRouter = Router();

router.get(
  "/user/execution-blockers",
  requireAuth,
  (req: Request, res: Response): void => {
    const userId = (req as AuthReq).clerkUserId;
    res.json(getExecutionBlockerReport(userId));
  },
);

export default router;
