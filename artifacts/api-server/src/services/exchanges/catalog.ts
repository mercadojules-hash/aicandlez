// ── Exchange Catalog ──────────────────────────────────────────────────────────
//
// Single source of truth for all supported exchanges.
// Adding a new exchange = add one entry here + create an adapter class.
//
// Used by:
//   - adapters.ts     → bootstrap adapter instances at startup
//   - userExchanges.ts → validate connections, return metadata to frontend
//   - Frontend         → receives catalog via GET /api/user/exchanges

export interface ExchangeCatalogEntry {
  /** Canonical ID — must match adapter.exchange and DB column values */
  id: string;
  /** Display name */
  name: string;
  /** Exchange website */
  url: string;
  /** Lowercase logo identifier for UI asset lookup */
  logo: string;
  /** Whether the exchange API requires a passphrase in addition to key/secret */
  requiresPassphrase: boolean;
  /** Human-readable list of required API permissions shown in connect wizard */
  requiredPerms: string;
  /** Safety warnings shown before the user connects */
  warnings: string[];
  /** Default taker fee percentage */
  takerFeePct: number;
  /** Default maker fee percentage */
  makerFeePct: number;
  rateLimit: {
    ordersPerSecond:    number;
    requestsPerMinute:  number;
  };
  /**
   * live         → adapter fully implemented and in production use
   * beta         → adapter implemented, public + private endpoints work, not yet battle-tested
   * coming_soon  → adapter scaffolded; exchange requires non-API-key auth (wallet signing, etc.)
   */
  status: "live" | "beta" | "coming_soon";
  /** Exchange feature set */
  features: ("spot" | "futures" | "perps" | "defi")[];
  /** true when an adapter class exists in the registry */
  adapterAvailable: boolean;
}

