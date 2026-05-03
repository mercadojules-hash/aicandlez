import app from "./app";
import { logger } from "./lib/logger";
import { startTradingLoop } from "./lib/tradingLoop.js";

// ── Port resolution — defaults to 8080 if PORT is not set ─────────────────────
const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 8080;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  console.warn(
    `[api-server] Invalid PORT value "${rawPort}" — falling back to 8080.`,
  );
}

const finalPort = !Number.isNaN(port) && port > 0 ? port : 8080;

app.listen(finalPort, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port — exiting");
    process.exit(1);
  }

  logger.info({ port: finalPort }, "API server listening");
  startTradingLoop();
});
