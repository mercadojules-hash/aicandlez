import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { SymBreakdown } from "./types";
import { ago } from "./helpers";

interface Props { breakdowns: SymBreakdown[]; lastTickAt: number | null }

export function MarketRegimeCard({ breakdowns, lastTickAt }: Props) {
  const buys  = breakdowns.filter((b) => b.agreedAction === "BUY").length;
  const sells = breakdowns.filter((b) => b.agreedAction === "SELL").length;
  const total = breakdowns.length || 1;
  const bullPct = (buys  / total) * 100;
  const bearPct = (sells / total) * 100;

  const regime =
    bullPct >= 60 ? "BULL"           :
    bearPct >= 60 ? "BEAR"           :
    buys > sells  ? "MIXED BULLISH"  :
    sells > buys  ? "MIXED BEARISH"  : "NEUTRAL";

  const regimeColor =
    regime.includes("BULL") ? "#00ff88" :
    regime.includes("BEAR") ? "#ff3366" :
    "#ffb800";

  const RegimeIcon =
    regime.includes("BULL") ? TrendingUp :
    regime.includes("BEAR") ? TrendingDown :
    Minus;

  const avgConf = breakdowns.length
    ? breakdowns.reduce((s, b) => s + b.avgConfidence, 0) / breakdowns.length
    : 0;

  const directionalBias = buys >= sells ? "BULLISH" : "BEARISH";
  const biasColor = buys >= sells ? "#00ff88" : "#ff3366";

  return (
    <div className="terminal-card rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#0E2235]">
        <RegimeIcon className="w-3.5 h-3.5" style={{ color: regimeColor }} />
        <span className="text-[9px] font-bold tracking-[0.18em] text-[#00eeff]">
          AI MARKET REGIME
        </span>
        <span className="ml-auto text-[8px] text-[#1e4060] font-mono">{ago(lastTickAt)}</span>
      </div>

      <div className="p-3">
        {/* Regime title */}
        <div
          className="text-xl font-bold font-mono mb-1 tracking-wide"
          style={{ color: regimeColor, textShadow: `0 0 16px ${regimeColor}60` }}
        >
          {regime}
        </div>
        <div className="text-[8px] text-[#1a4060] font-mono uppercase tracking-widest mb-3">
          Global market state assessment
        </div>

        {/* Bars */}
        <div className="space-y-1.5 mb-3">
          {[
            { label: "Bullish",  count: buys,               color: "#00ff88" },
            { label: "Bearish",  count: sells,              color: "#ff3366" },
            { label: "Neutral",  count: total - buys - sells, color: "#2e5c75" },
          ].map(({ label, count, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-14 text-[8px] text-[#1e4060] font-mono">{label}</span>
              <div className="flex-1 h-1.5 bg-[#050e1a] rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${(count / total) * 100}%`,
                    background: color,
                    boxShadow: `0 0 6px ${color}60`,
                    opacity: 0.75,
                  }}
                />
              </div>
              <span className="w-4 text-[8px] font-mono text-[#1e4060] text-right">{count}</span>
            </div>
          ))}
        </div>

        {/* Stats row */}
        <div className="neon-divider mb-2" />
        <div className="grid grid-cols-2 gap-2 text-[8px] font-mono">
          <div>
            <div className="text-[#0E2235] uppercase tracking-widest">DIRECTIONAL BIAS</div>
            <div className="font-bold mt-0.5" style={{ color: biasColor }}>{directionalBias}</div>
          </div>
          <div>
            <div className="text-[#0E2235] uppercase tracking-widest">AVG AI CONF</div>
            <div className="font-bold mt-0.5 text-[#00eeff]">{avgConf.toFixed(1)}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
