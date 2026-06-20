CREATE TABLE IF NOT EXISTS risk_governor_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type varchar(16) NOT NULL DEFAULT 'user',
  scope_id varchar(255) NOT NULL,
  status varchar(64) NOT NULL DEFAULT 'OK',
  paused boolean NOT NULL DEFAULT false,
  pause_reason varchar(64),
  paused_at timestamp,
  cooldown_until timestamp,
  last_evaluated_trade_id varchar(255),
  last_evaluated_exit_time bigint,
  consecutive_losses integer NOT NULL DEFAULT 0,
  rolling20_trades integer NOT NULL DEFAULT 0,
  rolling20_win_rate real,
  daily_realized_pnl real NOT NULL DEFAULT 0,
  daily_realized_loss_pct real,
  equity_usd real,
  exchange_health_ok boolean,
  global_kill_switch_active boolean NOT NULL DEFAULT false,
  manual_override_active boolean NOT NULL DEFAULT false,
  manual_override_expires_at timestamp,
  degraded boolean NOT NULL DEFAULT false,
  degraded_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS risk_governor_states_scope_uidx
  ON risk_governor_states (scope_type, scope_id);

CREATE TABLE IF NOT EXISTS risk_governor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type varchar(16) NOT NULL DEFAULT 'user',
  scope_id varchar(255) NOT NULL,
  event_type varchar(64) NOT NULL,
  from_status varchar(64),
  to_status varchar(64) NOT NULL,
  reason_code varchar(64) NOT NULL,
  message varchar(512) NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_admin_id varchar(255),
  correlation_id varchar(128),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_governor_events_scope_created_idx
  ON risk_governor_events (scope_type, scope_id, created_at DESC);

CREATE INDEX IF NOT EXISTS risk_governor_events_type_created_idx
  ON risk_governor_events (event_type, created_at DESC);
