import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { SymBreakdown } from "./types";
import { ago } from "./helpers";

interface Props { breakdowns: SymBreakdown[]; lastTickAt: number | null }

export function MarketRegimeCard({ breakdowns, lastTickAt }: Props) {
  const buys  = breakdowns.filter((b) => b.agreedAction === "BUY").length;
  const sells = breakdowns.filter((b) => b.agreedAction === "SELL").length;
  const total = breakdowns.length || 1;
  const bullPct = (buys / total) * 100;
  const bearPct = (sells / total) * 100;

  const regime =
    bullPct >= 60 ? "BULL"
    : bearPct >= 60 ? "BEAR"
    : buys > sells   ? "SLIGHTLY BULLISH"
    : sells > buys   ? "SLIGHTLY BEARISH"
    : "NEUTRAL";

  const regimeColor =
    regime === "BULL" || regime === "SLIGHTLY BULLISH" ? "text-emerald-400"
    : regime === "BEAR" || regime === "SLIGHTLY BEARISH" ? "text-red-400"
    : "text-muted-foreground";

  const RegimeIcon =
    regime.includes("BULL") ? TrendingUp
    : regime.includes("BEAR") ? TrendingDown
    : Minus;

  const avgConf = breakdowns.length
    ? breakdowns.reduce((s, b) => s + b.avgConfidence, 0) / breakdowns.length
    : 0;

  return (
    <div className="bg-card border border-border/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <RegimeIcon className={`w-4 h-4 ${regimeColor}`} />
        <h3 className="text-sm font-semibold">AI Market Regime</h3>
        <span className="ml-auto text-[10px] text-muted-foreground/40">{ago(lastTickAt)}</span>
      </div>

      <div className={`text-xl font-bold font-mono mb-3 ${regimeColor}`}>{regime}</div>

      <div className="space-y-2 mb-3">
        {[
          { label: "Bullish assets", count: buys,  color: "#22c55e" },
          { label: "Bearish assets", count: sells, color: "#ef4444" },
          { label: "Neutral assets", count: total - buys - sells, color: "#6b7280" },
        ].map(({ label, count, color }) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className="w-24 text-muted-foreground/60 text-[10px]">{label}</span>
            <div className="flex-1 h-2 bg-muted/15 rounded overflow-hidden">
              <div
                className="h-full rounded"
                style={{ width: `${(count / total) * 100}%`, backgroundColor: color + "80" }}
              />
            </div>
            <span className="w-4 text-[10px] font-mono text-muted-foreground/50 text-right">{count}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-border/20 pt-2.5 flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground/50">Avg AI confidence</span>
        <span className="font-mono font-bold">{avgConf.toFixed(1)}%</span>
      </div>
    </div>
  );
}
