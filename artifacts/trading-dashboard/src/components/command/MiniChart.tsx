import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Line, Bar, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { Candle, ChartPt, SymBreakdown } from "./types";
import { buildChartData, fmtPrice, Q_OPTS } from "./helpers";

function MiniTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ChartPt;
  if (!d) return null;
  return (
    <div className="terminal-card rounded px-2 py-1.5 text-[9px] shadow-xl border-[#00eeff20]">
      <div className="text-[#1e5070] mb-0.5">{label}</div>
      <div className="font-mono font-bold text-[#00eeff]">${fmtPrice(d.close)}</div>
    </div>
  );
}

interface Props {
  symbol: string;
  label:  string;
  color:  string;
  breakdown?: SymBreakdown;
}

export function MiniChart({ symbol, label, color, breakdown }: Props) {
  const { data: candles, isLoading } = useQuery<Candle[]>({
    queryKey:        ["candles-cmd", symbol, "15m", 60],
    queryFn:         () =>
      fetch(`/api/candles?symbol=${symbol}&timeframe=15m&limit=60`, { cache: "no-store" })
        .then((r) => r.ok ? r.json() : []),
    refetchInterval: 60_000,
    ...Q_OPTS,
  });

  const chartData = candles ? buildChartData(candles) : [];
  const last      = chartData[chartData.length - 1];
  const first     = chartData[0];
  const pctChg    = first && last ? ((last.close - first.close) / first.close) * 100 : null;
  const isUp      = (pctChg ?? 0) >= 0;
  const decision  = breakdown?.agreedAction ?? "—";
  const conf      = breakdown?.avgConfidence ?? 0;

  const maxVol = chartData.length ? Math.max(...chartData.map((d) => d.volume)) || 1 : 1;
  const prices = chartData.flatMap((d) => [d.close, d.ema9, d.ema21].filter(Boolean) as number[]);
  const pMin   = prices.length ? Math.min(...prices) : 0;
  const pMax   = prices.length ? Math.max(...prices) : 1;
  const pad    = (pMax - pMin) * 0.06;

  const decisionBg =
    decision === "BUY"  ? { bg: "#00ff8812", text: "#00ff88", border: "#00ff8830" } :
    decision === "SELL" ? { bg: "#ff336612", text: "#ff3366", border: "#ff336630" } :
    { bg: "#ffffff06", text: "#2e5c75", border: "#ffffff10" };

  return (
    <div className="terminal-card rounded-lg overflow-hidden hover:border-[#00eeff20] transition-colors group">
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-1">
        <div
          className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
          style={{ backgroundColor: color + "18", color, boxShadow: `0 0 8px ${color}40` }}
        >
          {label.slice(0, 4)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold leading-none text-foreground/90">
            {symbol.replace("USD", "/USD")}
          </div>
          {last && (
            <div className="text-[9px] font-mono mt-0.5" style={{ color }}>
              ${fmtPrice(last.close)}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {pctChg !== null && (
            <span
              className="text-[9px] font-bold font-mono"
              style={{
                color: isUp ? "#00ff88" : "#ff3366",
                textShadow: isUp ? "0 0 8px #00ff8860" : "0 0 8px #ff336660",
              }}
            >
              {isUp ? "+" : ""}{pctChg.toFixed(2)}%
            </span>
          )}
          {decision !== "—" && (
            <span
              className="text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wide"
              style={{ background: decisionBg.bg, color: decisionBg.text, border: `1px solid ${decisionBg.border}` }}
            >
              {decision}
            </span>
          )}
        </div>
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="flex items-center justify-center h-24 text-[#0E2235]">
          <div className="w-3 h-3 rounded-full border border-[#00eeff30] animate-spin border-t-[#00eeff]" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center h-24 text-[8px] text-[#0E2235] font-mono">
          NO DATA
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={90}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 2, bottom: 0, left: 0 }}>
            <YAxis yAxisId="p" domain={[pMin - pad, pMax + pad]} hide />
            <YAxis yAxisId="v" domain={[0, maxVol * 4.5]} hide />
            <Tooltip content={<MiniTooltip />} />
            <Bar
              yAxisId="v" dataKey="volume"
              fill={color} fillOpacity={0.12}
              radius={[1, 1, 0, 0]} isAnimationActive={false}
            />
            <Line
              yAxisId="p" dataKey="close"
              stroke={color} strokeWidth={1.5}
              dot={false} isAnimationActive={false}
              style={{ filter: `drop-shadow(0 0 3px ${color}80)` }}
            />
            <Line
              yAxisId="p" dataKey="ema9"
              stroke="#ffb800" strokeWidth={0.8}
              dot={false} isAnimationActive={false}
              strokeDasharray="3 2" connectNulls
              strokeOpacity={0.7}
            />
            <Line
              yAxisId="p" dataKey="ema21"
              stroke="#00eeff" strokeWidth={0.8}
              dot={false} isAnimationActive={false}
              strokeDasharray="5 3" connectNulls
              strokeOpacity={0.5}
            />
            {last?.close && (
              <ReferenceLine
                yAxisId="p" y={last.close}
                stroke={color} strokeDasharray="2 4"
                strokeOpacity={0.3}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Confidence bar */}
      {conf > 0 && (
        <div className="px-2.5 pb-2 pt-1">
          <div className="flex items-center justify-between text-[8px] text-[#1a4060] mb-1 font-mono">
            <span>AI CONF</span>
            <span style={{ color }}>{conf.toFixed(0)}%</span>
          </div>
          <div className="conf-bar-track">
            <div
              className="conf-bar-fill"
              style={{
                width: `${Math.min(100, conf)}%`,
                background: color,
                color,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
