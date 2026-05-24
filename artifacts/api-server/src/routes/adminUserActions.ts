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
import { clerkClient } from "@clerk/express";
import {
  db,
  usersTable,
  userAdminStatusTable,
  userAdminActionsTable,
  userTradeLimitsTable,
  userExchangeConnectionsTable,
  ADMIN_STATUSES,
  TRADE_LIMIT_CAP_TIERS,
  DEFAULT_TRADE_LIMIT_CAP,
  type AdminStatus,
} from "@workspace/db";
import { isSuperAdminEmail } from "../lib/adminAllowlist.js";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import {
  cancelSubscriptionAtPeriodEnd,
  cancelSubscriptionImmediately,
  grantComplimentaryDays,
  extendSubscriptionByDays,
  createComplimentarySubscription,
  resolvePriceIdForPlan,
  type StripeSubscriptionOutcome,
} from "../lib/adminBillingActions.js";
import { invalidateTradeLimitCache } from "../lib/tradeLimitEngine.js";
import { executionStreamBus, type ExecStreamType } from "../lib/executionStreamBus.js";
import { __invalidateAdminUserTelemetryCache } from "./adminUserTelemetry.js";
import {
  checkBillingHealth,
  addCredits,
  waiveAllPendingFees,
  forceRestoreBilling,
  evaluateAndEnforceBillingHold,
  getOutstanding,
  getCreditBalance,
} from "../lib/billingEnforcement.js";
import { performanceFeesTable, creditTransactionsTable } from "@workspace/db";
import { desc, sql as drizzleSql } from "drizzle-orm";

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

// Drizzle tx and db both expose insert/update/delete/select with the same
// shape, but TS sees them as distinct types. We only call those four
// methods through the executor, so a structural type is enough and lets a
// transaction `tx` slot in wherever a top-level `db` would.
type DbExecutor = Pick<typeof db, "insert" | "update" | "delete" | "select">;

