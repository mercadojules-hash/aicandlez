/**
 * Operator (admin) per-account / per-exchange live-exit controls (Task #220).
 *
 *   GET    /api/admin/users/:id/exit-config
 *   PUT    /api/admin/users/:id/exit-config            (account default)
 *   PUT    /api/admin/users/:id/exit-config/:exchange  (per-exchange override)
 *   DELETE /api/admin/users/:id/exit-config/:exchange  (clear per-exchange)
 *
 * Every write:
 *   - requireAuth + requireRole(["admin","super-admin"])
 *   - no self-action (resolveActor) + required non-empty `note`
 *   - persists via the SAME validated helpers the customer routes use
 *     (`exitConfig.ts`), so bounds + clamping are identical
 *   - writes an immutable `user_admin_actions` row (writeAudit) BEFORE
 *     returning success
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { resolveActor, writeAudit } from "./adminUserActions.js";
import {
  loadExitConfig,
  applyAccountExitConfig,
  applyExchangeExitConfig,
  clearExchangeExitConfig,
} from "./exitConfig.js";

const router = Router();
const requireOperator = [requireAuth, requireRole(["admin", "super-admin"])];

const NoteSchema = z.string().trim().min(1, "An audit note is required").max(500);

// GET — read the target user's effective exit config (no self-action block;
// reads are non-mutating). `:id` is the target's clerk user id.
router.get("/admin/users/:id/exit-config", ...requireOperator, async (req: Request, res: Response): Promise<void> => {
  const targetId = String(req.params["id"] ?? "");
  if (!targetId) {
    res.status(400).json({ error: "Missing user id" });
    return;
  }
  try {
    res.json(await loadExitConfig(targetId));
  } catch (err) {
    req.log.error({ err, targetId }, "GET /admin/users/:id/exit-config failed");
    res.status(500).json({ error: "Failed to load exit config" });
  }
});

router.put("/admin/users/:id/exit-config", ...requireOperator, async (req: Request, res: Response): Promise<void> => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const note = NoteSchema.safeParse(body["note"]);
  if (!note.success) {
    res.status(400).json({ error: note.error.issues[0]?.message ?? "Invalid note" });
    return;
  }
  try {
    const before = await loadExitConfig(ctx.targetId);
    const result = await applyAccountExitConfig(ctx.targetId, body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "set_exit_config_account",
      payload:  { note: note.data, before: before.account, after: result.config.account },
    });
    res.json(result.config);
  } catch (err) {
    req.log.error({ err, targetId: ctx.targetId }, "PUT /admin/users/:id/exit-config failed");
    res.status(500).json({ error: "Failed to save exit config" });
  }
});

router.put("/admin/users/:id/exit-config/:exchange", ...requireOperator, async (req: Request, res: Response): Promise<void> => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;
  const exchange = String(req.params["exchange"] ?? "").trim();
  const body = (req.body ?? {}) as Record<string, unknown>;
  const note = NoteSchema.safeParse(body["note"]);
  if (!note.success) {
    res.status(400).json({ error: note.error.issues[0]?.message ?? "Invalid note" });
    return;
  }
  try {
    const result = await applyExchangeExitConfig(ctx.targetId, exchange, body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "set_exit_config_exchange",
      payload:  { note: note.data, exchange, after: result.config.exchanges.find((e) => e.exchange === exchange) ?? null },
    });
    res.json(result.config);
  } catch (err) {
    req.log.error({ err, targetId: ctx.targetId, exchange }, "PUT /admin/users/:id/exit-config/:exchange failed");
    res.status(500).json({ error: "Failed to save per-exchange exit config" });
  }
});

router.delete("/admin/users/:id/exit-config/:exchange", ...requireOperator, async (req: Request, res: Response): Promise<void> => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;
  const exchange = String(req.params["exchange"] ?? "").trim();
  const body = (req.body ?? {}) as Record<string, unknown>;
  const note = NoteSchema.safeParse(body["note"]);
  if (!note.success) {
    res.status(400).json({ error: note.error.issues[0]?.message ?? "Invalid note" });
    return;
  }
  try {
    const result = await clearExchangeExitConfig(ctx.targetId, exchange);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "clear_exit_config_exchange",
      payload:  { note: note.data, exchange },
    });
    res.json(result.config);
  } catch (err) {
    req.log.error({ err, targetId: ctx.targetId, exchange }, "DELETE /admin/users/:id/exit-config/:exchange failed");
    res.status(500).json({ error: "Failed to clear per-exchange exit config" });
  }
});

export default router;
