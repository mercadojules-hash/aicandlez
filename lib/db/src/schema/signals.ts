import { pgTable, text, real, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const signalsTable = pgTable("signals", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull().default("BTCUSDT"),
  timeframe: text("timeframe").notNull().default("1H"),
  action: text("action").notNull(), // BUY, SELL, HOLD
  confidence: real("confidence").notNull(),
  trend: text("trend").notNull(), // bullish, bearish, neutral
  reasoning: text("reasoning").notNull(),
  price: real("price").notNull(),
  rsi: real("rsi"),
  macd: real("macd"),
  ema20: real("ema20"),
  ema50: real("ema50"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertSignalSchema = createInsertSchema(signalsTable).omit({ timestamp: true });
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Signal = typeof signalsTable.$inferSelect;
