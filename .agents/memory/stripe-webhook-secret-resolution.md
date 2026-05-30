---
name: Stripe webhook secret resolution & dual verify paths
description: Why Stripe webhook signature verification can fail on Render even after STRIPE_WEBHOOK_SECRET is "updated"
---

# Stripe webhook signature verification — resolution order & traps

**Secret env var name:** `STRIPE_WEBHOOK_SECRET` (only this name; no `STRIPE_SIGNING_SECRET`).

**Resolution (getStripeSync in stripeClient.ts):** `process.env.STRIPE_WEBHOOK_SECRET`
first; if empty/unset, **silent fallback** to a SQL lookup on
`stripe._managed_webhooks` (populated by stripe-replit-sync's auto-registrar in
Replit-dev only). On Render that table is usually empty OR holds a stale
Replit-dev `whsec_` bound to a different endpoint.

**The trap (cost real debugging):** if the Render env var is empty/whitespace
or the service was not redeployed after editing it, verification silently uses a
**stale dev secret from the DB**, and Stripe fails every delivery with
"No signatures found matching the expected signature for payload" — looking
exactly like a "wrong secret" even though the dashboard env "was updated".
**Why:** Render only injects updated env vars on a NEW deploy/restart; a
Blueprint `sync:false` var saved in the dashboard does not auto-trigger a deploy.

**Two verifications per delivery (same payload):**
1. `webhookHandlers.ts` maybeHandleCreditEvent → `stripe.webhooks.constructEvent`
   using `process.env.STRIPE_WEBHOOK_SECRET` directly. **Error is swallowed**
   (try/catch returns) — never NACKs, so it is NOT the source of the 400.
2. `webhookHandlers.ts` processWebhook → `sync.processWebhook` (stripe-replit-sync)
   using getStripeSync()'s resolved secret. **This is the throwing path** that
   produces the Render error and the route's HTTP 400 "Webhook processing error".

**How to apply:** to diagnose, log secret SOURCE (env/db/none) + length +
`startsWith("whsec_")` + signatureHeaderPresent + bodyIsBuffer — never the secret.
A real signing secret is `whsec_` + ~32 chars. `source:"db"`/`"none"` in prod =
Render env not actually loaded → redeploy / fix the var, don't chase the value.
Route is mounted before `express.json()` with `express.raw({type:"application/json"})`
— required for raw-body signature verification; reordering breaks it.

## Definitive secret-vs-body self-test (diagnostic technique)
When `source=env`, secret length/prefix look right, body is a Buffer, yet
constructEvent still throws "No signatures found": recompute Stripe's v1
signature locally and compare. `signedPayload = `${t}.${rawBuf.toString("utf8")}``,
`expected = HMAC_SHA256(key=WHOLE whsec_ secret string, signedPayload).hex`,
then check `v1Values.includes(expected)`. Also compare `content-length` header
vs `buffer.length` (proxy-alteration detector) and sha256 the buffer.
**Interpretation:** `hmacMatchesAnyV1=true` → secret+body both correct (look
elsewhere / timestamp). `false` + `lengthMatch=true` → **wrong secret** (wrong
endpoint or test-vs-live mode — each endpoint+mode has its own whsec_).
`false` + `lengthMatch=false` → **raw body altered in transit** (proxy/CDN
re-encoded it). stripe-replit-sync's processWebhook uses the SAME config secret
+ SAME buffer (constructEventAsync) — it is NOT a different-body/secret path.
**Why:** narrows the two remaining causes after env/secret are ruled in.
