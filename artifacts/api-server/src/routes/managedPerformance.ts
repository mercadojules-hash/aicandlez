/**
 * GET /api/user/managed-performance — "AICandlez Managed Performance".
 *
 * Customer-facing (ALL users, requireAuth). Reports AI-TRADING-ONLY KPIs scoped
 * to the authoritative `user_settings.ai_allocated_capital` baseline (or the
 * paper starting balance when the user has not declared an allocation). This is
 * deliberately INDEPENDENT of total exchange account value, staked assets,
 * manual crypto purchases, deposits/withdrawals, and passive appreciation —
 * it answers "is AICandlez making me money?".
 *
 * Accounting model (all values derived from real per-user state):
 *   startingAiCapital  = ai_allocated_capital ?? sim_accounts.starting_balance
 *   realizedProfit     = Σ sim_trades.realized_pnl   (paper + live AI trades)
 *   unrealizedProfit   = Σ open sim_positions MTM    (getUserAccountSummary)
 *   capitalDeployed    = Σ open sim_positions.size_usd
 *   openTradeValue     = Σ open sim_positions.market_value (= deployed + unreal)
 *   cashAvailable      = startingAiCapital + realizedProfit − capitalDeployed
 *   currentAiCapital   = startingAiCapital + realizedProfit + unrealizedProfit
 *   netTradingProfit   = realizedProfit + unrealizedProfit
 *   netTradingRoiPct   = netTradingProfit / startingAiCapital × 100
 *
 * LIVE block (`live`): the figures above are scoped to a VIRTUAL baseline and
 * are meaningless for a live exchange customer ("Current AI Capital" = paper
 * $100k + P&L; "Cash Available" = a synthetic AI-only wallet, NOT real broker
 * cash). The `live` block answers the customer's real question — "what is my
 * actual live account worth, and what has AICandlez made me?" — from the SAME
 * broker balance path runtime-state uses (loadBalanceForRow → adapter
 * .getAccount → usdBreakdown), so we never add a parallel balance fetcher:
 *   startingLiveCapital = ai_allocated_capital (NULL until declared — no paper
 *                         fallback; live ROI is undefined without a baseline)
 *   liveCashBalance     = Σ (usdBreakdown.cash + usdBreakdown.stablecoin) over
 *                         live-capable connections (USD + USDC = real cash)
 *   openTradeValue      = Σ market_value of AICandlez-managed LIVE positions
 *                         (sim_positions.exchange IS NOT NULL)
 *   liveAccountValue    = liveCashBalance + openTradeValue
 *   netLifetimeProfit   = liveAccountValue − startingLiveCapital
 *   liveRoiPct          = netLifetimeProfit / startingLiveCapital × 100
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  simTradesTable,
  userSettingsTable,
  simAccountsTable,
  userExchangeConnectionsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getUserAccountSummary } from "../lib/userSimRegistry.js";
import { loadBalanceForRow } from "./userExchanges.js";

type AuthReq = Request & { clerkUserId: string };
const router: IRouter = Router();

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Short TTL cache for the live-balance aggregation. The portal mounts this
// panel AND runtime-state simultaneously (both poll ~30s) and the PWA mirrors
// it too, so without a cache a live customer would trigger 2-3 broker
// getAccount() round-trips per 30s on the shared key. Display-only — execution,
// risk and sizing never read this; a few seconds of staleness is harmless.
interface LiveBalanceAgg {
  /** Count of connections with status "active" — i.e. the user HAS a live
   *  exchange, independent of whether this poll succeeded. Drives the
   *  live-vs-virtual UI gate so a transient broker outage never silently
   *  reverts a connected customer to the misleading virtual AI KPIs. */
  activeConnCount: number;
  cashSum:   number;
  haveCash:  boolean;
  equitySum: number;
  /** Connections whose balance poll SUCCEEDED this cycle. */
  exchanges: string[];
  error:     string | null;
}
const liveBalanceCache = new Map<string, { at: number; agg: LiveBalanceAgg }>();
const LIVE_BALANCE_TTL_MS = 20_000;

