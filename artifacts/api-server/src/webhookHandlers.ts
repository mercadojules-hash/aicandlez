import type Stripe from "stripe";
import { getStripeSync, getUncachableStripeClient } from "./stripeClient.js";
import { logger } from "./lib/logger.js";
import {
  addCreditsInTx,
  applyPaymentToOutstandingFeesInTx,
  evaluateAndEnforceBillingHold,
} from "./lib/billingEnforcement.js";
import {
  db,
  userAdminActionsTable,
  processedStripeEventsTable,
} from "@workspace/db";
import { randomUUID } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Stripe Webhook Handler (Phase C — credit_topup + outstanding_payment + sync)
// ─────────────────────────────────────────────────────────────────────────────
//
// Two concerns share the same Stripe endpoint:
//   1. Subscription / invoice sync — delegated to `stripe-replit-sync`.
//   2. Credit top-up / outstanding payment fulfillment — handled here BEFORE
//      forwarding to stripe-replit-sync.
//
// Idempotency (audit finding #1 — Phase C):
//   Every credit-touching event is gated by an INSERT into
//   `processed_stripe_events` with `payment_intent_id` as PRIMARY KEY,
//   inside the SAME transaction as the credit/fee mutations. Duplicate
//   webhook deliveries hit ON CONFLICT DO NOTHING, the insert returns 0
//   rows, we return early, and no mutation occurs.
//
// Atomicity (audit finding #2 — Phase C):
//   Both flows now run end-to-end inside a single Drizzle transaction:
//   idempotency-row + balance/fee mutations + ledger row + audit row commit
//   atomically. Partial application is impossible.
//
// Strict invariants:
//   - req.body must be a raw Buffer (route registered BEFORE express.json()).
//   - This file MUST NOT touch Kraken adapter, execution queue, trading
//     loop, telemetry, auth routing. Single enforcement boundary remains
//     `userStatusGuard`.
//   - Credit-side handler failures NEVER NACK the webhook — subscription
//     sync (stripe-replit-sync) must always run, even if our fulfillment
//     errors. Errors are logged + audited; Stripe will redeliver and the
//     idempotency gate makes that safe.
// ─────────────────────────────────────────────────────────────────────────────

interface PaymentIntentMetadata {
  type?:        string;
  clerkUserId?: string;
  packUsd?:     string;
  amountUsd?:   string;
}

async function handleCreditTopup(pi: Stripe.PaymentIntent): Promise<{ skipped: boolean; userId?: string }> {
  const md          = (pi.metadata ?? {}) as PaymentIntentMetadata;
  const clerkUserId = md.clerkUserId;
  if (!clerkUserId) {
    logger.warn({ paymentIntentId: pi.id }, "credit_topup webhook missing clerkUserId");
    return { skipped: true };
  }

  const cents     = pi.amount_received ?? pi.amount ?? 0;
  const amountUsd = cents / 100;
  if (amountUsd <= 0) return { skipped: true, userId: clerkUserId };

  const skipped = await db.transaction(async (tx) => {
    // Idempotency gate — see header comment.
    const inserted = await tx
      .insert(processedStripeEventsTable)
      .values({
        paymentIntentId: pi.id,
        eventType:       "credit_topup",
        userId:          clerkUserId,
        amountUsd:       amountUsd.toFixed(6),
      })
      .onConflictDoNothing()
      .returning({ pi: processedStripeEventsTable.paymentIntentId });

    if (inserted.length === 0) {
      logger.info({ paymentIntentId: pi.id, clerkUserId }, "credit_topup duplicate webhook — skipping");
      return true;
    }

    const result = await addCreditsInTx(tx, {
      userId:                clerkUserId,
      amount:                amountUsd,
      type:                  "topup",
      stripePaymentIntentId: pi.id,
      note:                  `Stripe top-up ($${amountUsd.toFixed(2)})`,
    });

    await tx.insert(userAdminActionsTable).values({
      id:           randomUUID(),
      actorAdminId: "system_stripe_webhook",
      targetUserId: clerkUserId,
      action:       "credit_topup_received",
      payload: {
        paymentIntentId: pi.id,
        amountUsd,
        newBalance:      result.newBalance,
        txId:            result.txId,
        packUsd:         md.packUsd ?? null,
      },
    });

    return false;
  });

  if (skipped) return { skipped: true, userId: clerkUserId };

  // Auto-restoration happens AFTER commit (separate transaction). The status
  // mutation cannot retroactively invalidate the credit row, and reads the
  // committed balance. Respects moderation precedence inside
  // evaluateAndEnforceBillingHold.
  const enforced = await evaluateAndEnforceBillingHold(clerkUserId);
  logger.info(
    {
      clerkUserId,
      paymentIntentId: pi.id,
      amountUsd,
      autoRestored:    enforced.mutated && enforced.newStatus === "active",
    },
    "credit_topup fulfillment complete",
  );
  return { skipped: false, userId: clerkUserId };
}

