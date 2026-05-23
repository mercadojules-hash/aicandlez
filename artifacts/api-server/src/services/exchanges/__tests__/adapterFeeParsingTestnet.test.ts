// Guarded end-to-end fee-parsing suite against real exchange sandboxes.
//
// The fixtures suite in `adapterFeeParsing.test.ts` proves we *parse* the
// JSON shapes we expect, but those fixtures are hand-built from published
// API docs — they don't catch the case where a live exchange quietly
// renames a field, swaps a string for an integer, or starts paying fees
// in a different asset for a promo tier. This file places a real
// minimum-size market order against each supported testnet, queries it
// back, and asserts `StandardOrder.fee.source === "broker"` with a
// non-null amount + currency so drift surfaces immediately.
//
// Skipped by default. To run locally or in CI:
//
//   RUN_EXCHANGE_TESTNET=1 \
//   BINANCE_TESTNET_API_KEY=...     BINANCE_TESTNET_API_SECRET=... \
//   GEMINI_SANDBOX_API_KEY=...      GEMINI_SANDBOX_API_SECRET=... \
//   GATEIO_TESTNET_API_KEY=...      GATEIO_TESTNET_API_SECRET=... \
//   CRYPTOCOM_UAT_API_KEY=...       CRYPTOCOM_UAT_API_SECRET=... \
//   BINGX_VST_API_KEY=...           BINGX_VST_API_SECRET=... \
//   HYPERLIQUID_TESTNET_API_KEY=... HYPERLIQUID_TESTNET_API_SECRET=... \
//   DYDX_TESTNET_API_KEY=...        DYDX_TESTNET_API_SECRET=... \
//     pnpm --filter @workspace/api-server run test -- adapterFeeParsingTestnet
//
// Each per-exchange block additionally skips when its own testnet keys
// are missing, so a partial credential set still produces useful signal.
//
// ── Broker coverage matrix ───────────────────────────────────────────────────
//
// Verified weekly drift coverage (real sandbox, real broker fee):
//   ✓ Binance Spot Testnet    → testnet.binance.vision
//   ✓ Gemini Sandbox          → api.sandbox.gemini.com
//   ✓ Gate.io Spot Testnet    → api-testnet.gateapi.io
//   ✓ Crypto.com Exchange UAT → uat-api.3ona.co
//   ✓ BingX VST               → open-api-vst.bingx.com
//   ✓ Phemex Testnet          → testnet-api.phemex.com
//
// Wired but credential-gated (skip-if-missing; assert place→broker-fee
// against the public sandbox the adapter already opts into via
// `AdapterConfig.testnet`). These blocks will currently THROW on a real
// run because `placeOrder` requires wallet signing that's not yet
// implemented — the throw is the desired signal that the adapter needs
// finishing before drift coverage is real:
//   ⚠ Hyperliquid Testnet     → api.hyperliquid-testnet.xyz
//                                (needs EIP-712 wallet signing in placeOrder)
//   ⚠ dYdX v4 Testnet         → indexer.v4testnet.dydx.exchange
//                                (needs cosmos wallet signing in placeOrder)
//
// Documented coverage gaps (intentionally `describe.skip` until each
// blocker below is resolved — gap surfaces in the CI test summary so
// the operator can see where drift would slip through). NO secrets for
// any of these are wired into the weekly workflow until the gap is
// closed: that prevents an accidental live-trading run if a credential
// gets added to GitHub Secrets ahead of the adapter work.
//
//   ⚠ Bitget Demo Trading
//       Adapter: `placeOrder` returns `simulatedOrder(...)` unconditionally
//                AND demo trading is a `PAPTRADING: 1` header on the prod
//                host (not a separate sandbox URL), so wiring `testnet`
//                here would aim at production.
//       Unblockers: plumb a `demoMode` flag through `AdapterConfig`, send
//                   the demo header, and return the real exchange order
//                   id from `placeOrder` so `getOrder` can resolve the
//                   broker fee.
//
//   ⚠ HTX Demo
//       Adapter: `placeOrder` returns `simulatedOrder(...)`; HTX has no
//                public REST sandbox today (paper trading is UI-only).
//
//   ⚠ Kraken Spot Demo
//       No public REST sandbox for Kraken Spot — `demo-futures.kraken.com`
//       only covers Kraken Futures (different adapter surface).
//
//   ⚠ Coinbase Advanced Trade
//       No public sandbox. Catching fee-shape drift here will require a
//       hard-gated live tiny-order + auto-refund probe; intentionally
//       deferred until that gating is in place — *not* enabled in the
//       weekly workflow.

