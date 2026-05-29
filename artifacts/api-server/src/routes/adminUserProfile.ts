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
import { getUncachableStripeClient } from "../stripeClient.js";
import { resolvePriceIdForPlan } from "../lib/adminBillingActions.js";
import type Stripe from "stripe";

const router = Router();
const requireOperator   = [requireAuth, requireRole(["admin", "super-admin"])];
const requireSuperAdmin = [requireAuth, requireRole(["super-admin"])];

type AuthReq = Request & { clerkUserId: string };

const NoteSchema = z.string().trim().min(1, "Operator note is required").max(2_000);

/** Format a Zod error so the failing field path is in the message instead
 *  of being silently dropped (previously the client only saw the generic
 *  "expected string, received undefined" with no hint which field). */
function formatZodError(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "Invalid body";
  const path = issue.path.join(".") || "(root)";
  return `${path}: ${issue.message}`;
}

// ── AI engine settings (operator) ────────────────────────────────────────────

const AiSettingsBody = z.object({
  note:               NoteSchema,
  autoMode:           z.boolean().optional(),
  riskLevel:          z.enum(["conservative", "moderate", "aggressive", "high", "medium", "low"]).optional(),
  minConfidence:      z.number().min(0).max(100).optional(),
  positionSizeUSD:    z.number().min(1).max(1_000_000).optional(),
  maxActivePositions: z.number().int().min(0).max(100).optional(),
  // NOTE — daily trade cap is intentionally NOT here. The enforcement gate
  // `tradeLimitEngine.getTradeLimitVerdict` reads from
  // `user_trade_limits.cap_tier` (see `resolveCap` + `UNLIMITED_TRADE_LIMIT_CAP`),
  // not from `user_settings.max_trades_per_day` (vestigial). The operator
  // surface for cap edits is `POST /admin/users/:id/override_trade_limit`,
  // exposed in the ACTIONS tab → "Override Trade Limits" panel.
  tradingMode:        z.enum(["simulation", "live"]).optional(),
  preferredExchange:  z.string().trim().min(1).max(50).optional(),
  // Operator override of the customer's runtime exchange selection (the
  // column that CustomerTradingRuntimeContext hydrates from). `null` clears
  // the choice → aggregator falls back to the auto-promotion rule. Any
  // non-empty string is treated as an explicit exchange ID (or `"paper"` to
  // pin the customer into paper-only). See userSettings.ts column comment
  // for the full state machine.
  activeRuntimeExchange: z.union([z.string().trim().min(1).max(50), z.null()]).optional(),
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
    // Surface the failing field path so the operator can see exactly which
    // control was undefined (was previously a generic "expected string,
    // received undefined" with no field hint).
    res.status(400).json(serialize4xx(req, parsed.error, "ai-settings"));
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
    req.log.info({ targetId: ctx.targetId, patchKeys: Object.keys(patch), patch }, "PATCH ai-settings about to write");

    // All-or-nothing: the user_settings update + every audit row commit in
    // a single transaction so a mid-sequence audit failure cannot leave a
    // mutated settings row with a partial audit trail (architect review
    // flagged the sequential-await path as non-atomic). Drizzle's tx
    // rolls back the settings update if any audit insert throws.
    const txOut = await db.transaction(async (tx) => {
      // JIT-provision the user_settings row so admins can edit settings
      // for users who haven't booted the portal yet.
      const [existing] = await tx.select().from(userSettingsTable)
        .where(eq(userSettingsTable.userId, ctx.targetId)).limit(1);
      let before = existing;
      if (!before) {
        [before] = await tx.insert(userSettingsTable).values({ userId: ctx.targetId })
          .onConflictDoNothing().returning();
        if (!before) {
          [before] = await tx.select().from(userSettingsTable)
            .where(eq(userSettingsTable.userId, ctx.targetId)).limit(1);
        }
      }
      if (!before) {
        return { kind: "missing" as const };
      }

      const [after] = await tx.update(userSettingsTable)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(userSettingsTable.userId, ctx.targetId))
        .returning();

      const changedFields = diffChanged(
        before as unknown as Record<string, unknown>,
        after as unknown as Record<string, unknown>,
      ).filter(k => k !== "updatedAt");

      if (changedFields.length === 0) {
        return { kind: "noop" as const, after };
      }

      // Categorize the changed fields into the three operator-control
      // audit buckets called out in the runtime-risk-control spec. One
      // row per non-empty category so SIEM filters on action label
      // produce a clean per-bucket history (RISK / POSITION / RUNTIME).
      // Each row mirrors operatorId + targetUserId + per-field
      // previousValue/newValue inside the payload (matches the
      // manual_plan_override / stripe_resync pattern — row columns alone
      // are not enough for downstream consumers that only ingest
      // `payload`).
      const RISK_FIELDS     = new Set(["riskLevel", "minConfidence", "volumeFilter"]);
      const POSITION_FIELDS = new Set(["positionSizeUSD", "maxActivePositions"]);
      const RUNTIME_FIELDS  = new Set(["tradingMode", "preferredExchange", "autoMode", "activeRuntimeExchange"]);

      const buckets: Array<{ action: string; fields: string[] }> = [
        { action: "USER_RISK_OVERRIDE",     fields: changedFields.filter(k => RISK_FIELDS.has(k)) },
        { action: "USER_POSITION_OVERRIDE", fields: changedFields.filter(k => POSITION_FIELDS.has(k)) },
        { action: "USER_RUNTIME_OVERRIDE",  fields: changedFields.filter(k => RUNTIME_FIELDS.has(k)) },
      ];
      const beforeRec = before as Record<string, unknown>;
      const afterRec  = after  as unknown as Record<string, unknown>;
      for (const { action, fields } of buckets) {
        if (fields.length === 0) continue;
        await writeAudit({
          actorId:  ctx.actorId,
          targetId: ctx.targetId,
          action,
          payload: {
            note,
            operatorId:    ctx.actorId,
            targetUserId:  ctx.targetId,
            changedFields: fields,
            changes: Object.fromEntries(fields.map(k => [k, {
              previousValue: beforeRec[k] ?? null,
              newValue:      afterRec[k]  ?? null,
            }])),
          },
        }, tx);
      }
      // Backwards-compatible umbrella row so existing dashboards
      // filtering on `update_ai_settings` keep working (and any field
      // that doesn't fit a bucket — none today, but future schema
      // additions won't silently lose their audit trail). Legacy — to be
      // deprecated once consumers migrate to USER_*_OVERRIDE actions.
      await writeAudit({
        actorId:  ctx.actorId,
        targetId: ctx.targetId,
        action:   "update_ai_settings",
        payload:  {
          note,
          operatorId:   ctx.actorId,
          targetUserId: ctx.targetId,
          changedFields,
          before: Object.fromEntries(changedFields.map(k => [k, beforeRec[k]])),
          after:  Object.fromEntries(changedFields.map(k => [k, afterRec[k]])),
        },
      }, tx);

      // Canonical operator-override umbrella row. Single source of truth for
      // downstream SIEM filters / alerts that want "any operator override
      // applied" without enumerating bucket actions. Carries the full diff
      // (changes map = {field: {previousValue, newValue}}) so a single row
      // is self-sufficient for forensics. Lives alongside the legacy
      // `update_ai_settings` row above — both will fire for the same write
      // until the legacy consumers migrate.
      await writeAudit({
        actorId:  ctx.actorId,
        targetId: ctx.targetId,
        action:   "OPERATOR_OVERRIDE_UPDATED",
        payload:  {
          note,
          operatorId:    ctx.actorId,
          targetUserId:  ctx.targetId,
          changedFields,
          changes: Object.fromEntries(changedFields.map(k => [k, {
            previousValue: beforeRec[k] ?? null,
            newValue:      afterRec[k]  ?? null,
          }])),
        },
      }, tx);

      return { kind: "ok" as const, after, changedFields, beforeRec, afterRec };
    });

    if (txOut.kind === "missing") {
      res.status(404).json({ error: "User settings row could not be provisioned" });
      return;
    }
    if (txOut.kind === "noop") {
      req.log.info({
        tag:           "OPERATOR_OVERRIDE_UPDATED",
        outcome:       "noop",
        operatorId:    ctx.actorId,
        targetUserId:  ctx.targetId,
        changedFields: [],
      }, "[OPERATOR_OVERRIDE_UPDATED] no-op (patch matched current state)");
      res.json({ ok: true, after: txOut.after, changedFields: [] });
      return;
    }
    req.log.info({
      tag:           "OPERATOR_OVERRIDE_UPDATED",
      outcome:       "applied",
      operatorId:    ctx.actorId,
      targetUserId:  ctx.targetId,
      changedFields: txOut.changedFields,
      changes:       Object.fromEntries(txOut.changedFields.map(k => [k, {
        previousValue: txOut.beforeRec[k] ?? null,
        newValue:      txOut.afterRec[k]  ?? null,
      }])),
    }, "[OPERATOR_OVERRIDE_UPDATED] applied");
    res.json({ ok: true, after: txOut.after, changedFields: txOut.changedFields });
  } catch (err) {
    req.log.error({
      tag:          "OPERATOR_OVERRIDE_UPDATED",
      outcome:      "failed",
      operatorId:   ctx.actorId,
      targetUserId: ctx.targetId,
      patchKeys:    Object.keys(patch),
      err,
    }, "[OPERATOR_OVERRIDE_UPDATED] failed");
    res.status(500).json(serialize5xx(req, err, "ai-settings", { targetId: ctx.targetId, patch }));
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
    res.status(400).json(serialize4xx(req, parsed.error, "billing-overrides"));
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
    req.log.info({ targetId: ctx.targetId, patchKeys: Object.keys(patch), patch }, "PATCH billing-overrides about to write");
    const [before] = await db.select().from(usersTable)
      .where(eq(usersTable.clerkUserId, ctx.targetId)).limit(1);
    if (!before) {
      res.status(404).json({ error: "User not found", targetId: ctx.targetId });
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
    res.status(500).json(serialize5xx(req, err, "billing-overrides", { targetId: ctx.targetId, patch }));
  }
});

