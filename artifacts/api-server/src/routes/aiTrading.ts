/**
 * AI Trading enable/state endpoints.
 *
 * Canonical server-backed source of truth for the "AI ENABLED" toggle
 * surfaced on:
 *   - trading-dashboard `/portal` → EnableLiveAITradingBar
 *   - aicandlez-app PWA → AIAutoTradeContext + AssetDetail auto button
 *
 * Frontend MUST treat the response from these endpoints as authoritative.
 * localStorage state is a transient mirror only — even if a user
 * manually edits localStorage, the trading loop reads `user_settings.
 * autoMode` (set here, gated by `resolveAiTradingGate`) and the
 * per-execution live order gate re-validates plan + concurrent cap.
 *
 * Endpoints:
 *   GET  /api/user/ai-trading/state
 *     → { enabled, allowed, plan, isAdmin, reason }
 *
 *   POST /api/user/ai-trading/enable
 *     body: { enabled: boolean }
 *     200  → { enabled, allowed, plan, isAdmin, reason }
 *     402  → { error, needsUpgrade: true, plan, reason }
 *           — free user / inactive subscription / plan lacks
 *             aiAutoTrade. Frontend opens UpgradeModal.
 */

import { Router } from "express";
import { db, usersTable, userSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { resolveAiTradingGate } from "../lib/aiTradingGate.js";
import type { Request } from "express";

const router = Router();
type AuthReq = Request & { clerkUserId: string };

router.get("/user/ai-trading/state", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthReq).clerkUserId;
  try {
    const gate = await resolveAiTradingGate(userId);
    const [settings] = await db
      .select({ autoMode: userSettingsTable.autoMode })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);
    const persisted = settings?.autoMode === true;
    res.json({
      enabled: gate.allowed && persisted,
      allowed: gate.allowed,
      plan:    gate.plan,
      isAdmin: gate.isAdmin,
      reason:  gate.allowed ? null : gate.reason,
    });
  } catch (err) {
    req.log.error({ err, userId }, "GET /user/ai-trading/state failed — safe defaults");
    res.json({
      enabled: false,
      allowed: false,
      plan:    "free",
      isAdmin: false,
      reason:  "lookup_failed",
    });
  }
});

