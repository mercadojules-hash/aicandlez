import { useQuery } from "@tanstack/react-query";
import { authFetch } from "../lib/authFetch";

/* ──────────────────────────────────────────────────────────────────────────
 * useLiveExchangeState
 *
 * Admin-only client for `GET /api/exchange/live-state`. Returns the
 * canonical operator telemetry rollup from `getLiveExchangeState()` in
 * `api-server/src/lib/exchangeEngine.ts`:
 *
 *   - totalEquityUSD (Kraken USD cash + Σ base × mark)
 *   - balances (raw exchange balances)
 *   - markPrices (current ticker per base)
 *   - positions (derived from in-memory _orders ledger, with VWAP entry,
 *     mark, unrealized $ + %)
 *   - filledTotal / filledToday / lastFillAt
 *   - realizedTodayUSD / unrealizedTotalUSD
 *   - queue (ExecutionQueue saturation)
 *
 * Endpoint is `requireOperator`-gated server-side; this hook is meant
 * to be enabled ONLY when `useUserRole().isAdmin === true`. Callers
 * must pass `enabled` accordingly to avoid 403 noise on customer
 * sessions.
 *
 * Poll cadence 5s — matches AdminTopTelemetryBar precedent and is well
 * under Kraken Balance rate-limit budget (the upstream is single-flight
 * coalesced + cached in `fetchLiveBalancesWithMeta`).
 * ──────────────────────────────────────────────────────────────────────── */

export interface LiveExchangePosition {
  symbol:         string;
  netQty:         number;
  avgEntryUSD:    number;
  markPriceUSD:   number;
  unrealizedUSD:  number;
  unrealizedPct:  number;
  buyCount:       number;
  sellCount:      number;
  firstFillAt:    number;
  lastFillAt:     number;
}

export interface LiveExchangeState {
  source:              "live" | "error" | "standby";
  exchange:            string;
  mode:                "simulation" | "live";
  apiConfigured:       boolean;
  liveCapable:         boolean;
  balances:            { USD: number; BTC: number; ETH: number; SOL: number; [k: string]: number };
  markPrices:          Record<string, number>;
  totalEquityUSD:      number;
  positions:           LiveExchangePosition[];
  openPositionsCount:  number;
  filledTotal:         number;
  filledToday:         number;
  lastFillAt:          number | null;
  realizedTodayUSD:    number;
  unrealizedTotalUSD:  number;
  queue: {
    concurrency:  number;
    processing:   number;
    depth:        number;
    completed:    number;
    failed:       number;
    avgLatencyMs: number;
  };
  error?: string;
}

export function useLiveExchangeState(opts: { enabled: boolean }) {
  return useQuery<LiveExchangeState>({
    queryKey: ["exchange-live-state"],
    enabled:  opts.enabled,
    queryFn:  async () => {
      const res = await authFetch("/api/exchange/live-state");
      if (!res.ok) throw new Error(`live-state ${res.status}`);
      return res.json();
    },
    refetchInterval: 5_000,
    staleTime:       4_000,
    retry:           1,
  });
}
