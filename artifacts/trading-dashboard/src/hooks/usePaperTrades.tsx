/**
 * usePaperTrades — in-memory paper-trade store for the customer Portal.
 *
 * Phase 1 (this implementation): purely client-side simulated execution.
 *   • openTrade(spec) instantly creates an open position
 *   • a 2.5s tick walks unrealized P/L on each open position
 *   • positions auto-close on TP / SL touches (cinematic but believable)
 *   • closed positions feed the TRADE HISTORY panel with realized P/L
 *
 * Phase 2 (later) will swap this for the server-side simulation engine via
 * /api/simulation/*. The component contract (open/close/lists) stays the same
 * so the UI doesn't have to change again.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";

export type Side = "LONG" | "SHORT";
export type CloseReason = "TP" | "SL" | "MANUAL";

export interface OpenTradeInput {
  symbol:   string;   // BTCUSD
  display:  string;   // BTC/USD
  side:     Side;
  entry:    number;
  stop:     number;
  target:   number;
  size?:    number;   // optional override; defaults derived from price
}

export interface PaperTrade {
  id:        string;
  symbol:    string;
  display:   string;
  side:      Side;
  entry:     number;
  stop:      number;
  target:    number;
  size:      number;
  qty:       number;      // human-friendly base units
  openedAt:  number;
  // live state
  last:      number;
  pnl:       number;      // unrealized $ on open trades
  pnlPct:    number;      // unrealized % on open trades
}

export interface ClosedPaperTrade {
  id:         string;
  symbol:     string;
  display:    string;
  side:       Side;
  entry:      number;
  exit:       number;
  size:       number;
  qty:        number;
  openedAt:   number;
  closedAt:   number;
  pnl:        number;
  pnlPct:     number;
  reason:     CloseReason;
}

export interface PaperStats {
  /** Number of currently open simulated positions. */
  openCount:      number;
  /** Number of closed simulated positions in this session. */
  closedCount:    number;
  /** Open + closed combined. */
  totalCount:     number;
  /** Σ unrealized P/L across open positions ($). */
  unrealizedPnl:  number;
  /** Σ realized P/L across closed positions ($). */
  realizedPnl:    number;
  /** Realized + unrealized ($). Same as legacy `totalPnl`. */
  totalPnl:       number;
  /** Realized P/L on positions closed today (local-day boundary, $). */
  todayPnl:       number;
  /** Realized P/L on positions closed this calendar month ($). */
  monthPnl:       number;
  /** Win rate over closed positions (0–100). 0 when no closes yet. */
  winRate:        number;
  /** Starting equity + realized P/L + unrealized P/L. */
  equity:         number;
  /** Symbol of the closed position with the highest realized P/L, or null. */
  bestSymbol:     string | null;
  /** Realized P/L of the best closed position. */
  bestPnl:        number;
}

/** Conventional paper-trading starting balance. */
export const STARTING_EQUITY = 100_000;

interface Ctx {
  open:         PaperTrade[];
  history:      ClosedPaperTrade[];
  totalPnl:     number;
  stats:        PaperStats;
  openTrade:    (input: OpenTradeInput) => PaperTrade;
  closeTrade:   (id: string, reason?: CloseReason) => void;
  clearHistory: () => void;
}

const PaperTradesCtx = createContext<Ctx | null>(null);

/* deterministic id */
function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* nominal size scaled to entry price so qty stays human-friendly */
function defaultSize(entry: number): { size: number; qty: number } {
  // Aim for ~$1,000 - $1,500 notional per simulated entry
  const notional = 1000 + Math.random() * 500;
  const qty = notional / Math.max(entry, 0.0001);
  return { size: notional, qty };
}

function unrealized(t: PaperTrade, last: number): { pnl: number; pnlPct: number } {
  const dir = t.side === "LONG" ? 1 : -1;
  const pnl = (last - t.entry) * t.qty * dir;
  const pnlPct = ((last - t.entry) / t.entry) * 100 * dir;
  return { pnl, pnlPct };
}

