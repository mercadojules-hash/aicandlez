import type { BaseExchangeAdapter } from "./BaseExchangeAdapter.js";
import type { AdapterHealth } from "./types.js";
import { logger } from "../../lib/logger.js";

// ── ExchangeRegistry ──────────────────────────────────────────────────────────
//
// Central registry for all exchange adapters.
//
// Responsibilities:
//   - Register adapters at startup
//   - Set / get the active adapter (the one the execution engine uses)
//   - Provide health snapshots for all registered adapters
//   - Emit lifecycle events (adapter switch, connection state changes)
//
// Usage:
//   import { registry } from "./ExchangeRegistry.js";
//   registry.register(new KrakenAdapter(config));
//   registry.setActive("Kraken");
//   const adapter = registry.active();   // throws if none set

class ExchangeRegistry {
  private adapters = new Map<string, BaseExchangeAdapter>();
  private _activeId: string | null = null;

  // ── Registration ───────────────────────────────────────────────────────────

  register(adapter: BaseExchangeAdapter): void {
    const key = adapter.exchange.toLowerCase();
    this.adapters.set(key, adapter);
    logger.info({ exchange: adapter.exchange }, "ExchangeRegistry: adapter registered");

    adapter.on("error", (err: Error) => {
      logger.error({ exchange: adapter.exchange, err: err.message }, "ExchangeRegistry: adapter error");
    });
    adapter.on("connected", () => {
      logger.info({ exchange: adapter.exchange }, "ExchangeRegistry: adapter connected");
    });
    adapter.on("disconnected", () => {
      logger.warn({ exchange: adapter.exchange }, "ExchangeRegistry: adapter disconnected");
    });
  }

  unregister(exchangeName: string): void {
    const key = exchangeName.toLowerCase();
    if (this._activeId === key) this._activeId = null;
    this.adapters.delete(key);
    logger.info({ exchange: exchangeName }, "ExchangeRegistry: adapter unregistered");
  }

  // ── Active adapter ─────────────────────────────────────────────────────────

  setActive(exchangeName: string): void {
    const key = exchangeName.toLowerCase();
    if (!this.adapters.has(key)) {
      throw new Error(`ExchangeRegistry: no adapter registered for "${exchangeName}"`);
    }
    this._activeId = key;
    logger.info({ exchange: exchangeName }, "ExchangeRegistry: active adapter changed");
  }

  /** Returns the active adapter. Throws if none is set. */
  active(): BaseExchangeAdapter {
    if (!this._activeId) {
      throw new Error("ExchangeRegistry: no active adapter set");
    }
    const adapter = this.adapters.get(this._activeId);
    if (!adapter) {
      throw new Error(`ExchangeRegistry: active adapter "${this._activeId}" not found`);
    }
    return adapter;
  }

  activeId(): string | null {
    return this._activeId;
  }

  /** Returns a named adapter without changing the active one. */
  get(exchangeName: string): BaseExchangeAdapter | undefined {
    return this.adapters.get(exchangeName.toLowerCase());
  }

  has(exchangeName: string): boolean {
    return this.adapters.has(exchangeName.toLowerCase());
  }

  // ── Health ─────────────────────────────────────────────────────────────────

  getHealth(): Record<string, AdapterHealth> {
    const out: Record<string, AdapterHealth> = {};
    for (const [key, adapter] of this.adapters) {
      out[key] = adapter.getHealth();
    }
    return out;
  }

  getActiveHealth(): AdapterHealth | null {
    if (!this._activeId) return null;
    return this.adapters.get(this._activeId)?.getHealth() ?? null;
  }

  // ── Listing ────────────────────────────────────────────────────────────────

  list(): string[] {
    return [...this.adapters.keys()];
  }
}

// Singleton
export const registry = new ExchangeRegistry();
