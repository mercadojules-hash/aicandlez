import { Router } from "express";
import {
  getConfig, getStatus, updateConfig, validateTrade, toggleKillSwitch,
} from "../lib/riskEngine.js";
import { auditLogger } from "../services/telemetry/AuditLogger.js";

const router = Router();

// GET /risk/config — current config + live status
router.get("/risk/config", (_req, res) => {
  res.json({ config: getConfig(), status: getStatus() });
});

// POST /risk/config — update config fields
router.post("/risk/config", (req, res) => {
  try {
    const config = updateConfig(req.body ?? {});
    res.json({ config, status: getStatus() });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /risk/validate — validate a hypothetical trade
router.post("/risk/validate", (req, res) => {
  const { sizeUSD } = req.body ?? {};
  if (typeof sizeUSD !== "number" || sizeUSD <= 0) {
    res.status(400).json({ error: "sizeUSD must be a positive number" });
    return;
  }
  res.json(validateTrade(sizeUSD));
});

// POST /risk/kill-switch — toggle kill switch
router.post("/risk/kill-switch", (req, res) => {
  const active    = toggleKillSwitch();
  const userId    = (req as import("express").Request & { clerkUserId?: string }).clerkUserId ?? "system";
  const ipAddress = req.ip ?? req.socket?.remoteAddress ?? null;

  auditLogger.append(
    userId,
    active ? "KILL_SWITCH_ON" : "KILL_SWITCH_OFF",
    { source: "risk-engine", reason: "manual", active },
    { severity: active ? "critical" : "warn", ipAddress: ipAddress ?? undefined },
  );

  res.json({ killSwitchActive: active, status: getStatus() });
});

export default router;
