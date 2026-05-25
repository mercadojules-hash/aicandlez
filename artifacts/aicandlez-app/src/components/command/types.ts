export interface Candle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

export interface ChartPt {
  label: string; close: number; volume: number; ema9: number | null; ema21: number | null;
}

export interface TFSnap {
  decision:    string;
  confidence:  number;
  rsi:         number;
  ema9:        number;
  ema21:       number;
  emaSignal:   string;
  macdLine:    number;
  macdSignal:  number;
  macdState:   string;
  shortSummary: string;
}

export interface SymBreakdown {
  symbol:          string;
  fast:            TFSnap;
  slow:            TFSnap;
  mtfConfirmed:    boolean;
  agreedAction:    string;
  /** EXECUTION confidence — 80% live floor, riskGate, KrakenAdapter read this. NEVER display directly. */
  avgConfidence:   number;
  /** Pass E3 — DISPLAY-ONLY context-enriched conviction. Optional for backward
   *  compatibility (fallback to `avgConfidence`). Render layer reads this. */
  displayConfidence?: number;
  blockReason:     string;
  lastUpdated:     number;
  volumeConfirmed: boolean;
  marketCondition: string;
  trend1H:         string;
}

export interface SignalLogEntry {
  id:           string;
  symbol:       string;
  timeframe:    string;
  decision:     string;
  confidence:   number;
  shortSummary: string;
  blockReason:  string | null;
  executedAs:   string | null;
  timestamp:    number;
}

export interface EngineStatus {
  running:           boolean;
  testMode:          boolean;
  killSwitch?:       boolean;
  startedAt:         number;
  lastTickAt:        number | null;
  lastSignalAt:      number | null;
  lastTradeAt:       number | null;
  signalsGenerated:  number;
  tradesExecuted:    number;
  tradesBlocked:     number;
  mtfConfirmedCount: number;
  mtfBlockCount:     number;
  trailingStopHits:  number;
  correlationBlocks: number;
  require1HTrend:    boolean;
  volumeFilter:      boolean;
  loopIntervalMs:    number;
  signalCounts:      { BUY: number; SELL: number; HOLD: number };
  funnel:            { total: number; passedMTF: number; blockedMTF: number; executed: number };
  symbolBreakdowns:  Record<string, SymBreakdown>;
  recentSignalLog:   SignalLogEntry[];
  lastSignal:        { symbol: string; timeframe: string; action: string; confidence: number; price?: number } | null;
  lastTrade:         { symbol: string; side: string; sizeUSD: number; price: number; reason: string } | null;
  recentErrors:      string[];
}

export interface AppSettings {
  allocation:       number;
  maxTradesPerDay:  number;
  minConfidence:    number;
  autoMode:         boolean;
  stopLossPercent:  number;
  takeProfitPercent: number;
}

export interface Trade {
  id:          string;
  symbol:      string;
  side:        string;
  amount:      number;
  price:       number;
  exitPrice:   number | null;
  pnl:         number | null;
  pnlPercent:  number | null;
  status:      string;
  mode:        string;
  signalId:    string | null;
  stopLoss:    number | null;
  takeProfit:  number | null;
  reason:      string | null;
  timestamp:   string;
  closedAt:    string | null;
}

export interface ExchangeStatus {
  mode:         string;
  killSwitch:   boolean;
  paused:       boolean;
  liveCapable:  boolean;
  apiConfigured: boolean;
  liveEnabled:  boolean;
  ordersToday:  number;
  lastOrderAt:  number | null;
  simBalances:  { USD: number; BTC: number; ETH: number; SOL: number };
  exchangeName: string;
}

export interface LiveBalance {
  source:    "live" | "simulation" | "error";
  balances:  {
    USD: number;
    BTC: number;
    ETH: number;
    SOL: number;
  };
  exchange?: string;
  error?:    string;
}

export interface FeeSummary {
  totalFeesCollected: number;
  tradeCount:         number;
  feeRatePct:         number;
  recentFees: Array<{ id: string; symbol: string; side: string; feeUSD: number; timestamp: number }>;
}

export const SYMBOL_COLOR: Record<string, string> = {
  BTCUSD:  "#F7931A",
  ETHUSD:  "#627EEA",
  SOLUSD:  "#9945FF",
  XRPUSD:  "#00AAE4",
  DOGEUSD: "#C2A633",
  AVAXUSD: "#E84142",
  LINKUSD: "#2A5ADA",
  ADAUSD:  "#0033AD",
};

export const ASSETS = [
  { symbol: "BTCUSD",  label: "BTC",  color: SYMBOL_COLOR.BTCUSD  },
  { symbol: "ETHUSD",  label: "ETH",  color: SYMBOL_COLOR.ETHUSD  },
  { symbol: "SOLUSD",  label: "SOL",  color: SYMBOL_COLOR.SOLUSD  },
  { symbol: "XRPUSD",  label: "XRP",  color: SYMBOL_COLOR.XRPUSD  },
  { symbol: "DOGEUSD", label: "DOGE", color: SYMBOL_COLOR.DOGEUSD },
  { symbol: "AVAXUSD", label: "AVAX", color: SYMBOL_COLOR.AVAXUSD },
  { symbol: "LINKUSD", label: "LINK", color: SYMBOL_COLOR.LINKUSD },
  { symbol: "ADAUSD",  label: "ADA",  color: SYMBOL_COLOR.ADAUSD  },
];

export interface SimPosition {
  id:               string;
  symbol:           string;
  side:             string;
  quantity:         number;
  entryPrice:       number;
  entryTime:        number;
  sizeUSD:          number;
  currentPrice:     number;
  unrealizedPnL:    number;
  unrealizedPnLPct: number;
  marketValue:      number;
}

export interface SimAccount {
  account: {
    startingBalance: number;
    cashBalance:     number;
    totalRealized:   number;
    totalTrades:     number;
  };
  equity:        number;
  totalPnL:      number;
  totalPnLPct:   number;
  unrealizedPnL: number;
  positionCount: number;
  positions:     SimPosition[];
}
