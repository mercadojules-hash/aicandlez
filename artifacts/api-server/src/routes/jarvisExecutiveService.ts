import { Router, type Request, type Response } from "express";
import { requireJarvisServiceAuth } from "../middlewares/requireJarvisServiceAuth.js";
import { auditJarvisServiceRequest } from "../lib/jarvisServiceAudit.js";
import {
  buildJarvisExecutiveReport,
  buildJarvisReport24h,
  buildJarvisRiskGovernorReport,
  buildJarvisTradesReport,
} from "../lib/jarvisExecutiveReports.js";

const router = Router();
const READ_SCOPE = "aicandlez:read";

function readOnlyRoute(
  path: string,
  action: string,
  build: (req: Request) => Promise<Record<string, unknown>>,
) {
  router.get(path, requireJarvisServiceAuth(READ_SCOPE), async (req: Request, res: Response): Promise<void> => {
    try {
      const body = await build(req);
      await auditJarvisServiceRequest(req, {
        action,
        route: req.originalUrl || path,
        method: req.method,
        status: 200,
        scope: READ_SCOPE,
        outcome: "allowed",
      });
      res.json(body);
    } catch (err) {
      await auditJarvisServiceRequest(req, {
        action,
        route: req.originalUrl || path,
        method: req.method,
        status: 500,
        scope: READ_SCOPE,
        outcome: "failed",
        reason: "handler_failed",
      });
      req.log?.error?.({ err, path }, "jarvis executive service route failed");
      res.status(500).json({ error: "jarvis_executive_service_failed" });
    }
  });
}

readOnlyRoute(
  "/jarvis/service/aicandlez/executive",
  "jarvis.service.executive.read",
  async () => buildJarvisExecutiveReport(),
);

readOnlyRoute(
  "/jarvis/service/aicandlez/report-24h",
  "jarvis.service.report24h.read",
  async () => buildJarvisReport24h(),
);

readOnlyRoute(
  "/jarvis/service/aicandlez/risk-governor",
  "jarvis.service.risk_governor.read",
  async () => buildJarvisRiskGovernorReport(),
);

readOnlyRoute(
  "/jarvis/service/aicandlez/trades",
  "jarvis.service.trades.read",
  async (req) => {
    const raw = typeof req.query["limit"] === "string" ? Number(req.query["limit"]) : 50;
    return buildJarvisTradesReport(Number.isFinite(raw) ? raw : 50);
  },
);

export default router;
