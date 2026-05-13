import { runMigrations } from "stripe-replit-sync";

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
  process.exit(0);
} catch (err) {
  // Non-fatal — server can still start without Stripe schema
  console.warn("[migrate] Stripe schema migration failed (non-fatal):", (err as Error).message);
  process.exit(0);
}