async function writeAudit(opts: AuditOpts, executor: DbExecutor = db): Promise<string> {
  const id = randomUUID();
  await executor.insert(userAdminActionsTable).values({
    id,
    actorAdminId: opts.actorId,
    targetUserId: opts.targetId,
    action:       opts.action,
    payload:      opts.payload,
  });
  // Telemetry cache key includes the audit table snapshot, so any operator
  // action must invalidate the read-side cache to avoid a stale 5s window.
  try { __invalidateAdminUserTelemetryCache(); } catch { /* test stub */ }
  // Mirror to the operator execution stream so the live operator console
  // surfaces the action in realtime alongside engine events. Revocations
  // get their own type so the UI can render a distinct notification card.
  const streamType: ExecStreamType =
    opts.action === "revoke_exchange" ? "admin_exchange_access_revoked" : "admin_action_applied";
  const severity = opts.action === "emergency_disable" || opts.action === "revoke_exchange"
    ? "warn" : "info";
  try {
    executionStreamBus.emitEvent({
      type:    streamType,
      severity,
      message: `Admin ${opts.actorId} → ${opts.targetId}: ${opts.action}`,
      details: { auditId: id, actorId: opts.actorId, targetUserId: opts.targetId, action: opts.action, payload: opts.payload },
    });
  } catch { /* never let a stream emit fail an operator action */ }
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
}, executor: DbExecutor = db) {
  const now = new Date();
  await executor
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
    const idempotencyKey = dayIdempotencyKey({
      action: cancelAtPeriodEnd ? "cancel_sub" : "cancel_sub_now",
      target: ctx.targetId, actor: ctx.actorId,
    });
    const result = cancelAtPeriodEnd
      ? await cancelSubscriptionAtPeriodEnd(before.stripeSubscriptionId, idempotencyKey)
      : await cancelSubscriptionImmediately(before.stripeSubscriptionId, idempotencyKey);
    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "cancel_subscription",
      payload:  {
        note,
        cancelAtPeriodEnd,
        before:              { stripeSubscriptionId: before.stripeSubscriptionId, planStatus: before.planStatus },
        stripeSubscriptionId: result.id,
        stripeStatus:        result.status,
        cancelAt:            result.cancelAt,
      },
    });
    res.json({ ok: true, stripeStatus: result.status, cancelAt: result.cancelAt });
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
    const updated = await grantComplimentaryDays(
      before.stripeSubscriptionId, days,
      dayIdempotencyKey({ action: `comp_sub_${days}d`, target: ctx.targetId, actor: ctx.actorId }),
    );
    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "complimentary_subscription",
      payload:  {
        note,
        days,
        before:              { stripeSubscriptionId: before.stripeSubscriptionId, planStatus: before.planStatus, trialEndsAt: before.trialEndsAt },
        stripeSubscriptionId: updated.id,
        stripeStatus:        updated.status,
        trialEnd:            updated.trialEnd,
      },
    });
    res.json({ ok: true, trialEnd: updated.trialEnd, stripeStatus: updated.status });
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
    const updated = await extendSubscriptionByDays(
      before.stripeSubscriptionId, days,
      dayIdempotencyKey({ action: `extend_sub_${days}d`, target: ctx.targetId, actor: ctx.actorId }),
    );
    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "extend_subscription",
      payload:  {
        note,
        days,
        before:              { stripeSubscriptionId: before.stripeSubscriptionId, planStatus: before.planStatus, trialEndsAt: before.trialEndsAt },
        stripeSubscriptionId: updated.id,
        stripeStatus:        updated.status,
        trialEnd:            updated.trialEnd,
      },
    });
    res.json({ ok: true, trialEnd: updated.trialEnd, stripeStatus: updated.status });
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

    // Stripe is an external call — execute BEFORE the local DB transaction
    // so a Stripe failure cannot abort the local lockout (the safety-first
    // posture: a user we've decided to emergency-disable MUST be locked
    // out locally even if Stripe is down). The local DB mutations + audit
    // row are then committed inside a single transaction below, guaranteeing
    // either every leg + the immutable audit row commits, or none of it does.
    const steps: Array<{ step: string; ok: boolean; details?: unknown; error?: string }> = [];

    let stripeOutcome: { stripeSubscriptionId: string | null; stripeStatus: string | null; error?: string } = {
      stripeSubscriptionId: stripeBefore?.stripeSubscriptionId ?? null,
      stripeStatus:         null,
    };
    if (stripeBefore?.stripeSubscriptionId) {
      try {
        const updated: StripeSubscriptionOutcome = await cancelSubscriptionAtPeriodEnd(
          stripeBefore.stripeSubscriptionId,
          dayIdempotencyKey({ action: "emergency_disable", target: ctx.targetId, actor: ctx.actorId }),
        );
        stripeOutcome = { stripeSubscriptionId: updated.id, stripeStatus: updated.status };
      } catch (stripeErr) {
        stripeOutcome = {
          stripeSubscriptionId: stripeBefore.stripeSubscriptionId,
          stripeStatus:         null,
          error:                (stripeErr as Error).message,
        };
      }
    }

    // Local transaction — all local mutations + the audit row commit
    // atomically. If anything in this block throws, Drizzle aborts the
    // transaction and NO local state is left in a partially-mutated state
    // without a matching audit row. The Stripe outcome (already executed)
    // is captured inside the audit payload so an external failure is
    // forensically visible.
    const txResult = await db.transaction(async (tx) => {
      // 1. force_paper — block live execution while we tear down
      await upsertStatus({ userId: ctx.targetId, actorId: ctx.actorId, status: "force_paper", reason }, tx);
      steps.push({ step: "force_paper", ok: true });

      // 2. suspended — block paper execution too
      await upsertStatus({ userId: ctx.targetId, actorId: ctx.actorId, status: "suspended", reason }, tx);
      steps.push({ step: "suspended", ok: true });

      // 3. revoke_exchange — wipe stored exchange credentials
      const deletedRows = await tx.delete(userExchangeConnectionsTable)
        .where(eq(userExchangeConnectionsTable.userId, ctx.targetId))
        .returning({ id: userExchangeConnectionsTable.id });
      steps.push({ step: "revoke_exchange", ok: true, details: { deletedCount: deletedRows.length } });

      // 4. cancel_subscription leg — outcome already computed pre-tx
      steps.push(stripeBefore?.stripeSubscriptionId
        ? (stripeOutcome.error
            ? { step: "cancel_subscription", ok: false, error: stripeOutcome.error }
            : { step: "cancel_subscription", ok: true, details: stripeOutcome })
        : { step: "cancel_subscription", ok: true, details: "no_subscription_on_file" });

      // 5. disabled — final hard lock (blocks auth bootstrap too)
      await upsertStatus({ userId: ctx.targetId, actorId: ctx.actorId, status: "disabled", reason }, tx);
      steps.push({ step: "disabled", ok: true });

      const statusAfter = await tx
        .select().from(userAdminStatusTable)
        .where(eq(userAdminStatusTable.userId, ctx.targetId)).limit(1);

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
            status:           statusAfter[0] ?? null,
            exchangesDeleted: deletedRows.length,
            stripe:           stripeOutcome,
            steps,
          },
        },
      }, tx);

      return { deletedCount: deletedRows.length };
    });

    res.json({
      ok:               true,
      status:           "disabled",
      exchangesDeleted: txResult.deletedCount,
      stripe:           stripeOutcome,
      steps,
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/users/sync_from_clerk
//
// Backfill the local `users` table from Clerk. Clerk-side signups (landing
// page, /sign-up, Stripe checkout) provision a Clerk user but our local
// `users` row is only JIT-created when the user hits GET /auth/me. Users
// who sign up but never open the dashboard are therefore invisible to
// admin telemetry. This endpoint paginates the Clerk Backend API and
// upserts every Clerk user into `users` (and `user_trade_limits`),
// back-filling missing emails on existing rows and auto-promoting
// allowlisted super-admin emails.
//
// Read-only against Clerk. Idempotent. Safe to run repeatedly.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/users/:id/create_complimentary_subscription   (super-admin only)
//
// Create a brand-new STARTER or PRO subscription for a user who has NO
// existing Stripe subscription. Used for influencers, beta testers, DJs,
// affiliate partners, internal QA, reviewers, promotional onboarding.
//
// Zero charge — Stripe sub is created in `trialing` state with
// `trial_period_days=N` and `cancel_at_period_end=true` so it auto-cancels
// at trial end (operator must explicitly extend or convert to paid).
// Fully compatible with existing entitlement middleware: `users.plan` and
// `users.plan_status` are persisted, the same fields every gate reads.
// Auto-cancel default protects against accidental billing.
// ─────────────────────────────────────────────────────────────────────────────

const CreateCompSubBodySchema = z.object({
  plan:      z.enum(["free", "starter", "pro"]),
  days:      z.number().int().min(1).max(365),
  paperOnly: z.boolean().default(true),
  capTier:   z.number().int().refine(v => TRADE_LIMIT_CAP_TIERS.includes(v as typeof TRADE_LIMIT_CAP_TIERS[number]), {
    message: `capTier must be one of ${TRADE_LIMIT_CAP_TIERS.join(", ")}`,
  }).optional(),
  note:      NoteSchema,
});

router.post("/admin/users/:id/create_complimentary_subscription", ...requireSuperAdmin, async (req, res): Promise<void> => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;
  const parsed = CreateCompSubBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { plan, days, paperOnly, capTier, note } = parsed.data;

  try {
    const [target] = await db.select({
      email:                usersTable.email,
      billingEmail:         usersTable.billingEmail,
      stripeCustomerId:     usersTable.stripeCustomerId,
      stripeSubscriptionId: usersTable.stripeSubscriptionId,
      plan:                 usersTable.plan,
      planStatus:           usersTable.planStatus,
      trialEndsAt:          usersTable.trialEndsAt,
    }).from(usersTable).where(eq(usersTable.clerkUserId, ctx.targetId)).limit(1);

    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    // Block ALL comp creation on users who already have a Stripe sub —
    // including FREE — because overwriting users.plan='free' would desync
    // local entitlement from Stripe (which would keep billing the customer).
    // Operator must cancel the sub via Stripe portal first.
    if (target.stripeSubscriptionId) {
      res.status(409).json({
        error: "User already has a Stripe subscription. Use 'Grant Complimentary Days' to extend, or cancel via Stripe portal first.",
      });
      return;
    }

    const trialEndDate = new Date(Date.now() + days * 86_400 * 1000);
    let stripeSubId:   string | null = null;
    let stripeCustId:  string | null = target.stripeCustomerId ?? null;
    let stripeStatus:  string        = "trialing";

    if (plan === "free") {
      // FREE comp — no Stripe sub. Just mark users row with trial_ends_at
      // so the operator can identify the time-boxed complimentary account.
      // Used for paper-only beta testers / reviewers / internal QA.
      await db.update(usersTable)
        .set({
          plan:        "free",
          planStatus:  "trialing",
          trialEndsAt: trialEndDate,
          updatedAt:   new Date(),
        })
        .where(eq(usersTable.clerkUserId, ctx.targetId));
    } else {
      // STARTER / PRO comp — create a Stripe sub in trialing state with
      // cancel_at_period_end=true so it auto-cancels (no surprise billing).
      const email = (target.billingEmail ?? target.email ?? "").trim();
      if (!email) {
        res.status(409).json({ error: "User has no email on file. Sync from Clerk first." });
        return;
      }
      const priceId = resolvePriceIdForPlan(plan);
      if (!priceId) {
        res.status(500).json({
          error: `Stripe price for ${plan.toUpperCase()} not configured (set STRIPE_PRICE_${plan.toUpperCase()}_MONTHLY).`,
        });
        return;
      }
      // Idempotency key excludes actor — two super-admins clicking on the
      // same user same day must collide, not double-subscribe.
      const idemKey = dayIdempotencyKey({
        action: `create_comp_${plan}_${days}d`,
        target: ctx.targetId,
        actor:  "shared",
      });
      const { subscription, customerId } = await createComplimentarySubscription({
        email,
        clerkUserId:          ctx.targetId,
        priceId,
        days,
        existingCustomerId:   target.stripeCustomerId,
        idempotencyKey:       idemKey,
        autoCancelAtTrialEnd: true,
      });
      stripeSubId  = subscription.id;
      stripeCustId = customerId;
      stripeStatus = subscription.status;

      await db.update(usersTable)
        .set({
          stripeCustomerId:     customerId,
          stripeSubscriptionId: subscription.id,
          billingEmail:         email,
          plan,
          planStatus:           subscription.status,
          trialEndsAt:          subscription.trialEnd ? new Date(subscription.trialEnd * 1000) : trialEndDate,
          updatedAt:            new Date(),
        })
        .where(eq(usersTable.clerkUserId, ctx.targetId));
    }

    // Optional: apply paper-only force.
    // - paperOnly=true → always force_paper (operator intent is explicit)
    // - paperOnly=false → only relax to 'active' if user is NOT currently
    //   moderated. Suspended / disabled is a moderation decision and must
    //   never be silently cleared by a comp grant.
    if (paperOnly) {
      await upsertStatus({
        userId:  ctx.targetId,
        actorId: ctx.actorId,
        status:  "force_paper",
        reason:  `comp_${plan}_paper_only`,
      });
    } else {
      const currentStatus = await loadStatusRow(ctx.targetId);
      const cur = currentStatus?.status ?? "active";
      if (cur === "suspended" || cur === "disabled") {
        // Skip — moderation overrides comp. Operator must clear moderation explicitly.
        req.log.warn(
          { targetId: ctx.targetId, cur },
          "comp paperOnly=false skipped — user is moderated; status preserved",
        );
      } else {
        await upsertStatus({
          userId:  ctx.targetId,
          actorId: ctx.actorId,
          status:  "active",
          reason:  `comp_${plan}_live_enabled`,
        });
      }
    }

    // Optional: trade-limit override that expires with the comp.
    if (capTier !== undefined) {
      const now = new Date();
      await db.insert(userTradeLimitsTable).values({
        userId:            ctx.targetId,
        capTier,
        overrideExpiresAt: trialEndDate,
        createdAt:         now,
        updatedAt:         now,
      }).onConflictDoUpdate({
        target: userTradeLimitsTable.userId,
        set:    { capTier, overrideExpiresAt: trialEndDate, updatedAt: now },
      });
      invalidateTradeLimitCache(ctx.targetId);
    }

    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "create_complimentary_subscription",
      payload:  {
        note,
        plan,
        days,
        paperOnly,
        capTier:        capTier ?? null,
        trialEndsAt:    trialEndDate.toISOString(),
        complimentary:  true,
        before: {
          plan:                 target.plan,
          planStatus:           target.planStatus,
          stripeCustomerId:     target.stripeCustomerId,
          stripeSubscriptionId: target.stripeSubscriptionId,
          trialEndsAt:          target.trialEndsAt,
        },
        after: {
          plan,
          planStatus:           stripeStatus,
          stripeCustomerId:     stripeCustId,
          stripeSubscriptionId: stripeSubId,
          trialEnd:             trialEndDate.toISOString(),
          autoCancelAtTrialEnd: true,
          forcePaper:           paperOnly,
          capTier:              capTier ?? null,
        },
      },
    });
    __invalidateAdminUserTelemetryCache();

    req.log.info(
      { targetId: ctx.targetId, plan, days, paperOnly, capTier, subId: stripeSubId },
      "Complimentary membership created",
    );

    res.json({
      ok:                   true,
      plan,
      paperOnly,
      capTier:              capTier ?? null,
      stripeSubscriptionId: stripeSubId,
      stripeCustomerId:     stripeCustId,
      stripeStatus,
      trialEnd:             Math.floor(trialEndDate.getTime() / 1000),
    });
  } catch (err) {
    req.log.error({ err }, "admin create_complimentary_subscription failed");
    res.status(502).json({ error: `Comp membership creation failed: ${(err as Error).message}` });
  }
});

