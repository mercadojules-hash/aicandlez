import { useEffect, useRef, useState } from "react";
import type { EngineStatus, SignalLogEntry } from "./types";
import { SYMBOL_COLOR } from "./types";
import { ago } from "./helpers";

interface Props { engine: EngineStatus | undefined }

const STAGE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  FILLED:     { label: "FILLED",     color: "#00ff8a", bg: "#00ff8a0e" },
  EXECUTING:  { label: "EXECUTING",  color: "#ffb800", bg: "#ffb8000e" },
  ROUTING:    { label: "ROUTING",    color: "#00ccff", bg: "#00ccff0a" },
  MONITORING: { label: "MONITORING", color: "#0099ff", bg: "#0099ff0a" },
  BLOCKED:    { label: "BLOCKED",    color: "#ff2255", bg: "#ff22550e" },
  SCANNING:   { label: "SCANNING",   color: "#cc55ff", bg: "#cc55ff0a" },
  VALIDATING: { label: "VALIDATING", color: "#ffaa00", bg: "#ffaa000a" },
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
  const rawLog = [...(engine?.recentSignalLog ?? [])].reverse().slice(0, 20);

  const [rows,    setRows]  = useState<LiveRow[]>([]);
  const [flashId, setFlash] = useState<string | null>(null);
  const prevLen             = useRef(0);
  const scrollRef           = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next: LiveRow[] = rawLog.map((s) => ({ ...s, _liveConf: s.confidence }));
    if (next.length > prevLen.current && next[0]) {
      setFlash(next[0].id);
      setTimeout(() => setFlash(null), 700);
      // Auto-scroll to top on new row
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
    prevLen.current = next.length;
    setRows(next);
  }, [engine?.recentSignalLog?.length, engine?.lastTickAt]);

  // Drift confidence every 1.8s
  useEffect(() => {
    const id = setInterval(() => {
      setRows((prev) =>
        prev.map((r) => ({
          ...r,
          _liveConf: Math.max(0, Math.min(100, r.confidence + (Math.random() - 0.48) * 3.2)),
        }))
      );
    }, 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="rounded-lg overflow-hidden flex flex-col"
      style={{ background: "#000000", border: "1px solid #1c1c1c" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0"
        style={{ borderBottomColor: "#141414", background: "#000000" }}
      >
        <span className="text-[10px] font-bold tracking-[0.22em] font-mono" style={{ color: "#00aaff" }}>
          LIVE TERMINAL FEED
        </span>
        <span className="text-[8px] font-mono tracking-[0.1em]" style={{ color: "#1e3040" }}>
          REAL-TIME SIGNAL STREAM
        </span>
        <div className="ml-auto flex items-center gap-3">
          {engine?.lastSignalAt && (
            <span className="text-[8px] font-mono" style={{ color: "#1e3040" }}>{ago(engine.lastSignalAt)}</span>
          )}
          {engine?.running ? (
            <span className="flex items-center gap-1.5">
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              <span className="text-[9px] font-mono" style={{ color: "#00ff8a" }}>LIVE</span>
            </span>
          ) : (
            <span className="text-[9px] font-mono" style={{ color: "#1e3040" }}>IDLE</span>
          )}
        </div>
      </div>

      {/* Scrollable feed */}
      <div
        ref={scrollRef}
        style={{ overflowY: "auto", maxHeight: 520, scrollbarWidth: "thin",
          scrollbarColor: "#1a1a1a #000000" }}
      >
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-[11px] font-mono animate-pulse" style={{ color: "#1e3040" }}>
              AWAITING SIGNAL STREAM…
            </span>
          </div>
        ) : (
          rows.map((s, i) => {
            const color    = SYMBOL_COLOR[s.symbol] ?? "#4a8fa8";
            const sym      = s.symbol.replace("USD", "");
            const stage    = getStage(s);
            const stageCfg = STAGE_CFG[stage] ?? STAGE_CFG.SCANNING;
            const ts       = new Date(s.timestamp).toLocaleTimeString("en-US", {
              hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
            });
            const liveConf = s._liveConf;
            const isBuy    = s.decision === "BUY";
            const isSell   = s.decision === "SELL";
            const decColor = isBuy ? "#00ff8a" : isSell ? "#ff3355" : "#223344";
            const isFlash  = flashId === s.id;
            const isNew    = i === 0;
            const isExec   = stage === "FILLED" || stage === "EXECUTING";
            const hasBlock = !!(s.blockReason && s.blockReason !== "None");

            return (
              <div
                key={s.id}
                className="border-b"
                style={{
                  borderBottomColor: "#0d0d0d",
                  background: isFlash ? `${color}08` : isNew ? "#030303" : "#000000",
                  borderLeft: `2.5px solid ${isExec ? stageCfg.color : stageCfg.color + "40"}`,
                  transition: "background 0.4s",
                }}
              >
                {/* Main row */}
                <div className="flex items-center gap-2 px-3 py-2">
                  <span style={{ color: stageCfg.color, fontSize: 11, width: 13, flexShrink: 0 }}>
                    {stage === "FILLED" ? "✓" : stage === "BLOCKED" ? "✗" :
                     stage === "EXECUTING" ? "⚡" : "⟳"}
                  </span>

                  <span className="text-[9px] font-bold font-mono px-2 py-0.5 rounded shrink-0"
                    style={{ color: stageCfg.color, background: stageCfg.bg, border: `1px solid ${stageCfg.color}28` }}>
                    {stageCfg.label}
                  </span>

                  <span className="text-[13px] font-bold font-mono shrink-0" style={{ color: decColor }}>
                    {s.decision}
                  </span>
                  <span className="text-[13px] font-bold font-mono shrink-0" style={{ color }}>
                    {sym}
                  </span>
                  <span className="text-[9px] font-mono shrink-0" style={{ color: decColor + "88" }}>·</span>
                  <span className="text-[13px] font-bold font-mono tabular-nums shrink-0" style={{ color: decColor }}>
                    {liveConf.toFixed(0)}%
                  </span>
                  <span className="text-[9px] font-mono shrink-0" style={{ color: "#1e3040" }}>conf</span>

                  <span className="ml-auto text-[9px] font-mono tabular-nums shrink-0" style={{ color: "#1a2a35" }}>
                    {ts}
                  </span>
                </div>

                {/* Sub row: bar + reason */}
                <div className="flex items-center gap-2 px-3 pb-2" style={{ paddingLeft: 40 }}>
                  <div className="rounded-sm overflow-hidden shrink-0"
                    style={{ width: 56, height: 3, background: "#0d0d0d" }}>
                    <div className="h-full rounded-sm"
                      style={{ width: `${Math.min(100, liveConf)}%`, background: decColor,
                        opacity: 0.55, transition: "width 0.7s" }} />
                  </div>
                  <span className="text-[9px] font-mono truncate"
                    style={{ color: hasBlock ? "#ff335588" : "#1e3040" }}>
                    {hasBlock ? `⚠ ${s.blockReason}` : (s.shortSummary ?? "")}
                  </span>
                </div>
              </div>
            );
          })
        )}

        {/* Terminal cursor */}
        {engine?.running && (
          <div className="flex items-center gap-2 px-4 py-2"
            style={{ borderLeft: "2.5px solid #0d0d0d" }}>
            <span className="text-[9px] font-mono" style={{ color: "#111111" }}>$</span>
            <span className="text-[9px] font-mono" style={{ color: "#111111" }}>
              ENGINE ACTIVE · LOOP ~{Math.round((engine.loopIntervalMs ?? 60000) / 1000)}s
            </span>
            <span className="cursor-blink ml-1" />
          </div>
        )}
      </div>
    </div>
  );
}
