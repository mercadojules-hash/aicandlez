/**
 * Operator user-management write endpoints (Task #159).
 *
 *   POST /api/admin/users/:id/activate
 *   POST /api/admin/users/:id/suspend
 *   POST /api/admin/users/:id/disable
 *   POST /api/admin/users/:id/force_paper
 *   POST /api/admin/users/:id/override_trade_limit
 *   POST /api/admin/users/:id/cancel_subscription
 *   POST /api/admin/users/:id/complimentary_subscription
 *   POST /api/admin/users/:id/extend_subscription
 *   POST /api/admin/users/:id/revoke_exchange_access        (super-admin only)
 *   POST /api/admin/users/:id/emergency_disable             (super-admin only)
 *
 * Every endpoint:
 *   - requireAuth + requireRole(["admin","super-admin"])
 *   - Operator self-action blocked (actor !== target)
 *   - Body validated by Zod, including a required non-empty `note`
 *   - Writes an immutable row to `user_admin_actions` BEFORE returning
 *     success, with the actor's clerk id, action label, and a self-contained
 *     `{ before, after, note, ... }` payload snapshot
 *   - Invalidates the admin-telemetry read cache and (for status / trade-limit
 *     mutations) the corresponding engine caches so changes are visible
 *     within the existing 5 s TTL
 *
 * No schema changes; the foundation task established `user_admin_status`,
 * `user_trade_limits`, and `user_admin_actions`. The pre-execution guard
 * (`userStatusGuard`) and trade-limit engine read those tables directly, so
 * enforcement is automatic — we only mutate state here.
 *
 * Stripe interactions go through the existing `stripeClient` helper. No
 * direct mutations of the synced `stripe.*` schema; we let Stripe webhooks
 * reconcile state.
 */

