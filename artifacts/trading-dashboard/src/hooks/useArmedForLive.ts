/**
 * useArmedForLive — per-session ARM LIVE gate (Task #200).
 *
 * Module-scoped boolean, NOT persisted. Initial value = false on every
 * page load by design — the user must explicitly re-arm after any
 * refresh. This is a UX safety gate, not a security gate: the server
 * still enforces `CUSTOMER_LIVE_EXECUTION_ENABLED` env kill switch +
 * subscription/disclaimer/risk gates regardless of this flag.
 *
 * Consumed by:
 *   - <RuntimeSwitcher> ARM LIVE button (read + write)
 *   - SignalRow.fireTrade customer LIVE branch (read; blocks routing
 *     with errorCode "runtime_not_armed" toast when false)
 *   - useAiTradingState `setEnabledAsync` (read; forwards into
 *     POST /api/user/ai-trading/enable body so the server can reject
 *     a stale-client AI-on flip with 412 runtime_not_armed).
 */

import { useSyncExternalStore } from "react";

let armed = false;
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): boolean {
  return armed;
}

export function setArmedForLive(value: boolean): void {
  if (armed === value) return;
  armed = value;
  for (const l of listeners) l();
}

export function getArmedForLive(): boolean {
  return armed;
}

export function useArmedForLive(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