// ── Complimentary access (super-admin) ────────────────────────────────────
//
// Dedicated, isolated mutation for the complimentary-access toggle. This
// route exists separately from the generalized /billing-overrides route
// because the latter mixes 7+ optional fields, a shared note schema, and a
// generic diff/audit serializer — which made it hard to debug a single
// "complimentary on/off" change. This route only knows about three fields,
// updates three columns directly, and audits with a single action label.
//
// Columns written:
//   - users.is_complimentary_account = complimentary
//   - users.fee_waiver_active        = complimentary  (mirrors so fees stop)
//   - users.fee_waiver_until         = expiresAt      (null = indefinite)
//
// Audit action: `set_complimentary` / `unset_complimentary`.

const ComplimentaryBody = z.object({
  complimentary: z.boolean(),
  auditNote:     z.string().trim().min(1, "Audit note is required").max(2_000),
  expiresAt:     z.union([z.string().datetime(), z.null()]).optional(),
});

router.patch("/admin/users/:id/complimentary", ...requireSuperAdmin, async (req, res): Promise<void> => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;

  const parsed = ComplimentaryBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json(serialize4xx(req, parsed.error, "complimentary"));
    return;
  }
  const { complimentary, auditNote, expiresAt } = parsed.data;
  const feeWaiverUntil = !complimentary
    ? null
    : expiresAt === undefined ? undefined
    : expiresAt === null      ? null
    : new Date(expiresAt);

  try {
    req.log.info(
      { targetId: ctx.targetId, complimentary, expiresAt },
      "PATCH complimentary about to write",
    );
    const [before] = await db.select().from(usersTable)
      .where(eq(usersTable.clerkUserId, ctx.targetId)).limit(1);
    if (!before) {
      res.status(404).json({ error: "User not found", targetId: ctx.targetId });
      return;
    }

    const setPatch: Record<string, unknown> = {
      isComplimentaryAccount: complimentary,
      feeWaiverActive:        complimentary,
      updatedAt:              new Date(),
    };
    // Only write feeWaiverUntil when caller actually specified it (or when
    // turning complimentary OFF — then clear the waiver-until row too).
    if (feeWaiverUntil !== undefined) setPatch["feeWaiverUntil"] = feeWaiverUntil;

    const [after] = await db.update(usersTable)
      .set(setPatch)
      .where(eq(usersTable.clerkUserId, ctx.targetId))
      .returning();

    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   complimentary ? "set_complimentary" : "unset_complimentary",
      payload:  {
        note: auditNote,
        before: {
          isComplimentaryAccount: before.isComplimentaryAccount,
          feeWaiverActive:        before.feeWaiverActive,
          feeWaiverUntil:         before.feeWaiverUntil,
        },
        after: {
          isComplimentaryAccount: after.isComplimentaryAccount,
          feeWaiverActive:        after.feeWaiverActive,
          feeWaiverUntil:         after.feeWaiverUntil,
        },
        expiresAt: expiresAt ?? null,
      },
    });

    res.json({
      ok: true,
      user: {
        clerkUserId:            after.clerkUserId,
        isComplimentaryAccount: after.isComplimentaryAccount,
        feeWaiverActive:        after.feeWaiverActive,
        feeWaiverUntil:         after.feeWaiverUntil,
      },
    });
  } catch (err) {
    res.status(500).json(serialize5xx(req, err, "complimentary", {
      targetId: ctx.targetId, complimentary, expiresAt,
    }));
  }
});

