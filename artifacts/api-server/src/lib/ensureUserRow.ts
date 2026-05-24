// ─────────────────────────────────────────────────────────────────────────────
// ensureUserRow — JIT user-row provisioning helper (Sprint 1 fix P1-ON-01)
// ─────────────────────────────────────────────────────────────────────────────
//
// Background: the canonical JIT-provision path lives in `GET /auth/me`
// (routes/auth.ts). If the client fires `/api/billing/subscription`,
// `/api/account`, or any other authenticated read in parallel with
// `/auth/me`, the row may not exist yet and downstream handlers returned
// `404 "User not found"`, breaking dashboard hydration on first sign-in.
//
// This helper performs the SAME idempotent insert as `/auth/me` so any
// handler can call it as a one-line preamble before its own `select`.
// Role auto-promotion (super-admin email allowlist) is intentionally NOT
// duplicated here — that remains owned by `/auth/me`. This helper only
// guarantees a row exists with role="user" as a minimum baseline; the
// next `/auth/me` round will reconcile role correctly.
//
// Idempotency: `onConflictDoNothing` on the clerk_user_id PK. Safe to
// call from concurrent requests for the same user.
// ─────────────────────────────────────────────────────────────────────────────

import {
  db,
  usersTable,
  userTradeLimitsTable,
  DEFAULT_TRADE_LIMIT_CAP,
} from "@workspace/db";
import { logger } from "./logger.js";

/**
 * Idempotently ensure a `users` row exists for the given Clerk user id.
 * Returns `true` if a new row was inserted, `false` if it already existed
 * (or insert was absorbed by the conflict path).
 *
 * Does not throw on duplicate-key — the conflict is the success path.
 * Logs and swallows other DB errors; callers should still handle their
 * own `select` returning empty (extremely rare race).
 */
export async function ensureUserRow(clerkUserId: string): Promise<boolean> {
  if (!clerkUserId) return false;
  try {
    const inserted = await db
      .insert(usersTable)
      .values({
        clerkUserId,
        email: "",
        role:  "user",
      })
      .onConflictDoNothing({ target: usersTable.clerkUserId })
      .returning({ clerkUserId: usersTable.clerkUserId });

    if (inserted.length > 0) {
      // Also seed the default trade-limit row (mirrors /auth/me behaviour).
      try {
        await db
          .insert(userTradeLimitsTable)
          .values({ userId: clerkUserId, capTier: DEFAULT_TRADE_LIMIT_CAP })
          .onConflictDoNothing();
      } catch (err) {
        logger.warn(
          { err, clerkUserId },
          "ensureUserRow: trade-limit seed failed (non-fatal)",
        );
      }
      logger.info(
        { clerkUserId },
        "ensureUserRow: provisioned user row JIT (pre-/auth/me)",
      );
      return true;
    }
    return false;
  } catch (err) {
    logger.warn(
      { err, clerkUserId },
      "ensureUserRow: insert failed (will rely on existing row if any)",
    );
    return false;
  }
}
