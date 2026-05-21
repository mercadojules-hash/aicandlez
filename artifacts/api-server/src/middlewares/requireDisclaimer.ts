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
    req.log.error({ err }, "requireDisclaimer middleware failed");
    res.status(500).json({ error: "Failed to verify disclaimer status" });
  }
};
