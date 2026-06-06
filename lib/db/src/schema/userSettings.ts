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

  // ── Profit-optimization trading-mode preset (Profit-Opt initiative) ───────
  // Identity-only marker for which named preset the account is currently on:
  // "conservative" | "balanced" | "aggressive". NULLABLE on purpose — NULL
  // means "custom/unset" so every existing row keeps its exact current field
  // values and behavior (this column is never read by the execution engine).
  // Applying a preset (POST /api/user/trading-mode) writes the underlying
  // already-wired levers (minConfidence, categoryAllocation, account
  // SL/TP/trailing/maxHold, preferredLiveOrderSizeUsd, aiPersonality) AND
  // stamps this marker. Manually diverging any of those fields makes the
  // resolved identity "custom" again (see resolvePresetIdentity).
  tradingModePreset:  varchar("trading_mode_preset", { length: 50 }),

  riskLevel:          varchar("risk_level", { length: 50 }).notNull().default("moderate"),
  positionSizeUSD:    real("position_size_usd").notNull().default(20),
  maxTradesPerDay:    integer("max_trades_per_day").notNull().default(5),
  maxActivePositions: integer("max_active_positions").notNull().default(3),
  stopLossPercent:    real("stop_loss_percent").notNull().default(2),
  takeProfitPercent:  real("take_profit_percent").notNull().default(4),

  // ── Account-level live-exit controls (Task #220) ──────────────────────────
  // Trailing-stop distance (percent) and max-hold ceiling (hours) for LIVE
  // positions. NULLABLE on purpose so existing rows keep the EXACT pre-#220
  // behavior:
  //   - `trailingStopPercent` NULL → the live monitor mirrors each position's
  //     own stored stop-loss band (the locked default). A concrete value sets
  //     an explicit trailing distance; `0` disables live trailing.
  //   - `maxHoldHours` NULL → fall back to the env/default 24h ceiling. A
  //     concrete value sets a per-account ceiling; `0` disables max-hold.
  // SL/TP percent live in `stopLossPercent`/`takeProfitPercent` above (already
  // per-account). The env operator overrides (`LIVE_TRAILING_STOP_PERCENT`,
  // `LIVE_POSITION_MAX_HOLD_MS`), when set, still win globally.
  trailingStopPercent: real("trailing_stop_percent"),
  maxHoldHours:        real("max_hold_hours"),

  autoMode:           boolean("auto_mode").notNull().default(false),
  tradingMode:        varchar("trading_mode", { length: 50 }).notNull().default("simulation"),

  volumeFilter:       boolean("volume_filter").notNull().default(true),
  require1HTrend:     boolean("require_1h_trend").notNull().default(false),

  preferredExchange:  varchar("preferred_exchange", { length: 50 }).notNull().default("Kraken"),

  // ── Multi-exchange PARALLEL trading (Task #216) — per-user capability ──────
  // When TRUE, the customer's AI live fan-out routes the SAME signal to EVERY
  // healthy, trade-authorized live connection simultaneously (e.g. Coinbase
  // AND Kraken at once) instead of the platform-default single-active-exchange
  // behavior. Each connected exchange then enforces its OWN independent
  // open-position cap (`perExchangeMaxPositions`), so one venue's open trades
  // never consume another venue's slots.
  //
  // Default FALSE — every existing customer keeps the locked single-active-
  // exchange runtime. This flag is provisioned only for a small allow-list of
  // accounts; it does NOT change any platform-wide or plan-tier default.
  multiExchangeParallelEnabled: boolean("multi_exchange_parallel_enabled").notNull().default(false),

  // Per-(user, exchange) maximum simultaneous open LIVE positions when
  // `multiExchangeParallelEnabled` is on. NULL → fall back to the parallel
  // default (20). Applied independently to each connected exchange, replacing
  // the plan-tier max-open cap for parallel users only. Non-parallel users
  // ignore this column entirely (their plan-tier cap still governs).
  perExchangeMaxPositions: integer("per_exchange_max_positions"),

  // CUSTOMER RUNTIME CONTEXT — Task #198 foundation column. Source of
  // truth for which trading runtime the customer's portal/PWA is
  // currently scoped to:
  //   - `null`        — no explicit choice. Aggregator
  //                     (`GET /api/user/runtime-state`) applies the
  //                     auto-promotion rule: if the user has exactly
  //                     one active live connection, mode becomes
  //                     `"live"` against that exchange; otherwise
  //                     mode stays `"paper"`.
  //   - `"paper"`     — explicit user opt-out. Aggregator returns
  //                     mode=`"paper"` even when active live
  //                     connections exist. Used by the "I want to
  //                     stay in paper" toggle.
  //   - <exchange id> — explicit preferred live exchange. Aggregator
  //                     returns mode=`"live"`, activeExchange=this
  //                     ONLY if the connection is healthy
  //                     (`status="active"` AND no fresh
  //                     `lastBalanceFetchError`). Otherwise
  //                     liveReady=false, mode falls back to "paper".
  // Real-money execution is still gated independently by the env
  // flag `CUSTOMER_LIVE_EXECUTION_ENABLED` and the explicit ARM
  // step (Task #200 will reserve `runtime_not_armed` errorCode for
  // that gate). This column never bypasses either gate.
  activeRuntimeExchange: varchar("active_runtime_exchange", { length: 50 }),

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

  // Majors / Alts / Memes allocation weights (Task #219). Integer percentages
  // that MUST sum to 100. Biases the customer AI live fan-out so each category
  // gets a share of the user's open-position budget proportional to its weight
  // (soft cap — a category whose weight is > 0 is never hard-excluded). NULL →
  // no biasing (the locked pre-#219 behavior where every category competes
  // freely for slots). Only consulted on the customer live execution path.
  categoryAllocation: jsonb("category_allocation").$type<{
    majors: number;
    alts:   number;
    memes:  number;
  }>(),

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

  // ── AICandlez Managed Performance baseline (Managed-Performance initiative) ─
  // Authoritative "capital allocated to AICandlez" baseline used for ALL
  // AICandlez performance analytics (Starting AI Capital → Current AI Capital →
  // Net Trading Profit → ROI%). USER-SET (PUT /api/user/ai-capital) with an
  // admin override (PUT /api/admin/users/:id/ai-capital). NULLABLE on purpose:
  //   - NULL → the customer has not declared an allocation. The
  //     managed-performance endpoint falls back to `sim_accounts.starting_balance`
  //     (the paper $100k baseline) and reports `baselineSource:"paper-default"`.
  //   - concrete value → THE baseline for every AICandlez metric, intentionally
  //     INDEPENDENT of exchange total account value, staked assets, manual crypto
  //     purchases, deposits/withdrawals, and passive appreciation.
  aiAllocatedCapital: real("ai_allocated_capital"),

  timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
  currency: varchar("currency", { length: 10 }).notNull().default("USD"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserSettings = typeof userSettingsTable.$inferSelect;
export type InsertUserSettings = typeof userSettingsTable.$inferInsert;
