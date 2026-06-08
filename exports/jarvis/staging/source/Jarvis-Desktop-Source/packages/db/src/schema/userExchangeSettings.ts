import { pgTable, varchar, real, integer, timestamp, uuid, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Per-(user, exchange) live execution settings (Task #219).
 *
 * Lets a customer configure each connected exchange INDEPENDENTLY — most
 * importantly the per-trade LIVE notional (e.g. Coinbase $20, Kraken $10).
 * One row per (userId, exchange). A missing row (or a NULL column) means
 * "fall back to the user-global default", so existing customers who never
 * touch the per-exchange controls keep their current behavior exactly.
 *
 *   - `tradeSizeUsd`  NULL → fall back to `user_settings.preferredLiveOrderSizeUsd`
 *   - `maxPositions`  NULL → fall back to the parallel per-exchange default
 *                            (`effectivePerExchangeMax`)
 *
 * `exchange` is stored as the canonical lowercase adapter id (the same value
 * `listLiveExecutionUsers` / `user_exchange_connections.exchange` uses) so the
 * engine can join on it without case normalization surprises.
 */
export const userExchangeSettingsTable = pgTable(
  "user_exchange_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
    exchange: varchar("exchange", { length: 50 }).notNull(),

    // Per-exchange per-trade LIVE notional. NULL → user-global preferred size.
    tradeSizeUsd: real("trade_size_usd"),

    // Per-exchange max simultaneous open LIVE positions. NULL → parallel
    // per-exchange default. Only consulted for parallel-enabled users.
    maxPositions: integer("max_positions"),

    // ── Per-exchange live-exit overrides (Task #220) ────────────────────────
    // Each NULL → inherit the account-level value (user_settings). A concrete
    // value overrides ONLY for fills routed to this exchange, letting a
    // customer run e.g. tighter stops on Kraken than Coinbase. `trailingStop`
    // `0` disables trailing for this exchange; `maxHoldHours` `0` disables the
    // max-hold ceiling for this exchange. SL/TP are clamped to safe ranges on
    // write (see `clampExitValue` in `lib/exitConfig.ts`).
    takeProfitPercent:   real("take_profit_percent"),
    stopLossPercent:     real("stop_loss_percent"),
    trailingStopPercent: real("trailing_stop_percent"),
    maxHoldHours:        real("max_hold_hours"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    userExchangeUnique: unique("user_exchange_settings_user_exchange_uq").on(
      t.userId,
      t.exchange,
    ),
  }),
);

export type UserExchangeSettings = typeof userExchangeSettingsTable.$inferSelect;
export type InsertUserExchangeSettings = typeof userExchangeSettingsTable.$inferInsert;
