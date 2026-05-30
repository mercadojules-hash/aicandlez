/**
 * useRuntimeState — PWA customer trading runtime context (Task #199).
 *
 * Sibling of `artifacts/trading-dashboard/src/hooks/useRuntimeState.ts`,
 * kept as a separate file because the two apps don't share a UI lib.
 * Both call the same `GET /api/user/runtime-state` aggregator
 * (Task #198) and persist via `PUT /api/user/settings`. All requests
 * go through `authFetch` per the cross-origin transport invariant.
 *
 * Spec doc: `.local/docs/customer-runtime-context-spec.md`.
 */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "../lib/authFetch";

export interface RuntimeConnection {
  id:                    string;
  exchange:              string;
  label:                 string;
  status:                string;
  isDefault:             boolean;
  tradingMode:           string;
  ok:                    boolean;
  totalEquityUSD:        number;
  balances:              Record<string, { free: number; locked: number; total: number }>;
  lastUpdated:           number;
  lastBalanceFetchAt:    string | null;
  lastBalanceFetchError: string | null;
  error?:                string;
}

export interface RuntimeState {
  mode:                  "paper" | "live";
  activeExchange:        string | null;
  activeRuntimeExchange: string | null;
  autoPromoted:          boolean;
  liveReady:             boolean;
  totalEquityUSD:        number;    // SUM of all healthy connections
  activeEquityUSD:       number;    // active exchange ONLY (headline equity)
  connectedExchanges:    RuntimeConnection[];
  fetchedAt:             number;
}

export const RUNTIME_STATE_QUERY_KEY = ["runtime-state"] as const;

export function useRuntimeState() {
  return useQuery<RuntimeState>({
    queryKey:             RUNTIME_STATE_QUERY_KEY,
    queryFn: async () => {
      const res = await authFetch("/api/user/runtime-state");
      if (!res.ok) throw new Error(`runtime-state ${res.status}`);
      return (await res.json()) as RuntimeState;
    },
    refetchInterval:      30_000,
    refetchOnWindowFocus: true,
    staleTime:            10_000,
    retry:                false,
  });
}

export function useSetRuntimeExchange() {
  const qc = useQueryClient();
  const mutation = useMutation<unknown, Error, string | null>({
    mutationFn: async (value) => {
      const res = await authFetch("/api/user/settings", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ activeRuntimeExchange: value }),
      });
      if (!res.ok) throw new Error(`PUT user/settings ${res.status}`);
      return res.json();
    },
    onMutate: async (value) => {
      await qc.cancelQueries({ queryKey: RUNTIME_STATE_QUERY_KEY });
      const previous = qc.getQueryData<RuntimeState>(RUNTIME_STATE_QUERY_KEY);
      if (previous) {
        const next: RuntimeState = (() => {
          if (value === "paper") {
            return { ...previous, activeRuntimeExchange: "paper",
                     mode: "paper", activeExchange: null,
                     autoPromoted: false, liveReady: false };
          }
          if (value && previous.connectedExchanges.some(c => c.exchange === value && c.ok)) {
            return { ...previous, activeRuntimeExchange: value,
                     mode: "live", activeExchange: value,
                     autoPromoted: false, liveReady: true };
          }
          return { ...previous, activeRuntimeExchange: value };
        })();
        qc.setQueryData(RUNTIME_STATE_QUERY_KEY, next);
      }
      return { previous };
    },
    onError: (_err, _value, ctx) => {
      const previous = (ctx as { previous?: RuntimeState } | undefined)?.previous;
      if (previous) qc.setQueryData(RUNTIME_STATE_QUERY_KEY, previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: RUNTIME_STATE_QUERY_KEY });
    },
  });

  const setRuntimeExchange = useCallback(
    (value: string | null) => mutation.mutate(value),
    [mutation],
  );
  return { setRuntimeExchange, isPending: mutation.isPending };
}

export function runtimeLabel(state: RuntimeState | undefined): string {
  if (!state || state.mode === "paper") return "PAPER MODE";
  // Hard-guard: server should never return mode="live" without an
  // activeExchange, but if the contract is ever violated we fall back
  // to PAPER MODE rather than emitting a malformed "LIVE:" label.
  const ex = state.activeExchange?.trim();
  if (!ex) return "PAPER MODE";
  return `LIVE: ${ex.toUpperCase()}`;
}
