/**
 * GET  /api/admin/execution-metrics        — separated execution metrics + reconciliation
 * POST /api/admin/execution-metrics/reset    — rebaseline the in-memory counters
 *
 * Issue #2 diagnostic surface. Splits the historically-conflated "executed"
 * number into independently-meaningful metrics and gives the operator a
 * reconciliation feed so every customer broker fill is traceable end-to-end:
 *
 *   counters (in-memory, cumulative since last reset):
 *     operatorSimExecutions          — global operator/sim book opens (simulated)
 *     customerBrokerOrdersSubmitted  — customer live orders dispatched to a broker
 *     customerBrokerOrdersFilled     — broker-accepted + persisted customer fills
 *     brokerRejects                  — customer broker orders rejected
 *
 *   live (DB-derived ground truth, computed per request):
 *     customerLivePositions          — open sim_positions WHERE exchange IS NOT NULL
 *     customerClosedTrades           — sim_trades WHERE exchange IS NOT NULL
 *
 *   reconciliation:
 *     openLivePositions[]            — each open live position with its Broker
 *                                      Order ID + which records exist
 *     recentClosedLiveTrades[]       — recent closed live trades with open/close
 *                                      Broker Order IDs + realized PnL
 *
 * Auth: admin / super-admin only.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import {
  getCustomerExecMetrics,
  resetCustomerExecMetrics,
} from "../lib/customerExecMetrics.js";

const router = Router();
const requireOperator = [requireAuth, requireRole(["admin", "super-admin"])];

interface OpenLiveRow {
  position_id: string;
  user_id: string;
  symbol: string;
  side: string;
  exchange: string | null;
  exchange_order_id: string | null;
  entry_price: number | null;
  size_usd: number | null;
  opened_at: string | number | null;
}

interface ClosedLiveRow {
  trade_id: string;
  user_id: string;
  symbol: string;
  side: string;
  exchange: string | null;
  exchange_order_id: string | null;
  exchange_close_order_id: string | null;
  realized_pnl: number | null;
  exit_time: string | number | null;
}

router.get(
  "/admin/execution-metrics",
  ...requireOperator,
  async (_req, res): Promise<void> => {
    const counters = getCustomerExecMetrics();

    const [livePosCount, closedTradeCount, openRows, closedRows] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int AS n FROM sim_positions WHERE exchange IS NOT NULL`),
      db.execute(sql`SELECT COUNT(*)::int AS n FROM sim_trades    WHERE exchange IS NOT NULL`),
      db.execute(sql`
        SELECT
          id                                            AS position_id,
          user_id                                       AS user_id,
          symbol                                        AS symbol,
          side                                          AS side,
          exchange                                      AS exchange,
          exchange_order_id                             AS exchange_order_id,
          entry_price                                   AS entry_price,
          size_usd                                      AS size_usd,
          EXTRACT(EPOCH FROM created_at)::bigint * 1000 AS opened_at
        FROM sim_positions
        WHERE exchange IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 25
      `),
      db.execute(sql`
        SELECT
          id                       AS trade_id,
          user_id                  AS user_id,
          symbol                   AS symbol,
          side                     AS side,
          exchange                 AS exchange,
          exchange_order_id        AS exchange_order_id,
          exchange_close_order_id  AS exchange_close_order_id,
          realized_pnl             AS realized_pnl,
          exit_time                AS exit_time
        FROM sim_trades
        WHERE exchange IS NOT NULL
        ORDER BY exit_time DESC
        LIMIT 25
      `),
    ]);

    const customerLivePositions = Number((livePosCount.rows[0] as { n: number } | undefined)?.n ?? 0);
    const customerClosedTrades  = Number((closedTradeCount.rows[0] as { n: number } | undefined)?.n ?? 0);

    const openLivePositions = (openRows.rows as unknown as OpenLiveRow[]).map((r) => ({
      positionId:   r.position_id,
      userId:       r.user_id,
      symbol:       r.symbol,
      side:         r.side,
      exchange:     r.exchange,
      brokerOrderId: r.exchange_order_id,
      entryPrice:   r.entry_price != null ? Number(r.entry_price) : null,
      sizeUSD:      r.size_usd != null ? Number(r.size_usd) : null,
      openedAt:     r.opened_at != null ? Number(r.opened_at) : null,
      // Record-presence trace: an open live position IS the position record and
      // appears in the Live Trades feed; the Trade History row is written only
      // on close.
      records: {
        brokerOrderId:      Boolean(r.exchange_order_id),
        positionRecord:     true,
        liveTradeRecord:    true,
        tradeHistoryRecord: false,
      },
    }));

    const recentClosedLiveTrades = (closedRows.rows as unknown as ClosedLiveRow[]).map((r) => ({
      tradeId:           r.trade_id,
      userId:            r.user_id,
      symbol:            r.symbol,
      side:              r.side,
      exchange:          r.exchange,
      brokerOrderId:      r.exchange_order_id,
      brokerCloseOrderId: r.exchange_close_order_id,
      realizedPnL:       r.realized_pnl != null ? Number(r.realized_pnl) : null,
      closedAt:          r.exit_time != null ? Number(r.exit_time) : null,
      // A closed live trade is fully reconciled: it carries the open Broker
      // Order ID and is persisted in Trade History (sim_trades).
      records: {
        brokerOrderId:      Boolean(r.exchange_order_id),
        positionRecord:     false,
        liveTradeRecord:    true,
        tradeHistoryRecord: true,
      },
    }));

    res.json({
      since: counters.since,
      counters: {
        operatorSimExecutions:         counters.operatorSimExecutions,
        customerBrokerOrdersSubmitted: counters.customerBrokerOrdersSubmitted,
        customerBrokerOrdersFilled:    counters.customerBrokerOrdersFilled,
        brokerRejects:                 counters.brokerRejects,
      },
      live: {
        customerLivePositions,
        customerClosedTrades,
      },
      reconciliation: {
        openLivePositions,
        recentClosedLiveTrades,
      },
      serverNow: Date.now(),
    });
  },
);

router.post(
  "/admin/execution-metrics/reset",
  ...requireOperator,
  (req, res): void => {
    resetCustomerExecMetrics();
    req.log.info("Customer execution metrics reset by operator");
    res.json({ ok: true, since: getCustomerExecMetrics().since });
  },
);

export default router;
