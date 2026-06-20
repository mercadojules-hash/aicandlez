import { Router, type Request } from "express";
import { db, userAdminActionsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import {
  buildRiskGovernorReport24h,
  getRiskGovernorStatusForUser,
  isRiskGovernorEnabled,
  setRiskGovernorManualOverride,
} from "../lib/riskGovernor.js";
import { generateId } from "../lib/trading.js";

type AuthReq = Request & { clerkUserId: string };

const router = Router();
const requireOperator = [requireAuth, requireRole(["admin", "super-admin"])];

router.get("/user/risk-governor/status", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const status = await getRiskGovernorStatusForUser(userId);
    const report24h = await buildRiskGovernorReport24h(userId);
    res.json({ enabled: isRiskGovernorEnabled(), status, report24h });
  } catch (err) {
    req.log.error({ err, userId }, "GET /user/risk-governor/status failed");
    res.status(500).json({ error: "risk_governor_status_failed" });
  }
});

router.get("/admin/risk-governor/:userId", ...requireOperator, async (req, res): Promise<void> => {
  const targetUserId = typeof req.params.userId === "string" ? req.params.userId : "";
  if (!targetUserId) {
    res.status(400).json({ error: "missing_user_id" });
    return;
  }
  try {
    const status = await getRiskGovernorStatusForUser(targetUserId);
    const report24h = await buildRiskGovernorReport24h(targetUserId);
    res.json({ enabled: isRiskGovernorEnabled(), status, report24h });
  } catch (err) {
    req.log.error({ err, targetUserId }, "GET /admin/risk-governor/:userId failed");
    res.status(500).json({ error: "risk_governor_status_failed" });
  }
});

router.post("/admin/risk-governor/:userId/override", ...requireOperator, async (req, res): Promise<void> => {
  const targetUserId = typeof req.params.userId === "string" ? req.params.userId : "";
  if (!targetUserId) {
    res.status(400).json({ error: "missing_user_id" });
    return;
  }
  const actorAdminId = (req as AuthReq).clerkUserId;
  const active = req.body?.active === true;
  const expiresAtRaw = req.body?.expiresAt;
  const expiresAt = typeof expiresAtRaw === "string" && expiresAtRaw.trim()
    ? new Date(expiresAtRaw)
    : null;
  if (expiresAt && !Number.isFinite(expiresAt.getTime())) {
    res.status(400).json({ error: "invalid_expires_at" });
    return;
  }
  try {
    const status = await setRiskGovernorManualOverride({
      userId: targetUserId,
      active,
      actorAdminId,
      expiresAt,
    });
    try {
      await db.insert(userAdminActionsTable).values({
        id: generateId(),
        actorAdminId,
        targetUserId,
        action: "note",
        payload: {
          kind: active ? "risk_governor_manual_override_enabled" : "risk_governor_manual_override_disabled",
          active,
          expiresAt: expiresAt?.toISOString() ?? null,
          note: typeof req.body?.note === "string" ? req.body.note : null,
        },
      });
    } catch (err) {
      req.log.warn({ err, actorAdminId, targetUserId }, "risk governor override admin audit insert failed");
    }
    res.json({ enabled: isRiskGovernorEnabled(), status });
  } catch (err) {
    req.log.error({ err, targetUserId, actorAdminId }, "POST /admin/risk-governor/:userId/override failed");
    res.status(500).json({ error: "risk_governor_override_failed" });
  }
});

export default router;
