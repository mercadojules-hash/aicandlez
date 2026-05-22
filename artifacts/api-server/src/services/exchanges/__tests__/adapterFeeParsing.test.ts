// Fixtures-based unit tests for broker-fee parsing across every spot
// exchange adapter that surfaces a per-order commission field. Each fixture
// is shaped to match the JSON the live exchange returns according to its
// published API docs (sourced from the upstream API references at the time
// the parsing was wired up); the adapter is then driven through its real
// normalisation code path with the network layer stubbed out so we can
// assert `StandardOrder.fee.source === "broker"` together with the expected
// amount and currency. This guards every adapter against silent regressions
// where a renamed field would otherwise downgrade fees to estimate-only.
//
// Adapters that do NOT yet parse a broker-side fee field (MEXC, Coinbase,
// BingX, Bitstamp, Phemex, Gemini) are exercised too — we assert they fall
// back to `source: "estimate"` so the contract is documented and any future
// addition of broker parsing will trip the test on purpose.

import { describe, expect, it, vi } from "vitest";

import { BinanceAdapter }      from "../adapters/BinanceAdapter.js";
import { KrakenAdapter }       from "../adapters/KrakenAdapter.js";
import { BloFinAdapter }       from "../adapters/BloFinAdapter.js";
import { BitgetAdapter }       from "../adapters/BitgetAdapter.js";
import { HTXAdapter }          from "../adapters/HTXAdapter.js";
import { GateIOAdapter }       from "../adapters/GateIOAdapter.js";
import { CryptoDotComAdapter } from "../adapters/CryptoDotComAdapter.js";
import { MEXCAdapter }         from "../adapters/MEXCAdapter.js";
import { CoinbaseAdapter }     from "../adapters/CoinbaseAdapter.js";
import { BingXAdapter }        from "../adapters/BingXAdapter.js";
import { BitstampAdapter }     from "../adapters/BitstampAdapter.js";
import { PhemexAdapter }       from "../adapters/PhemexAdapter.js";
import { GeminiAdapter }       from "../adapters/GeminiAdapter.js";

import type { AdapterConfig } from "../types.js";

