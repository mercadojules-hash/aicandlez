/**
 * CRM Phase A4 — per-user exchange governance / visibility / entitlements.
 *
 *   GET    /api/admin/users/:id/exchange-visibility
 *   POST   /api/admin/users/:id/exchange-visibility
 *   DELETE /api/admin/users/:id/exchange-visibility/:exchangeId
 *
 * The GET response joins the EXCHANGE_CATALOG (single source of truth
 * per R1.5 — no hardcoded lists) with this user's overrides. The
 * `effectiveVisible` field is the derived presentational verdict:
 *   - override row exists → that visible value
 *   - no override         → catalog default (customerVisible !== false)
 *
 * Mutations are audit-logged via the standard `user_admin_actions`
 * table so they appear in the User Intelligence Panel audit trail.
 *
 * Out of scope: customer-facing /api/user/exchanges is NOT filtered
 * here. Enforcement (hiding from connect modal, blocking new
 * connections, etc.) is deferred to a later phase per the locked
 * "do not touch execution queue" invariant. A4 ships governance +
 * audit + operator UI only.
 */
import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import {
  db,
  userExchangeVisibilityTable,
  userAdminActionsTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import {
  EXCHANGE_CATALOG,
  CATALOG_BY_ID,
} from "../services/exchanges/catalog.js";
import { executionStreamBus } from "../lib/executionStreamBus.js";

const router = Router();
const requireOperator = [requireAuth, requireRole(["admin", "super-admin"])];

type AuthReq = Request & { clerkUserId: string };

function defaultVisible(exchangeId: string): boolean {
  const meta = CATALOG_BY_ID[exchangeId];
  if (!meta) return false;
  // adminOnly exchanges are not customer-visible by default.
  if (meta.adminOnly === true) return false;
  // explicit `customerVisible: false` hides by default.
  if (meta.customerVisible === false) return false;
  return true;
}

interface VisibilityRowOut {
  exchangeId:         string;
  exchangeName:       string;
  status:             "live" | "beta" | "coming_soon";
  catalogDefault:     boolean;
  override:           boolean | null;
  effectiveVisible:   boolean;
  note:               string | null;
  updatedAt:          string | null;
  updatedByAdminId:   string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users/:id/exchange-visibility
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/users/:id/exchange-visibility", requireOperator, async (req: Request, res: Response) => {
  try {
    const targetId = String(req.params["id"] ?? "");
    if (!targetId) {
      res.status(400).json({ error: "Missing user id" });
      return;
    }

    const overrides = await db
      .select()
      .from(userExchangeVisibilityTable)
      .where(eq(userExchangeVisibilityTable.clerkUserId, targetId));

    const overrideMap = new Map(overrides.map(o => [o.exchangeId, o]));

    const rows: VisibilityRowOut[] = EXCHANGE_CATALOG.map(entry => {
      const o          = overrideMap.get(entry.id) ?? null;
      const catalogDef = defaultVisible(entry.id);
      return {
        exchangeId:       entry.id,
        exchangeName:     entry.name,
        status:           entry.status,
        catalogDefault:   catalogDef,
        override:         o ? o.visible : null,
        effectiveVisible: o ? o.visible : catalogDef,
        note:             o?.note ?? null,
        updatedAt:        o?.updatedAt ? o.updatedAt.toISOString() : null,
        updatedByAdminId: o?.updatedByAdminId ?? null,
      };
    });

    res.json({ exchanges: rows, timestamp: Date.now() });
  } catch (err) {
    req.log?.error({ err }, "GET /admin/users/:id/exchange-visibility failed");
    res.status(500).json({ error: "Failed to load exchange visibility" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/users/:id/exchange-visibility   (upsert override)
// ─────────────────────────────────────────────────────────────────────────────
const UpsertBodySchema = z.object({
  exchangeId: z.string().trim().min(1).max(64),
  visible:    z.boolean(),
  note:       z.string().trim().min(1, "Operator note is required").max(2_000),
});

router.post("/admin/users/:id/exchange-visibility", requireOperator, async (req: Request, res: Response) => {
  try {
    const targetId = String(req.params["id"] ?? "");
    if (!targetId) {
      res.status(400).json({ error: "Missing user id" });
      return;
    }
    const parsed = UpsertBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const { exchangeId, visible, note } = parsed.data;
    const actorId = (req as AuthReq).clerkUserId;

    if (!CATALOG_BY_ID[exchangeId]) {
      res.status(400).json({ error: `Unknown exchange: ${exchangeId}` });
      return;
    }

    const now = new Date();
    const auditId = randomUUID();

    // Single-tx upsert + audit. Prior snapshot is read inside the tx so the
    // before/after payload reflects in-tx state; ON CONFLICT DO UPDATE
    // collapses the create-race window (concurrent first-time POSTs no
    // longer surface a unique-violation 500). When two concurrent POSTs
    // race a first-time create, the loser's audit `before` may report
    // null while the row was being created in parallel — accepted as
    // strictly less-bad than the previous TOCTOU + 500 path.
    await db.transaction(async (tx) => {
      const [prior] = await tx
        .select()
        .from(userExchangeVisibilityTable)
        .where(and(
          eq(userExchangeVisibilityTable.clerkUserId, targetId),
          eq(userExchangeVisibilityTable.exchangeId, exchangeId),
        ))
        .limit(1);

      await tx
        .insert(userExchangeVisibilityTable)
        .values({
          id:               randomUUID(),
          clerkUserId:      targetId,
          exchangeId,
          visible,
          note,
          updatedByAdminId: actorId,
        })
        .onConflictDoUpdate({
          target: [
            userExchangeVisibilityTable.clerkUserId,
            userExchangeVisibilityTable.exchangeId,
          ],
          set: {
            visible,
            note,
            updatedAt:        now,
            updatedByAdminId: actorId,
          },
        });

      await tx.insert(userAdminActionsTable).values({
        id:           auditId,
        actorAdminId: actorId,
        targetUserId: targetId,
        action:       "set_exchange_visibility",
        payload: {
          exchangeId,
          before: prior ? { visible: prior.visible, note: prior.note } : null,
          after:  { visible, note },
        },
      });
    });

    try {
      executionStreamBus.emitEvent({
        type:     "admin_action_applied",
        severity: "info",
        message:  `Admin ${actorId} set ${exchangeId} visibility=${visible} for ${targetId}`,
        details:  { auditId, exchangeId, visible },
      });
    } catch { /* never let stream emit fail an operator action */ }

    res.json({ ok: true, exchangeId, visible, updatedAt: now.toISOString() });
  } catch (err) {
    req.log?.error({ err }, "POST /admin/users/:id/exchange-visibility failed");
    res.status(500).json({ error: "Failed to set exchange visibility" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/users/:id/exchange-visibility/:exchangeId   (clear override)
// ─────────────────────────────────────────────────────────────────────────────
const ClearBodySchema = z.object({
  note: z.string().trim().min(1, "Operator note is required").max(2_000),
});

router.delete("/admin/users/:id/exchange-visibility/:exchangeId", requireOperator, async (req: Request, res: Response) => {
  try {
    const targetId   = String(req.params["id"] ?? "");
    const exchangeId = String(req.params["exchangeId"] ?? "");
    if (!targetId || !exchangeId) {
      res.status(400).json({ error: "Missing user id or exchange id" });
      return;
    }
    const parsed = ClearBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const { note } = parsed.data;
    const actorId = (req as AuthReq).clerkUserId;

    const auditId = randomUUID();

    // Single-tx delete + audit. The delete itself uses `.returning()` so the
    // audit row is only written if the delete actually removed a row,
    // preventing false-positive "clear" entries when two concurrent DELETE
    // calls race (the second observes 0-row delete → 404, no audit).
    const result = await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(userExchangeVisibilityTable)
        .where(and(
          eq(userExchangeVisibilityTable.clerkUserId, targetId),
          eq(userExchangeVisibilityTable.exchangeId, exchangeId),
        ))
        .returning();

      if (deleted.length === 0) {
        return { ok: false as const };
      }

      const prior = deleted[0]!;
      await tx.insert(userAdminActionsTable).values({
        id:           auditId,
        actorAdminId: actorId,
        targetUserId: targetId,
        action:       "clear_exchange_visibility",
        payload: {
          exchangeId,
          before: { visible: prior.visible, note: prior.note },
          note,
        },
      });
      return { ok: true as const };
    });

    if (!result.ok) {
      res.status(404).json({ error: "No override set for this exchange" });
      return;
    }

    try {
      executionStreamBus.emitEvent({
        type:     "admin_action_applied",
        severity: "info",
        message:  `Admin ${actorId} cleared ${exchangeId} visibility override for ${targetId}`,
        details:  { auditId, exchangeId },
      });
    } catch { /* never let stream emit fail an operator action */ }

    res.json({ ok: true, exchangeId, cleared: true });
  } catch (err) {
    req.log?.error({ err }, "DELETE /admin/users/:id/exchange-visibility/:exchangeId failed");
    res.status(500).json({ error: "Failed to clear exchange visibility override" });
  }
});

export default router;
