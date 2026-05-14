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

interface TradingCtx {
  engine:    EngineStatus | null;
  account:   AccountState;
  positions: SimPosition[];
  trades:    SimTrade[];
  isLoading: boolean;
  refresh:   () => void;
  apiBase:   string;
}

// ── Defaults ───────────────────────────────────────────────────────────────────

const defaultAccount: AccountState = {
  equity: 103_847.22, cashBalance: 88_432.15, unrealizedPnL: 1_280.44,
  realizedPnL: 3_847.22, totalFeesPaid: 142.88, winRate: 63.2,
  totalTrades: 41, openPositions: 2,
};

const MOCK_POSITIONS: SimPosition[] = [
  {
    id: "p1", symbol: "BTCUSD", side: "BUY", qty: 0.08,
    entryPrice: 67_240, currentPrice: 68_120, pnl: 70.40, pnlPct: 1.31,
    stopLoss: 65_800, takeProfit: 70_000, openedAt: new Date(Date.now()-2.4e6).toISOString(),
  },
  {
    id: "p2", symbol: "ETHUSD", side: "BUY", qty: 1.2,
    entryPrice: 3_480, currentPrice: 3_512, pnl: 38.40, pnlPct: 0.92,
    stopLoss: 3_360, takeProfit: 3_680, openedAt: new Date(Date.now()-8.4e5).toISOString(),
  },
];

const MOCK_TRADES: SimTrade[] = [
  { id:"t1", symbol:"BTCUSD", side:"BUY",  qty:0.05, entryPrice:65_120, exitPrice:66_800, pnl: 84.00, pnlPct:2.58, closedAt:new Date(Date.now()-8.64e7).toISOString(), score:88 },
  { id:"t2", symbol:"ETHUSD", side:"SELL", qty:0.8,  entryPrice:3_620,  exitPrice:3_480,  pnl:112.00, pnlPct:3.87, closedAt:new Date(Date.now()-1.728e8).toISOString(), score:91 },
  { id:"t3", symbol:"SOLUSD", side:"BUY",  qty:4.0,  entryPrice:152.4,  exitPrice:148.2,  pnl:-16.80, pnlPct:-2.76,closedAt:new Date(Date.now()-2.592e8).toISOString(), score:44 },
  { id:"t4", symbol:"BTCUSD", side:"BUY",  qty:0.06, entryPrice:63_800, exitPrice:65_200, pnl: 84.00, pnlPct:2.19, closedAt:new Date(Date.now()-3.456e8).toISOString(), score:78 },
  { id:"t5", symbol:"ETHUSD", side:"BUY",  qty:1.0,  entryPrice:3_310,  exitPrice:3_440,  pnl:130.00, pnlPct:3.93, closedAt:new Date(Date.now()-4.32e8).toISOString(),  score:85 },
];

// ── Context ────────────────────────────────────────────────────────────────────

const Ctx = createContext<TradingCtx>({
  engine: null, account: defaultAccount, positions: MOCK_POSITIONS,
  trades: MOCK_TRADES, isLoading: false, refresh: () => {}, apiBase: "",
});

export function TradingProvider({ children }: { children: React.ReactNode }) {
  const domain  = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  const apiBase = domain ? `https://${domain}` : "";

  const [engine,    setEngine]    = useState<EngineStatus | null>(null);
  const [positions, setPositions] = useState<SimPosition[]>(MOCK_POSITIONS);
  const [isLoading, setIsLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animate mock position PnL to feel live
  const animatePositions = useCallback(() => {
    setPositions(prev => prev.map(p => {
      const delta = (Math.random() - 0.48) * 12;
      const newCurrent = p.currentPrice + delta;
      const newPnl     = (newCurrent - p.entryPrice) * p.qty * (p.side === "BUY" ? 1 : -1);
      const newPnlPct  = ((newCurrent - p.entryPrice) / p.entryPrice) * 100 * (p.side === "BUY" ? 1 : -1);
      return { ...p, currentPrice: newCurrent, pnl: newPnl, pnlPct: newPnlPct };
    }));
  }, []);

  const fetchEngine = useCallback(async () => {
    if (!apiBase) return;
    try {
      const r = await fetch(`${apiBase}/api/engine/status`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) { const d = await r.json(); setEngine(d); }
    } catch { /* silently ignore — use mock state */ }
  }, [apiBase]);

  const refresh = useCallback(() => {
    setIsLoading(true);
    void fetchEngine().finally(() => setIsLoading(false));
    animatePositions();
  }, [fetchEngine, animatePositions]);

  useEffect(() => {
    void fetchEngine();
    animatePositions();
    timer.current = setInterval(() => {
      void fetchEngine();
      animatePositions();
    }, 5000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [fetchEngine, animatePositions]);

  const account: AccountState = {
    ...defaultAccount,
    unrealizedPnL: positions.reduce((s, p) => s + p.pnl, 0),
    openPositions:  positions.length,
  };

  return (
    <Ctx.Provider value={{ engine, account, positions, trades: MOCK_TRADES, isLoading, refresh, apiBase }}>
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
