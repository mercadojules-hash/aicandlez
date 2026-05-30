---
name: Coinbase symbol mapping SoT
description: Where engine→exchange product_id conversion actually happens at live order placement, and the SoT to reuse.
---

# Coinbase / per-adapter symbol mapping

`placeLiveAutoOrderForUser` (api-server lib/liveUserExecution.ts) computes
`normalizeExecutionSymbol(symbol, exchange)` for validation/logging, but passes
the **RAW engine-native symbol** (e.g. `"NEARUSD"`) to `adapter.placeOrder`,
NOT `normalize.native`. So each exchange adapter's own `normaliseSymbol` is the
authoritative converter at the moment of broker submission.

**Why it bit us:** `CoinbaseAdapter.normaliseSymbol` used a hardcoded 8-entry
map; unmapped symbols were sent dashless and Coinbase rejected them at the
broker with `400 INVALID_ARGUMENT · Invalid product_id`. Order passed every
internal gate, reached `execution_submitted_coinbase`, then failed at Coinbase
— surfaced to the client as a 409 (userLiveOrder maps any non-unsupported
gateway errorCode to 409).

**SoT:** the engine→Coinbase product_id map is `COINBASE_SYMBOLS` in
`lib/marketData.ts` (re-exported there as `SYMBOL_MAP`). It carries Coinbase
rebrands that dash-insertion CANNOT derive: `RNDR→RENDER`, `MATIC→POL`. Any
adapter doing symbol conversion should consult that map, not duplicate it.
`marketData.ts` imports nothing from adapters (only `node:https`), so
`adapter → marketData` is a safe import direction (no cycle).

**How to apply:** when an adapter must map engine symbols to exchange
product_ids, import the venue map from `marketData.ts` and use it as primary,
with algorithmic dash-insertion (longest-first quote-currency suffix) only as a
fallback for symbols not yet in the map. Trim+uppercase input first.

## Coinbase market-order body (separate bug, same adapter)

`market_market_ioc` requires `base_size` for SELL (quote_size is BUY-only).
The engine sizes orders in BASE units (`req.qty`), so the adapter sends
`base_size` for both sides. The old code sent `quote_size = qty*(limitPrice ??
1)` — invalid field for SELL and a meaningless value (no limitPrice on market
orders → base qty × 1). Zero Coinbase customer fills had ever occurred, so this
was masked behind the product_id bug.

**Remaining risk:** adapter has NO per-product precision handling. Coinbase
needs base_size rounded to the product `base_increment` and >= `base_min_size`;
`req.qty.toFixed(8)` can still trip a precision / min-notional 400. Fetch
`/api/v3/brokerage/products/{id}`, cache base_increment + base_min_size, round.
