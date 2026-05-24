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
   * coming_soon  → adapter not built yet OR exchange requires non-API-key auth (wallet signing, etc.)
   */
  status: "live" | "beta" | "coming_soon";
  /** Exchange feature set */
  features: ("spot" | "futures" | "perps" | "defi")[];
  /** true when an adapter class exists in the registry */
  adapterAvailable: boolean;
  /**
   * Forward-compatibility flags (R1 — exchange registry unification).
   * Optional so existing consumers continue working unchanged.
   *
   * - customerVisible: shown in customer-portal modal (default true).
   *   Set false to hide from the customer registry entirely (e.g.,
   *   admin-only Tier-2 beta exchanges).
   * - adminOnly: only shown to admin/super-admin role (default false).
   * - comingSoonNote: rendered next to the COMING SOON badge to explain
   *   why connect is disabled (compliance review, wallet signing, etc.).
   */
  customerVisible?: boolean;
  adminOnly?:       boolean;
  comingSoonNote?:  string;

  /**
   * Frontend presentation overlay (R1.5 — completion of registry
   * unification across PWA + admin command bar + dashboard settings).
   *
   * - sigil: single-character UI badge rendered inside exchange tiles.
   *   Defaults to name[0].toUpperCase() at the consumer side when absent.
   *   Set explicitly for visual disambiguation (Crypto.com vs Coinbase).
   * - brandColor: canonical hex used for active-tile highlight, border,
   *   and ring glow. Single source of truth — PWA, admin CommandBar, and
   *   customer modal all read this; no per-surface color overrides.
   * - apiKeyGuide: short navigation hint shown in the connect wizard
   *   ("Settings → API → Create Key") for exchanges where customers must
   *   self-mint credentials. Optional — Alpaca OAuth path skips this.
   */
  sigil?:        string;
  brandColor?:   string;
  apiKeyGuide?:  string;
}