/** Build a verbose 4xx body for Zod validation failures so the operator
 *  sees the EXACT field that was undefined/wrong-type instead of a
 *  generic "expected string, received undefined" with no field hint.
 *  Returns: error (formatted summary), issues (path+code+message+received),
 *  fields (set of failing field paths), incomingBody (raw req.body),
 *  fieldTypes (key → typeof for every top-level key the server saw). */
function serialize4xx(
  req: Request,
  err: z.ZodError,
  label: string,
): Record<string, unknown> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fieldTypes: Record<string, string> = {};
  for (const k of Object.keys(body)) {
    const v = body[k];
    fieldTypes[k] = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
  }
  const issues = err.issues.map(i => ({
    path:     i.path.join(".") || "(root)",
    code:     i.code,
    message:  i.message,
    received: (i as unknown as { received?: unknown }).received,
    expected: (i as unknown as { expected?: unknown }).expected,
  }));
  const failingFields = Array.from(new Set(issues.map(i => i.path)));
  const responseBody = {
    error:        formatZodError(err),
    failingFields,
    issues,
    incomingBody: body,
    fieldTypes,
    requestId:    (req as Request & { id?: string }).id ?? undefined,
  };
  req.log.warn({ ...responseBody }, `PATCH ${label} validation failed`);
  return responseBody;
}

