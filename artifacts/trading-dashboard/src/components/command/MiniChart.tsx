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
      style={{ background: "#050505", borderColor: "#1a1a1a" }}>
      <div className="font-mono font-bold text-[12px]" style={{ color: "#00f0ff" }}>
        ${fmtPrice(d.close)}
      </div>
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

  const baseData  = candles ? buildChartData(candles) : [];
  const baseClose = baseData[baseData.length - 1]?.close ?? null;

  // Live header price — updates every 320ms
  const [headerPrice, setHeaderPrice] = useState<number | null>(null);
  // Live chart last-point — updates every 900ms
  const [chartData,   setChartData]   = useState<ChartPt[]>([]);

  const driftRef  = useRef(0);
  const phaseRef  = useRef(Math.random() * Math.PI * 2);
  const upBiasRef = useRef(Math.random() > 0.5 ? 1 : -1); // directional micro-bias

  useEffect(() => {
    if (!baseClose || !baseData.length) return;
    driftRef.current = 0;
    setHeaderPrice(baseClose);
    setChartData(baseData);

    const step = () => {
      phaseRef.current += 0.22 + Math.random() * 0.12;
      // sine wave creates smooth oscillation; random walk prevents determinism
      const sinMove  = Math.sin(phaseRef.current) * baseClose * 0.00045;
      const randMove = (Math.random() - 0.48 + upBiasRef.current * 0.015) * baseClose * 0.00020;
      driftRef.current = Math.max(
        -baseClose * 0.0045,
        Math.min(baseClose * 0.0045, driftRef.current + sinMove + randMove),
      );
      // occasionally flip directional bias
      if (Math.random() < 0.04) upBiasRef.current *= -1;
    };

    const headerTick = setInterval(() => {
      step();
      setHeaderPrice(baseClose + driftRef.current);
    }, 320);

    const chartTick = setInterval(() => {
      setChartData((prev) => {
        if (!prev.length) return prev;
        const next = [...prev];
        next[next.length - 1] = {
          ...next[next.length - 1],
          close: baseClose + driftRef.current,
        };
        return next;
      });
    }, 900);

    return () => {
      clearInterval(headerTick);
      clearInterval(chartTick);
    };
  }, [baseClose, baseData.length]);

  const livePrice = headerPrice ?? baseClose;
  const first     = chartData[0];
  const lastPt    = chartData[chartData.length - 1];
  const pctChg    = first && lastPt ? ((lastPt.close - first.close) / first.close) * 100 : null;
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
  const pad    = (pMax - pMin) * 0.12;

  const dCfg =
    decision === "BUY"  ? { bg: "#00ff8a0c", text: "#00ff8a", border: "#00ff8a28" } :
    decision === "SELL" ? { bg: "#ff22550c", text: "#ff2255", border: "#ff225528" } :
    { bg: "#ffffff05", text: "#334455", border: "#ffffff08" };

  // Subtle flash on price change
  const [priceFlash, setPriceFlash] = useState(false);
  const prevPrice = useRef<number | null>(null);
  useEffect(() => {
    if (livePrice !== null && prevPrice.current !== null && livePrice !== prevPrice.current) {
      setPriceFlash(true);
      setTimeout(() => setPriceFlash(false), 250);
    }
    prevPrice.current = livePrice;
  }, [livePrice]);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "#080808", border: "1px solid #181818" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono text-[#4a6a80] tracking-wider">
            {symbol.replace("USD", "/USD")}
          </div>
          {livePrice !== null ? (
            <div
              className="text-[14px] font-mono font-bold leading-none mt-0.5 tabular-nums"
              style={{
                color: priceFlash ? (isUp ? "#00ff8a" : "#ff3355") : color,
                transition: "color 0.15s",
              }}
            >
              ${fmtPrice(livePrice)}
            </div>
          ) : (
            <div className="text-[10px] text-[#1a2a35] mt-0.5 font-mono">—</div>
          )}
        </div>

        <div className="flex flex-col items-end gap-0.5 shrink-0">
          {pctChg !== null && (
            <span
              className="text-[12px] font-bold font-mono tabular-nums"
              style={{ color: isUp ? "#00ff8a" : "#ff3355" }}
            >
              {isUp ? "+" : ""}{pctChg.toFixed(2)}%
            </span>
          )}
          {decision !== "—" && (
            <span
              className="text-[8px] font-bold px-1.5 py-0.5 rounded tracking-[0.08em]"
              style={{ background: dCfg.bg, color: dCfg.text, border: `1px solid ${dCfg.border}` }}
            >
              {decision}
            </span>
          )}
        </div>
      </div>

      {/* Chart — pure black interior */}
      {isLoading ? (
        <div className="flex items-center justify-center" style={{ height: 88, background: "#000000" }}>
          <div
            className="w-4 h-4 rounded-full border-2 animate-spin"
            style={{ borderColor: `${color}18`, borderTopColor: color + "80" }}
          />
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center text-[9px] font-mono"
          style={{ height: 88, background: "#000000", color: "#1a2a35" }}>
          NO DATA
        </div>
      ) : (
        <div style={{ background: "#000000" }}>
          <ResponsiveContainer width="100%" height={88}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 2, bottom: 0, left: 0 }}>
              <YAxis yAxisId="p" domain={[pMin - pad, pMax + pad]} hide />
              <YAxis yAxisId="v" domain={[0, maxVol * 5]} hide />
              <Tooltip content={<MiniTooltip />} />
              <Bar
                yAxisId="v" dataKey="volume"
                fill={color} fillOpacity={0.10}
                radius={[1, 1, 0, 0]} isAnimationActive={false}
              />
              <Line
                yAxisId="p" dataKey="ema21"
                stroke="#00d4ff" strokeWidth={0.8} dot={false} isAnimationActive={false}
                strokeDasharray="5 4" connectNulls strokeOpacity={0.35}
              />
              <Line
                yAxisId="p" dataKey="ema9"
                stroke="#ffaa00" strokeWidth={0.8} dot={false} isAnimationActive={false}
                strokeDasharray="3 3" connectNulls strokeOpacity={0.45}
              />
              <Line
                yAxisId="p" dataKey="close"
                stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false}
                style={{ filter: `drop-shadow(0 0 2px ${color}60)` }}
              />
              {lastPt?.close && (
                <ReferenceLine
                  yAxisId="p" y={lastPt.close}
                  stroke={color} strokeDasharray="2 6" strokeOpacity={0.2}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Footer */}
      <div className="px-3 pb-2.5 pt-1.5">
        {conf > 0 ? (
          <>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] text-[#2a4050] font-mono tracking-[0.08em]">
                {rsi !== undefined ? `RSI ${rsi.toFixed(0)}` : "AI CONF"}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[7px] font-mono"
                  style={{ color: volOk ? "#00ff8a45" : "#ff225538" }}>
                  {volOk ? "✓VOL" : "✗VOL"}
                </span>
                {condition && (
                  <span className="text-[7px] font-mono text-[#1e3040]">
                    {condition.slice(0, 4).toUpperCase()}
                  </span>
                )}
                <span className="text-[10px] font-bold font-mono" style={{ color }}>
                  {conf.toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="rounded-sm overflow-hidden" style={{ height: 3, background: "#111111" }}>
              <div
                className="h-full rounded-sm"
                style={{ width: `${Math.min(100, conf)}%`, background: color, opacity: 0.65 }}
              />
            </div>
          </>
        ) : (
          <div className="text-[8px] text-[#1a2a35] font-mono text-center tracking-[0.1em]">
            AWAITING SIGNAL
          </div>
        )}
      </div>
    </div>
  );
}
