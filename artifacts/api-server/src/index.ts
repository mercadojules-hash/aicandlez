import app from "./app.js";
import { logger } from "./lib/logger.js";
import { startTradingLoop } from "./lib/tradingLoop.js";

// ── Port resolution — defaults to 8080 if PORT is not set ─────────────────────
const rawPort  = process.env["PORT"];
const port     = rawPort ? Number(rawPort) : 8080;
const finalPort = !Number.isNaN(port) && port > 0 ? port : 8080;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  logger.warn({ rawPort }, "Invalid PORT — falling back to 8080");
}

// ── Stripe initialization ──────────────────────────────────────────────────────
// Non-fatal: Stripe is optional at startup. If the integration is not yet
// connected, billing routes still load but return errors gracefully.

async function initStripe(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set — Stripe init skipped");
    return;
  }
  try {
    const { runMigrations }  = await import("stripe-replit-sync");
    const { getStripeSync }  = await import("./stripeClient.js");

    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    const stripeSync     = await getStripeSync();
    const domainEnv      = process.env["REPLIT_DOMAINS"];
    const webhookBaseUrl = domainEnv
      ? `https://${domainEnv.split(",")[0]}`
      : `http://localhost:${finalPort}`;

    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
    logger.info("Stripe webhook configured");

    // Backfill runs async — does not block startup
    stripeSync.syncBackfill()
      .then(() => logger.info("Stripe backfill complete"))
      .catch((err: unknown) => logger.warn({ err }, "Stripe backfill failed (non-fatal)"));
  } catch (err) {
    // Not connected yet → billing routes degrade gracefully
    logger.warn({ err }, "Stripe init failed — billing features degraded (connect Stripe integration to enable)");
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(finalPort, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port — exiting");
    process.exit(1);
  }

  logger.info({ port: finalPort }, "API server listening");
  startTradingLoop();
  await initStripe();
});
