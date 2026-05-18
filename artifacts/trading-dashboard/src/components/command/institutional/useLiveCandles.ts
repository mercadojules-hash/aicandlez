/**
 * Lightweight, polling live-candle hook for institutional dashboard tiles.
 *
 * - Fetches /api/candles?symbol=X&timeframe=15m&limit=N
 * - Adds soft drift on top so the chart looks "alive" between polls
 * - Falls back to a fully synthetic walk if the API is empty / errors
 *   (so equity tickers like NVDA/TSLA still render a heartbeat sparkline
 *   instead of "no data").
 */

import { useEffect, useMemo, useRef, useState } from "react";

export interface LivePoint { i: number; close: number; volume: number; }

export type LiveState = "loading" | "live" | "synthetic" | "error";

interface Options {
  symbol:     string;
  limit?:     number;
  timeframe?: string;
  /** Fake walk anchor when API returns empty. */
  syntheticAnchor?: number;
  pollMs?:    number;
  driftMs?:   number;
}

interface RawCandle { time?: number; close: number; volume?: number; }

function makeWalk(anchor: number, n: number, seed: number): LivePoint[] {
  let p = anchor;
  let phase = seed;
  const out: LivePoint[] = [];
  for (let i = 0; i < n; i++) {
    phase += 0.18;
    const wave = Math.sin(phase) * anchor * 0.0035;
    const rand = (Math.random() - 0.5) * anchor * 0.0022;
    p = Math.max(anchor * 0.92, Math.min(anchor * 1.08, p + wave * 0.4 + rand));
    out.push({ i, close: p, volume: 100 + Math.random() * 900 });
  }
  return out;
}

/** Anchor prices used when the API has no equity feed yet. */
const SYNTHETIC_ANCHORS: Record<string, number> = {
  NVDA: 940, TSLA: 245, AAPL: 225, MSFT: 425, META: 580, AMD: 165,
  GOOGL: 175, AMZN: 195, PLTR: 24, AVGO: 175, COIN: 245, MSTR: 1450,
  SMCI: 48, CRWD: 320, SHOP: 75, UBER: 70, NFLX: 685, DIS: 105,
  BA: 175, SPY: 565,
};

export function useLiveCandles({
  symbol, limit = 60, timeframe = "15m",
  syntheticAnchor, pollMs = 25_000, driftMs = 900,
}: Options) {
  const [points, setPoints] = useState<LivePoint[]>([]);
  const [state,  setState]  = useState<LiveState>("loading");
  const [livePrice, setLivePrice] = useState<number | null>(null);

  const baseRef   = useRef<LivePoint[]>([]);
  const driftRef  = useRef(0);
  const phaseRef  = useRef(Math.random() * Math.PI * 2);

  // ── Fetch loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const anchor =
      syntheticAnchor ?? SYNTHETIC_ANCHORS[symbol] ?? 100;

    const fetchOnce = () => {
      fetch(`/api/candles?symbol=${symbol}&timeframe=${timeframe}&limit=${limit}`,
            { cache: "no-store" })
        .then(async r => {
          if (cancelled) return;
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = (await r.json()) as RawCandle[];
          if (!data || data.length === 0) throw new Error("empty");
          const mapped: LivePoint[] = data.map((c, i) => ({
            i,
            close:  Number(c.close),
            volume: Number(c.volume ?? 0),
          }));
          baseRef.current = mapped;
          setPoints(mapped);
          setLivePrice(mapped[mapped.length - 1].close);
          setState("live");
        })
        .catch(() => {
          if (cancelled) return;
          // Graceful synthetic fallback — chart still looks alive
          const synth = makeWalk(anchor, limit, Math.random() * 6);
          baseRef.current = synth;
          setPoints(synth);
          setLivePrice(synth[synth.length - 1].close);
          setState("synthetic");
        });
    };

    fetchOnce();
    const id = setInterval(fetchOnce, pollMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [symbol, timeframe, limit, syntheticAnchor, pollMs]);

  // ── Drift overlay — pulses the last price + the tail of the sparkline ──
  // NOTE: do NOT early-return before setInterval — when baseRef is empty on
  // first mount the effect would never re-run, leaving the sparkline frozen.
  // Instead, no-op inside the tick until data arrives.
  useEffect(() => {
    const id = setInterval(() => {
      const base = baseRef.current;
      if (!base.length) return;
      const anchor = base[base.length - 1].close;
      phaseRef.current += 0.22 + Math.random() * 0.08;
      const wave = Math.sin(phaseRef.current) * anchor * 0.00045;
      const rand = (Math.random() - 0.5) * anchor * 0.00028;
      driftRef.current = Math.max(
        -anchor * 0.0055,
        Math.min(anchor * 0.0055, driftRef.current + wave + rand),
      );

      const tailLen = Math.min(12, base.length);
      const next: LivePoint[] = base.map((p, idx) => {
        if (idx < base.length - tailLen) return p;
        const r = (idx - (base.length - tailLen)) / tailLen;
        return { ...p, close: p.close + driftRef.current * (0.3 + 0.7 * r) };
      });
      setPoints(next);
      setLivePrice(anchor + driftRef.current);
    }, driftMs);
    return () => clearInterval(id);
  }, [driftMs]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    if (!points.length) return { first: 0, last: 0, pct: 0, up: true };
    const first = points[0].close;
    const last  = points[points.length - 1].close;
    const pct   = first ? ((last - first) / first) * 100 : 0;
    return { first, last, pct, up: pct >= 0 };
  }, [points]);

  return { points, state, livePrice, summary };
}
