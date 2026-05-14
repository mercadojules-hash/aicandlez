import React, {
  createContext, useContext, useState, useEffect, useRef, useCallback,
} from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SimPosition {
  id: string; symbol: string; side: "BUY" | "SELL"; qty: number;
  entryPrice: number; currentPrice: number; pnl: number; pnlPct: number;
  stopLoss: number; takeProfit: number; openedAt: string;
}

export interface SimTrade {
  id: string; symbol: string; side: "BUY" | "SELL"; qty: number;
  entryPrice: number; exitPrice: number; pnl: number; pnlPct: number;
  closedAt: string; score?: number;
}

export interface EngineStatus {
  running: boolean; mode: "SIMULATION" | "LIVE"; exchange: string;
  confidence?: number; signalCount?: number; activeSymbol?: string;
  volumeFilter?: boolean; require1HTrend?: boolean;
  symbolBreakdowns?: Array<{
    symbol: string; signal: "BUY" | "SELL" | "HOLD"; confidence: number;
    price?: number; change24h?: number; volumeConfirmed?: boolean;
  }>;
  recentSignalLog?: Array<{
    id: string; timestamp: string; symbol: string;
    action: "BUY" | "SELL" | "HOLD"; confidence: number; reason?: string;
  }>;
}

export interface AccountState {
  equity: number; cashBalance: number; unrealizedPnL: number;
  realizedPnL: number; totalFeesPaid: number; winRate: number;
  totalTrades: number; openPositions: number;
}

export interface AlpacaAccountData {
  equity:         number;
  cash:           number;
  buyingPower:    number;
  portfolioValue: number;
  isPaper:        boolean;
  status:         string;
  tradingBlocked: boolean;
}

export interface AlpacaPositionData {
  id:           string;
  symbol:       string;
  qty:          number;
  side:         "BUY" | "SELL";
  entryPrice:   number;
  currentPrice: number;
  pnl:          number;
  pnlPct:       number;
  marketValue:  number;
  assetClass:   string;
}

export interface AlpacaOrderData {
  id:           string;
  symbol:       string;
  side:         "BUY" | "SELL";
  type:         string;
  qty:          number;
  filledQty:    number;
  avgFillPrice: number;
  status:       string;
  submittedAt:  string;
  filledAt:     string | null;
}

interface TradingCtx {
  engine:          EngineStatus | null;
  account:         AccountState;
  positions:       SimPosition[];
  trades:          SimTrade[];
  isLoading:       boolean;
  refresh:         () => void;
  apiBase:         string;
  alpacaAccount:   AlpacaAccountData | null;
  alpacaPositions: AlpacaPositionData[];
  alpacaOrders:    AlpacaOrderData[];
  placeAlpacaOrder: (params: AlpacaOrderRequest) => Promise<AlpacaOrderData>;
}

export interface AlpacaOrderRequest {
  symbol:      string;
  side:        "buy" | "sell";
  qty?:        number;
  notional?:   number;
  type?:       "market" | "limit";
  limitPrice?: number;
}

// ── Defaults / Mocks ───────────────────────────────────────────────────────────

const defaultAccount: AccountState = {
  equity: 100_000, cashBalance: 100_000, unrealizedPnL: 0,
  realizedPnL: 0, totalFeesPaid: 0, winRate: 0,
  totalTrades: 0, openPositions: 0,
};

// ── Context ────────────────────────────────────────────────────────────────────

const Ctx = createContext<TradingCtx>({
  engine: null, account: defaultAccount, positions: [], trades: [],
  isLoading: false, refresh: () => {}, apiBase: "",
  alpacaAccount: null, alpacaPositions: [], alpacaOrders: [],
  placeAlpacaOrder: async () => { throw new Error("not ready"); },
});

