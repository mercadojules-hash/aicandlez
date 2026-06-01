/**
 * Operator account reconciliation engine.
 *
 * Recomputes a user's realized-P&L ledger (`sim_accounts.total_realized`) and
 * closed-trade count from VERIFIED records only, excluding the
 * unlimited-position-incident backlog. Backlog rows are TAGGED (never deleted)
 * so the audit trail survives, and every apply writes an immutable
 * `account_reconciliations` row plus a `user_admin_actions` audit entry.
 *
 * Pollution signature (verified during investigation): a closed sim_trade with
 *   exchange IS NULL  AND  close_reason = 'RECONCILED_BACKLOG'
 * has no verifiable broker fill — it is a synthetic bulk-close from the
 * incident and is EXCLUDED from the recomputed ledger.
 *
 * Everything else is trusted: broker-attributed live fills (exchange NOT NULL,
 * carrying real fillPrice/qty/order IDs) AND legitimate paper trades. This is
 * deliberately fail-safe: a paper-only customer has no backlog rows, so their
 * realized P&L is left untouched.
 *
 * Realized is computed NET OF APP FEES (realizedPnL - entryFee - exitFee) to
 * match the semantics the live ledger already accrues.
 */

import { eq, and, isNull, sql } from "drizzle-orm";
import {
  db,
  simTradesTable,
  simAccountsTable,
  accountReconciliationsTable,
  userAdminActionsTable,
} from "@workspace/db";

/** Tag written onto incident-backlog rows that are excluded from the ledger. */
export const LEGACY_INCIDENT_TAG = "LEGACY_INCIDENT";

/** Close reason stamped on the incident's synthetic bulk-close rows. */
const INCIDENT_CLOSE_REASON = "RECONCILED_BACKLOG";

// Drizzle `db` and a transaction `tx` expose the same insert/update/select
// surface but are nominally distinct types. A structural pick lets a tx slot
// in wherever a top-level db would.
type DbExecutor = Pick<typeof db, "insert" | "update" | "select">;

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Net realized for one row = gross realized minus app-side fees. */
function netRealized(row: { realizedPnL: number; entryFee: number | null; exitFee: number | null }): number {
  return row.realizedPnL - (row.entryFee ?? 0) - (row.exitFee ?? 0);
}

export interface AffectedTrade {
  id:         string;
  symbol:     string;
  netRealized: number;
  closeReason: string | null;
  exchange:   string | null;
  exitTime:   number;
}

export interface ReconciliationResult {
  targetUserId:    string;
  hasAccount:      boolean;
  prevRealized:    number;
  newRealized:     number;
  delta:           number;
  prevTotalTrades: number;
  newTotalTrades:  number;
  /** Incident rows that are (or will be) tagged + excluded. */
  taggedCount:     number;
  /** Verified broker-attributed rows kept in the ledger. */
  verifiedCount:   number;
  /** Legitimate paper rows kept in the ledger. */
  paperKeptCount:  number;
  /** Backlog rows that were already tagged by a prior reconciliation. */
  alreadyTaggedCount: number;
  affectedTrades:  AffectedTrade[];
  applied:         boolean;
}

interface RowShape {
  id:                string;
  symbol:            string;
  realizedPnL:       number;
  entryFee:          number | null;
  exitFee:           number | null;
  exchange:          string | null;
  closeReason:       string | null;
  reconciliationTag: string | null;
  exitTime:          number;
}

/** True for the unlimited-position-incident synthetic backlog close. */
function isIncidentRow(r: RowShape): boolean {
  return r.exchange === null && r.closeReason === INCIDENT_CLOSE_REASON;
}

/**
 * Pure read: classify a user's closed trades and compute the would-be ledger.
 * Writes nothing. Shared by both the preview and apply paths so the numbers an
 * operator confirms are exactly the numbers that get persisted.
 */
export async function computeReconciliation(
  executor: DbExecutor,
  userId: string,
): Promise<ReconciliationResult> {
  const [account] = await executor
    .select({
      totalRealized: simAccountsTable.totalRealized,
      totalTrades:   simAccountsTable.totalTrades,
    })
    .from(simAccountsTable)
    .where(eq(simAccountsTable.userId, userId))
    .limit(1);

  const rows = (await executor
    .select({
      id:                simTradesTable.id,
      symbol:            simTradesTable.symbol,
      realizedPnL:       simTradesTable.realizedPnL,
      entryFee:          simTradesTable.entryFee,
      exitFee:           simTradesTable.exitFee,
      exchange:          simTradesTable.exchange,
      closeReason:       simTradesTable.closeReason,
      reconciliationTag: simTradesTable.reconciliationTag,
      exitTime:          simTradesTable.exitTime,
    })
    .from(simTradesTable)
    .where(eq(simTradesTable.userId, userId))) as RowShape[];

  let newRealized = 0;
  let newTotalTrades = 0;
  let verifiedCount = 0;
  let paperKeptCount = 0;
  let toTagCount = 0;
  let alreadyTaggedCount = 0;
  const affectedTrades: AffectedTrade[] = [];

  for (const r of rows) {
    const incident = isIncidentRow(r);
    const tagged = r.reconciliationTag !== null;
    // A row is excluded from the ledger if it matches the incident signature
    // OR has already been tagged by a prior reconciliation.
    if (incident || tagged) {
      if (tagged) alreadyTaggedCount += 1;
      else toTagCount += 1;
      affectedTrades.push({
        id: r.id,
        symbol: r.symbol,
        netRealized: round4(netRealized(r)),
        closeReason: r.closeReason,
        exchange: r.exchange,
        exitTime: r.exitTime,
      });
      continue;
    }
    newRealized += netRealized(r);
    newTotalTrades += 1;
    if (r.exchange !== null) verifiedCount += 1;
    else paperKeptCount += 1;
  }

  newRealized = round4(newRealized);
  const prevRealized = account ? round4(account.totalRealized) : 0;
  const prevTotalTrades = account ? account.totalTrades : 0;

  affectedTrades.sort((a, b) => b.exitTime - a.exitTime);

  return {
    targetUserId: userId,
    hasAccount: Boolean(account),
    prevRealized,
    newRealized,
    delta: round4(newRealized - prevRealized),
    prevTotalTrades,
    newTotalTrades,
    taggedCount: toTagCount + alreadyTaggedCount,
    verifiedCount,
    paperKeptCount,
    alreadyTaggedCount,
    affectedTrades,
    applied: false,
  };
}

