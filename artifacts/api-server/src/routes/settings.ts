import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable, logsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateId } from "../lib/trading.js";
import { settingsStore } from "../lib/settingsStore.js";

const router = Router();

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

router.put("/settings", async (req, res) => {
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

router.post("/settings/kill-switch", async (req, res) => {
  const { active } = req.body;
  await ensureSettings();

  await db.update(settingsTable).set({ killSwitch: active }).where(eq(settingsTable.id, "default"));
  settingsStore.patch({ killSwitch: active }); // keep in-memory store in sync

  await db.insert(logsTable).values({
    id: generateId(),
    type: "system",
    level: active ? "error" : "success",
    message: active ? "KILL SWITCH ACTIVATED — All trading stopped immediately" : "Kill switch deactivated — Trading resumed",
    details: { killSwitch: active },
  });

  res.json({
    killSwitch: active,
    message: active ? "Kill switch activated. All trading has been stopped." : "Kill switch deactivated. Trading resumed.",
  });
});

export default router;
