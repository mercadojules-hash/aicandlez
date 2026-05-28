import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUserStatusVerdict } from "../lib/userStatusGuard.js";
import { touchSession } from "../lib/sessionTracker.js";

// ─────────────────────────────────────────────────────────────────────────────
// requireAuth — verifies a Clerk session and attaches clerkUserId to req.
// Also performs CRM Phase A3 session persistence + revocation gate via
// `touchSession`: upserts a row in `user_sessions` keyed by Clerk's `sid`,
// debounced to ~60s between writes, and rejects requests whose session row
// has been revoked by an operator.
// ─────────────────────────────────────────────────────────────────────────────
export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const auth = getAuth(req);
  const userId = (auth?.sessionClaims?.userId as string | undefined) ?? auth?.userId;
  if (!userId) {
    // [REQUIRE_AUTH_REJECT] — log-only diagnostic so we can distinguish
    // "client never sent a session" (this branch) from downstream gate
    // rejects (plan/disclaimer) when chasing a connect-flow regression.
    req.log?.warn?.({
      tag:               "REQUIRE_AUTH_REJECT",
      reason:            "no_session",
      method:            req.method,
      url:               req.originalUrl,
      hasAuthorization:  !!req.headers.authorization,
      authScheme:        typeof req.headers.authorization === "string"
        ? req.headers.authorization.split(" ")[0]
        : null,
      hasCookie:         !!req.headers.cookie,
      origin:            req.headers.origin ?? null,
      status:            401,
    }, "[REQUIRE_AUTH_REJECT] no_session → 401");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as Request & { clerkUserId: string }).clerkUserId = userId;

  // Session persistence + revocation gate. `touchSession` is fail-open on
  // DB error so a transient outage doesn't lock everyone out. Only an
  // explicit revoked row produces { allow: false }.
  const sessionVerdict = await touchSession({
    req,
    clerkUserId:     userId,
    clerkSessionId:  auth?.sessionId ?? null,
  });
  if (!sessionVerdict.allow) {
    req.log?.warn?.({
      tag:        "REQUIRE_AUTH_REJECT",
      reason:     "session_revoked",
      userId,
      method:     req.method,
      url:        req.originalUrl,
      sessionRevokedReason: sessionVerdict.reason,
      status:     401,
    }, "[REQUIRE_AUTH_REJECT] session_revoked → 401");
    res.status(401).json({
      error:     sessionVerdict.reason,
      errorCode: "session_revoked",
    });
    return;
  }
  (req as Request & { sessionRowId: string | null }).sessionRowId =
    sessionVerdict.sessionRowId;

  // Hard auth-gate: disabled accounts cannot bootstrap any authenticated
  // surface (paper, live, settings, anything). Soft statuses (suspended,
  // force_paper) still allow auth — they're enforced at the execution
  // boundary. Fail-open on lookup error so an outage doesn't lock everyone
  // out; the execution boundary re-checks before any live order.
  try {
    const verdict = await getUserStatusVerdict(userId);
    if (!verdict.allowAuth) {
      req.log?.warn?.({
        tag:        "REQUIRE_AUTH_REJECT",
        reason:     "user_status_blocked",
        userId,
        method:     req.method,
        url:        req.originalUrl,
        userStatus: verdict.status,
        status:     403,
      }, "[REQUIRE_AUTH_REJECT] user_status_blocked → 403");
      res.status(403).json({
        error:      verdict.reason ?? `Account ${verdict.status}`,
        errorCode:  "user_status_blocked",
        status:     verdict.status,
      });
      return;
    }
  } catch (err) {
    req.log?.warn?.({ err, userId }, "requireAuth: status verdict lookup failed (fail-open)");
  }
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
      // Status gate also applies to operator endpoints — a disabled
      // admin account cannot impersonate or operate. Fail-open on lookup
      // failure to avoid locking out admins during an outage.
      try {
        const verdict = await getUserStatusVerdict(userId);
        if (!verdict.allowAuth) {
          res.status(403).json({
            error:     verdict.reason ?? `Account ${verdict.status}`,
            errorCode: "user_status_blocked",
            status:    verdict.status,
          });
          return;
        }
      } catch (err) {
        req.log?.warn?.({ err, userId }, "requireRole: status verdict lookup failed (fail-open)");
      }
      next();
    } catch (err) {
      req.log?.error({ err, userId }, "requireRole DB lookup failed");
      res.status(500).json({ error: "Role check failed" });
    }
  };
