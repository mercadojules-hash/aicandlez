import { useEffect, useRef, useState } from "react";
import type { EngineStatus, SignalLogEntry } from "./types";
import { SYMBOL_COLOR } from "./types";
import { ago } from "./helpers";

interface Props { engine: EngineStatus | undefined }

const STAGE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  FILLED:     { label: "FILLED",     color: "#00ff8a", bg: "#00ff8a10" },
  EXECUTING:  { label: "EXECUTING",  color: "#ffb800", bg: "#ffb80010" },
  ROUTING:    { label: "ROUTING",    color: "#00ccff", bg: "#00ccff0c" },
  MONITORING: { label: "MONITORING", color: "#0099ff", bg: "#0099ff0c" },
  BLOCKED:    { label: "BLOCKED",    color: "#ff2255", bg: "#ff225510" },
  SCANNING:   { label: "SCANNING",   color: "#cc55ff", bg: "#cc55ff0c" },
  VALIDATING: { label: "VALIDATING", color: "#ffaa00", bg: "#ffaa000c" },
};

const SUB_TAG: Record<string, string> = {
  FILLED: "CONFIRMED", EXECUTING: "ROUTING", ROUTING: "VALIDATING",
  MONITORING: "SCANNING", BLOCKED: "BLOCKED", SCANNING: "SCANNING", VALIDATING: "VALIDATING",
};

function getStage(sig: SignalLogEntry): string {
  if (sig.executedAs) return "FILLED";
  if (sig.blockReason && sig.blockReason !== "None") return "BLOCKED";
  if (sig.confidence >= 78) return "EXECUTING";
  if (sig.confidence >= 65) return "ROUTING";
  if (sig.confidence >= 55) return "MONITORING";
  if (sig.confidence >= 40) return "VALIDATING";
  return "SCANNING";
}

interface LiveRow extends SignalLogEntry { _liveConf: number }

