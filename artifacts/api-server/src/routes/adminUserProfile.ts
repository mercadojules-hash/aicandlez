/**
 * Operator profile editors — AI engine settings + billing overrides.
 *
 *   PATCH /api/admin/users/:id/ai-settings        (operator)
 *   PATCH /api/admin/users/:id/billing-overrides  (super-admin)
 *
 * Both endpoints:
 *   - Validate body with Zod (required `note`, all other fields optional/partial)
 *   - Snapshot `before` row, apply patch, snapshot `after`
 *   - Write a row to `user_admin_actions` with action label + payload
 *   - Invalidate the admin telemetry read cache
 *   - Return the updated row so the client can replace its optimistic cache
 *
 * Self-action blocked (operator cannot edit their own row through this surface).
 * No-op patches (no fields changed) return 400.
 */

import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import {
  db,
  usersTable,
  userSettingsTable,
  userAdminActionsTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { __invalidateAdminUserTelemetryCache } from "./adminUserTelemetry.js";
import { executionStreamBus } from "../lib/executionStreamBus.js";

const router = Router();
const requireOperator   = [requireAuth, requireRole(["admin", "super-admin"])];
const requireSuperAdmin = [requireAuth, requireRole(["super-admin"])];

type AuthReq = Request & { clerkUserId: string };

const NoteSchema = z.string().trim().min(1, "Operator note is required").max(2_000);

// ── AI engine settings (operator) ────────────────────────────────────────────

const AiSettingsBody = z.object({
  note:               NoteSchema,
  autoMode:           z.boolean().optional(),
  riskLevel:          z.enum(["conservative", "moderate", "aggressive", "high", "medium", "low"]).optional(),
  minConfidence:      z.number().min(0).max(100).optional(),
  positionSizeUSD:    z.number().min(1).max(1_000_000).optional(),
  maxActivePositions: z.number().int().min(0).max(100).optional(),
  tradingMode:        z.enum(["simulation", "live"]).optional(),
  preferredExchange:  z.string().trim().min(1).max(50).optional(),
  volumeFilter:       z.boolean().optional(),
});

type DbExecutor = Pick<typeof db, "insert" | "update" | "delete" | "select">;

async function writeAudit(
  args: { actorId: string; targetId: string; action: string; payload: Record<string, unknown> },
  executor: DbExecutor = db,
): Promise<string> {
  const id = randomUUID();
  await executor.insert(userAdminActionsTable).values({
    id,
    actorAdminId: args.actorId,
    targetUserId: args.targetId,
    action:       args.action,
    payload:      args.payload,
  });
  try { __invalidateAdminUserTelemetryCache(); } catch { /* test stub */ }
  try {
    executionStreamBus.emitEvent({
      type:    "admin_action_applied",
      severity: "info",
      message: `Admin ${args.actorId} → ${args.targetId}: ${args.action}`,
      details: { auditId: id, actorId: args.actorId, targetUserId: args.targetId, action: args.action },
    });
  } catch { /* never fail an audit on a stream emit */ }
  return id;
}

function resolveActor(req: Request, res: Response): { actorId: string; targetId: string } | null {
  const actorId  = (req as AuthReq).clerkUserId;
  const targetId = String(req.params["id"] ?? "");
  if (!targetId) { res.status(400).json({ error: "Missing user id" }); return null; }
  if (actorId === targetId) {
    res.status(400).json({ error: "Operators cannot edit their own settings through this surface" });
    return null;
  }
  return { actorId, targetId };
}

function diffChanged(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const changed: string[] = [];
  for (const key of Object.keys(after)) {
    const b = before[key];
    const a = after[key];
    if (b instanceof Date || a instanceof Date) {
      if ((b instanceof Date ? b.getTime() : b) !== (a instanceof Date ? a.getTime() : a)) changed.push(key);
    } else if (b !== a) {
      changed.push(key);
    }
  }
  return changed;
}

router.patch("/admin/users/:id/ai-settings", ...requireOperator, async (req, res): Promise<void> => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;
  const parsed = AiSettingsBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { note, ...fields } = parsed.data;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  try {
    // JIT-provision the user_settings row so admins can edit settings for
    // users who haven't booted the portal yet.
    const [existing] = await db.select().from(userSettingsTable)
      .where(eq(userSettingsTable.userId, ctx.targetId)).limit(1);
    let before = existing;
    if (!before) {
      [before] = await db.insert(userSettingsTable).values({ userId: ctx.targetId })
        .onConflictDoNothing().returning();
      if (!before) {
        [before] = await db.select().from(userSettingsTable)
          .where(eq(userSettingsTable.userId, ctx.targetId)).limit(1);
      }
    }
    if (!before) {
      res.status(404).json({ error: "User settings row could not be provisioned" });
      return;
    }

    const [after] = await db.update(userSettingsTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(userSettingsTable.userId, ctx.targetId))
      .returning();

    const changedFields = diffChanged(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    ).filter(k => k !== "updatedAt");

    if (changedFields.length === 0) {
      res.json({ ok: true, after, changedFields: [] });
      return;
    }

    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "update_ai_settings",
      payload:  {
        note,
        changedFields,
        before: Object.fromEntries(changedFields.map(k => [k, (before as Record<string, unknown>)[k]])),
        after:  Object.fromEntries(changedFields.map(k => [k, (after as unknown as Record<string, unknown>)[k]])),
      },
    });
    res.json({ ok: true, after, changedFields });
  } catch (err) {
    req.log.error({ err }, "PATCH ai-settings failed");
    res.status(500).json({ error: "Failed to update AI settings" });
  }
});

