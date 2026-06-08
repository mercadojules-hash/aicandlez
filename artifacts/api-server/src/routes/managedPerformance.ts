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

// ── Strategy-era segmentation ───────────────────────────────────────────────
// June 6, 2026 production exit-engine correction (1h MAX_HOLD era → TP10/SL2/
// Trail5/6h era). A prod audit showed the 1h max-hold force-closed ~55% of
// trades before they could develop, so pre/post-fix performance is materially
// different and MUST NOT be blended. We split closed trades on this boundary
// (exit time) into a "legacy" and "current" era and report each independently
// plus a side-by-side comparison.
const STRATEGY_ERA_BOUNDARY_MS = Date.UTC(2026, 5, 6, 0, 0, 0, 0); // 2026-06-06 00:00 UTC
const STRATEGY_ERA_BOUNDARY_LABEL = "June 6, 2026";

interface EraAccumulator {
  net: number;
  wins: number;
  losses: number;
  grossWin: number;
  grossLoss: number;
  best: number | null;
  worst: number | null;
  count: number;
  reasons: Map<string, { count: number; net: number }>;
}
function newEraAcc(): EraAccumulator {
  return {
    net: 0, wins: 0, losses: 0, grossWin: 0, grossLoss: 0,
    best: null, worst: null, count: 0, reasons: new Map(),
  };
}
function accEra(a: EraAccumulator, pnl: number, reason: string): void {
  a.count++;
  a.net += pnl;
  if (pnl > 0) {
    a.wins++;
    a.grossWin += pnl;
  } else if (pnl < 0) {
    a.losses++;
    a.grossLoss += Math.abs(pnl);
  }
  if (a.best === null || pnl > a.best) a.best = pnl;
  if (a.worst === null || pnl < a.worst) a.worst = pnl;
  const r = a.reasons.get(reason) ?? { count: 0, net: 0 };
  r.count++;
  r.net += pnl;
  a.reasons.set(reason, r);
}
// ROI per era uses the SAME authoritative baseline as the headline AI-trading
// ROI (allocated ?? paper). There is no per-era capital snapshot, so this is a
// "net relative to current baseline" figure — the truly comparable era metrics
// are net P&L, profit factor, win rate and the avg winner/loser ratios.
// Undefined metrics (no trades, or no winners/losers to average, or PF with no
// losses) return `null` so the client renders a dash — never a fabricated 0,
// per the null=dash invariant. Net P&L of an empty era is a legitimate $0.
function finalizeEra(a: EraAccumulator, baseline: number) {
  const hasTrades = a.count > 0;
  const winRatePct = hasTrades ? (a.wins / a.count) * 100 : null;
  const avgWinner = a.wins > 0 ? a.grossWin / a.wins : null;
  const avgLoser = a.losses > 0 ? a.grossLoss / a.losses : null;
  // grossLoss>0 → real ratio; all winners (no losses) → undefined (dash);
  // all losers (no winners) → 0 (legitimate); no trades → undefined (dash).
  const profitFactor =
    a.grossLoss > 0
      ? a.grossWin / a.grossLoss
      : a.grossWin > 0 || !hasTrades
        ? null
        : 0;
  const roiPct = hasTrades && baseline !== 0 ? (a.net / baseline) * 100 : null;
  const exitReasons = [...a.reasons.entries()]
    .map(([reason, v]) => ({ reason, count: v.count, netPnl: round2(v.net) }))
    .sort((x, y) => y.count - x.count);
  return {
    netProfit: round2(a.net),
    roiPct: roiPct != null ? round2(roiPct) : null,
    winRatePct: winRatePct != null ? round2(winRatePct) : null,
    profitFactor:
      profitFactor != null && Number.isFinite(profitFactor)
        ? round2(profitFactor)
        : null,
    avgWinner: avgWinner != null ? round2(avgWinner) : null,
    avgLoser: avgLoser != null ? round2(avgLoser) : null,
    closedTrades: a.count,
    wins: a.wins,
    losses: a.losses,
    bestTrade: a.best != null ? round2(a.best) : null,
    worstTrade: a.worst != null ? round2(a.worst) : null,
    exitReasons,
  };
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
// Per-connection broker-poll ceiling. `loadBalanceForRow` swallows broker
// ERRORS (returns ok:false) but a broker HANG resolves neither — without this
// bound a single slow/rate-limited exchange would block the entire
// managed-performance response until the client/proxy aborts, blanking the
// whole panel (incl. the virtual KPIs + era stats that need no broker call).
// On timeout we degrade THIS connection to a dashed live block (balanceError)
// while every fast connection + all non-live KPIs still return. Display-only —
// execution / risk / sizing never read this path.
const LIVE_BALANCE_POLL_TIMEOUT_MS = 8_000;

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
      const snap = await Promise.race([
        loadBalanceForRow(userId, row),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), LIVE_BALANCE_POLL_TIMEOUT_MS),
        ),
      ]);
      if (!snap || !snap.ok) {
        if (error == null) error = snap?.error ?? "balance_timeout";
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
          closeReason: simTradesTable.closeReason,
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

      const legacyAcc = newEraAcc();
      const currentAcc = newEraAcc();

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

        // Strategy-era bucket: exit before the June 6, 2026 boundary = legacy
        // (1h max-hold era); on/after = current (TP10/SL2/Trail5/6h era).
        const reason = (r.closeReason ?? "UNKNOWN").toUpperCase();
        if (t < STRATEGY_ERA_BOUNDARY_MS) accEra(legacyAcc, pnl, reason);
        else accEra(currentAcc, pnl, reason);
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
        eras: {
          boundaryMs: STRATEGY_ERA_BOUNDARY_MS,
          boundaryLabel: STRATEGY_ERA_BOUNDARY_LABEL,
          legacy: finalizeEra(legacyAcc, startingAiCapital),
          current: finalizeEra(currentAcc, startingAiCapital),
        },
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
