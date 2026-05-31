/**
 * GET /api/user/execution-funnel — per-customer execution funnel attribution
 * (Task #219).
 *
 * Returns the AUTHENTICATED customer's OWN live-order attempt outcomes (AI
 * fan-out + manual pill, both recorded at the `executeCustomerOrder` chokepoint)
 * with a classified breakdown of failures. This replaces the portal's previous
 * reliance on the anonymous GLOBAL engine funnel (`/api/engine/status`
 * executionFunnel), which could never explain a specific user's attempt/fill
 * gap. Pure read-only telemetry — gated by requireAuth so each user only ever
 * sees their own rows.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getCustomerFunnel } from "../lib/customerExecutionAttribution.js";

type AuthReq = Request & { clerkUserId: string };

const router: IRouter = Router();

router.get("/user/execution-funnel", requireAuth, (req: Request, res: Response): void => {
  const userId = (req as AuthReq).clerkUserId;
  res.json(getCustomerFunnel(userId));
});

export default router;
