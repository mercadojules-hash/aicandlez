import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

// ── Stripe Client ─────────────────────────────────────────────────────────────
//
// Fetches Stripe credentials from the Replit connectors proxy.
// NEVER cached — tokens can rotate between requests.

async function getCredentials(): Promise<{ secretKey: string; publishableKey: string }> {
  const hostname     = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? "repl " + process.env["REPL_IDENTITY"]
    : process.env["WEB_REPL_RENEWAL"]
      ? "depl " + process.env["WEB_REPL_RENEWAL"]
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Missing Replit environment variables. " +
      "Ensure the Stripe integration is connected via the Integrations tab.",
    );
  }

  const isProduction     = process.env["REPLIT_DEPLOYMENT"] === "1";
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
    throw new Error(`Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`);
  }

  const data     = await resp.json() as { items?: Array<{ settings?: { publishable?: string; secret?: string } }> };
  const settings = data.items?.[0]?.settings;

  if (!settings?.secret || !settings?.publishable) {
    throw new Error(
      `Stripe ${targetEnvironment} connection not found or missing keys. ` +
      "Connect Stripe via the Integrations tab.",
    );
  }

  return { secretKey: settings.secret, publishableKey: settings.publishable };
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

  // Resolve webhook secret: DB-managed > env. The managed webhook is
  // auto-registered by stripe-replit-sync and stores its signing secret
  // directly in `stripe._managed_webhooks.secret`.
  let webhookSecret: string | undefined = process.env["STRIPE_WEBHOOK_SECRET"];
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
    /* table not yet initialized — fall back to env */
  }

  return new StripeSync({
    poolConfig:          { connectionString: databaseUrl, max: 2 },
    stripeSecretKey:     secretKey,
    stripeWebhookSecret: webhookSecret,
  });
}
