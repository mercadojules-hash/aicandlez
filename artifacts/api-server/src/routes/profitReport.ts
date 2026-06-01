/**
 * GET /api/user/profit-report — consolidated per-customer profit report
 * (Profit Optimization P7).
 *
 * Reads the authenticated customer's closed `sim_trades` plus their live-order
 * attempt funnel and returns a single rollup: win rate, profit factor, avg
 * win/loss, attempt→fill conversion, best categories/exchanges/symbols, avg
 * hold time, and a closes-by-reason (TP/trailing/SL/max-hold) breakdown.
 * Read-only, requireAuth-gated.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { simTradesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getCustomerFunnel } from "../lib/customerExecutionAttribution.js";
import {
  computeProfitReport,
  type ProfitReportTrade,
} from "../lib/profitReport.js";

type AuthReq = Request & { clerkUserId: string };

const router: IRouter = Router();

router.get(
  "/user/profit-report",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthReq).clerkUserId;

    const rows = await db
      .select({
        symbol: simTradesTable.symbol,
        realizedPnL: simTradesTable.realizedPnL,
        durationMs: simTradesTable.durationMs,
        closeReason: simTradesTable.closeReason,
        exchange: simTradesTable.exchange,
      })
      .from(simTradesTable)
      .where(eq(simTradesTable.userId, userId));

    const trades: ProfitReportTrade[] = rows.map((r) => ({
      symbol: r.symbol,
      realizedPnL: r.realizedPnL,
      durationMs: r.durationMs,
      closeReason: r.closeReason,
      exchange: r.exchange,
    }));

    const funnel = getCustomerFunnel(userId);
    const report = computeProfitReport(trades, {
      attempts: funnel.attempts,
      successes: funnel.successes,
      since: funnel.since,
    });

    res.json(report);
  },
);

export default router;