/** Build a verbose 5xx body so the operator sees the real exception in
 *  the Network tab instead of a generic "Failed to update ...". Captures
 *  pg/Drizzle structured error fields (`code`, `detail`, `constraint`,
 *  `column`, `table`, `schema`) when present, plus the request id so we
 *  can correlate with `req.log.error`. Stack trace is included always —
 *  these endpoints are super-admin/operator gated, so leaking stack to
 *  the caller is acceptable and necessary for live ops debugging. */
function serialize5xx(
  req: Request,
  err: unknown,
  label: string,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const e = err as {
    name?: string; message?: string; stack?: string;
    code?: string; detail?: string; constraint?: string;
    column?: string; table?: string; schema?: string;
    cause?: unknown;
  };
  const causeMessage =
    e?.cause && typeof e.cause === "object" && "message" in (e.cause as object)
      ? String((e.cause as { message?: unknown }).message ?? "")
      : undefined;
  const body = {
    error:      `${label} write failed: ${e?.message ?? "unknown error"}`,
    errorName:  e?.name,
    pgCode:     e?.code,
    pgDetail:   e?.detail,
    pgConstraint: e?.constraint,
    pgColumn:   e?.column,
    pgTable:    e?.table,
    pgSchema:   e?.schema,
    causeMessage,
    stack:      e?.stack,
    requestId:  (req as Request & { id?: string }).id ?? undefined,
    context,
  };
  req.log.error({ err, ...body }, `PATCH ${label} failed`);
  return body;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual plan override (super-admin) — operator entitlement recovery layer
// ─────────────────────────────────────────────────────────────────────────────
//
// Purpose: when a Stripe checkout succeeds but our local entitlement
// provisioning fails (webhook missed / sub sync silently skipped / Clerk
// email mismatch on customer lookup), the customer is left as PLAN=FREE
// even though Stripe is billing them. The customer cannot connect an
// exchange because every gate reads from `users.plan`. This route is the
// recovery hatch: super-admins flip the local plan to match what Stripe
// already believes, without re-billing the customer.
//
// Mutates ONLY the local `users` row (plan, planStatus, optional
// trialEndsAt). Does NOT touch Stripe — that's `/stripe-resync` below.
// Audit row uses action="manual_plan_override" with previousPlan/newPlan
// in payload so the recovery is fully traceable.

const PLAN_ENUM = z.enum(["free", "starter", "pro", "elite"]);
const PLAN_STATUS_ENUM = z.enum([
  "none", "active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired",
]);

const PlanOverrideBody = z.object({
  note:        NoteSchema,
  plan:        PLAN_ENUM,
  planStatus:  PLAN_STATUS_ENUM.optional(),
  trialEndsAt: z.union([z.string().datetime(), z.null()]).optional(),
});

router.post("/admin/users/:id/plan-override", ...requireSuperAdmin, async (req, res): Promise<void> => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;
  const parsed = PlanOverrideBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json(serialize4xx(req, parsed.error, "plan-override"));
    return;
  }
  const { note, plan, planStatus, trialEndsAt } = parsed.data;

  try {
    const [before] = await db.select().from(usersTable)
      .where(eq(usersTable.clerkUserId, ctx.targetId)).limit(1);
    if (!before) {
      res.status(404).json({ error: "User not found", targetId: ctx.targetId });
      return;
    }

    // Default planStatus by tier when caller omits — keeps the gate
    // helpers in billing.ts honest (`isActive` requires status to be
    // active/trialing for paid tiers, or free).
    const resolvedStatus: string = planStatus
      ?? (plan === "free" ? "none" : "active");

    const patch: Record<string, unknown> = {
      plan,
      planStatus: resolvedStatus,
      updatedAt:  new Date(),
    };
    if (trialEndsAt !== undefined) {
      patch["trialEndsAt"] = trialEndsAt === null ? null : new Date(trialEndsAt);
    }

    const [after] = await db.update(usersTable)
      .set(patch)
      .where(eq(usersTable.clerkUserId, ctx.targetId))
      .returning();

    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "manual_plan_override",
      payload:  {
        // Mirror the row columns into the payload as well so audit
        // consumers reading payload-only (exports, downstream tools)
        // still see operator + target context.
        operatorId:         ctx.actorId,
        targetUserId:       ctx.targetId,
        note,
        previousPlan:       before.plan,
        previousPlanStatus: before.planStatus,
        newPlan:            after.plan,
        newPlanStatus:      after.planStatus,
        trialEndsAt:        trialEndsAt ?? null,
        // Capture for forensics — if a manual override was needed because
        // the webhook never ran, the Stripe IDs help reconcile later.
        stripeCustomerId:     after.stripeCustomerId ?? null,
        stripeSubscriptionId: after.stripeSubscriptionId ?? null,
      },
    });

    res.json({
      ok: true,
      user: {
        clerkUserId:          after.clerkUserId,
        plan:                 after.plan,
        planStatus:           after.planStatus,
        trialEndsAt:          after.trialEndsAt,
        stripeCustomerId:     after.stripeCustomerId,
        stripeSubscriptionId: after.stripeSubscriptionId,
      },
      previousPlan:       before.plan,
      previousPlanStatus: before.planStatus,
    });
  } catch (err) {
    res.status(500).json(serialize5xx(req, err, "plan-override", {
      targetId: ctx.targetId, plan, planStatus,
    }));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Stripe resync (super-admin) — entitlement recovery from Stripe SoT
// ─────────────────────────────────────────────────────────────────────────────
//
// Reconciles the local `users` row against Stripe's view of the customer.
// Resolution order for the customer:
//   1. `users.stripeCustomerId` if set
//   2. Lookup by `users.billingEmail` then `users.email` via
//      `stripe.customers.list({email})` — handles the case where checkout
//      created a fresh customer that we never linked back.
//
// Once the customer is resolved we pick the most-recent non-terminal
// subscription (active > trialing > past_due > anything-not-canceled),
// derive the plan from the price ID using the same env mapping the
// checkout route uses (`resolvePriceIdForPlan`), and write back to the
// local users row. Audit action = "stripe_resync" with a snapshot of the
// before/after entitlement + the Stripe IDs that were discovered.

const StripeResyncBody = z.object({
  note: NoteSchema,
});

interface ResolvedStripeState {
  customerId:     string;
  subscriptionId: string | null;
  plan:           "free" | "starter" | "pro" | "elite";
  planStatus:     string;
  trialEndsAt:    Date | null;
  subscription:   Stripe.Subscription | null;
}

/** Parse a comma-separated env list of legacy Stripe price IDs (old prices we
 *  no longer sell but must keep mapping for already-subscribed users). */
function legacyPriceIds(envKey: string): string[] {
  return (process.env[envKey] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("price_"));
}

/** Reverse `resolvePriceIdForPlan` using the same env vars. Falls back to
 *  null when the price ID doesn't match any configured tier — caller must
 *  decide whether to keep the existing local plan or downgrade.
 *
 *  Grandfathering: legacy Starter/Pro price IDs (the OLD $39.99 / $79.99
 *  prices, e.g. price_1TZPqFIzLCdrkUtzWyDLLMmA /
 *  price_1TZPqGIzLCdrkUtzMVJLcxb1) are mapped to their tiers via the
 *  `STRIPE_PRICE_STARTER_LEGACY` / `STRIPE_PRICE_PRO_LEGACY` env lists so
 *  existing subscribers keep their entitlement without touching the old
 *  Stripe prices. Legacy IDs are documented here for rollback only. */
function planFromPriceId(
  priceId: string | null | undefined,
): "starter" | "pro" | "elite" | null {
  if (!priceId) return null;
  if (priceId === resolvePriceIdForPlan("starter")) return "starter";
  if (priceId === resolvePriceIdForPlan("pro"))     return "pro";
  if (priceId === resolvePriceIdForPlan("elite"))   return "elite";
  if (legacyPriceIds("STRIPE_PRICE_STARTER_LEGACY").includes(priceId)) return "starter";
  if (legacyPriceIds("STRIPE_PRICE_PRO_LEGACY").includes(priceId))     return "pro";
  return null;
}

/** Subscriptions Stripe considers "alive enough to bill". */
const LIVE_SUB_STATUSES = new Set<string>([
  "active", "trialing", "past_due", "unpaid", "incomplete",
]);

router.post("/admin/users/:id/stripe-resync", ...requireSuperAdmin, async (req, res): Promise<void> => {
  const ctx = resolveActor(req, res);
  if (!ctx) return;
  const parsed = StripeResyncBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json(serialize4xx(req, parsed.error, "stripe-resync"));
    return;
  }
  const { note } = parsed.data;

  try {
    const [before] = await db.select().from(usersTable)
      .where(eq(usersTable.clerkUserId, ctx.targetId)).limit(1);
    if (!before) {
      res.status(404).json({ error: "User not found", targetId: ctx.targetId });
      return;
    }

    const stripe = await getUncachableStripeClient();

    // 1) Resolve customer — local link first, then email lookup.
    let customerId: string | null = before.stripeCustomerId ?? null;
    const lookupEmails: string[] = [];
    if (before.billingEmail) lookupEmails.push(before.billingEmail);
    if (before.email && before.email !== before.billingEmail) lookupEmails.push(before.email);

    if (!customerId) {
      for (const email of lookupEmails) {
        const list = await stripe.customers.list({ email, limit: 10 });
        if (list.data.length > 0) {
          // Prefer the customer whose metadata.clerkUserId already matches
          // (defensive: if the checkout path tagged the customer with our
          // clerk id, that's the canonical record). Otherwise take the
          // most recent.
          const tagged = list.data.find(c => (c.metadata ?? {})["clerkUserId"] === ctx.targetId);
          customerId = (tagged ?? list.data[0])?.id ?? null;
          if (customerId) break;
        }
      }
    }

    if (!customerId) {
      res.status(404).json({
        error:    "No Stripe customer found for this user (checked local link + billing/auth email lookup).",
        searched: { stripeCustomerId: before.stripeCustomerId, emails: lookupEmails },
      });
      return;
    }

    // 2) Find the best subscription for this customer.
    const subsList = await stripe.subscriptions.list({
      customer: customerId,
      status:   "all",
      limit:    20,
    });
    const liveSubs = subsList.data.filter(s => LIVE_SUB_STATUSES.has(s.status));
    const statusRank: Record<string, number> = {
      active: 0, trialing: 1, past_due: 2, unpaid: 3, incomplete: 4,
    };
    liveSubs.sort((a, b) => {
      const ra = statusRank[a.status] ?? 99;
      const rb = statusRank[b.status] ?? 99;
      if (ra !== rb) return ra - rb;
      return (b.created ?? 0) - (a.created ?? 0);
    });
    const bestSub: Stripe.Subscription | null = liveSubs[0] ?? null;

    // 3) Derive plan + planStatus + trialEndsAt from the best sub.
    const resolved: ResolvedStripeState = {
      customerId,
      subscriptionId: bestSub?.id ?? null,
      plan:           "free",
      planStatus:     "none",
      trialEndsAt:    null,
      subscription:   bestSub,
    };
    if (bestSub) {
      const firstItem = bestSub.items.data[0];
      const priceId   = firstItem?.price?.id ?? null;
      const tierPlan  = planFromPriceId(priceId);
      if (!tierPlan) {
        // Refuse to silently downgrade a paying customer when the price
        // ID doesn't map to our configured STARTER/PRO env vars (legacy
        // price, alt-currency price, or env misconfig). Bail with an
        // explicit reconciliation error so the operator can either fix
        // STRIPE_PRICE_* env or use MANUAL PLAN OVERRIDE.
        res.status(409).json({
          error: "Stripe subscription price ID does not match STRIPE_PRICE_STARTER_MONTHLY or STRIPE_PRICE_PRO_MONTHLY — refusing to auto-derive plan. Use manual plan override.",
          stripe: {
            subscriptionId: bestSub.id,
            status:         bestSub.status,
            priceId,
          },
          currentLocalPlan: before.plan,
        });
        return;
      }
      resolved.plan        = tierPlan;
      resolved.planStatus  = bestSub.status;
      resolved.trialEndsAt = bestSub.trial_end ? new Date(bestSub.trial_end * 1000) : null;
    }

    // 4) Write back — preserve fields we didn't resolve.
    const [after] = await db.update(usersTable)
      .set({
        stripeCustomerId:     resolved.customerId,
        stripeSubscriptionId: resolved.subscriptionId,
        plan:                 resolved.plan,
        planStatus:           resolved.planStatus,
        trialEndsAt:          resolved.trialEndsAt,
        updatedAt:            new Date(),
      })
      .where(eq(usersTable.clerkUserId, ctx.targetId))
      .returning();

    await writeAudit({
      actorId:  ctx.actorId,
      targetId: ctx.targetId,
      action:   "stripe_resync",
      payload:  {
        operatorId:         ctx.actorId,
        targetUserId:       ctx.targetId,
        note,
        previousPlan:       before.plan,
        previousPlanStatus: before.planStatus,
        newPlan:            after.plan,
        newPlanStatus:      after.planStatus,
        before: {
          stripeCustomerId:     before.stripeCustomerId,
          stripeSubscriptionId: before.stripeSubscriptionId,
          plan:                 before.plan,
          planStatus:           before.planStatus,
          trialEndsAt:          before.trialEndsAt,
        },
        after: {
          stripeCustomerId:     after.stripeCustomerId,
          stripeSubscriptionId: after.stripeSubscriptionId,
          plan:                 after.plan,
          planStatus:           after.planStatus,
          trialEndsAt:          after.trialEndsAt,
        },
        stripe: bestSub
          ? {
              subscriptionId: bestSub.id,
              status:         bestSub.status,
              priceId:        bestSub.items.data[0]?.price?.id ?? null,
              created:        bestSub.created,
              candidateCount: liveSubs.length,
            }
          : { subscriptionId: null, candidateCount: 0, reason: "no live subscription on customer" },
        customerSearch: {
          localLink: before.stripeCustomerId,
          emails:    lookupEmails,
          resolved:  customerId,
        },
      },
    });

    res.json({
      ok: true,
      user: {
        clerkUserId:          after.clerkUserId,
        plan:                 after.plan,
        planStatus:           after.planStatus,
        trialEndsAt:          after.trialEndsAt,
        stripeCustomerId:     after.stripeCustomerId,
        stripeSubscriptionId: after.stripeSubscriptionId,
      },
      previousPlan:       before.plan,
      previousPlanStatus: before.planStatus,
      stripe: bestSub
        ? {
            subscriptionId: bestSub.id,
            status:         bestSub.status,
            priceId:        bestSub.items.data[0]?.price?.id ?? null,
          }
        : null,
      candidateCount: liveSubs.length,
    });
  } catch (err) {
    res.status(500).json(serialize5xx(req, err, "stripe-resync", { targetId: ctx.targetId }));
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
