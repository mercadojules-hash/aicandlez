// Exchange adapter layer — public API
export * from "./types.js";
export * from "./BaseExchangeAdapter.js";
export * from "./ExchangeRegistry.js";
export * from "./catalog.js";

// ── Live adapters (production-tested) ─────────────────────────────────────────
export * from "./adapters/KrakenAdapter.js";
export * from "./adapters/BinanceAdapter.js";
export * from "./adapters/CoinbaseAdapter.js";

// ── Beta adapters (fully implemented, not yet battle-tested) ──────────────────
export * from "./adapters/GateIOAdapter.js";
export * from "./adapters/BitgetAdapter.js";
export * from "./adapters/MEXCAdapter.js";
export * from "./adapters/CryptoDotComAdapter.js";
export * from "./adapters/HTXAdapter.js";
export * from "./adapters/GeminiAdapter.js";
export * from "./adapters/BitstampAdapter.js";
export * from "./adapters/PhemexAdapter.js";
export * from "./adapters/BloFinAdapter.js";
export * from "./adapters/BingXAdapter.js";

// ── Coming soon (public market data only; wallet-based auth required) ─────────
export * from "./adapters/dYdXAdapter.js";
export * from "./adapters/HyperliquidAdapter.js";
