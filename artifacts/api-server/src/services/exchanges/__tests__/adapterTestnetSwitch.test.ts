// Construction-time guard for the AdapterConfig.testnet switch.
//
// Adapters with a verified public sandbox must construct cleanly when
// testnet: true. Adapters without one must throw a clear error so a
// caller never silently routes "testnet" traffic to production.

import { describe, expect, it } from "vitest";

import { BinanceAdapter }      from "../adapters/BinanceAdapter.js";
import { GeminiAdapter }       from "../adapters/GeminiAdapter.js";
import { HyperliquidAdapter }  from "../adapters/HyperliquidAdapter.js";
import { PhemexAdapter }       from "../adapters/PhemexAdapter.js";
import { dYdXAdapter }         from "../adapters/dYdXAdapter.js";

import { BitgetAdapter }       from "../adapters/BitgetAdapter.js";
import { BingXAdapter }        from "../adapters/BingXAdapter.js";
import { BitstampAdapter }     from "../adapters/BitstampAdapter.js";
import { BloFinAdapter }       from "../adapters/BloFinAdapter.js";
import { CoinbaseAdapter }     from "../adapters/CoinbaseAdapter.js";
import { CryptoDotComAdapter } from "../adapters/CryptoDotComAdapter.js";
import { GateIOAdapter }       from "../adapters/GateIOAdapter.js";
import { HTXAdapter }          from "../adapters/HTXAdapter.js";
import { KrakenAdapter }       from "../adapters/KrakenAdapter.js";
import { MEXCAdapter }         from "../adapters/MEXCAdapter.js";

describe("AdapterConfig.testnet switch", () => {
  describe("adapters with a verified public sandbox", () => {
    const supported: Array<[string, () => unknown]> = [
      ["Binance",     () => new BinanceAdapter({ testnet: true })],
      ["Gemini",      () => new GeminiAdapter({ testnet: true })],
      ["Gate.io",     () => new GateIOAdapter({ testnet: true })],
      ["Hyperliquid", () => new HyperliquidAdapter({ testnet: true })],
      ["Phemex",      () => new PhemexAdapter({ testnet: true })],
      ["dYdX",        () => new dYdXAdapter({ testnet: true })],
    ];
    for (const [name, build] of supported) {
      it(`${name} constructs cleanly with testnet: true`, () => {
        expect(build).not.toThrow();
      });
    }
  });

  describe("adapters without a public sandbox throw on testnet: true", () => {
    const unsupported: Array<[string, () => unknown]> = [
      ["Bitget",       () => new BitgetAdapter({ testnet: true })],
      ["BingX",        () => new BingXAdapter({ testnet: true })],
      ["Bitstamp",     () => new BitstampAdapter({ testnet: true })],
      ["BloFin",       () => new BloFinAdapter({ testnet: true })],
      ["Coinbase",     () => new CoinbaseAdapter({ testnet: true })],
      ["Crypto.com",   () => new CryptoDotComAdapter({ testnet: true })],
      ["HTX",          () => new HTXAdapter({ testnet: true })],
      ["Kraken",       () => new KrakenAdapter({ testnet: true })],
      ["MEXC",         () => new MEXCAdapter({ testnet: true })],
    ];
    for (const [name, build] of unsupported) {
      it(`${name} throws "no public sandbox" on testnet: true`, () => {
        expect(build).toThrow(/no public sandbox/);
      });
    }
  });
});
