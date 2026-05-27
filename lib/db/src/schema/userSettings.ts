import { pgTable, varchar, real, integer, boolean, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import type { AlertPrefs } from "../constants/alertKeys";

export const userSettingsTable = pgTable("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .unique()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),

  aiPersonality:      varchar("ai_personality", { length: 50 }).notNull().default("balanced"),
  minConfidence:      real("min_confidence").notNull().default(60),

  riskLevel:          varchar("risk_level", { length: 50 }).notNull().default("moderate"),
  positionSizeUSD:    real("position_size_usd").notNull().default(20),
  maxTradesPerDay:    integer("max_trades_per_day").notNull().default(5),
  maxActivePositions: integer("max_active_positions").notNull().default(3),
  stopLossPercent:    real("stop_loss_percent").notNull().default(2),
  takeProfitPercent:  real("take_profit_percent").notNull().default(4),

  autoMode:           boolean("auto_mode").notNull().default(false),
  tradingMode:        varchar("trading_mode", { length: 50 }).notNull().default("simulation"),

  volumeFilter:       boolean("volume_filter").notNull().default(true),
  require1HTrend:     boolean("require_1h_trend").notNull().default(false),

  preferredExchange:  varchar("preferred_exchange", { length: 50 }).notNull().default("Kraken"),

  // Customer's preferred per-trade LIVE notional, picked in the Portal
  // SignalRow size picker. Persisted server-side so the preference carries
  // across browsers/devices. Per-tier cap is still enforced independently
  // by /api/user/live-order; this value is advisory storage only.
  // Allowed customer preset set is {10, 20, 50, 100}. Default = $10 (smallest
  // preset) — the safety design point: a brand-new starter customer's AI
  // sessions begin at the smallest position the liquidity guard can fully
  // cushion across all 3 starter slots. Existing rows with legacy values
  // (e.g. 100) remain valid since 100 is in the preset set; the PUT
  // /user/settings allowlist rejects writes outside the preset set so the
  // column drifts back into the allowed range over time.
  preferredLiveOrderSizeUsd: real("preferred_live_order_size_usd").notNull().default(10),

  // When ON, paper-mode BUY/SELL on the customer Portal routes real orders
  // through the connected exchange's public sandbox / testnet (via the
  // adapter `testnet: true` host switch) instead of the internal simulator.
  // Only honored for exchanges in `SANDBOX_SUPPORTED_EXCHANGES`; unsupported
  // exchanges silently fall back to the internal simulator. Off by default
  // so existing PAPER behavior is preserved.
  paperSandboxEnabled: boolean("paper_sandbox_enabled").notNull().default(false),

  notificationsTradeExec:  boolean("notifications_trade_exec").notNull().default(true),
  notificationsSignals:    boolean("notifications_signals").notNull().default(false),
  notificationsRiskAlerts: boolean("notifications_risk_alerts").notNull().default(true),
  notificationsLiveFills:  boolean("notifications_live_fills").notNull().default(true),

  exchangeOutageEmailEnabled: boolean("exchange_outage_email_enabled").notNull().default(true),
  exchangeOutagePushEnabled:  boolean("exchange_outage_push_enabled").notNull().default(true),

  // Server-authoritative per-alert mute/unmute toggles. Mirrors the
  // ALERT_DEFINITIONS taxonomy in `lib/db/src/constants/alertKeys.ts`.
  // Missing keys fall back to per-key `defaultOn`; an empty object means
  // "all defaults". Read by NotificationDispatcher before any push send so
  // mutes sync across devices and the server actually honors them.
  alertPrefs: jsonb("alert_prefs").$type<AlertPrefs>().notNull().default({}),

  timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
  currency: varchar("currency", { length: 10 }).notNull().default("USD"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserSettings = typeof userSettingsTable.$inferSelect;
export type InsertUserSettings = typeof userSettingsTable.$inferInsert;
