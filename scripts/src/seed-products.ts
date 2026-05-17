import { getUncachableStripeClient } from "./stripeClient.js";

// ── Seed Stripe Products ──────────────────────────────────────────────────────
//
// Creates Free / Pro / Enterprise plans in Stripe.
// Safe to run multiple times — checks for existing products first.
//
// Run with: pnpm --filter @workspace/scripts exec tsx src/seed-products.ts

interface PlanSpec {
  name:        string;
  description: string;
  metadata:    Record<string, string>;
  prices: Array<{
    amount:    number;    // cents
    interval:  "month" | "year";
    trialDays: number;
  }>;
}

const PLANS: PlanSpec[] = [
  {
    name:        "Pro Plan",
    description: "Live trading, 5 exchange connections, unlimited signals, copy trading",
    metadata:    { plan_id: "pro", tier: "pro" },
    prices: [
      { amount: 4900,  interval: "month", trialDays: 14 },
      { amount: 49000, interval: "year",  trialDays: 14 },
    ],
  },
  {
    name:        "Enterprise Plan",
    description: "Unlimited everything, multi-account support, priority execution, dedicated support",
    metadata:    { plan_id: "enterprise", tier: "enterprise" },
    prices: [
      { amount: 14900,  interval: "month", trialDays: 14 },
      { amount: 149000, interval: "year",  trialDays: 14 },
    ],
  },
];

async function seedProducts(): Promise<void> {
  const stripe = await getUncachableStripeClient();
  console.log("🔧 AICandlez — Seeding Stripe products...\n");

  for (const plan of PLANS) {
    // Check if product already exists
    const existing = await stripe.products.search({
      query: `name:'${plan.name}' AND active:'true'`,
    });

    if (existing.data.length > 0) {
      console.log(`✓ ${plan.name} already exists (${existing.data[0].id})`);
      continue;
    }

    const product = await stripe.products.create({
      name:        plan.name,
      description: plan.description,
      metadata:    plan.metadata,
    });
    console.log(`✅ Created product: ${product.name} (${product.id})`);

    for (const price of plan.prices) {
      const created = await stripe.prices.create({
        product:       product.id,
        unit_amount:   price.amount,
        currency:      "usd",
        recurring: {
          interval:         price.interval,
          trial_period_days: price.trialDays,
        },
        metadata: { plan_id: plan.metadata["plan_id"] ?? "", interval: price.interval },
      });
      const dollars = (price.amount / 100).toFixed(2);
      console.log(`   → $${dollars}/${price.interval} — ${created.id}`);
    }
  }

  console.log("\n✓ Done. Webhooks will sync products to the database automatically.");
}

seedProducts().catch((err: unknown) => {
  console.error("Error seeding products:", err);
  process.exit(1);
});
