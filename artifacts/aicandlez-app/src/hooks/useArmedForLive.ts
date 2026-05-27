/**
 * useArmedForLive — per-session ARM LIVE gate (Task #200, PWA).
 *
 * Sibling of `artifacts/trading-dashboard/src/hooks/useArmedForLive.ts`.
 * Module-scoped boolean, NOT persisted. Initial value = false on every
 * page load — the user must explicitly re-arm after any refresh.
 *
 * Consumed by RuntimeSwitcher (ARM LIVE button) and AIAutoTradeContext
 * (forwards into POST /api/user/ai-trading/enable body).
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
