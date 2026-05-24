// ─────────────────────────────────────────────────────────────────────────────
// Global live-execution kill switch — ARCHITECTURE STUB (Phase B scaffold)
// ─────────────────────────────────────────────────────────────────────────────
//
// PURPOSE
//   Platform-wide circuit breaker that blocks ALL new live AI executions
//   regardless of per-user billing/status. Independent of:
//     - billing_hold     (per-user, fee-driven)
//     - force_paper      (per-user, operator-driven)
//     - customer kill    (env-driven, customer-side only)
//
//   Designed for incident response: exchange outage, AI engine regression,
//   regulatory pause, etc. Operator hits one switch → no new live orders
//   anywhere on the platform. Paper, dashboard, open positions all continue.
//
// INVARIANTS
//   - NEVER liquidates positions
//   - NEVER cancels open orders on the exchange
//   - NEVER touches exchange balances
//   - NEVER auto-withdraws funds
//   - Only blocks NEW live AI executions at the entry point
//
// STATUS
//   ARCHITECTURE STUB — surface is wired but enforcement is not active.
//   Phase D will hook this into the live execution path. Today it returns
//   `false` (not engaged) under all conditions, so existing flows are
//   completely unchanged.
//
// FUTURE IMPLEMENTATION
//   - Persistence: new `platform_state` table with `live_execution_enabled`
//     boolean, `engaged_by_admin_id`, `reason`, `engaged_at`.
//   - Read path: cached lookup (5s TTL) so per-order checks are O(1).
//   - Write path: super-admin only endpoint `POST /api/admin/kill_switch`.
//   - Audit: every flip writes admin_audit_log row.
// ─────────────────────────────────────────────────────────────────────────────

export interface KillSwitchState {
  engaged:        boolean;
  reason:         string | null;
  engagedByAdmin: string | null;
  engagedAt:      Date | null;
}

const INACTIVE: KillSwitchState = {
  engaged:        false,
  reason:         null,
  engagedByAdmin: null,
  engagedAt:      null,
};

/**
 * Returns the current global kill switch state.
 * STUB: always returns inactive until Phase D implements persistence.
 */
export async function getGlobalKillSwitchState(): Promise<KillSwitchState> {
  return { ...INACTIVE };
}

/**
 * Convenience boolean — call from live execution entry points (Phase D).
 * STUB: always returns false today, so no existing behavior changes.
 */
export async function isGlobalLiveExecutionBlocked(): Promise<boolean> {
  const state = await getGlobalKillSwitchState();
  return state.engaged;
}