export function TradingProvider({ children }: { children: React.ReactNode }) {
  const domain  = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  const apiBase = domain ? `https://${domain}` : "";

  const [engine,          setEngine]          = useState<EngineStatus | null>(null);
  const [alpacaAccount,   setAlpacaAccount]   = useState<AlpacaAccountData | null>(null);
  const [alpacaPositions, setAlpacaPositions] = useState<AlpacaPositionData[]>([]);
  const [alpacaOrders,    setAlpacaOrders]    = useState<AlpacaOrderData[]>([]);
  const [isLoading,       setIsLoading]       = useState(false);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch engine status ───────────────────────────────────────────────────
  const fetchEngine = useCallback(async () => {
    if (!apiBase) return;
    try {
      const r = await fetch(`${apiBase}/api/engine/status`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) { const d = await r.json() as EngineStatus; setEngine(d); }
    } catch { /* ignore — offline */ }
  }, [apiBase]);

  // ── Fetch Alpaca paper account ────────────────────────────────────────────
  const fetchAlpacaAccount = useCallback(async () => {
    if (!apiBase) return;
    try {
      const r = await fetch(`${apiBase}/api/exchange/alpaca/account`, { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const d = await r.json() as AlpacaAccountData;
        setAlpacaAccount(d);
      }
    } catch { /* ignore — show cached or fallback */ }
  }, [apiBase]);

  // ── Fetch Alpaca paper positions ──────────────────────────────────────────
  const fetchAlpacaPositions = useCallback(async () => {
    if (!apiBase) return;
    try {
      const r = await fetch(`${apiBase}/api/exchange/alpaca/positions`, { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const d = await r.json() as AlpacaPositionData[];
        setAlpacaPositions(d);
      }
    } catch { /* ignore */ }
  }, [apiBase]);

  // ── Fetch Alpaca paper orders ─────────────────────────────────────────────
  const fetchAlpacaOrders = useCallback(async () => {
    if (!apiBase) return;
    try {
      const r = await fetch(
        `${apiBase}/api/exchange/alpaca/orders?status=all&limit=50`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (r.ok) {
        const d = await r.json() as AlpacaOrderData[];
        setAlpacaOrders(d);
      }
    } catch { /* ignore */ }
  }, [apiBase]);

  // ── Place Alpaca paper order ──────────────────────────────────────────────
  const placeAlpacaOrder = useCallback(async (params: AlpacaOrderRequest): Promise<AlpacaOrderData> => {
    if (!apiBase) throw new Error("API not available");
    const r = await fetch(`${apiBase}/api/exchange/alpaca/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      const err = await r.json() as { error: string };
      throw new Error(err.error ?? `HTTP ${r.status}`);
    }
    const order = await r.json() as AlpacaOrderData;
    void fetchAlpacaPositions();
    void fetchAlpacaAccount();
    void fetchAlpacaOrders();
    return order;
  }, [apiBase, fetchAlpacaAccount, fetchAlpacaPositions, fetchAlpacaOrders]);

  // ── Full refresh ──────────────────────────────────────────────────────────
  const refresh = useCallback(() => {
    setIsLoading(true);
    Promise.all([
      fetchEngine(),
      fetchAlpacaAccount(),
      fetchAlpacaPositions(),
      fetchAlpacaOrders(),
    ]).finally(() => setIsLoading(false));
  }, [fetchEngine, fetchAlpacaAccount, fetchAlpacaPositions, fetchAlpacaOrders]);

  // ── Polling ───────────────────────────────────────────────────────────────
  useEffect(() => {
    void fetchEngine();
    void fetchAlpacaAccount();
    void fetchAlpacaPositions();
    void fetchAlpacaOrders();

    timer.current = setInterval(() => {
      void fetchEngine();
      void fetchAlpacaAccount();
      void fetchAlpacaPositions();
    }, 8000);

    return () => { if (timer.current) clearInterval(timer.current); };
  }, [fetchEngine, fetchAlpacaAccount, fetchAlpacaPositions, fetchAlpacaOrders]);

  // ── Derive AccountState from real Alpaca data ─────────────────────────────
  const unrealPnL = alpacaPositions.reduce((s, p) => s + p.pnl, 0);

  const account: AccountState = alpacaAccount
    ? {
        equity:        alpacaAccount.equity,
        cashBalance:   alpacaAccount.cash,
        unrealizedPnL: unrealPnL,
        realizedPnL:   alpacaAccount.equity - 100_000 - unrealPnL,
        totalFeesPaid: 0,
        winRate: alpacaOrders.length > 0
          ? Math.round(
              (alpacaOrders.filter(o => o.status === "filled").length / alpacaOrders.length) * 100 * 10
            ) / 10
          : 0,
        totalTrades:   alpacaOrders.filter(o => o.status === "filled").length,
        openPositions:  alpacaPositions.length,
      }
    : { ...defaultAccount, unrealizedPnL: unrealPnL, openPositions: alpacaPositions.length };

  // ── Convert Alpaca positions → SimPosition shape ──────────────────────────
  const positions: SimPosition[] = alpacaPositions.map(p => ({
    id:           p.id,
    symbol:       p.symbol,
    side:         p.side,
    qty:          p.qty,
    entryPrice:   p.entryPrice,
    currentPrice: p.currentPrice,
    pnl:          p.pnl,
    pnlPct:       p.pnlPct,
    stopLoss:     p.entryPrice * 0.97,
    takeProfit:   p.entryPrice * 1.05,
    openedAt:     new Date().toISOString(),
  }));

  // ── Convert filled Alpaca orders → SimTrade shape ─────────────────────────
  const trades: SimTrade[] = alpacaOrders
    .filter(o => o.status === "filled" && o.avgFillPrice > 0)
    .map(o => ({
      id:         o.id,
      symbol:     o.symbol,
      side:       o.side,
      qty:        o.filledQty,
      entryPrice: o.avgFillPrice,
      exitPrice:  o.avgFillPrice,
      pnl:        0,
      pnlPct:     0,
      closedAt:   o.filledAt ?? o.submittedAt,
    }));

  return (
    <Ctx.Provider value={{
      engine, account, positions, trades, isLoading, refresh, apiBase,
      alpacaAccount, alpacaPositions, alpacaOrders, placeAlpacaOrder,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useTrading = () => useContext(Ctx);

// ── Formatters (exported for screens) ────────────────────────────────────────

export function fmt$(n: number, dec = 2): string {
  const abs = Math.abs(n);
  const s   = abs >= 1e6 ? `$${(abs/1e6).toFixed(2)}M`
    : abs >= 1e3   ? `$${(abs/1e3).toFixed(1)}K`
    : `$${abs.toFixed(dec)}`;
  return n < 0 ? `-${s}` : s;
}

export function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function fmtAge(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60)   return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s/60)}m ago`;
  return `${Math.round(s/3600)}h ago`;
}
