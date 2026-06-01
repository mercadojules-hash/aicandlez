/**
 * Operator account reconciliation endpoints.
 *
 *   POST /api/admin/users/:id/reconcile/preview   — dry run, NO writes
 *   POST /api/admin/users/:id/reconcile           — apply (transactional)
 *   GET  /api/admin/users/:id/reconcile/history    — audit history
 *
 * All routes are operator-gated (requireAuth + admin/super-admin). The preview
 * and apply paths share one compute function (lib/accountReconciliation.ts) so
 * the numbers an operator confirms are exactly the numbers persisted.
 *
 * Recompute = realized P&L from VERIFIED records only (broker-attributed live
 * fills + legitimate paper trades), EXCLUDING unlimited-position-incident
 * backlog rows, which are TAGGED (never deleted). Every apply writes an
 * immutable account_reconciliations row + a user_admin_actions audit entry.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import {
  computeReconciliation,
  applyReconciliation,
  listReconciliationHistory,
} from "../lib/accountReconciliation.js";

const router = Router();
const requireOperator = [requireAuth, requireRole(["admin", "super-admin"])];

const NoteSchema = z.object({
  note: z.string().trim().max(2_000).optional(),
});

function targetIdOf(req: Request, res: Response): string | null {
  const id = String(req.params["id"] ?? "");
  if (!id) {
    res.status(400).json({ error: "Missing user id" });
    return null;
  }
  return id;
}

// ── Preview (dry run) ─────────────────────────────────────────────────────────
router.post("/admin/users/:id/reconcile/preview", ...requireOperator, async (req, res): Promise<void> => {
  const targetId = targetIdOf(req, res);
  if (!targetId) return;
  try {
    const result = await computeReconciliation(db, targetId);
    res.json(result);
  } catch (err) {
    req.log.error({ err, targetId }, "reconcile preview failed");
    res.status(500).json({ error: "Failed to compute reconciliation preview" });
  }
});

// ── Apply ─────────────────────────────────────────────────────────────────────
router.post("/admin/users/:id/reconcile", ...requireOperator, async (req, res): Promise<void> => {
  const targetId = targetIdOf(req, res);
  if (!targetId) return;
  const parsed = NoteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const actorId = (req as Request & { clerkUserId: string }).clerkUserId;
  try {
    const result = await applyReconciliation({ actorId, targetId, note: parsed.data.note ?? null });
    if (!result.hasAccount) {
      res.status(404).json({ error: "No simulation account found for this user" });
      return;
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err, targetId }, "reconcile apply failed");
    res.status(500).json({ error: "Failed to apply reconciliation" });
  }
});

// ── History ───────────────────────────────────────────────────────────────────
router.get("/admin/users/:id/reconcile/history", ...requireOperator, async (req, res): Promise<void> => {
  const targetId = targetIdOf(req, res);
  if (!targetId) return;
  try {
    const rows = await listReconciliationHistory(targetId);
    res.json({ history: rows });
  } catch (err) {
    req.log.error({ err, targetId }, "reconcile history failed");
    res.status(500).json({ error: "Failed to load reconciliation history" });
  }
});

export default router;
