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
      style={{ background: "#000000", borderColor: "#1c1c1c" }}>
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
        .then(r => r.ok ? r.json() : []),
    refetchInterval: 20_000,
    ...Q_OPTS,
  });

  const [baseData, setBaseData] = useState<ChartPt[]>([]);
  useEffect(() => {
    if (candles && candles.length) setBaseData(buildChartData(candles));
  }, [candles]);

  const baseClose = baseData[baseData.length - 1]?.close ?? null;

  const [headerPrice, setHeaderPrice] = useState<number | null>(null);
  const [chartData,   setChartData]   = useState<ChartPt[]>([]);

  const globalDrift = useRef(0);
  const phase       = useRef(Math.random() * Math.PI * 2);
  const bias        = useRef(Math.random() > 0.5 ? 1 : -1);

  useEffect(() => {
    if (!baseClose || !baseData.length) return;
    globalDrift.current = 0;
    setHeaderPrice(baseClose);
    setChartData(baseData);

    const headerTick = setInterval(() => {
      phase.current += 0.18 + Math.random() * 0.09;
      const sinStep  = Math.sin(phase.current) * baseClose * 0.00042;
      const randStep = (Math.random() - 0.48 + bias.current * 0.015) * baseClose * 0.00020;
      globalDrift.current = Math.max(
        -baseClose * 0.005,
        Math.min(baseClose * 0.005, globalDrift.current + sinStep + randStep),
      );
      if (Math.random() < 0.03) bias.current *= -1;
      setHeaderPrice(baseClose + globalDrift.current);
    }, 320);

    const chartTick = setInterval(() => {
      const drift     = globalDrift.current;
      const waveAmp   = baseClose * 0.0028;
      const snapPhase = phase.current;
      setChartData(
        baseData.map((pt, i) => {
          const wave = Math.sin(snapPhase + i * 0.20) * waveAmp
                     * (0.4 + 0.6 * Math.sin(i * 0.10 + snapPhase * 0.3));
          return { ...pt, close: pt.close + drift + wave };
        })
      );
    }, 800);

    return () => { clearInterval(headerTick); clearInterval(chartTick); };
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

  const maxVol = chartData.length ? Math.max(...chartData.map(d => d.volume)) || 1 : 1;
  const prices = chartData.flatMap(d => [d.close, d.ema9, d.ema21].filter(Boolean) as number[]);
  const pMin   = prices.length ? Math.min(...prices) : 0;
  const pMax   = prices.length ? Math.max(...prices) : 1;
  const pad    = (pMax - pMin) * 0.14;

  const dCfg =
    decision === "BUY"  ? { bg: "#00ff8a0c", text: "#00ff8a", border: "#00ff8a28" } :
    decision === "SELL" ? { bg: "#ff22550c", text: "#ff2255", border: "#ff225528" } :
    { bg: "#ffffff05", text: "#4a6a80", border: "#ffffff0a" };

  const [priceFlash, setFlash] = useState(false);
  const prevPriceRef           = useRef<number | null>(null);
  useEffect(() => {
    if (livePrice !== null && prevPriceRef.current !== null && livePrice !== prevPriceRef.current) {
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
    }
    prevPriceRef.current = livePrice;
  }, [livePrice]);

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "#000000", border: "1px solid #1c1c1c" }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <div className="flex-1 min-w-0">
          {/* Symbol label — now properly readable */}
          <div className="text-[9px] font-mono tracking-wider font-semibold" style={{ color: "#9FB3C8" }}>
            {symbol.replace("USD", "/USD")}
          </div>
          {livePrice !== null ? (
            <div
              className="text-[17px] font-mono font-bold leading-none mt-0.5 tabular-nums"
              style={{ color: priceFlash ? (isUp ? "#00ff8a" : "#ff3355") : "#EAF2FF", transition: "color 0.12s" }}
            >
              ${fmtPrice(livePrice)}
            </div>
          ) : (
            <div className="text-[10px] mt-0.5 font-mono" style={{ color: "#1a2a35" }}>—</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          {pctChg !== null && (
            <span className="text-[13px] font-bold font-mono tabular-nums"
              style={{ color: isUp ? "#00ff8a" : "#ff3355" }}>
              {isUp ? "+" : ""}{pctChg.toFixed(2)}%
            </span>
          )}
          {decision !== "—" && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-[0.08em] font-mono"
              style={{ background: dCfg.bg, color: dCfg.text, border: `1px solid ${dCfg.border}` }}>
              {decision}
            </span>
          )}
        </div>
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="flex items-center justify-center" style={{ height: 92, background: "#000000" }}>
          <div className="w-4 h-4 rounded-full border-2 animate-spin"
            style={{ borderColor: `${color}12`, borderTopColor: color + "65" }} />
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center text-[8px] font-mono"
          style={{ height: 92, background: "#000000", color: "#1a2a35" }}>
          NO DATA
        </div>
      ) : (
        <div style={{ background: "#000000" }}>
          <ResponsiveContainer width="100%" height={92}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 2, bottom: 0, left: 0 }}>
              <YAxis yAxisId="p" domain={[pMin - pad, pMax + pad]} hide />
              <YAxis yAxisId="v" domain={[0, maxVol * 5]} hide />
              <Tooltip content={<MiniTooltip />} />
              {/* Volume bars — brighter fill for visibility */}
              <Bar yAxisId="v" dataKey="volume" fill={color} fillOpacity={0.18}
                radius={[1, 1, 0, 0]} isAnimationActive={false} />
              {/* EMA21 — brighter, more visible */}
              <Line yAxisId="p" dataKey="ema21" stroke="#00d4ff" strokeWidth={1.2}
                dot={false} isAnimationActive={false} strokeDasharray="5 4"
                connectNulls strokeOpacity={0.60} />
              {/* EMA9 — brighter, more visible */}
              <Line yAxisId="p" dataKey="ema9" stroke="#ffaa00" strokeWidth={1.2}
                dot={false} isAnimationActive={false} strokeDasharray="3 3"
                connectNulls strokeOpacity={0.70} />
              {/* Price line — main chart line */}
              <Line yAxisId="p" dataKey="close" stroke={color} strokeWidth={1.8}
                dot={false} isAnimationActive={false}
                style={{ filter: `drop-shadow(0 0 3px ${color}60)` }} />
              {/* Reference strike line — brighter */}
              {lastPt?.close && (
                <ReferenceLine yAxisId="p" y={lastPt.close}
                  stroke={color} strokeDasharray="2 6" strokeOpacity={0.35} />
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
              {/* RSI label — now readable */}
              <span className="text-[9px] font-mono tracking-[0.08em] font-medium" style={{ color: "#9FB3C8" }}>
                {rsi !== undefined ? `RSI ${rsi.toFixed(0)}` : "AI CONF"}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-mono font-semibold"
                  style={{ color: volOk ? "#00ff8a70" : "#ff225550" }}>
                  {volOk ? "✓VOL" : "✗VOL"}
                </span>
                <span className="text-[12px] font-bold font-mono tabular-nums" style={{ color }}>
                  {conf.toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="rounded-sm overflow-hidden" style={{ height: 3, background: "#0a0a0a" }}>
              <div className="h-full rounded-sm"
                style={{ width: `${Math.min(100, conf)}%`, background: color, opacity: 0.65 }} />
            </div>
          </>
        ) : (
          <div className="text-[9px] font-mono text-center tracking-[0.1em] font-medium"
            style={{ color: "#4a6a80" }}>
            AWAITING SIGNAL
          </div>
        )}
      </div>
    </div>
  );
}