/**
 * Apply a reconciliation in a single transaction:
 *   1. tag untagged incident-backlog rows (LEGACY_INCIDENT)
 *   2. overwrite sim_accounts.total_realized + total_trades with the recompute
 *   3. append an immutable account_reconciliations audit row
 *   4. append a user_admin_actions audit row
 *
 * No-ops safely when the user has no sim_accounts row (nothing to reconcile).
 */
export async function applyReconciliation(args: {
  actorId: string;
  targetId: string;
  note?: string | null;
}): Promise<ReconciliationResult> {
  const { actorId, targetId, note } = args;

  return db.transaction(async (tx) => {
    // Lock the target's account row for the duration of the transaction. The
    // trade-close path increments sim_accounts (total_realized = total_realized
    // + delta) in a single UPDATE, which acquires a row lock; holding FOR UPDATE
    // here serializes that path against our overwrite. A concurrent close blocks
    // until we commit, then increments on top of the corrected value — so the
    // ledger stays consistent even under live trading.
    const [locked] = await tx
      .select({ userId: simAccountsTable.userId })
      .from(simAccountsTable)
      .where(eq(simAccountsTable.userId, targetId))
      .for("update")
      .limit(1);

    const result = await computeReconciliation(tx, targetId);

    if (!result.hasAccount || !locked) {
      // Nothing to write — surface the (zeroed) preview so the caller can 404.
      return result;
    }

    // Idempotence guard: if there are no NEW incident rows to tag and the
    // ledger already matches the recompute, skip the write + audit entirely so
    // repeated applies are true no-ops (no spurious updatedAt churn or audit
    // rows). `applied` stays false; the route still returns 200 with the diff.
    const newlyTaggableExist = result.taggedCount - result.alreadyTaggedCount > 0;
    const ledgerMatches = Math.abs(result.delta) < 0.005
      && result.newTotalTrades === result.prevTotalTrades;
    if (!newlyTaggableExist && ledgerMatches) {
      return result;
    }

    // 1. Tag only untagged incident rows. .returning() gives the exact count
    //    that flipped this run (race-safe vs reading then writing).
    const tagged = await tx
      .update(simTradesTable)
      .set({ reconciliationTag: LEGACY_INCIDENT_TAG })
      .where(
        and(
          eq(simTradesTable.userId, targetId),
          eq(simTradesTable.closeReason, INCIDENT_CLOSE_REASON),
          isNull(simTradesTable.exchange),
          isNull(simTradesTable.reconciliationTag),
        ),
      )
      .returning({ id: simTradesTable.id });

    // 2. Overwrite the ledger.
    await tx
      .update(simAccountsTable)
      .set({
        totalRealized: result.newRealized,
        totalTrades:   result.newTotalTrades,
        updatedAt:     new Date(),
      })
      .where(eq(simAccountsTable.userId, targetId));

    const breakdown: Record<string, unknown> = {
      prevRealized:       result.prevRealized,
      newRealized:        result.newRealized,
      delta:              result.delta,
      prevTotalTrades:    result.prevTotalTrades,
      newTotalTrades:     result.newTotalTrades,
      verifiedCount:      result.verifiedCount,
      paperKeptCount:     result.paperKeptCount,
      newlyTaggedCount:   tagged.length,
      alreadyTaggedCount: result.alreadyTaggedCount,
      affectedTradeIds:   result.affectedTrades.map((t) => t.id),
    };

    // 3. account_reconciliations audit row.
    await tx.insert(accountReconciliationsTable).values({
      targetUserId:    targetId,
      actorUserId:     actorId,
      prevRealized:    result.prevRealized,
      newRealized:     result.newRealized,
      prevTotalTrades: result.prevTotalTrades,
      newTotalTrades:  result.newTotalTrades,
      taggedCount:     tagged.length + result.alreadyTaggedCount,
      verifiedCount:   result.verifiedCount,
      breakdown,
      note:            note ?? null,
    });

    // 4. user_admin_actions audit row (consistent with other operator actions).
    await tx.insert(userAdminActionsTable).values({
      id:           crypto.randomUUID(),
      actorAdminId: actorId,
      targetUserId: targetId,
      action:       "account_reconcile",
      payload:      { note: note ?? null, ...breakdown },
    });

    return { ...result, taggedCount: tagged.length + result.alreadyTaggedCount, applied: true };
  });
}

/** Read the reconciliation history for a user, newest first. */
export async function listReconciliationHistory(userId: string, limit = 20) {
  return db
    .select()
    .from(accountReconciliationsTable)
    .where(eq(accountReconciliationsTable.targetUserId, userId))
    .orderBy(sql`${accountReconciliationsTable.createdAt} DESC`)
    .limit(limit);
}