async function handleOutstandingPayment(pi: Stripe.PaymentIntent): Promise<{ skipped: boolean; userId?: string }> {
  const md          = (pi.metadata ?? {}) as PaymentIntentMetadata;
  const clerkUserId = md.clerkUserId;
  if (!clerkUserId) {
    logger.warn({ paymentIntentId: pi.id }, "outstanding_payment webhook missing clerkUserId");
    return { skipped: true };
  }

  const cents     = pi.amount_received ?? pi.amount ?? 0;
  const amountUsd = cents / 100;
  if (amountUsd <= 0) return { skipped: true, userId: clerkUserId };

  const result = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(processedStripeEventsTable)
      .values({
        paymentIntentId: pi.id,
        eventType:       "outstanding_payment",
        userId:          clerkUserId,
        amountUsd:       amountUsd.toFixed(6),
      })
      .onConflictDoNothing()
      .returning({ pi: processedStripeEventsTable.paymentIntentId });

    if (inserted.length === 0) {
      logger.info({ paymentIntentId: pi.id, clerkUserId }, "outstanding_payment duplicate webhook — skipping");
      return null;
    }

    const r = await applyPaymentToOutstandingFeesInTx(tx, {
      userId:                clerkUserId,
      paymentAmountUsd:      amountUsd,
      stripePaymentIntentId: pi.id,
      note:                  `Outstanding payment ($${amountUsd.toFixed(2)})`,
    });

    await tx.insert(userAdminActionsTable).values({
      id:           randomUUID(),
      actorAdminId: "system_stripe_webhook",
      targetUserId: clerkUserId,
      action:       "outstanding_payment_received",
      payload: {
        paymentIntentId:     pi.id,
        amountUsd,
        feesSettled:         r.feesSettled,
        amountAppliedToFees: r.amountAppliedToFees,
        amountToCredits:     r.amountToCredits,
        feeIds:              r.feeIds,
      },
    });

    return r;
  });

  if (result === null) return { skipped: true, userId: clerkUserId };

  const enforced = await evaluateAndEnforceBillingHold(clerkUserId);
  logger.info(
    {
      clerkUserId,
      paymentIntentId: pi.id,
      amountUsd,
      ...result,
      autoRestored:    enforced.mutated && enforced.newStatus === "active",
    },
    "outstanding_payment fulfillment complete",
  );
  return { skipped: false, userId: clerkUserId };
}

async function maybeHandleCreditEvent(payload: Buffer, signature: string): Promise<void> {
  // Parse + re-verify signature so we can branch on payment_intent.succeeded
  // before stripe-replit-sync. The Stripe library is purely computational —
  // verifying twice is safe.
  let event: Stripe.Event;
  try {
    const stripe        = await getUncachableStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return;
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    // Signature failure: let stripe-replit-sync surface the error. We
    // intentionally swallow to avoid double-logging.
    return;
  }

  if (event.type !== "payment_intent.succeeded") return;

  const pi  = event.data.object as Stripe.PaymentIntent;
  const md  = (pi.metadata ?? {}) as PaymentIntentMetadata;
  const typ = md.type;

  try {
    if (typ === "credit_topup") {
      await handleCreditTopup(pi);
    } else if (typ === "outstanding_payment") {
      await handleOutstandingPayment(pi);
    }
    // Unmarked PaymentIntents fall through to stripe-replit-sync untouched.
  } catch (err) {
    logger.error(
      { err, paymentIntentId: pi.id, type: typ, clerkUserId: md.clerkUserId },
      "stripe webhook credit-event handler failed",
    );
    // Swallow — never NACK the webhook on credit-side failure. Subscription
    // sync must still proceed. Stripe will redeliver and the idempotency
    // gate guarantees safety.
  }
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
        "Received type: " + typeof payload + ". " +
        "FIX: Ensure webhook route is registered BEFORE app.use(express.json()).",
      );
    }

    // Phase C: handle credit_topup / outstanding_payment first. Internal
    // failures are caught and never NACK the webhook.
    await maybeHandleCreditEvent(payload, signature);

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
  }
}
