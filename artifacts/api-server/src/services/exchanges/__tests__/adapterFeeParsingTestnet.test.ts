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
//   BINANCE_TESTNET_API_KEY=...    BINANCE_TESTNET_API_SECRET=... \
//   GEMINI_SANDBOX_API_KEY=...     GEMINI_SANDBOX_API_SECRET=... \
//     pnpm --filter @workspace/api-server run test -- adapterFeeParsingTestnet
//
// Each per-exchange block additionally skips when its own testnet keys
// are missing, so a partial credential set still produces useful signal.
//
// Sandbox hosts (verified against each exchange's current public docs):
//   Binance Spot Testnet  → testnet.binance.vision
//   Gemini Sandbox        → api.sandbox.gemini.com
//
// Why these two only, for now:
//   * Phemex is intentionally excluded from the live suite — its adapter's
//     `placeOrder` currently returns a synthetic SIM order ID (the real
//     exchange response is discarded), so a place→query roundtrip can't
//     resolve the broker fee. Phemex stays covered by the fixtures suite
//     until the adapter is updated to surface the real order ID.
//   * Coinbase Advanced Trade, Bitget, BingX, HTX, Gate.io, BloFin,
//     Crypto.com, MEXC, Bitstamp, and Kraken either don't expose a
//     usable public sandbox or have one that doesn't honour their
//     production fee surface. Tracked as a follow-up.

import { describe, expect, it } from "vitest";

import { BinanceAdapter } from "../adapters/BinanceAdapter.js";
import { GeminiAdapter }  from "../adapters/GeminiAdapter.js";

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

// A tiny meta-test so the file is never silently empty in CI dashboards.
describe("adapterFeeParsingTestnet harness", () => {
  it("is gated behind RUN_EXCHANGE_TESTNET=1", () => {
    expect(typeof ENABLED).toBe("boolean");
  });
});
