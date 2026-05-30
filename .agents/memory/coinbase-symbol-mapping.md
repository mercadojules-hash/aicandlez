---
name: Coinbase live-order compliance
description: Durable lessons for building Coinbase Advanced Trade orders that the broker will actually accept (symbol mapping, order body, product-spec compliance).
---

# Coinbase live-order compliance

**Rule:** at live order placement the exchange adapter's own `normaliseSymbol`
is the authoritative symbol converter, because the executor passes the RAW
engine-native symbol to `adapter.placeOrder` — not the pre-normalized "native"
form it computes for validation/logging.
**Why:** a bug where the adapter used a tiny hardcoded symbol map (instead of
the venue SoT) sent dashless / un-rebranded product_ids; every internal gate
passed, then Coinbase rejected at the broker (`400 INVALID_ARGUMENT · Invalid
product_id`), surfacing to the client as a 409. Broker rejects were discovered
one live trade at a time.
**How to apply:** adapters must consult the venue map in `lib/marketData.ts`
(`COINBASE_SYMBOLS`) as primary and only fall back to algorithmic dash
insertion. The map carries rebrands dash-insertion cannot derive (`RNDR→RENDER`,
`MATIC→POL`). `marketData.ts` imports nothing from adapters, so
`adapter → marketData` is cycle-safe.

**Rule:** Coinbase `market_market_ioc` needs `base_size` (quote_size is
BUY-only). The engine sizes orders in BASE units, so send `base_size` for both
sides.

**Rule:** validate every order against the product spec
(`GET /api/v3/brokerage/products/{id}`) LOCALLY before submitting — round
base_size down to `base_increment`, enforce `base_min_size`, and enforce min
notional (`quote_min_size`) using a positive reference price (limit price →
spec price → live ticker). If a min notional exists but no positive price is
available, reject locally rather than skip the check.
**Why:** precision / min-notional / tradability violations otherwise become
broker-side 400s that the client only sees as 409s, one failed trade at a time.
**How to apply:** fail CLOSED on the first spec fetch (no spec → reject), but
serve a stale cached spec on a later refresh failure (availability over
freshness, bounded by broker enforcement). Beyond `trading_disabled`/`offline`,
also treat `view_only`/`cancel_only`/`auction_mode` as non-orderable for any
order and `limit_only`/`post_only` as non-orderable for market orders.
