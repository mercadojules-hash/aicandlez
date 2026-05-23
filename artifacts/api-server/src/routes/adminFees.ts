/**
 * Cross-tenant admin fee telemetry for the Operator Portal.
 *
 *   GET /api/admin/fees/monthly?months=6   — last N months of broker
 *                                            commission, bucketed by exit_time,
 *                                            aggregated across every user's
 *                                            closed sim_trades row (real Kraken
 *                                            commissions on live legs).
 *
 *   GET /api/admin/fees/month/:month       — every closed trade whose
 *                                            exit_time falls inside the given
 *                                            YYYY-MM bucket, sorted by
 *                                            entry_fee + exit_fee descending
 *                                            (costliest offenders first) so
 *                                            operators can drill into the bar
 *                                            they tapped on the admin Portal
 *                                            fees-trend chart.
 *
 * Auth: admin / super-admin only.
 *
 * Shape mirrors the customer endpoints under /account/fees/* so the same
 * PortalFeesTrend + PortalFeesMonthModal components can render either feed.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

const router = Router();
const requireOperator = [requireAuth, requireRole(["admin", "super-admin"])];

interface MonthlyFeeBucket {
  month:       string;
  feesPaid:    number;
  tradeCount:  number;
  realizedPnL: number;
}

router.get("/admin/fees/monthly", ...requireOperator, async (req, res): Promise<void> => {
  const monthsRaw = Number(req.query["months"] ?? 6);
  const months    = Math.max(1, Math.min(
    Number.isFinite(monthsRaw) ? Math.trunc(monthsRaw) : 6,
    24,
  ));

  try {
    // Build the trailing bucket window anchored to the current month so the
    // chart always shows a fixed number of columns (zero-filled where no
    // activity).
    const now = new Date();
    const buckets: MonthlyFeeBucket[] = [];
    const indexByKey = new Map<string, number>();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      indexByKey.set(key, buckets.length);
      buckets.push({ month: key, feesPaid: 0, tradeCount: 0, realizedPnL: 0 });
    }
    const windowStart = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - (months - 1),
      1,
    );

    const rows = await db.execute(sql`
      SELECT
        exit_time      AS exit_time,
        entry_fee      AS entry_fee,
        exit_fee       AS exit_fee,
        realized_pnl   AS realized_pnl
      FROM sim_trades
      WHERE exit_time >= ${windowStart}
    `).then(r => r.rows as Array<{
      exit_time:    number | string;
      entry_fee:    number | string | null;
      exit_fee:     number | string | null;
      realized_pnl: number | string | null;
    }>);

    for (const r of rows) {
      const exitMs = Number(r.exit_time);
      if (!Number.isFinite(exitMs) || exitMs < windowStart) continue;
      const d = new Date(exitMs);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const idx = indexByKey.get(key);
      if (idx === undefined) continue;
      const entry = Number(r.entry_fee ?? 0) || 0;
      const exit  = Number(r.exit_fee  ?? 0) || 0;
      const fee   = entry + exit;
      const pnl   = Number(r.realized_pnl ?? 0) || 0;
      if (fee > 0) buckets[idx]!.feesPaid += fee;
      buckets[idx]!.tradeCount += 1;
      buckets[idx]!.realizedPnL += pnl;
    }

    for (const b of buckets) {
      b.feesPaid    = parseFloat(b.feesPaid.toFixed(2));
      b.realizedPnL = parseFloat(b.realizedPnL.toFixed(2));
    }

    const totalFeesPaid = parseFloat(
      buckets.reduce((s, b) => s + b.feesPaid, 0).toFixed(2),
    );
    res.json({ months: buckets, totalFeesPaid });
  } catch (err) {
    req.log.error({ err }, "GET /admin/fees/monthly failed");
    res.status(500).json({ error: "Failed to load admin monthly fees" });
  }
});

router.get("/admin/fees/month/:month", ...requireOperator, async (req, res): Promise<void> => {
  const month = String(req.params["month"] ?? "");
  // Strict YYYY-MM guard to keep arbitrary input out of the date math.
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    res.status(400).json({ error: "month must be YYYY-MM" });
    return;
  }

  try {
    const [yStr, mStr] = month.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const startMs = Date.UTC(y, m - 1, 1);
    const endMs   = Date.UTC(y, m,     1);

    const rows = await db.execute(sql`
      SELECT
        tr.id                            AS id,
        tr.user_id                       AS user_id,
        u.email                          AS user_email,
        tr.symbol                        AS symbol,
        tr.side                          AS side,
        tr.entry_price                   AS entry_price,
        tr.exit_price                    AS exit_price,
        tr.exit_time                     AS exit_time,
        tr.realized_pnl                  AS realized_pnl,
        tr.realized_pnl_pct              AS realized_pnl_pct,
        tr.close_reason                  AS close_reason,
        tr.exchange                      AS exchange,
        tr.entry_fee                     AS entry_fee,
        tr.exit_fee                      AS exit_fee,
        tr.entry_fee_broker              AS entry_fee_broker,
        tr.entry_fee_broker_currency     AS entry_fee_broker_currency,
        tr.exit_fee_broker               AS exit_fee_broker,
        tr.exit_fee_broker_currency      AS exit_fee_broker_currency
      FROM sim_trades tr
      LEFT JOIN users u ON u.clerk_user_id = tr.user_id
      WHERE tr.exit_time >= ${startMs}
        AND tr.exit_time <  ${endMs}
      ORDER BY (
        COALESCE(tr.entry_fee_broker, tr.entry_fee, 0)
        + COALESCE(tr.exit_fee_broker,  tr.exit_fee,  0)
      ) DESC NULLS LAST
    `).then(r => r.rows);

    res.json({
      month,
      trades:    rows,
      count:     rows.length,
      timestamp: Date.now(),
    });
  } catch (err) {
    req.log.error({ err, month }, "GET /admin/fees/month/:month failed");
    res.status(500).json({ error: "Failed to load admin month fee breakdown" });
  }
});

export default router;
