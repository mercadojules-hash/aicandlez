// Single source of truth for "exchange name → BaseExchangeAdapter instance".
//
// Before this file existed, the same big `switch (exchange) { case "Kraken": ... }`
// block was duplicated across multiple call sites (routes/userExchanges.ts and
// any new exchange-touching service such as ExchangeHealthMonitor). Each new
// exchange onboarding required editing every duplicate in lock-step — a known
// bug magnet. Now every caller that needs to spin up a per-credential adapter
// instance must go through `makeAdapter()`; adding a new exchange = edit one
// file.
//
// Note: this factory is for **per-credential, ephemeral** adapter instances
// (user-connection tests, health probes, etc). The operator-side
// process-env adapter selector in `lib/exchangeEngine.ts::getLiveAdapter()`
// is a separate concern (different credential source, different lifecycle)
// and is intentionally not unified here.

import { KrakenAdapter }         from "./adapters/KrakenAdapter.js";
import { AlpacaAdapter }         from "./adapters/AlpacaAdapter.js";
import { BinanceAdapter }        from "./adapters/BinanceAdapter.js";
import { CoinbaseAdapter }       from "./adapters/CoinbaseAdapter.js";
import { GateIOAdapter }         from "./adapters/GateIOAdapter.js";
import { BitgetAdapter }         from "./adapters/BitgetAdapter.js";
import { MEXCAdapter }           from "./adapters/MEXCAdapter.js";
import { CryptoDotComAdapter }   from "./adapters/CryptoDotComAdapter.js";
import { HTXAdapter }            from "./adapters/HTXAdapter.js";
import { GeminiAdapter }         from "./adapters/GeminiAdapter.js";
import { BitstampAdapter }       from "./adapters/BitstampAdapter.js";
import { PhemexAdapter }         from "./adapters/PhemexAdapter.js";
import { BloFinAdapter }         from "./adapters/BloFinAdapter.js";
import { BingXAdapter }          from "./adapters/BingXAdapter.js";
import type { BaseExchangeAdapter } from "./BaseExchangeAdapter.js";
import type { ExchangeCredentials } from "../vault/CredentialVault.js";

type AdapterCtor = new (cfg: {
  apiKey?:            string;
  apiSecret?:         string;
  passphrase?:        string;
  oauthAccessToken?:  string;
  oauthRefreshToken?: string;
  oauthExpiresAt?:    number;
  oauthScope?:        string;
  testnet?:           boolean;
  demoMode?:          boolean;
}) => BaseExchangeAdapter;

// ── The one and only adapter map ─────────────────────────────────────────────
// Adding a new exchange = add one line here. Do not duplicate this switch
// elsewhere — import `makeAdapter` instead.
const ADAPTER_MAP: Record<string, AdapterCtor> = {
  // Live
  Kraken:       KrakenAdapter       as unknown as AdapterCtor,
  Alpaca:       AlpacaAdapter       as unknown as AdapterCtor,
  Binance:      BinanceAdapter      as unknown as AdapterCtor,
  Coinbase:     CoinbaseAdapter     as unknown as AdapterCtor,
  // Beta
  GateIO:       GateIOAdapter       as unknown as AdapterCtor,
  Bitget:       BitgetAdapter       as unknown as AdapterCtor,
  MEXC:         MEXCAdapter         as unknown as AdapterCtor,
  CryptoDotCom: CryptoDotComAdapter as unknown as AdapterCtor,
  HTX:          HTXAdapter          as unknown as AdapterCtor,
  Gemini:       GeminiAdapter       as unknown as AdapterCtor,
  Bitstamp:     BitstampAdapter     as unknown as AdapterCtor,
  Phemex:       PhemexAdapter       as unknown as AdapterCtor,
  BloFin:       BloFinAdapter       as unknown as AdapterCtor,
  BingX:        BingXAdapter        as unknown as AdapterCtor,
};

export const SUPPORTED_ADAPTER_EXCHANGES = Object.keys(ADAPTER_MAP);

// Exchanges whose adapter (a) is registered in ADAPTER_MAP above AND (b) has a
// verified public sandbox the `testnet: true` host switch resolves cleanly
// (see adapterTestnetSwitch.test.ts). Paper-mode in the customer portal can
// opt to route real orders through these sandboxes for closer-to-live behavior
// with zero capital risk. Any exchange NOT in this list (including Hyperliquid
// and dYdX, which have testnet hosts but no registered adapter yet) must fall
// back to the internal simulator.
export const SANDBOX_SUPPORTED_EXCHANGES: ReadonlySet<string> = new Set([
  "Binance",
  "Gemini",
  "GateIO",
  "Phemex",
]);

export function hasAdapter(exchange: string): boolean {
  return Object.prototype.hasOwnProperty.call(ADAPTER_MAP, exchange);
}

export function hasSandbox(exchange: string): boolean {
  return SANDBOX_SUPPORTED_EXCHANGES.has(exchange);
}

export interface MakeAdapterOptions {
  /**
   * When true, construct the adapter with `testnet: true` so it resolves its
   * REST host to the verified public sandbox. Throws if the exchange has no
   * public sandbox (caller is expected to gate with `hasSandbox()` first).
   */
  testnet?: boolean;
  /**
   * Bitget-only: when true, the adapter sends the `PAPTRADING: 1` header on
   * every signed call so requests hit Bitget's demo-trading wallet on the
   * production REST host. Has no effect on any other adapter. Mutually
   * exclusive with `testnet` in practice — Bitget has no public sandbox host.
   */
  demoMode?: boolean;
}

export function makeAdapter(
  exchange: string,
  creds: ExchangeCredentials,
  opts: MakeAdapterOptions = {},
): BaseExchangeAdapter {
  const Ctor = ADAPTER_MAP[exchange];
  if (!Ctor) throw new Error(`No adapter for exchange: ${exchange}`);
  return new Ctor({
    apiKey:            creds.apiKey,
    apiSecret:         creds.apiSecret,
    passphrase:        creds.passphrase,
    oauthAccessToken:  creds.oauthAccessToken,
    oauthRefreshToken: creds.oauthRefreshToken,
    oauthExpiresAt:    creds.oauthExpiresAt,
    oauthScope:        creds.oauthScope,
    testnet:           opts.testnet === true ? true : undefined,
    demoMode:          opts.demoMode === true ? true : undefined,
  });
}
