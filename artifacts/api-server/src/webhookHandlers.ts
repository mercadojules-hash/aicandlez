import { getStripeSync } from "./stripeClient.js";

// ── Stripe Webhook Handler ────────────────────────────────────────────────────
//
// Minimal handler — all logic lives in stripe-replit-sync.
// CRITICAL: req.body must be a raw Buffer (webhook route registered BEFORE express.json()).

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
        "Received type: " + typeof payload + ". " +
        "FIX: Ensure webhook route is registered BEFORE app.use(express.json()).",
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
  }
}
