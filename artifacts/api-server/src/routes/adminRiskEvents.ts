import { Router } from "express";
import { db } from "@workspace/db";
import { riskThrottleEventsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

// ── /api/admin/risk-events ──────────────────────────────────────────────────
//
// Operator visibility into AI LIVE trades blocked by `riskGate`. Read-only,
// admin / super-admin gated. Powers the "blocked trades" admin surface.
// Filters: `userId` (single user), `limit` (default 100, max 500).

const router = Router();

router.get(
  "/admin/risk-events",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req, res): Promise<void> => {
    const userId = typeof req.query["userId"] === "string" ? req.query["userId"] : undefined;
    const limitRaw = Number(req.query["limit"] ?? 100);
    const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 100));

    try {
      const rows = await db
        .select()
        .from(riskThrottleEventsTable)
        .where(userId ? and(eq(riskThrottleEventsTable.userId, userId)) : undefined)
        .orderBy(desc(riskThrottleEventsTable.createdAt))
        .limit(limit);
      res.json({ events: rows, count: rows.length, limit, userId: userId ?? null });
    } catch (err) {
      req.log.error({ err }, "GET /admin/risk-events failed");
      res.status(500).json({ error: "risk_events_query_failed" });
    }
  },
);

export default router;
