import { EventEmitter } from "node:events";
import type {
  AdapterConfig,
  AdapterHealth,
  ConnectionState,
  StandardAccount,
  StandardCandle,
  StandardOrder,
  StandardTicker,
  OrderBook,
  PlaceOrderRequest,
  CancelOrderRequest,
} from "./types.js";

// ── BaseExchangeAdapter ────────────────────────────────────────────────────────
//
// Abstract base class that every exchange adapter must extend.
//
// Contract:
//   - Adapters are responsible for normalising all exchange-specific data
//     into the Standard* types defined in types.ts.
//   - Adapters must handle their own rate limiting, retry logic, and
//     WebSocket reconnection internally.
//   - All public methods must be safe to await from the execution engine.
//   - Adapters emit events that the engine and telemetry layers consume:
//       "order"      — a new order state update (StandardOrder)
//       "ticker"     — a live ticker update (StandardTicker)
//       "account"    — account snapshot update (StandardAccount)
//       "error"      — adapter-level error (Error)
//       "connected"  — WS channel up
//       "disconnected" — WS channel down
//
// Usage:
//   class BinanceAdapter extends BaseExchangeAdapter { … }
//   const adapter = new BinanceAdapter(config);
//   await adapter.connect();
//   const account = await adapter.getAccount();

export abstract class BaseExchangeAdapter extends EventEmitter {
  protected readonly config: AdapterConfig;
  protected _state: ConnectionState = "disconnected";
  protected _reconnects = 0;
  protected _errors: string[] = [];
  protected _latencyMs: number | null = null;
  protected _lastHeartbeat: number | null = null;

  // Rate-limit buckets (simple token bucket counters)
  private _ordersThisSecond = 0;
  private _requestsThisMinute = 0;
  private _lastSecondReset = Date.now();
  private _lastMinuteReset = Date.now();

  constructor(config: AdapterConfig) {
    super();
    this.config = config;
  }

  // ── Host resolution ────────────────────────────────────────────────────────
  //
  // Adapters declare their REST host as a `{ prod, testnet }` pair and call
  // this helper from a field initializer. When `config.testnet` is true and
  // the adapter has no public sandbox (testnet === null), construction fails
  // loudly instead of silently routing traffic to production.
  protected resolveHost(hosts: { prod: string; testnet: string | null }): string {
    if (this.config.testnet) {
      if (!hosts.testnet) {
        throw new Error(
          `${this.config.exchange} adapter has no public sandbox; ` +
          `cannot construct with testnet: true`,
        );
      }
      return hosts.testnet;
    }
    return hosts.prod;
  }

  // ── Identity ───────────────────────────────────────────────────────────────

  get exchange(): string { return this.config.exchange; }
  get state(): ConnectionState { return this._state; }

  // ── Abstract interface — must be implemented by each adapter ───────────────

  /** Authenticate and open WebSocket channels. */
  abstract connect(): Promise<void>;

  /** Gracefully close all connections. */
  abstract disconnect(): Promise<void>;

  /** Return a live or cached ticker for the given normalised symbol. */
  abstract getTicker(symbol: string): Promise<StandardTicker>;

  /** Return recent OHLCV candles. timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d" */
  abstract getCandles(symbol: string, timeframe: string, limit: number): Promise<StandardCandle[]>;

  /** Return the current account snapshot (balances + open positions). */
  abstract getAccount(): Promise<StandardAccount>;

  /** Place a new order. Returns the normalised StandardOrder. */
  abstract placeOrder(req: PlaceOrderRequest): Promise<StandardOrder>;

  /** Cancel an open order. */
  abstract cancelOrder(req: CancelOrderRequest): Promise<{ ok: boolean; reason?: string }>;

  /** Poll or return cached order status. */
  abstract getOrder(exchangeOrderId: string, symbol: string): Promise<StandardOrder | null>;

  /** Return current order book (top N levels). */
  abstract getOrderBook(symbol: string, depth?: number): Promise<OrderBook>;

  /** Translate a normalised symbol ("BTCUSD") to exchange-native ("XXBTZUSD"). */
  abstract normaliseSymbol(symbol: string): string;

  /** Translate exchange-native symbol back to normalised form. */
  abstract denormaliseSymbol(nativeSymbol: string): string;

  // ── Health ─────────────────────────────────────────────────────────────────

