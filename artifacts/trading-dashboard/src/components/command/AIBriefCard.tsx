import { Brain } from "lucide-react";
import type { EngineStatus } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { engine: EngineStatus | undefined }

export function AIBriefCard({ engine }: Props) {
  const breakdowns = engine ? Object.values(engine.symbolBreakdowns) : [];

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "#000000", border: "1px solid #1c1c1c" }}>
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderBottomColor: "#141414", background: "#000000" }}
      >
        <Brain className="w-3.5 h-3.5" style={{ color: "#00eeff" }} />
        <span className="text-[10px] font-bold tracking-[0.22em] font-mono" style={{ color: "#00eeff" }}>
          AI MARKET BRIEF
        </span>
        {engine?.recentErrors && engine.recentErrors.length > 0 && (
          <span
            className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded font-mono"
            style={{ background: "#ff22550d", color: "#ff2255", border: "1px solid #ff225520" }}
          >
            {engine.recentErrors.length} ERR
          </span>
        )}
      </div>

      <div className="p-3">
        {breakdowns.length === 0 ? (
          <div className="text-center text-[11px] font-mono py-6 animate-pulse" style={{ color: "#0e1e2a" }}>
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
              const emaUp  = (bd.fast.emaSignal ?? (bd.fast.ema9 > bd.fast.ema21 ? "bullish" : "bearish")) === "bullish";

              return (
                <div
                  key={bd.symbol}
                  className="flex items-start gap-2.5 p-2.5 rounded"
                  style={{ background: "#050505", border: "1px solid #181818" }}
                >
                  <div
                    className="w-7 h-7 rounded text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: color + "10", color, border: `1px solid ${color}1e` }}
                  >
                    {lbl.slice(0, 3)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[12px] font-bold font-mono" style={{ color }}>{lbl}</span>
                      <span
                        className="text-[8px] font-bold px-1.5 py-0.5 rounded font-mono"
                        style={
                          isBuy  ? { background: "#00ff8a0d", color: "#00ff8a", border: "1px solid #00ff8a1e" } :
                          isSell ? { background: "#ff33550d", color: "#ff3355", border: "1px solid #ff33551e" } :
                          { background: "#ffffff04", color: "#1e3040", border: "1px solid #181818" }
                        }
                      >
                        {bd.agreedAction}
                      </span>
                      {bd.volumeConfirmed ? (
                        <span className="text-[7px] font-mono" style={{ color: "#00ff8a55" }}>✓VOL</span>
                      ) : (
                        <span className="text-[7px] font-mono" style={{ color: "#ff225540" }}>✗VOL</span>
                      )}
                      <span
                        className="text-[9px] font-mono ml-auto tabular-nums"
                        style={{ color: rsi > 70 ? "#ff336655" : rsi < 35 ? "#00ff8a55" : "#1e3040" }}
                      >
                        RSI {rsi.toFixed(0)}
                      </span>
                    </div>
                    <div className="text-[9px] leading-snug truncate font-mono" style={{ color: "#1a2a35" }}>
                      EMA {emaUp ? "↑ BULLISH" : "↓ BEARISH"} · MACD {bd.fast.macdState}
                    </div>
                    {bd.blockReason && bd.blockReason !== "None" && (
                      <div className="text-[8px] mt-0.5 truncate font-mono" style={{ color: "#ffb80055" }}>
                        ⚠ {bd.blockReason}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[7px] font-mono"
                      style={{
                        color: bd.marketCondition === "trending" ? "#ffb80060" :
                               bd.marketCondition === "volatile" ? "#ff225560" : "#1a2a35",
                      }}
                    >
                      {bd.marketCondition?.toUpperCase() ?? ""}
                    </span>
                    <span className="text-[13px] font-bold font-mono tabular-nums" style={{ color }}>
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
