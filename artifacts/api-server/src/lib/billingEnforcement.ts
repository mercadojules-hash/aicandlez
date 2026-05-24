// ─────────────────────────────────────────────────────────────────────────────
// Billing enforcement layer (Phase A + B)
// ─────────────────────────────────────────────────────────────────────────────
//
// Single source of truth for the SaaS-billing → execution-permission flow.
//
// Hard invariants (locked):
//   - NEVER liquidates positions
//   - NEVER cancels open orders
//   - NEVER touches exchange balances
//   - NEVER auto-withdraws profits
//   - NEVER blocks paper, dashboard, history, or open positions
//   - Only prevents NEW live AI executions when billing is unhealthy
//
// Flow:
//   1. Trade closes with positive realized PnL → feeLedger inserts a row in
//      `performance_fees` with settlementStatus="pending".
//   2. feeLedger calls `applyFeeAgainstCredits(userId, feeAmount, feeId)`:
//        a. If credits >= feeAmount → deduct from credits, mark fee
//           settlement_status="settled", write credit_transactions row.
//           Done. No debt accrues. No billing_hold trigger.
//        b. Else → leave fee as "pending" (outstanding accrues), call
//           `evaluateAndEnforceBillingHold(userId)`.
//   3. evaluateAndEnforceBillingHold:
//        outstanding = SUM(pending fees) - credit balance (floor 0)
//        threshold   = getThresholdForPlan(user.plan)
//        if (credits <= 0 AND outstanding >= threshold) → set billing_hold
//        else → no change
//   4. On payment received (Stripe webhook, Phase C/D) →
//      `clearBillingHoldIfHealthy(userId)` restores status to "active".
// ─────────────────────────────────────────────────────────────────────────────

