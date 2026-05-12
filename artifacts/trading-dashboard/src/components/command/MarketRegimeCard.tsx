import { useEffect, useState } from "react";
import type { SymBreakdown } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { breakdowns: SymBreakdown[]; lastTickAt: number | null }

export function MarketRegimeCard({ breakdowns }: Props) {
  const buys   = breakdowns.filter((b) => b.agreedAction === "BUY").length;
  const sells  = breakdowns.filter((b) => b.agreedAction === "SELL").length;
  const total  = breakdowns.length || 1;
  const holds  = total - buys - sells;

  const bullPct = (buys / total) * 100;
  const bearPct = (sells / total) * 100;

  const conviction =
    Math.max(bullPct, bearPct) >= 62 ? "HIGH CONVICTION" :
    Math.max(bullPct, bearPct) >= 40 ? "MODERATE"        : "LOW CONVICTION";

  const convColor =
    conviction === "HIGH CONVICTION" ? (bullPct >= bearPct ? "#00ff8a" : "#ff3355") :
    "#ffaa00";

  const avgConf = breakdowns.length
    ? breakdowns.reduce((s, b) => s + b.avgConfidence, 0) / breakdowns.length
    : 0;

  const bias      = buys >= sells ? "BULLISH" : "BEARISH";
  const biasColor = buys >= sells ? "#00ff8a" : "#ff3355";

  const [animConf, setAnimConf] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setAnimConf((p) => { const d = avgConf - p; return Math.abs(d) < 0.1 ? avgConf : p + d * 0.1; });
    }, 80);
    return () => clearInterval(id);
  }, [avgConf]);

  const buyScore  = buys  * 1000 + Math.round(buys  * avgConf * 12);
  const sellScore = sells * 1000 + Math.round(sells * avgConf * 9);

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "#000000", border: "1px solid #1c1c1c" }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderBottomColor: "#141414", background: "#000000" }}>
        <div className="flex-1">
          <div className="text-[10px] font-bold tracking-[0.22em] font-mono" style={{ color: "#00aaff" }}>
            AI MARKET REGIME
          </div>
          <div className="text-[8px] font-mono tracking-[0.12em] mt-0.5" style={{ color: "#1a2a35" }}>
            GLOBAL MARKET STATE ASSESSMENT
          </div>
        </div>
        <span
          className="text-[8px] font-bold px-2 py-0.5 rounded font-mono tracking-[0.1em]"
          style={{ background: `${convColor}0d`, color: convColor, border: `1px solid ${convColor}22` }}
        >
          {conviction}
        </span>
      </div>

      <div className="p-4">
        {/* AI Conviction bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-[9px] font-mono mb-2">
            <span className="tracking-[0.12em]" style={{ color: "#1a2a35" }}>AI CONVICTION</span>
            <span className="font-bold text-[13px] tabular-nums" style={{ color: convColor }}>
              {animConf.toFixed(0)}%
            </span>
          </div>
          <div className="rounded-sm overflow-hidden" style={{ height: 7, background: "#0a0a0a" }}>
            <div
              className="h-full rounded-sm"
              style={{
                width: `${Math.min(100, animConf)}%`,
                background: `linear-gradient(90deg, ${convColor}40, ${convColor}cc)`,
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>

        {/* Bias + signal scores */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-[8px] font-mono tracking-[0.12em] mb-1.5" style={{ color: "#1a2a35" }}>
              DIRECTIONAL BIAS
            </div>
            <div className="text-[26px] font-bold font-mono leading-none" style={{ color: biasColor }}>
              {bias}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[8px] font-mono tracking-[0.12em] mb-1.5" style={{ color: "#1a2a35" }}>
              SIGNAL SCORES
            </div>
            <div className="flex items-baseline justify-end gap-1.5">
              <span className="text-[18px] font-bold font-mono tabular-nums" style={{ color: "#00ff8a" }}>
                {buyScore}
              </span>
              <span className="text-[11px] font-mono" style={{ color: "#1a2a35" }}>/</span>
              <span className="text-[18px] font-bold font-mono tabular-nums" style={{ color: "#ff3355" }}>
                {sellScore}
              </span>
            </div>
            <div className="text-[8px] font-mono tracking-[0.1em]" style={{ color: "#1a2a35" }}>BUY / SELL</div>
          </div>
        </div>

        {/* Distribution bars */}
        <div className="space-y-2.5 mb-4">
          {[
            { label: "BUY",  count: buys,  color: "#00ff8a" },
            { label: "SELL", count: sells, color: "#ff3355" },
            { label: "HOLD", count: holds, color: "#2a4a60" },
          ].map(({ label, count, color }) => (
            <div key={label} className="flex items-center gap-2.5">
              <span className="w-7 text-[9px] font-mono font-bold" style={{ color: "#1a2a35" }}>{label}</span>
              <div className="flex-1 rounded-sm overflow-hidden" style={{ height: 5, background: "#0a0a0a" }}>
                <div
                  className="h-full rounded-sm"
                  style={{ width: `${(count / total) * 100}%`, background: color, opacity: 0.7 }}
                />
              </div>
              <span className="w-4 text-[11px] font-bold font-mono text-right" style={{ color }}>{count}</span>
            </div>
          ))}
        </div>

        {/* Per-symbol strip */}
        {breakdowns.length > 0 && (
          <div className="pt-3 space-y-2" style={{ borderTop: "1px solid #0a0a0a" }}>
            {breakdowns.map((b) => {
              const color = SYMBOL_COLOR[b.symbol] ?? "#4a8fa8";
              const lbl   = b.symbol.replace("USD", "");
              const cond  = (b.trend1H && b.trend1H !== "unknown") ? b.trend1H : (b.marketCondition ?? "");
              return (
                <div key={b.symbol} className="flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold w-7 text-right shrink-0" style={{ color }}>
                    {lbl.slice(0, 3)}
                  </span>
                  <div className="flex-1 rounded-sm overflow-hidden" style={{ height: 3, background: "#0a0a0a" }}>
                    <div
                      className="h-full rounded-sm"
                      style={{ width: `${Math.min(100, b.avgConfidence)}%`, background: color, opacity: 0.55 }}
                    />
                  </div>
                  <span className="text-[7px] font-mono w-3 text-center shrink-0"
                    style={{ color: b.volumeConfirmed ? "#00ff8a50" : "#ff335540" }}>
                    {b.volumeConfirmed ? "✓" : "✗"}
                  </span>
                  <span className="text-[8px] font-mono w-14 shrink-0" style={{ color: "#1a2a35" }}>
                    {cond.toUpperCase().slice(0, 8)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
