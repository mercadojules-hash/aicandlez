/**
 * useExecutionState — canonical client view of /api/execution/state.
 *
 * Single source of truth consumed by the customer portal, admin portal,
 * and operator Command Center so the three surfaces cannot drift out of
 * sync. Polls every 4s; tolerates transient failures (keeps previous
 * value rather than going blank).
 *
 * Maps the server's per-stream state into the LiveControlBar visual
 * vocabulary used across surfaces:
 *
 *   server "halted"    → LiveControlBar "HALTED" (red, emergency stop)
 *   server "executing" → LiveControlBar "EXECUTING" (gold pulse + sweep)
 *   server "armed"     → LiveControlBar "ARMED" (neon green, ready)
 */

import { useQuery } from "@tanstack/react-query";
import { authFetch } from "../lib/authFetch";

const apiBaseUrl: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

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

async function fetchExecutionState(): Promise<ExecutionStateResponse> {
  const res = await authFetch(`${apiBaseUrl}/api/execution/state`, {
    cache:       "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`execution_state_${res.status}`);
  return (await res.json()) as ExecutionStateResponse;
}

export function useExecutionState() {
  return useQuery<ExecutionStateResponse>({
    queryKey:                    ["execution-state"],
    queryFn:                     fetchExecutionState,
    refetchInterval:             4_000,
    // Pass 3.3 — quiet hidden tabs. The 4s execution-state poll was
    // running indefinitely in background tabs, repainting nothing.
    // Foreground sees no change (RQ refires on focus by default).
    refetchIntervalInBackground: false,
    staleTime:                   2_000,
    retry:                       false,
  });
}
