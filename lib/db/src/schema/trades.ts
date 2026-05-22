import { pgTable, text, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradesTable = pgTable("trades", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull().default("BTCUSDT"),
  side: text("side").notNull(), // BUY, SELL
  amount: real("amount").notNull(),
  price: real("price").notNull(),
  exitPrice: real("exit_price"),
  pnl: real("pnl"),
  pnlPercent: real("pnl_percent"),
  status: text("status").notNull().default("open"), // open, closed, cancelled
  mode: text("mode").notNull().default("simulated"), // auto, manual, simulated, live, test
  signalId: text("signal_id"),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  reason: text("reason"),
  // ── Live-execution metadata (operator path) ─────────────────────────────────
  // Populated when this row originates from a LIVE broker fill (operator
  // process-env credentials via placeLiveAutoOrder). NULL for paper/sim trades.
  exchange:        text("exchange"),
  exchangeOrderId: text("exchange_order_id"),
  fillPrice:       real("fill_price"),
  fillQty:         real("fill_qty"),
  brokerResponse:  jsonb("broker_response"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({ timestamp: true, closedAt: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