async function loadLiveBalanceAgg(userId: string): Promise<LiveBalanceAgg> {
  const cached = liveBalanceCache.get(userId);
  if (cached && Date.now() - cached.at < LIVE_BALANCE_TTL_MS) return cached.agg;

  const connRows = await db
    .select()
    .from(userExchangeConnectionsTable)
    .where(eq(userExchangeConnectionsTable.userId, userId));

  let cashSum = 0;
  let haveCash = false;
  let equitySum = 0;
  let activeConnCount = 0;
  const exchanges: string[] = [];
  let error: string | null = null;

  // A live-capable connection = status "active" with a successful balance poll.
  // We deliberately do NOT replicate the runtime execution resolution
  // (subscription / ARM / parallel / paper opt-out) — this is read-only
  // telemetry of the customer's real exchange cash, independent of which
  // runtime mode the engine is currently in.
  await Promise.all(
    connRows.map(async (row) => {
      if (row.status !== "active") return;
      activeConnCount++;
      const snap = await loadBalanceForRow(userId, row);
      if (!snap.ok) {
        if (error == null) error = snap.error ?? "balance_unavailable";
        return;
      }
      exchanges.push(row.exchange);
      equitySum += Number.isFinite(snap.totalEquityUSD) ? snap.totalEquityUSD : 0;
      if (snap.usdBreakdown) {
        const cash =
          (snap.usdBreakdown.cash ?? 0) + (snap.usdBreakdown.stablecoin ?? 0);
        if (Number.isFinite(cash)) {
          cashSum += cash;
          haveCash = true;
        }
      }
    }),
  );

  const agg: LiveBalanceAgg = {
    activeConnCount, cashSum, haveCash, equitySum, exchanges, error,
  };
  liveBalanceCache.set(userId, { at: Date.now(), agg });
  return agg;
}

