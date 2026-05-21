import { StripeSync } from "stripe-replit-sync";

const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
const tok = process.env.REPL_IDENTITY ? "repl " + process.env.REPL_IDENTITY
        : process.env.WEB_REPL_RENEWAL ? "depl " + process.env.WEB_REPL_RENEWAL : null;
const url = new URL(`https://${hostname}/api/v2/connection`);
url.searchParams.set("include_secrets", "true");
url.searchParams.set("connector_names", "stripe");
url.searchParams.set("environment", "development");
const r = await fetch(url, { headers: { "X-Replit-Token": tok, Accept: "application/json" } });
const d = await r.json();
const secret = d.items?.[0]?.settings?.secret;
console.log("Got secret:", !!secret);

const sync = new StripeSync({
  poolConfig: { connectionString: process.env.DATABASE_URL, max: 2 },
  stripeSecretKey: secret,
});
console.log("Syncing prices...");
await sync.syncSingleEntity("prices");
console.log("Syncing products...");
await sync.syncSingleEntity("products");
console.log("Done");
process.exit(0);
