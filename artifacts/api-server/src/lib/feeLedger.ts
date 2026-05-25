import { db } from "@workspace/db";
import { performanceFeesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  applyFeeAgainstCredits,
  evaluateAndEnforceBillingHold,
} from "./billingEnforcement.js";
import { logger } from "./logger.js";

// ── Performance fee constants ─────────────────────────────────────────────────
// Fee is ONLY charged on realized, closed, PROFITABLE trades.
// Losing trades: NO FEE.  Unrealized PnL: NO FEE.

export const PERFORMANCE_FEE_RATE = 0.03; // 3%
export const PERFORMANCE_FEE_BPS_DEFAULT = 300; // 3% expressed in basis points

// ── Effective fee policy resolver ─────────────────────────────────────────────
// Pulls the per-user billing overrides from `users` and returns the fee rate
// that should be applied to this user's next profitable close — or a skip
// reason when the user is exempt. Called once per close from
// `closeUserPosition` (and any other settlement path) so the platform's 3%
// default is enforced uniformly without per-call edits.
//
// Skip precedence (first match wins):
//   1. is_internal_account     → internal / test → skip
//   2. is_complimentary_account→ comp account   → skip
//   3. fee_waiver_active       → super-admin manual waiver (respects
//                                fee_waiver_until window when set)
// Otherwise: rate = perf_fee_bps_override / 10000 (default 3%).
//
// Returns rate=0/skip=true for any of the above; rate>0/skip=false otherwise.
// A failed lookup (user row missing) falls back to the platform default —
// fee enforcement must never be silently disabled by a transient DB miss.

export interface FeePolicy {
  rate:    number;        // 0 .. 1 (e.g. 0.03)
  skip:    boolean;       // true → caller MUST NOT charge a fee
  reason?: string;        // diagnostic label when skip=true
  source:  "default" | "override" | "internal" | "complimentary" | "waived" | "missing_user";
}

export async function resolveFeePolicy(userId: string): Promise<FeePolicy> {
  try {
    const [row] = await db
      .select({
        perfFeeBpsOverride:     usersTable.perfFeeBpsOverride,
        feeWaiverActive:        usersTable.feeWaiverActive,
        feeWaiverUntil:         usersTable.feeWaiverUntil,
        isInternalAccount:      usersTable.isInternalAccount,
        isComplimentaryAccount: usersTable.isComplimentaryAccount,
      })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, userId))
      .limit(1);

    if (!row) {
      // System/operator path (no users row) — fall back to default. NOT a
      // skip: operator-initiated trades still accrue platform fees so the
      // ledger stays accurate even when no clerk user is attached.
      return { rate: PERFORMANCE_FEE_RATE, skip: false, source: "missing_user" };
    }

    if (row.isInternalAccount) {
      return { rate: 0, skip: true, reason: "internal_account", source: "internal" };
    }
    if (row.isComplimentaryAccount) {
      return { rate: 0, skip: true, reason: "complimentary_account", source: "complimentary" };
    }
    if (row.feeWaiverActive) {
      // Respect optional expiry — if `until` is in the past the waiver lapses
      // automatically and the platform default kicks back in.
      if (!row.feeWaiverUntil || row.feeWaiverUntil.getTime() > Date.now()) {
        return { rate: 0, skip: true, reason: "fee_waived", source: "waived" };
      }
    }

    if (row.perfFeeBpsOverride != null) {
      const bps = Math.max(0, Math.min(10000, row.perfFeeBpsOverride));
      return { rate: bps / 10000, skip: false, source: "override" };
    }
    return { rate: PERFORMANCE_FEE_RATE, skip: false, source: "default" };
  } catch (err) {
    // Fail closed-to-default: better to charge the platform's published rate
    // than to silently waive fees on a transient DB error.
    logger.warn({ err, userId }, "resolveFeePolicy lookup failed — falling back to platform default");
    return { rate: PERFORMANCE_FEE_RATE, skip: false, source: "missing_user" };
  }
}

export interface FeeEntry {
  id:             string;
  tradeId:        string;
  userId:         string;
  exchange:       string;
  symbol:         string;
  side:           string;
  realizedPnl:    number;
  feeUSD:         number;
  isPaper:        boolean;
  timestamp:      number;
}

// In-memory cache (for the legacy /fees route while DB is authoritative source)
const _entries: FeeEntry[] = [];
let   _totalCollected = 0;

// ── recordPerformanceFee ──────────────────────────────────────────────────────
// Called when a trade closes with a POSITIVE realized PnL.
// Persists to DB and caches in-memory.
// MUST NOT be called for losing trades — caller is responsible for the guard.

