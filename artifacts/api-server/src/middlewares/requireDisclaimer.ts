// ─────────────────────────────────────────────────────────────────────────────
// requireDisclaimer — customer-only risk-disclaimer gate
// ─────────────────────────────────────────────────────────────────────────────
// Blocks gated mutations (checkout, exchange connect, live activation, plan
// upgrade) until the customer has explicitly accepted the current risk
// disclaimer version (DISCLAIMER_VERSION). Operators bypass.
//
// Response on missing acceptance:
//   HTTP 412 Precondition Failed
//   { error: "Risk disclaimer acceptance required",
//     needsDisclaimer: true,
//     disclaimerVersion: "disclaimer-v1.0" }
//
// The frontend's useDisclaimerGate hook detects `needsDisclaimer: true` on
// any 412 response and shows the modal — but the gate also pre-checks before
// submission so the user never sees a flash of a Stripe redirect followed by
// a 412 error.
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from "express";
import {
  db,
  userConsentsTable,
  usersTable,
  DISCLAIMER_VERSION,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

type AuthReq = Request & { clerkUserId: string };

export const requireDisclaimer = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  if (!userId) {
    // Should never happen — requireAuth must run first.
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // Operator bypass — admin / super-admin
    const [user] = await db
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, userId))
      .limit(1);

    if (user?.role === "admin" || user?.role === "super-admin") {
      next();
      return;
    }

    // Customer — must have accepted current disclaimer version
    const [consent] = await db
      .select({ id: userConsentsTable.id })
      .from(userConsentsTable)
      .where(and(
        eq(userConsentsTable.userId, userId),
        eq(userConsentsTable.consentVersion, DISCLAIMER_VERSION),
      ))
      .limit(1);

    if (!consent) {
      res.status(412).json({
        error:             "Risk disclaimer acceptance required",
        needsDisclaimer:   true,
        disclaimerVersion: DISCLAIMER_VERSION,
      });
      return;
    }

    next();
  } catch (err) {
    // Surface Postgres error codes/messages so production failures are
    // diagnosable from Render logs and the browser network panel.
    // Common codes:
    //   42P01 — relation does not exist (user_consents table missing on prod)
    //   42703 — column does not exist (disclaimer-v1.0 columns missing)
    //   28P01 — invalid_password (DB credentials wrong)
    //   ECONNREFUSED — DB unreachable
    const e        = err as { code?: string; message?: string; routine?: string };
    const pgCode   = e?.code;
    const pgMsg    = e?.message;
    req.log.error(
      { err, pgCode, pgMsg, userId, routine: e?.routine },
      "requireDisclaimer middleware failed",
    );
    res.status(500).json({
      error:   "Failed to verify disclaimer status",
      code:    pgCode ?? "UNKNOWN",
      detail:  pgMsg ?? "no error message",
      hint:    pgCode === "42P01"
        ? "user_consents table missing on this database — run drizzle-kit push against the production DB."
        : pgCode === "42703"
          ? "user_consents is missing a column required by disclaimer-v1.0 — run drizzle-kit push against the production DB."
          : undefined,
    });
  }
};