export const EXCHANGE_CATALOG: ExchangeCatalogEntry[] = [
  // ── Tier 1 — Live (fully implemented) ──────────────────────────────────────

  {
    id: "Kraken", name: "Kraken", url: "https://www.kraken.com", logo: "kraken",
    requiresPassphrase: false,
    requiredPerms: "Query Funds, Query Open Orders & Trades, Create & Modify Orders",
    warnings: [
      "Do NOT enable withdrawal permissions.",
      "Use a restricted key scoped to trading only.",
    ],
    takerFeePct: 0.26, makerFeePct: 0.16,
    rateLimit: { ordersPerSecond: 1, requestsPerMinute: 60 },
    status: "live", features: ["spot", "futures"], adapterAvailable: true,
  },
  {
    id: "Binance", name: "Binance", url: "https://www.binance.com", logo: "binance",
    requiresPassphrase: false,
    requiredPerms: "Enable Reading, Enable Spot & Margin Trading",
    warnings: [
      "Do NOT enable withdrawals.",
      "Do NOT enable futures or margin unless explicitly required.",
    ],
    takerFeePct: 0.10, makerFeePct: 0.10,
    rateLimit: { ordersPerSecond: 10, requestsPerMinute: 1200 },
    status: "live", features: ["spot", "futures", "perps"], adapterAvailable: true,
  },
  {
    id: "Coinbase", name: "Coinbase", url: "https://www.coinbase.com", logo: "coinbase",
    requiresPassphrase: false,
    requiredPerms: "View, Trade (Advanced Trade API keys only)",
    warnings: [
      "Do NOT enable Transfer permissions.",
      "Use Advanced Trade API keys, not legacy Coinbase Pro keys.",
    ],
    takerFeePct: 0.60, makerFeePct: 0.40,
    rateLimit: { ordersPerSecond: 5, requestsPerMinute: 300 },
    status: "live", features: ["spot"], adapterAvailable: true,
  },
  {
    id: "Bybit", name: "Bybit", url: "https://www.bybit.com", logo: "bybit",
    requiresPassphrase: false,
    requiredPerms: "Read, Trade (Unified Trading Account)",
    warnings: [
      "Do NOT enable withdraw permissions.",
      "Restrict key to Unified Trading Account only.",
    ],
    takerFeePct: 0.10, makerFeePct: 0.10,
    rateLimit: { ordersPerSecond: 10, requestsPerMinute: 600 },
    status: "live", features: ["spot", "perps"], adapterAvailable: true,
  },
  {
    id: "OKX", name: "OKX", url: "https://www.okx.com", logo: "okx",
    requiresPassphrase: true,
    requiredPerms: "Read, Trade",
    warnings: [
      "Do NOT enable withdraw permissions.",
      "Passphrase is required — set when creating the API key.",
    ],
    takerFeePct: 0.10, makerFeePct: 0.08,
    rateLimit: { ordersPerSecond: 20, requestsPerMinute: 600 },
    status: "live", features: ["spot", "futures", "perps"], adapterAvailable: true,
  },
  {
    id: "KuCoin", name: "KuCoin", url: "https://www.kucoin.com", logo: "kucoin",
    requiresPassphrase: true,
    requiredPerms: "General, Trade",
    warnings: [
      "Do NOT enable withdrawal permission.",
      "Passphrase must match what you set when creating the key.",
    ],
    takerFeePct: 0.10, makerFeePct: 0.10,
    rateLimit: { ordersPerSecond: 5, requestsPerMinute: 300 },
    status: "live", features: ["spot", "futures"], adapterAvailable: true,
  },

  // ── Tier 2 — Beta (implemented, not yet battle-tested) ─────────────────────

  {
    id: "GateIO", name: "Gate.io", url: "https://www.gate.io", logo: "gateio",
    requiresPassphrase: false,
    requiredPerms: "Spot Trade, Account Read",
    warnings: [
      "Do NOT enable withdrawal permissions.",
      "Use a sub-account key restricted to spot trading only.",
    ],
    takerFeePct: 0.20, makerFeePct: 0.20,
    rateLimit: { ordersPerSecond: 10, requestsPerMinute: 900 },
    status: "beta", features: ["spot", "futures", "perps"], adapterAvailable: true,
  },
  {
    id: "Bitget", name: "Bitget", url: "https://www.bitget.com", logo: "bitget",
    requiresPassphrase: true,
    requiredPerms: "Read, Spot Trade",
    warnings: [
      "Do NOT enable withdrawal permissions.",
      "Passphrase is required — set when creating the API key.",
      "Restrict to Spot trading only.",
    ],
    takerFeePct: 0.10, makerFeePct: 0.10,
    rateLimit: { ordersPerSecond: 10, requestsPerMinute: 600 },
    status: "beta", features: ["spot", "futures", "perps"], adapterAvailable: true,
  },
  {
    id: "MEXC", name: "MEXC", url: "https://www.mexc.com", logo: "mexc",
    requiresPassphrase: false,
    requiredPerms: "Enable Reading, Enable Spot Trading",
    warnings: [
      "Do NOT enable withdrawal permissions.",
      "Restrict key to spot trading only.",
    ],
    takerFeePct: 0.10, makerFeePct: 0.10,
    rateLimit: { ordersPerSecond: 20, requestsPerMinute: 1200 },
    status: "beta", features: ["spot", "futures"], adapterAvailable: true,
  },
  {
    id: "CryptoDotCom", name: "Crypto.com Exchange", url: "https://crypto.com/exchange", logo: "cryptocom",
    requiresPassphrase: false,
    requiredPerms: "Read, Trade (Exchange API — not App API)",
    warnings: [
      "Do NOT enable withdrawal permissions.",
      "Use Exchange API keys, not the Crypto.com App API.",
    ],
    takerFeePct: 0.075, makerFeePct: 0.075,
    rateLimit: { ordersPerSecond: 15, requestsPerMinute: 900 },
    status: "beta", features: ["spot", "perps"], adapterAvailable: true,
  },
  {
    id: "HTX", name: "HTX (Huobi)", url: "https://www.htx.com", logo: "htx",
    requiresPassphrase: false,
    requiredPerms: "Read, Trade",
    warnings: [
      "Do NOT enable withdrawal permissions.",
      "HTX was formerly known as Huobi Global.",
    ],
    takerFeePct: 0.20, makerFeePct: 0.20,
    rateLimit: { ordersPerSecond: 10, requestsPerMinute: 600 },
    status: "beta", features: ["spot", "futures"], adapterAvailable: true,
  },
  {
    id: "Gemini", name: "Gemini", url: "https://www.gemini.com", logo: "gemini",
    requiresPassphrase: false,
    requiredPerms: "Trader (read + order)",
    warnings: [
      "Do NOT grant Fund Manager or Auditor roles.",
      "Create a Primary API key with Trader scope only.",
    ],
    takerFeePct: 0.35, makerFeePct: 0.20,
    rateLimit: { ordersPerSecond: 5, requestsPerMinute: 300 },
    status: "beta", features: ["spot"], adapterAvailable: true,
  },
  {
    id: "Bitstamp", name: "Bitstamp", url: "https://www.bitstamp.net", logo: "bitstamp",
    requiresPassphrase: false,
    requiredPerms: "Account balance, Open orders, Buy/Sell",
    warnings: [
      "Do NOT enable withdrawal permissions.",
      "Restrict API key to trading + read access only.",
    ],
    takerFeePct: 0.50, makerFeePct: 0.50,
    rateLimit: { ordersPerSecond: 8, requestsPerMinute: 400 },
    status: "beta", features: ["spot"], adapterAvailable: true,
  },
  {
    id: "Phemex", name: "Phemex", url: "https://phemex.com", logo: "phemex",
    requiresPassphrase: false,
    requiredPerms: "Read, Trade",
    warnings: [
      "Do NOT enable withdrawal permissions.",
      "Restrict to spot trading permissions only.",
    ],
    takerFeePct: 0.075, makerFeePct: 0.025,
    rateLimit: { ordersPerSecond: 10, requestsPerMinute: 600 },
    status: "beta", features: ["spot", "perps"], adapterAvailable: true,
  },
  {
    id: "BloFin", name: "BloFin", url: "https://blofin.com", logo: "blofin",
    requiresPassphrase: true,
    requiredPerms: "Read, Trade",
    warnings: [
      "Do NOT enable withdrawal permissions.",
      "Passphrase required — set when creating the API key.",
    ],
    takerFeePct: 0.10, makerFeePct: 0.02,
    rateLimit: { ordersPerSecond: 20, requestsPerMinute: 600 },
    status: "beta", features: ["futures", "perps"], adapterAvailable: true,
  },
  {
    id: "BingX", name: "BingX", url: "https://bingx.com", logo: "bingx",
    requiresPassphrase: false,
    requiredPerms: "Read, Trade",
    warnings: [
      "Do NOT enable withdrawal permissions.",
      "Restrict to spot and perpetual trading only.",
    ],
    takerFeePct: 0.10, makerFeePct: 0.10,
    rateLimit: { ordersPerSecond: 10, requestsPerMinute: 600 },
    status: "beta", features: ["spot", "perps"], adapterAvailable: true,
  },

  // ── Tier 3 — Coming Soon (requires wallet / non-API-key authentication) ──────

  {
    id: "dYdX", name: "dYdX", url: "https://dydx.exchange", logo: "dydx",
    requiresPassphrase: false,
    requiredPerms: "Ethereum wallet signature (no API key)",
    warnings: [
      "dYdX v4 requires wallet-based authentication (Cosmos mnemonic).",
      "API key integration is not yet supported.",
    ],
    takerFeePct: 0.05, makerFeePct: 0.02,
    rateLimit: { ordersPerSecond: 10, requestsPerMinute: 300 },
    status: "coming_soon", features: ["perps", "defi"], adapterAvailable: false,
  },
  {
    id: "Hyperliquid", name: "Hyperliquid", url: "https://hyperliquid.xyz", logo: "hyperliquid",
    requiresPassphrase: false,
    requiredPerms: "Ethereum private key or agent wallet",
    warnings: [
      "Hyperliquid uses Ethereum wallet signing — no API key/secret.",
      "API key integration is not yet supported.",
    ],
    takerFeePct: 0.05, makerFeePct: 0.02,
    rateLimit: { ordersPerSecond: 5, requestsPerMinute: 300 },
    status: "coming_soon", features: ["perps", "defi"], adapterAvailable: false,
  },
];

/** Fast lookup by exchange ID */
export const CATALOG_BY_ID: Record<string, ExchangeCatalogEntry> = Object.fromEntries(
  EXCHANGE_CATALOG.map(e => [e.id, e])
);

/** Set of IDs where connections are supported (not coming_soon) */
export const CONNECTABLE_EXCHANGE_IDS: Set<string> = new Set(
  EXCHANGE_CATALOG.filter(e => e.status !== "coming_soon").map(e => e.id)
);