export const EXCHANGE_CATALOG: ExchangeCatalogEntry[] = [
  // ── Tier 1 — Live (fully implemented) ──────────────────────────────────────
  //
  // Order here = display order in onboarding UIs. Alpaca is listed first
  // because it is the primary recommended path for new live users (US-friendly,
  // instant brokerage onboarding via alpaca.markets). OKX, KuCoin, and Bybit
  // were intentionally removed for US-compliance reasons; do not re-add
  // without a live, vetted adapter and a fresh compliance review.
  //
  // Robinhood is listed in Tier-3 (coming_soon) below — registry-visible per
  // R1 product decision, but adapter is not built (compliance review for
  // unattended-trading via Robinhood API has not been completed).

  {
    id: "Alpaca", name: "Alpaca", url: "https://alpaca.markets", logo: "alpaca",
    requiresPassphrase: false,
    requiredPerms: "Read + Trade (no withdrawal permissions required)",
    warnings: [
      "Do NOT share your secret key.",
      "Use paper trading keys until you are ready for live execution.",
    ],
    takerFeePct: 0.00, makerFeePct: 0.00,
    rateLimit: { ordersPerSecond: 10, requestsPerMinute: 200 },
    status: "live", features: ["spot"], adapterAvailable: true,
    sigil: "A", brandColor: "#ffbe00",
    apiKeyGuide: "Dashboard → Paper Trading → API Keys → Generate Key",
  },
  {
    id: "Kraken", name: "Kraken", url: "https://www.kraken.com", logo: "kraken",
    requiresPassphrase: false,
    requiredPerms: "Query Funds, Query Open Orders & Trades, Create & Modify Orders",
    warnings: [
      "Do NOT enable withdrawal permissions.",
      "Restrict key to read + trade access only.",
    ],
    takerFeePct: 0.26, makerFeePct: 0.16,
    rateLimit: { ordersPerSecond: 1, requestsPerMinute: 60 },
    status: "live", features: ["spot", "futures", "perps"], adapterAvailable: true,
    sigil: "K", brandColor: "#7c4dff",
    apiKeyGuide: "Settings → API → Create API Key",
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
    sigil: "C", brandColor: "#0052ff",
    apiKeyGuide: "Profile → API → New API Key (Advanced Trade)",
  },
  {
    id: "CryptoDotCom", name: "Crypto.com", url: "https://crypto.com/exchange", logo: "cryptocom",
    requiresPassphrase: false,
    requiredPerms: "Read, Trade (Exchange API — not App API)",
    warnings: [
      "Do NOT enable withdrawal permissions.",
      "Use Exchange API keys, not the Crypto.com App API.",
    ],
    takerFeePct: 0.075, makerFeePct: 0.075,
    rateLimit: { ordersPerSecond: 15, requestsPerMinute: 900 },
    status: "live", features: ["spot", "perps"], adapterAvailable: true,
    sigil: "ᶜ", brandColor: "#1a6fdf",
    apiKeyGuide: "Settings → API Keys → Create Key (Exchange API)",
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
    sigil: "B", brandColor: "#f0b90b",
    apiKeyGuide: "Account → API Management → Create API",
  },
  {
    // Promoted to Tier-1 live in R1 (was Tier-2 beta). Adapter has been
    // production-stable; exposing in the customer registry alongside Kraken,
    // Coinbase, Crypto.com, Binance, Alpaca.
    id: "Gemini", name: "Gemini", url: "https://www.gemini.com", logo: "gemini",
    requiresPassphrase: false,
    requiredPerms: "Trader (read + order)",
    warnings: [
      "Do NOT grant Fund Manager or Auditor roles.",
      "Create a Primary API key with Trader scope only.",
    ],
    takerFeePct: 0.35, makerFeePct: 0.20,
    rateLimit: { ordersPerSecond: 5, requestsPerMinute: 300 },
    status: "live", features: ["spot"], adapterAvailable: true,
    sigil: "G", brandColor: "#00dcfa",
    apiKeyGuide: "Settings → API → Create New Key (Primary, Trader scope)",
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
    sigil: "₿", brandColor: "#00d4ff",
    apiKeyGuide: "API Management → Create API Key (set passphrase)",
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
  // Gemini was here (Tier-2 beta) — promoted to Tier-1 live above in R1.
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

  // ── Tier 3 — Coming Soon (registry-visible, not yet connectable) ─────────────
  //
  // These appear in the customer + admin exchange registry so users see the
  // full provider roadmap. The connect flow is gated by `CONNECTABLE_EXCHANGE_IDS`
  // (status !== "coming_soon"), so any attempt to POST /user/exchanges/connect
  // with one of these IDs returns 400. The frontend modal renders these as
  // disabled cards with a COMING SOON badge.

  {
    // Registry-visible Tier-1 provider per R1 product decision. Adapter has
    // not been built — Robinhood unattended-trading via their public API
    // requires a compliance review that has not been completed. Keeping it
    // on the registry surface (and out of CONNECTABLE_EXCHANGE_IDS) provides
    // forward-compatible product UX without introducing premature compliance
    // or adapter risk. Promote by changing status to "live" + adding adapter
    // + setting adapterAvailable: true once compliance work lands.
    id: "Robinhood", name: "Robinhood", url: "https://robinhood.com", logo: "robinhood",
    requiresPassphrase: false,
    requiredPerms: "Trade (read + order) — pending unattended-trading review",
    warnings: [
      "Robinhood integration is in progress — connect flow disabled.",
      "Promotion requires Robinhood unattended-trading compliance review.",
    ],
    takerFeePct: 0.00, makerFeePct: 0.00,
    rateLimit: { ordersPerSecond: 0, requestsPerMinute: 0 },
    status: "coming_soon", features: ["spot"], adapterAvailable: false,
    customerVisible: true,
    comingSoonNote: "Integration in progress — pending compliance review",
  },
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
