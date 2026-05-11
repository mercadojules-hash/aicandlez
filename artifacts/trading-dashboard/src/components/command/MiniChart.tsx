import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Line, Bar, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { RefreshCw } from "lucide-react";
import type { Candle, ChartPt, SymBreakdown } from "./types";
import { buildChartData, fmtPrice, Q_OPTS } from "./helpers";

function MiniTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ChartPt;
  if (!d) return null;
  return (
    <div className="bg-card border border-border/50 rounded-lg p-2 text-[10px] shadow-xl">
      <div className="text-muted-foreground/60 mb-1">{label}</div>
      <div className="font-mono font-bold">${fmtPrice(d.close)}</div>
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

  return (
    <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ backgroundColor: color + "25", color }}
        >
          {label.slice(0, 3)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold leading-none">{symbol.replace("USD", "/USD")}</div>
          {last && (
            <div className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
              ${fmtPrice(last.close)}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {pctChg !== null && (
            <span className={`text-[10px] font-bold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
              {isUp ? "+" : ""}{pctChg.toFixed(2)}%
            </span>
          )}
          {decision !== "—" && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
              decision === "BUY"  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
              decision === "SELL" ? "bg-red-500/15 text-red-400 border-red-500/30" :
              "bg-muted/20 text-muted-foreground/60 border-border/30"
            }`}>{decision}</span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-28 text-muted-foreground/30">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center h-28 text-muted-foreground/20 text-[9px]">
          No data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={110}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <YAxis yAxisId="p" domain={[pMin - pad, pMax + pad]} hide />
            <YAxis yAxisId="v" domain={[0, maxVol * 4.5]} hide />
            <Tooltip content={<MiniTooltip />} />
            <Bar yAxisId="v" dataKey="volume" fill={color} fillOpacity={0.18} radius={[1,1,0,0]} isAnimationActive={false} />
            <Line yAxisId="p" dataKey="close" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line yAxisId="p" dataKey="ema9"  stroke="#fbbf24" strokeWidth={1} dot={false} isAnimationActive={false} strokeDasharray="3 2" connectNulls />
            <Line yAxisId="p" dataKey="ema21" stroke="#60a5fa" strokeWidth={1} dot={false} isAnimationActive={false} strokeDasharray="5 3" connectNulls />
            {last?.close && (
              <ReferenceLine yAxisId="p" y={last.close} stroke={color} strokeDasharray="2 4" strokeOpacity={0.4} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {conf > 0 && (
        <div className="px-3 pb-2.5 pt-1">
          <div className="flex items-center justify-between text-[9px] text-muted-foreground/40 mb-1">
            <span>AI conf</span>
            <span className="font-mono">{conf.toFixed(0)}%</span>
          </div>
          <div className="h-1 bg-muted/20 rounded overflow-hidden">
            <div className="h-full rounded transition-all" style={{ width: `${Math.min(100, conf)}%`, backgroundColor: color }} />
          </div>
        </div>
      )}
    </div>
  );
}
