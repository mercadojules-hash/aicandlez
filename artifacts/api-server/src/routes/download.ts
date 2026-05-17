import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireAuth.js";
import { auditLogger } from "../services/telemetry/AuditLogger.js";
import type { Request } from "express";

// ── Internal operator download routes ─────────────────────────────────────────
//
// These routes are ONLY accessible to super-admin / admin users.
// All access is audit-logged. Regular users and unauthenticated requests receive 403.
//
// Base path: /api (mounted via index.ts)

const router: IRouter = Router();
type AuthReq = Request & { clerkUserId: string };

const DIST_DIR   = import.meta.dirname;
const NATURA_ZIP = path.resolve(DIST_DIR, "natura-ai.zip");
const PROD_ZIP   = path.resolve(DIST_DIR, "apex-trader-production.zip");

// ── GET /api/internal/download/natura ─────────────────────────────────────────
router.get(
  "/internal/download/natura",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  (req, res) => {
    const userId = (req as AuthReq).clerkUserId;
    auditLogger.append(userId, "ADMIN_ACTION", { action: "EXPORT_DOWNLOAD", file: "natura-ai.zip", ip: req.ip });
    if (!fs.existsSync(NATURA_ZIP)) {
      res.status(503).json({ error: "ZIP not yet built — run a fresh build first" });
      return;
    }
    res.download(NATURA_ZIP, "natura-ai.zip", (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: "Download failed", detail: String(err) });
      }
    });
  }
);

// ── GET /api/internal/download/production ─────────────────────────────────────
router.get(
  "/internal/download/production",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  (req, res) => {
    const userId = (req as AuthReq).clerkUserId;
    auditLogger.append(userId, "ADMIN_ACTION", { action: "EXPORT_DOWNLOAD", file: "aicandlez-production.zip", ip: req.ip });
    if (!fs.existsSync(PROD_ZIP)) {
      res.status(503).json({ error: "Production ZIP not yet built — run a fresh build first" });
      return;
    }
    res.download(PROD_ZIP, "aicandlez-production.zip", (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: "Download failed", detail: String(err) });
      }
    });
  }
);

export default router;
