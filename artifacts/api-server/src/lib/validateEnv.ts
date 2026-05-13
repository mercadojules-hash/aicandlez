import { logger } from "./logger.js";

// ── Required in all environments ──────────────────────────────────────────────
const REQUIRED_ALWAYS: string[] = [
  "DATABASE_URL",
];

// ── Required in production only ───────────────────────────────────────────────
const REQUIRED_PRODUCTION: string[] = [
  "DATABASE_URL",
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "SESSION_SECRET",
];

// ── Recommended (warn if absent) ──────────────────────────────────────────────
const RECOMMENDED: string[] = [
  "STRIPE_SECRET_KEY",
  "WEBHOOK_BASE_URL",
];

export function validateEnv(): void {
  const isProd = process.env["NODE_ENV"] === "production";
  const required = isProd ? REQUIRED_PRODUCTION : REQUIRED_ALWAYS;

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(", ")}`;
    if (isProd) {
      // Hard-fail in production — don't start with broken config
      logger.error({ missing }, msg);
      process.exit(1);
    } else {
      logger.warn({ missing }, msg + " — continuing in dev mode");
    }
  }

  const missingRec = RECOMMENDED.filter((key) => !process.env[key]);
  if (missingRec.length > 0) {
    logger.warn({ missing: missingRec }, "Recommended env vars not set — some features may be degraded");
  }

  if (isProd) {
    logger.info("Environment validation passed (production)");
  }
}
