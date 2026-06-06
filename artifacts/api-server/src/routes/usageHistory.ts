/**
 * GET /api/admin/usage-history?days=90 — daily usage + cost trend rows for the
 * admin Platform Resource & Billing Telemetry surface (ADMIN / super-admin).
 *
 * Reads `usage_daily` (one row per UTC day). History accumulates from
 * enablement forward — there is no backfill, so early windows are sparse.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { gte, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { usageDailyTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { flushUsageCounters } from "../lib/usageCounters.js";

const router: IRouter = Router();

router.get(
  "/admin/usage-history",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const daysRaw = Number(req.query.days);
      const days =
        Number.isFinite(daysRaw) && daysRaw > 0
          ? Math.min(Math.floor(daysRaw), 366)
          : 90;
      await flushUsageCounters().catch(() => {});
      const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
      const rows = await db
        .select()
        .from(usageDailyTable)
        .where(gte(usageDailyTable.day, cutoff))
        .orderBy(asc(usageDailyTable.day));
      res.json({ days, rows });
    } catch (err) {
      req.log.error({ err }, "GET /admin/usage-history failed");
      res.status(500).json({ error: "usage_history_failed" });
    }
  },
);

export default router;
