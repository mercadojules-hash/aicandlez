import { pgTable, varchar, real, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * platform_cost_config — singleton row holding the operator's MANUAL monthly
 * cost estimates for the platform.
 *
 * These are explicitly "Estimate Only — Not Official Billing" inputs: the
 * authoritative sources of truth remain the Replit Usage dashboard and the
 * Render billing dashboard (deep-linked from the admin telemetry surface). The
 * stored values power the consolidated executive cost view (estimated monthly /
 * annual operating cost, cost-per-active-user / trade / API request) and the
 * cost-trend charts.
 *
 * Singleton enforcement: exactly one row, keyed by the unique constant
 * `singletonKey = "global"`. All reads/writes upsert on that key.
 *
 * ADMIN / super-admin only.
 */
export const platformCostConfigTable = pgTable("platform_cost_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  singletonKey: varchar("singleton_key", { length: 32 })
    .notNull()
    .unique()
    .default("global"),

  monthlyReplitUsd:     real("monthly_replit_usd").notNull().default(0),
  monthlyRenderUsd:     real("monthly_render_usd").notNull().default(0),
  monthlyDbUsd:         real("monthly_db_usd").notNull().default(0),
  monthlyAiUsd:         real("monthly_ai_usd").notNull().default(0),
  monthlyThirdPartyUsd: real("monthly_third_party_usd").notNull().default(0),

  updatedBy: varchar("updated_by", { length: 255 }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PlatformCostConfig = typeof platformCostConfigTable.$inferSelect;
export type InsertPlatformCostConfig = typeof platformCostConfigTable.$inferInsert;