import { Router, type Request, type Response } from "express";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod/v4";
import { sql, eq } from "drizzle-orm";
import {
  db,
  usersTable,
  userAdminStatusTable,
  userAdminActionsTable,
  userTradeLimitsTable,
  userExchangeConnectionsTable,
  ADMIN_STATUSES,
  TRADE_LIMIT_CAP_TIERS,
  type AdminStatus,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { getUncachableStripeClient } from "../stripeClient.js";
import { invalidateTradeLimitCache } from "../lib/tradeLimitEngine.js";
import { __invalidateAdminUserTelemetryCache } from "./adminUserTelemetry.js";

const router = Router();
const requireOperator   = [requireAuth, requireRole(["admin", "super-admin"])];
const requireSuperAdmin = [requireAuth, requireRole(["super-admin"])];

type AuthReq = Request & { clerkUserId: string };

// ── Shared schemas ────────────────────────────────────────────────────────────

const NoteSchema = z
  .string()
  .trim()
  .min(1, "Operator note is required")
  .max(2_000, "Operator note is too long");

const StatusBodySchema = z.object({ note: NoteSchema, reason: z.string().trim().max(500).optional() });

const TradeLimitBodySchema = z.object({
  note:      NoteSchema,
  capTier:   z.number().int().refine(
    (v: number) => (TRADE_LIMIT_CAP_TIERS as readonly number[]).includes(v),
    { message: `capTier must be one of ${TRADE_LIMIT_CAP_TIERS.join(", ")}` },
  ),
  // Optional ISO-8601 string; null clears the expiry (permanent bump).
  expiresAt: z.union([z.string().datetime(), z.null()]).optional(),
});

const CancelSubBodySchema = z.object({
  note:                NoteSchema,
  cancelAtPeriodEnd:   z.boolean().default(true),
});

const CompSubBodySchema = z.object({
  note:    NoteSchema,
  // Comp grants act by pushing trial_end forward (Stripe-native). Days
  // capped at 365 so a typo can't accidentally grant a decade of free Pro.
  days:    z.number().int().min(1).max(365),
});

const ExtendSubBodySchema = z.object({
  note:    NoteSchema,
  days:    z.number().int().min(1).max(180),
});

const RevokeBodySchema = z.object({ note: NoteSchema });

const EmergencyBodySchema = z.object({
  note:   NoteSchema,
  reason: z.string().trim().min(1, "Reason is required").max(500),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

interface ActorCtx {
  actorId:   string;
  targetId:  string;
  req:       Request;
  res:       Response;
}

/** Pull + validate the actor/target pair, enforce no-self-action. Returns null
 *  on rejection (response already sent). */
function resolveActor(req: Request, res: Response): ActorCtx | null {
  const actorId  = (req as AuthReq).clerkUserId;
  const targetId = String(req.params["id"] ?? "");
  if (!targetId) {
    res.status(400).json({ error: "Missing user id" });
    return null;
  }
  if (actorId === targetId) {
    res.status(400).json({ error: "Operators cannot act on their own account" });
    return null;
  }
  return { actorId, targetId, req, res };
}

/** Day-stable idempotency key for Stripe billing actions. Two calls with the
 *  same (action, target, actor, UTC day) reuse the same key so a flapping
 *  operator click cannot double-charge or double-grant. */
function dayIdempotencyKey(parts: { action: string; target: string; actor: string }): string {
  const day = new Date().toISOString().slice(0, 10);
  const raw = `${parts.action}::${parts.target}::${parts.actor}::${day}`;
  return createHash("sha256").update(raw).digest("hex");
}

interface AuditOpts {
  actorId:   string;
  targetId:  string;
  action:    string;
  payload:   Record<string, unknown>;
}

async function writeAudit(opts: AuditOpts): Promise<string> {
  const id = randomUUID();
  await db.insert(userAdminActionsTable).values({
    id,
    actorAdminId: opts.actorId,
    targetUserId: opts.targetId,
    action:       opts.action,
    payload:      opts.payload,
  });
  // Telemetry cache key includes the audit table snapshot, so any operator
  // action must invalidate the read-side cache to avoid a stale 5s window.
  try { __invalidateAdminUserTelemetryCache(); } catch { /* test stub */ }
  return id;
}

async function loadStatusRow(userId: string) {
  const [row] = await db
    .select()
    .from(userAdminStatusTable)
    .where(eq(userAdminStatusTable.userId, userId))
    .limit(1);
  return row ?? null;
}

async function upsertStatus(args: {
  userId:   string;
  actorId:  string;
  status:   AdminStatus;
  reason:   string | null;
}) {
  const now = new Date();
  await db
    .insert(userAdminStatusTable)
    .values({
      userId:       args.userId,
      status:       args.status,
      setByAdminId: args.actorId,
      reason:       args.reason,
      since:        now,
      updatedAt:    now,
    })
    .onConflictDoUpdate({
      target: userAdminStatusTable.userId,
      set: {
        status:       args.status,
        setByAdminId: args.actorId,
        reason:       args.reason,
        since:        now,
        updatedAt:    now,
      },
    });
}

/** Wraps a status-mutation handler so the four endpoints (activate /
 *  suspend / disable / force_paper) share one implementation. */
function makeStatusHandler(nextStatus: AdminStatus) {
  return async (req: Request, res: Response): Promise<void> => {
    const ctx = resolveActor(req, res);
    if (!ctx) return;
    const parsed = StatusBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const { note, reason } = parsed.data;
    try {
      const before = await loadStatusRow(ctx.targetId);
      await upsertStatus({
        userId:  ctx.targetId,
        actorId: ctx.actorId,
        status:  nextStatus,
        reason:  reason ?? null,
      });
      const after = await loadStatusRow(ctx.targetId);
      await writeAudit({
        actorId:  ctx.actorId,
        targetId: ctx.targetId,
        action:   "set_status",
        payload:  { note, before, after, nextStatus },
      });
      res.json({ ok: true, status: nextStatus, after });
    } catch (err) {
      req.log.error({ err, nextStatus }, "admin set_status failed");
      res.status(500).json({ error: "Failed to update user status" });
    }
  };
}

// ── Status mutations ─────────────────────────────────────────────────────────

router.post("/admin/users/:id/activate",    ...requireOperator, makeStatusHandler("active"));
router.post("/admin/users/:id/suspend",     ...requireOperator, makeStatusHandler("suspended"));
router.post("/admin/users/:id/disable",     ...requireOperator, makeStatusHandler("disabled"));
router.post("/admin/users/:id/force_paper", ...requireOperator, makeStatusHandler("force_paper"));

// ── Trade-limit override ─────────────────────────────────────────────────────

router.post("/admin/users/:id/override_trade_limit", ...requireOperator, async (req, res): Promise<void> => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;
  const parsed = TradeLimitBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { note, capTier, expiresAt } = parsed.data;
  try {
    const [before] = await db.select().from(userTradeLimitsTable)
      .where(eq(userTradeLimitsTable.userId, ctx.targetId)).limit(1);
    const expiresDate = expiresAt ? new Date(expiresAt) : null;
    const now = new Date();
    await db.insert(userTradeLimitsTable).values({
      userId:            ctx.targetId,
      capTier,
      overrideExpiresAt: expiresDate,
      createdAt:         now,
      updatedAt:         now,
    }).onConflictDoUpdate({
      target: userTradeLimitsTable.userId,
      set: { capTier, overrideExpiresAt: expiresDate, updatedAt: now },
    });
    const [after] = await db.select().from(userTradeLimitsTable)
      .where(eq(userTradeLimitsTable.userId, ctx.targetId)).limit(1);
    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "set_trade_limit",
      payload:  { note, before: before ?? null, after: after ?? null, capTier, expiresAt: expiresAt ?? null },
    });
    invalidateTradeLimitCache(ctx.targetId);
    res.json({ ok: true, after: after ?? null });
  } catch (err) {
    req.log.error({ err }, "admin set_trade_limit failed");
    res.status(500).json({ error: "Failed to update trade limit" });
  }
});

