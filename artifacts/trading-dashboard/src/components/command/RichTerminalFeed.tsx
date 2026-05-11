import { Terminal } from "lucide-react";
import type { EngineStatus } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { engine: EngineStatus | undefined }

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  FILLED:     { label: "FILLED",     color: "#00ff88" },
  EXECUTING:  { label: "EXECUTING",  color: "#ffb800" },
  MONITORING: { label: "MONITORING", color: "#00eeff" },
  BLOCKED:    { label: "BLOCKED",    color: "#ff3366" },
  SCANNING:   { label: "SCANNING",   color: "#a855f7" },
  VALIDATING: { label: "VALIDATING", color: "#00eeff" },
  CONFIRMING: { label: "CONFIRMING", color: "#ffb800" },
};

function getStage(sig: EngineStatus["recentSignalLog"][0]): string {
  if (sig.executedAs)  return "FILLED";
  if (sig.blockReason && sig.blockReason !== "None") return "BLOCKED";
  const conf = sig.confidence;
  if (conf >= 75) return "EXECUTING";
  if (conf >= 60) return "MONITORING";
  return "SCANNING";
}

function emaState(conf: number): string {
  return conf >= 65 ? "CONFIRMED" : conf >= 50 ? "DIVERGING" : "INVERTED";
}

function rsiState(conf: number): string {
  if (conf > 80) return "OVERBOUGHT";
  if (conf > 65) return "NORMAL";
  if (conf > 45) return "NEUTRAL";
  return "OVERSOLD";
}

export function RichTerminalFeed({ engine }: Props) {
  const log = [...(engine?.recentSignalLog ?? [])].reverse().slice(0, 10);

  return (
    <div className="terminal-card rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#0E2235]">
        <Terminal className="w-3.5 h-3.5 text-[#00eeff]" />
        <span className="text-[10px] font-bold tracking-widest text-[#00eeff]">LIVE TERMINAL FEED</span>
        <span className="ml-auto flex items-center gap-1.5 text-[9px] text-[#1e5070]">
          {engine?.running && <span className="live-dot" style={{ width: 5, height: 5 }} />}
          {engine?.running ? "STREAMING" : "IDLE"}
        </span>
      </div>

      {/* Feed */}
      <div className="p-3 space-y-2 font-mono min-h-[240px]">
        {log.length === 0 ? (
          <div className="text-[10px] text-[#1a3a50] pt-4 text-center">
            <span className="animate-pulse">$ AWAITING FIRST SIGNAL TICK_</span>
          </div>
        ) : (
          log.map((s, i) => {
            const color   = SYMBOL_COLOR[s.symbol] ?? "#4a8fa8";
            const sym     = s.symbol.replace("USD", "");
            const stage   = getStage(s);
            const stageCfg= STAGE_LABELS[stage] ?? STAGE_LABELS.SCANNING;
            const ts      = new Date(s.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
            const ema     = emaState(s.confidence);
            const rsi     = rsiState(s.confidence);
            const confPct = Math.min(100, s.confidence);

            return (
              <div
                key={s.id + i}
                className="rounded border border-[#0A1E30] p-2.5 hover:border-[#00eeff15] transition-colors"
                style={{
                  background: "linear-gradient(135deg, #010C1A 0%, #010914 100%)",
                  animation: `slide-in-left 0.3s ease ${i * 0.04}s both`,
                }}
              >
                {/* Top row: status + symbol + decision + conf */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="text-[8px] font-bold tracking-widest px-1.5 py-0.5 rounded-sm"
                    style={{
                      color: stageCfg.color,
                      background: stageCfg.color + "15",
                      border: `1px solid ${stageCfg.color}30`,
                    }}
                  >
                    {stage}
                  </span>

                  <span className="text-[9px] font-bold" style={{ color }}>
                    {sym}
                  </span>

                  <span className={`text-[9px] font-bold ${
                    s.decision === "BUY"  ? "text-emerald-400" :
                    s.decision === "SELL" ? "text-red-400" :
                    "text-[#2e5c75]"
                  }`}>{s.decision}</span>

                  <span className="text-[9px] font-mono text-[#1e5070] ml-auto">{ts}</span>
                </div>

                {/* Confidence bar */}
                <div className="conf-bar-track mb-1.5">
                  <div
                    className="conf-bar-fill"
                    style={{
                      width: `${confPct}%`,
                      background: s.decision === "BUY" ? "#00ff88" : s.decision === "SELL" ? "#ff3366" : "#4a8fa8",
                      color: s.decision === "BUY" ? "#00ff88" : s.decision === "SELL" ? "#ff3366" : "#4a8fa8",
                    }}
                  />
                </div>

                {/* Metrics row */}
                <div className="grid grid-cols-4 gap-x-2 text-[8px] font-mono">
                  <div>
                    <div className="text-[#1a4060] uppercase">EMA ALIGN</div>
                    <div className={`font-bold ${ema === "CONFIRMED" ? "text-[#00ff8880]" : ema === "DIVERGING" ? "text-[#ffb80080]" : "text-[#ff336680]"}`}>
                      {ema}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#1a4060] uppercase">RSI STATE</div>
                    <div className={`font-bold ${rsi === "OVERSOLD" ? "text-[#00ff8880]" : rsi === "OVERBOUGHT" ? "text-[#ff336680]" : "text-[#4a8fa880]"}`}>
                      {rsi}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#1a4060] uppercase">CONFIDENCE</div>
                    <div style={{ color: color + "cc" }} className="font-bold">{s.confidence.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-[#1a4060] uppercase">EXEC STATUS</div>
                    <div className={`font-bold ${
                      s.executedAs ? "text-[#00ff8880]" :
                      s.blockReason && s.blockReason !== "None" ? "text-[#ff336680]" :
                      "text-[#4a8fa880]"
                    }`}>
                      {s.executedAs ? `${s.executedAs} FILLED` :
                       s.blockReason && s.blockReason !== "None" ? "BLOCKED" : "PENDING"}
                    </div>
                  </div>
                </div>

                {/* Block reason */}
                {s.blockReason && s.blockReason !== "None" && (
                  <div className="mt-1 text-[8px] text-[#ff336650] truncate">
                    ⚠ {s.blockReason}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
