CREATE TABLE "signals" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" text DEFAULT 'BTCUSDT' NOT NULL,
	"timeframe" text DEFAULT '1H' NOT NULL,
	"action" text NOT NULL,
	"confidence" real NOT NULL,
	"trend" text NOT NULL,
	"reasoning" text NOT NULL,
	"price" real NOT NULL,
	"rsi" real,
	"macd" real,
	"ema20" real,
	"ema50" real,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" text DEFAULT 'BTCUSDT' NOT NULL,
	"side" text NOT NULL,
	"amount" real NOT NULL,
	"price" real NOT NULL,
	"exit_price" real,
	"pnl" real,
	"pnl_percent" real,
	"status" text DEFAULT 'open' NOT NULL,
	"mode" text DEFAULT 'simulated' NOT NULL,
	"signal_id" text,
	"stop_loss" real,
	"take_profit" real,
	"reason" text,
	"exchange" text,
	"exchange_order_id" text,
	"fill_price" real,
	"fill_qty" real,
	"broker_response" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"allocation" real DEFAULT 20 NOT NULL,
	"stop_loss_percent" real DEFAULT 2 NOT NULL,
	"take_profit_percent" real DEFAULT 4 NOT NULL,
	"max_trades_per_day" integer DEFAULT 5 NOT NULL,
	"min_confidence" real DEFAULT 80 NOT NULL,
	"auto_mode" boolean DEFAULT false NOT NULL,
	"live_trading" boolean DEFAULT false NOT NULL,
	"kill_switch" boolean DEFAULT false NOT NULL,
	"binance_api_key" text,
	"binance_api_secret" text
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"details" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" varchar(50) DEFAULT 'user' NOT NULL,
	"plan" varchar(50) DEFAULT 'free' NOT NULL,
	"plan_status" varchar(50) DEFAULT 'none' NOT NULL,
	"stripe_customer_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"billing_email" varchar(255),
	"trial_ends_at" timestamp,
	"ai_disclaimer_accepted_at" timestamp,
	"ai_disclaimer_version" varchar(32),
	"ai_disclaimer_ip" varchar(64),
	"perf_fee_bps_override" integer,
	"fee_waiver_active" boolean DEFAULT false NOT NULL,
	"fee_waiver_until" timestamp,
	"is_complimentary_account" boolean DEFAULT false NOT NULL,
	"is_internal_account" boolean DEFAULT false NOT NULL,
	"revenue_share_bps" integer DEFAULT 0 NOT NULL,
	"billing_override_notes" text,
	"billing_override_meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"ai_personality" varchar(50) DEFAULT 'balanced' NOT NULL,
	"min_confidence" real DEFAULT 60 NOT NULL,
	"risk_level" varchar(50) DEFAULT 'moderate' NOT NULL,
	"position_size_usd" real DEFAULT 20 NOT NULL,
	"max_trades_per_day" integer DEFAULT 5 NOT NULL,
	"max_active_positions" integer DEFAULT 3 NOT NULL,
	"stop_loss_percent" real DEFAULT 2 NOT NULL,
	"take_profit_percent" real DEFAULT 4 NOT NULL,
	"auto_mode" boolean DEFAULT false NOT NULL,
	"trading_mode" varchar(50) DEFAULT 'simulation' NOT NULL,
	"volume_filter" boolean DEFAULT true NOT NULL,
	"require_1h_trend" boolean DEFAULT false NOT NULL,
	"preferred_exchange" varchar(50) DEFAULT 'Kraken' NOT NULL,
	"active_runtime_exchange" varchar(50),
	"preferred_live_order_size_usd" real DEFAULT 10 NOT NULL,
	"paper_sandbox_enabled" boolean DEFAULT false NOT NULL,
	"notifications_trade_exec" boolean DEFAULT true NOT NULL,
	"notifications_signals" boolean DEFAULT false NOT NULL,
	"notifications_risk_alerts" boolean DEFAULT true NOT NULL,
	"notifications_live_fills" boolean DEFAULT true NOT NULL,
	"exchange_outage_email_enabled" boolean DEFAULT true NOT NULL,
	"exchange_outage_push_enabled" boolean DEFAULT true NOT NULL,
	"alert_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timezone" varchar(100) DEFAULT 'UTC' NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "sim_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"starting_balance" real DEFAULT 100000 NOT NULL,
	"cash_balance" real DEFAULT 100000 NOT NULL,
	"total_realized" real DEFAULT 0 NOT NULL,
	"total_trades" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sim_accounts_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "sim_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"quantity" real NOT NULL,
	"entry_price" real NOT NULL,
	"entry_time" bigint NOT NULL,
	"size_usd" real NOT NULL,
	"signal_id" text,
	"stop_loss" real,
	"take_profit" real,
	"exchange" text,
	"exchange_order_id" text,
	"entry_fee_broker" real,
	"entry_fee_broker_currency" text,
	"sandbox" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sim_trades" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"quantity" real NOT NULL,
	"entry_price" real NOT NULL,
	"exit_price" real NOT NULL,
	"entry_time" bigint NOT NULL,
	"exit_time" bigint NOT NULL,
	"size_usd" real NOT NULL,
	"realized_pnl" real NOT NULL,
	"realized_pnl_pct" real NOT NULL,
	"duration_ms" bigint NOT NULL,
	"close_reason" text DEFAULT 'MANUAL',
	"exchange" text,
	"exchange_order_id" text,
	"exchange_close_order_id" text,
	"entry_fee" real,
	"exit_fee" real,
	"entry_fee_broker" real,
	"entry_fee_broker_currency" text,
	"exit_fee_broker" real,
	"exit_fee_broker_currency" text,
	"sandbox" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_exchange_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"exchange" varchar(50) NOT NULL,
	"label" varchar(100) DEFAULT 'Default' NOT NULL,
	"encrypted_blob" text NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"trading_mode" varchar(20) DEFAULT 'paper' NOT NULL,
	"demo_mode" boolean DEFAULT false NOT NULL,
	"permissions" jsonb,
	"last_verified_at" timestamp with time zone,
	"last_error" text,
	"last_balance_fetch_at" timestamp with time zone,
	"last_balance_fetch_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_fees" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"trade_id" text NOT NULL,
	"exchange" varchar(100) NOT NULL,
	"symbol" text NOT NULL,
	"side" varchar(10) NOT NULL,
	"realized_pnl" real NOT NULL,
	"fee_rate" real DEFAULT 0.02 NOT NULL,
	"fee_amount_usd" real NOT NULL,
	"settlement_status" varchar(30) DEFAULT 'pending' NOT NULL,
	"settled_at" timestamp,
	"is_paper" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"consent_version" varchar(40) DEFAULT 'v1.0' NOT NULL,
	"accepted_terms" boolean DEFAULT false NOT NULL,
	"accepted_membership_fee" boolean DEFAULT false NOT NULL,
	"accepted_performance_fee" boolean DEFAULT false NOT NULL,
	"accepted_no_fee_on_losses" boolean DEFAULT false NOT NULL,
	"accepted_no_unrealized_fee" boolean DEFAULT false NOT NULL,
	"accepted_not_advice" boolean,
	"accepted_trading_risk" boolean,
	"accepted_ai_inaccuracy" boolean,
	"accepted_past_performance" boolean,
	"accepted_user_responsible" boolean,
	"accepted_automated_losses" boolean,
	"metadata" jsonb,
	"ip_address" varchar(100),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"token" text NOT NULL,
	"platform" varchar(20) NOT NULL,
	"device_name" varchar(200),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"ts_ms" bigint NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text,
	"ip_address" text,
	"type" text NOT NULL,
	"exchange" text,
	"symbol" text,
	"payload" jsonb NOT NULL,
	"severity" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_trade_limits" (
	"user_id" varchar(255) PRIMARY KEY NOT NULL,
	"cap_tier" integer DEFAULT 50 NOT NULL,
	"use_plan_default" boolean DEFAULT true NOT NULL,
	"override_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_admin_status" (
	"user_id" varchar(255) PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"set_by_admin_id" varchar(255),
	"reason" text,
	"since" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_admin_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_admin_id" varchar(255) NOT NULL,
	"target_user_id" varchar(255) NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_session_id" varchar(255),
	"clerk_user_id" varchar(255) NOT NULL,
	"ip_address" varchar(64),
	"user_agent" text,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"revoked_by_admin_id" varchar(255),
	"revoke_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_exchange_visibility" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" varchar(255) NOT NULL,
	"exchange_id" varchar(64) NOT NULL,
	"visible" boolean NOT NULL,
	"note" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_admin_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_credits" (
	"user_id" varchar(255) PRIMARY KEY NOT NULL,
	"balance_usd" real DEFAULT 0 NOT NULL,
	"auto_recharge_usd" real DEFAULT 0,
	"auto_recharge_threshold" real DEFAULT 0,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"amount_usd" real NOT NULL,
	"type" varchar(30) NOT NULL,
	"stripe_payment_intent_id" varchar(255),
	"related_fee_id" text,
	"note" text,
	"actor_admin_id" varchar(255),
	"balance_after" real NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_stripe_events" (
	"payment_intent_id" varchar(255) PRIMARY KEY NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"amount_usd" text NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_risk_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"preset" varchar(20) DEFAULT 'moderate' NOT NULL,
	"max_capital_per_trade_value" real DEFAULT 1000 NOT NULL,
	"max_capital_per_trade_unit" varchar(8) DEFAULT 'usd' NOT NULL,
	"max_simultaneous_trades" integer DEFAULT 3 NOT NULL,
	"max_total_allocation_value" real DEFAULT 30000 NOT NULL,
	"max_total_allocation_unit" varchar(8) DEFAULT 'usd' NOT NULL,
	"reserve_cash_value" real DEFAULT 0 NOT NULL,
	"reserve_cash_unit" varchar(8) DEFAULT 'usd' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_risk_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "risk_throttle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"user_email" varchar(320),
	"symbol" varchar(32) NOT NULL,
	"side" varchar(8) NOT NULL,
	"intended_size_usd" real NOT NULL,
	"equity_usd" real DEFAULT 0 NOT NULL,
	"open_count" integer DEFAULT 0 NOT NULL,
	"open_notional_usd" real DEFAULT 0 NOT NULL,
	"reason_code" varchar(64) NOT NULL,
	"reason_text" varchar(512) NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_accounts" ADD CONSTRAINT "sim_accounts_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_positions" ADD CONSTRAINT "sim_positions_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_trades" ADD CONSTRAINT "sim_trades_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_exchange_connections" ADD CONSTRAINT "user_exchange_connections_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_fees" ADD CONSTRAINT "performance_fees_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_push_tokens" ADD CONSTRAINT "user_push_tokens_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_trade_limits" ADD CONSTRAINT "user_trade_limits_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_admin_status" ADD CONSTRAINT "user_admin_status_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_risk_settings" ADD CONSTRAINT "user_risk_settings_user_id_users_clerk_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sim_positions_user_idx" ON "sim_positions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sim_trades_user_idx" ON "sim_trades" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_notifications_user_idx" ON "user_notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_notifications_read_idx" ON "user_notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE UNIQUE INDEX "uec_user_exchange_uidx" ON "user_exchange_connections" USING btree ("user_id","exchange");--> statement-breakpoint
CREATE INDEX "uec_user_idx" ON "user_exchange_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "perf_fees_user_idx" ON "performance_fees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "perf_fees_status_idx" ON "performance_fees" USING btree ("settlement_status");--> statement-breakpoint
CREATE INDEX "perf_fees_trade_idx" ON "performance_fees" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX "user_consents_user_idx" ON "user_consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_consents_version_idx" ON "user_consents" USING btree ("user_id","consent_version");--> statement-breakpoint
CREATE INDEX "user_push_tokens_user_idx" ON "user_push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_push_tokens_token_idx" ON "user_push_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "user_admin_actions_target_idx" ON "user_admin_actions" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "user_admin_actions_actor_idx" ON "user_admin_actions" USING btree ("actor_admin_id");--> statement-breakpoint
CREATE INDEX "user_admin_actions_created_idx" ON "user_admin_actions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_clerk_session_uniq" ON "user_sessions" USING btree ("clerk_session_id");--> statement-breakpoint
CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_last_seen_idx" ON "user_sessions" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "user_sessions_revoked_idx" ON "user_sessions" USING btree ("revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_exchange_visibility_user_exchange_uniq" ON "user_exchange_visibility" USING btree ("clerk_user_id","exchange_id");--> statement-breakpoint
CREATE INDEX "user_exchange_visibility_user_idx" ON "user_exchange_visibility" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "credit_tx_user_idx" ON "credit_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_tx_type_idx" ON "credit_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "credit_tx_pi_idx" ON "credit_transactions" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "risk_throttle_events_user_idx" ON "risk_throttle_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "risk_throttle_events_created_idx" ON "risk_throttle_events" USING btree ("created_at");