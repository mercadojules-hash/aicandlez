import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Line, Bar, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { Candle, ChartPt, SymBreakdown } from "./types";
import { buildChartData, fmtPrice, Q_OPTS } from "./helpers";

function MiniTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ChartPt;
  if (!d) return null;
  return (
    <div className="terminal-card rounded px-2.5 py-2 text-[10px] shadow-2xl border-[#00f0ff25]">
      <div className="text-[#1e5070] mb-0.5 text-[9px]">{d.label}</div>
      <div className="font-mono font-bold text-[#00f0ff] text-[12px]">${fmtPrice(d.close)}</div>
    </div>
  );
}

interface Props {
  symbol:     string;
  label:      string;
  color:      string;
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
  const rsi       = breakdown?.fast.rsi;
  const volOk     = breakdown?.volumeConfirmed ?? false;
  const condition = breakdown?.marketCondition ?? "";

  const maxVol = chartData.length ? Math.max(...chartData.map((d) => d.volume)) || 1 : 1;
  const prices = chartData.flatMap((d) => [d.close, d.ema9, d.ema21].filter(Boolean) as number[]);
  const pMin   = prices.length ? Math.min(...prices) : 0;
  const pMax   = prices.length ? Math.max(...prices) : 1;
  const pad    = (pMax - pMin) * 0.08;

  const dCfg =
    decision === "BUY"  ? { bg: "#00ff8a12", text: "#00ff8a", border: "#00ff8a35" } :
    decision === "SELL" ? { bg: "#ff225512", text: "#ff2255", border: "#ff225535" } :
    { bg: "#ffffff06", text: "#2a5a70", border: "#ffffff10" };

  return (
    <div
      className="terminal-card rounded-lg overflow-hidden group transition-all duration-300"
      style={{
        background: "linear-gradient(145deg, #040F1C 0%, #020A14 100%)",
        border: "1px solid #0D2235",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-1.5">
        <div
          className="w-8 h-8 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{
            background: color + "18",
            color,
            boxShadow: `0 0 12px ${color}50, inset 0 0 8px ${color}10`,
          }}
        >
          {label.slice(0, 4)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-bold leading-none text-foreground/90 tracking-wide">
            {symbol.replace("USD", "/USD")}
          </div>
          {last ? (
            <div
              className="text-[12px] font-mono font-bold mt-0.5"
              style={{ color, textShadow: `0 0 10px ${color}80` }}
            >
              ${fmtPrice(last.close)}
            </div>
          ) : (
            <div className="text-[10px] text-[#1a3850] mt-0.5 font-mono">LOADING…</div>
          )}
        </div>

        <div className="flex flex-col items-end gap-0.5 shrink-0">
          {pctChg !== null && (
            <span
              className="text-[12px] font-bold font-mono"
              style={{
                color: isUp ? "#00ff8a" : "#ff2255",
                textShadow: isUp ? "0 0 10px #00ff8a80" : "0 0 10px #ff225580",
              }}
            >
              {isUp ? "+" : ""}{pctChg.toFixed(2)}%
            </span>
          )}
          {decision !== "—" && (
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded tracking-[0.1em]"
              style={{
                background: dCfg.bg,
                color: dCfg.text,
                border: `1px solid ${dCfg.border}`,
                textShadow: `0 0 8px ${dCfg.text}60`,
              }}
            >
              {decision}
            </span>
          )}
        </div>
      </div>

      {/* Chart area */}
      {isLoading ? (
        <div className="flex items-center justify-center" style={{ height: 120 }}>
          <div
            className="w-5 h-5 rounded-full border-2 animate-spin"
            style={{ borderColor: `${color}30`, borderTopColor: color }}
          />
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1" style={{ height: 120 }}>
          <div className="text-[10px] text-[#0E2235] font-mono">NO DATA</div>
          <div className="text-[8px] text-[#081820] font-mono">API UNAVAILABLE</div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <ComposedChart data={chartData} margin={{ top: 6, right: 2, bottom: 0, left: 0 }}>
            <YAxis yAxisId="p" domain={[pMin - pad, pMax + pad]} hide />
            <YAxis yAxisId="v" domain={[0, maxVol * 5]} hide />
            <Tooltip content={<MiniTooltip />} />
            <Bar
              yAxisId="v" dataKey="volume"
              fill={color} fillOpacity={0.15}
              radius={[1, 1, 0, 0]} isAnimationActive={false}
            />
            <Line
              yAxisId="p" dataKey="close"
              stroke={color} strokeWidth={2} dot={false} isAnimationActive={false}
              style={{ filter: `drop-shadow(0 0 5px ${color}) drop-shadow(0 0 10px ${color}60)` }}
            />
            <Line
              yAxisId="p" dataKey="ema9"
              stroke="#ffb800" strokeWidth={1.2} dot={false} isAnimationActive={false}
              strokeDasharray="4 3" connectNulls strokeOpacity={0.75}
              style={{ filter: "drop-shadow(0 0 3px #ffb80080)" }}
            />
            <Line
              yAxisId="p" dataKey="ema21"
              stroke="#00f0ff" strokeWidth={1} dot={false} isAnimationActive={false}
              strokeDasharray="6 4" connectNulls strokeOpacity={0.55}
              style={{ filter: "drop-shadow(0 0 3px #00f0ff60)" }}
            />
            {last?.close && (
              <ReferenceLine
                yAxisId="p" y={last.close}
                stroke={color} strokeDasharray="3 6" strokeOpacity={0.35}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Footer: confidence + RSI + volume */}
      <div className="px-3 pb-3 pt-1">
        {conf > 0 ? (
          <>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-[#1a3850] font-mono tracking-[0.1em]">AI CONF</span>
              <div className="flex items-center gap-2">
                {rsi !== undefined && (
                  <span
                    className="text-[9px] font-mono"
                    style={{
                      color: rsi > 70 ? "#ff2255" : rsi < 35 ? "#00f0ff" : "#1e4060",
                    }}
                  >
                    RSI {rsi.toFixed(0)}
                  </span>
                )}
                <span className="text-[10px] font-bold font-mono" style={{ color }}>
                  {conf.toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="conf-bar-track" style={{ height: 5 }}>
              <div
                className="conf-bar-fill"
                style={{
                  width: `${Math.min(100, conf)}%`,
                  background: `linear-gradient(90deg, ${color}90, ${color})`,
                  color,
                }}
              />
            </div>
            {breakdown && (
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className="text-[7px] font-mono"
                  style={{ color: volOk ? "#00ff8a70" : "#ff225560" }}
                >
                  {volOk ? "✓ VOL" : "✗ VOL"}
                </span>
                {condition && (
                  <span
                    className="text-[7px] font-mono ml-auto"
                    style={{
                      color: condition === "trending" ? "#ffb80060" :
                             condition === "volatile" ? "#ff225560" : "#1a3850",
                    }}
                  >
                    {condition.toUpperCase()}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-[8px] text-[#0E2235] font-mono text-center tracking-[0.15em]">
            AWAITING AI SIGNAL
          </div>
        )}
      </div>
    </div>
  );
}
