/**
 * GET /api/user/ai-trading/liquidity — Customer AI liquidity status.
 *
 * Read-only status feed for the PWA + Portal trade-size / liquidity-guard
 * UI. Returns the same numbers the execution gate (`liveUserExecution.ts`
 * gate 0LIQ) would compute right now, so the customer can SEE the wall
 * before they hit it. Both surfaces poll this endpoint; the math lives
 * in `lib/liquidityGuard.ts` so UI and gate cannot drift.
 *
 * Polled by:
 *   - aicandlez-app/src/pages/Trade.tsx     (size picker + status strip)
 *   - trading-dashboard/.../PortalCustomerShell.tsx (customer status strip)
 *
 * No mutation. No order routing. Operators (admin / super-admin) are
 * served the same payload with `isAdmin=true` so admin tooling can render
 * the same widget for diagnostic purposes without bypassing anything —
 * the actual gate bypass happens on the execution side, not here.
 */

import { Router, type IRouter } from "express";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import {
  db,
  simAccountsTable,
  simPositionsTable,
  userSettingsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { resolveAiTradingGate } from "../lib/aiTradingGate.js";
import {
  ALLOWED_TRADE_SIZES,
  DEFAULT_TRADE_SIZE_USD,
  PLAN_MAX_OPEN_POSITIONS,
  coerceTradeSizeToPreset,
  evaluateLiquidityGuard,
  type CustomerPlan,
} from "../lib/liquidityGuard.js";
import type { Request } from "express";

type AuthReq = Request & { clerkUserId: string };

const router: IRouter = Router();

async function countUserOpenLivePositions(userId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(simPositionsTable)
      .where(and(
        eq(simPositionsTable.userId, userId),
        isNotNull(simPositionsTable.exchange),
      ));
    return Number(row?.n ?? 0);
  } catch {
    // Fail-OPEN for the READ path only. The execution-side gate
    // (`liveUserExecution.ts` 0LIQ) fails CLOSED on the same query —
    // showing 0 here just means the customer sees a default-looking
    // status widget; we never authorize a trade based on this value.
    return 0;
  }
}

async function readUserCashBalance(userId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ cash: simAccountsTable.cashBalance })
      .from(simAccountsTable)
      .where(eq(simAccountsTable.userId, userId))
      .limit(1);
    return Number(row?.cash ?? 0);
  } catch {
    return 0;
  }
}

async function readUserTradeSize(userId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ size: userSettingsTable.preferredLiveOrderSizeUsd })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);
    return coerceTradeSizeToPreset(row?.size);
  } catch {
    return DEFAULT_TRADE_SIZE_USD;
  }
}

router.get(
  "/user/ai-trading/liquidity",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthReq).clerkUserId;
    try {
      const [gate, openLiveCount, availableCashUsd, tradeSizeUsd] = await Promise.all([
        resolveAiTradingGate(userId),
        countUserOpenLivePositions(userId),
        readUserCashBalance(userId),
        readUserTradeSize(userId),
      ]);

      // Operators are not subject to the per-plan cap, but we still
      // surface the underlying numbers so the admin diagnostic widget
      // shows the customer-side reality. `isAdmin` lets the UI render
      // a small "(admin bypass)" hint without changing the numbers.
      const plan: CustomerPlan = gate.plan;

      const verdict = evaluateLiquidityGuard({
        plan,
        openLiveCount,
        tradeSizeUsd,
        availableCashUsd,
      });

      res.json({
        userId,
        plan,
        isAdmin:           gate.isAdmin,
        tradeSizeUsd,
        allowedTradeSizes: ALLOWED_TRADE_SIZES,
        defaultTradeSize:  DEFAULT_TRADE_SIZE_USD,
        planMaxOpen:       PLAN_MAX_OPEN_POSITIONS[plan] ?? 0,
        openLiveCount,
        remainingSlots:    verdict.remainingSlots,
        availableCashUsd:  verdict.availableCashUsd,
        requiredCashUsd:   verdict.requiredCashUsd,
        feeBufferPct:      verdict.feeBufferPct,
        safetyCushionUsd:  verdict.safetyCushionUsd,
        liquidityProtected: !verdict.ok && verdict.reasonCode === "liquidity_protected",
        planCapacityReached: !verdict.ok && verdict.reasonCode === "plan_max_positions_reached",
        message:           verdict.message,
        reasonCode:        verdict.reasonCode,
      });
    } catch (err) {
      req.log.error({ err, userId }, "GET /user/ai-trading/liquidity failed");
      res.status(500).json({ error: "Failed to compute liquidity status" });
    }
  },
);

export default router;
