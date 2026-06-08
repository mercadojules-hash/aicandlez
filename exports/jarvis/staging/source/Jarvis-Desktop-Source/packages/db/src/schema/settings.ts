import { pgTable, text, real, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: text("id").primaryKey().default("default"),
  allocation: real("allocation").notNull().default(20),
  stopLossPercent: real("stop_loss_percent").notNull().default(2),
  takeProfitPercent: real("take_profit_percent").notNull().default(4),
  maxTradesPerDay: integer("max_trades_per_day").notNull().default(5),
  minConfidence: real("min_confidence").notNull().default(80),
  autoMode: boolean("auto_mode").notNull().default(false),
  liveTrading: boolean("live_trading").notNull().default(false),
  killSwitch: boolean("kill_switch").notNull().default(false),
  binanceApiKey: text("binance_api_key"),
  binanceApiSecret: text("binance_api_secret"),
});

export const insertSettingsSchema = createInsertSchema(settingsTable);
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
