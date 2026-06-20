/**
 * Cross-tenant admin trade telemetry for the Operator Command Center.
 *
 *   GET /api/admin/positions      — all currently-open positions across users
 *   GET /api/admin/closed-trades  — most recent closed trades across users
 *
 * Both routes union the global `trades` table (legacy + force-test inserts)
 * with the per-user `sim_positions` / `sim_trades` tables so the operator
 * sees the full platform picture in one panel.
 *
 * Auth: admin / super-admin only.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { getTicker } from "../lib/marketData.js";

const router = Router();
const requireOperator = [requireAuth, requireRole(["admin", "super-admin"])];

// ── GET /admin/positions ──────────────────────────────────────────────────────
// Returns every open position platform-wide. Union of:
//   1. trades table where status='open'  (legacy global + force-test)
//   2. sim_positions                     (per-user simulation registry)
router.get("/admin/positions", ...requireOperator, async (req, res): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query["limit"] ?? "100"), 10) || 100, 500);

    const rows = await db.execute(sql`
      WITH unified AS (
        SELECT
          t.id                                            AS id,
          NULL::varchar                                   AS user_id,
          NULL::text                                      AS user_email,
          t.symbol                                        AS symbol,
          t.side                                          AS side,
          CASE WHEN t.price > 0 THEN t.amount / t.price ELSE NULL END AS quantity,
          t.amount                                        AS size_usd,
          t.price                                         AS entry_price,
          t.stop_loss                                     AS stop_loss,
          t.take_profit                                   AS take_profit,
          NULL::real                                      AS manual_exit_target_price,
          t.mode                                          AS mode,
          EXTRACT(EPOCH FROM t.timestamp)::bigint * 1000  AS entry_time,
          NULL::text                                      AS exchange,
          NULL::real                                      AS manual_exit_target_price,
          NULL::real                                      AS entry_fee_broker,
          NULL::text                                      AS entry_fee_broker_currency,
          'global'::text                                  AS source
        FROM trades t
        WHERE t.status = 'open'

        UNION ALL

        SELECT
          p.id                                            AS id,
          p.user_id                                       AS user_id,
          u.email                                         AS user_email,
          p.symbol                                        AS symbol,
          p.side                                          AS side,
          p.quantity                                      AS quantity,
          p.size_usd                                      AS size_usd,
          p.entry_price                                   AS entry_price,
          p.stop_loss                                     AS stop_loss,
          p.take_profit                                   AS take_profit,
          p.manual_exit_target_price                      AS manual_exit_target_price,
          'simulation'::text                              AS mode,
          p.entry_time                                    AS entry_time,
          p.exchange                                      AS exchange,
          p.manual_exit_target_price                      AS manual_exit_target_price,
          p.entry_fee_broker                              AS entry_fee_broker,
          p.entry_fee_broker_currency                     AS entry_fee_broker_currency,
          'sim'::text                                     AS source
        FROM sim_positions p
        LEFT JOIN users u ON u.clerk_user_id = p.user_id
      )
      SELECT *
      FROM unified
      ORDER BY entry_time DESC NULLS LAST
      LIMIT ${sql.raw(String(limit))}
    `).then(r => r.rows);

    const symbols = [...new Set(rows.map((r) => String((r as Record<string, unknown>)["symbol"] ?? "")).filter(Boolean))];
    const priceBySymbol = new Map<string, number>();
    await Promise.all(symbols.map(async (symbol) => {
      try {
        const ticker = await getTicker(symbol);
        if (ticker.price > 0) priceBySymbol.set(symbol, ticker.price);
      } catch {
        /* Leave price-derived telemetry null for this symbol on this poll. */
      }
    }));

    const enriched = rows.map((row) => {
      const r = row as Record<string, unknown>;
      const symbol = String(r["symbol"] ?? "");
      const side = String(r["side"] ?? "BUY").toUpperCase();
      const entryPrice = Number(r["entry_price"] ?? 0);
      const sizeUSD = Number(r["size_usd"] ?? 0);
      const quantity = Number(r["quantity"] ?? (entryPrice > 0 ? sizeUSD / entryPrice : 0));
      const currentPrice = priceBySymbol.get(symbol) ?? null;
      const unrealizedPnL = currentPrice !== null
        ? (side === "SELL" ? (entryPrice - currentPrice) : (currentPrice - entryPrice)) * quantity
        : null;
      const currentMarketValue = currentPrice !== null
        ? (side === "SELL" ? sizeUSD - (unrealizedPnL ?? 0) : quantity * currentPrice)
        : null;
      const unrealizedPnLPct = unrealizedPnL !== null && sizeUSD > 0 ? (unrealizedPnL / sizeUSD) * 100 : null;
      const manualTarget = r["manual_exit_target_price"] == null ? null : Number(r["manual_exit_target_price"]);
      const distanceToTarget = manualTarget !== null && currentPrice !== null
        ? manualTarget - currentPrice
        : null;
      return {
        ...r,
        capital_invested: sizeUSD,
        quantity_purchased: quantity > 0 ? quantity : null,
        current_price: currentPrice,
        current_market_value: currentMarketValue,
        unrealized_pnl: unrealizedPnL,
        unrealized_pnl_pct: unrealizedPnLPct,
        manual_target_status: manualTarget !== null ? "Armed" : null,
        distance_to_target: distanceToTarget,
      };
    });

    res.json({
      positions: enriched,
      count:     rows.length,
      timestamp: Date.now(),
    });
  } catch (err) {
    req.log.error({ err }, "GET /admin/positions failed");
    res.status(500).json({ error: "Failed to load positions" });
  }
});