router.get(
  "/user/managed-performance",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthReq).clerkUserId;
    try {
      // ── Baseline ──────────────────────────────────────────────────────────
      const [settings] = await db
        .select({ allocated: userSettingsTable.aiAllocatedCapital })
        .from(userSettingsTable)
        .where(eq(userSettingsTable.userId, userId))
        .limit(1);
      const allocatedCapital = settings?.allocated ?? null;

      const [acct] = await db
        .select({ startingBalance: simAccountsTable.startingBalance })
        .from(simAccountsTable)
        .where(eq(simAccountsTable.userId, userId))
        .limit(1);
      const paperBaseline = acct?.startingBalance ?? 100000;

      const baselineSource: "allocated" | "paper-default" =
        allocatedCapital != null ? "allocated" : "paper-default";
      const startingAiCapital =
        allocatedCapital != null ? allocatedCapital : paperBaseline;

      // ── Open-position MTM (canonical per-user SoT) ────────────────────────
      const summary = await getUserAccountSummary(userId);
      const unrealizedProfit = summary.unrealizedPnL ?? 0;
      const openPositions = summary.positionCount ?? 0;
      const capitalDeployed = summary.positions.reduce(
        (s, p) => s + (p.sizeUSD ?? 0),
        0,
      );
      const openTradeValue = summary.positions.reduce(
        (s, p) => s + (p.marketValue ?? p.sizeUSD ?? 0),
        0,
      );

      // ── Closed-trade stats (paper + live AI trades) ───────────────────────
      // Trust only ordinary rows: `reconciliation_tag IS NULL`. Operator
      // reconciliation artifacts (e.g. RECONCILED_BACKLOG) are tagged and MUST
      // be excluded from the realized ledger or they distort the headline P&L,
      // ROI, win-rate and profit-factor. Paper trades have `exchange = NULL`
      // but a NULL tag, so they remain included (this is a paper+live view).
      const rows = await db
        .select({
          realizedPnL: simTradesTable.realizedPnL,
          exitTime: simTradesTable.exitTime,
        })
        .from(simTradesTable)
        .where(
          and(
            eq(simTradesTable.userId, userId),
            isNull(simTradesTable.reconciliationTag),
          ),
        );

      const now = Date.now();
      const startToday = (() => {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        return d.getTime();
      })();
      const weekAgo = now - 7 * 24 * 3600 * 1000;
      const monthAgo = now - 30 * 24 * 3600 * 1000;

      let realizedProfit = 0;
      let wins = 0;
      let losses = 0;
      let grossWin = 0;
      let grossLoss = 0;
      let bestTrade: number | null = null;
      let worstTrade: number | null = null;
      let todayPnL = 0;
      let weekPnL = 0;
      let monthPnL = 0;

      for (const r of rows) {
        const pnl = r.realizedPnL ?? 0;
        realizedProfit += pnl;
        if (pnl > 0) {
          wins++;
          grossWin += pnl;
        } else if (pnl < 0) {
          losses++;
          grossLoss += Math.abs(pnl);
        }
        if (bestTrade === null || pnl > bestTrade) bestTrade = pnl;
        if (worstTrade === null || pnl < worstTrade) worstTrade = pnl;
        const t = r.exitTime ?? 0;
        if (t >= startToday) todayPnL += pnl;
        if (t >= weekAgo) weekPnL += pnl;
        if (t >= monthAgo) monthPnL += pnl;
      }

      const closedTrades = rows.length;
      const winRatePct = closedTrades > 0 ? (wins / closedTrades) * 100 : 0;
      const avgWinner = wins > 0 ? grossWin / wins : 0;
      const avgLoser = losses > 0 ? grossLoss / losses : 0;
      const profitFactor =
        grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

      // ── AICandlez-only accounting (exchange-independent) ──────────────────
      const cashAvailable =
        startingAiCapital + realizedProfit - capitalDeployed;
      const currentAiCapital =
        startingAiCapital + realizedProfit + unrealizedProfit;
      const netTradingProfit = realizedProfit + unrealizedProfit;
      const netTradingRoiPct =
        startingAiCapital !== 0
          ? (netTradingProfit / startingAiCapital) * 100
          : 0;

      // ── LIVE ACCOUNT (real broker-sourced) ────────────────────────────────
      // Real exchange cash + market value of AICandlez-managed LIVE positions.
      // Starting capital here is the DECLARED allocation only (no paper
      // fallback) — live ROI is undefined until the customer declares it.
      const liveAgg = await loadLiveBalanceAgg(userId);
      // Gate the live-vs-virtual UI on whether the user HAS an active live
      // connection — NOT on whether this poll succeeded. On a transient broker
      // outage the live section stays active and renders dashes + an error
      // banner; we never silently fall back to the misleading virtual KPIs for
      // a connected live customer.
      const hasLiveExchange = liveAgg.activeConnCount > 0;
      // Surface the error whenever a poll failed (full OR partial coverage),
      // even if at least one exchange succeeded.
      const balanceError = liveAgg.error;
      const liveOpenPositionsArr = summary.positions.filter(
        (p) => p.exchange != null,
      );
      const liveOpenTradeValue = liveOpenPositionsArr.reduce(
        (s, p) => s + (p.marketValue ?? p.sizeUSD ?? 0),
        0,
      );
      const startingLiveCapital = allocatedCapital; // NULL until declared
      const liveCashBalance = liveAgg.haveCash ? liveAgg.cashSum : null;
      const liveAccountValue =
        liveCashBalance != null ? liveCashBalance + liveOpenTradeValue : null;
      const netLifetimeProfit =
        liveAccountValue != null && startingLiveCapital != null
          ? liveAccountValue - startingLiveCapital
          : null;
      const liveRoiPct =
        netLifetimeProfit != null &&
        startingLiveCapital != null &&
        startingLiveCapital !== 0
          ? (netLifetimeProfit / startingLiveCapital) * 100
          : null;

      res.json({
        baseline: {
          startingAiCapital: round2(startingAiCapital),
          allocatedCapital:
            allocatedCapital != null ? round2(allocatedCapital) : null,
          source: baselineSource,
        },
        currentAiCapital: round2(currentAiCapital),
        netTradingProfit: round2(netTradingProfit),
        netTradingRoiPct: round2(netTradingRoiPct),
        realizedProfit: round2(realizedProfit),
        unrealizedProfit: round2(unrealizedProfit),
        windows: {
          today: round2(todayPnL),
          week: round2(weekPnL),
          month: round2(monthPnL),
        },
        cashAvailable: round2(cashAvailable),
        capitalDeployed: round2(capitalDeployed),
        openTradeValue: round2(openTradeValue),
        openPositions,
        closedTrades,
        wins,
        losses,
        winRatePct: round2(winRatePct),
        avgWinner: round2(avgWinner),
        avgLoser: round2(avgLoser),
        profitFactor: Number.isFinite(profitFactor)
          ? round2(profitFactor)
          : null,
        bestTrade: bestTrade != null ? round2(bestTrade) : null,
        worstTrade: worstTrade != null ? round2(worstTrade) : null,
        live: {
          hasLiveExchange,
          exchanges: liveAgg.exchanges,
          startingLiveCapital:
            startingLiveCapital != null ? round2(startingLiveCapital) : null,
          liveCashBalance:
            liveCashBalance != null ? round2(liveCashBalance) : null,
          openTradeValue: round2(liveOpenTradeValue),
          openLivePositions: liveOpenPositionsArr.length,
          liveAccountValue:
            liveAccountValue != null ? round2(liveAccountValue) : null,
          netLifetimeProfit:
            netLifetimeProfit != null ? round2(netLifetimeProfit) : null,
          liveRoiPct: liveRoiPct != null ? round2(liveRoiPct) : null,
          liveExchangeEquity:
            liveAgg.exchanges.length > 0 ? round2(liveAgg.equitySum) : null,
          balanceError,
        },
        generatedAt: now,
      });
    } catch (err) {
      req.log.error({ err, userId }, "GET /user/managed-performance failed");
      res.status(500).json({ error: "managed_performance_failed" });
    }
  },
);

export default router;
