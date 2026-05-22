// API base URL — production lives on api.aicandlez.com (cross-origin) supplied
// via VITE_API_BASE_URL. In dev it falls back to same-origin "/api". NEVER
// rely on relative "/api" in prod — the SPA static host returns index.html
// with status 200 for any /api/* path, which causes silent JSON parse
// failures and misleading "HTTP 200" error messages.
const API_BASE = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? ""
).replace(/\/$/, "") + "/api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(init?.headers ?? {}) },
    credentials: "include",
  });

  const contentType = res.headers.get("content-type") ?? "";
  const isJson      = contentType.includes("application/json");

  if (!res.ok) {
    const body = isJson
      ? (await res.json().catch(() => ({}))) as { error?: string }
      : {};
    if (!isJson) {
      console.error("[api] non-JSON error response", { url, status: res.status, contentType });
      throw new Error(`API endpoint mis-routed (HTTP ${res.status}, got ${contentType || "no content-type"}). VITE_API_BASE_URL may be missing or wrong.`);
    }
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  if (!isJson) {
    console.error("[api] non-JSON success response", { url, contentType });
    throw new Error("API returned non-JSON (likely served by SPA host). VITE_API_BASE_URL may be missing or wrong.");
  }
  return res.json() as Promise<T>;
}

export const api = {
  get:    <T>(path: string)                 => apiFetch<T>(path),
  post:   <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST",   body: JSON.stringify(body) }),
  put:    <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT",    body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) => apiFetch<T>(path, {
    method: "DELETE",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }),
};

export interface EngineStatus {
  running:          boolean;
  autoMode:         boolean;
  mode:             string;
  exchange:         string;
  killSwitch:       boolean;
  paused:           boolean;
  signalsGenerated: number;
  tradesExecuted:   number;
}

export interface RiskStatus {
  level:           string;
  dailyPnL:        number;
  dailyPnLPct:     number;
  tradesUsedToday: number;
  tradesRemaining: number;
}

export interface MobileStatus {
  engine:     EngineStatus;
  risk:       RiskStatus;
  lastSignal: unknown;
  lastTrade:  unknown;
  ts:         number;
}

export interface Position {
  id:            string;
  symbol:        string;
  side:          string;
  size:          number;
  entryPrice:    number;
  currentPrice?: number;
  unrealizedPnL?: number;
}

export interface Portfolio {
  balances:   Record<string, number>;
  positions:  Position[];
  totalValue: number;
  openPnL:    number;
  exchange:   string;
  mode:       string;
}

export interface SignalBreakdown {
  symbol:          string;
  action:          string;
  confidence:      number;
  mtfConfirmed:    boolean;
  volumeConfirmed: boolean;
  marketCondition: string;
  trend1H:         string;
  blockReason:     string | null;
  lastUpdated:     number;
}

export interface MobileSignalsResponse {
  breakdowns:   Record<string, SignalBreakdown>;
  signalFilter: { volumeFilter: boolean; require1HTrend: boolean };
  signals?:     unknown[];
  counts?:      { BUY: number; SELL: number; HOLD: number };
  funnel?:      { total: number; passedMTF: number; executed: number; blocked: number };
  ts?:          number;
}

export interface LiveEligibility {
  eligible:     boolean;
  reason:       "ok" | "requires_subscription" | "requires_consent";
  plan:         string;
  planStatus:   string;
  hasConsented: boolean;
  consentedAt?: string;
}

export interface Subscription {
  plan:                  string;
  planStatus:            string | null;
  stripeCustomerId?:     string;
  stripeSubscriptionId?: string;
  trialEndsAt?:          string | null;
  billingEmail?:         string | null;
  isActive:              boolean;
  isPaid:                boolean;
  isTrialing:            boolean;
  canLiveTrade:          boolean;
  daysUntilTrialEnd:     number | null;
  limits: {
    liveTrading:      boolean;
    exchanges:        number | string;
    positions:        number | string;
    trades:           number | string;
    concurrentTrades?: number;
    aiAutoTrade?:     boolean;
    equitiesAI?:      boolean;
  };
  features:    string[];
}

export interface Plan {
  id:            string;
  name:          string;
  price_monthly: number;
  description:   string;
  features:      string[];
  performanceFee?: number;
  limits: {
    liveTrading:      boolean;
    concurrentTrades?: number;
    aiAutoTrade?:     boolean;
    equitiesAI?:      boolean;
  };
  priceIds:      { monthly?: string; yearly?: string };
}

export interface ConsentStatus {
  hasConsented:   boolean;
  consentVersion: string;
  consentedAt:    string | null;
}

export interface AuthMe {
  id:    string;
  email: string;
  role:  string;
  plan:  string;
}

export interface SimAccount {
  balance:      number;
  totalTrades:  number;
  winRate:      number;
  realizedPnL:  number;
  feesPaid:     number;
}

export interface SimTrade {
  id:               string;
  symbol:           string;
  side:             string;
  pnl:              number;
  pnlPct:           number;
  score?:           number;
  closedAt:         string;
  entryPrice:       number;
  exitPrice:        number;
  exchange?:             string;
  exchangeOrderId?:      string;
  exchangeCloseOrderId?: string;
  entryFee?:             number;
  exitFee?:              number;
  netFees?:              number;
  // Broker-reported commissions (when the exchange surfaced them) —
  // preferred over the catalog estimates above on the trade receipt.
  entryFeeBroker?:         number;
  entryFeeBrokerCurrency?: string;
  exitFeeBroker?:          number;
  exitFeeBrokerCurrency?:  string;
}

export interface MobileTicker {
  symbol:           string;
  short:            string;
  price:            number;
  change24h:        number;
  changePercent24h: number;
  up:               boolean;
}

export interface MobileTickersResponse {
  tickers: MobileTicker[];
  ts:      number;
}

export interface AlpacaHealth {
  configured:     boolean;
  auth:           boolean;
  marketData:     boolean;
  equity:         number;
  buyingPower:    number;
  status:         string;
  accountBlocked: boolean;
  isPaper:        boolean;
}

export interface AlpacaAccount {
  equity:         number;
  cash:           number;
  buyingPower:    number;
  portfolioValue: number;
  isPaper:        boolean;
  status:         string;
  daytradeCount:  number;
  accountBlocked: boolean;
  tradingBlocked: boolean;
}

export interface AlpacaPosition {
  id:           string;
  symbol:       string;
  qty:          number;
  qtyAvail:     number;
  side:         "BUY" | "SELL";
  assetClass:   string;
  entryPrice:   number;
  currentPrice: number;
  pnl:          number;
  pnlPct:       number;
  marketValue:  number;
}

export interface AlpacaOrder {
  id:           string;
  clientId:     string | null;
  symbol:       string;
  side:         "BUY" | "SELL";
  type:         string;
  qty:          number;
  filledQty:    number;
  avgFillPrice: number;
  limitPrice:   number | null;
  status:       string;
  timeInForce:  string;
  submittedAt:  string;
  filledAt:     string | null;
  canceledAt:   string | null;
}

export interface AlpacaActivateResult {
  ok:         boolean;
  exchange:   string;
  isPaper:    boolean;
  equity:     number;
  buyingPower: number;
}