// ── Subscription actions (Stripe-mediated, idempotent) ──────────────────────

async function loadStripeIds(userId: string) {
  const [row] = await db.select({
    stripeCustomerId:     usersTable.stripeCustomerId,
    stripeSubscriptionId: usersTable.stripeSubscriptionId,
    trialEndsAt:          usersTable.trialEndsAt,
    plan:                 usersTable.plan,
    planStatus:           usersTable.planStatus,
  }).from(usersTable).where(eq(usersTable.clerkUserId, userId)).limit(1);
  return row ?? null;
}

router.post("/admin/users/:id/cancel_subscription", ...requireOperator, async (req, res): Promise<void> => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;
  const parsed = CancelSubBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { note, cancelAtPeriodEnd } = parsed.data;
  try {
    const before = await loadStripeIds(ctx.targetId);
    if (!before?.stripeSubscriptionId) {
      res.status(409).json({ error: "User has no active Stripe subscription" });
      return;
    }
    const stripe = await getUncachableStripeClient();
    const result = cancelAtPeriodEnd
      ? await stripe.subscriptions.update(before.stripeSubscriptionId,
          { cancel_at_period_end: true },
          { idempotencyKey: dayIdempotencyKey({ action: "cancel_sub", target: ctx.targetId, actor: ctx.actorId }) })
      : await stripe.subscriptions.cancel(before.stripeSubscriptionId, {},
          { idempotencyKey: dayIdempotencyKey({ action: "cancel_sub_now", target: ctx.targetId, actor: ctx.actorId }) });
    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "comp_subscription",   // shared bucket with comp/extend; payload.kind disambiguates
      payload:  {
        note,
        kind:                "cancel_subscription",
        cancelAtPeriodEnd,
        before:              { stripeSubscriptionId: before.stripeSubscriptionId, planStatus: before.planStatus },
        stripeSubscriptionId: result.id,
        stripeStatus:        result.status,
        cancelAt:            result.cancel_at ?? null,
      },
    });
    res.json({ ok: true, stripeStatus: result.status, cancelAt: result.cancel_at ?? null });
  } catch (err) {
    req.log.error({ err }, "admin cancel_subscription failed");
    res.status(502).json({ error: `Stripe cancellation failed: ${(err as Error).message}` });
  }
});

