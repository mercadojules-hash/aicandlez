/**
 * Platform cost config — MANUAL monthly cost estimates (ADMIN / super-admin).
 *
 *   GET /api/admin/cost-config — read the singleton estimate
 *   PUT /api/admin/cost-config — upsert the singleton estimate
 *
 * These are explicitly "Estimate Only — Not Official Billing": the
 * authoritative sources remain the Replit Usage + Render billing dashboards
 * (deep-linked from the UI). Stored values power the executive cost view and
 * the cost-trend snapshots in usage_daily.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { platformCostConfigTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

type AuthReq = Request & { clerkUserId: string };
const router: IRouter = Router();
const SINGLETON = "global";

const costSchema = z.object({
  monthlyReplitUsd: z.number().min(0).max(10_000_000),
  monthlyRenderUsd: z.number().min(0).max(10_000_000),
  monthlyDbUsd: z.number().min(0).max(10_000_000),
  monthlyAiUsd: z.number().min(0).max(10_000_000),
  monthlyThirdPartyUsd: z.number().min(0).max(10_000_000),
});

router.get(
  "/admin/cost-config",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [cfg] = await db
        .select()
        .from(platformCostConfigTable)
        .where(eq(platformCostConfigTable.singletonKey, SINGLETON))
        .limit(1);
      if (!cfg) {
        res.json({
          monthlyReplitUsd: 0,
          monthlyRenderUsd: 0,
          monthlyDbUsd: 0,
          monthlyAiUsd: 0,
          monthlyThirdPartyUsd: 0,
          updatedBy: null,
          updatedAt: null,
        });
        return;
      }
      res.json({
        monthlyReplitUsd: cfg.monthlyReplitUsd,
        monthlyRenderUsd: cfg.monthlyRenderUsd,
        monthlyDbUsd: cfg.monthlyDbUsd,
        monthlyAiUsd: cfg.monthlyAiUsd,
        monthlyThirdPartyUsd: cfg.monthlyThirdPartyUsd,
        updatedBy: cfg.updatedBy,
        updatedAt: cfg.updatedAt,
      });
    } catch (err) {
      req.log.error({ err }, "GET /admin/cost-config failed");
      res.status(500).json({ error: "cost_config_read_failed" });
    }
  },
);

router.put(
  "/admin/cost-config",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actorId = (req as AuthReq).clerkUserId;
    const parsed = costSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_cost_config" });
      return;
    }
    const v = parsed.data;
    const updatedAt = new Date();
    try {
      await db
        .insert(platformCostConfigTable)
        .values({ singletonKey: SINGLETON, ...v, updatedBy: actorId, updatedAt })
        .onConflictDoUpdate({
          target: platformCostConfigTable.singletonKey,
          set: { ...v, updatedBy: actorId, updatedAt },
        });
      res.json({ ...v, updatedBy: actorId, updatedAt });
    } catch (err) {
      req.log.error({ err }, "PUT /admin/cost-config failed");
      res.status(500).json({ error: "cost_config_write_failed" });
    }
  },
);

export default router;
