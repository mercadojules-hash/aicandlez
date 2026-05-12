import { useEffect, useRef, useState } from "react";
import type { EngineStatus, SignalLogEntry } from "./types";
import { SYMBOL_COLOR } from "./types";
import { ago } from "./helpers";

interface Props { engine: EngineStatus | undefined }

const STAGE_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  FILLED:     { label: "FILLED",     color: "#00ff8a", bg: "#00ff8a0e", border: "#00ff8a30" },
  EXECUTING:  { label: "EXECUTING",  color: "#ffb800", bg: "#ffb8000e", border: "#ffb80030" },
  ROUTING:    { label: "ROUTING",    color: "#00f0ff", bg: "#00f0ff0a", border: "#00f0ff28" },
  MONITORING: { label: "MONITORING", color: "#00aaff", bg: "#00aaff0a", border: "#00aaff22" },
  BLOCKED:    { label: "BLOCKED",    color: "#ff2255", bg: "#ff22550e", border: "#ff225530" },
  SCANNING:   { label: "SCANNING",   color: "#c855f7", bg: "#c855f70a", border: "#c855f725" },
  VALIDATING: { label: "VALIDATING", color: "#ffb800", bg: "#ffb8000a", border: "#ffb80025" },
  CONFIRMED:  { label: "CONFIRMED",  color: "#00ff8a", bg: "#00ff8a0a", border: "#00ff8a22" },
};

const SUB_STAGE: Record<string, string> = {
  FILLED:     "CONFIRMED",
  EXECUTING:  "ROUTING",
  ROUTING:    "VALIDATING",
  MONITORING: "SCANNING",
  BLOCKED:    "BLOCKED",
  SCANNING:   "SCANNING",
  VALIDATING: "VALIDATING",
};

function getStage(sig: SignalLogEntry): string {
  if (sig.executedAs)                                return "FILLED";
  if (sig.blockReason && sig.blockReason !== "None") return "BLOCKED";
  if (sig.confidence >= 78)                          return "EXECUTING";
  if (sig.confidence >= 65)                          return "ROUTING";
  if (sig.confidence >= 55)                          return "MONITORING";
  if (sig.confidence >= 40)                          return "VALIDATING";
  return "SCANNING";
}

interface FeedRow extends SignalLogEntry {
  _drift: number;
}