// ── GET /admin/closed-trades ──────────────────────────────────────────────────
// Recent closed trades across all users. Union of:
//   1. trades table where status='closed'  (legacy global + force-test)
//   2. sim_trades                          (per-user closed simulation trades)
router.get("/admin/closed-trades", ...requireOperator, async (req, res): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query["limit"] ?? "50"), 10) || 50, 500);

    const rows = await db.execute(sql`
      WITH unified AS (
        SELECT
          t.id                                              AS id,
          NULL::varchar                                     AS user_id,
          NULL::text                                        AS user_email,
          t.symbol                                          AS symbol,
          t.side                                            AS side,
          t.amount                                          AS size_usd,
          t.price                                           AS entry_price,
          t.exit_price                                      AS exit_price,
          t.pnl                                             AS realized_pnl,
          t.pnl_percent                                     AS realized_pnl_pct,
          t.mode                                            AS mode,
          t.reason                                          AS close_reason,
          EXTRACT(EPOCH FROM t.closed_at)::bigint * 1000    AS exit_time,
          NULL::real                                        AS net_fees,
          NULL::text                                        AS exchange,
          NULL::real                                        AS entry_fee,
          NULL::real                                        AS exit_fee,
          NULL::real                                        AS entry_fee_broker,
          NULL::text                                        AS entry_fee_broker_currency,
          NULL::real                                        AS exit_fee_broker,
          NULL::text                                        AS exit_fee_broker_currency,
          'global'::text                                    AS source
        FROM trades t
        WHERE t.status = 'closed'

        UNION ALL

        SELECT
          tr.id                                             AS id,
          tr.user_id                                        AS user_id,
          u.email                                           AS user_email,
          tr.symbol                                         AS symbol,
          tr.side                                           AS side,
          tr.size_usd                                       AS size_usd,
          tr.entry_price                                    AS entry_price,
          tr.exit_price                                     AS exit_price,
          tr.realized_pnl                                   AS realized_pnl,
          tr.realized_pnl_pct                               AS realized_pnl_pct,
          'simulation'::text                                AS mode,
          tr.close_reason                                   AS close_reason,
          tr.exit_time                                      AS exit_time,
          (COALESCE(tr.entry_fee, 0) + COALESCE(tr.exit_fee, 0)) AS net_fees,
          tr.exchange                                       AS exchange,
          tr.entry_fee                                      AS entry_fee,
          tr.exit_fee                                       AS exit_fee,
          tr.entry_fee_broker                               AS entry_fee_broker,
          tr.entry_fee_broker_currency                      AS entry_fee_broker_currency,
          tr.exit_fee_broker                                AS exit_fee_broker,
          tr.exit_fee_broker_currency                       AS exit_fee_broker_currency,
          'sim'::text                                       AS source
        FROM sim_trades tr
        LEFT JOIN users u ON u.clerk_user_id = tr.user_id
      )
      SELECT *
      FROM unified
      ORDER BY exit_time DESC NULLS LAST
      LIMIT ${sql.raw(String(limit))}
    `).then(r => r.rows);

    // ── Aggregate totals so the UI can render PnL / win-rate summary chips ──
    const [totals] = await db.execute(sql`
      WITH unified AS (
        SELECT pnl AS realized_pnl FROM trades WHERE status = 'closed'
        UNION ALL
        SELECT realized_pnl FROM sim_trades
      )
      SELECT
        COUNT(*)::int                                    AS total,
        COUNT(*) FILTER (WHERE realized_pnl > 0)::int    AS wins,
        COUNT(*) FILTER (WHERE realized_pnl <= 0)::int   AS losses,
        COALESCE(SUM(realized_pnl), 0)::float            AS total_pnl
      FROM unified
    `).then(r => r.rows) as Array<Record<string, number>>;

    res.json({
      trades:    rows,
      count:     rows.length,
      summary:   totals ?? { total: 0, wins: 0, losses: 0, total_pnl: 0 },
      timestamp: Date.now(),
    });
  } catch (err) {
    req.log.error({ err }, "GET /admin/closed-trades failed");
    res.status(500).json({ error: "Failed to load closed trades" });
  }
});

export default router;
