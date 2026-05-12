import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
    <div className="rounded px-2 py-1.5 text-[10px] border"
      style={{ background: "#010C18", borderColor: "#0D2235" }}>
      <div className="font-mono font-bold text-[11px]" style={{ color: "#00f0ff" }}>
        ${fmtPrice(d.close)}
      </div>
      <div className="text-[9px] text-[#1e4060] mt-0.5">{d.label}</div>
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
    refetchInterval: 20_000,
    ...Q_OPTS,
  });

  const baseData   = candles ? buildChartData(candles) : [];
  const basePrice  = baseData[baseData.length - 1]?.close ?? null;

  const [drift, setDrift] = useState(0);
  const driftRef          = useRef(0);
  const tickRef           = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!basePrice) return;
    driftRef.current = 0;
    setDrift(0);
    tickRef.current = setInterval(() => {
      const step = (Math.random() - 0.48) * basePrice * 0.00035;
      driftRef.current = Math.max(-basePrice * 0.003, Math.min(basePrice * 0.003, driftRef.current + step));
      setDrift(driftRef.current);
    }, 1800);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [basePrice]);

  const chartData = baseData.length
    ? baseData.map((pt, i) =>
        i === baseData.length - 1
          ? { ...pt, close: pt.close + drift }
          : pt
      )
    : [];

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
  const pad    = (pMax - pMin) * 0.1;

  const dCfg =
    decision === "BUY"  ? { bg: "#00ff8a10", text: "#00ff8a", border: "#00ff8a30" } :
    decision === "SELL" ? { bg: "#ff225510", text: "#ff2255", border: "#ff225530" } :
    { bg: "#ffffff05", text: "#2a5a70",  border: "#ffffff0a" };

  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!drift) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 400);
    return () => clearTimeout(t);
  }, [Math.round(drift * 100)]);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: "#030d18",
        border: "1px solid #0D2235",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-[#7a9cb0] tracking-wide">
            {symbol.replace("USD", "/USD")}
          </div>
          {last ? (
            <div
              className="text-[13px] font-mono font-bold leading-none mt-0.5 transition-colors duration-300"
              style={{
                color: pulse ? (isUp ? "#00ff8a" : "#ff2255") : color,
              }}
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
              className="text-[11px] font-bold font-mono"
              style={{ color: isUp ? "#00ff8a" : "#ff2255" }}
            >
              {isUp ? "+" : ""}{pctChg.toFixed(2)}%
            </span>
          )}
          {decision !== "—" && (
            <span
              className="text-[8px] font-bold px-1.5 py-0.5 rounded tracking-[0.08em]"
              style={{
                background: dCfg.bg,
                color: dCfg.text,
                border: `1px solid ${dCfg.border}`,
              }}
            >
              {decision}
            </span>
          )}
        </div>
      </div>

      {/* Chart area — black interior */}
      {isLoading ? (
        <div className="flex items-center justify-center" style={{ height: 90, background: "#000508" }}>
          <div
            className="w-4 h-4 rounded-full border-2 animate-spin"
            style={{ borderColor: `${color}20`, borderTopColor: color }}
          />
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center text-[9px] text-[#0E2235] font-mono"
          style={{ height: 90, background: "#000508" }}>
          NO DATA
        </div>
      ) : (
        <div style={{ background: "#000508" }}>
          <ResponsiveContainer width="100%" height={90}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 2, bottom: 0, left: 0 }}>
              <YAxis yAxisId="p" domain={[pMin - pad, pMax + pad]} hide />
              <YAxis yAxisId="v" domain={[0, maxVol * 5]} hide />
              <Tooltip content={<MiniTooltip />} />
              <Bar
                yAxisId="v" dataKey="volume"
                fill={color} fillOpacity={0.12}
                radius={[1, 1, 0, 0]} isAnimationActive={false}
              />
              <Line
                yAxisId="p" dataKey="ema21"
                stroke="#00f0ff" strokeWidth={1} dot={false} isAnimationActive={false}
                strokeDasharray="5 4" connectNulls strokeOpacity={0.4}
              />
              <Line
                yAxisId="p" dataKey="ema9"
                stroke="#ffb800" strokeWidth={1} dot={false} isAnimationActive={false}
                strokeDasharray="3 3" connectNulls strokeOpacity={0.55}
              />
              <Line
                yAxisId="p" dataKey="close"
                stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false}
                style={{ filter: `drop-shadow(0 0 3px ${color}80)` }}
              />
              {last?.close && (
                <ReferenceLine
                  yAxisId="p" y={last.close}
                  stroke={color} strokeDasharray="2 5" strokeOpacity={0.25}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Footer: AI conf */}
      <div className="px-3 pb-2.5 pt-1.5">
        {conf > 0 ? (
          <>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] text-[#1a3850] font-mono tracking-[0.1em]">
                {rsi !== undefined ? `RSI ${rsi.toFixed(0)}` : "AI CONF"}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="text-[7px] font-mono"
                  style={{ color: volOk ? "#00ff8a50" : "#ff225540" }}
                >
                  {volOk ? "✓VOL" : "✗VOL"}
                </span>
                {condition && (
                  <span className="text-[7px] font-mono text-[#1a3850]">
                    {condition.slice(0, 4).toUpperCase()}
                  </span>
                )}
                <span className="text-[9px] font-bold font-mono" style={{ color }}>
                  {conf.toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="rounded-sm overflow-hidden" style={{ height: 3, background: "#0a1820" }}>
              <div
                className="h-full rounded-sm transition-all duration-500"
                style={{ width: `${Math.min(100, conf)}%`, background: color, opacity: 0.7 }}
              />
            </div>
          </>
        ) : (
          <div className="text-[8px] text-[#0E2235] font-mono text-center tracking-[0.12em]">
            AWAITING SIGNAL
          </div>
        )}
      </div>
    </div>
  );
}
