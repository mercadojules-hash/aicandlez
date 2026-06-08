/**
 * useManagedPerformance — "AICandlez Managed Performance" (Category A).
 *
 * AI-trading-only KPIs scoped to the authoritative
 * `user_settings.ai_allocated_capital` baseline (or the paper starting
 * balance when no allocation is declared). Visible to ALL roles — this is
 * the customer-facing headline performance surface.
 *
 * Transport: every call goes through the artifact's `authFetch` per the
 * locked cross-origin invariant (see `lib/authFetch.ts`). There are NO
 * generated hooks for these endpoints — they are hand-rolled Express
 * routers consumed via `authFetch` + manual `@tanstack/react-query`,
 * following the existing `useRuntimeState.ts` pattern exactly.
 *
 * Endpoints:
 *   GET  /api/user/managed-performance  — full KPI snapshot
 *   GET  /api/user/ai-capital           — current allocation baseline
 *   PUT  /api/user/ai-capital           — set/edit allocation baseline
 */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "../lib/authFetch";

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
 * Real, exchange-sourced LIVE account view. Unlike the AI-only virtual
 * figures (currentAiCapital / cashAvailable), every value here is derived
 * from the customer's actual broker balance + their AICandlez-managed live
 * positions. `null` = unavailable (no healthy live exchange, or no declared
 * allocation baseline) and MUST render a dash — never a fabricated number.
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

/** One bucket of the exit-reason distribution within a strategy era. */
export interface EraExitReason {
  reason: string;
  count:  number;
  netPnl: number;
}

/**
 * Performance stats for one strategy era (legacy vs current), split on the
 * June 6, 2026 production exit-engine correction. The 1h-max-hold era and the
 * TP10/SL2/Trail5/6h era are materially different and reported separately so
 * pre/post-fix performance is never blended.
 */
export interface EraStats {
  netProfit:    number;
  roiPct:       number | null;
  winRatePct:   number | null;
  profitFactor: number | null;
  avgWinner:    number | null;
  avgLoser:     number | null;
  closedTrades: number;
  wins:         number;
  losses:       number;
  bestTrade:    number | null;
  worstTrade:   number | null;
  exitReasons:  EraExitReason[];
}

export interface ManagedPerformanceEras {
  boundaryMs:    number;
  boundaryLabel: string;
  legacy:        EraStats;
  current:       EraStats;
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
  eras:             ManagedPerformanceEras;
  live:             ManagedPerformanceLive;
  generatedAt:      number;
}

export interface AiCapital {
  aiAllocatedCapital: number | null;
}

export const MANAGED_PERFORMANCE_QUERY_KEY = ["managed-performance"] as const;
export const AI_CAPITAL_QUERY_KEY = ["ai-capital"] as const;

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
    // A live customer's snapshot includes a real broker-balance poll; a single
    // slow cycle should self-heal, not blank the headline surface. Two quick
    // retries absorb a transient blip before the panel surfaces any banner, and
    // React Query keeps the last-good `data` across a failed background refetch
    // so the panel keeps rendering real numbers (the banner is gated on `!data`).
    retry:                2,
  });
}

/**
 * Read the current AI Allocated Capital baseline. `null` = not declared
 * (the managed-performance endpoint then falls back to the paper baseline).
 */
export function useAiCapital() {
  return useQuery<AiCapital>({
    queryKey: AI_CAPITAL_QUERY_KEY,
    queryFn: async () => {
      const res = await authFetch("/api/user/ai-capital");
      if (!res.ok) {
        throw new Error(`ai-capital ${res.status}`);
      }
      return (await res.json()) as AiCapital;
    },
    refetchInterval:      30_000,
    refetchOnWindowFocus: true,
    staleTime:            10_000,
    retry:                false,
  });
}

/**
 * Persist a new AI Allocated Capital baseline. On settle, invalidate both
 * the managed-performance and ai-capital query keys so every dependent KPI
 * re-derives from the new baseline.
 */
export function useSetAiCapital() {
  const qc = useQueryClient();
  const mutation = useMutation<AiCapital, Error, number>({
    mutationFn: async (amount) => {
      const res = await authFetch("/api/user/ai-capital", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ amount }),
      });
      if (!res.ok) {
        throw new Error(`PUT user/ai-capital ${res.status}`);
      }
      return (await res.json()) as AiCapital;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: AI_CAPITAL_QUERY_KEY });
      qc.invalidateQueries({ queryKey: MANAGED_PERFORMANCE_QUERY_KEY });
    },
  });

  const setAiCapital = useCallback(
    (amount: number) => mutation.mutateAsync(amount),
    [mutation],
  );
  return { setAiCapital, isPending: mutation.isPending, error: mutation.error };
}
