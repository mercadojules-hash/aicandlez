// ── Load .env file for local development ──────────────────────────────────────
// Must be the very first import so all process.env reads below see the values.
// In Replit / Railway / Render the platform injects vars directly — dotenv is a
// no-op when variables are already set, so this is safe in all environments.
import "dotenv/config";

import http from "http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { validateEnv } from "./lib/validateEnv.js";
import { startTradingLoop } from "./lib/tradingLoop.js";
import { createWsServer } from "./lib/wsServer.js";

// ── Environment validation ─────────────────────────────────────────────────────
validateEnv();

// ── Port resolution ────────────────────────────────────────────────────────────
const rawPort   = process.env["PORT"];
const port      = rawPort ? Number(rawPort) : 8080;
const finalPort = !Number.isNaN(port) && port > 0 ? port : 8080;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  logger.warn({ rawPort }, "Invalid PORT — falling back to 8080");
}

// ── Stripe initialization ──────────────────────────────────────────────────────
async function initStripe(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set — Stripe init skipped");
    return;
  }
  try {
    const { getStripeSync } = await import("./stripeClient.js");
    const stripeSync = await getStripeSync();

    // Prefer explicit WEBHOOK_BASE_URL (production Railway/Render) over auto-detect
    const webhookBase =
      process.env["WEBHOOK_BASE_URL"] ??
      (process.env["REPLIT_DOMAINS"]
        ? `https://${process.env["REPLIT_DOMAINS"]!.split(",")[0]}`
        : `http://localhost:${finalPort}`);

    await stripeSync.findOrCreateManagedWebhook(`${webhookBase}/api/stripe/webhook`);
    logger.info({ webhookBase }, "Stripe webhook configured");

    // Backfill runs async — does not block startup
    stripeSync.syncBackfill()
      .then(() => logger.info("Stripe backfill complete"))
      .catch((err: unknown) => logger.warn({ err }, "Stripe backfill failed (non-fatal)"));
  } catch (err) {
    logger.warn({ err }, "Stripe init failed — billing features degraded");
  }
}

// ── HTTP server (wraps Express so WebSocket can share the same port) ──────────
const server = http.createServer(app);

// ── WebSocket server (attaches to /ws on same HTTP server) ────────────────────
createWsServer(server);

// ── Graceful shutdown ─────────────────────────────────────────────────────────
let isShuttingDown = false;

function gracefulShutdown(signal: string): void {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, "Graceful shutdown initiated");

  server.close((err) => {
    if (err) logger.error({ err }, "Error closing HTTP server");
    else logger.info("HTTP server closed");
    process.exit(0);
  });

  // Force-exit after 30 s if connections are still draining
  setTimeout(() => {
    logger.error("Forced shutdown after 30 s timeout");
    process.exit(1);
  }, 30_000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — shutting down");
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection — shutting down");
  gracefulShutdown("unhandledRejection");
});

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(finalPort, async () => {
  logger.info({ port: finalPort }, "API server listening");
  // Boot diagnostics — exchange env presence (booleans only, never log secrets)
  logger.info({
    EXCHANGE_LIVE_ENABLED: process.env["EXCHANGE_LIVE_ENABLED"] === "true",
    KRAKEN_API_KEY:        !!process.env["KRAKEN_API_KEY"],
    KRAKEN_API_SECRET:     !!process.env["KRAKEN_API_SECRET"],
    BINANCE_API_KEY:       !!process.env["BINANCE_API_KEY"],
    COINBASE_API_KEY:      !!process.env["COINBASE_API_KEY"],
  }, "Exchange credentials check");
  if (!process.env["KRAKEN_API_KEY"] || !process.env["KRAKEN_API_SECRET"]) {
    logger.warn("Kraken API credentials missing — LIVE mode will fail for Kraken");
  } else {
    logger.info("Kraken API credentials loaded");
  }
  startTradingLoop();
  await initStripe();
});

server.on("error", (err) => {
  logger.error({ err }, "HTTP server error — exiting");
  process.exit(1);
});
