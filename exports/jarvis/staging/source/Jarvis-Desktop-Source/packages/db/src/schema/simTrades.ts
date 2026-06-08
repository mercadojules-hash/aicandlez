import { pgTable, text, varchar, real, bigint, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const simTradesTable = pgTable("sim_trades", {
  id:             text("id").primaryKey(),
  userId:         varchar("user_id", { length: 255 })
    .notNull()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
  symbol:         text("symbol").notNull(),
  side:           text("side").notNull(),
  quantity:       real("quantity").notNull(),
  entryPrice:     real("entry_price").notNull(),
  exitPrice:      real("exit_price").notNull(),
  entryTime:      bigint("entry_time", { mode: "number" }).notNull(),
  exitTime:       bigint("exit_time", { mode: "number" }).notNull(),
  sizeUSD:        real("size_usd").notNull(),
  realizedPnL:    real("realized_pnl").notNull(),
  realizedPnLPct: real("realized_pnl_pct").notNull(),
  durationMs:     bigint("duration_ms", { mode: "number" }).notNull(),
  // Engine avgConfidence (%) at open, copied from sim_positions at close so
  // realized performance can be sliced by confidence band (50–64 experiment).
  // NULL for trades closed before this column existed / paths without a value.
  confidence:     real("confidence"),
  closeReason:    text("close_reason").default("MANUAL"),
  // Populated when this trade was executed against a live broker account
  // (per-user `user_exchange_connections`). NULL for paper/sim fills.
  exchange:        text("exchange"),
  exchangeOrderId: text("exchange_order_id"),
  // Broker reference for the close-side market order submitted when this
  // live position was flattened. NULL for paper trades and for any legacy
  // live trades closed before close-side submission was wired in.
  exchangeCloseOrderId: text("exchange_close_order_id"),
  // ── Close-leg broker liquidation verification (orphan-prevention) ──────────
  // Populated on LIVE closes once the broker outcome is verified. A position is
  // only booked CLOSED when the broker confirms the close-side SELL filled OR
  // the remaining base balance is ≤ dust — these columns are the audit proof.
  // `closeBrokerStatus` = verified terminal status ("FILLED"/"PARTIAL");
  // `closeFilledQty` = base qty the broker reported actually sold on the close
  // leg; `postCloseBaseBalance` = base asset still held at the exchange AFTER
  // the close (≈0 / dust on a true liquidation). NULL for paper trades and for
  // legacy live trades closed before verification was wired in.
  closeBrokerStatus:    text("close_broker_status"),
  closeFilledQty:       real("close_filled_qty"),
  postCloseBaseBalance: real("post_close_base_balance"),
  // Broker commission charged on each fill (live trades only — NULL for paper).
  // Stored in USD. Computed at close time from the exchange catalog's taker
  // fee rate; surfaced in the customer's trade receipt for audit parity with
  // the broker's own statement.
  entryFee:        real("entry_fee"),
  exitFee:         real("exit_fee"),
  // Broker-reported commissions captured straight from the exchange's order
  // / fill response (when available). Stored alongside the catalog estimate
  // above so the customer receipt can prefer the real charge and fall back
  // to the estimate when the adapter didn't surface one. `*Currency` is the
  // settlement currency the broker quoted the fee in (USD, USDT, etc.).
  entryFeeBroker:         real("entry_fee_broker"),
  entryFeeBrokerCurrency: text("entry_fee_broker_currency"),
  exitFeeBroker:          real("exit_fee_broker"),
  exitFeeBrokerCurrency:  text("exit_fee_broker_currency"),
  // True when this trade was opened against the connected exchange's
  // public sandbox/testnet (paper-mode sandbox routing). Mirrors the
  // open-side `sim_positions.sandbox` flag so closed trades can carry the
  // TESTNET pill in the Portal trade-history feed.
  sandbox:                boolean("sandbox").notNull().default(false),
  // ── Phase 0 profitability telemetry (measurement-only; added 2026-06-08) ───
  // MFE = Maximum Favorable Excursion (peak unrealized profit reached); MAE =
  // Maximum Adverse Excursion (worst unrealized drawdown). Sampled each
  // risk-monitor tick, GROSS of fees (a price-path concept). `*Usd` in USD,
  // `*Pct` as percent of entry price, `*At` as absolute epoch-ms of the
  // peak/trough; `timeToPeakMs` = mfeAt − entryTime (how long until the favorable
  // peak). `eff*` = the effective exit config the position lived under at close,
  // resolved per-exchange → account → env → default (TP/SL/trailing % and
  // max-hold hours). ALL NULL for trades closed before these columns existed and
  // for closes that never received a price sample (e.g. process restart
  // mid-trade). These columns NEVER affect trading behaviour — observability only.
  mfeUsd:             real("mfe_usd"),
  mfePct:             real("mfe_pct"),
  mfeAt:              bigint("mfe_at", { mode: "number" }),
  maeUsd:             real("mae_usd"),
  maePct:             real("mae_pct"),
  maeAt:              bigint("mae_at", { mode: "number" }),
  timeToPeakMs:       bigint("time_to_peak_ms", { mode: "number" }),
  effTakeProfitPct:   real("eff_take_profit_pct"),
  effStopLossPct:     real("eff_stop_loss_pct"),
  effTrailingStopPct: real("eff_trailing_stop_pct"),
  effMaxHoldHours:    real("eff_max_hold_hours"),
  // Operator reconciliation marker. NULL = an ordinary, trusted record that
  // counts toward realized P&L. Non-NULL = flagged by the account
  // reconciliation tool and EXCLUDED from the recomputed realized ledger
  // (e.g. "LEGACY_INCIDENT" for unlimited-position-incident backlog closes
  // that have no verifiable broker fill). Rows are tagged, never deleted, so
  // the audit trail survives.
  reconciliationTag: text("reconciliation_tag"),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("sim_trades_user_idx").on(t.userId),
]);

export type SimTrade = typeof simTradesTable.$inferSelect;
export type InsertSimTrade = typeof simTradesTable.$inferInsert;
