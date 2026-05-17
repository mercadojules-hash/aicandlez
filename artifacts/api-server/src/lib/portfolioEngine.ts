import { getAccountSummary } from "./simulationEngine.js";
import { getUserAccountSummary } from "./userSimRegistry.js";

// ── Config store (in-memory, survives restarts as defaults) ───────────────────

export interface PortfolioConfig {
  maxPositions:         number;   // hard cap on open positions (default 3)
  maxExposurePct:       number;   // max % of portfolio in open positions (default 80)
  maxSinglePositionPct: number;   // max % of portfolio in one position (default 40)
}

let config: PortfolioConfig = {
  maxPositions:         3,
  maxExposurePct:       80,
  maxSinglePositionPct: 40,
};

export function getPortfolioConfig(): PortfolioConfig { return { ...config }; }

export function updatePortfolioConfig(patch: Partial<PortfolioConfig>): PortfolioConfig {
  config = { ...config, ...patch };
  return { ...config };
}

// ── Allocation item ────────────────────────────────────────────────────────────

export interface AllocationItem {
  label:    string;           // "BTC", "ETH", "SOL", or "Cash"
  valueUSD: number;
  pct:      number;
  type:     "position" | "cash";
  pnl?:     number;
  pnlPct?:  number;
  symbol?:  string;
}

// ── Portfolio overview ─────────────────────────────────────────────────────────

export interface PositionView {
  id:               string;
  symbol:           string;
  displayName:      string;
  side:             "BUY" | "SELL";
  quantity:         number;
  entryPrice:       number;
  entryTime:        number;
  sizeUSD:          number;
  currentPrice:     number;
  marketValue:      number;
  unrealizedPnL:    number;
  unrealizedPnLPct: number;
  allocationPct:    number;
  isOversized:      boolean;
}

export interface PortfolioOverview {
  config: PortfolioConfig;
  portfolio: {
    totalValue:        number;
    cashBalance:       number;
    cashPct:           number;
    positionValue:     number;
    exposurePct:       number;
    totalPnL:          number;
    totalPnLPct:       number;
    unrealizedPnL:     number;
    realizedPnL:       number;
    positionCount:     number;
    capacityRemaining: number;
    positionsFull:     boolean;
    exposureBreached:  boolean;
    startingBalance:   number;
  };
  positions:  PositionView[];
  allocation: AllocationItem[];
  fetchedAt:  number;
}

// ── Display name helper ────────────────────────────────────────────────────────

function displayName(symbol: string): string {
  const map: Record<string, string> = { BTCUSD: "BTC", ETHUSD: "ETH", SOLUSD: "SOL" };
  return map[symbol] ?? symbol.replace("USD", "");
}

// ── Build PortfolioOverview from a normalised summary shape ───────────────────
// Both the global simulationEngine and userSimRegistry summaries are mapped
// to this common shape before building the overview.

interface NormalisedSummary {
  equity:          number;
  cashBalance:     number;
  startingBalance: number;
  totalPnL:        number;
  totalPnLPct:     number;
  unrealizedPnL:   number;
  realizedPnL:     number;
  positionCount:   number;
  positions: Array<{
    id:               string;
    symbol:           string;
    side:             "BUY" | "SELL";
    quantity:         number;
    entryPrice:       number;
    entryTime:        number;
    sizeUSD:          number;
    currentPrice?:    number;
    marketValue?:     number;
    unrealizedPnL?:   number;
    unrealizedPnLPct?: number;
  }>;
}

