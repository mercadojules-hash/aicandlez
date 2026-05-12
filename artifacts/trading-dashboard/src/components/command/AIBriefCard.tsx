import { Brain } from "lucide-react";
import type { EngineStatus } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { engine: EngineStatus | undefined }

export function AIBriefCard({ engine }: Props) {
  const breakdowns = engine ? Object.values(engine.symbolBreakdowns) : [];

  return (
    <div className="terminal-card rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderBottomColor: "#141414" }}>
        <Brain className="w-3.5 h-3.5" style={{ color: "#00eeff" }} />
        <span className="text-[10px] font-bold tracking-[0.18em] font-mono" style={{ color: "#00eeff" }}>
          AI MARKET BRIEF
        </span>
        {engine?.recentErrors && engine.recentErrors.length > 0 && (
          <span
            className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded font-mono"
            style={{ background: "#ff225510", color: "#ff2255", border: "1px solid #ff225528" }}
          >
            {engine.recentErrors.length} ERR
          </span>
        )}
      </div>

      <div className="p-2.5">
        {breakdowns.length === 0 ? (
          <div className="text-center text-[10px] font-mono py-4 animate-pulse" style={{ color: "#0E2235" }}>
            AWAITING FIRST TICK…
          </div>
        ) : (
          <div className="space-y-1.5">
            {breakdowns.map((bd) => {
              const color  = SYMBOL_COLOR[bd.symbol] ?? "#4a8fa8";
              const lbl    = bd.symbol.replace("USD", "");
              const rsi    = bd.fast.rsi;
              const isBuy  = bd.agreedAction === "BUY";
              const isSell = bd.agreedAction === "SELL";
              const emaSig = bd.fast.emaSignal ?? (bd.fast.ema9 > bd.fast.ema21 ? "bullish" : "bearish");
              const emaUp  = emaSig === "bullish";

              return (
                <div
                  key={bd.symbol}
                  className="flex items-start gap-2 p-2 rounded border"
                  style={{ background: "#030303", borderColor: "#141414" }}
                >
                  <div
                    className="w-6 h-6 rounded text-[8px] font-bold flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: color + "14", color, border: `1px solid ${color}20` }}
                  >
                    {lbl.slice(0, 3)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[11px] font-bold font-mono" style={{ color }}>{lbl}</span>
                      <span
                        className="text-[8px] font-bold px-1.5 py-0.5 rounded font-mono"
                        style={
                          isBuy  ? { background: "#00ff8810", color: "#00ff88", border: "1px solid #00ff8822" } :
                          isSell ? { background: "#ff336610", color: "#ff3366", border: "1px solid #ff336622" } :
                          { background: "#ffffff05", color: "#1e4060", border: "1px solid #ffffff08" }
                        }
                      >
                        {bd.agreedAction}
                      </span>
                      {bd.volumeConfirmed ? (
                        <span className="text-[7px] font-mono" style={{ color: "#00ff8855" }}>✓VOL</span>
                      ) : (
                        <span className="text-[7px] font-mono" style={{ color: "#ff225545" }}>✗VOL</span>
                      )}
                      <span
                        className="text-[8px] font-mono ml-auto tabular-nums"
                        style={{
                          color: rsi > 70 ? "#ff336665" : rsi < 35 ? "#00ff8865" : "#1e4060",
                        }}
                      >
                        RSI {rsi.toFixed(0)}
                      </span>
                    </div>
                    <div className="text-[8px] leading-snug truncate font-mono" style={{ color: "#1a3050" }}>
                      {emaUp ? "EMA BULLISH" : "EMA BEARISH"} · MACD {bd.fast.macdState}
                    </div>
                    {bd.blockReason && bd.blockReason !== "None" && (
                      <div className="text-[8px] mt-0.5 truncate font-mono" style={{ color: "#ffb80055" }}>
                        ⚠ {bd.blockReason}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className="text-[7px] font-mono"
                      style={{
                        color: bd.marketCondition === "trending" ? "#ffb80060" :
                               bd.marketCondition === "volatile" ? "#ff225560" : "#1a3850",
                      }}
                    >
                      {bd.marketCondition?.toUpperCase() ?? ""}
                    </span>
                    <span className="text-[11px] font-bold font-mono tabular-nums" style={{ color }}>
                      {bd.avgConfidence.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
