/**
 * useManagedPerformance — PWA mirror of "AICandlez Managed Performance".
 *
 * Sibling of `artifacts/trading-dashboard/src/hooks/useManagedPerformance.ts`,
 * kept as a separate file because the two apps don't share a UI lib. Both
 * call the same `GET /api/user/managed-performance` endpoint (Category A,
 * AI-trading-only KPIs scoped to the authoritative `ai_allocated_capital`
 * baseline). All requests go through `authFetch` per the cross-origin
 * transport invariant — NOT the cookie-only `api.ts` helper.
 *
 * The PWA only mirrors a compact summary, so this exports the read-only
 * snapshot hook. The full set/edit control lives in the trading-dashboard
 * portal panel.
 */

import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/authFetch";

export interface ManagedPerformanceBaseline {
  startingAiCapital: number;
  allocatedCapital:  number | null;
  source:            "allocated" | "paper-default";
}

export interface ManagedPerformanceWindows {
  today: number;
  week:  number;
  month: number;
}

/**
 * Real, exchange-sourced LIVE account view (mirrors the server `live` block).
 * `null` = unavailable (no healthy live exchange / no declared allocation) and
 * MUST render a dash — never a fabricated number.
 */
export interface ManagedPerformanceLive {
  hasLiveExchange:     boolean;
  exchanges:           string[];
  startingLiveCapital: number | null;
  liveCashBalance:     number | null;
  openTradeValue:      number;
  openLivePositions:   number;
  liveAccountValue:    number | null;
  netLifetimeProfit:   number | null;
  liveRoiPct:          number | null;
  liveExchangeEquity:  number | null;
  balanceError:        string | null;
}

export interface ManagedPerformance {
  baseline:         ManagedPerformanceBaseline;
  currentAiCapital: number;
  netTradingProfit: number;
  netTradingRoiPct: number;
  realizedProfit:   number;
  unrealizedProfit: number;
  windows:          ManagedPerformanceWindows;
  cashAvailable:    number;
  capitalDeployed:  number;
  openTradeValue:   number;
  openPositions:    number;
  closedTrades:     number;
  wins:             number;
  losses:           number;
  winRatePct:       number;
  avgWinner:        number;
  avgLoser:         number;
  profitFactor:     number | null;
  bestTrade:        number | null;
  worstTrade:       number | null;
  live:             ManagedPerformanceLive;
  generatedAt:      number;
}

export const MANAGED_PERFORMANCE_QUERY_KEY = ["managed-performance"] as const;

/**
 * Read-only managed-performance snapshot for the signed-in customer.
 * Mirrors `useRuntimeState` exactly: authFetch, 30s refetch, no retry.
 */
export function useManagedPerformance() {
  return useQuery<ManagedPerformance>({
    queryKey: MANAGED_PERFORMANCE_QUERY_KEY,
    queryFn: async () => {
      const res = await authFetch("/api/user/managed-performance");
      if (!res.ok) {
        throw new Error(`managed-performance ${res.status}`);
      }
      return (await res.json()) as ManagedPerformance;
    },
    refetchInterval:      30_000,
    refetchOnWindowFocus: true,
    staleTime:            10_000,
    retry:                false,
  });
}
