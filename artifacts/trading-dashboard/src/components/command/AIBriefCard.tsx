import { Brain } from "lucide-react";
import type { EngineStatus } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { engine: EngineStatus | undefined }

export function AIBriefCard({ engine }: Props) {
  const breakdowns = engine ? Object.values(engine.symbolBreakdowns) : [];

  return (
    <div className="bg-card border border-border/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">AI Market Brief</h3>
      </div>

      {breakdowns.length === 0 ? (
        <div className="text-center text-muted-foreground/40 text-xs py-4">Waiting for first tick…</div>
      ) : (
        <div className="space-y-2.5">
          {breakdowns.map((bd) => {
            const color = SYMBOL_COLOR[bd.symbol] ?? "#888";
            const lbl   = bd.symbol.replace("USD", "");
            const rsi   = bd.fast.rsi;
            const emaOk = bd.fast.ema9 > bd.fast.ema21;
            return (
              <div key={bd.symbol} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/5 border border-border/20">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0"
                  style={{ backgroundColor: color + "25", color }}
                >
                  {lbl}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-bold">{lbl}</span>
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${
                      bd.agreedAction === "BUY"  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                      bd.agreedAction === "SELL" ? "bg-red-500/15 text-red-400 border-red-500/30" :
                      "bg-muted/20 text-muted-foreground/50 border-border/20"
                    }`}>{bd.agreedAction}</span>
                    <span className={`text-[9px] ml-auto ${rsi > 70 ? "text-red-400" : rsi < 35 ? "text-emerald-400" : "text-muted-foreground/50"}`}>
                      RSI {rsi.toFixed(0)}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 leading-snug truncate">
                    {emaOk ? "EMA bullish (9>21)" : "EMA bearish (9<21)"} · MACD {bd.fast.macdState}
                  </div>
                  {bd.blockReason && bd.blockReason !== "None" && (
                    <div className="text-[9px] text-amber-400/70 mt-0.5 truncate">⚠ {bd.blockReason}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
