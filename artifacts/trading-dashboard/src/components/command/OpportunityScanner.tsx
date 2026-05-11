import { Radar } from "lucide-react";
import type { SymBreakdown } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { breakdowns: SymBreakdown[] }

export function OpportunityScanner({ breakdowns }: Props) {
  const opps = breakdowns
    .filter((b) => b.agreedAction !== "HOLD" && b.mtfConfirmed)
    .sort((a, b) => b.avgConfidence - a.avgConfidence);

  const watching = breakdowns
    .filter((b) => b.agreedAction === "HOLD" || !b.mtfConfirmed)
    .sort((a, b) => b.avgConfidence - a.avgConfidence)
    .slice(0, 3);

  return (
    <div className="bg-card border border-border/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Radar className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">AI Opportunity Scanner</h3>
        {opps.length > 0 && (
          <span className="ml-auto px-2 py-0.5 rounded text-[9px] font-bold border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
            {opps.length} SIGNAL{opps.length !== 1 ? "S" : ""}
          </span>
        )}
      </div>

      {opps.length === 0 && watching.length === 0 ? (
        <div className="text-center text-muted-foreground/30 text-xs py-4">
          Waiting for first AI tick…
        </div>
      ) : (
        <div className="space-y-2">
          {opps.map((b) => {
            const color = SYMBOL_COLOR[b.symbol] ?? "#888";
            const lbl   = b.symbol.replace("USD", "");
            return (
              <div key={b.symbol} className="flex items-center gap-3 p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: color + "25", color }}
                >
                  {lbl}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold">{lbl}</span>
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${
                      b.agreedAction === "BUY"
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-red-500/15 text-red-400 border-red-500/30"
                    }`}>{b.agreedAction}</span>
                    <span className="text-[9px] text-muted-foreground/40 ml-auto font-mono">
                      {b.avgConfidence.toFixed(0)}% conf
                    </span>
                  </div>
                  <div className="h-1 bg-muted/20 rounded overflow-hidden mt-1.5">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${Math.min(100, b.avgConfidence)}%`,
                        backgroundColor: b.agreedAction === "BUY" ? "#22c55e" : "#ef4444",
                        opacity: 0.7,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {watching.length > 0 && (
            <>
              <div className="text-[9px] text-muted-foreground/30 uppercase tracking-wide pt-1">Watching</div>
              {watching.map((b) => {
                const color = SYMBOL_COLOR[b.symbol] ?? "#888";
                const lbl   = b.symbol.replace("USD", "");
                return (
                  <div key={b.symbol} className="flex items-center gap-3 p-2 rounded-lg bg-muted/5 border border-border/20">
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0"
                      style={{ backgroundColor: color + "20", color }}
                    >
                      {lbl}
                    </div>
                    <span className="text-[10px] text-muted-foreground/50">{lbl}</span>
                    <span className="ml-auto text-[9px] text-muted-foreground/30 font-mono">HOLD</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
