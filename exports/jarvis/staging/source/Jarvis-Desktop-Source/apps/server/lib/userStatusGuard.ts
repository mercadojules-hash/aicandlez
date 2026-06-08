// ─────────────────────────────────────────────────────────────────────────────
// Shared user-status guard
// ─────────────────────────────────────────────────────────────────────────────
//
// Single source of truth for the `user_admin_status` → permission truth
// table. Used by every execution boundary and by the auth bootstrap.
// Keeping this in one module means future code paths (new exec routes,
// future auto-trade variants) inherit the same gating with zero risk of
// drift.
//
// Truth table:
//
//   status        allowLive  allowPaper  allowAuth
//   ──────────────────────────────────────────────
//   active        yes        yes         yes
//   force_paper   no         yes         yes
//   billing_hold  no         yes         yes   ← automated billing enforce-
//                                                 ment. Identical to
//                                                 force_paper at the guard
//                                                 level; distinct status
//                                                 string for telemetry +
//                                                 customer messaging +
//                                                 auto-restoration hooks.
//                                                 Paper, dashboard, history,
//                                                 open positions all
//                                                 preserved.
//   suspended     no         no          yes   ← user must still sign in to
//                                                 see *why* they're suspended
//   disabled      no         no          no    ← hard lock; auth bootstrap
//                                                 returns 403
// ─────────────────────────────────────────────────────────────────────────────

import { db, userAdminStatusTable, type AdminStatus } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

export interface StatusVerdict {
  status:     AdminStatus;
  allowLive:  boolean;
  allowPaper: boolean;
  allowAuth:  boolean;
  reason:     string | null;
}

const DEFAULT: StatusVerdict = {
  status:     "active",
  allowLive:  true,
  allowPaper: true,
  allowAuth:  true,
  reason:     null,
};

/** Pure permissions table — unit-tested. */
export function verdictFor(status: AdminStatus, reason: string | null = null): StatusVerdict {
  switch (status) {
    case "active":
      return { status, allowLive: true,  allowPaper: true,  allowAuth: true,  reason };
    case "force_paper":
      return { status, allowLive: false, allowPaper: true,  allowAuth: true,  reason };
    case "billing_hold":
      // Same gate as force_paper — blocks NEW live executions only.
      // Open positions, paper, dashboard, history, signals all continue.
      // Distinguishable from force_paper via the `status` field so the UI
      // can show "Add credits to resume" instead of "Operator action".
      return { status, allowLive: false, allowPaper: true,  allowAuth: true,  reason };
    case "suspended":
      return { status, allowLive: false, allowPaper: false, allowAuth: true,  reason };
    case "disabled":
      return { status, allowLive: false, allowPaper: false, allowAuth: false, reason };
    default:
      return { ...DEFAULT };
  }
}

export async function getUserStatusVerdict(userId: string): Promise<StatusVerdict> {
  try {
    const [row] = await db
      .select({
        status: userAdminStatusTable.status,
        reason: userAdminStatusTable.reason,
      })
      .from(userAdminStatusTable)
      .where(eq(userAdminStatusTable.userId, userId))
      .limit(1);
    if (!row) return { ...DEFAULT };
    return verdictFor(row.status as AdminStatus, row.reason ?? null);
  } catch (err) {
    logger.warn(
      { userId, err: err instanceof Error ? err.message : String(err) },
      "userStatusGuard: lookup failed — defaulting to active",
    );
    return { ...DEFAULT };
  }
}