export function RichTerminalFeed({ engine }: Props) {
  const rawLog = [...(engine?.recentSignalLog ?? [])].reverse().slice(0, 10);

  const [rows,    setRows]   = useState<LiveRow[]>([]);
  const [flashId, setFlash]  = useState<string | null>(null);
  const prevLen              = useRef(0);

  // Populate rows from engine data
  useEffect(() => {
    const next: LiveRow[] = rawLog.map((s) => ({ ...s, _liveConf: s.confidence }));
    if (next.length > prevLen.current && next[0]) {
      setFlash(next[0].id);
      setTimeout(() => setFlash(null), 900);
    }
    prevLen.current = next.length;
    setRows(next);
  }, [engine?.recentSignalLog?.length, engine?.lastTickAt]);

  // Drift live confidence every 1.8s
  useEffect(() => {
    const id = setInterval(() => {
      setRows((prev) =>
        prev.map((r) => ({
          ...r,
          _liveConf: Math.max(0, Math.min(100,
            r.confidence + (Math.random() - 0.48) * 3.5
          )),
        }))
      );
    }, 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="rounded-lg overflow-hidden h-full"
      style={{ background: "#080808", border: "1px solid #181818" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b"
        style={{ borderBottomColor: "#181818", background: "#050505" }}
      >
        <span className="text-[10px] font-bold tracking-[0.22em] font-mono" style={{ color: "#00aaff" }}>
          LIVE TERMINAL FEED
        </span>
        <span className="text-[8px] font-mono text-[#2a4050] tracking-[0.1em]">
          REAL-TIME SIGNAL STREAM
        </span>
        <div className="ml-auto flex items-center gap-3">
          {engine?.lastSignalAt && (
            <span className="text-[8px] font-mono text-[#2a4050]">{ago(engine.lastSignalAt)}</span>
          )}
          {engine?.running ? (
            <span className="flex items-center gap-1.5">
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              <span className="text-[9px] font-mono" style={{ color: "#00ff8a" }}>LIVE</span>
            </span>
          ) : (
            <span className="text-[9px] font-mono text-[#1e3040]">IDLE</span>
          )}
        </div>
      </div>

      {/* Feed */}
      <div style={{ minHeight: 400 }}>
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <span className="text-[12px] font-mono animate-pulse" style={{ color: "#1e3040" }}>
              AWAITING SIGNAL STREAM…
            </span>
          </div>
        ) : (
          rows.map((s, i) => {
            const color    = SYMBOL_COLOR[s.symbol] ?? "#4a8fa8";
            const sym      = s.symbol.replace("USD", "");
            const stage    = getStage(s);
            const stageCfg = STAGE_CFG[stage] ?? STAGE_CFG.SCANNING;
            const subTag   = SUB_TAG[stage] ?? "SCANNING";
            const subCfg   = STAGE_CFG[subTag] ?? STAGE_CFG.SCANNING;
            const ts       = new Date(s.timestamp).toLocaleTimeString("en-US", {
              hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
            });
            const liveConf = s._liveConf;
            const isBuy    = s.decision === "BUY";
            const isSell   = s.decision === "SELL";
            const decColor = isBuy ? "#00ff8a" : isSell ? "#ff3355" : "#2a5068";
            const isFlash  = flashId === s.id;
            const isTop    = i === 0;
            const isExec   = stage === "FILLED" || stage === "EXECUTING";

            return (
              <div
                key={s.id}
                className="border-b transition-colors duration-300"
                style={{
                  borderBottomColor: "#111111",
                  background: isFlash ? `${color}0a` : isTop ? "#0a0a0a" : "transparent",
                  borderLeft: `2px solid ${isExec ? stageCfg.color : stageCfg.color + "50"}`,
                }}
              >
                {/* Row 1: badges + symbol + decision + confidence + time */}
                <div className="flex items-center gap-2 px-3 py-2.5">
                  {/* Stage icon */}
                  <span style={{ color: stageCfg.color, fontSize: 11, width: 12, flexShrink: 0 }}>
                    {stage === "FILLED" ? "✓" : stage === "BLOCKED" ? "✗" :
                     stage === "EXECUTING" ? "⚡" : "⟳"}
                  </span>

                  {/* Primary badge */}
                  <span
                    className="text-[9px] font-bold font-mono px-2 py-0.5 rounded shrink-0"
                    style={{
                      color: stageCfg.color,
                      background: stageCfg.bg,
                      border: `1px solid ${stageCfg.color}30`,
                    }}
                  >
                    {stageCfg.label}
                  </span>

                  {/* Sub badge */}
                  <span
                    className="text-[8px] font-mono px-1.5 py-0.5 rounded shrink-0"
                    style={{
                      color: subCfg.color + "99",
                      background: subCfg.bg,
                      border: `1px solid ${subCfg.color}20`,
                    }}
                  >
                    •{subCfg.label}
                  </span>

                  {/* Symbol + decision */}
                  <span className="text-[12px] font-bold font-mono" style={{ color: decColor }}>
                    {s.decision}
                  </span>
                  <span className="text-[12px] font-bold font-mono" style={{ color }}>
                    {sym}
                  </span>
                  <span className="text-[11px] font-mono" style={{ color: decColor + "bb" }}>
                    •
                  </span>
                  <span className="text-[12px] font-bold font-mono tabular-nums" style={{ color: decColor }}>
                    {liveConf.toFixed(0)}%
                  </span>
                  <span className="text-[10px] font-mono text-[#2a4050]">conf</span>

                  {/* Time */}
                  <span className="ml-auto text-[9px] font-mono text-[#2a4050] shrink-0 tabular-nums">{ts}</span>
                </div>

                {/* Row 2: summary / block reason */}
                <div
                  className="px-3 pb-2.5 flex items-center gap-2"
                  style={{ marginLeft: 14 }}
                >
                  {/* Confidence bar */}
                  <div
                    className="rounded-sm overflow-hidden shrink-0"
                    style={{ width: 60, height: 3, background: "#111111" }}
                  >
                    <div
                      className="h-full rounded-sm transition-all duration-700"
                      style={{
                        width: `${Math.min(100, liveConf)}%`,
                        background: decColor,
                        opacity: 0.6,
                      }}
                    />
                  </div>
                  <span
                    className="text-[9px] font-mono truncate"
                    style={{
                      color: (s.blockReason && s.blockReason !== "None")
                        ? "#ff3355aa"
                        : "#2e5070",
                    }}
                  >
                    {s.blockReason && s.blockReason !== "None"
                      ? `⚠ ${s.blockReason}`
                      : (s.shortSummary ?? "")}
                  </span>
                </div>
              </div>
            );
          })
        )}

        {/* Terminal cursor */}
        {engine?.running && (
          <div className="flex items-center gap-2 px-4 py-2" style={{ borderLeft: "2px solid #1a1a1a" }}>
            <span className="text-[9px] font-mono" style={{ color: "#1e3040" }}>$</span>
            <span className="text-[9px] font-mono" style={{ color: "#1e3040" }}>
              ENGINE ACTIVE · NEXT TICK ~{Math.round((engine.loopIntervalMs ?? 60000) / 1000)}s
            </span>
            <span className="cursor-blink ml-1" />
          </div>
        )}
      </div>
    </div>
  );
}