  getHealth(): AdapterHealth {
    return {
      exchange:      this.config.exchange,
      state:         this._state,
      latencyMs:     this._latencyMs,
      lastHeartbeat: this._lastHeartbeat,
      reconnects:    this._reconnects,
      errors:        [...this._errors].slice(0, 20),
      rateUsage: {
        ordersPerSecond:   this._ordersThisSecond,
        requestsPerMinute: this._requestsThisMinute,
      },
    };
  }

  // ── Rate limiting ──────────────────────────────────────────────────────────

  protected checkOrderRateLimit(): void {
    const now = Date.now();
    if (now - this._lastSecondReset > 1000) {
      this._ordersThisSecond = 0;
      this._lastSecondReset  = now;
    }
    if (this._ordersThisSecond >= this.config.rateLimit.ordersPerSecond) {
      throw new Error(`[${this.config.exchange}] Order rate limit exceeded (${this.config.rateLimit.ordersPerSecond}/s)`);
    }
    this._ordersThisSecond++;
  }

  protected checkRequestRateLimit(): void {
    const now = Date.now();
    if (now - this._lastMinuteReset > 60_000) {
      this._requestsThisMinute = 0;
      this._lastMinuteReset    = now;
    }
    if (this._requestsThisMinute >= this.config.rateLimit.requestsPerMinute) {
      throw new Error(`[${this.config.exchange}] Request rate limit exceeded (${this.config.rateLimit.requestsPerMinute}/min)`);
    }
    this._requestsThisMinute++;
  }

  // ── Retry helper ───────────────────────────────────────────────────────────

  protected async withRetry<T>(
    fn:         () => Promise<T>,
    maxTries  = 3,
    delayMs   = 500,
    label     = "request",
  ): Promise<T> {
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        const isRetryable = this.isRetryableError(lastErr);
        if (!isRetryable || attempt === maxTries) break;
        await this.sleep(delayMs * attempt);
      }
    }
    this.recordError(`${label} failed after ${maxTries} attempts: ${lastErr?.message}`);
    throw lastErr!;
  }

  // ── State transitions ──────────────────────────────────────────────────────

  protected setState(state: ConnectionState): void {
    this._state = state;
    this.emit(state === "connected" ? "connected" : "disconnected", { exchange: this.exchange, state });
  }

  protected recordError(msg: string): void {
    this._errors.unshift(`[${new Date().toISOString()}] ${msg}`);
    if (this._errors.length > 50) this._errors.pop();
    this.emit("error", new Error(msg));
  }

  protected heartbeat(): void {
    this._lastHeartbeat = Date.now();
  }

  // ── WebSocket reconnect skeleton (adapters call this from their WS handler) ─

  protected async handleDisconnect(reconnectFn: () => Promise<void>): Promise<void> {
    if (this._reconnects >= 10) {
      this.setState("error");
      this.recordError("Max reconnect attempts reached");
      return;
    }
    this._reconnects++;
    this.setState("reconnecting");
    const delay = Math.min(1000 * 2 ** this._reconnects, 30_000);
    await this.sleep(delay);
    try {
      await reconnectFn();
      this._reconnects = 0;
      this.setState("connected");
    } catch (err) {
      this.recordError(`Reconnect ${this._reconnects} failed: ${(err as Error).message}`);
      await this.handleDisconnect(reconnectFn);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  protected sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  protected isRetryableError(err: Error): boolean {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("econnreset") ||
      msg.includes("etimedout")  ||
      msg.includes("enotfound")  ||
      msg.includes("rate limit") ||
      msg.includes("too many")   ||
      msg.includes("503")        ||
      msg.includes("502")
    );
  }

  protected computeFee(quoteQty: number, isTaker: boolean): number {
    const rate = isTaker ? this.config.takerFeePct : this.config.makerFeePct;
    return parseFloat((quoteQty * rate / 100).toFixed(6));
  }

  protected normaliseSymbolGeneric(symbol: string, suffix: string): string {
    // 2026-05 unification — only accept legitimate `<BASE>USD` inputs.
    // Without this guard the helper happily returns nonsense for inputs
    // that don't end in `USD` (e.g. `HYPE-USD` → `HYPE-USD` unchanged),
    // which would be silently shipped to the broker. Adapters using
    // this fallback must surface the rejection upstream; we throw a
    // plain Error here (adapters don't all import marketData yet —
    // upgrade to UnsupportedSymbolError when they do).
    if (!/^[A-Z0-9]+USD$/.test(symbol)) {
      throw new Error(`Unsupported symbol: ${symbol}`);
    }
    return symbol.replace("USD", suffix);
  }
}
