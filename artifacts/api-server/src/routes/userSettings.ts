import { Router } from "express";
import { db } from "@workspace/db";
import { userSettingsTable, userConsentsTable, userExchangeConnectionsTable, usersTable, DISCLAIMER_VERSION, ALERT_KEYS, type AlertKey, type AlertPrefs } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { resolveAiTradingGate } from "../lib/aiTradingGate.js";
import { ALLOWED_TRADE_SIZES, DEFAULT_TRADE_SIZE_USD, isAllowedTradeSize } from "../lib/liquidityGuard.js";
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
    activeRuntimeExchange:       null as string | null,
    preferredLiveOrderSizeUsd:   DEFAULT_TRADE_SIZE_USD,
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
    // NOTE: `volumeFilter` is intentionally OMITTED from the customer-writable
    // allowlist. Volume Filter is a MANDATORY platform-wide safety control —
    // free / starter / customer accounts cannot disable it. The DB column
    // defaults to `true` (lib/db/src/schema/userSettings.ts), and the
    // execution layer (`liveUserExecution.ts` gate 0VOL) enforces the same
    // invariant regardless of the stored value. Admins may still edit the
    // per-user flag for diagnostic / visibility purposes via the operator
    // PATCH `/api/admin/users/:id/ai-settings` (`adminUserProfile.ts`).
    "require1HTrend",
    "preferredExchange",
    "activeRuntimeExchange",
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
    if (k === "activeRuntimeExchange") {
      // Task #204 gate: only allow `null`, the literal `"paper"` opt-in,
      // or an exchange the user already has a `status="active"`
      // connection for. This prevents onboarding (or any future client
      // surface) from pre-stamping `activeRuntimeExchange` with a value
      // like "Alpaca" before any real exchange connection exists —
      // which would otherwise block Task #200's auto-promotion with
      // `[AUTO_PROMOTION_BLOCKED reason=existing_choice]` forever.
      //
      // The legitimate writers are unaffected: the runtime switcher
      // (Task #199) only offers exchanges the user has connected, and
      // the auto-promote path in `userExchanges.ts` writes directly to
      // the DB (bypassing this route).
      if (v === null || v === "paper") {
        patch[k] = v;
      } else if (typeof v === "string" && v.length > 0) {
        const [conn] = await db
          .select({ id: userExchangeConnectionsTable.id })
          .from(userExchangeConnectionsTable)
          .where(and(
            eq(userExchangeConnectionsTable.userId, userId),
            eq(userExchangeConnectionsTable.exchange, v),
            eq(userExchangeConnectionsTable.status, "active"),
          ))
          .limit(1);
        if (!conn) {
          req.log.warn({
            userId, attemptedExchange: v,
            tag: "RUNTIME_WRITE_REJECTED",
            reason: "no_active_connection",
          }, "[RUNTIME_WRITE_REJECTED] PUT /user/settings refused activeRuntimeExchange");
          res.status(409).json({
            error:     `Cannot set activeRuntimeExchange to "${v}": no active connection for that exchange.`,
            errorCode: "no_active_connection",
          });
          return;
        }
        patch[k] = v;
      } else {
        res.status(400).json({
          error: "activeRuntimeExchange must be null, 'paper', or a connected exchange id",
        });
        return;
      }
    } else if (k === "alertPrefs") {
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
    } else if (k === "autoMode") {
      // Strict boolean coercion — never accept truthy non-bools like
      // "true" / 1 / "1" / "on". A free user trying to bypass the
      // subscription gate by sending `{"autoMode":"true"}` would
      // otherwise skip the `=== true` check below and reach the DB
      // write. Reject anything that isn't a literal boolean.
      if (typeof v !== "boolean") {
        res.status(400).json({ error: "autoMode must be a boolean" });
        return;
      }
      patch[k] = v;
    } else if (k === "tradingMode") {
      // Whitelist enum — same anti-bypass rationale as `autoMode`.
      if (v !== "simulation" && v !== "live") {
        res.status(400).json({ error: "tradingMode must be 'simulation' or 'live'" });
        return;
      }
      patch[k] = v;
    } else if (k === "preferredLiveOrderSizeUsd") {
      // Customer AI trade-size preset whitelist. Mirrors the picker in
      // the PWA + Portal: only {10, 20, 50, 100} land on disk. Any other
      // value (legacy 250, free-form 7, "$10", etc.) is rejected so the
      // liquidity guard math (`lib/liquidityGuard.ts`) always operates
      // on a known-good size. Numeric strings ("20") are coerced first.
      const n = typeof v === "string" ? Number(v) : v;
      if (!isAllowedTradeSize(n)) {
        res.status(400).json({
          error:   `preferredLiveOrderSizeUsd must be one of ${ALLOWED_TRADE_SIZES.join(", ")}`,
          allowed: ALLOWED_TRADE_SIZES,
        });
        return;
      }
      patch[k] = n;
    } else {
      patch[k] = v;
    }
  }

  if (Object.keys(patch).length === 1) {
    res.status(400).json({ error: "No valid fields provided" });
    return;
  }

  // Subscription gate: AI auto-trading + live execution require an
  // active paid plan. Admin/super-admin bypass (operator surface). This
  // duplicates the gate in POST /user/ai-trading/enable to defend
  // against clients that bypass the dedicated endpoint and patch
  // `autoMode` directly via PUT /user/settings. Server is the
  // authoritative source — never trust client-side state.
  const enablesLive = patch.tradingMode === "live";
  const enablesAuto = patch.autoMode === true;
  if (enablesLive || enablesAuto) {
    try {
      const gate = await resolveAiTradingGate(userId);
      if (!gate.allowed) {
        res.status(402).json({
          error:        gate.reason ?? "subscription_required",
          needsUpgrade: true,
          plan:         gate.plan,
          reason:       gate.reason,
        });
        return;
      }
    } catch (err) {
      req.log.error({ err, userId }, "PUT /user/settings subscription gate failed");
      res.status(500).json({ error: "Failed to verify subscription" });
      return;
    }
  }
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