router.post("/admin/users/:id/complimentary_subscription", ...requireOperator, async (req, res): Promise<void> => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;
  const parsed = CompSubBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { note, days } = parsed.data;
  try {
    const before = await loadStripeIds(ctx.targetId);
    if (!before?.stripeSubscriptionId) {
      res.status(409).json({ error: "User has no Stripe subscription to comp" });
      return;
    }
    const stripe = await getUncachableStripeClient();
    const trialEndUnix = Math.floor(Date.now() / 1000) + days * 86_400;
    const updated = await stripe.subscriptions.update(before.stripeSubscriptionId, {
      trial_end:           trialEndUnix,
      proration_behavior:  "none",
    }, { idempotencyKey: dayIdempotencyKey({ action: `comp_sub_${days}d`, target: ctx.targetId, actor: ctx.actorId }) });
    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "comp_subscription",
      payload:  {
        note,
        kind:                "complimentary_subscription",
        days,
        before:              { stripeSubscriptionId: before.stripeSubscriptionId, planStatus: before.planStatus, trialEndsAt: before.trialEndsAt },
        stripeSubscriptionId: updated.id,
        stripeStatus:        updated.status,
        trialEnd:            updated.trial_end ?? null,
      },
    });
    res.json({ ok: true, trialEnd: updated.trial_end ?? null, stripeStatus: updated.status });
  } catch (err) {
    req.log.error({ err }, "admin complimentary_subscription failed");
    res.status(502).json({ error: `Stripe comp grant failed: ${(err as Error).message}` });
  }
});

router.post("/admin/users/:id/extend_subscription", ...requireOperator, async (req, res): Promise<void> => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;
  const parsed = ExtendSubBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { note, days } = parsed.data;
  try {
    const before = await loadStripeIds(ctx.targetId);
    if (!before?.stripeSubscriptionId) {
      res.status(409).json({ error: "User has no Stripe subscription to extend" });
      return;
    }
    const stripe   = await getUncachableStripeClient();
    // Push trial_end forward — Stripe-native way to defer the next charge
    // without touching the customer's invoice cycle directly.
    const trialEndUnix = Math.floor(Date.now() / 1000) + days * 86_400;
    const updated = await stripe.subscriptions.update(before.stripeSubscriptionId, {
      trial_end:           trialEndUnix,
      proration_behavior:  "none",
    }, { idempotencyKey: dayIdempotencyKey({ action: `extend_sub_${days}d`, target: ctx.targetId, actor: ctx.actorId }) });
    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "extend_trial",
      payload:  {
        note,
        kind:                "extend_subscription",
        days,
        before:              { stripeSubscriptionId: before.stripeSubscriptionId, planStatus: before.planStatus, trialEndsAt: before.trialEndsAt },
        stripeSubscriptionId: updated.id,
        stripeStatus:        updated.status,
        trialEnd:            updated.trial_end ?? null,
      },
    });
    res.json({ ok: true, trialEnd: updated.trial_end ?? null, stripeStatus: updated.status });
  } catch (err) {
    req.log.error({ err }, "admin extend_subscription failed");
    res.status(502).json({ error: `Stripe extension failed: ${(err as Error).message}` });
  }
});

// ── Exchange revocation (super-admin) ────────────────────────────────────────

router.post("/admin/users/:id/revoke_exchange_access", ...requireSuperAdmin, async (req, res): Promise<void> => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;
  const parsed = RevokeBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { note } = parsed.data;
  try {
    // Capture before-snapshot (metadata only — encrypted blob is NEVER read here)
    const before = await db.select({
      id:           userExchangeConnectionsTable.id,
      exchange:     userExchangeConnectionsTable.exchange,
      status:       userExchangeConnectionsTable.status,
      tradingMode:  userExchangeConnectionsTable.tradingMode,
    }).from(userExchangeConnectionsTable)
      .where(eq(userExchangeConnectionsTable.userId, ctx.targetId));
    const deleted = await db.delete(userExchangeConnectionsTable)
      .where(eq(userExchangeConnectionsTable.userId, ctx.targetId))
      .returning({ id: userExchangeConnectionsTable.id });
    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "revoke_exchange",
      payload:  { note, before, deletedCount: deleted.length },
    });
    res.json({ ok: true, deleted: deleted.length });
  } catch (err) {
    req.log.error({ err }, "admin revoke_exchange_access failed");
    res.status(500).json({ error: "Failed to revoke exchange access" });
  }
});

