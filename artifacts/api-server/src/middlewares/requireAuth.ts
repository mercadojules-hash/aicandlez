import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// requireAuth — verifies a Clerk session and attaches clerkUserId to req.
// ─────────────────────────────────────────────────────────────────────────────
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const auth = getAuth(req);
  const userId = (auth?.sessionClaims?.userId as string | undefined) ?? auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as Request & { clerkUserId: string }).clerkUserId = userId;
  next();
};

// ─────────────────────────────────────────────────────────────────────────────
// requireRole — DB-backed role gate.
// ─────────────────────────────────────────────────────────────────────────────
// Reads the canonical role from `users.role` (Postgres) — NOT from Clerk
// session claims. This is the single source of truth used by:
//   • /auth/me JIT-provisioning + super-admin allowlist auto-promotion
//   • useUserRole() on the frontend
//   • Operator endpoint gating (exchange routes, admin pages)
// Reading from Clerk publicMetadata would cause drift: promotions/demotions
// take effect immediately at the DB layer but a Clerk session token may
// persist a stale role for the rest of its lifetime.
// ─────────────────────────────────────────────────────────────────────────────
export const requireRole = (roles: string[]) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const auth = getAuth(req);
    const userId = (auth?.sessionClaims?.userId as string | undefined) ?? auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    (req as Request & { clerkUserId: string }).clerkUserId = userId;

    try {
      const [row] = await db
        .select({ role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.clerkUserId, userId))
        .limit(1);
      const role = row?.role ?? "user";
      if (!roles.includes(role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      next();
    } catch (err) {
      req.log?.error({ err, userId }, "requireRole DB lookup failed");
      res.status(500).json({ error: "Role check failed" });
    }
  };