function buildOverview(summary: NormalisedSummary): PortfolioOverview {
  const { equity, cashBalance } = summary;
  const positionValue = equity - cashBalance;
  const cashPct       = equity > 0 ? (cashBalance  / equity) * 100 : 100;
  const exposurePct   = equity > 0 ? (positionValue / equity) * 100 : 0;

  const positions: PositionView[] = summary.positions.map(p => {
    const mktVal   = p.marketValue      ?? p.sizeUSD;
    const uPnL     = p.unrealizedPnL    ?? 0;
    const uPnLPct  = p.unrealizedPnLPct ?? 0;
    const curPrice = p.currentPrice     ?? p.entryPrice;
    const allocPct = equity > 0 ? (mktVal / equity) * 100 : 0;

    return {
      id:               p.id,
      symbol:           p.symbol,
      displayName:      displayName(p.symbol),
      side:             p.side,
      quantity:         p.quantity,
      entryPrice:       p.entryPrice,
      entryTime:        p.entryTime,
      sizeUSD:          p.sizeUSD,
      currentPrice:     parseFloat(curPrice.toFixed(2)),
      marketValue:      parseFloat(mktVal.toFixed(2)),
      unrealizedPnL:    parseFloat(uPnL.toFixed(2)),
      unrealizedPnLPct: parseFloat(uPnLPct.toFixed(3)),
      allocationPct:    parseFloat(allocPct.toFixed(2)),
      isOversized:      allocPct > config.maxSinglePositionPct,
    };
  });

  const allocation: AllocationItem[] = [
    ...positions.map(p => ({
      label:    p.displayName,
      valueUSD: p.marketValue,
      pct:      p.allocationPct,
      type:     "position" as const,
      pnl:      p.unrealizedPnL,
      pnlPct:   p.unrealizedPnLPct,
      symbol:   p.symbol,
    })),
    {
      label:    "Cash",
      valueUSD: parseFloat(cashBalance.toFixed(2)),
      pct:      parseFloat(cashPct.toFixed(2)),
      type:     "cash" as const,
    },
  ];

  return {
    config,
    portfolio: {
      totalValue:        parseFloat(equity.toFixed(2)),
      cashBalance:       parseFloat(cashBalance.toFixed(2)),
      cashPct:           parseFloat(cashPct.toFixed(2)),
      positionValue:     parseFloat(positionValue.toFixed(2)),
      exposurePct:       parseFloat(exposurePct.toFixed(2)),
      totalPnL:          summary.totalPnL,
      totalPnLPct:       summary.totalPnLPct,
      unrealizedPnL:     summary.unrealizedPnL,
      realizedPnL:       summary.realizedPnL,
      positionCount:     summary.positionCount,
      capacityRemaining: Math.max(0, config.maxPositions - summary.positionCount),
      positionsFull:     summary.positionCount >= config.maxPositions,
      exposureBreached:  exposurePct > config.maxExposurePct,
      startingBalance:   summary.startingBalance,
    },
    positions,
    allocation,
    fetchedAt: Date.now(),
  };
}

// ── Main function ──────────────────────────────────────────────────────────────
// When userId is provided the overview is built from the caller's personal
// simulation account (DB-backed, per-user).  Without a userId the legacy global
// simulation engine is used as a fallback (admin / system-level views only).

export async function getPortfolioOverview(userId?: string): Promise<PortfolioOverview> {
  if (userId) {
    const s = await getUserAccountSummary(userId);

    const norm: NormalisedSummary = {
      equity:          s.equity,
      cashBalance:     s.balance,
      startingBalance: s.startBalance,
      totalPnL:        s.totalPnL,
      totalPnLPct:     s.totalPnLPct,
      unrealizedPnL:   s.unrealizedPnL,
      realizedPnL:     s.totalRealized,
      positionCount:   s.positionCount,
      positions:       s.positions,
    };

    return buildOverview(norm);
  }

  // ── Legacy fallback: global simulation engine (unauthenticated paths) ──────
  const summary = await getAccountSummary();

  const norm: NormalisedSummary = {
    equity:          summary.equity,
    cashBalance:     summary.account.cashBalance,
    startingBalance: summary.account.startingBalance,
    totalPnL:        summary.totalPnL,
    totalPnLPct:     summary.totalPnLPct,
    unrealizedPnL:   summary.unrealizedPnL,
    realizedPnL:     summary.account.totalRealized,
    positionCount:   summary.positionCount,
    positions:       summary.positions,
  };

  return buildOverview(norm);
}