export async function recordPerformanceFee(params: {
  tradeId:    string;
  userId:     string;
  exchange:   string;
  symbol:     string;
  side:       string;
  realizedPnl: number;   // must be > 0
  isPaper:    boolean;
  // Optional pre-resolved policy (from resolveFeePolicy). When omitted the
  // function recomputes at the platform default rate. Callers that already
  // ran resolveFeePolicy MUST pass these so per-user `perfFeeBpsOverride`
  // is honored — otherwise the ledger entry would silently revert to 3%.
  feeRate?:   number;
  feeUSD?:    number;
}): Promise<FeeEntry> {
  const effectiveRate = params.feeRate ?? PERFORMANCE_FEE_RATE;
  const feeUSD = params.feeUSD ?? parseFloat((params.realizedPnl * effectiveRate).toFixed(6));
  const id     = `PFEE-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const entry: FeeEntry = {
    id,
    tradeId:     params.tradeId,
    userId:      params.userId,
    exchange:    params.exchange,
    symbol:      params.symbol,
    side:        params.side,
    realizedPnl: params.realizedPnl,
    feeUSD,
    isPaper:     params.isPaper,
    timestamp:   Date.now(),
  };

  // Persist to DB synchronously so a process crash AFTER cash deduction in
  // closeUserPosition cannot lose the ledger row. Only credit deduction +
  // billing-hold enforcement are fire-and-forget — those are reconcilable
  // on the next billing tick, but the ledger insert is not.
  try {
    await db.insert(performanceFeesTable).values({
      id,
      userId:           params.userId,
      tradeId:          params.tradeId,
      exchange:         params.exchange,
      symbol:           params.symbol,
      side:             params.side,
      realizedPnl:      params.realizedPnl,
      feeRate:          effectiveRate,
      feeAmountUsd:     feeUSD,
      settlementStatus: "pending",
      isPaper:          params.isPaper,
    });
  } catch (err) {
    logger.error(
      { err, feeId: id, userId: params.userId, feeUSD, effectiveRate },
      "performance_fees insert failed — ledger row LOST (cash was already deducted)",
    );
    // Rethrow so caller can surface the persistence failure rather than
    // silently dropping fee revenue.
    throw err;
  }

  // Paper trades are audited but never billed → skip credits/hold.
  if (!params.isPaper) {
    (async () => {
      try {
        // 1. Try credits first. If fully covered, fee is auto-settled and
        //    no debt accrues, so no billing_hold can trigger.
        const credResult = await applyFeeAgainstCredits({
          userId:    params.userId,
          feeAmount: feeUSD,
          feeId:     id,
        });

        // 2. Re-evaluate billing health regardless — covers edge cases like
        //    pre-existing outstanding fees that finally cross threshold even
        //    after a partial credit deduction.
        await evaluateAndEnforceBillingHold(params.userId);

        if (!credResult.covered) {
          logger.info(
            { userId: params.userId, feeId: id, feeUSD, deducted: credResult.deducted },
            "fee remains outstanding (credits insufficient)",
          );
        }
      } catch (err) {
        logger.error(
          { err, feeId: id, userId: params.userId },
          "billing enforcement failed (ledger row already persisted, will retry next tick)",
        );
      }
    })();
  }

  _entries.push(entry);
  _totalCollected += feeUSD;
  return entry;
}

// ── Legacy sync helper (kept for the existing /api/fees routes) ───────────────
// For backwards-compat: the old recordFee() was sync and didn't need a userId.
// New code should use recordPerformanceFee() above.

export function recordFee(params: {
  tradeId:   string;
  symbol:    string;
  side:      string;
  amountUSD: number;
}): FeeEntry {
  const feeUSD = parseFloat((params.amountUSD * PERFORMANCE_FEE_RATE).toFixed(6));
  const entry: FeeEntry = {
    id:          `PFEE-LEGACY-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    tradeId:     params.tradeId,
    userId:      "system",
    exchange:    "unknown",
    symbol:      params.symbol,
    side:        params.side,
    realizedPnl: params.amountUSD,
    feeUSD,
    isPaper:     true,
    timestamp:   Date.now(),
  };
  _entries.push(entry);
  _totalCollected += feeUSD;
  return entry;
}

export function getFeeSummary() {
  return {
    totalFeesCollected: parseFloat(_totalCollected.toFixed(4)),
    tradeCount:         _entries.length,
    feeRatePct:         PERFORMANCE_FEE_RATE * 100,
    recentFees:         [..._entries].reverse().slice(0, 10),
  };
}

export function getAllFees(): FeeEntry[] {
  return [..._entries].reverse();
}
