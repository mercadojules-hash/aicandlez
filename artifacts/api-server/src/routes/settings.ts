import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable, logsTable, userAdminActionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateId } from "../lib/trading.js";
import { settingsStore } from "../lib/settingsStore.js";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import type { Request } from "express";

const router = Router();
// Global kill switch is the platform's last-resort circuit breaker. It
// halts the entire trading loop (tradingLoop.ts respects settings.killSwitch
// at tick start) and is therefore operator-only — never customer-callable.
const requireOperator = [requireAuth, requireRole(["admin", "super-admin"])];

async function ensureSettings() {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, "default")).limit(1);
  if (rows.length === 0) {
    await db.insert(settingsTable).values({ id: "default" });
    const newRows = await db.select().from(settingsTable).where(eq(settingsTable.id, "default")).limit(1);
    return newRows[0];
  }
  return rows[0];
}

function formatSettings(s: typeof settingsTable.$inferSelect) {
  return {
    allocation: s.allocation,
    stopLossPercent: s.stopLossPercent,
    takeProfitPercent: s.takeProfitPercent,
    maxTradesPerDay: s.maxTradesPerDay,
    minConfidence: s.minConfidence,
    autoMode: s.autoMode,
    liveTrading: s.liveTrading,
    killSwitch: s.killSwitch,
    binanceApiKey: s.binanceApiKey ?? null,
    binanceApiSecret: s.binanceApiSecret ? "***" : null,
  };
}

router.get("/settings", async (req, res) => {
  const settings = await ensureSettings();
  res.json(formatSettings(settings));
});

router.put("/settings", ...requireOperator, async (req, res) => {
  await ensureSettings();
  const update: Partial<typeof settingsTable.$inferInsert> = {};

  if (req.body.allocation !== undefined) update.allocation = req.body.allocation;
  if (req.body.stopLossPercent !== undefined) update.stopLossPercent = req.body.stopLossPercent;
  if (req.body.takeProfitPercent !== undefined) update.takeProfitPercent = req.body.takeProfitPercent;
  if (req.body.maxTradesPerDay !== undefined) update.maxTradesPerDay = req.body.maxTradesPerDay;
  if (req.body.minConfidence !== undefined) update.minConfidence = req.body.minConfidence;
  if (req.body.autoMode !== undefined) update.autoMode = req.body.autoMode;
  if (req.body.liveTrading !== undefined) update.liveTrading = req.body.liveTrading;
  if (req.body.binanceApiKey !== undefined) update.binanceApiKey = req.body.binanceApiKey;
  if (req.body.binanceApiSecret !== undefined) update.binanceApiSecret = req.body.binanceApiSecret;

  await db.update(settingsTable).set(update).where(eq(settingsTable.id, "default"));

  // Keep in-memory settings store in sync so trading loop picks up changes
  // immediately, even when DATABASE_URL is not set (mock DB).
  settingsStore.patch({
    ...(update.autoMode          !== undefined && { autoMode:          update.autoMode }),
    ...(update.killSwitch        !== undefined && { killSwitch:        update.killSwitch }),
    ...(update.minConfidence     !== undefined && { minConfidence:     update.minConfidence }),
    ...(update.allocation        !== undefined && { allocation:        update.allocation }),
    ...(update.stopLossPercent   !== undefined && { stopLossPercent:   update.stopLossPercent }),
    ...(update.takeProfitPercent !== undefined && { takeProfitPercent: update.takeProfitPercent }),
    ...(update.maxTradesPerDay   !== undefined && { maxTradesPerDay:   update.maxTradesPerDay }),
  });

  await db.insert(logsTable).values({
    id: generateId(),
    type: "system",
    level: "info",
    message: `Settings updated: ${Object.keys(update).join(", ")}`,
    details: Object.fromEntries(
      Object.entries(update).filter(([k]) => !k.toLowerCase().includes("secret") && !k.toLowerCase().includes("key"))
    ),
  });

  const updated = await db.select().from(settingsTable).where(eq(settingsTable.id, "default")).limit(1);
  res.json(formatSettings(updated[0]));
});

router.post("/settings/kill-switch", ...requireOperator, async (req, res) => {
  const active = req.body?.active === true;
  const adminId = (req as Request & { clerkUserId?: string }).clerkUserId ?? "unknown";

  await ensureSettings();

  // Read prior state for audit trail.
  const [before] = await db
    .select({ killSwitch: settingsTable.killSwitch })
    .from(settingsTable)
    .where(eq(settingsTable.id, "default"))
    .limit(1);
  const previous = before?.killSwitch ?? false;

  await db.update(settingsTable).set({ killSwitch: active }).where(eq(settingsTable.id, "default"));
  settingsStore.patch({ killSwitch: active }); // keep in-memory store in sync

  // Dual audit: system logs (visible in operator log streams) + admin
  // actions table (per-actor forensic trail). Admin actions table requires
  // a targetUserId; we use the actor as target since this is a global
  // platform change, not a user-scoped action.
  await db.insert(logsTable).values({
    id: generateId(),
    type: "system",
    level: active ? "error" : "success",
    message: active
      ? `KILL SWITCH ACTIVATED by ${adminId} — All trading stopped immediately`
      : `Kill switch deactivated by ${adminId} — Trading resumed`,
    details: { killSwitch: active, previous, adminId },
  });

  try {
    await db.insert(userAdminActionsTable).values({
      id: generateId(),
      actorAdminId: adminId,
      targetUserId: adminId,
      action: active ? "emergency_disable" : "note",
      payload: {
        kind: active ? "global_kill_switch_activated" : "global_kill_switch_deactivated",
        killSwitch: active,
        previous,
        scope: "platform_global",
      },
    });
  } catch (err) {
    req.log.warn({ err, adminId }, "kill-switch audit row insert failed (non-fatal)");
  }

  res.json({
    killSwitch: active,
    message: active ? "Kill switch activated. All trading has been stopped." : "Kill switch deactivated. Trading resumed.",
  });
});

export default router;
