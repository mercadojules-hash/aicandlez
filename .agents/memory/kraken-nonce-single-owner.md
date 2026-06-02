---
name: Kraken nonce + operator-engine single-owner
description: Why Kraken EAPI:Invalid nonce happens here and the two-part fix (monotonic nonce + one process owns the operator env key).
---

# Kraken `EAPI:Invalid nonce` — root cause + fix

Kraken requires each private-request nonce for an API key to be **strictly
greater** than the previous nonce that key has seen. Two independent failure
modes hit the shared operator key (`KRAKEN_API_KEY`) at once:

1. **Same-process collisions.** `Date.now()` (ms) repeats when several private
   calls fire in the same millisecond. This server fires concurrent private
   calls routinely (≈60s analysis tick + ≈10s fast stop monitor + on-demand
   balance fetches).
2. **Cross-process interleave.** `startTradingLoop()` runs in EVERY api-server
   process — prod Render **and** the Replit dev workspace — all using the same
   env key. Two processes interleave nonces and each invalidates the other.

## Fix (two parts, both required)

- **Monotonic nonce** (`nextKrakenNonce()` in `KrakenAdapter.ts`): module-level
  (process-global) counter, microsecond-scaled, `last = max(micros, last+1)`.
  Strictly increasing across ALL adapter instances and survives clock
  regressions. Solves (1). Microsecond scale stays far below
  `Number.MAX_SAFE_INTEGER` (Date.now()*1000 ≈ 1.7e15 ≪ 9e15).
- **Single-owner gate** (`lib/operatorEngineOwner.ts`): only ONE process may
  drive the operator env key. Default owner rule =
  `NODE_ENV==="production" && !REPL_ID` (Replit sets `REPL_ID`, Render does
  not), with explicit override `OPERATOR_ENGINE_OWNER=true|false`. All operator
  **env-key** entry points in `exchangeEngine.ts` are gated
  (`fetchLiveBalances`/`fetchLiveBalancesWithMeta`/`executeOrder` throw via
  `assertOperatorEngineOwner`; `placeLiveAutoOrder`/`closeOperatorPositionLive`/
  `confirmOperatorOrderFill` return a safe non-owner result). Solves (2).

## Scope boundaries (do not gate these)

- **Customer per-user path is separate** — it uses CredentialVault per-user keys
  via `makeAdapter`, NOT the operator env key. The owner gate must NOT touch it;
  customers keep trading in prod regardless of operator ownership.
- Public `getTicker` path has no nonce — not gated.

## Operational caveat (IMPORTANT)

The default rule does **not** guarantee a single owner if Render scales the prod
service to **>1 instance** — all would resolve owner=true and reintroduce
cross-process nonce conflicts. If prod is ever scaled out, set
`OPERATOR_ENGINE_OWNER=false` on all but one instance.

## Verifying owner at runtime

Boot log `[OPERATOR_ENGINE_OWNER]` states owner vs not-owner + reason. Replit
dev correctly logs "does NOT own the operator Kraken engine". Post-deploy:
Render stdout should show this process OWNS, and `EAPI:Invalid nonce` should
disappear from Kraken private-request logs.
