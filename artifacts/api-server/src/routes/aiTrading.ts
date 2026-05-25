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
  const userId  = (req as AuthReq).clerkUserId;
  const desired = req.body?.enabled === true;

  try {
    const gate = await resolveAiTradingGate(userId);

    // Enabling requires entitlement. Disabling is always permitted (a
    // user / their admin can always turn AI off, even if their plan
    // lapsed mid-session).
    if (desired && !gate.allowed) {
      res.status(402).json({
        error:        gate.reason ?? "subscription_required",
        needsUpgrade: true,
        plan:         gate.plan,
        reason:       gate.reason,
      });
      return;
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

    res.json({
      enabled: desired,
      allowed: gate.allowed,
      plan:    gate.plan,
      isAdmin: gate.isAdmin,
      reason:  null,
    });
  } catch (err) {
    req.log.error({ err, userId, desired }, "POST /user/ai-trading/enable failed");
    res.status(500).json({ error: "Failed to update AI trading state" });
  }
});

export default router;
