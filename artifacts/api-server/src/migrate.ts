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
    await pool.end();
    console.log("[migrate] Manual target exit schema ready");
  }
  process.exit(0);
} catch (err) {
  // Non-fatal — server can still start without Stripe schema
  console.warn("[migrate] Stripe schema migration failed (non-fatal):", (err as Error).message);
  process.exit(0);
}
