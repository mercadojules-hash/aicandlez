ALTER TABLE sim_positions
  ADD COLUMN IF NOT EXISTS manual_exit_target_price real;

CREATE TABLE IF NOT EXISTS planned_trades (
  id varchar(64) PRIMARY KEY,
  user_id varchar(255) NOT NULL REFERENCES users(clerk_user_id) ON DELETE CASCADE,
  plan_type varchar(32) NOT NULL DEFAULT 'PLANNED_BUY',
  symbol text NOT NULL,
  buy_target_price real,
  buy_trigger_direction varchar(16),
  sell_target_price real,
  target_profit_usd real,
  position_size_usd real NOT NULL,
  expiration_time bigint,
  status varchar(32) NOT NULL DEFAULT 'Waiting',
  entered_position_id text,
  target_position_id text,
  entered_at bigint,
  completed_trade_id text,
  completed_at bigint,
  cancelled_at bigint,
  last_checked_at bigint,
  attempt_count bigint NOT NULL DEFAULT 0,
  last_error text,
  created_by varchar(255),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE planned_trades ADD COLUMN IF NOT EXISTS plan_type varchar(32) NOT NULL DEFAULT 'PLANNED_BUY';
ALTER TABLE planned_trades ALTER COLUMN buy_target_price DROP NOT NULL;
ALTER TABLE planned_trades ALTER COLUMN sell_target_price DROP NOT NULL;
ALTER TABLE planned_trades ADD COLUMN IF NOT EXISTS buy_trigger_direction varchar(16);
ALTER TABLE planned_trades ADD COLUMN IF NOT EXISTS target_profit_usd real;
ALTER TABLE planned_trades ADD COLUMN IF NOT EXISTS target_position_id text;
ALTER TABLE planned_trades ADD COLUMN IF NOT EXISTS last_checked_at bigint;
ALTER TABLE planned_trades ADD COLUMN IF NOT EXISTS attempt_count bigint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS planned_trades_user_idx ON planned_trades(user_id);
CREATE INDEX IF NOT EXISTS planned_trades_status_idx ON planned_trades(status);
CREATE INDEX IF NOT EXISTS planned_trades_type_status_idx ON planned_trades(plan_type, status);
CREATE INDEX IF NOT EXISTS planned_trades_target_position_idx ON planned_trades(target_position_id);
