// ─────────────────────────────────────────────────────────────────────────────
// Desktop Edition local auth shim — single-user, no Clerk.
// Replaces the AICandlez Clerk middleware. Authorizes EVERY request as the local
// desktop super-admin and stamps `req.clerkUserId` so downstream Jarvis actor
// resolution + DB role lookups succeed. The matching `users` row
// (clerkUserId = LOCAL_USER_ID, role 'super-admin') is JIT-provisioned by
// `GET /api/auth/me` and can also be pre-seeded via scripts/seed-local-admin.sql.
// ─────────────────────────────────────────────────────────────────────────────
import type { Request, Response, NextFunction } from "express";

export const LOCAL_USER_ID =
  process.env.JARVIS_LOCAL_USER_ID?.trim() || "local-admin";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      clerkUserId?: string;
    }
  }
}

export const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  req.clerkUserId = LOCAL_USER_ID;
  next();
};

export const requireRole =
  (_roles: string[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    // Desktop is single-user super-admin: every role passes. We still stamp the
    // id so handlers relying on it behave identically to the cloud path.
    req.clerkUserId = LOCAL_USER_ID;
    next();
  };
