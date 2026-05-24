/**
 * CRM Phase A3 — operator session management endpoints.
 *
 *   GET  /api/admin/sessions                 — recent sessions (optional ?filter=active|idle|offline|revoked)
 *   GET  /api/admin/users/:id/sessions       — sessions for a single user
 *   POST /api/admin/sessions/:id/revoke      — operator revokes a session
 *
 * Revocation flow:
 *   1. Mark our `user_sessions` row revoked (note + actor recorded).
 *   2. Best-effort `clerkClient.sessions.revokeSession(sid)` so the
 *      Clerk JWT is invalidated server-side too. If Clerk call fails
 *      (network, already-expired sid, deleted user), we still keep
 *      the local revoke — `requireAuth` will reject the next request
 *      using `touchSession`'s 401 `session_revoked` path.
 *   3. Append audit row to `user_admin_actions` so it shows up in the
 *      User Intelligence Panel's audit trail alongside other operator
 *      actions.
 */
import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { and, desc, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import {
  db,
  userSessionsTable,
  usersTable,
  userAdminActionsTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { executionStreamBus } from "../lib/executionStreamBus.js";

const router = Router();
const requireOperator = [requireAuth, requireRole(["admin", "super-admin"])];

type AuthReq = Request & { clerkUserId: string };

// Window cutoffs in ms.
const ACTIVE_WINDOW_MS = 2  * 60 * 1000;   // active  = last seen <  2 min
const IDLE_WINDOW_MS   = 30 * 60 * 1000;   // idle    = last seen < 30 min
                                            // offline = older or never

function deriveStatus(lastSeenAt: Date | null, revokedAt: Date | null): "active" | "idle" | "offline" | "revoked" {
  if (revokedAt) return "revoked";
  if (!lastSeenAt) return "offline";
  const ageMs = Date.now() - lastSeenAt.getTime();
  if (ageMs < ACTIVE_WINDOW_MS) return "active";
  if (ageMs < IDLE_WINDOW_MS)   return "idle";
  return "offline";
}

interface SessionRowOut {
  id:               string;
  clerkSessionId:   string | null;
  clerkUserId:      string;
  email:            string | null;
  plan:             string | null;
  role:             string | null;
  ipAddress:        string | null;
  userAgent:        string | null;
  firstSeenAt:      string;
  lastSeenAt:       string;
  revokedAt:        string | null;
  revokedByAdminId: string | null;
  revokeReason:     string | null;
  status:           "active" | "idle" | "offline" | "revoked";
}

function toRowOut(row: {
  id:               string;
  clerkSessionId:   string | null;
  clerkUserId:      string;
  email:            string | null;
  plan:             string | null;
  role:             string | null;
  ipAddress:        string | null;
  userAgent:        string | null;
  firstSeenAt:      Date;
  lastSeenAt:       Date;
  revokedAt:        Date | null;
  revokedByAdminId: string | null;
  revokeReason:     string | null;
}): SessionRowOut {
  return {
    id:               row.id,
    clerkSessionId:   row.clerkSessionId,
    clerkUserId:      row.clerkUserId,
    email:            row.email,
    plan:             row.plan,
    role:             row.role,
    ipAddress:        row.ipAddress,
    userAgent:        row.userAgent,
    firstSeenAt:      row.firstSeenAt.toISOString(),
    lastSeenAt:       row.lastSeenAt.toISOString(),
    revokedAt:        row.revokedAt ? row.revokedAt.toISOString() : null,
    revokedByAdminId: row.revokedByAdminId,
    revokeReason:     row.revokeReason,
    status:           deriveStatus(row.lastSeenAt, row.revokedAt),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/sessions
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/sessions", requireOperator, async (req: Request, res: Response) => {
  try {
    const filter   = String(req.query["filter"] ?? "all").toLowerCase();
    const pageSize = Math.min(500, Math.max(1, Number(req.query["pageSize"] ?? 200)));

    const rows = await db
      .select({
        id:               userSessionsTable.id,
        clerkSessionId:   userSessionsTable.clerkSessionId,
        clerkUserId:      userSessionsTable.clerkUserId,
        ipAddress:        userSessionsTable.ipAddress,
        userAgent:        userSessionsTable.userAgent,
        firstSeenAt:      userSessionsTable.firstSeenAt,
        lastSeenAt:       userSessionsTable.lastSeenAt,
        revokedAt:        userSessionsTable.revokedAt,
        revokedByAdminId: userSessionsTable.revokedByAdminId,
        revokeReason:     userSessionsTable.revokeReason,
        email:            usersTable.email,
        plan:             usersTable.plan,
        role:             usersTable.role,
      })
      .from(userSessionsTable)
      .leftJoin(usersTable, eq(usersTable.clerkUserId, userSessionsTable.clerkUserId))
      .orderBy(desc(userSessionsTable.lastSeenAt))
      .limit(pageSize);

    const all = rows.map(toRowOut);
    const filtered =
      filter === "all"     ? all :
      filter === "revoked" ? all.filter(r => r.status === "revoked") :
                              all.filter(r => r.status === filter);

    const counts = {
      total:   all.length,
      active:  all.filter(r => r.status === "active").length,
      idle:    all.filter(r => r.status === "idle").length,
      offline: all.filter(r => r.status === "offline").length,
      revoked: all.filter(r => r.status === "revoked").length,
    };

    res.json({ sessions: filtered, counts, timestamp: Date.now() });
  } catch (err) {
    req.log?.error({ err }, "GET /admin/sessions failed");
    res.status(500).json({ error: "Failed to load sessions" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users/:id/sessions
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/users/:id/sessions", requireOperator, async (req: Request, res: Response) => {
  try {
    const targetId = String(req.params["id"] ?? "");
    if (!targetId) {
      res.status(400).json({ error: "Missing user id" });
      return;
    }

    const rows = await db
      .select({
        id:               userSessionsTable.id,
        clerkSessionId:   userSessionsTable.clerkSessionId,
        clerkUserId:      userSessionsTable.clerkUserId,
        ipAddress:        userSessionsTable.ipAddress,
        userAgent:        userSessionsTable.userAgent,
        firstSeenAt:      userSessionsTable.firstSeenAt,
        lastSeenAt:       userSessionsTable.lastSeenAt,
        revokedAt:        userSessionsTable.revokedAt,
        revokedByAdminId: userSessionsTable.revokedByAdminId,
        revokeReason:     userSessionsTable.revokeReason,
        email:            usersTable.email,
        plan:             usersTable.plan,
        role:             usersTable.role,
      })
      .from(userSessionsTable)
      .leftJoin(usersTable, eq(usersTable.clerkUserId, userSessionsTable.clerkUserId))
      .where(eq(userSessionsTable.clerkUserId, targetId))
      .orderBy(desc(userSessionsTable.lastSeenAt))
      .limit(200);

    res.json({ sessions: rows.map(toRowOut), timestamp: Date.now() });
  } catch (err) {
    req.log?.error({ err }, "GET /admin/users/:id/sessions failed");
    res.status(500).json({ error: "Failed to load user sessions" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/sessions/:id/revoke
// ─────────────────────────────────────────────────────────────────────────────
const RevokeBodySchema = z.object({
  note:   z.string().trim().min(1, "Operator note is required").max(2_000),
  reason: z.string().trim().max(500).optional(),
});

router.post("/admin/sessions/:id/revoke", requireOperator, async (req: Request, res: Response) => {
  try {
    const sessionRowId = String(req.params["id"] ?? "");
    if (!sessionRowId) {
      res.status(400).json({ error: "Missing session id" });
      return;
    }
    const parsed = RevokeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const { note, reason } = parsed.data;
    const actorId = (req as AuthReq).clerkUserId;

    const [row] = await db
      .select()
      .from(userSessionsTable)
      .where(eq(userSessionsTable.id, sessionRowId))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (row.revokedAt) {
      res.status(409).json({ error: "Session already revoked" });
      return;
    }
    if (row.clerkUserId === actorId) {
      res.status(400).json({ error: "Operators cannot revoke their own session" });
      return;
    }

    // 1. Best-effort Clerk revoke FIRST so the audit row records the
    //    actual Clerk outcome. Logs and continues on failure — the
    //    local revoke below is the authoritative gate.
    let clerkRevoked = false;
    if (row.clerkSessionId) {
      try {
        await clerkClient.sessions.revokeSession(row.clerkSessionId);
        clerkRevoked = true;
      } catch (err) {
        req.log?.warn?.({ err, clerkSessionId: row.clerkSessionId }, "Clerk revoke failed (local revoke still effective)");
      }
    }

    // 2. Atomic local revoke + audit row. Either both land or neither
    //    does — prevents the "revoked locally but no audit trail" or
    //    "audit row exists but session still passes" split states.
    const now = new Date();
    const auditId = randomUUID();
    await db.transaction(async (tx) => {
      await tx
        .update(userSessionsTable)
        .set({
          revokedAt:        now,
          revokedByAdminId: actorId,
          revokeReason:     reason ?? note,
        })
        .where(eq(userSessionsTable.id, sessionRowId));

      await tx.insert(userAdminActionsTable).values({
        id:           auditId,
        actorAdminId: actorId,
        targetUserId: row.clerkUserId,
        action:       "revoke_session",
        payload: {
          sessionRowId,
          clerkSessionId: row.clerkSessionId,
          ipAddress:      row.ipAddress,
          userAgent:      row.userAgent,
          note,
          reason:         reason ?? null,
          clerkRevoked,
        },
      });
    });

    try {
      executionStreamBus.emitEvent({
        type:     "admin_action_applied",
        severity: "warn",
        message:  `Admin ${actorId} revoked session for ${row.clerkUserId}`,
        details:  { auditId, sessionRowId, clerkRevoked },
      });
    } catch { /* never let stream emit fail a revoke */ }

    res.json({
      ok: true,
      sessionRowId,
      clerkRevoked,
      revokedAt: now.toISOString(),
    });
  } catch (err) {
    req.log?.error({ err }, "POST /admin/sessions/:id/revoke failed");
    res.status(500).json({ error: "Failed to revoke session" });
  }
});

export default router;
