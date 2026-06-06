/**
 * AI Allocated Capital — the authoritative AICandlez performance baseline.
 *
 *   GET  /api/user/ai-capital            (requireAuth)  — read own baseline
 *   PUT  /api/user/ai-capital            (requireAuth)  — set own baseline
 *   PUT  /api/admin/users/:id/ai-capital (admin)        — operator override (audited)
 *
 * `user_settings.ai_allocated_capital` is nullable: NULL means "not declared"
 * and the managed-performance endpoint falls back to the paper starting
 * balance. A concrete value becomes THE baseline for every AICandlez metric.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { userSettingsTable, userAdminActionsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

type AuthReq = Request & { clerkUserId: string };
const router: IRouter = Router();

const amountSchema = z.object({
  amount: z.number().min(0).max(1_000_000_000),
});

router.get(
  "/user/ai-capital",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthReq).clerkUserId;
    try {
      const [row] = await db
        .select({ allocated: userSettingsTable.aiAllocatedCapital })
        .from(userSettingsTable)
        .where(eq(userSettingsTable.userId, userId))
        .limit(1);
      res.json({ aiAllocatedCapital: row?.allocated ?? null });
    } catch (err) {
      req.log.error({ err, userId }, "GET /user/ai-capital failed");
      res.status(500).json({ error: "ai_capital_read_failed" });
    }
  },
);

router.put(
  "/user/ai-capital",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthReq).clerkUserId;
    const parsed = amountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_amount" });
      return;
    }
    const amount = parsed.data.amount;
    try {
      await db
        .insert(userSettingsTable)
        .values({ userId, aiAllocatedCapital: amount })
        .onConflictDoUpdate({
          target: userSettingsTable.userId,
          set: { aiAllocatedCapital: amount, updatedAt: new Date() },
        });
      res.json({ aiAllocatedCapital: amount });
    } catch (err) {
      req.log.error({ err, userId }, "PUT /user/ai-capital failed");
      res.status(500).json({ error: "ai_capital_write_failed" });
    }
  },
);

router.put(
  "/admin/users/:id/ai-capital",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const actorId = (req as AuthReq).clerkUserId;
    const targetId = String(req.params.id);
    const parsed = amountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_amount" });
      return;
    }
    const amount = parsed.data.amount;
    try {
      await db
        .insert(userSettingsTable)
        .values({ userId: targetId, aiAllocatedCapital: amount })
        .onConflictDoUpdate({
          target: userSettingsTable.userId,
          set: { aiAllocatedCapital: amount, updatedAt: new Date() },
        });
      await db.insert(userAdminActionsTable).values({
        id: randomUUID(),
        actorAdminId: actorId,
        targetUserId: targetId,
        action: "set_ai_allocated_capital",
        payload: { aiAllocatedCapital: amount },
      });
      res.json({ aiAllocatedCapital: amount, targetUserId: targetId });
    } catch (err) {
      req.log.error(
        { err, actorId, targetId },
        "PUT /admin/users/:id/ai-capital failed",
      );
      res.status(500).json({ error: "ai_capital_override_failed" });
    }
  },
);

export default router;
