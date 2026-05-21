import Stripe from "stripe";
import pg from "pg";

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

const stripe = new Stripe(secret, { apiVersion: "2024-06-20" });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Pull all prices for our 2 plan products from Stripe API
for (const pid of ["prod_UX0y60blbkoePC", "prod_UX0y3GQXJmAJqY"]) {
  const prices = await stripe.prices.list({ product: pid, limit: 100 });
  for (const p of prices.data) {
    const recurring = p.recurring ? JSON.stringify(p.recurring) : null;
    await pool.query(
      `INSERT INTO stripe.prices (id, product, currency, unit_amount, recurring, active, livemode, type, billing_scheme, created, metadata)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,to_timestamp($10),$11::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         unit_amount = EXCLUDED.unit_amount,
         active      = EXCLUDED.active,
         recurring   = EXCLUDED.recurring,
         metadata    = EXCLUDED.metadata`,
      [p.id, p.product, p.currency, p.unit_amount, recurring, p.active, p.livemode,
       p.type, p.billing_scheme, p.created, JSON.stringify(p.metadata || {})]
    );
    console.log(`upsert ${p.id} active=${p.active} amount=${p.unit_amount}`);
  }
}
await pool.end();
console.log("Done");
