/**
 * GET /api/admin/exchange-connections
 *
 * Platform-wide aggregate of every user's exchange connections.
 * Powers the /admin/exchange-connections operator page.
 *
 * Auth: admin / super-admin only.
 *
 * Returns:
 *   summary    — total connections, users with connections, users with
 *                live mode active, breakdown by exchange / mode / status
 *   rows       — flat per-connection rows joined to users (email, role)
 *
 * Never returns encrypted credential blobs — only metadata.
 */
import { Router, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  userExchangeConnectionsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

const router = Router();

interface ConnRow {
  id:             string;
  userId:         string;
  email:          string | null;
  role:           string | null;
  exchange:       string;
  label:          string;
  status:         string;
  tradingMode:    string;
  isDefault:      boolean;
  permissionsRead:    boolean | null;
  permissionsTrade:   boolean | null;
  permissionsWithdraw: boolean | null;
  lastVerifiedAt: string | null;
  lastError:      string | null;
  createdAt:      string;
  updatedAt:      string;
}

interface Summary {
  totalConnections:        number;
  usersWithConnections:    number;
  usersWithLiveMode:       number;
  byExchange:              Record<string, number>;
  byMode:                  Record<string, number>;
  byStatus:                Record<string, number>;
}

router.get(
  "/admin/exchange-connections",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (_req, res: Response): Promise<void> => {
    try {
      const joined = await db
        .select({
          id:             userExchangeConnectionsTable.id,
          userId:         userExchangeConnectionsTable.userId,
          email:          usersTable.email,
          role:           usersTable.role,
          exchange:       userExchangeConnectionsTable.exchange,
          label:          userExchangeConnectionsTable.label,
          status:         userExchangeConnectionsTable.status,
          tradingMode:    userExchangeConnectionsTable.tradingMode,
          isDefault:      userExchangeConnectionsTable.isDefault,
          permissions:    userExchangeConnectionsTable.permissions,
          lastVerifiedAt: userExchangeConnectionsTable.lastVerifiedAt,
          lastError:      userExchangeConnectionsTable.lastError,
          createdAt:      userExchangeConnectionsTable.createdAt,
          updatedAt:      userExchangeConnectionsTable.updatedAt,
        })
        .from(userExchangeConnectionsTable)
        .leftJoin(usersTable, eq(usersTable.clerkUserId, userExchangeConnectionsTable.userId))
        .orderBy(desc(userExchangeConnectionsTable.updatedAt));

      const rows: ConnRow[] = joined.map(r => ({
        id:             r.id,
        userId:         r.userId,
        email:          r.email,
        role:           r.role,
        exchange:       r.exchange,
        label:          r.label,
        status:         r.status,
        tradingMode:    r.tradingMode,
        isDefault:      r.isDefault,
        permissionsRead:     r.permissions?.read ?? null,
        permissionsTrade:    r.permissions?.trade ?? null,
        permissionsWithdraw: r.permissions?.withdraw ?? null,
        lastVerifiedAt: r.lastVerifiedAt ? r.lastVerifiedAt.toISOString() : null,
        lastError:      r.lastError,
        createdAt:      r.createdAt.toISOString(),
        updatedAt:      r.updatedAt.toISOString(),
      }));

      const userIds        = new Set<string>();
      const usersLive      = new Set<string>();
      const byExchange: Record<string, number> = {};
      const byMode:     Record<string, number> = {};
      const byStatus:   Record<string, number> = {};

      for (const r of rows) {
        userIds.add(r.userId);
        if (r.tradingMode === "live") usersLive.add(r.userId);
        byExchange[r.exchange] = (byExchange[r.exchange] ?? 0) + 1;
        byMode[r.tradingMode]  = (byMode[r.tradingMode] ?? 0) + 1;
        byStatus[r.status]     = (byStatus[r.status] ?? 0) + 1;
      }

      const summary: Summary = {
        totalConnections:     rows.length,
        usersWithConnections: userIds.size,
        usersWithLiveMode:    usersLive.size,
        byExchange,
        byMode,
        byStatus,
      };

      res.json({ summary, rows, timestamp: Date.now() });
    } catch (err) {
      const { logger } = await import("../lib/logger.js");
      logger.error({ err }, "admin_exchange_connections_failed");
      res.status(500).json({ error: "internal_error" });
    }
  },
);

export default router;
