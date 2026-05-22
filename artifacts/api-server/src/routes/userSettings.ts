import { Router } from "express";
import { db } from "@workspace/db";
import { userSettingsTable, userConsentsTable, usersTable, DISCLAIMER_VERSION } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import type { Request } from "express";

const router = Router();

type AuthReq = Request & { clerkUserId: string };

async function getOrCreateSettings(userId: string) {
  let row = await db
    .select()
    .from(userSettingsTable)
    .where(eq(userSettingsTable.userId, userId))
    .limit(1)
    .then((r) => r[0]);

  if (!row) {
    [row] = await db
      .insert(userSettingsTable)
      .values({ userId })
      .returning();
  }

  return row!;
}

router.get("/user/settings", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const settings = await getOrCreateSettings(userId);
    res.json(settings);
  } catch (err) {
    req.log.error({ err }, "GET /user/settings failed");
    res.status(500).json({ error: "Failed to load settings" });
  }
});

router.put("/user/settings", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  const body   = req.body ?? {};

  const allowed = new Set([
    "aiPersonality", "minConfidence",
    "riskLevel", "positionSizeUSD", "maxTradesPerDay", "maxActivePositions",
    "stopLossPercent", "takeProfitPercent",
    "autoMode", "tradingMode",
    "volumeFilter", "require1HTrend",
    "preferredExchange",
    "notificationsTradeExec", "notificationsSignals", "notificationsRiskAlerts",
    "notificationsLiveFills",
    "timezone", "currency",
  ]);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k)) patch[k] = v;
  }

  if (Object.keys(patch).length === 1) {
    res.status(400).json({ error: "No valid fields provided" });
    return;
  }

  // Risk-disclaimer gate: any attempt to enable LIVE execution or AUTONOMOUS
  // (auto) AI trading requires the current disclaimer version to be accepted.
  // Operator roles (admin / super-admin) bypass. Customers without acceptance
  // get 412 + the same envelope the client gate already understands.
  const enablesLive = patch.tradingMode === "live";
  const enablesAuto = patch.autoMode === true;
  if (enablesLive || enablesAuto) {
    try {
      const [userRow] = await db.select({ role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.clerkUserId, userId))
        .limit(1);
      const isOperator = userRow?.role === "admin" || userRow?.role === "super-admin";
      if (!isOperator) {
        const [accepted] = await db.select({ version: userConsentsTable.consentVersion })
          .from(userConsentsTable)
          .where(and(
            eq(userConsentsTable.userId, userId),
            eq(userConsentsTable.consentVersion, DISCLAIMER_VERSION),
          ))
          .orderBy(desc(userConsentsTable.createdAt))
          .limit(1);
        if (!accepted) {
          res.status(412).json({
            error:             "Risk disclaimer must be accepted before enabling live or autonomous AI trading.",
            needsDisclaimer:   true,
            disclaimerVersion: DISCLAIMER_VERSION,
          });
          return;
        }
      }
    } catch (err) {
      req.log.error({ err }, "PUT /user/settings disclaimer gate failed");
      res.status(500).json({ error: "Failed to verify disclaimer acceptance" });
      return;
    }
  }

  try {
    await getOrCreateSettings(userId);
    const [updated] = await db
      .update(userSettingsTable)
      .set(patch)
      .where(eq(userSettingsTable.userId, userId))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "PUT /user/settings failed");
    res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;
