/**
 * SignalRow — single row in the Top 20 Crypto / Top 20 Equity signals grid.
 *
 * Layout: ticker · sparkline · signal-type · entry · SL · TP · live PnL · conf% · BUY/SELL · AI Auto Trade
 * Long-biased rows are green; short-biased rows are red.
 */

import { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { Zap } from "lucide-react";
import type { SymBreakdown } from "../types";
import type { TickerSpec, SignalType } from "./tickers";
import { useLiveCandles } from "./useLiveCandles";
import { N } from "./theme";

function fmt(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1)    return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

/* deterministic per-symbol values so the grid is stable across renders */
export function hashSymbol(sym: string): number {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 33 + sym.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Shared direction resolver — used both by SignalRow and by the filter logic
 * in SignalsRow so a row's displayed LONG/SHORT is always identical to the
 * filter classification (no flicker / no mismatched filtering).
 */
export function resolveDirection(
  symbol: string,
  breakdown?: SymBreakdown,
): "LONG" | "SHORT" {
  if (breakdown?.agreedAction === "BUY")  return "LONG";
  if (breakdown?.agreedAction === "SELL") return "SHORT";
  return (hashSymbol(symbol) % 100) > 55 ? "LONG" : "SHORT";
}

const TYPES: SignalType[] = ["SCALP", "SWING", "MOMENTUM", "BREAKOUT", "REVERSAL", "TREND"];

interface Props {
  spec:       TickerSpec;
  breakdown?: SymBreakdown;
}

export function SignalRow({ spec, breakdown }: Props) {
  const { points, livePrice, summary, state } = useLiveCandles({
    symbol: spec.symbol, limit: 40, timeframe: "15m",
  });

  const h = hashSymbol(spec.symbol);

  // ── Direction (LONG/SHORT) — shared deterministic resolver so the row's
  // displayed side always matches the LONG/SHORT filter in SignalsRow ────
  const direction: "LONG" | "SHORT" = useMemo(
    () => resolveDirection(spec.symbol, breakdown),
    [spec.symbol, breakdown],
  );

  // ── Confidence (engine → fallback per-symbol stable value with jitter) ───
  const conf = useMemo(() => {
    if (breakdown?.avgConfidence) return Math.round(breakdown.avgConfidence);
    return 58 + (h % 38); // 58-95
  }, [breakdown, h]);

  const signalType: SignalType = TYPES[h % TYPES.length];

  // ── Entry / SL / TP derived from live price ──────────────────────────────
  const last  = livePrice ?? summary.last ?? 0;
  const entry = last;
  const sl    = direction === "LONG" ? entry * 0.98 : entry * 1.02;
  const tp    = direction === "LONG" ? entry * 1.045 : entry * 0.955;

  // ── Live PnL (synthetic — what the position would be if filled at last close) ──
  const livePnL = useMemo(() => {
    if (!points.length) return 0;
    const fillRef = points[Math.max(0, points.length - 10)].close;
    return direction === "LONG"
      ? ((last - fillRef) / fillRef) * 100
      : ((fillRef - last) / fillRef) * 100;
  }, [points, last, direction]);

  const dirColor    = direction === "LONG" ? N.LONG : N.SHORT;
  const dirGlow     = direction === "LONG" ? N.LONG_GLOW : N.SHORT_GLOW;
  const livePnlPos  = livePnL >= 0;
  const confColor   = conf >= 78 ? N.BRAND : conf >= 62 ? N.BRAND_DEEP : N.WARN;

  // sparkline domain
  const closes = points.map(p => p.close);
  const min = closes.length ? Math.min(...closes) : 0;
  const max = closes.length ? Math.max(...closes) : 1;
  const pad = (max - min) * 0.18 || 1;

  return (
    <div
      className="grid items-center px-3 py-1.5 transition-colors"
      style={{
        gridTemplateColumns:
          "78px 110px 64px 1fr 1fr 1fr 1fr 60px 132px",
        gap: 6,
        borderBottom: `1px solid ${N.BORDER}`,
        background: N.SURFACE_1,
        fontFamily: N.FONT_MONO,
        // direction-tinted left edge
        boxShadow: `inset 3px 0 0 0 ${dirColor}`,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = N.SURFACE_2)}
      onMouseLeave={e => (e.currentTarget.style.background = N.SURFACE_1)}
    >
      {/* SYMBOL + sector */}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5">
          <span style={{ width: 4, height: 4, borderRadius: 2,
                         background: state === "live" ? N.BRAND : state === "synthetic" ? N.WARN : N.TEXT_3,
                         boxShadow: state === "live" ? `0 0 5px ${N.BRAND}` : "none",
                         animation:  state === "live" ? "neon-pulse 1.4s infinite" : "none" }} />
          <span className="text-[10.5px] font-bold tracking-wider truncate" style={{ color: N.TEXT_0 }}>
            {spec.label}
          </span>
        </div>
        <span className="text-[7.5px] tracking-[0.14em] font-semibold mt-0.5" style={{ color: N.TEXT_3 }}>
          {spec.kind === "crypto" ? "PERP·USD" : (spec.sector ?? "EQUITY").toUpperCase()}
        </span>
      </div>

      {/* SPARKLINE */}
      <div style={{ height: 30 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <YAxis hide domain={[min - pad, max + pad]} />
            <Line type="monotone" dataKey="close" stroke={dirColor} strokeWidth={1.3}
              dot={false} isAnimationActive={false}
              style={{ filter: `drop-shadow(0 0 2px ${dirColor}80)` }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* SIDE + signal type */}
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-[8.5px] font-bold tracking-[0.18em] px-1.5 py-0.5 rounded"
          style={{ color: dirColor, background: `${dirColor}14`, border: `1px solid ${dirColor}40` }}>
          {direction}
        </span>
        <span className="text-[7.5px] tracking-[0.14em] font-semibold"
          style={{ color: N.TEXT_2 }}>
          {signalType}
        </span>
      </div>

      {/* ENTRY */}
      <div className="text-right">
        <div className="text-[7.5px] tracking-[0.14em] font-semibold" style={{ color: N.TEXT_3 }}>ENT</div>
        <div className="text-[10px] font-bold tabular-nums" style={{ color: N.TEXT_0 }}>
          ${fmt(entry)}
        </div>
      </div>

      {/* STOP LOSS */}
      <div className="text-right">
        <div className="text-[7.5px] tracking-[0.14em] font-semibold" style={{ color: N.TEXT_3 }}>SL</div>
        <div className="text-[10px] font-bold tabular-nums" style={{ color: N.SHORT }}>
          ${fmt(sl)}
        </div>
      </div>

      {/* TAKE PROFIT */}
      <div className="text-right">
        <div className="text-[7.5px] tracking-[0.14em] font-semibold" style={{ color: N.TEXT_3 }}>TP</div>
        <div className="text-[10px] font-bold tabular-nums" style={{ color: N.LONG }}>
          ${fmt(tp)}
        </div>
      </div>

      {/* LIVE PnL (synthetic) */}
      <div className="text-right">
        <div className="text-[7.5px] tracking-[0.14em] font-semibold" style={{ color: N.TEXT_3 }}>LIVE</div>
        <div className="text-[10px] font-bold tabular-nums"
          style={{ color: livePnlPos ? N.LONG : N.SHORT, textShadow: `0 0 6px ${dirGlow}` }}>
          {livePnlPos ? "+" : ""}{livePnL.toFixed(2)}%
        </div>
      </div>

      {/* CONFIDENCE */}
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-[10.5px] font-bold tabular-nums"
          style={{ color: confColor, textShadow: `0 0 6px ${confColor}50` }}>
          {conf}%
        </span>
        <div style={{ height: 3, width: 48, background: "#0c1a12", borderRadius: 1, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${conf}%`, background: confColor, opacity: 0.85,
            transition: "width 0.4s ease",
          }} />
        </div>
      </div>

      {/* ACTIONS */}
      <div className="flex items-center justify-end gap-1">
        <ActionPill label="BUY"  color={N.LONG}  active={direction === "LONG"} />
        <ActionPill label="SELL" color={N.SHORT} active={direction === "SHORT"} />
        <AutoTradeBtn confident={conf >= 78} />
      </div>
    </div>
  );
}

function ActionPill({ label, color, active }: { label: string; color: string; active: boolean }) {
  return (
    <button
      className="text-[8.5px] font-bold tracking-[0.16em] px-1.5 py-0.5 rounded transition-all"
      style={{
        color,
        background: active ? `${color}1c` : "transparent",
        border:     `1px solid ${active ? color + "60" : color + "28"}`,
        boxShadow:  active ? `0 0 6px ${color}40` : "none",
        fontFamily: N.FONT_MONO,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${color}22`;
                           e.currentTarget.style.boxShadow  = `0 0 8px ${color}50`; }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? `${color}1c` : "transparent";
                           e.currentTarget.style.boxShadow  = active ? `0 0 6px ${color}40` : "none"; }}
    >
      {label}
    </button>
  );
}

function AutoTradeBtn({ confident }: { confident: boolean }) {
  return (
    <button
      title="AI Auto Trade"
      className="flex items-center justify-center rounded transition-all"
      style={{
        width: 22, height: 22,
        background: confident ? `${N.BRAND}1c` : "transparent",
        border:     `1px solid ${confident ? N.BRAND + "60" : N.BRAND + "20"}`,
        boxShadow:  confident ? `0 0 8px ${N.BRAND}40` : "none",
        color:      confident ? N.BRAND : N.TEXT_3,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${N.BRAND}28`;
                           e.currentTarget.style.boxShadow  = `0 0 10px ${N.BRAND}60`;
                           e.currentTarget.style.color      = N.BRAND; }}
      onMouseLeave={e => { e.currentTarget.style.background = confident ? `${N.BRAND}1c` : "transparent";
                           e.currentTarget.style.boxShadow  = confident ? `0 0 8px ${N.BRAND}40` : "none";
                           e.currentTarget.style.color      = confident ? N.BRAND : N.TEXT_3; }}
    >
      <Zap className="w-3 h-3" />
    </button>
  );
}
