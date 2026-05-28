/**
 * useReconnectResync (PWA mirror) — see trading-dashboard sibling for
 * full Phase 3 Step 3 design notes. Reuses the existing 4s execution-
 * state poll + 30s runtime-state poll as the snapshot equivalent ahead
 * of Phase 2 follow-up #211 (dedicated snapshot endpoint).
 */

import { useEffect, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { RUNTIME_STATE_QUERY_KEY } from "./useRuntimeState";

const EXECUTION_STATE_QUERY_KEY: QueryKey = ["execution-state"] as const;
const RESYNC_TIMEOUT_MS = 8_000;

export interface ReconnectResyncResult {
  resyncing:   boolean;
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
