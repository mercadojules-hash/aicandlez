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
  "VAULT_MASTER_KEY",   // AES-256 master key for CredentialVault — see CredentialVault.ts
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

  // ── VAULT_MASTER_KEY dev warning ─────────────────────────────────────────────
  // Warn loudly in development when the credential vault is using the insecure
  // fallback key. Any exchange API keys stored while this warning is active are
  // encrypted with the dev key and CANNOT be decrypted in production.
  if (!isProd && !process.env["VAULT_MASTER_KEY"]) {
    logger.warn(
      "⚠  VAULT_MASTER_KEY is not set — CredentialVault is using the insecure " +
      "fallback dev key. Exchange credentials stored now will NOT be readable in " +
      "production. Set VAULT_MASTER_KEY before storing any real API keys.",
    );
  }

  const missingRec = RECOMMENDED.filter((key) => !process.env[key]);
  if (missingRec.length > 0) {
    logger.warn({ missing: missingRec }, "Recommended env vars not set — some features may be degraded");
  }

  if (isProd) {
    logger.info("Environment validation passed (production)");
  }
}
