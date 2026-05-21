import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

// ── Stripe Client ─────────────────────────────────────────────────────────────
//
// Resolution order for Stripe credentials:
//
//   1. Direct environment variables (PRIMARY — production path on Render and
//      any non-Replit host):
//        • STRIPE_SECRET_KEY            — required (sk_live_… in prod)
//        • STRIPE_PUBLISHABLE_KEY       — preferred for server-returned pk_…
//          (falls back to VITE_STRIPE_PUBLISHABLE_KEY for environments that
//          only set the Vite-prefixed variant)
//
//   2. Replit Connectors proxy (LEGACY — only used as a fallback when the env
//      vars above are not set, e.g. on a Replit workspace where the integration
//      handles credential rotation). Render and other non-Replit hosts do NOT
//      have REPLIT_CONNECTORS_HOSTNAME / REPL_IDENTITY, so this branch is
//      skipped automatically.
//
// The connector branch used to throw if the Replit env vars were missing,
// which broke Stripe entirely on Render. That hard failure has been removed
// — the connector path is now opt-in via env-var presence.

interface StripeCredentials { secretKey: string; publishableKey: string }

function credentialsFromEnv(): StripeCredentials | null {
  const secretKey      = process.env["STRIPE_SECRET_KEY"];
  const publishableKey =
    process.env["STRIPE_PUBLISHABLE_KEY"] ??
    process.env["VITE_STRIPE_PUBLISHABLE_KEY"];
  if (!secretKey) return null;
  // Publishable key is optional for server-only flows (checkout sessions,
  // webhook handling) — only `getStripePublishableKey()` truly needs it.
  return { secretKey, publishableKey: publishableKey ?? "" };
}

async function credentialsFromReplitConnector(): Promise<StripeCredentials | null> {
  const hostname     = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? "repl " + process.env["REPL_IDENTITY"]
    : process.env["WEB_REPL_RENEWAL"]
      ? "depl " + process.env["WEB_REPL_RENEWAL"]
      : null;
  if (!hostname || !xReplitToken) return null;

  const isProduction      = process.env["REPLIT_DEPLOYMENT"] === "1";
  const targetEnvironment = isProduction ? "production" : "development";

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets",  "true");
  url.searchParams.set("connector_names",  "stripe");
  url.searchParams.set("environment",      targetEnvironment);

  const resp = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
    signal:  AbortSignal.timeout(10_000),
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch Stripe credentials via Replit connector: ${resp.status} ${resp.statusText}`);
  }

  const data     = await resp.json() as { items?: Array<{ settings?: { publishable?: string; secret?: string } }> };
  const settings = data.items?.[0]?.settings;
  if (!settings?.secret) return null;
  return { secretKey: settings.secret, publishableKey: settings.publishable ?? "" };
}

async function getCredentials(): Promise<StripeCredentials> {
  // 1. Env vars take precedence — this is the Render / non-Replit path.
  const fromEnv = credentialsFromEnv();
  if (fromEnv) return fromEnv;

  // 2. Replit connector fallback (Replit workspaces only).
  const fromConnector = await credentialsFromReplitConnector();
  if (fromConnector) return fromConnector;

  throw new Error(
    "Stripe is not configured. Set STRIPE_SECRET_KEY (and optionally " +
    "STRIPE_PUBLISHABLE_KEY) in the deployment environment.",
  );
}

/** Fresh Stripe REST client. Not cached — call on every request. */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getCredentials();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Stripe(secretKey, { apiVersion: "2026-04-22.dahlia" as any });
}

/** Return publishable key for client-side operations. */
export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getCredentials();
  if (!publishableKey) {
    throw new Error(
      "Stripe publishable key is not configured. Set STRIPE_PUBLISHABLE_KEY " +
      "or VITE_STRIPE_PUBLISHABLE_KEY in the deployment environment.",
    );
  }
  return publishableKey;
}

/** Fresh StripeSync instance for webhook processing and DB sync.
 *
 * The webhook signing secret is read from the locally-managed
 * `stripe._managed_webhooks` table (populated by stripe-replit-sync's
 * webhook auto-registration), with `STRIPE_WEBHOOK_SECRET` env as fallback.
 */
export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");

  const { secretKey } = await getCredentials();

  // Resolve webhook secret: env > DB-managed. On Render we always use env;
  // the DB-managed lookup is only relevant when stripe-replit-sync's auto
  // webhook registrar has populated `stripe._managed_webhooks` (Replit dev).
  let webhookSecret: string | undefined = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!webhookSecret) {
    try {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: databaseUrl, max: 1 });
      try {
        const r = await pool.query<{ secret: string }>(
          `SELECT secret FROM stripe._managed_webhooks
            WHERE enabled = true OR status = 'enabled'
            ORDER BY updated_at DESC LIMIT 1`,
        );
        if (r.rows[0]?.secret) webhookSecret = r.rows[0].secret;
      } finally {
        await pool.end();
      }
    } catch {
      /* table not yet initialized — proceed without webhook secret */
    }
  }

  return new StripeSync({
    poolConfig:          { connectionString: databaseUrl, max: 2 },
    stripeSecretKey:     secretKey,
    stripeWebhookSecret: webhookSecret,
  });
}
