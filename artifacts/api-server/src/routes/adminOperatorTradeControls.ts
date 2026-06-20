import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { db, plannedTradesTable, userAdminActionsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import {
  cancelPlannedTrade,
  createSellTarget,
  createPlannedTrade,
  setManualExitTarget,
  updatePlannedTrade,
} from "../lib/operatorTradeControls.js";

type AuthReq = Request & { clerkUserId: string };

const router = Router();
const requireOperator = [requireAuth, requireRole(["admin", "super-admin"])];

const ManualTargetBody = z.object({
  targetPrice: z.number().positive().nullable(),
  note: z.string().trim().max(2_000).optional(),
});

const PlannedTradeBody = z.object({
  symbol: z.string().trim().min(2).max(30),
  buyTargetPrice: z.number().positive(),
  sellTargetPrice: z.number().positive().nullable().optional(),
  positionSizeUSD: z.number().positive().max(100_000),
  expirationTime: z.number().int().positive().nullable().optional(),
  expirationHours: z.number().positive().max(8760).optional(),
  note: z.string().trim().max(2_000).optional(),
});

const SellTargetBody = z.object({
  positionId: z.string().trim().min(1),
  targetPrice: z.number().positive().nullable().optional(),
  targetProfitUSD: z.number().positive().nullable().optional(),
  note: z.string().trim().max(2_000).optional(),
});

const PlannedTradePatchBody = z.object({
  buyTargetPrice: z.number().positive().nullable().optional(),
  sellTargetPrice: z.number().positive().nullable().optional(),
  targetProfitUSD: z.number().positive().nullable().optional(),
  positionSizeUSD: z.number().positive().max(100_000).nullable().optional(),
  expirationTime: z.number().int().positive().nullable().optional(),
  expirationHours: z.number().positive().max(8760).nullable().optional(),
  note: z.string().trim().max(2_000).optional(),
});

router.get("/admin/planned-trades", ...requireOperator, async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query["limit"] ?? "100"), 10) || 100, 500);
    const rows = await db
      .select()
      .from(plannedTradesTable)
      .orderBy(desc(plannedTradesTable.createdAt))
      .limit(limit);
    res.json({ plannedTrades: rows, count: rows.length, timestamp: Date.now() });
  } catch (err) {
    req.log.error({ err }, "GET /admin/planned-trades failed");
    res.status(500).json({ error: "Failed to load planned trades" });
  }
});