export function RichTerminalFeed({ engine }: Props) {
  const rawLog = [...(engine?.recentSignalLog ?? [])].reverse().slice(0, 10);

  const [rows, setRows]     = useState<FeedRow[]>([]);
  const [flashId, setFlash] = useState<string | null>(null);
  const prevLen             = useRef(0);

  useEffect(() => {
    const newRows: FeedRow[] = rawLog.map((s) => ({ ...s, _drift: 0 }));
    setRows(newRows);
    if (newRows.length > prevLen.current && newRows.length > 0) {
      setFlash(newRows[0]?.id ?? null);
      setTimeout(() => setFlash(null), 800);
    }
    prevLen.current = newRows.length;
  }, [engine?.recentSignalLog?.length, engine?.lastTickAt]);

  useEffect(() => {
    const id = setInterval(() => {
      setRows((prev) =>
        prev.map((r) => ({
          ...r,
          _drift: r.confidence + (Math.random() - 0.5) * 1.8,
        }))
      );
    }, 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "#030d18", border: "1px solid #0D2235" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-3 py-2 border-b"
        style={{ borderBottomColor: "#0D2235", background: "#020a14" }}
      >
        <span className="text-[8px] font-bold tracking-[0.22em] text-[#00aaff]">
          LIVE TERMINAL FEED
        </span>
        <span className="text-[7px] text-[#1a3850] font-mono tracking-[0.1em]">
          REAL-TIME SIGNAL STREAM
        </span>
        <div className="ml-auto flex items-center gap-2">
          {engine?.lastSignalAt && (
            <span className="text-[8px] text-[#1a3850] font-mono">{ago(engine.lastSignalAt)}</span>
          )}
          {engine?.running ? (
            <span className="flex items-center gap-1.5">
              <span className="live-dot" style={{ width: 5, height: 5 }} />
              <span className="text-[8px] font-mono" style={{ color: "#00ff8a80" }}>LIVE</span>
            </span>
          ) : (
            <span className="text-[8px] font-mono text-[#1e4060]">IDLE</span>
          )}
        </div>
      </div>

      {/* Feed rows */}
      <div style={{ minHeight: 300 }}>
        {rows.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <span className="text-[11px] text-[#1a3850] font-mono animate-pulse">
              AWAITING SIGNAL STREAM…
            </span>
          </div>
        ) : (
          rows.map((s, i) => {
            const color    = SYMBOL_COLOR[s.symbol] ?? "#4a8fa8";
            const sym      = s.symbol.replace("USD", "");
            const stage    = getStage(s);
            const stageCfg = STAGE_CFG[stage] ?? STAGE_CFG.SCANNING;
            const subStage = STAGE_CFG[SUB_STAGE[stage] ?? "SCANNING"];
            const ts       = new Date(s.timestamp).toLocaleTimeString("en-US", {
              hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
            });
            const dispConf = Math.max(0, Math.min(100, s._drift || s.confidence));
            const isBuy    = s.decision === "BUY";
            const isSell   = s.decision === "SELL";
            const decColor = isBuy ? "#00ff8a" : isSell ? "#ff2255" : "#2a6080";
            const isFlash  = flashId === s.id;
            const isFirst  = i === 0;

            return (
              <div
                key={s.id}
                className="border-b transition-all duration-300"
                style={{
                  borderBottomColor: "#0a1820",
                  background: isFlash
                    ? `${color}08`
                    : isFirst
                    ? "#020c18"
                    : "transparent",
                }}
              >
                {/* Row 1 */}
                <div className="flex items-center gap-2 px-3 py-2">
                  {/* Stage icon */}
                  <span
                    className="text-[9px] font-mono shrink-0"
                    style={{ color: stageCfg.color, width: 10 }}
                  >
                    {stage === "FILLED" ? "✓" :
                     stage === "BLOCKED" ? "✗" :
                     stage === "EXECUTING" ? "⚡" : "⟳"}
                  </span>

                  {/* Primary stage badge */}
                  <span
                    className="text-[8px] font-bold px-1.5 py-0.5 rounded font-mono shrink-0"
                    style={{
                      color: stageCfg.color,
                      background: stageCfg.bg,
                      border: `1px solid ${stageCfg.border}`,
                    }}
                  >
                    {stageCfg.label}
                  </span>

                  {/* Sub badge */}
                  <span
                    className="text-[7px] font-mono px-1 py-0.5 rounded shrink-0"
                    style={{
                      color: subStage.color + "bb",
                      background: subStage.bg,
                      border: `1px solid ${subStage.border}`,
                    }}
                  >
                    •{subStage.label}
                  </span>

                  {/* Symbol + decision */}
                  <span
                    className="text-[9px] font-bold font-mono"
                    style={{ color: decColor }}
                  >
                    {s.decision}
                  </span>
                  <span
                    className="text-[9px] font-bold font-mono"
                    style={{ color }}
                  >
                    {sym}
                  </span>
                  <span className="text-[8px] font-mono" style={{ color: decColor + "cc" }}>
                    • {dispConf.toFixed(0)}% confidence
                  </span>

                  {/* Time */}
                  <span className="ml-auto text-[8px] font-mono text-[#1a3850] shrink-0">{ts}</span>
                </div>

                {/* Row 2: summary */}
                <div className="px-3 pb-2">
                  <span className="text-[8px] font-mono text-[#1e4060]">
                    {s.blockReason && s.blockReason !== "None"
                      ? `⚠ ${s.blockReason}`
                      : s.shortSummary ?? ""}
                  </span>
                </div>
              </div>
            );
          })
        )}

        {/* Terminal cursor */}
        {engine?.running && (
          <div className="flex items-center gap-1.5 px-3 py-2">
            <span className="text-[8px] font-mono text-[#00f0ff20]">$</span>
            <span className="text-[8px] font-mono text-[#00f0ff20]">
              ENGINE ACTIVE · NEXT TICK ~{Math.round((engine.loopIntervalMs ?? 60000) / 1000)}s
            </span>
            <span className="cursor-blink ml-0.5" />
          </div>
        )}
      </div>
    </div>
  );
}