// ── Emergency disable (super-admin, composite) ──────────────────────────────

router.post("/admin/users/:id/emergency_disable", ...requireSuperAdmin, async (req, res): Promise<void> => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;
  const parsed = EmergencyBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { note, reason } = parsed.data;
  try {
    const statusBefore   = await loadStatusRow(ctx.targetId);
    const stripeBefore   = await loadStripeIds(ctx.targetId);
    const exchangeBefore = await db.select({
      id:           userExchangeConnectionsTable.id,
      exchange:     userExchangeConnectionsTable.exchange,
      tradingMode:  userExchangeConnectionsTable.tradingMode,
    }).from(userExchangeConnectionsTable)
      .where(eq(userExchangeConnectionsTable.userId, ctx.targetId));

    // 1. Suspend + force paper (status="disabled" covers both — blocks all execution & auth)
    await upsertStatus({ userId: ctx.targetId, actorId: ctx.actorId, status: "disabled", reason });

    // 2. Wipe stored exchange credentials
    const deleted = await db.delete(userExchangeConnectionsTable)
      .where(eq(userExchangeConnectionsTable.userId, ctx.targetId))
      .returning({ id: userExchangeConnectionsTable.id });

    // 3. Cancel Stripe subscription at period end (do not refund — operator handles)
    let stripeOutcome: { stripeSubscriptionId: string | null; stripeStatus: string | null; error?: string } = {
      stripeSubscriptionId: stripeBefore?.stripeSubscriptionId ?? null,
      stripeStatus:         null,
    };
    if (stripeBefore?.stripeSubscriptionId) {
      try {
        const stripe = await getUncachableStripeClient();
        const updated = await stripe.subscriptions.update(stripeBefore.stripeSubscriptionId,
          { cancel_at_period_end: true },
          { idempotencyKey: dayIdempotencyKey({ action: "emergency_disable", target: ctx.targetId, actor: ctx.actorId }) });
        stripeOutcome = { stripeSubscriptionId: updated.id, stripeStatus: updated.status };
      } catch (stripeErr) {
        // Do NOT roll back local mutations — the user is already locked
        // out, which is the right safety posture. Record the Stripe
        // failure in the audit row for follow-up.
        stripeOutcome = {
          stripeSubscriptionId: stripeBefore.stripeSubscriptionId,
          stripeStatus:         null,
          error:                (stripeErr as Error).message,
        };
      }
    }

    const statusAfter = await loadStatusRow(ctx.targetId);
    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "emergency_disable",
      payload:  {
        note,
        reason,
        before: {
          status:    statusBefore,
          stripe:    stripeBefore ? { stripeSubscriptionId: stripeBefore.stripeSubscriptionId, planStatus: stripeBefore.planStatus } : null,
          exchanges: exchangeBefore,
        },
        after: {
          status:           statusAfter,
          exchangesDeleted: deleted.length,
          stripe:           stripeOutcome,
        },
      },
    });

    res.json({
      ok:               true,
      status:           "disabled",
      exchangesDeleted: deleted.length,
      stripe:           stripeOutcome,
    });
  } catch (err) {
    req.log.error({ err }, "admin emergency_disable failed");
    res.status(500).json({ error: "Emergency disable failed" });
  }
});

// ── Health-check style helper for the upcoming UI ───────────────────────────
// Returns the most recent audit rows for a target user. Read-only; the
// telemetry detail endpoint also includes this stream — exposing it as a
// dedicated route makes the operator UI's "audit drawer" trivial.
router.get("/admin/users/:id/audit", ...requireOperator, async (req, res): Promise<void> => {
  const targetId = String(req.params["id"] ?? "");
  if (!targetId) { res.status(400).json({ error: "Missing user id" }); return; }
  try {
    const rows = await db.execute(sql`
      SELECT id, actor_admin_id, action, payload, created_at
        FROM user_admin_actions
       WHERE target_user_id = ${targetId}
       ORDER BY created_at DESC
       LIMIT 100
    `);
    res.json({ audit: rows.rows });
  } catch (err) {
    req.log.error({ err }, "admin audit fetch failed");
    res.status(500).json({ error: "Failed to load audit trail" });
  }
});

export default router;
