import { runMigrations } from "stripe-replit-sync";
import pg from "pg";

// ── Stripe schema migrations ───────────────────────────────────────────────────
// Run as a separate process (not bundled by esbuild) so that __dirname
// resolves correctly inside stripe-replit-sync's migration runner.
//
// Called by the dev/start scripts via: node --import tsx/esm src/migrate.ts

const databaseUrl = process.env["DATABASE_URL"];

if (!databaseUrl) {
  console.warn("[migrate] DATABASE_URL not set — skipping Stripe schema migrations");
  process.exit(0);
}

try {
  await runMigrations({ databaseUrl });
  console.log("[migrate] Stripe schema migrations complete");
  {
    const { Pool } = pg;
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    await pool.query(`
      ALTER TABLE sim_positions
        ADD COLUMN IF NOT EXISTS manual_exit_target_price real
    `);
    await pool.query(`
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
      )
    `);
    await pool.query(`
      ALTER TABLE planned_trades ADD COLUMN IF NOT EXISTS plan_type varchar(32) NOT NULL DEFAULT 'PLANNED_BUY';
      ALTER TABLE planned_trades ALTER COLUMN buy_target_price DROP NOT NULL;
      ALTER TABLE planned_trades ALTER COLUMN sell_target_price DROP NOT NULL;
      ALTER TABLE planned_trades ADD COLUMN IF NOT EXISTS buy_trigger_direction varchar(16);
      ALTER TABLE planned_trades ADD COLUMN IF NOT EXISTS target_profit_usd real;
      ALTER TABLE planned_trades ADD COLUMN IF NOT EXISTS target_position_id text;
      ALTER TABLE planned_trades ADD COLUMN IF NOT EXISTS last_checked_at bigint;
      ALTER TABLE planned_trades ADD COLUMN IF NOT EXISTS attempt_count bigint NOT NULL DEFAULT 0;
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS planned_trades_user_idx ON planned_trades(user_id);
      CREATE INDEX IF NOT EXISTS planned_trades_status_idx ON planned_trades(status);
      CREATE INDEX IF NOT EXISTS planned_trades_type_status_idx ON planned_trades(plan_type, status);
      CREATE INDEX IF NOT EXISTS planned_trades_target_position_idx ON planned_trades(target_position_id);
    `);
    await pool.end();
    console.log("[migrate] Operator planned trade schema ready");
  }
  process.exit(0);
} catch (err) {
  // Non-fatal — server can still start without Stripe schema
  console.warn("[migrate] Stripe schema migration failed (non-fatal):", (err as Error).message);
  process.exit(0);
}
