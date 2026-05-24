import { db } from "@workspace/db";
import { performanceFeesTable } from "@workspace/db";
import {
  applyFeeAgainstCredits,
  evaluateAndEnforceBillingHold,
} from "./billingEnforcement.js";
import { logger } from "./logger.js";

// ── Performance fee constants ─────────────────────────────────────────────────
// Fee is ONLY charged on realized, closed, PROFITABLE trades.
// Losing trades: NO FEE.  Unrealized PnL: NO FEE.

export const PERFORMANCE_FEE_RATE = 0.03; // 3%

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
}): Promise<FeeEntry> {
  const feeUSD = parseFloat((params.realizedPnl * PERFORMANCE_FEE_RATE).toFixed(6));
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

  // Persist to DB then attempt credit deduction + billing enforcement.
  // Fire-and-forget at the OUTER level — trade execution never blocks
  // on billing bookkeeping.
  (async () => {
    try {
      await db.insert(performanceFeesTable).values({
        id,
        userId:           params.userId,
        tradeId:          params.tradeId,
        exchange:         params.exchange,
        symbol:           params.symbol,
        side:             params.side,
        realizedPnl:      params.realizedPnl,
        feeRate:          PERFORMANCE_FEE_RATE,
        feeAmountUsd:     feeUSD,
        settlementStatus: "pending",
        isPaper:          params.isPaper,
      });

      // Paper trades are audited but never billed → skip credits/hold.
      if (params.isPaper) return;

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
        "fee persistence / billing enforcement failed (non-fatal to trade close)",
      );
    }
  })();

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
