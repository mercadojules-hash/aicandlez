/**
 * useExecutionState (PWA) — canonical client view of /api/execution/state.
 *
 * Mirrors trading-dashboard's hook so the mobile PWA, customer portal,
 * admin portal, and /command all read from the same single source of
 * truth and cannot drift out of sync. Polls every 4s.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export type StreamState = "halted" | "armed" | "executing";

export interface StreamDetail {
  state:        StreamState;
  lastExecAt:   number | null;
  lastSignalAt: number | null;
  reason:       string | null;
}

export interface ExecutionStateResponse {
  ts:       number;
  engine: {
    running:          boolean;
    lastTickAt:       number | null;
    signalsGenerated: number;
    tradesExecuted:   number;
  };
  role:                          "admin" | "customer" | "anonymous";
  customerLiveExecutionDisabled: boolean;
  crypto:   StreamDetail;
  equities: StreamDetail;
}

export function useExecutionState() {
  return useQuery<ExecutionStateResponse>({
    queryKey:                    ["execution-state"],
    queryFn:                     () => api.get<ExecutionStateResponse>("/execution/state"),
    refetchInterval:             4_000,
    refetchIntervalInBackground: true,
    staleTime:                   2_000,
    retry:                       false,
  });
}