router.post("/admin/users/sync_from_clerk", ...requireOperator, async (req, res): Promise<void> => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;

  const PAGE = 100;
  const MAX_USERS = 5_000;
  let offset = 0;
  let created = 0;
  let updated = 0;
  let scanned = 0;
  const errors: Array<{ clerkUserId: string; error: string }> = [];

  try {
    while (scanned < MAX_USERS) {
      const list = await clerkClient.users.getUserList({ limit: PAGE, offset });
      const batch = list.data ?? [];
      if (batch.length === 0) break;

      for (const cu of batch) {
        scanned++;
        const clerkUserId = cu.id;
        const email =
          cu.primaryEmailAddress?.emailAddress ??
          cu.emailAddresses?.[0]?.emailAddress ??
          "";
        const shouldBeSuperAdmin = email ? isSuperAdminEmail(email) : false;

        try {
          const [existing] = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.clerkUserId, clerkUserId));

          if (existing) {
            const patch: Partial<typeof usersTable.$inferInsert> = {};
            if (email && existing.email !== email) patch.email = email;
            if (shouldBeSuperAdmin && existing.role !== "super-admin") patch.role = "super-admin";
            if (Object.keys(patch).length > 0) {
              await db
                .update(usersTable)
                .set({ ...patch, updatedAt: new Date() })
                .where(eq(usersTable.clerkUserId, clerkUserId));
              updated++;
            }
          } else {
            await db
              .insert(usersTable)
              .values({
                clerkUserId,
                email,
                role: shouldBeSuperAdmin ? "super-admin" : "user",
              })
              .onConflictDoNothing();
            await db
              .insert(userTradeLimitsTable)
              .values({ userId: clerkUserId, capTier: DEFAULT_TRADE_LIMIT_CAP })
              .onConflictDoNothing();
            created++;
          }
        } catch (err) {
          errors.push({ clerkUserId, error: (err as Error).message });
        }
      }

      offset += batch.length;
      if (batch.length < PAGE) break;
    }

    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.actorId,
      action:   "sync_from_clerk",
      payload:  { note: "Backfill from Clerk Backend API", scanned, created, updated, errorCount: errors.length },
    });
    __invalidateAdminUserTelemetryCache();

    req.log.info({ scanned, created, updated, errorCount: errors.length }, "Clerk user sync completed");
    res.json({ ok: true, scanned, created, updated, errors });
  } catch (err) {
    req.log.error({ err }, "Clerk user sync failed");
    res.status(502).json({ error: `Clerk sync failed: ${(err as Error).message}`, scanned, created, updated, errors });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BILLING ENFORCEMENT ENDPOINTS (Phase A + B backend surface)
// ─────────────────────────────────────────────────────────────────────────────
//
// Every endpoint here is role-gated and audit-logged. None of these can
// affect Kraken, the execution queue, the trading loop, open positions,
// or exchange balances. They mutate ONLY:
//   - user_credits (balance)
//   - credit_transactions (immutable ledger)
//   - performance_fees (settlement_status: pending → waived/settled)
//   - user_admin_status (billing_hold ↔ active)
//   - user_admin_actions (audit)
// ─────────────────────────────────────────────────────────────────────────────

const AddCreditsBodySchema = z.object({
  note:   NoteSchema,
  amount: z.number().positive().max(100_000),
  type:   z.enum(["topup", "adjustment", "refund"]).default("adjustment"),
});

const WaiveFeesBodySchema = z.object({
  note: NoteSchema,
});

const RestoreBillingBodySchema = z.object({
  note: NoteSchema,
});

// ── GET /api/admin/users/:id/billing ──────────────────────────────────────────
// Returns current billing health snapshot for a specific user.
router.get("/admin/users/:id/billing", ...requireOperator, async (req: Request, res: Response) => {
  const userId = String(req.params["id"] ?? "");
  if (!userId) return res.status(400).json({ error: "Missing user id" });

  try {
    const health = await checkBillingHealth(userId);

    const recentFees = await db
      .select({
        id:               performanceFeesTable.id,
        tradeId:          performanceFeesTable.tradeId,
        symbol:           performanceFeesTable.symbol,
        realizedPnl:      performanceFeesTable.realizedPnl,
        feeAmountUsd:     performanceFeesTable.feeAmountUsd,
        settlementStatus: performanceFeesTable.settlementStatus,
        isPaper:          performanceFeesTable.isPaper,
        createdAt:        performanceFeesTable.createdAt,
      })
      .from(performanceFeesTable)
      .where(eq(performanceFeesTable.userId, userId))
      .orderBy(desc(performanceFeesTable.createdAt))
      .limit(50);

    const recentCreditTx = await db
      .select()
      .from(creditTransactionsTable)
      .where(eq(creditTransactionsTable.userId, userId))
      .orderBy(desc(creditTransactionsTable.createdAt))
      .limit(50);

    return res.json({ health, recentFees, recentCreditTx });
  } catch (err) {
    req.log.error({ err, userId }, "GET admin billing failed");
    return res.status(500).json({ error: "Failed to load billing snapshot" });
  }
});

// ── GET /api/admin/billing/hold_queue ─────────────────────────────────────────
// Lists every user currently on billing_hold (queue for operator review).
router.get("/admin/billing/hold_queue", ...requireOperator, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        userId:    userAdminStatusTable.userId,
        email:     usersTable.email,
        plan:      usersTable.plan,
        status:    userAdminStatusTable.status,
        reason:    userAdminStatusTable.reason,
        since:     userAdminStatusTable.since,
        updatedAt: userAdminStatusTable.updatedAt,
      })
      .from(userAdminStatusTable)
      .leftJoin(usersTable, eq(usersTable.clerkUserId, userAdminStatusTable.userId))
      .where(eq(userAdminStatusTable.status, "billing_hold"))
      .orderBy(desc(userAdminStatusTable.since));

    // Enrich with outstanding + credit balance per row (best-effort, small queue)
    const enriched = await Promise.all(rows.map(async (r) => ({
      ...r,
      outstanding: await getOutstanding(r.userId).catch(() => 0),
      credits:     await getCreditBalance(r.userId).catch(() => 0),
    })));

    return res.json({ count: enriched.length, holds: enriched });
  } catch (err) {
    req.log.error({ err }, "GET billing hold queue failed");
    return res.status(500).json({ error: "Failed to load hold queue" });
  }
});