router.put("/admin/users/:id/positions/:positionId/manual-target", ...requireOperator, async (req: Request, res: Response): Promise<void> => {
  const actorId = (req as AuthReq).clerkUserId;
  const targetId = String(req.params["id"] ?? "");
  const positionId = String(req.params["positionId"] ?? "");
  const parsed = ManualTargetBody.safeParse(req.body ?? {});
  if (!targetId || !positionId) {
    res.status(400).json({ error: "Missing user id or position id" });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  try {
    const result = await setManualExitTarget({
      userId: targetId,
      positionId,
      targetPrice: parsed.data.targetPrice,
    });
    if (!result.ok) {
      res.status(404).json({ error: result.error });
      return;
    }
    await db.insert(userAdminActionsTable).values({
      id: randomUUID(),
      actorAdminId: actorId,
      targetUserId: targetId,
      action: parsed.data.targetPrice === null ? "CLEAR_MANUAL_EXIT_TARGET" : "SET_MANUAL_EXIT_TARGET",
      payload: {
        positionId,
        targetPrice: parsed.data.targetPrice,
        note: parsed.data.note?.trim() || "Operator manual exit target update",
      },
    });
    res.json({ ok: true, userId: targetId, positionId, manualExitTargetPrice: parsed.data.targetPrice });
  } catch (err) {
    req.log.error({ err, targetId, positionId }, "PUT /admin/users/:id/positions/:positionId/manual-target failed");
    res.status(500).json({ error: "Failed to update manual exit target" });
  }
});

async function handleCreatePlannedBuy(req: Request, res: Response): Promise<void> {
  const actorId = (req as AuthReq).clerkUserId;
  const targetId = String(req.params["id"] ?? "");
  const parsed = PlannedTradeBody.safeParse(req.body ?? {});
  if (!targetId) {
    res.status(400).json({ error: "Missing user id" });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const expirationTime =
    parsed.data.expirationTime !== undefined
      ? parsed.data.expirationTime
      : parsed.data.expirationHours !== undefined
        ? Date.now() + parsed.data.expirationHours * 60 * 60 * 1000
        : null;
  try {
    const plan = await createPlannedTrade({
      userId: targetId,
      symbol: parsed.data.symbol,
      buyTargetPrice: parsed.data.buyTargetPrice,
      sellTargetPrice: parsed.data.sellTargetPrice ?? null,
      positionSizeUSD: parsed.data.positionSizeUSD,
      expirationTime,
      createdBy: actorId,
    });
    await db.insert(userAdminActionsTable).values({
      id: randomUUID(),
      actorAdminId: actorId,
      targetUserId: targetId,
      action: "CREATE_PLANNED_TRADE",
      payload: {
        planId: plan.id,
        symbol: plan.symbol,
        buyTargetPrice: plan.buyTargetPrice,
        sellTargetPrice: plan.sellTargetPrice,
        positionSizeUSD: plan.positionSizeUSD,
        expirationTime: plan.expirationTime,
        note: parsed.data.note?.trim() || "Operator planned trade created",
      },
    });
    res.status(201).json({ ok: true, plannedTrade: plan });
  } catch (err) {
    req.log.error({ err, targetId }, "POST /admin/users/:id/planned-trades failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create planned trade" });
  }
}

router.post("/admin/users/:id/planned-trades", ...requireOperator, handleCreatePlannedBuy);

router.post("/admin/users/:id/planned-buys", ...requireOperator, handleCreatePlannedBuy);

router.post("/admin/users/:id/sell-targets", ...requireOperator, async (req: Request, res: Response): Promise<void> => {
  const actorId = (req as AuthReq).clerkUserId;
  const targetId = String(req.params["id"] ?? "");
  const parsed = SellTargetBody.safeParse(req.body ?? {});
  if (!targetId) {
    res.status(400).json({ error: "Missing user id" });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  if (parsed.data.targetPrice == null && parsed.data.targetProfitUSD == null) {
    res.status(400).json({ error: "targetPrice or targetProfitUSD is required" });
    return;
  }
  try {
    const plan = await createSellTarget({
      userId: targetId,
      positionId: parsed.data.positionId,
      targetPrice: parsed.data.targetPrice ?? null,
      targetProfitUSD: parsed.data.targetProfitUSD ?? null,
      createdBy: actorId,
    });
    await db.insert(userAdminActionsTable).values({
      id: randomUUID(),
      actorAdminId: actorId,
      targetUserId: targetId,
      action: "CREATE_OPERATOR_SELL_TARGET",
      payload: {
        planId: plan.id,
        positionId: parsed.data.positionId,
        symbol: plan.symbol,
        sellTargetPrice: plan.sellTargetPrice,
        targetProfitUSD: plan.targetProfitUSD,
        note: parsed.data.note?.trim() || "Operator sell target created",
      },
    });
    res.status(201).json({ ok: true, plannedTrade: plan });
  } catch (err) {
    req.log.error({ err, targetId }, "POST /admin/users/:id/sell-targets failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create sell target" });
  }
});

router.put("/admin/planned-trades/:id", ...requireOperator, async (req: Request, res: Response): Promise<void> => {
  const actorId = (req as AuthReq).clerkUserId;
  const id = String(req.params["id"] ?? "");
  const parsed = PlannedTradePatchBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const expirationTime =
    parsed.data.expirationTime !== undefined
      ? parsed.data.expirationTime
      : parsed.data.expirationHours !== undefined
        ? parsed.data.expirationHours === null ? null : Date.now() + parsed.data.expirationHours * 60 * 60 * 1000
        : undefined;
  try {
    const result = await updatePlannedTrade({
      id,
      buyTargetPrice: parsed.data.buyTargetPrice,
      sellTargetPrice: parsed.data.sellTargetPrice,
      targetProfitUSD: parsed.data.targetProfitUSD,
      positionSizeUSD: parsed.data.positionSizeUSD,
      expirationTime,
    });
    if (!result.ok) {
      res.status(409).json({ error: result.error });
      return;
    }
    await db.insert(userAdminActionsTable).values({
      id: randomUUID(),
      actorAdminId: actorId,
      targetUserId: result.row.userId,
      action: "MODIFY_PLANNED_TRADE",
      payload: {
        planId: id,
        patch: parsed.data,
        note: parsed.data.note?.trim() || "Operator planned trade modified",
      },
    });
    res.json({ ok: true, plannedTrade: result.row });
  } catch (err) {
    req.log.error({ err, id }, "PUT /admin/planned-trades/:id failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update planned trade" });
  }
});

router.post("/admin/planned-trades/:id/cancel", ...requireOperator, async (req: Request, res: Response): Promise<void> => {
  const actorId = (req as AuthReq).clerkUserId;
  const id = String(req.params["id"] ?? "");
  try {
    const before = await db.select().from(plannedTradesTable).where(eq(plannedTradesTable.id, id)).limit(1).then((r) => r[0]);
    const result = await cancelPlannedTrade(id);
    if (!result.ok) {
      res.status(404).json({ error: result.error });
      return;
    }
    await db.insert(userAdminActionsTable).values({
      id: randomUUID(),
      actorAdminId: actorId,
      targetUserId: before?.userId ?? "unknown",
      action: "CANCEL_PLANNED_TRADE",
      payload: { planId: id, symbol: before?.symbol ?? null },
    });
    res.json({ ok: true, id });
  } catch (err) {
    req.log.error({ err, id }, "POST /admin/planned-trades/:id/cancel failed");
    res.status(500).json({ error: "Failed to cancel planned trade" });
  }
});

export default router;