function realized(t: PaperTrade, exit: number): { pnl: number; pnlPct: number } {
  return unrealized(t, exit);
}

export function PaperTradesProvider({ children }: { children: ReactNode }) {
  const [open,    setOpen]    = useState<PaperTrade[]>([]);
  const [history, setHistory] = useState<ClosedPaperTrade[]>([]);
  const openRef = useRef(open);
  openRef.current = open;

  const closeTrade = useCallback((id: string, reason: CloseReason = "MANUAL") => {
    setOpen((cur) => {
      const t = cur.find((p) => p.id === id);
      if (!t) return cur;
      const { pnl, pnlPct } = realized(t, t.last);
      const closed: ClosedPaperTrade = {
        id: t.id,
        symbol: t.symbol,
        display: t.display,
        side: t.side,
        entry: t.entry,
        exit: t.last,
        size: t.size,
        qty: t.qty,
        openedAt: t.openedAt,
        closedAt: Date.now(),
        pnl,
        pnlPct,
        reason,
      };
      setHistory((h) => [closed, ...h].slice(0, 80));
      return cur.filter((p) => p.id !== id);
    });
  }, []);

  const openTrade = useCallback((input: OpenTradeInput): PaperTrade => {
    const { size, qty } = input.size
      ? { size: input.size, qty: input.size / Math.max(input.entry, 0.0001) }
      : defaultSize(input.entry);
    const t: PaperTrade = {
      id: uid(),
      symbol:  input.symbol,
      display: input.display,
      side:    input.side,
      entry:   input.entry,
      stop:    input.stop,
      target:  input.target,
      size,
      qty,
      openedAt: Date.now(),
      last:    input.entry,
      pnl:     0,
      pnlPct:  0,
    };
    setOpen((cur) => [t, ...cur].slice(0, 24));
    return t;
  }, []);

  // 2.5s tick — small random walk on `last`, evaluate TP/SL, update P/L.
  // Closures are applied as a single atomic state transition (remove from
  // `open` + append to `history` in the same render) so we cannot lose a
  // trade between the two updates. Exit price snaps to the TP/SL trigger
  // level, not the stochastic `next`, so realized P/L is consistent with
  // institutional TP/SL semantics.
  useEffect(() => {
    const id = setInterval(() => {
      const list = openRef.current;
      if (list.length === 0) return;

      const updated: PaperTrade[] = [];
      const closed:  ClosedPaperTrade[] = [];

      for (const t of list) {
        // 0.10% - 0.35% standard-deviation random step, slightly biased
        // toward the trade's predicted direction so a small majority of
        // trades end profitable (just like a real positive-edge AI).
        const stdev = 0.0010 + Math.random() * 0.0025;
        const bias  = t.side === "LONG" ? 0.00035 : -0.00035;
        const drift = (Math.random() - 0.5) * 2 * stdev + bias;
        let   next  = t.last * (1 + drift);

        // Clamp to ± 6% of entry so a position cannot moonshot.
        const maxUp   = t.entry * 1.06;
        const maxDown = t.entry * 0.94;
        if (next > maxUp)   next = maxUp;
        if (next < maxDown) next = maxDown;

        // TP / SL evaluation — snap exit price to the trigger level.
        let exit:   number | null = null;
        let reason: CloseReason | null = null;
        if (t.side === "LONG") {
          if (next >= t.target)      { exit = t.target; reason = "TP"; }
          else if (next <= t.stop)   { exit = t.stop;   reason = "SL"; }
        } else {
          if (next <= t.target)      { exit = t.target; reason = "TP"; }
          else if (next >= t.stop)   { exit = t.stop;   reason = "SL"; }
        }

        if (exit !== null && reason !== null) {
          const { pnl, pnlPct } = realized(t, exit);
          closed.push({
            id:       t.id,
            symbol:   t.symbol,
            display:  t.display,
            side:     t.side,
            entry:    t.entry,
            exit,
            size:     t.size,
            qty:      t.qty,
            openedAt: t.openedAt,
            closedAt: Date.now(),
            pnl,
            pnlPct,
            reason,
          });
          continue;
        }

        const { pnl, pnlPct } = unrealized(t, next);
        updated.push({ ...t, last: next, pnl, pnlPct });
      }

      if (updated.length === 0 && closed.length === 0) return;

      const closedIds = new Set(closed.map((c) => c.id));
      setOpen((cur) => {
        const byId = new Map(updated.map((u) => [u.id, u]));
        return cur
          .filter((p) => !closedIds.has(p.id))
          .map((p) => byId.get(p.id) ?? p);
      });
      if (closed.length > 0) {
        setHistory((h) => [...closed, ...h].slice(0, 80));
      }
    }, 2_500);

    return () => clearInterval(id);
  }, []);

  const stats = useMemo<PaperStats>(() => {
    const unrealizedPnl = open.reduce((s, t) => s + t.pnl, 0);
    const realizedPnl   = history.reduce((s, t) => s + t.pnl, 0);
    const totalPnl      = unrealizedPnl + realizedPnl;

    // Day / month boundaries against the local clock
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let todayPnl = 0;
    let monthPnl = 0;
    let wins = 0;
    let bestSymbol: string | null = null;
    let bestPnl = -Infinity;
    for (const h of history) {
      if (h.closedAt >= startOfDay)   todayPnl += h.pnl;
      if (h.closedAt >= startOfMonth) monthPnl += h.pnl;
      if (h.pnl > 0) wins += 1;
      if (h.pnl > bestPnl) { bestPnl = h.pnl; bestSymbol = h.display; }
    }
    const closedCount = history.length;
    const winRate = closedCount === 0 ? 0 : (wins / closedCount) * 100;

    return {
      openCount: open.length,
      closedCount,
      totalCount: open.length + closedCount,
      unrealizedPnl,
      realizedPnl,
      totalPnl,
      todayPnl,
      monthPnl,
      winRate,
      equity: STARTING_EQUITY + totalPnl,
      bestSymbol,
      bestPnl: closedCount === 0 ? 0 : bestPnl,
    };
  }, [open, history]);

  const value = useMemo<Ctx>(
    () => ({
      open, history,
      totalPnl: stats.totalPnl,
      stats,
      openTrade, closeTrade,
      clearHistory: () => setHistory([]),
    }),
    [open, history, stats, openTrade, closeTrade],
  );

  return <PaperTradesCtx.Provider value={value}>{children}</PaperTradesCtx.Provider>;
}

export function usePaperTrades(): Ctx {
  const ctx = useContext(PaperTradesCtx);
  if (!ctx) {
    // Soft fallback so a component that mounts outside the provider doesn't
    // crash the whole portal. Returns an inert store.
    return {
      open: [], history: [], totalPnl: 0,
      stats: {
        openCount: 0, closedCount: 0, totalCount: 0,
        unrealizedPnl: 0, realizedPnl: 0, totalPnl: 0,
        todayPnl: 0, monthPnl: 0, winRate: 0,
        equity: STARTING_EQUITY,
        bestSymbol: null, bestPnl: 0,
      },
      openTrade: () => ({} as PaperTrade),
      closeTrade: () => {},
      clearHistory: () => {},
    };
  }
  return ctx;
}

/* ── Public helpers ────────────────────────────────────────────────────── */

export function fmtMoney(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  const v = Math.abs(n);
  return `${sign}$${v.toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

export function fmtQty(qty: number): string {
  if (qty >= 1000) return qty.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (qty >= 1)    return qty.toFixed(3);
  if (qty >= 0.01) return qty.toFixed(4);
  return qty.toFixed(6);
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}
