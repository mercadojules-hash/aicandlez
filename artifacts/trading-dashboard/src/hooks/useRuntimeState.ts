/**
 * useRuntimeState — customer trading runtime context (Task #199).
 *
 * Reads `GET /api/user/runtime-state` (Task #198 aggregator) and exposes a
 * mutation that writes `activeRuntimeExchange` back through
 * `PUT /api/user/settings`. Both calls go through `authFetch` per the
 * `cross-origin API transport (LOCKED INVARIANT)` rule.
 *
 * Used by `<RuntimeSwitcher>` and by every customer surface that needs to
 * render an explicit mode label (`PAPER MODE` / `LIVE: KRAKEN`) instead of
 * the legacy "PAPER MODE" / "ALPACA PAPER" derivations.
 *
 * Admin gating: NOT mounted in `AdminPortalShell`. The provider is only
 * wrapped around `PortalCustomerShell` in `pages/Portal.tsx`, so this hook
 * never fires on the admin surface — preserving the byte-identical admin
 * invariant called out in replit.md.
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
  canTrade?:             boolean;    // API key authorized for trading (false = blocked in switcher)
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

/**
 * Active runtime context for the signed-in customer. Read-only;
 * `setRuntimeExchange` is provided as a sibling hook.
 */
export function useRuntimeState() {
  return useQuery<RuntimeState>({
    queryKey:             RUNTIME_STATE_QUERY_KEY,
    queryFn: async () => {
      const res = await authFetch("/api/user/runtime-state");
      if (!res.ok) {
        throw new Error(`runtime-state ${res.status}`);
      }
      return (await res.json()) as RuntimeState;
    },
    refetchInterval:      30_000,
    refetchOnWindowFocus: true,
    staleTime:            10_000,
    retry:                false,
  });
}

/**
 * Persist a runtime-exchange choice. Value is one of:
 *   - `"paper"`                 → sticky paper override
 *   - `<exchange id>`           → preferred live exchange (e.g. `"Kraken"`)
 *   - `null`                    → clear override, re-enable auto-promotion
 *
 * Selecting a live chip MUST NOT trigger execution or AI auto-trade —
 * that remains gated by the server-side kill switch + Task #200's safe-
 * execution gate. This hook only flips the displayed runtime context.
 */
export function useSetRuntimeExchange() {
  const qc = useQueryClient();
  const mutation = useMutation<unknown, Error, string | null>({
    mutationFn: async (value) => {
      const res = await authFetch("/api/user/settings", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ activeRuntimeExchange: value }),
      });
      if (!res.ok) {
        throw new Error(`PUT user/settings ${res.status}`);
      }
      return res.json();
    },
    onMutate: async (value) => {
      await qc.cancelQueries({ queryKey: RUNTIME_STATE_QUERY_KEY });
      const previous = qc.getQueryData<RuntimeState>(RUNTIME_STATE_QUERY_KEY);
      if (previous) {
        // Optimistic flip so the chip lights up instantly. Server
        // re-derivation (auto-promotion vs sticky override) settles on
        // the next refetch below.
        const next: RuntimeState = (() => {
          if (value === "paper") {
            return { ...previous, activeRuntimeExchange: "paper",
                     mode: "paper", activeExchange: null,
                     autoPromoted: false, liveReady: false,
                     activeEquityUSD: 0 };
          }
          if (value && previous.connectedExchanges.some(c => c.exchange === value && c.ok)) {
            // Optimistically point the headline equity at the selected
            // exchange's balance so it doesn't flash 0/stale before the
            // refetch settles (server re-derivation is authoritative).
            const sel = previous.connectedExchanges.find(c => c.exchange === value && c.ok);
            return { ...previous, activeRuntimeExchange: value,
                     mode: "live", activeExchange: value,
                     autoPromoted: false, liveReady: true,
                     activeEquityUSD: sel?.totalEquityUSD ?? 0 };
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

/**
 * Human-readable runtime label. Drives the locked invariant strings:
 *   - `mode==="paper"`     → `"PAPER MODE"`
 *   - `mode==="live"`      → `"LIVE: <EXCHANGE>"` (e.g. `"LIVE: KRAKEN"`)
 * Undefined / loading state → `"PAPER MODE"` (safe default).
 */
export function runtimeLabel(state: RuntimeState | undefined): string {
  if (!state || state.mode === "paper") return "PAPER MODE";
  // Hard-guard: server should never return mode="live" without an
  // activeExchange, but if the contract is ever violated we fall back
  // to PAPER MODE rather than emitting a malformed "LIVE:" label.
  const ex = state.activeExchange?.trim();
  if (!ex) return "PAPER MODE";
  return `LIVE: ${ex.toUpperCase()}`;
}
