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

export interface StandardAccount {
  exchange:       string;
  balances:       Record<string, AssetBalance>;  // keyed by asset (BTC, ETH, USDT, …)
  totalEquityUSD: number;
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
  testnet?:     boolean;
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
