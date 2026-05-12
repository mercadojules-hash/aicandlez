import { Brain } from "lucide-react";
import type { EngineStatus } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { engine: EngineStatus | undefined }

export function AIBriefCard({ engine }: Props) {
  const breakdowns = engine ? Object.values(engine.symbolBreakdowns) : [];

  return (
    <div className="terminal-card rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#0E2235]">
        <Brain className="w-3.5 h-3.5 text-[#00eeff]" />
        <span className="text-[9px] font-bold tracking-[0.18em] text-[#00eeff]">AI MARKET BRIEF</span>
        {engine?.recentErrors && engine.recentErrors.length > 0 && (
          <span
            className="ml-auto text-[7px] font-bold px-1.5 py-0.5 rounded font-mono"
            style={{ background: "#ff225510", color: "#ff2255", border: "1px solid #ff225530" }}
          >
            {engine.recentErrors.length} ERR
          </span>
        )}
      </div>

      <div className="p-2">
        {breakdowns.length === 0 ? (
          <div className="text-center text-[9px] text-[#0E2235] py-4 font-mono animate-pulse">
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

              const emaSig  = bd.fast.emaSignal ?? (bd.fast.ema9 > bd.fast.ema21 ? "bullish" : "bearish");
              const emaUp   = emaSig === "bullish";

              return (
                <div
                  key={bd.symbol}
                  className="flex items-start gap-2 p-2 rounded border border-[#0A1E30] hover:border-[#00eeff15] transition-colors"
                >
                  <div
                    className="w-5 h-5 rounded text-[7px] font-bold flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: color + "18", color, boxShadow: `0 0 6px ${color}40` }}
                  >
                    {lbl.slice(0, 3)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[9px] font-bold" style={{ color }}>{lbl}</span>
                      <span
                        className="text-[7px] font-bold px-1 py-0.5 rounded"
                        style={
                          isBuy  ? { background: "#00ff8810", color: "#00ff88", border: "1px solid #00ff8825" } :
                          isSell ? { background: "#ff336610", color: "#ff3366", border: "1px solid #ff336625" } :
                          { background: "#ffffff06", color: "#1e4060", border: "1px solid #ffffff10" }
                        }
                      >
                        {bd.agreedAction}
                      </span>
                      {bd.volumeConfirmed ? (
                        <span className="text-[7px] font-mono" style={{ color: "#00ff8860" }}>✓VOL</span>
                      ) : (
                        <span className="text-[7px] font-mono" style={{ color: "#ff225550" }}>✗VOL</span>
                      )}
                      <span
                        className={`text-[7px] font-mono ml-auto ${
                          rsi > 70 ? "text-[#ff336670]" : rsi < 35 ? "text-[#00ff8870]" : "text-[#1e4060]"
                        }`}
                      >
                        RSI {rsi.toFixed(0)}
                      </span>
                    </div>
                    <div className="text-[7px] text-[#1a4060] leading-snug truncate font-mono">
                      {emaUp ? "EMA BULLISH" : "EMA BEARISH"} ({emaSig}) · MACD {bd.fast.macdState}
                    </div>
                    {bd.blockReason && bd.blockReason !== "None" && (
                      <div className="text-[7px] text-[#ffb80060] mt-0.5 truncate">⚠ {bd.blockReason}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className="text-[7px] font-mono"
                      style={{
                        color: bd.marketCondition === "trending" ? "#ffb80070" :
                               bd.marketCondition === "volatile" ? "#ff225570" : "#1a3850",
                      }}
                    >
                      {bd.marketCondition?.toUpperCase() ?? ""}
                    </span>
                    <span className="text-[8px] font-bold font-mono" style={{ color }}>
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
