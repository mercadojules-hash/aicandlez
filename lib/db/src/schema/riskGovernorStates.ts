import { pgTable, varchar, real, integer, boolean, timestamp, uuid, uniqueIndex, jsonb, bigint } from "drizzle-orm/pg-core";

export type RiskGovernorScopeType = "user";
export type RiskGovernorStatus =
  | "DISABLED"
  | "OK"
  | "WATCH"
  | "PAUSED_CONSECUTIVE_LOSSES"
  | "PAUSED_ROLLING20_WIN_RATE"
  | "PAUSED_DAILY_DRAWDOWN"
  | "COOLDOWN"
  | "RESUME_ELIGIBLE"
  | "MANUAL_OVERRIDE";

export type RiskGovernorPauseReason =
  | "consecutive_losses_8"
  | "rolling20_win_rate_below_35"
  | "daily_realized_loss_gt_5pct";

export const riskGovernorStatesTable = pgTable(
  "risk_governor_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeType: varchar("scope_type", { length: 16 }).notNull().default("user").$type<RiskGovernorScopeType>(),
    scopeId: varchar("scope_id", { length: 255 }).notNull(),
    status: varchar("status", { length: 64 }).notNull().default("OK").$type<RiskGovernorStatus>(),
    paused: boolean("paused").notNull().default(false),
    pauseReason: varchar("pause_reason", { length: 64 }).$type<RiskGovernorPauseReason>(),
    pausedAt: timestamp("paused_at"),
    cooldownUntil: timestamp("cooldown_until"),
    lastEvaluatedTradeId: varchar("last_evaluated_trade_id", { length: 255 }),
    lastEvaluatedExitTime: bigint("last_evaluated_exit_time", { mode: "number" }),
    consecutiveLosses: integer("consecutive_losses").notNull().default(0),
    rolling20Trades: integer("rolling20_trades").notNull().default(0),
    rolling20WinRate: real("rolling20_win_rate"),
    dailyRealizedPnl: real("daily_realized_pnl").notNull().default(0),
    dailyRealizedLossPct: real("daily_realized_loss_pct"),
    equityUsd: real("equity_usd"),
    exchangeHealthOk: boolean("exchange_health_ok"),
    globalKillSwitchActive: boolean("global_kill_switch_active").notNull().default(false),
    manualOverrideActive: boolean("manual_override_active").notNull().default(false),
    manualOverrideExpiresAt: timestamp("manual_override_expires_at"),
    degraded: boolean("degraded").notNull().default(false),
    degradedReasons: jsonb("degraded_reasons").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byScope: uniqueIndex("risk_governor_states_scope_uidx").on(t.scopeType, t.scopeId),
  }),
);

export type RiskGovernorState = typeof riskGovernorStatesTable.$inferSelect;
export type InsertRiskGovernorState = typeof riskGovernorStatesTable.$inferInsert;
