import { pgTable, varchar, real, integer, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ── user_risk_settings ──────────────────────────────────────────────────────
//
// Per-user AI LIVE-trade risk budgeting. Enforced server-side in
// `placeLiveAutoOrderForUser` (gate 0d) BEFORE any broker call. Customer
// surface = `AIRiskControlsPanel` in the trading-dashboard `/portal`.
//
// Unit model — every cap is stored as a numeric `value` + a `unit` enum:
//   - "usd" → absolute dollar amount
//   - "pct" → percent of live equity (0..100). At enforcement time the
//             percent is multiplied by `fetchLiveEquityWithMeta().totalEquityUsd`
//             so percent-based caps scale with the account.
// `maxSimultaneousTrades` is unit-less (always an integer count of open
// live positions).
//
// `enabled = false` short-circuits the gate (user opts out of risk
// budgeting — equivalent to "infinite caps"). Audit log still records the
// trade with `gate=risk_disabled_by_user` so operator can see who opted out.
//
// `preset` is presentational only — drives the customer panel toggles and
// snaps four custom fields to a named bucket. Server NEVER uses `preset`
// for enforcement; only the four numeric fields matter.

export type RiskUnit = "usd" | "pct";
export type RiskPreset = "conservative" | "moderate" | "aggressive" | "custom";

export const userRiskSettingsTable = pgTable("user_risk_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .unique()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),

  enabled: boolean("enabled").notNull().default(true),
  preset:  varchar("preset", { length: 20 }).notNull().default("moderate").$type<RiskPreset>(),

  // Cap 1 — max notional any single AI trade may consume.
  maxCapitalPerTradeValue: real("max_capital_per_trade_value").notNull().default(1000),
  maxCapitalPerTradeUnit:  varchar("max_capital_per_trade_unit", { length: 8 }).notNull().default("usd").$type<RiskUnit>(),

  // Cap 2 — concurrent open AI live positions. Unit-less integer.
  maxSimultaneousTrades: integer("max_simultaneous_trades").notNull().default(3),

  // Cap 3 — max total notional across all open AI trades.
  maxTotalAllocationValue: real("max_total_allocation_value").notNull().default(30000),
  maxTotalAllocationUnit:  varchar("max_total_allocation_unit", { length: 8 }).notNull().default("usd").$type<RiskUnit>(),

  // Cap 4 — reserved cash that must remain available AFTER the trade.
  // Enforcement: equityUsd - (openNotional + intendedSize) >= reserveCashEffective.
  reserveCashValue: real("reserve_cash_value").notNull().default(0),
  reserveCashUnit:  varchar("reserve_cash_unit", { length: 8 }).notNull().default("usd").$type<RiskUnit>(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserRiskSettings       = typeof userRiskSettingsTable.$inferSelect;
export type InsertUserRiskSettings = typeof userRiskSettingsTable.$inferInsert;