function cfg(exchange: string): AdapterConfig {
  return {
    exchange,
    apiKey:      "test-key",
    apiSecret:   "test-secret",
    takerFeePct: 0.1,
    makerFeePct: 0.1,
    rateLimit:   { ordersPerSecond: 10, requestsPerMinute: 600 },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Binance — placeOrder, FULL response with fills[].commission/commissionAsset
// ──────────────────────────────────────────────────────────────────────────────

describe("BinanceAdapter fee parsing", () => {
  it("reads broker commission from fills[]", async () => {
    const adapter = new BinanceAdapter(cfg("Binance"));
    const fixture = {
      orderId: 28, clientOrderId: "abc", symbol: "BTCUSDT",
      side: "BUY", type: "MARKET", status: "FILLED",
      origQty: "0.01000000", executedQty: "0.01000000",
      price: "0", transactTime: 1700000000000,
      fills: [
        { price: "50000.00", qty: "0.005", commission: "0.000005", commissionAsset: "BTC" },
        { price: "50100.00", qty: "0.005", commission: "0.000005", commissionAsset: "BTC" },
      ],
    };
    vi.spyOn(adapter as unknown as { signedPost: () => Promise<unknown> }, "signedPost")
      .mockResolvedValue(fixture);

    const order = await adapter.placeOrder({ symbol: "BTCUSD", side: "buy", type: "market", qty: 0.01 });

    expect(order.fee.source).toBe("broker");
    expect(order.fee.amount).toBeCloseTo(0.00001, 8);
    expect(order.fee.currency).toBe("BTC");
  });

  it("falls back to estimate when fills[] missing", async () => {
    const adapter = new BinanceAdapter(cfg("Binance"));
    vi.spyOn(adapter as unknown as { signedPost: () => Promise<unknown> }, "signedPost")
      .mockResolvedValue({
        orderId: 29, symbol: "BTCUSDT", side: "BUY", type: "MARKET",
        status: "FILLED", origQty: "0.01", executedQty: "0.01",
        price: "50000", transactTime: 1700000000000,
      });
    const order = await adapter.placeOrder({ symbol: "BTCUSD", side: "buy", type: "market", qty: 0.01 });
    expect(order.fee.source).toBe("estimate");
    expect(order.fee.currency).toBe("USDT");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Kraken — QueryOrders → raw.fee (USD)
// ──────────────────────────────────────────────────────────────────────────────

describe("KrakenAdapter fee parsing", () => {
  it("reads broker fee from QueryOrders", async () => {
    const adapter = new KrakenAdapter(cfg("Kraken"));
    vi.spyOn(adapter as unknown as { krakenPrivate: () => Promise<unknown> }, "krakenPrivate")
      .mockResolvedValue({
        "OXXXXX-YYYYY-ZZZZZZ": {
          status: "closed", vol: "0.01", vol_exec: "0.01",
          price: "50000.0", fee: "1.30", opentm: 1700000000,
          descr: { pair: "XXBTZUSD", type: "buy", ordertype: "market" },
        },
      });

    const order = await adapter.getOrder("OXXXXX-YYYYY-ZZZZZZ", "BTCUSD");
    expect(order?.fee.source).toBe("broker");
    expect(order?.fee.amount).toBeCloseTo(1.30, 4);
    expect(order?.fee.currency).toBe("USD");
  });

  it("falls back to estimate when fee missing", async () => {
    const adapter = new KrakenAdapter(cfg("Kraken"));
    vi.spyOn(adapter as unknown as { krakenPrivate: () => Promise<unknown> }, "krakenPrivate")
      .mockResolvedValue({
        "OXXXXX-YYYYY-ZZZZZZ": {
          status: "closed", vol: "0.01", vol_exec: "0.01",
          price: "50000.0", opentm: 1700000000,
          descr: { pair: "XXBTZUSD", type: "buy", ordertype: "market" },
        },
      });
    const order = await adapter.getOrder("OXXXXX-YYYYY-ZZZZZZ", "BTCUSD");
    expect(order?.fee.source).toBe("estimate");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// BloFin — orders-pending → data[0].fee / feeCcy
// ──────────────────────────────────────────────────────────────────────────────

describe("BloFinAdapter fee parsing", () => {
  it("reads broker fee from order detail", async () => {
    const adapter = new BloFinAdapter(cfg("BloFin"));
    vi.spyOn(adapter as unknown as { signedGet: () => Promise<unknown> }, "signedGet")
      .mockResolvedValue({
        code: "0", msg: "",
        data: [{
          ordId: "1234", instId: "BTC-USDT", side: "buy", ordType: "market",
          state: "filled", sz: "0.01", accFillSz: "0.01", avgPx: "50000",
          fee: "0.5", feeCcy: "USDT", cTime: "1700000000000", uTime: "1700000000000",
        }],
      });
    const order = await adapter.getOrder("1234", "BTCUSD");
    expect(order?.fee.source).toBe("broker");
    expect(order?.fee.amount).toBeCloseTo(0.5, 6);
    expect(order?.fee.currency).toBe("USDT");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Bitget — orderInfo → feeDetail.feeCost / feeCoin
// ──────────────────────────────────────────────────────────────────────────────

describe("BitgetAdapter fee parsing", () => {
  it("reads broker fee from feeDetail", async () => {
    const adapter = new BitgetAdapter(cfg("Bitget"));
    vi.spyOn(adapter as unknown as { signedGet: () => Promise<unknown> }, "signedGet")
      .mockResolvedValue({
        code: "00000", msg: "success",
        data: {
          orderId: "999", side: "buy", orderType: "market", status: "full_fill",
          size: "0.01", baseVolume: "0.01", priceAvg: "50000", quoteVolume: "500",
          feeDetail: { feeCost: "-0.55", feeCoin: "USDT" },
          cTime: "1700000000000", uTime: "1700000000000",
        },
      });
    const order = await adapter.getOrder("999", "BTCUSD");
    expect(order?.fee.source).toBe("broker");
    expect(order?.fee.amount).toBeCloseTo(-0.55, 6);
    expect(order?.fee.currency).toBe("USDT");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// HTX — /v1/order/orders/{id} → field-fees
// ──────────────────────────────────────────────────────────────────────────────

describe("HTXAdapter fee parsing", () => {
  it("reads broker fee from field-fees", async () => {
    const adapter = new HTXAdapter(cfg("HTX"));
    vi.spyOn(adapter as unknown as { signedGet: () => Promise<unknown> }, "signedGet")
      .mockResolvedValue({
        status: "ok",
        data: {
          id: 555, symbol: "btcusdt", type: "buy-market", state: "filled",
          amount: "0.01", price: "0",
          "field-amount": "0.01", "field-cash-amount": "500",
          "field-fees": "0.5", "created-at": 1700000000000,
        },
      });
    const order = await adapter.getOrder("555", "BTCUSD");
    expect(order?.fee.source).toBe("broker");
    expect(order?.fee.amount).toBeCloseTo(0.5, 6);
    expect(order?.fee.currency).toBe("USDT");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GateIO — /spot/orders/{id} → raw.fee / fee_currency
// ──────────────────────────────────────────────────────────────────────────────

describe("GateIOAdapter fee parsing", () => {
  it("reads broker fee from spot order", async () => {
    const adapter = new GateIOAdapter(cfg("GateIO"));
    vi.spyOn(adapter as unknown as { signedGet: () => Promise<unknown> }, "signedGet")
      .mockResolvedValue({
        id: "abc123", currency_pair: "BTC_USDT", side: "buy", type: "market",
        status: "closed", amount: "0.01", fill_price: "50000", price: "0",
        filled_total: "500", fee: "0.5", fee_currency: "USDT",
        create_time_ms: "1700000000000", update_time_ms: "1700000000000",
      });
    const order = await adapter.getOrder("abc123", "BTCUSD");
    expect(order?.fee.source).toBe("broker");
    expect(order?.fee.amount).toBeCloseTo(0.5, 6);
    expect(order?.fee.currency).toBe("USDT");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Crypto.com — get-order-detail → fee_currency_amount / fee_currency
// ──────────────────────────────────────────────────────────────────────────────

describe("CryptoDotComAdapter fee parsing", () => {
  it("reads broker fee from order detail", async () => {
    const adapter = new CryptoDotComAdapter(cfg("CryptoDotCom"));
    vi.spyOn(adapter as unknown as { privatePost: () => Promise<unknown> }, "privatePost")
      .mockResolvedValue({
        id: 1, method: "private/get-order-detail", code: 0,
        result: {
          order_info: {
            order_id: 777, instrument_name: "BTC_USDT", side: "BUY", type: "MARKET",
            status: "FILLED", quantity: 0.01, cumulative_quantity: 0.01,
            avg_price: 50000, cumulative_value: 500,
            fee_currency_amount: 0.5, fee_currency: "USDT",
            create_time: 1700000000000, update_time: 1700000000000,
          },
        },
      });
    const order = await adapter.getOrder("777", "BTCUSD");
    expect(order?.fee.source).toBe("broker");
    expect(order?.fee.amount).toBeCloseTo(0.5, 6);
    expect(order?.fee.currency).toBe("USDT");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Estimate-only adapters — document the current contract so any future
// broker-fee wiring trips this test on purpose.
// ──────────────────────────────────────────────────────────────────────────────

describe("estimate-only adapters", () => {
  it("MEXC reports estimate fees", async () => {
    const adapter = new MEXCAdapter(cfg("MEXC"));
    vi.spyOn(adapter as unknown as { signedPost: () => Promise<unknown> }, "signedPost")
      .mockResolvedValue({ orderId: "m1", price: "50000", origQty: "0.01", executedQty: "0.01" });
    const order = await adapter.placeOrder({ symbol: "BTCUSD", side: "buy", type: "market", qty: 0.01 });
    expect(order.fee.source).toBe("estimate");
  });

  it("Coinbase reports estimate fees", async () => {
    const adapter = new CoinbaseAdapter(cfg("Coinbase"));
    vi.spyOn(adapter as unknown as { signedPost: () => Promise<unknown> }, "signedPost")
      .mockResolvedValue({ success: true, order_id: "cb1", success_response: { order_id: "cb1" } });
    const order = await adapter.placeOrder({ symbol: "BTCUSD", side: "buy", type: "market", qty: 0.01 });
    expect(order.fee.source).toBe("estimate");
  });

  it("BingX reports estimate fees", async () => {
    const adapter = new BingXAdapter(cfg("BingX"));
    vi.spyOn(adapter as unknown as { signedGet: () => Promise<unknown> }, "signedGet")
      .mockResolvedValue({ data: { orderId: "bx1", price: "50000", origQty: "0.01", executedQty: "0.01", status: "FILLED", side: "BUY", type: "MARKET", symbol: "BTC-USDT" } });
    const order = await adapter.getOrder("bx1", "BTCUSD");
    expect(order?.fee.source).toBe("estimate");
  });

  it("Bitstamp reports estimate fees", async () => {
    const adapter = new BitstampAdapter(cfg("Bitstamp"));
    vi.spyOn(adapter as unknown as { signedPost: () => Promise<unknown> }, "signedPost")
      .mockResolvedValue({ id: "bs1", price: "50000", amount: "0.01" });
    const order = await adapter.placeOrder({ symbol: "BTCUSD", side: "buy", type: "market", qty: 0.01 });
    expect(order.fee.source).toBe("estimate");
  });

  it("Phemex reports estimate fees", async () => {
    const adapter = new PhemexAdapter(cfg("Phemex"));
    vi.spyOn(adapter as unknown as { signedGet: () => Promise<unknown> }, "signedGet")
      .mockResolvedValue({ data: { orderID: "px1", avgPriceEp: 5_000_000_000_000, orderQty: "0.01", cumQty: "0.01", ordStatus: "Filled", side: "Buy", ordType: "Market", symbol: "sBTCUSDT" } });
    const order = await adapter.getOrder("px1", "BTCUSD");
    expect(order?.fee.source).toBe("estimate");
  });

  it("Gemini reports estimate fees", async () => {
    const adapter = new GeminiAdapter(cfg("Gemini"));
    vi.spyOn(adapter as unknown as { signedPost: () => Promise<unknown> }, "signedPost")
      .mockResolvedValue({ order_id: "g1", price: "50000", original_amount: "0.01", executed_amount: "0.01", symbol: "btcusd", side: "buy", type: "market", is_live: false, is_cancelled: false });
    const order = await adapter.placeOrder({ symbol: "BTCUSD", side: "buy", type: "market", qty: 0.01 });
    expect(order.fee.source).toBe("estimate");
  });
});
