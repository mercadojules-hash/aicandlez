/**
 * SignalRow — single row in the Top 20 Crypto / Top 20 Equity signals grid.
 *
 * Refined institutional 2-line layout:
 *   Row 1 │ [LONG/SHORT badge · TICKER · type] · sparkline · LAST · 24h%      │ AI CONFIDENCE
 *   Row 2 │ ENTRY · STOP · TARGET                            BUY / SELL / ⚡  │   (52px ring)
 *
 * LONG rows have a thick green left bar + tinted green background.
 * SHORT rows have a thick red left bar + tinted red background.
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
 * filter classification.
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

  // Direction (LONG/SHORT) — shared deterministic resolver
  const direction: "LONG" | "SHORT" = useMemo(
    () => resolveDirection(spec.symbol, breakdown),
    [spec.symbol, breakdown],
  );

  // Confidence (engine → fallback per-symbol stable value)
  const conf = useMemo(() => {
    if (breakdown?.avgConfidence) return Math.round(breakdown.avgConfidence);
    return 58 + (h % 38); // 58-95
  }, [breakdown, h]);

  const signalType: SignalType = TYPES[h % TYPES.length];

  // Entry / SL / TP derived from live price
  const last  = livePrice ?? summary.last ?? 0;
  const entry = last;
  const sl    = direction === "LONG" ? entry * 0.98  : entry * 1.02;
  const tp    = direction === "LONG" ? entry * 1.045 : entry * 0.955;

  // 24h-equivalent change (vs first sparkline point)
  const change24h = useMemo(() => {
    if (!points.length) return 0;
    const first = points[0].close;
    if (first === 0) return 0;
    return ((last - first) / first) * 100;
  }, [points, last]);

  const dirColor   = direction === "LONG" ? N.LONG : N.SHORT;
  const dirGlow    = direction === "LONG" ? N.LONG_GLOW : N.SHORT_GLOW;
  const change24hPos = change24h >= 0;
  const confColor  = conf >= 78 ? N.BRAND : conf >= 62 ? N.BRAND_DEEP : N.WARN;

  // Tinted left-edge background blends from direction color → black
  const rowBg = `linear-gradient(90deg, ${dirColor}0F 0%, ${N.SURFACE_1} 32%)`;
  const rowBgHover = `linear-gradient(90deg, ${dirColor}1A 0%, ${N.SURFACE_2} 38%)`;

  const closes = points.map(p => p.close);
  const min = closes.length ? Math.min(...closes) : 0;
  const max = closes.length ? Math.max(...closes) : 1;
  const pad = (max - min) * 0.18 || 1;

  // Conf ring geometry (52px ring)
  const RING = 52;
  const STROKE = 4.5;
  const radius = (RING - STROKE) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (conf / 100) * circ;

  return (
    <div
      className="grid items-center transition-colors"
      style={{
        gridTemplateColumns: "260px 1fr 84px",
        gap: 10,
        padding: "10px 12px 10px 14px",
        minHeight: 72,
        borderBottom: `1px solid ${N.BORDER}`,
        background: rowBg,
        fontFamily: N.FONT_MONO,
        boxShadow: `inset 5px 0 0 0 ${dirColor}, inset 5px 0 14px 0 ${dirColor}28`,
        position: "relative",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = rowBgHover)}
      onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
    >
      {/* ── LEFT: header (badge + ticker + type) over (entry/SL/TP) ── */}
      <div className="flex flex-col" style={{ gap: 6 }}>
        {/* line 1 — direction badge + ticker + state pip */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-extrabold tracking-[0.22em] px-2 py-0.5 rounded"
            style={{
              color: dirColor,
              background: `${dirColor}1c`,
              border: `1px solid ${dirColor}70`,
              boxShadow: `0 0 8px ${dirColor}40`,
              fontFamily: N.FONT_MONO,
            }}>
            {direction}
          </span>
          <span style={{
            width: 5, height: 5, borderRadius: 5,
            background: state === "live" ? N.BRAND : state === "synthetic" ? N.WARN : N.TEXT_3,
            boxShadow:  state === "live" ? `0 0 6px ${N.BRAND}` : "none",
            animation:  state === "live" ? "neon-pulse 1.4s infinite" : "none",
          }} />
          <span className="text-[14px] font-extrabold tracking-wide"
            style={{ color: N.TEXT_0 }}>
            {spec.label}
          </span>
          <span className="text-[8.5px] font-bold tracking-[0.18em] px-1.5 py-0.5 rounded"
            style={{
              color: N.TEXT_2,
              background: "#0a0f0c",
              border: `1px solid ${N.BORDER}`,
            }}>
            {signalType}
          </span>
        </div>
        {/* line 2 — entry / sl / tp */}
        <div className="flex items-center gap-3">
          <DataCell label="ENTRY" value={`$${fmt(entry)}`} color={N.TEXT_0} />
          <DataCell label="STOP"  value={`$${fmt(sl)}`}    color={N.SHORT} />
          <DataCell label="TARGET" value={`$${fmt(tp)}`}   color={N.LONG} />
        </div>
      </div>

      {/* ── CENTER: sparkline + last/change · BUY · SELL · ⚡ ── */}
      <div className="flex flex-col" style={{ gap: 6, minWidth: 0 }}>
        {/* line 1 — sparkline + last + 24h delta */}
        <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0, height: 34 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <YAxis hide domain={[min - pad, max + pad]} />
                <Line type="monotone" dataKey="close" stroke={dirColor} strokeWidth={1.6}
                  dot={false} isAnimationActive={false}
                  style={{ filter: `drop-shadow(0 0 3px ${dirColor}90)` }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col items-end" style={{ minWidth: 88 }}>
            <span className="text-[7.5px] font-bold tracking-[0.18em]"
              style={{ color: N.TEXT_3 }}>LAST</span>
            <span className="text-[12px] font-extrabold tabular-nums"
              style={{ color: N.TEXT_0, lineHeight: 1.05,
                       textShadow: state === "live" ? `0 0 5px ${dirGlow}` : "none" }}>
              ${fmt(last)}
            </span>
            <span className="text-[10px] font-bold tabular-nums"
              style={{
                color: change24hPos ? N.LONG : N.SHORT,
                textShadow: `0 0 4px ${change24hPos ? N.LONG_GLOW : N.SHORT_GLOW}`,
              }}>
              {change24hPos ? "+" : ""}{change24h.toFixed(2)}%
            </span>
          </div>
        </div>
        {/* line 2 — BUY · SELL · AI Auto-Trade aligned right */}
        <div className="flex items-center gap-1.5 justify-end">
          <ActionPill label="BUY"  color={N.LONG}  active={direction === "LONG"} />
          <ActionPill label="SELL" color={N.SHORT} active={direction === "SHORT"} />
          <AutoTradeBtn confident={conf >= 78} />
        </div>
      </div>

      {/* ── RIGHT: AI confidence ring in dedicated boxed cell ── */}
      <div style={{
        background: "#000",
        border: `1px solid ${confColor}40`,
        borderRadius: 4,
        padding: "6px 6px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        boxShadow: `inset 0 0 10px ${confColor}10, 0 0 8px ${confColor}10`,
      }}>
        <span className="text-[7.5px] font-bold tracking-[0.18em]"
          style={{ color: N.TEXT_3 }}>AI CONF</span>
        <div style={{ position: "relative", width: RING, height: RING }}>
          <svg width={RING} height={RING}>
            <circle cx={RING / 2} cy={RING / 2} r={radius}
              fill="none" stroke={N.BORDER} strokeWidth={STROKE} />
            <circle cx={RING / 2} cy={RING / 2} r={radius}
              fill="none" stroke={confColor} strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              style={{
                filter: `drop-shadow(0 0 4px ${confColor}90)`,
                transition: "stroke-dasharray 0.45s ease",
              }} />
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center text-[12px] font-extrabold tabular-nums"
            style={{
              color: confColor,
              fontFamily: N.FONT_MONO,
              textShadow: `0 0 6px ${confColor}80`,
            }}>
            {conf}
          </span>
        </div>
      </div>
    </div>
  );
}

function DataCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[7.5px] font-bold tracking-[0.18em]"
        style={{ color: N.TEXT_3 }}>{label}</span>
      <span className="text-[11px] font-extrabold tabular-nums"
        style={{ color, lineHeight: 1.05 }}>
        {value}
      </span>
    </div>
  );
}

function ActionPill({ label, color, active }: { label: string; color: string; active: boolean }) {
  return (
    <button
      className="text-[9px] font-extrabold tracking-[0.2em] px-2 py-1 rounded transition-all"
      style={{
        color,
        background: active ? `${color}1f` : "transparent",
        border:     `1px solid ${active ? color + "80" : color + "30"}`,
        boxShadow:  active ? `0 0 8px ${color}50` : "none",
        fontFamily: N.FONT_MONO,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${color}28`;
                           e.currentTarget.style.boxShadow  = `0 0 10px ${color}60`; }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? `${color}1f` : "transparent";
                           e.currentTarget.style.boxShadow  = active ? `0 0 8px ${color}50` : "none"; }}
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
        width: 28, height: 28,
        background: confident ? `${N.BRAND}1c` : "transparent",
        border:     `1px solid ${confident ? N.BRAND + "70" : N.BRAND + "28"}`,
        boxShadow:  confident ? `0 0 10px ${N.BRAND}50` : "none",
        color:      confident ? N.BRAND : N.TEXT_3,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${N.BRAND}28`;
                           e.currentTarget.style.boxShadow  = `0 0 12px ${N.BRAND}70`;
                           e.currentTarget.style.color      = N.BRAND; }}
      onMouseLeave={e => { e.currentTarget.style.background = confident ? `${N.BRAND}1c` : "transparent";
                           e.currentTarget.style.boxShadow  = confident ? `0 0 10px ${N.BRAND}50` : "none";
                           e.currentTarget.style.color      = confident ? N.BRAND : N.TEXT_3; }}
    >
      <Zap className="w-3.5 h-3.5" />
    </button>
  );
}