router.post("/user/ai-trading/enable", requireAuth, async (req, res): Promise<void> => {
  const userId         = (req as AuthReq).clerkUserId;
  const desired        = req.body?.enabled === true;
  const armedForLive   = req.body?.armedForLive === true;

  // Structured activation telemetry — every ARM LIVE attempt emits
  // [ARM_LIVE_REQUEST] on entry plus either [ARM_LIVE_ACCEPTED] on
  // success or [ARM_LIVE_REJECTED] on any branch that 4xx/5xx's.
  // Required for production triage so support can grep a single
  // userId across the entire activation lifecycle. Includes the
  // env kill switch + per-request ARM flag in every line so
  // operators don't need to cross-reference two log streams.
  const killSwitchEnabled = process.env.CUSTOMER_LIVE_EXECUTION_ENABLED === "true";
  req.log.info({
    tag:     "ARM_LIVE_REQUEST",
    userId,
    desired,
    armedForLive,
    killSwitchEnabled,
    surface: "ai_trading_enable",
  }, "[ARM_LIVE_REQUEST] activation attempt");

  // Resolve runtime exchange up-front so every reject branch can include
  // it in the structured log payload (consistent triage schema).
  let runtimeExchForLog: string | null = null;
  try {
    const [s] = await db
      .select({ activeRuntimeExchange: userSettingsTable.activeRuntimeExchange })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);
    runtimeExchForLog = s?.activeRuntimeExchange ?? null;
  } catch {
    // Best-effort — log payload field stays null if lookup fails.
  }

  try {
    const gate = await resolveAiTradingGate(userId);

    // Enabling requires entitlement. Disabling is always permitted (a
    // user / their admin can always turn AI off, even if their plan
    // lapsed mid-session).
    if (desired && !gate.allowed) {
      req.log.warn({
        tag:         "ARM_LIVE_REJECTED",
        userId,
        desired,
        armedForLive,
        reason:      gate.reason ?? "subscription_required",
        errorCode:   gate.reason ?? "subscription_required",
        plan:        gate.plan,
        isAdmin:     gate.isAdmin,
        runtimeExch: runtimeExchForLog,
        httpStatus:  402,
        killSwitchEnabled,
      }, "[ARM_LIVE_REJECTED] entitlement missing");
      res.status(402).json({
        error:        gate.reason ?? "subscription_required",
        errorCode:    gate.reason ?? "subscription_required",
        needsUpgrade: true,
        plan:         gate.plan,
        reason:       gate.reason,
      });
      return;
    }

    // Task #200 — runtime ARM gate. When the user's runtime context
    // resolves to live (activeRuntimeExchange is a real exchange id,
    // not null/"paper"), enabling AI auto-trade requires the client to
    // forward an explicit `armedForLive=true` flag from the per-session
    // ARM LIVE button. Admin/super-admin bypass — operator tooling is
    // governed by separate controls. The env kill switch
    // `CUSTOMER_LIVE_EXECUTION_ENABLED` remains the final server-side
    // gate at execution time regardless of this flag.
    if (desired && !gate.isAdmin) {
      const runtimeExch = runtimeExchForLog;
      const wouldBeLive = !!(runtimeExch && runtimeExch !== "paper");
      if (wouldBeLive && !armedForLive) {
        req.log.warn({
          tag:         "ARM_LIVE_REJECTED",
          userId,
          desired,
          armedForLive,
          reason:      "runtime_not_armed",
          errorCode:   "runtime_not_armed",
          runtimeExch,
          plan:        gate.plan,
          isAdmin:     gate.isAdmin,
          httpStatus:  412,
          killSwitchEnabled,
        }, "[ARM_LIVE_REJECTED] runtime_not_armed");
        // Legacy tag retained for any existing dashboards / log
        // queries pointed at AUTO_PROMOTION_BLOCKED.
        req.log.warn({
          tag: "AUTO_PROMOTION_BLOCKED",
          reason: "runtime_not_armed",
          userId, runtimeExch, surface: "ai_trading_enable",
        }, "[AUTO_PROMOTION_BLOCKED] runtime_not_armed");
        res.status(412).json({
          // Customer-facing copy: ARM LIVE chip was removed (May 2026);
          // ACTIVATE AI TRADING auto-arms before posting this endpoint.
          // Hitting this branch means client/server desync — instruct
          // the user to retry the ACTIVATE click.
          error:      "Couldn't authorize live execution. Tap ACTIVATE AI TRADING again to retry; refresh the page if it keeps failing.",
          errorCode:  "runtime_not_armed",
          needsArm:   true,
          runtimeExch,
        });
        return;
      }
    }

    // JIT-provision parent rows so the FK chain holds even on a fresh
    // Clerk session that hasn't yet hit /auth/me. Same defensive pattern
    // used by GET /user/settings.
    await db
      .insert(usersTable)
      .values({ clerkUserId: userId, email: "", role: "user" })
      .onConflictDoNothing();
    await db
      .insert(userSettingsTable)
      .values({ userId, autoMode: desired })
      .onConflictDoNothing();
    await db
      .update(userSettingsTable)
      .set({ autoMode: desired, updatedAt: new Date() })
      .where(eq(userSettingsTable.userId, userId));

    req.log.info({
      tag:     "ARM_LIVE_ACCEPTED",
      userId,
      desired,
      armedForLive,
      plan:    gate.plan,
      isAdmin: gate.isAdmin,
      killSwitchEnabled,
    }, "[ARM_LIVE_ACCEPTED] AI auto-trade state persisted");

    res.json({
      enabled: desired,
      allowed: gate.allowed,
      plan:    gate.plan,
      isAdmin: gate.isAdmin,
      reason:  null,
    });
  } catch (err) {
    req.log.error({
      tag:         "ARM_LIVE_REJECTED",
      userId,
      desired,
      armedForLive,
      reason:      "internal_error",
      errorCode:   "internal_error",
      runtimeExch: runtimeExchForLog,
      plan:        null,
      isAdmin:     null,
      httpStatus:  500,
      killSwitchEnabled,
      err,
    }, "[ARM_LIVE_REJECTED] POST /user/ai-trading/enable failed");
    res.status(500).json({ error: "Failed to update AI trading state", errorCode: "internal_error" });
  }
});

export default router;