import {
  db,
  performanceFeesTable,
  userCreditsTable,
  creditTransactionsTable,
  userAdminStatusTable,
  usersTable,
  userAdminActionsTable,
  type CreditTxType,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { logger } from "./logger.js";

// ── Thresholds per plan ──────────────────────────────────────────────────────
// FREE users cannot place live orders anyway, so the threshold is N/A.
// STARTER / PRO thresholds taken from product spec.
const PLAN_THRESHOLDS: Record<string, number | null> = {
  free:    null,    // no live access → enforcement N/A
  starter: 30,
  pro:     100,
};

export function getThresholdForPlan(plan: string | null | undefined): number | null {
  const key = (plan ?? "free").toLowerCase();
  return PLAN_THRESHOLDS[key] ?? null;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface BillingHealth {
  userId:        string;
  plan:          string;
  threshold:     number | null;
  outstanding:   number;   // sum of pending fees (raw)
  credits:       number;   // current credit balance
  netOwed:       number;   // max(0, outstanding - credits)
  shouldHold:    boolean;  // true if billing_hold should be active
  currentStatus: string;
  reason:        string;
}

export async function getOutstanding(userId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${performanceFeesTable.feeAmountUsd}), 0)::float`,
    })
    .from(performanceFeesTable)
    .where(and(
      eq(performanceFeesTable.userId, userId),
      eq(performanceFeesTable.settlementStatus, "pending"),
      eq(performanceFeesTable.isPaper, false),
    ));
  return Number(row?.total ?? 0);
}

export async function getCreditBalance(userId: string): Promise<number> {
  const [row] = await db
    .select({ balance: userCreditsTable.balanceUsd })
    .from(userCreditsTable)
    .where(eq(userCreditsTable.userId, userId))
    .limit(1);
  return Number(row?.balance ?? 0);
}

export async function checkBillingHealth(userId: string): Promise<BillingHealth> {
  const [user] = await db
    .select({ plan: usersTable.plan })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId))
    .limit(1);
  const plan = (user?.plan ?? "free").toLowerCase();

  const [statusRow] = await db
    .select({ status: userAdminStatusTable.status })
    .from(userAdminStatusTable)
    .where(eq(userAdminStatusTable.userId, userId))
    .limit(1);

  const outstanding = await getOutstanding(userId);
  const credits     = await getCreditBalance(userId);
  const threshold   = getThresholdForPlan(plan);
  const netOwed     = Math.max(0, outstanding - credits);

  // shouldHold is ONLY true when:
  //   1. plan has a threshold (FREE excluded — no live access anyway)
  //   2. credits are exhausted
  //   3. net debt meets/exceeds the plan's threshold
  const shouldHold = threshold !== null && credits <= 0 && netOwed >= threshold;

  return {
    userId,
    plan,
    threshold,
    outstanding,
    credits,
    netOwed,
    shouldHold,
    currentStatus: statusRow?.status ?? "active",
    reason:        shouldHold
      ? `fee_threshold_exceeded (owed=${netOwed.toFixed(2)} >= threshold=${threshold})`
      : "ok",
  };
}

// ── Credit operations ────────────────────────────────────────────────────────

function newTxId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/**
 * Apply a fee against the user's credit balance.
 *
 * Accounting rule (LOCKED — see audit finding #1):
 *   Credits are deducted ONLY when they can FULLY cover the fee.
 *   If the balance is insufficient, the fee remains entirely pending and
 *   no credits are touched. This guarantees `checkBillingHealth` cannot
 *   double-count (deducted credits + full pending fee).
 *
 *   Partial coverage requires extending the schema (e.g. a
 *   `remaining_owed_usd` column or a "partially_settled" status) so that
 *   `outstanding` can be reduced to match the actual unpaid remainder.
 *   That is intentionally out of scope for Phase A+B. Until then, credits
 *   simply accumulate against the next fully-coverable fee.
 *
 * Uses Drizzle transaction so balance + ledger + fee status stay consistent.
 */
export async function applyFeeAgainstCredits(args: {
  userId:    string;
  feeAmount: number;
  feeId:     string;
}): Promise<{ covered: boolean; deducted: number; newBalance: number }> {
  if (args.feeAmount <= 0) {
    return { covered: true, deducted: 0, newBalance: await getCreditBalance(args.userId) };
  }

  return await db.transaction(async (tx) => {
    const [creditRow] = await tx
      .select({ balance: userCreditsTable.balanceUsd })
      .from(userCreditsTable)
      .where(eq(userCreditsTable.userId, args.userId))
      .for("update")
      .limit(1);
    const currentBalance = Number(creditRow?.balance ?? 0);

    // ALL-OR-NOTHING: only deduct when fully coverable.
    if (currentBalance < args.feeAmount) {
      return { covered: false, deducted: 0, newBalance: currentBalance };
    }

    const newBalance = parseFloat((currentBalance - args.feeAmount).toFixed(6));

    await tx
      .update(userCreditsTable)
      .set({ balanceUsd: newBalance, updatedAt: new Date() })
      .where(eq(userCreditsTable.userId, args.userId));

    await tx.insert(creditTransactionsTable).values({
      id:           newTxId("CTX"),
      userId:       args.userId,
      amountUsd:    -args.feeAmount,
      type:         "fee_deduction" satisfies CreditTxType,
      relatedFeeId: args.feeId,
      note:         `Fee deduction for ${args.feeId}`,
      balanceAfter: newBalance,
    });

    await tx
      .update(performanceFeesTable)
      .set({ settlementStatus: "settled", settledAt: new Date() })
      .where(eq(performanceFeesTable.id, args.feeId));

    return { covered: true, deducted: args.feeAmount, newBalance };
  });
}

/**
 * Add credits to a user (Stripe top-up, admin grant, refund).
 * Records ledger row + updates running balance atomically.
 *
 * Race-safety (see audit finding #2):
 *   Uses a single atomic UPSERT that computes the new balance from
 *   `existing_balance + EXCLUDED.amount` server-side and RETURNs the
 *   result. This is correct even when:
 *     - the row doesn't exist yet (initial INSERT branch — no prior lock
 *       needed because the unique constraint serializes concurrent
 *       inserts and conflict resolution applies the addition)
 *     - multiple concurrent calls land on the same userId (Postgres
 *       serializes the conflict resolution; both increments are
 *       preserved because the SET clause adds, not overwrites).
 *   The ledger row is then inserted in the same transaction using the
 *   RETURNed balance so balance_after is exact.
 */
export async function addCredits(args: {
  userId:                 string;
  amount:                 number;       // positive USD
  type:                   CreditTxType; // "topup" | "refund" | "adjustment"
  stripePaymentIntentId?: string | null;
  actorAdminId?:          string | null;
  note?:                  string | null;
}): Promise<{ newBalance: number; txId: string }> {
  if (args.amount <= 0) throw new Error("addCredits: amount must be positive");

  return await db.transaction(async (tx) => {
    // Atomic add via SQL UPSERT.  On conflict, balance = existing + EXCLUDED.
    // Returns the RESULTING balance so two concurrent calls cannot lose an
    // increment.
    const upserted = await tx
      .insert(userCreditsTable)
      .values({
        userId:     args.userId,
        balanceUsd: args.amount,
        updatedAt:  new Date(),
      })
      .onConflictDoUpdate({
        target: userCreditsTable.userId,
        set: {
          balanceUsd: sql`${userCreditsTable.balanceUsd} + EXCLUDED.balance_usd`,
          updatedAt:  new Date(),
        },
      })
      .returning({ balance: userCreditsTable.balanceUsd });

    const newBalance = parseFloat(Number(upserted[0]?.balance ?? args.amount).toFixed(6));

    const txId = newTxId(args.type === "topup" ? "TOP" : args.type === "refund" ? "REF" : "ADJ");
    await tx.insert(creditTransactionsTable).values({
      id:                    txId,
      userId:                args.userId,
      amountUsd:             args.amount,
      type:                  args.type,
      stripePaymentIntentId: args.stripePaymentIntentId ?? null,
      actorAdminId:          args.actorAdminId ?? null,
      note:                  args.note ?? null,
      balanceAfter:          newBalance,
    });

    return { newBalance, txId };
  });
}

// ── Enforcement: set / clear billing_hold ────────────────────────────────────

async function writeBillingAudit(args: {
  actorId: string;
  userId:  string;
  action:  string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(userAdminActionsTable).values({
      id:           randomUUID(),
      actorAdminId: args.actorId,
      targetUserId: args.userId,
      action:       args.action,
      payload:      args.payload,
    });
  } catch (err) {
    logger.warn({ err, action: args.action }, "billing audit write failed");
  }
}

/**
 * Evaluate billing health for a user; if shouldHold becomes true and they
 * are not already on billing_hold (or a moderation status), set them.
 * If health is OK and they ARE on billing_hold, clear them.
 *
 * Moderation precedence: suspended/disabled NEVER overridden by billing
 * (operator moderation > automatic billing).
 *
 * Returns the final BillingHealth + whether status was mutated.
 */
export async function evaluateAndEnforceBillingHold(userId: string): Promise<{
  health:  BillingHealth;
  mutated: boolean;
  newStatus: string;
}> {
  const health = await checkBillingHealth(userId);
  const cur    = health.currentStatus;

  // Operator-set moderation takes precedence — never auto-touch.
  if (cur === "suspended" || cur === "disabled") {
    return { health, mutated: false, newStatus: cur };
  }

  // ENTER billing_hold
  if (health.shouldHold && cur !== "billing_hold") {
    // Do not override an operator-set force_paper either; just log.
    if (cur === "force_paper") {
      logger.info(
        { userId, health },
        "billing: would set billing_hold but user is force_paper (operator); skipping status change",
      );
      return { health, mutated: false, newStatus: cur };
    }
    await db.insert(userAdminStatusTable).values({
      userId,
      status:       "billing_hold",
      setByAdminId: "system_billing",
      reason:       health.reason,
      since:        new Date(),
      updatedAt:    new Date(),
    }).onConflictDoUpdate({
      target: userAdminStatusTable.userId,
      set: {
        status:       "billing_hold",
        setByAdminId: "system_billing",
        reason:       health.reason,
        updatedAt:    new Date(),
      },
    });
    await writeBillingAudit({
      actorId: "system_billing",
      userId,
      action:  "billing_hold_engaged",
      payload: {
        outstanding: health.outstanding,
        credits:     health.credits,
        netOwed:     health.netOwed,
        threshold:   health.threshold,
        plan:        health.plan,
      },
    });
    logger.warn({ ...health }, "billing_hold ENGAGED");
    return { health, mutated: true, newStatus: "billing_hold" };
  }

  // EXIT billing_hold (auto-restoration)
  if (!health.shouldHold && cur === "billing_hold") {
    await db.update(userAdminStatusTable)
      .set({
        status:       "active",
        setByAdminId: "system_billing",
        reason:       "billing_cleared",
        updatedAt:    new Date(),
      })
      .where(eq(userAdminStatusTable.userId, userId));
    await writeBillingAudit({
      actorId: "system_billing",
      userId,
      action:  "billing_hold_cleared",
      payload: {
        outstanding: health.outstanding,
        credits:     health.credits,
        netOwed:     health.netOwed,
        threshold:   health.threshold,
      },
    });
    logger.info({ ...health }, "billing_hold CLEARED → active");
    return { health, mutated: true, newStatus: "active" };
  }

  return { health, mutated: false, newStatus: cur };
}

/**
 * Convenience wrapper called from billing payment webhooks (Phase C/D) and
 * from manual admin credit grants. Idempotent.
 */
export async function clearBillingHoldIfHealthy(userId: string): Promise<boolean> {
  const r = await evaluateAndEnforceBillingHold(userId);
  return r.mutated && r.newStatus === "active";
}

// ── Settlement helpers (used by admin "waive" / "mark paid" actions) ────────

export async function waiveFee(args: {
  feeId:        string;
  actorAdminId: string;
  note?:        string | null;
}): Promise<{ userId: string; feeAmount: number } | null> {
  const [fee] = await db
    .select({ userId: performanceFeesTable.userId, feeAmount: performanceFeesTable.feeAmountUsd })
    .from(performanceFeesTable)
    .where(eq(performanceFeesTable.id, args.feeId))
    .limit(1);
  if (!fee) return null;

  await db.update(performanceFeesTable)
    .set({ settlementStatus: "waived", settledAt: new Date() })
    .where(eq(performanceFeesTable.id, args.feeId));

  await writeBillingAudit({
    actorId: args.actorAdminId,
    userId:  fee.userId,
    action:  "fee_waived",
    payload: { feeId: args.feeId, feeAmount: fee.feeAmount, note: args.note ?? null },
  });

  // After waiving, re-evaluate billing health — may auto-clear billing_hold.
  await evaluateAndEnforceBillingHold(fee.userId);

  return { userId: fee.userId, feeAmount: fee.feeAmount };
}

// ── Bulk operation: waive ALL pending fees for a user ───────────────────────

export async function waiveAllPendingFees(args: {
  userId:       string;
  actorAdminId: string;
  note?:        string | null;
}): Promise<{ waivedCount: number; totalWaived: number }> {
  const pending = await db
    .select({ id: performanceFeesTable.id, amount: performanceFeesTable.feeAmountUsd })
    .from(performanceFeesTable)
    .where(and(
      eq(performanceFeesTable.userId, args.userId),
      eq(performanceFeesTable.settlementStatus, "pending"),
      eq(performanceFeesTable.isPaper, false),
    ));

  if (pending.length === 0) return { waivedCount: 0, totalWaived: 0 };

  await db.update(performanceFeesTable)
    .set({ settlementStatus: "waived", settledAt: new Date() })
    .where(and(
      eq(performanceFeesTable.userId, args.userId),
      eq(performanceFeesTable.settlementStatus, "pending"),
      eq(performanceFeesTable.isPaper, false),
    ));

  const totalWaived = pending.reduce((sum, f) => sum + Number(f.amount), 0);

  await writeBillingAudit({
    actorId: args.actorAdminId,
    userId:  args.userId,
    action:  "fees_waived_bulk",
    payload: {
      waivedCount: pending.length,
      totalWaived,
      feeIds:      pending.map((f) => f.id),
      note:        args.note ?? null,
    },
  });

  await evaluateAndEnforceBillingHold(args.userId);
  return { waivedCount: pending.length, totalWaived };
}

/**
 * Super-admin manual override: force-clear a billing_hold even if fees
 * remain outstanding. Used for emergency restoration (e.g. promised payment,
 * dispute resolution). Status flips to active; fees themselves are NOT
 * waived (use waiveAllPendingFees separately if desired).
 */
export async function forceRestoreBilling(args: {
  userId:       string;
  actorAdminId: string;
  note:         string;
}): Promise<{ previousStatus: string }> {
  const [cur] = await db
    .select({ status: userAdminStatusTable.status })
    .from(userAdminStatusTable)
    .where(eq(userAdminStatusTable.userId, args.userId))
    .limit(1);
  const previousStatus = cur?.status ?? "active";

  if (previousStatus !== "billing_hold") {
    return { previousStatus };
  }

  await db.update(userAdminStatusTable)
    .set({
      status:       "active",
      setByAdminId: args.actorAdminId,
      reason:       `manual_override: ${args.note}`,
      updatedAt:    new Date(),
    })
    .where(eq(userAdminStatusTable.userId, args.userId));

  await writeBillingAudit({
    actorId: args.actorAdminId,
    userId:  args.userId,
    action:  "billing_hold_force_cleared",
    payload: { previousStatus, note: args.note },
  });

  return { previousStatus };
}
