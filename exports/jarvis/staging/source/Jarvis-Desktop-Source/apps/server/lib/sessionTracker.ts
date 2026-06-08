/**
 * CRM Phase A3 — Clerk session persistence + revocation gate.
 *
 * Called from `requireAuth` after Clerk verifies the JWT. Lazily
 * upserts a row into `user_sessions` keyed by Clerk's `sid`. Returns
 * a verdict the middleware uses to either continue, or fail the
 * request with 401 `session_revoked`.
 *
 * Performance discipline: this runs on EVERY authenticated request,
 * so the hot path is a single indexed SELECT. We only issue the
 * write when the row is missing or `lastSeenAt` is older than
 * SESSION_TOUCH_DEBOUNCE_MS. Fail-open on any DB error so a transient
 * outage doesn't lock everyone out.
 */
import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { sql } from "drizzle-orm";
import { db, userSessionsTable } from "@workspace/db";
import { logger } from "./logger.js";

const SESSION_TOUCH_DEBOUNCE_MS = 60_000;
const UA_MAX_LEN = 500;

export type SessionVerdict =
  | { allow: true; sessionRowId: string | null }
  | { allow: false; reason: string };

function extractIp(req: Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return (req.ip ?? req.socket?.remoteAddress ?? null)?.slice(0, 64) ?? null;
}

function extractUa(req: Request): string | null {
  const ua = req.headers["user-agent"];
  if (typeof ua !== "string" || !ua) return null;
  return ua.slice(0, UA_MAX_LEN);
}

/**
 * Touch (upsert) the session row for the current request and verify
 * it has not been revoked. Returns:
 *   - { allow: true,  sessionRowId } in the normal case
 *   - { allow: false, reason }       if the operator has revoked it
 *
 * Behavior when there is no Clerk sessionId (e.g. machine token or
 * mobile bearer path that bypasses sid issuance): allow + null row id.
 * Behavior on DB error: allow + null row id (fail-open).
 */
export async function touchSession(args: {
  req:             Request;
  clerkUserId:     string;
  clerkSessionId:  string | null;
}): Promise<SessionVerdict> {
  const { req, clerkUserId, clerkSessionId } = args;
  if (!clerkSessionId) return { allow: true, sessionRowId: null };

  try {
    // Hot path: single SELECT keyed on the unique sid index.
    const existing = await db
      .select({
        id:           userSessionsTable.id,
        revokedAt:    userSessionsTable.revokedAt,
        revokeReason: userSessionsTable.revokeReason,
        lastSeenAt:   userSessionsTable.lastSeenAt,
      })
      .from(userSessionsTable)
      .where(sql`${userSessionsTable.clerkSessionId} = ${clerkSessionId}`)
      .limit(1);

    const row = existing[0];

    if (row?.revokedAt) {
      return {
        allow:  false,
        reason: row.revokeReason ?? "Session revoked by administrator",
      };
    }

    const nowMs       = Date.now();
    const lastSeenMs  = row?.lastSeenAt ? new Date(row.lastSeenAt).getTime() : 0;
    const stale       = !row || (nowMs - lastSeenMs) > SESSION_TOUCH_DEBOUNCE_MS;

    if (!stale) return { allow: true, sessionRowId: row.id };

    const ip = extractIp(req);
    const ua = extractUa(req);

    if (row) {
      await db
        .update(userSessionsTable)
        .set({
          lastSeenAt: new Date(),
          ipAddress:  ip,
          userAgent:  ua,
        })
        .where(sql`${userSessionsTable.id} = ${row.id}`);
      return { allow: true, sessionRowId: row.id };
    }

    // Insert. Use ON CONFLICT DO NOTHING in case another concurrent
    // request just created the same sid row. We then re-select by
    // clerkSessionId so the returned `sessionRowId` is always the
    // canonical row id (ours if we won the race, the other writer's
    // id if we lost). Returning the locally-generated UUID after
    // losing a race would mislead downstream consumers.
    const id = randomUUID();
    await db
      .insert(userSessionsTable)
      .values({
        id,
        clerkSessionId,
        clerkUserId,
        ipAddress:   ip,
        userAgent:   ua,
        firstSeenAt: new Date(),
        lastSeenAt:  new Date(),
      })
      .onConflictDoNothing({ target: userSessionsTable.clerkSessionId });

    const [canonical] = await db
      .select({ id: userSessionsTable.id })
      .from(userSessionsTable)
      .where(sql`${userSessionsTable.clerkSessionId} = ${clerkSessionId}`)
      .limit(1);

    return { allow: true, sessionRowId: canonical?.id ?? id };
  } catch (err) {
    logger.warn({ err, clerkUserId, clerkSessionId }, "touchSession failed (fail-open)");
    return { allow: true, sessionRowId: null };
  }
}
