import { Router } from "express";
import { db } from "@workspace/db";
import { userSettingsTable, userConsentsTable, usersTable, DISCLAIMER_VERSION, ALERT_KEYS, type AlertKey, type AlertPrefs } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import type { Request } from "express";

const router = Router();

type AuthReq = Request & { clerkUserId: string };

// Default settings shape — mirrors the column defaults in
// `lib/db/src/schema/userSettings.ts`. Returned by GET /user/settings
// whenever a row cannot be loaded OR JIT-provisioned (e.g. the parent
// `users` row hasn't been created yet because the frontend raced ahead
// of /auth/me). Guarantees the endpoint NEVER 500s during portal
// bootstrap, which previously cascaded into a render crash.
function defaultSettings(userId: string) {
  const now = new Date();
  return {
    id:                          "default",
    userId,
    aiPersonality:               "balanced",
    minConfidence:               60,
    riskLevel:                   "moderate",
    positionSizeUSD:             20,
    maxTradesPerDay:             5,
    maxActivePositions:          3,
    stopLossPercent:             2,
    takeProfitPercent:           4,
    autoMode:                    false,
    tradingMode:                 "simulation",
    volumeFilter:                true,
    require1HTrend:              false,
    preferredExchange:           "Kraken",
    preferredLiveOrderSizeUsd:   100,
    paperSandboxEnabled:         false,
    notificationsTradeExec:      true,
    notificationsSignals:        false,
    notificationsRiskAlerts:     true,
    notificationsLiveFills:      true,
    exchangeOutageEmailEnabled:  true,
    exchangeOutagePushEnabled:   true,
    alertPrefs:                  {} as AlertPrefs,
    timezone:                    "UTC",
    currency:                    "USD",
    createdAt:                   now,
    updatedAt:                   now,
  };
}

async function getOrCreateSettings(userId: string) {
  let row = await db
    .select()
    .from(userSettingsTable)
    .where(eq(userSettingsTable.userId, userId))
    .limit(1)
    .then((r) => r[0]);

  if (!row) {
    // JIT-provision the parent `users` row first. The settings table FKs
    // into users.clerkUserId — without this, a fresh Clerk session that
    // hasn't hit /auth/me yet would trigger a FK violation here and
    // bubble up as a 500. Idempotent via onConflictDoNothing.
    await db
      .insert(usersTable)
      .values({ clerkUserId: userId, email: "", role: "user" })
      .onConflictDoNothing();

    [row] = await db
      .insert(userSettingsTable)
      .values({ userId })
      .onConflictDoNothing()
      .returning();

    // Settings race: another concurrent request created the row between
    // our SELECT and INSERT — re-read.
    if (!row) {
      row = await db
        .select()
        .from(userSettingsTable)
        .where(eq(userSettingsTable.userId, userId))
        .limit(1)
        .then((r) => r[0]);
    }
  }

  return row;
}

router.get("/user/settings", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const settings = await getOrCreateSettings(userId);
    if (settings) {
      res.json(settings);
      return;
    }
    // Should be unreachable after the JIT path above, but if a deeper
    // DB issue still produced no row, return safe defaults instead of
    // 500 so the portal can hydrate without crashing.
    req.log.warn({ userId }, "GET /user/settings produced no row — returning defaults");
    res.json(defaultSettings(userId));
  } catch (err) {
    // Production-safety: never 500 from settings on bootstrap. Log the
    // real error for triage, but hand the client a valid default-shaped
    // payload so the portal stays alive. Mutations (PUT) still 500 on
    // failure — only the GET bootstrap path falls back here.
    req.log.error({ err, userId }, "GET /user/settings failed — returning defaults");
    res.json(defaultSettings(userId));
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
    "preferredLiveOrderSizeUsd",
    "paperSandboxEnabled",
    "notificationsTradeExec", "notificationsSignals", "notificationsRiskAlerts",
    "notificationsLiveFills",
    "exchangeOutageEmailEnabled", "exchangeOutagePushEnabled",
    "alertPrefs",
    "timezone", "currency",
  ]);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(body)) {
    if (!allowed.has(k)) continue;
    if (k === "alertPrefs") {
      // Sanitize: only persist known AlertKeys with boolean values, and
      // merge with the existing row so partial patches don't wipe other
      // keys. We always merge (not replace) so a phone toggling one alert
      // doesn't reset every other alert to default on another device.
      if (!v || typeof v !== "object") continue;
      const incoming = v as Record<string, unknown>;
      const cleaned: AlertPrefs = {};
      for (const key of ALERT_KEYS) {
        const val = incoming[key];
        if (typeof val === "boolean") cleaned[key as AlertKey] = val;
      }
      patch.alertPrefs = cleaned;        // resolved below after merge with current
      patch.__mergeAlertPrefs = true;    // sentinel handled before update
    } else {
      patch[k] = v;
    }
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
    const current = await getOrCreateSettings(userId);
    if (patch.__mergeAlertPrefs) {
      delete patch.__mergeAlertPrefs;
      const existing = (current.alertPrefs ?? {}) as AlertPrefs;
      patch.alertPrefs = { ...existing, ...(patch.alertPrefs as AlertPrefs) };
    }
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
