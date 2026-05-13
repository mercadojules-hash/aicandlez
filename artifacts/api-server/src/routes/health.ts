import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getWsStats } from "../lib/wsServer.js";

const router: IRouter = Router();

const startTime = Date.now();

router.get("/healthz", async (_req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  // DB ping
  let dbStatus: "ok" | "error" = "ok";
  let dbLatencyMs: number | null = null;

  try {
    const t0 = Date.now();
    await db.execute(sql`SELECT 1`);
    dbLatencyMs = Date.now() - t0;
  } catch {
    dbStatus = "error";
  }

  const ws = getWsStats();

  const status = dbStatus === "ok" ? "ok" : "degraded";

  res.status(status === "ok" ? 200 : 503).json({
    status,
    version:      process.env["npm_package_version"] ?? "unknown",
    env:          process.env["NODE_ENV"] ?? "development",
    uptimeSeconds: uptime,
    db: {
      status:    dbStatus,
      latencyMs: dbLatencyMs,
    },
    websocket: {
      connected: ws.connected,
    },
    timestamp: new Date().toISOString(),
  });
});

// Lightweight liveness probe — no DB call (used by load balancers on every tick)
router.get("/livez", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

export default router;
