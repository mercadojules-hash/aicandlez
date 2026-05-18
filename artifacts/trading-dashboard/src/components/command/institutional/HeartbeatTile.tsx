/**
 * HeartbeatTile — single tile in the top-of-dashboard "market heartbeat" strip.
 *
 * Bloomberg/TradingView aesthetic: ticker + live price + % change + tight
 * sparkline. Black background, neon-green / red price flash, subtle glow.
 */

import { useEffect, useRef, useState } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import type { TickerSpec } from "./tickers";
import { useLiveCandles } from "./useLiveCandles";
import { N } from "./theme";

function fmt(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1)    return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

interface Props { spec: TickerSpec; }

export function HeartbeatTile({ spec }: Props) {
  const { points, livePrice, summary, state } = useLiveCandles({
    symbol: spec.symbol, limit: 60, timeframe: "15m",
  });

  // Price flash on tick
  const [flash, setFlash]  = useState<"up" | "down" | null>(null);
  const prevRef            = useRef<number | null>(null);
  useEffect(() => {
    if (livePrice == null) return;
    const prev = prevRef.current;
    prevRef.current = livePrice;
    if (prev == null || livePrice === prev) return;
    setFlash(livePrice > prev ? "up" : "down");
    const id = setTimeout(() => setFlash(null), 220);
    return () => clearTimeout(id);
  }, [livePrice]);

  const up        = summary.up;
  const dirColor  = up ? N.LONG : N.SHORT;
  const priceColor =
    flash === "up"   ? N.LONG :
    flash === "down" ? N.SHORT :
                       N.TEXT_0;

  const closes = points.map(p => p.close);
  const min    = closes.length ? Math.min(...closes) : 0;
  const max    = closes.length ? Math.max(...closes) : 1;
  const pad    = (max - min) * 0.12 || 1;

  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{
        background:   N.BG,
        border:       `1px solid ${N.BORDER}`,
        borderRadius: 6,
        minWidth:     180,
        height:       108,
      }}
    >
      {/* Top stripe — sector / kind */}
      <div
        className="flex items-center justify-between px-2.5 pt-1.5"
        style={{ fontFamily: N.FONT_MONO }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="text-[10px] font-bold tracking-[0.08em]"
            style={{ color: N.TEXT_0 }}
          >
            {spec.label}
          </span>
          <span
            className="text-[7.5px] font-semibold tracking-[0.15em]"
            style={{ color: N.TEXT_3 }}
          >
            {spec.kind === "crypto" ? "/USD" : (spec.sector ?? "EQUITY").toUpperCase()}
          </span>
        </div>
        <div
          className="flex items-center gap-1 text-[7.5px] font-bold tracking-[0.16em]"
          style={{
            color: state === "live"      ? N.BRAND :
                   state === "synthetic" ? N.WARN  :
                                           N.TEXT_3,
          }}
        >
          <span
            className="rounded-full"
            style={{
              width: 4, height: 4,
              background:
                state === "live"      ? N.BRAND :
                state === "synthetic" ? N.WARN  : N.TEXT_3,
              boxShadow: state === "live" ? `0 0 6px ${N.BRAND}` : "none",
              animation: state === "live" ? "neon-pulse 1.6s infinite" : "none",
            }}
          />
          {state === "live" ? "LIVE" : state === "synthetic" ? "SIM" : "…"}
        </div>
      </div>

      {/* Price + % change */}
      <div className="flex items-end justify-between px-2.5 mt-0.5" style={{ fontFamily: N.FONT_MONO }}>
        <span
          className="font-bold tabular-nums leading-none"
          style={{ color: priceColor, fontSize: 17, transition: "color 0.14s" }}
        >
          {livePrice != null ? `$${fmt(livePrice)}` : "—"}
        </span>
        <span
          className="font-bold tabular-nums leading-none"
          style={{ fontSize: 11, color: dirColor, textShadow: `0 0 6px ${dirColor}50` }}
        >
          {up ? "+" : ""}{summary.pct.toFixed(2)}%
        </span>
      </div>

      {/* Sparkline */}
      <div className="flex-1 pt-1" style={{ minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <YAxis hide domain={[min - pad, max + pad]} />
            <defs>
              <linearGradient id={`hb-${spec.symbol}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor={dirColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={dirColor} stopOpacity={1} />
              </linearGradient>
            </defs>
            <Line
              type="monotone"
              dataKey="close"
              stroke={`url(#hb-${spec.symbol})`}
              strokeWidth={1.4}
              dot={false}
              isAnimationActive={false}
              style={{ filter: `drop-shadow(0 0 3px ${dirColor}55)` }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
