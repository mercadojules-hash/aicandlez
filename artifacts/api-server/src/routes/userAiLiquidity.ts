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

async function countUserOpenPositionsByMode(userId: string): Promise<{
  openLive:  number;
  openPaper: number;
  openTotal: number;
}> {
  try {
    const [row] = await db
      .select({
        live:  sql<number>`count(*) filter (where ${simPositionsTable.exchange} is not null)::int`,
        paper: sql<number>`count(*) filter (where ${simPositionsTable.exchange} is null)::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(simPositionsTable)
      .where(eq(simPositionsTable.userId, userId));
    return {
      openLive:  Number(row?.live  ?? 0),
      openPaper: Number(row?.paper ?? 0),
      openTotal: Number(row?.total ?? 0),
    };
  } catch {
    // Fail-OPEN for the READ path only. The execution-side gate
    // (`liveUserExecution.ts` 0LIQ) fails CLOSED on the same query —
    // showing 0 here just means the customer sees a default-looking
    // status widget; we never authorize a trade based on this value.
    return { openLive: 0, openPaper: 0, openTotal: 0 };
  }
}

async function readUserTradingMode(userId: string): Promise<"paper" | "live"> {
  try {
    const [row] = await db
      .select({ mode: userSettingsTable.tradingMode })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);
    return row?.mode === "live" ? "live" : "paper";
  } catch {
    return "paper";
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
      const [gate, openCounts, availableCashUsd, tradeSizeUsd, runtimeMode] = await Promise.all([
        resolveAiTradingGate(userId),
        countUserOpenPositionsByMode(userId),
        readUserCashBalance(userId),
        readUserTradeSize(userId),
        readUserTradingMode(userId),
      ]);
      const { openLive: openLiveCount, openPaper: openPaperCount, openTotal: openTotalCount } = openCounts;
      // Mode-aware badge count. Paper mode → count paper rows; live mode →
      // count live rows. NO mixed/global leakage. `openLiveCount` is kept as
      // a distinct field because `evaluateLiquidityGuard` MUST use the live-
      // only count for plan-cap math (a paper user with 5 paper rows on a
      // 3-cap starter plan must NOT be told "close one"). UI badges read
      // `openCount`; gate math reads `openLiveCount`.
      const openCount = runtimeMode === "live" ? openLiveCount : openPaperCount;

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

      // [OPEN_BADGE_SOURCE] — PER_USER, mode-aware, DB-backed.
      // `openCount` is the mode-resolved count the UI badge renders.
      // `openLiveCount` stays as the live-only count `evaluateLiquidityGuard`
      // requires for plan-cap math. Both are surfaced so the UI can show the
      // right number while the gate stays honest.
      req.log.info({
        tag:             "OPEN_BADGE_SOURCE",
        sourceOfTruth:   "sim_positions WHERE userId (DB, mode-filtered)",
        runtimeSource:   "user_settings.tradingMode",
        scope:           "PER_USER_DB",
        perUserAware:    true,
        userId,
        tradingMode:     runtimeMode,
        openPositions:   openCount,
        dbOpenPositions: openTotalCount,
        openLiveCount,
        openPaperCount,
        planMaxOpen:     PLAN_MAX_OPEN_POSITIONS[plan] ?? 0,
        remainingSlots:  verdict.remainingSlots,
        plan,
        isAdmin:         gate.isAdmin,
      }, "[OPEN_BADGE_SOURCE] mode-aware per-user DB count — drives Trade banner 'N/M OPEN'");
      res.json({
        userId,
        plan,
        isAdmin:           gate.isAdmin,
        tradingMode:       runtimeMode,
        tradeSizeUsd,
        allowedTradeSizes: ALLOWED_TRADE_SIZES,
        defaultTradeSize:  DEFAULT_TRADE_SIZE_USD,
        planMaxOpen:       PLAN_MAX_OPEN_POSITIONS[plan] ?? 0,
        openLiveCount,
        openPaperCount,
        openTotalCount,
        openCount,            // ← mode-aware badge count (UI reads this)
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
