import { pgTable, varchar, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core";
import type {
  RiskGovernorPauseReason,
  RiskGovernorScopeType,
  RiskGovernorStatus,
} from "./riskGovernorStates";

export type RiskGovernorEventType =
  | "EVALUATION"
  | "WATCH"
  | "PAUSE"
  | "COOLDOWN_STARTED"
  | "RESUME_ELIGIBLE"
  | "MANUAL_OVERRIDE_ENABLED"
  | "MANUAL_OVERRIDE_DISABLED"
  | "MANUAL_OVERRIDE_EXPIRED";

export type RiskGovernorReasonCode =
  | RiskGovernorPauseReason
  | "cooldown_passed"
  | "manual_operator_override"
  | "manual_override_disabled"
  | "feature_disabled"
  | "evaluation";

export const riskGovernorEventsTable = pgTable(
  "risk_governor_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeType: varchar("scope_type", { length: 16 }).notNull().default("user").$type<RiskGovernorScopeType>(),
    scopeId: varchar("scope_id", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull().$type<RiskGovernorEventType>(),
    fromStatus: varchar("from_status", { length: 64 }).$type<RiskGovernorStatus>(),
    toStatus: varchar("to_status", { length: 64 }).notNull().$type<RiskGovernorStatus>(),
    reasonCode: varchar("reason_code", { length: 64 }).notNull().$type<RiskGovernorReasonCode>(),
    message: varchar("message", { length: 512 }).notNull(),
    metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull().default({}),
    actorAdminId: varchar("actor_admin_id", { length: 255 }),
    correlationId: varchar("correlation_id", { length: 128 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byScopeCreated: index("risk_governor_events_scope_created_idx").on(t.scopeType, t.scopeId, t.createdAt),
    byTypeCreated: index("risk_governor_events_type_created_idx").on(t.eventType, t.createdAt),
  }),
);

export type RiskGovernorEvent = typeof riskGovernorEventsTable.$inferSelect;
export type InsertRiskGovernorEvent = typeof riskGovernorEventsTable.$inferInsert;