// ── Billing overrides (super-admin) ──────────────────────────────────────────

const BillingOverridesBody = z.object({
  note:                    NoteSchema,
  perfFeeBpsOverride:      z.union([z.number().int().min(0).max(10_000), z.null()]).optional(),
  feeWaiverActive:         z.boolean().optional(),
  feeWaiverUntil:          z.union([z.string().datetime(), z.null()]).optional(),
  isComplimentaryAccount:  z.boolean().optional(),
  isInternalAccount:       z.boolean().optional(),
  revenueShareBps:         z.number().int().min(0).max(10_000).optional(),
  billingOverrideNotes:    z.union([z.string().max(2_000), z.null()]).optional(),
});

router.patch("/admin/users/:id/billing-overrides", ...requireSuperAdmin, async (req, res): Promise<void> => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;
  const parsed = BillingOverridesBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { note, ...fields } = parsed.data;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (k === "feeWaiverUntil") {
      patch[k] = v === null ? null : new Date(v as string);
    } else {
      patch[k] = v;
    }
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  try {
    const [before] = await db.select().from(usersTable)
      .where(eq(usersTable.clerkUserId, ctx.targetId)).limit(1);
    if (!before) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const [after] = await db.update(usersTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(usersTable.clerkUserId, ctx.targetId))
      .returning();

    const changedFields = diffChanged(
      before as unknown as Record<string, unknown>,
      after  as unknown as Record<string, unknown>,
    ).filter(k => k !== "updatedAt");

    if (changedFields.length === 0) {
      res.json({ ok: true, after: pickBillingFields(after), changedFields: [] });
      return;
    }

    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "update_billing_overrides",
      payload:  {
        note,
        changedFields,
        before: Object.fromEntries(changedFields.map(k => [k, (before as Record<string, unknown>)[k]])),
        after:  Object.fromEntries(changedFields.map(k => [k, (after  as unknown as Record<string, unknown>)[k]])),
      },
    });
    res.json({ ok: true, after: pickBillingFields(after), changedFields });
  } catch (err) {
    req.log.error({ err }, "PATCH billing-overrides failed");
    res.status(500).json({ error: "Failed to update billing overrides" });
  }
});

function pickBillingFields(row: typeof usersTable.$inferSelect) {
  return {
    perfFeeBpsOverride:     row.perfFeeBpsOverride,
    feeWaiverActive:        row.feeWaiverActive,
    feeWaiverUntil:         row.feeWaiverUntil,
    isComplimentaryAccount: row.isComplimentaryAccount,
    isInternalAccount:      row.isInternalAccount,
    revenueShareBps:        row.revenueShareBps,
    billingOverrideNotes:   row.billingOverrideNotes,
  };
}

export default router;
