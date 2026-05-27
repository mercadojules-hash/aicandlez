// ── Shared exchange types ─────────────────────────────────────────────────────
// All adapters normalise their exchange-specific data into these structures.

export type OrderSide   = "buy"  | "sell";
export type OrderType   = "market" | "limit" | "stop_limit" | "stop_market";
export type OrderStatus = "open"  | "filled" | "partial" | "cancelled" | "rejected";
export type PositionSide = "long" | "short";

// ── Standard order ────────────────────────────────────────────────────────────

export interface StandardOrder {
  id:               string;        // internal UUID
  exchangeOrderId:  string;        // exchange-native order ID
  exchange:         string;        // e.g. "Binance"
  symbol:           string;        // normalised: "BTCUSD"
  nativeSymbol:     string;        // exchange-native: "BTCUSDT", "XXBTZUSD", etc.
  side:             OrderSide;
  type:             OrderType;
  status:           OrderStatus;
  requestedQty:     number;        // in base asset (BTC, ETH, …)
  filledQty:        number;
  requestedPrice?:  number;        // limit only
  avgFillPrice:     number;
  quoteQty:         number;        // filled notional in USD/USDT
  fee: {
    amount:   number;
    currency: string;
    ratePct:  number;
    // "broker"   — amount came straight from the exchange's order/fill payload
    // "estimate" — amount was derived from the catalog taker rate (computeFee)
    // Receipts prefer broker-sourced amounts when present; estimates are a
    // fallback for brokers that don't surface a per-order commission field.
    source?:  "broker" | "estimate";
  };
  createdAt:  number;              // unix ms
  updatedAt:  number;
  rawResponse?: unknown;           // original exchange payload for auditing
}

// ── Standard position ─────────────────────────────────────────────────────────

export interface StandardPosition {
  id:               string;
  exchange:         string;
  symbol:           string;
  side:             PositionSide;
  size:             number;        // base qty
  entryPrice:       number;
  currentPrice:     number;
  unrealisedPnl:    number;
  unrealisedPnlPct: number;
  leverage:         number;
  marginUsed:       number;
  openedAt:         number;
}

// ── Standard account snapshot ─────────────────────────────────────────────────

export interface AssetBalance {
  free:   number;
  locked: number;
  total:  number;
}

/**
 * Optional split of `totalEquityUSD` between USD fiat cash and USD-pegged
 * stablecoin collateral (USDC today; future stables can be added per
 * exchange). When present, the UI can render "USD Cash / USDC Collateral /
 * Total Deployable Equity" instead of a single anonymous USD figure.
 *
 * Surfaced because Coinbase users routinely park trading capital as USDC
 * rather than USD, and the previous "USD-only" sum silently understated
 * their deployable equity (e.g. $39 cash + $604 USDC reported as $39).
 *
 * Adapters that haven't migrated yet leave this undefined; consumers MUST
 * fall back to `totalEquityUSD` as the single source of truth and treat
 * `usdBreakdown` purely as a presentational enrichment.
 */
export interface UsdBreakdown {
  /** Native USD fiat balance (free + locked). */
  cash:             number;
  /** Sum of USD-pegged stablecoin balances counted toward equity (free + locked). */
  stablecoin:       number;
  /** cash + stablecoin — should equal the USD portion of `totalEquityUSD`. */
  total:            number;
  /** Asset tickers contributing to `stablecoin` (e.g. ["USDC"]). */
  stablecoinAssets: string[];
}

export interface StandardAccount {
  exchange:       string;
  balances:       Record<string, AssetBalance>;  // keyed by asset (BTC, ETH, USDT, …)
  totalEquityUSD: number;
  /** Optional USD/stablecoin split for adapters that distinguish them. */
  usdBreakdown?:  UsdBreakdown;
  positions:      StandardPosition[];
  lastUpdated:    number;
}

// ── Order book ────────────────────────────────────────────────────────────────

export interface OrderBookLevel {
  price: number;
  qty:   number;
}

export interface OrderBook {
  symbol:    string;
  exchange:  string;
  bids:      OrderBookLevel[];  // sorted desc
  asks:      OrderBookLevel[];  // sorted asc
  timestamp: number;
}

// ── Ticker ────────────────────────────────────────────────────────────────────

export interface StandardTicker {
  symbol:     string;
  exchange:   string;
  bid:        number;
  ask:        number;
  last:       number;
  volume24h:  number;
  change24h:  number;
  changePct:  number;
  timestamp:  number;
}

// ── OHLCV candle ──────────────────────────────────────────────────────────────

export interface StandardCandle {
  time:   number;   // unix ms, open time
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

// ── Adapter config ────────────────────────────────────────────────────────────

export interface AdapterConfig {
  exchange:     string;
  apiKey?:      string;
  apiSecret?:   string;
  passphrase?:  string;   // OKX, KuCoin
  /**
   * OAuth 2.0 access token. When present, the adapter authenticates via
   * `Authorization: Bearer <token>` instead of static API key/secret headers.
   * Used by the in-app Alpaca account-opening flow (`AlpacaBrokerProvider`).
   */
  oauthAccessToken?: string;
  testnet?:     boolean;
  /**
   * Bitget-only: route requests through Bitget's "demo trading" surface, which
   * shares the production REST host (`api.bitget.com`) but is gated by a
   * `PAPTRADING: 1` header on every authenticated call. Has no effect on other
   * adapters today. Mutually exclusive with `testnet` in practice — Bitget has
   * no separate sandbox host, so the weekly drift suite opts into demo mode
   * instead of flipping `testnet` (which would still aim at prod with no
   * paper-trading isolation).
   */
  demoMode?:    boolean;
  takerFeePct:  number;   // default taker fee
  makerFeePct:  number;
  rateLimit: {
    ordersPerSecond:    number;
    requestsPerMinute:  number;
  };
}

// ── WebSocket config ──────────────────────────────────────────────────────────

export interface WebSocketConfig {
  url:                 string;
  pingIntervalMs:      number;
  reconnectIntervalMs: number;
  maxReconnects:       number;
}

// ── Connection health ─────────────────────────────────────────────────────────

export type ConnectionState = "connected" | "disconnected" | "reconnecting" | "error";

export interface AdapterHealth {
  exchange:       string;
  state:          ConnectionState;
  latencyMs:      number | null;
  lastHeartbeat:  number | null;
  reconnects:     number;
  errors:         string[];
  rateUsage: {
    ordersPerSecond:   number;
    requestsPerMinute: number;
  };
}

// ── Order request ─────────────────────────────────────────────────────────────

export interface PlaceOrderRequest {
  symbol:       string;     // normalised: "BTCUSD"
  side:         OrderSide;
  type:         OrderType;
  qty:          number;     // base asset qty
  limitPrice?:  number;
  stopPrice?:   number;
  clientId?:    string;     // optional client order tag
}

export interface CancelOrderRequest {
  exchangeOrderId: string;
  symbol:          string;
}
