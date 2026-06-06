/**
 * usePlatformTelemetry — ADMIN-only Platform Resource & Billing Telemetry hooks.
 *
 * Reads the hand-rolled Express admin telemetry endpoints via `authFetch`
 * (the LOCKED cross-origin transport invariant — never bare `fetch`). These
 * endpoints are NOT in openapi.yaml and have NO generated hooks; follow the
 * `useRuntimeState.ts` pattern exactly (authFetch + @tanstack/react-query).
 *
 * Gating: every endpoint is `requireRole(["admin","super-admin"])` on the
 * server. The consuming `<SystemTelemetryPanel>` ALSO gates on `useUserRole()`
 * (`isAdmin`) as defense-in-depth, and the route is `ProtectedAdmin`.
 *
 * Endpoints:
 *   GET /api/admin/system-resources  — real prod resource snapshot (~10s poll)
 *   GET /api/admin/cost-config       — manual "Estimate Only" monthly costs
 *   PUT /api/admin/cost-config       — upsert the manual estimate
 *   GET /api/admin/usage-history     — daily usage + cost trend rows
 */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "../lib/authFetch";

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror the server contracts (see .local/session_plan.md).
// ─────────────────────────────────────────────────────────────────────────────

export interface SystemResources {
  process: {
    uptimeSeconds:       number;
    nodeUptimeSeconds:   number;
    cpuPct:              number;
    cpuCores:            number;
    memory: {
      rssBytes:       number;
      heapUsedBytes:  number;
      heapTotalBytes: number;
      externalBytes:  number;
    };
    systemTotalMemBytes: number;
    systemFreeMemBytes:  number;
    loadAvg1m:           number | null;
  };
  database: { sizeBytes: number | null };
  engine: {
    running:          boolean;
    startedAt:        number | string | null;
    lastTickAt:       number | string | null;
    signalsGenerated: number;
    tradesExecuted:   number;
  };
  counts: {
    totalUsers:          number;
    openPositions:       number;
    openLivePositions:   number;
    exchangeConnections: number;
  };
  usageToday: {
    apiRequests:  number;
    activeUsers:  number;
    trades:       number;
    peakRssBytes: number;
  } | null;
  exchangeLatency: Array<Record<string, unknown>>;
  generatedAt: number;
}

export interface CostConfig {
  monthlyReplitUsd:     number;
  monthlyRenderUsd:     number;
  monthlyDbUsd:         number;
  monthlyAiUsd:         number;
  monthlyThirdPartyUsd: number;
  updatedBy:            string | null;
  updatedAt:            string | null;
}

export type CostConfigInput = Pick<
  CostConfig,
  | "monthlyReplitUsd"
  | "monthlyRenderUsd"
  | "monthlyDbUsd"
  | "monthlyAiUsd"
  | "monthlyThirdPartyUsd"
>;

export interface UsageHistoryRow {
  day:               string;
  apiRequests:       number;
  exchangeCalls:     number;
  activeUsers:       number;
  trades:            number;
  peakRssBytes:      number;
  estMonthlyCostUsd: number | null;
  updatedAt?:        string;
}

export interface UsageHistory {
  days: number;
  rows: UsageHistoryRow[];
}

export const SYSTEM_RESOURCES_QUERY_KEY = ["admin", "system-resources"] as const;
export const COST_CONFIG_QUERY_KEY      = ["admin", "cost-config"] as const;
export const USAGE_HISTORY_QUERY_KEY    = ["admin", "usage-history"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// useSystemResources — real prod resource snapshot.
// ─────────────────────────────────────────────────────────────────────────────
export function useSystemResources() {
  return useQuery<SystemResources>({
    queryKey: SYSTEM_RESOURCES_QUERY_KEY,
    queryFn: async () => {
      const res = await authFetch("/api/admin/system-resources");
      if (!res.ok) throw new Error(`system-resources ${res.status}`);
      return (await res.json()) as SystemResources;
    },
    refetchInterval:      10_000,
    refetchOnWindowFocus: true,
    staleTime:            5_000,
    retry:                false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useCostConfig — manual "Estimate Only" monthly costs.
// ─────────────────────────────────────────────────────────────────────────────
export function useCostConfig() {
  return useQuery<CostConfig>({
    queryKey: COST_CONFIG_QUERY_KEY,
    queryFn: async () => {
      const res = await authFetch("/api/admin/cost-config");
      if (!res.ok) throw new Error(`cost-config ${res.status}`);
      return (await res.json()) as CostConfig;
    },
    staleTime: 30_000,
    retry:     false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useSetCostConfig — upsert the manual estimate; refresh dependent queries.
// ─────────────────────────────────────────────────────────────────────────────
export function useSetCostConfig() {
  const qc = useQueryClient();
  const mutation = useMutation<CostConfig, Error, CostConfigInput>({
    mutationFn: async (input) => {
      const res = await authFetch("/api/admin/cost-config", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`PUT cost-config ${res.status}`);
      return (await res.json()) as CostConfig;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: COST_CONFIG_QUERY_KEY });
      qc.invalidateQueries({ queryKey: USAGE_HISTORY_QUERY_KEY });
    },
  });

  const setCostConfig = useCallback(
    (input: CostConfigInput) => mutation.mutateAsync(input),
    [mutation],
  );
  return { setCostConfig, isPending: mutation.isPending, error: mutation.error };
}

// ─────────────────────────────────────────────────────────────────────────────
// useUsageHistory — daily usage + cost trend rows for the selected window.
// ─────────────────────────────────────────────────────────────────────────────
export function useUsageHistory(days: number) {
  return useQuery<UsageHistory>({
    queryKey: [...USAGE_HISTORY_QUERY_KEY, days],
    queryFn: async () => {
      const res = await authFetch(`/api/admin/usage-history?days=${days}`);
      if (!res.ok) throw new Error(`usage-history ${res.status}`);
      return (await res.json()) as UsageHistory;
    },
    staleTime: 30_000,
    retry:     false,
  });
}
