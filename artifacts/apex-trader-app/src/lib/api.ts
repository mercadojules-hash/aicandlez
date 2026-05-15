// ── Apex Trader Mobile — API Client ───────────────────────────────────────────
// All API calls go through the shared api-server at /api.
// Auth is carried via the session cookie (same origin) — no manual token needed.

const BASE = "/api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get:    <T>(path: string)                        => apiFetch<T>(path),
  post:   <T>(path: string, body?: unknown)        => apiFetch<T>(path, { method: "POST",   body: JSON.stringify(body) }),
  put:    <T>(path: string, body?: unknown)        => apiFetch<T>(path, { method: "PUT",    body: JSON.stringify(body) }),
  delete: <T>(path: string)                        => apiFetch<T>(path, { method: "DELETE" }),
};

// ── Response Types ─────────────────────────────────────────────────────────────

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
  level:            string;
  dailyPnL:         number;
  dailyPnLPct:      number;
  tradesUsedToday:  number;
  tradesRemaining:  number;
}

export interface MobileStatus {
  engine:     EngineStatus;
  risk:       RiskStatus;
  lastSignal: unknown;
  lastTrade:  unknown;
  ts:         number;
}

export interface Position {
  id:         string;
  symbol:     string;
  side:       string;
  size:       number;
  entryPrice: number;
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

export interface LiveEligibility {
  eligible:     boolean;
  reason:       "ok" | "requires_subscription" | "requires_consent";
  plan:         string;
  planStatus:   string;
  hasConsented: boolean;
  consentedAt?: string;
}

export interface Subscription {
  plan:        string;
  planStatus:  string;
  stripeCustomerId?:     string;
  stripeSubscriptionId?: string;
  limits:      { liveTrading: boolean; exchanges: number | string; positions: number | string };
  features:    string[];
}

export interface Plan {
  id:            string;
  name:          string;
  price_monthly: number;
  description:   string;
  features:      string[];
  performanceFee?: number;
  limits:        { liveTrading: boolean };
  priceIds:      { monthly?: string; yearly?: string };
}

export interface ConsentStatus {
  hasConsented:    boolean;
  consentVersion:  string;
  consentedAt:     string | null;
}

export interface AuthMe {
  id:    string;
  email: string;
  role:  string;
  plan:  string;
}