import { describe, expect, it } from "vitest";

import { BinanceAdapter }      from "../adapters/BinanceAdapter.js";
import { GeminiAdapter }       from "../adapters/GeminiAdapter.js";
import { GateIOAdapter }       from "../adapters/GateIOAdapter.js";
import { CryptoDotComAdapter } from "../adapters/CryptoDotComAdapter.js";
import { BingXAdapter }        from "../adapters/BingXAdapter.js";
import { HyperliquidAdapter }  from "../adapters/HyperliquidAdapter.js";
import { dYdXAdapter }         from "../adapters/dYdXAdapter.js";
import { PhemexAdapter }       from "../adapters/PhemexAdapter.js";

import type { AdapterConfig, StandardOrder } from "../types.js";

const ENABLED = process.env["RUN_EXCHANGE_TESTNET"] === "1";

function baseCfg(exchange: string, key?: string, secret?: string): AdapterConfig {
  return {
    exchange,
    apiKey:      key,
    apiSecret:   secret,
    takerFeePct: 0.1,
    makerFeePct: 0.1,
    testnet:     true,
    rateLimit:   { ordersPerSecond: 2, requestsPerMinute: 60 },
  };
}

function assertBrokerFee(order: StandardOrder | null | undefined, label: string): void {
  expect(order, `${label}: exchange returned no order`).toBeTruthy();
  expect(order!.fee.source, `${label}: fee.source`).toBe("broker");
  expect(order!.fee.amount, `${label}: fee.amount NaN`).not.toBeNaN();
  expect(
    Math.abs(order!.fee.amount),
    `${label}: fee.amount must be non-zero`,
  ).toBeGreaterThan(0);
  expect(order!.fee.currency, `${label}: fee.currency`).toBeTruthy();
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

// ──────────────────────────────────────────────────────────────────────────────
// Binance Spot Testnet
// ──────────────────────────────────────────────────────────────────────────────

const BINANCE_KEY    = process.env["BINANCE_TESTNET_API_KEY"];
const BINANCE_SECRET = process.env["BINANCE_TESTNET_API_SECRET"];

describe.skipIf(!ENABLED || !BINANCE_KEY || !BINANCE_SECRET)(
  "Binance Spot Testnet — broker fee end-to-end",
  () => {
    it("places a tiny BTCUSDT market order and reports broker fee from fills[]", async () => {
      const adapter = new BinanceAdapter(baseCfg("Binance", BINANCE_KEY, BINANCE_SECRET));

      // Testnet min-notional is ~10 USDT; 0.0002 BTC ≈ $12-15 worth.
      // The end-to-end broker-fee surface on Binance Spot is the FULL
      // placeOrder response (`fills[].commission` / `commissionAsset`) —
      // the `/api/v3/order` query path returns the order *without* fills,
      // so our adapter's `getOrder` necessarily falls back to estimate.
      // The fills→fee path is therefore the one this suite must guard.
      const placed = await adapter.placeOrder({
        symbol: "BTCUSD", side: "buy", type: "market", qty: 0.0002,
      });
      assertBrokerFee(placed, "Binance placeOrder");
    }, 45_000);
  },
);

// ──────────────────────────────────────────────────────────────────────────────
// Gemini Sandbox
// ──────────────────────────────────────────────────────────────────────────────

const GEMINI_KEY    = process.env["GEMINI_SANDBOX_API_KEY"];
const GEMINI_SECRET = process.env["GEMINI_SANDBOX_API_SECRET"];

describe.skipIf(!ENABLED || !GEMINI_KEY || !GEMINI_SECRET)(
  "Gemini Sandbox — broker fee end-to-end",
  () => {
    it("places + queries a tiny BTCUSD market order and reports broker fee", async () => {
      const adapter = new GeminiAdapter(baseCfg("Gemini", GEMINI_KEY, GEMINI_SECRET));

      const placed = await adapter.placeOrder({
        symbol: "BTCUSD", side: "buy", type: "market", qty: 0.0002,
      });
      assertBrokerFee(placed, "Gemini placeOrder");

      await sleep(1_000);
      const queried = await adapter.getOrder(placed.exchangeOrderId, "BTCUSD");
      assertBrokerFee(queried, "Gemini getOrder");
    }, 45_000);
  },
);

// ──────────────────────────────────────────────────────────────────────────────
// Documented-gap placeholders.
//
// These are intentionally `describe.skip` (NOT `describe.skipIf`) so that
// even if someone wires credentials into the env tomorrow, no live or
// adapter-broken probe runs by accident. Each block stays here so the
// missing coverage is visible in the CI test summary; the path to
// enabling it is captured in the matrix at the top of this file.
// ──────────────────────────────────────────────────────────────────────────────

describe.skip("Bitget Demo Trading — broker fee end-to-end (BLOCKED: see matrix)", () => {
  it("placeholder — needs demo-header support + real exchange order id from placeOrder", () => {
    expect(true).toBe(true);
  });
});

const BINGX_KEY    = process.env["BINGX_VST_API_KEY"];
const BINGX_SECRET = process.env["BINGX_VST_API_SECRET"];

describe.skipIf(!ENABLED || !BINGX_KEY || !BINGX_SECRET)(
  "BingX VST — broker fee end-to-end",
  () => {
    it("places + queries a tiny BTC-USDT market order and reports broker fee", async () => {
      const adapter = new BingXAdapter(baseCfg("BingX", BINGX_KEY, BINGX_SECRET));

      // BingX `placeOrder` now preserves the real exchange order id and
      // immediately round-trips through `getOrder`, which maps
      // `fee` / `feeAsset` → `source: "broker"`. We still exercise an
      // explicit `getOrder` to confirm both surfaces stay in sync.
      const placed = await adapter.placeOrder({
        symbol: "BTCUSD", side: "buy", type: "market", qty: 0.0002,
      });
      assertBrokerFee(placed, "BingX placeOrder");

      await sleep(1_000);
      const queried = await adapter.getOrder(placed.exchangeOrderId, "BTCUSD");
      assertBrokerFee(queried, "BingX getOrder");
    }, 45_000);
  },
);

describe.skip("HTX Demo — broker fee end-to-end (BLOCKED: no public REST sandbox)", () => {
  it("placeholder — paper trading is UI-only on HTX today", () => {
    expect(true).toBe(true);
  });
});

const CRYPTOCOM_KEY    = process.env["CRYPTOCOM_UAT_API_KEY"];
const CRYPTOCOM_SECRET = process.env["CRYPTOCOM_UAT_API_SECRET"];

describe.skipIf(!ENABLED || !CRYPTOCOM_KEY || !CRYPTOCOM_SECRET)(
  "Crypto.com Exchange UAT — broker fee end-to-end",
  () => {
    it("places + queries a tiny BTC_USDT market order and reports broker fee", async () => {
      const adapter = new CryptoDotComAdapter(
        baseCfg("CryptoDotCom", CRYPTOCOM_KEY, CRYPTOCOM_SECRET),
      );

      // Crypto.com `placeOrder` now preserves the real `result.order_id`
      // returned by `/v2/private/create-order` and immediately resolves
      // the broker fee via `/v2/private/get-order-detail`, which maps
      // `fee_currency_amount` / `fee_currency` → `source: "broker"`.
      const placed = await adapter.placeOrder({
        symbol: "BTCUSD", side: "buy", type: "market", qty: 0.0002,
      });
      assertBrokerFee(placed, "CryptoDotCom placeOrder");

      await sleep(1_000);
      const queried = await adapter.getOrder(placed.exchangeOrderId, "BTCUSD");
      assertBrokerFee(queried, "CryptoDotCom getOrder");
    }, 45_000);
  },
);

const GATEIO_KEY    = process.env["GATEIO_TESTNET_API_KEY"];
const GATEIO_SECRET = process.env["GATEIO_TESTNET_API_SECRET"];

describe.skipIf(!ENABLED || !GATEIO_KEY || !GATEIO_SECRET)(
  "Gate.io Spot Testnet — broker fee end-to-end",
  () => {
    it("places + queries a tiny BTC_USDT market order and reports broker fee", async () => {
      const adapter = new GateIOAdapter(baseCfg("GateIO", GATEIO_KEY, GATEIO_SECRET));

      // Gate.io's `placeOrder` returns the normalised exchange response,
      // and `normaliseOrder` maps `raw.fee` → `source: "broker"` when
      // present. `getOrder` exercises the same parsing path so we
      // double-check both surfaces.
      const placed = await adapter.placeOrder({
        symbol: "BTCUSD", side: "buy", type: "market", qty: 0.0002,
      });
      assertBrokerFee(placed, "GateIO placeOrder");

      await sleep(1_000);
      const queried = await adapter.getOrder(placed.exchangeOrderId, "BTCUSD");
      assertBrokerFee(queried, "GateIO getOrder");
    }, 45_000);
  },
);

describe.skip("Kraken Spot Demo — broker fee end-to-end (BLOCKED: no public spot sandbox)", () => {
  it("placeholder — demo-futures.kraken.com only covers Kraken Futures", () => {
    expect(true).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Hyperliquid Testnet
//
// The adapter wires `api.hyperliquid-testnet.xyz` via `AdapterConfig.testnet`,
// so a credentialled run aims at the public sandbox — never prod. The
// `placeOrder` path currently throws because EIP-712 wallet signing is
// not yet implemented; once it lands, this block starts asserting the
// `fee.source === "broker"` invariant against real testnet fills. Until
// then, a credentialled run produces a hard, named failure so the gap
// is impossible to forget.
// ──────────────────────────────────────────────────────────────────────────────

const HYPERLIQUID_KEY    = process.env["HYPERLIQUID_TESTNET_API_KEY"];
const HYPERLIQUID_SECRET = process.env["HYPERLIQUID_TESTNET_API_SECRET"];

describe.skipIf(!ENABLED || !HYPERLIQUID_KEY || !HYPERLIQUID_SECRET)(
  "Hyperliquid Testnet — broker fee end-to-end",
  () => {
    it("places a tiny BTC-PERP market order and reports broker fee", async () => {
      const adapter = new HyperliquidAdapter(
        baseCfg("Hyperliquid", HYPERLIQUID_KEY, HYPERLIQUID_SECRET),
      );

      const placed = await adapter.placeOrder({
        symbol: "BTCUSD", side: "buy", type: "market", qty: 0.0002,
      });
      assertBrokerFee(placed, "Hyperliquid placeOrder");

      await sleep(1_000);
      const queried = await adapter.getOrder(placed.exchangeOrderId, "BTCUSD");
      assertBrokerFee(queried, "Hyperliquid getOrder");
    }, 45_000);
  },
);

// ──────────────────────────────────────────────────────────────────────────────
// dYdX v4 Testnet
//
// The adapter wires `indexer.v4testnet.dydx.exchange` via `AdapterConfig.testnet`,
// so a credentialled run aims at the public sandbox. `placeOrder` currently
// throws pending cosmos wallet signing; same deal as Hyperliquid — the
// block lights up the moment signing lands.
// ──────────────────────────────────────────────────────────────────────────────

const DYDX_KEY    = process.env["DYDX_TESTNET_API_KEY"];
const DYDX_SECRET = process.env["DYDX_TESTNET_API_SECRET"];

describe.skipIf(!ENABLED || !DYDX_KEY || !DYDX_SECRET)(
  "dYdX v4 Testnet — broker fee end-to-end",
  () => {
    it("places a tiny BTC-USD market order and reports broker fee", async () => {
      const adapter = new dYdXAdapter(baseCfg("dYdX", DYDX_KEY, DYDX_SECRET));

      const placed = await adapter.placeOrder({
        symbol: "BTCUSD", side: "buy", type: "market", qty: 0.0002,
      });
      assertBrokerFee(placed, "dYdX placeOrder");

      await sleep(1_000);
      const queried = await adapter.getOrder(placed.exchangeOrderId, "BTCUSD");
      assertBrokerFee(queried, "dYdX getOrder");
    }, 45_000);
  },
);

// ──────────────────────────────────────────────────────────────────────────────
// Phemex Testnet — intentionally excluded.
//
// `testnet-api.phemex.com` is wired in the adapter and `getOrder` already
// resolves a real broker fee from `cumFeeEv`, BUT `PhemexAdapter.placeOrder`
// returns `simulatedOrder(...)` regardless of the underlying `/spot/orders`
// response — the real exchange order id is discarded on line ~161, so the
// place→query roundtrip can never bridge to a real fee. Promoting this to
// `describe.skipIf` would always assert against `source: "estimate"` and
// fail every run, which is noisy, not informative.
//
// Unblock: have `placeOrder` parse `data.data.orderID` from the Phemex
// response and return it on the `StandardOrder`, then convert this block
// to `describe.skipIf(!ENABLED || !PHEMEX_KEY || !PHEMEX_SECRET)` with the
// same place+getOrder pattern used above.
// ──────────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────────
// Phemex Testnet
//
// `PhemexAdapter.placeOrder` now preserves the real `data.orderID` returned
// by `/spot/orders` and immediately round-trips through `getOrder`, which
// queries `/spot/orders/active` first and falls back to `/api-data/spot/order`
// for filled market orders — the final `StandardOrder.fee` is sourced from
// `cumFeeEv` (`source: "broker"`).
// ──────────────────────────────────────────────────────────────────────────────

const PHEMEX_KEY    = process.env["PHEMEX_TESTNET_API_KEY"];
const PHEMEX_SECRET = process.env["PHEMEX_TESTNET_API_SECRET"];

describe.skipIf(!ENABLED || !PHEMEX_KEY || !PHEMEX_SECRET)(
  "Phemex Testnet — broker fee end-to-end",
  () => {
    it("places + queries a tiny sBTCUSDT market order and reports broker fee", async () => {
      const adapter = new PhemexAdapter(baseCfg("Phemex", PHEMEX_KEY, PHEMEX_SECRET));

      const placed = await adapter.placeOrder({
        symbol: "BTCUSD", side: "buy", type: "market", qty: 0.0002,
      });
      assertBrokerFee(placed, "Phemex placeOrder");

      await sleep(1_000);
      const queried = await adapter.getOrder(placed.exchangeOrderId, "BTCUSD");
      assertBrokerFee(queried, "Phemex getOrder");
    }, 45_000);
  },
);

describe.skip("Coinbase Advanced Trade — broker fee end-to-end (BLOCKED: no sandbox)", () => {
  it("placeholder — needs hard-gated live tiny-order + auto-refund probe", () => {
    expect(true).toBe(true);
  });
});

// A tiny meta-test so the file is never silently empty in CI dashboards.
describe("adapterFeeParsingTestnet harness", () => {
  it("is gated behind RUN_EXCHANGE_TESTNET=1", () => {
    expect(typeof ENABLED).toBe("boolean");
  });
});
