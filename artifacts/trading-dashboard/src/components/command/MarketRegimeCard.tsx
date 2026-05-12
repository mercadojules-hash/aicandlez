import { useEffect, useState } from "react";
import type { SymBreakdown } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { breakdowns: SymBreakdown[]; lastTickAt: number | null }

export function MarketRegimeCard({ breakdowns, lastTickAt }: Props) {
  const buys   = breakdowns.filter((b) => b.agreedAction === "BUY").length;
  const sells  = breakdowns.filter((b) => b.agreedAction === "SELL").length;
  const total  = breakdowns.length || 1;

  const bullPct = (buys  / total) * 100;
  const bearPct = (sells / total) * 100;

  const regime =
    bullPct >= 60 ? "HIGH CONVICTION"  :
    bearPct >= 60 ? "BEAR CONVICTION"  :
    buys > sells  ? "LOW CONVICTION"   :
    sells > buys  ? "LOW CONVICTION"   : "LOW CONVICTION";

  const regimeColor =
    bullPct >= 60 ? "#00ff88" :
    bearPct >= 60 ? "#ff3366" : "#ffb800";

  const avgConf = breakdowns.length
    ? breakdowns.reduce((s, b) => s + b.avgConfidence, 0) / breakdowns.length
    : 0;

  const directionalBias  = buys >= sells ? "BULLISH" : "BEARISH";
  const biasColor        = buys >= sells ? "#00ff88" : "#ff3366";

  const volConfirmed     = breakdowns.filter((b) => b.volumeConfirmed).length;

  const [animConf, setAnimConf] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setAnimConf((prev) => {
        const diff = avgConf - prev;
        return Math.abs(diff) < 0.1 ? avgConf : prev + diff * 0.1;
      });
    }, 100);
    return () => clearInterval(id);
  }, [avgConf]);

  const buyScore  = buys  * 100 + Math.round(buys  * avgConf * 10);
  const sellScore = sells * 100 + Math.round(sells * avgConf * 8);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "#030d18", border: "1px solid #0D2235" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{ borderBottomColor: "#0D2235", background: "#020a14" }}
      >
        <span className="text-[8px] font-bold tracking-[0.2em] text-[#00aaff]">
          AI MARKET REGIME
        </span>
        <span className="text-[7px] font-mono text-[#1a3850] tracking-[0.08em]">
          GLOBAL MARKET STATE ASSESSMENT
        </span>
        <span
          className="ml-auto text-[7px] font-bold px-1.5 py-0.5 rounded font-mono tracking-[0.08em]"
          style={{
            background: regimeColor + "12",
            color: regimeColor,
            border: `1px solid ${regimeColor}30`,
          }}
        >
          {regime}
        </span>
      </div>

      <div className="p-3">
        {/* AI Conviction meter */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-[8px] font-mono mb-1">
            <span className="text-[#1a3850] tracking-[0.1em]">AI CONVICTION</span>
            <span style={{ color: regimeColor }}>{animConf.toFixed(0)}%</span>
          </div>
          <div className="rounded-sm overflow-hidden" style={{ height: 5, background: "#0a1820" }}>
            <div
              className="h-full rounded-sm transition-all duration-300"
              style={{
                width: `${Math.min(100, animConf)}%`,
                background: `linear-gradient(90deg, ${regimeColor}60, ${regimeColor})`,
              }}
            />
          </div>
        </div>

        {/* Directional bias + buy/sell counts */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <div className="text-[7px] font-mono text-[#1a3850] tracking-[0.1em] mb-0.5">
              DIRECTIONAL BIAS
            </div>
            <div
              className="text-[14px] font-bold font-mono"
              style={{ color: biasColor }}
            >
              {directionalBias}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[7px] font-mono text-[#1a3850] tracking-[0.1em] mb-0.5">
              SIGNAL SCORES
            </div>
            <div className="flex items-baseline justify-end gap-1.5">
              <span className="text-[13px] font-bold font-mono" style={{ color: "#00ff88" }}>
                {buyScore}
              </span>
              <span className="text-[8px] font-mono text-[#1a3850]">/</span>
              <span className="text-[13px] font-bold font-mono" style={{ color: "#ff3366" }}>
                {sellScore}
              </span>
            </div>
            <div className="text-[7px] font-mono text-[#1a3850] mt-0.5">
              BUY &nbsp;/&nbsp; SELL
            </div>
          </div>
        </div>

        {/* Buy/sell bars */}
        <div className="space-y-1.5 mb-3">
          {[
            { label: "BUY",     count: buys,               color: "#00ff88" },
            { label: "SELL",    count: sells,              color: "#ff3366" },
          ].map(({ label, count, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-7 text-[8px] font-mono text-[#1e4060]">{label}</span>
              <div className="flex-1 rounded-sm overflow-hidden" style={{ height: 5, background: "#0a1820" }}>
                <div
                  className="h-full rounded-sm transition-all"
                  style={{
                    width: `${(count / total) * 100}%`,
                    background: color,
                    opacity: 0.6,
                    boxShadow: `0 0 4px ${color}50`,
                  }}
                />
              </div>
              <span className="w-3 text-[8px] font-mono text-[#1e4060] text-right">{count}</span>
            </div>
          ))}
        </div>

        {/* Per-symbol strip */}
        {breakdowns.length > 0 && (
          <div className="border-t pt-2 space-y-1" style={{ borderTopColor: "#0a1820" }}>
            {breakdowns.map((b) => {
              const color  = SYMBOL_COLOR[b.symbol] ?? "#4a8fa8";
              const lbl    = b.symbol.replace("USD", "");
              const trend  = b.trend1H && b.trend1H !== "unknown" ? b.trend1H : b.marketCondition;
              return (
                <div key={b.symbol} className="flex items-center gap-1.5">
                  <span className="text-[7px] font-mono w-6 text-right shrink-0" style={{ color }}>
                    {lbl.slice(0, 3)}
                  </span>
                  <div className="flex-1 rounded-sm overflow-hidden" style={{ height: 2.5, background: "#0a1820" }}>
                    <div
                      className="h-full rounded-sm"
                      style={{ width: `${Math.min(100, b.avgConfidence)}%`, background: color, opacity: 0.5 }}
                    />
                  </div>
                  <span
                    className="text-[7px] font-mono shrink-0"
                    style={{ color: b.volumeConfirmed ? "#00ff8840" : "#ff225535" }}
                  >
                    {b.volumeConfirmed ? "✓" : "✗"}
                  </span>
                  <span className="text-[7px] font-mono text-[#1a3850] shrink-0 w-12">
                    {trend?.toUpperCase().slice(0, 8) ?? ""}
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