// ── POST /api/admin/users/:id/add_credits ─────────────────────────────────────
// Grant credits to a user (admin manual adjustment). Auto-clears billing_hold
// if it becomes healthy.
router.post("/admin/users/:id/add_credits", ...requireOperator, async (req: Request, res: Response) => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;

  const parsed = AddCreditsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
  }

  try {
    const result = await addCredits({
      userId:       ctx.targetId,
      amount:       parsed.data.amount,
      type:         parsed.data.type,
      actorAdminId: ctx.actorId,
      note:         parsed.data.note,
    });

    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "credits_added",
      payload:  {
        amount:     parsed.data.amount,
        type:       parsed.data.type,
        newBalance: result.newBalance,
        txId:       result.txId,
        note:       parsed.data.note,
      },
    });

    // Re-evaluate billing health: may auto-clear billing_hold.
    const enforcement = await evaluateAndEnforceBillingHold(ctx.targetId);

    return res.json({
      ok:            true,
      newBalance:    result.newBalance,
      txId:          result.txId,
      statusChanged: enforcement.mutated,
      newStatus:     enforcement.newStatus,
    });
  } catch (err) {
    req.log.error({ err, userId: ctx.targetId }, "add_credits failed");
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /api/admin/users/:id/waive_fees ──────────────────────────────────────
// Waive ALL pending performance fees for a user. Super-admin only.
router.post("/admin/users/:id/waive_fees", ...requireSuperAdmin, async (req: Request, res: Response) => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;

  const parsed = WaiveFeesBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
  }

  try {
    const result = await waiveAllPendingFees({
      userId:       ctx.targetId,
      actorAdminId: ctx.actorId,
      note:         parsed.data.note,
    });

    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "fees_waived",
      payload:  { ...result, note: parsed.data.note },
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    req.log.error({ err, userId: ctx.targetId }, "waive_fees failed");
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /api/admin/users/:id/restore_billing ─────────────────────────────────
// Force-clear billing_hold (e.g. promised payment, dispute resolution).
// Super-admin only. Does NOT waive fees.
router.post("/admin/users/:id/restore_billing", ...requireSuperAdmin, async (req: Request, res: Response) => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;

  const parsed = RestoreBillingBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
  }

  try {
    const result = await forceRestoreBilling({
      userId:       ctx.targetId,
      actorAdminId: ctx.actorId,
      note:         parsed.data.note,
    });

    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "billing_restored_manual",
      payload:  { ...result, note: parsed.data.note },
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    req.log.error({ err, userId: ctx.targetId }, "restore_billing failed");
    return res.status(500).json({ error: (err as Error).message });
  }
});

// drizzleSql exported only to silence the unused import warning when
// future endpoints add aggregations. Keep this import wired even if no
// inline usage today — billing analytics queries land in the next phase.
void drizzleSql;

export default router;
