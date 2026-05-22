/**
 * GET  /api/admin/backfill-status   — last N nightly back-fill run summaries
 * POST /api/admin/backfill-status/run — trigger an out-of-band run now
 *
 * Both routes are admin / super-admin only and surface the broker
 * order-ID reconciliation history captured by `backfillScheduler`.
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import {
  getBackfillSchedulerStatus,
  runBackfillsNow,
} from "../lib/backfillScheduler.js";

const router = Router();

router.get(
  "/admin/backfill-status",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  (_req, res) => {
    res.json(getBackfillSchedulerStatus());
  },
);

router.post(
  "/admin/backfill-status/run",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (_req, res) => {
    const record = await runBackfillsNow("manual");
    res.json({ record, status: getBackfillSchedulerStatus() });
  },
);

export default router;
