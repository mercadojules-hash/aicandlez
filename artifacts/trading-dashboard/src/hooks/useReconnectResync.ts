/**
 * useReconnectResync — Phase 3 Step 3 scaffold (partial, snapshot-first).
 *
 * The Phase 3 acceptance criterion for reconnect is: after a websocket/
 * stream drop OR tab-visibility change OR network online event, the
 * client MUST refetch the canonical server snapshot BEFORE accepting
 * any optimistic local updates. This prevents "ghost" trade rows /
 * stale runtime mode from showing after a reconnect.
 *
 * Phase 2 follow-up #211 will introduce a dedicated `/api/execution/
 * snapshot` endpoint. Until then this hook reuses the existing
 * `useExecutionState` 4s poll + `useRuntimeState` 30s poll as the
 * snapshot equivalent: on a reconnect signal, invalidate both query
 * keys and expose `resyncing=true` until the next successful fetch
 * lands. Consumers can render a "resyncing" affordance and gate
 * optimistic updates while resyncing.
 *
 * Cross-tab safe — module-level listeners are installed lazily and
 * shared across all hook consumers via a global subscriber set.
 */

import { useEffect, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { RUNTIME_STATE_QUERY_KEY } from "./useRuntimeState";

const EXECUTION_STATE_QUERY_KEY: QueryKey = ["execution-state"] as const;

/**
 * Resync window in milliseconds. After a reconnect signal, the hook
 * stays in `resyncing=true` until either a refetch resolves or this
 * fail-safe expires (so UI doesn't get stuck if every refetch fails).
 */
const RESYNC_TIMEOUT_MS = 8_000;

export interface ReconnectResyncResult {
  /** True while the client is waiting for a snapshot after reconnect. */
  resyncing: boolean;
  /** Manual trigger — call after a known stream/optimistic-update drop. */
  forceResync: () => void;
}

export function useReconnectResync(): ReconnectResyncResult {
  const qc = useQueryClient();
  const [resyncing, setResyncing] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const beginResync = () => {
      setResyncing(true);
      void qc.invalidateQueries({ queryKey: EXECUTION_STATE_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: RUNTIME_STATE_QUERY_KEY });
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setResyncing(false), RESYNC_TIMEOUT_MS);
    };

    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        beginResync();
      }
    };
    const onOnline = () => beginResync();

    const unsubscribe = qc.getQueryCache().subscribe(event => {
      if (event.type !== "updated") return;
      const key = event.query.queryKey;
      const isTrackedKey =
        JSON.stringify(key) === JSON.stringify(EXECUTION_STATE_QUERY_KEY) ||
        JSON.stringify(key) === JSON.stringify(RUNTIME_STATE_QUERY_KEY);
      if (!isTrackedKey) return;
      if (event.query.state.status === "success" && resyncing) {
        setResyncing(false);
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }
    });

    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [qc, resyncing]);

  return { resyncing, forceResync: () => {
    setResyncing(true);
    void qc.invalidateQueries({ queryKey: EXECUTION_STATE_QUERY_KEY });
    void qc.invalidateQueries({ queryKey: RUNTIME_STATE_QUERY_KEY });
  }};
}
