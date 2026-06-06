/**
 * GET /api/admin/system-resources — real production resource snapshot for the
 * admin Platform Resource & Billing Telemetry surface (ADMIN / super-admin).
 *
 * All values are real (process + OS + DB + engine state). Nothing simulated —
 * anything genuinely unavailable is returned as null so the UI renders a dash.
 *
 * Scope limitation (surfaced to the operator in-UI): a running production app
 * cannot read the Replit workspace usage meter, Replit AI credit balance, or
 * Render's billing API. Those remain deep-links + the manual cost estimate.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import os from "node:os";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { usageDailyTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { engineStats } from "../lib/tradingLoop.js";
import { executionTelemetry } from "../services/telemetry/ExecutionTelemetry.js";
import { flushUsageCounters } from "../lib/usageCounters.js";

const router: IRouter = Router();
const PROCESS_STARTED_AT_MS = Date.now();

function utcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

router.get(
  "/admin/system-resources",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Instantaneous process CPU% sampled over a short window.
      const startCpu = process.cpuUsage();
      const startHr = process.hrtime.bigint();
      await new Promise((r) => setTimeout(r, 120));
      const dCpu = process.cpuUsage(startCpu);
      const elapsedMicros = Number(process.hrtime.bigint() - startHr) / 1000;
      const cores = os.cpus().length || 1;
      const cpuPct =
        elapsedMicros > 0
          ? ((dCpu.user + dCpu.system) / (elapsedMicros * cores)) * 100
          : 0;

      const mem = process.memoryUsage();

      // DB size (best-effort).
      let dbSizeBytes: number | null = null;
      try {
        const r = await db.execute(
          sql`SELECT pg_database_size(current_database())::bigint AS size`,
        );
        dbSizeBytes = Number(
          (r.rows?.[0] as { size?: string | number })?.size ?? 0,
        );
      } catch {
        dbSizeBytes = null;
      }

      // Real counts.
      const totalUsers = Number(
        (
          (await db.execute(sql`SELECT count(*)::int AS n FROM users`))
            .rows?.[0] as { n?: number }
        )?.n ?? 0,
      );
      const openTotal = Number(
        (
          (await db.execute(sql`SELECT count(*)::int AS n FROM sim_positions`))
            .rows?.[0] as { n?: number }
        )?.n ?? 0,
      );
      const openLive = Number(
        (
          (
            await db.execute(
              sql`SELECT count(*)::int AS n FROM sim_positions WHERE exchange IS NOT NULL`,
            )
          ).rows?.[0] as { n?: number }
        )?.n ?? 0,
      );
      const connections = Number(
        (
          (
            await db.execute(
              sql`SELECT count(*)::int AS n FROM user_exchange_connections`,
            )
          ).rows?.[0] as { n?: number }
        )?.n ?? 0,
      );

      // Fresh today-usage row.
      await flushUsageCounters().catch(() => {});
      const [usageToday] = await db
        .select()
        .from(usageDailyTable)
        .where(eq(usageDailyTable.day, utcDayKey()))
        .limit(1);

      const exchangeLatency = (() => {
        try {
          return executionTelemetry.getLatencyStats();
        } catch {
          return [];
        }
      })();

      res.json({
        process: {
          uptimeSeconds: Math.floor((Date.now() - PROCESS_STARTED_AT_MS) / 1000),
          nodeUptimeSeconds: Math.floor(process.uptime()),
          cpuPct: Math.round(cpuPct * 10) / 10,
          cpuCores: cores,
          memory: {
            rssBytes: mem.rss,
            heapUsedBytes: mem.heapUsed,
            heapTotalBytes: mem.heapTotal,
            externalBytes: mem.external,
          },
          systemTotalMemBytes: os.totalmem(),
          systemFreeMemBytes: os.freemem(),
          loadAvg1m: os.loadavg()[0] ?? null,
        },
        database: { sizeBytes: dbSizeBytes },
        engine: {
          running: engineStats.running,
          startedAt: engineStats.startedAt ?? null,
          lastTickAt: engineStats.lastTickAt ?? null,
          signalsGenerated: engineStats.signalsGenerated ?? 0,
          tradesExecuted: engineStats.tradesExecuted ?? 0,
        },
        counts: {
          totalUsers,
          openPositions: openTotal,
          openLivePositions: openLive,
          exchangeConnections: connections,
        },
        usageToday: usageToday
          ? {
              apiRequests: usageToday.apiRequests,
              activeUsers: usageToday.activeUsers,
              trades: usageToday.trades,
              peakRssBytes: usageToday.peakRssBytes,
            }
          : null,
        exchangeLatency,
        generatedAt: Date.now(),
      });
    } catch (err) {
      req.log.error({ err }, "GET /admin/system-resources failed");
      res.status(500).json({ error: "system_resources_failed" });
    }
  },
);

export default router;
