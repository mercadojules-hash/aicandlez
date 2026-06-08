import { pgTable, varchar, real, integer, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core";

// ── risk_throttle_events ────────────────────────────────────────────────────
//
// Append-only audit trail for AI LIVE trades blocked by `riskGate`. One
// row per rejected attempt. Admin visibility surface: GET
// `/api/admin/risk-events` (paginated, optional `userId` filter). Powers
// the operator "blocked trades" admin page so support can answer
// "why didn't my trade fire?" without DB access.
//
// Distinct from `logs` (free-form) because risk rejections need a typed,
// queryable shape (reason code, snapshot of caps + state at rejection
// time). Logs table still receives a `[risk_throttle_*]`-tagged mirror
// for unified ops dashboards.

export type RiskReasonCode =
  | "risk_disabled_by_user"      // settings.enabled = false (not blocked; advisory)
  | "risk_max_per_trade"
  | "risk_max_simultaneous"
  | "risk_max_allocation"
  | "risk_reserve_cash_breach"
  | "risk_no_equity";            // could not read live equity to evaluate

export const riskThrottleEventsTable = pgTable(
  "risk_throttle_events",
  {
    id:         uuid("id").primaryKey().defaultRandom(),
    userId:     varchar("user_id",     { length: 255 }).notNull(),
    userEmail:  varchar("user_email",  { length: 320 }),
    symbol:     varchar("symbol",      { length: 32 }).notNull(),
    side:       varchar("side",        { length: 8 }).notNull(),
    intendedSizeUsd: real("intended_size_usd").notNull(),
    equityUsd:       real("equity_usd").notNull().default(0),
    openCount:       integer("open_count").notNull().default(0),
    openNotionalUsd: real("open_notional_usd").notNull().default(0),
    reasonCode:      varchar("reason_code", { length: 64 }).notNull().$type<RiskReasonCode>(),
    reasonText:      varchar("reason_text", { length: 512 }).notNull(),
    // Snapshot of effective caps + raw settings at the moment of rejection
    // so we can debug retroactively without time-travel queries on
    // user_risk_settings.
    snapshot:        jsonb("snapshot").notNull().default({}),
    createdAt:       timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byUser:    index("risk_throttle_events_user_idx").on(t.userId),
    byCreated: index("risk_throttle_events_created_idx").on(t.createdAt),
  }),
);

export type RiskThrottleEvent       = typeof riskThrottleEventsTable.$inferSelect;
export type InsertRiskThrottleEvent = typeof riskThrottleEventsTable.$inferInsert;
