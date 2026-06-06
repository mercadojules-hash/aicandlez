import { pgTable, varchar, integer, bigint, real, timestamp } from "drizzle-orm/pg-core";

/**
 * usage_daily — one row per UTC day capturing real platform usage counters so
 * the admin telemetry surface can render usage + cost trend charts (30 / 90 /
 * YTD). Populated by a lightweight in-process counter (request middleware +
 * periodic flush). History accumulates from enablement forward — there is no
 * backfill, so early trend windows are sparse by design.
 *
 *   apiRequests   — count of `/api/*` requests served (this process).
 *   exchangeCalls — count of outbound exchange adapter calls (best-effort).
 *   activeUsers   — distinct users with a trade closed that day.
 *   trades        — sim_trades rows closed that day (paper + live).
 *   peakRssBytes  — peak resident set size observed that day (memory ceiling).
 *   estMonthlyCostUsd — snapshot of the manual cost estimate at flush time, so
 *                       the cost trend reflects rate changes over time.
 *
 * ADMIN / super-admin only (surfaced via GET /api/admin/usage-history).
 */
export const usageDailyTable = pgTable("usage_daily", {
  day: varchar("day", { length: 10 }).primaryKey(), // YYYY-MM-DD (UTC)

  apiRequests:   integer("api_requests").notNull().default(0),
  exchangeCalls: integer("exchange_calls").notNull().default(0),
  activeUsers:   integer("active_users").notNull().default(0),
  trades:        integer("trades").notNull().default(0),
  peakRssBytes:  bigint("peak_rss_bytes", { mode: "number" }).notNull().default(0),
  estMonthlyCostUsd: real("est_monthly_cost_usd"),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UsageDaily = typeof usageDailyTable.$inferSelect;
export type InsertUsageDaily = typeof usageDailyTable.$inferInsert;
