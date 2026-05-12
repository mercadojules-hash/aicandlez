import { useEffect, useRef, useState } from "react";
import type { EngineStatus, SignalLogEntry } from "./types";
import { SYMBOL_COLOR } from "./types";
import { ago } from "./helpers";

interface Props { engine: EngineStatus | undefined }

const STAGE_CFG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  FILLED:     { label: "FILLED",     color: "#00ff8a", bg: "#00ff8a0d", icon: "✓" },
  EXECUTING:  { label: "EXECUTING",  color: "#ffb800", bg: "#ffb8000d", icon: "⚡" },
  ROUTING:    { label: "ROUTING",    color: "#00ccff", bg: "#00ccff0a", icon: "⟳" },
  MONITORING: { label: "MONITORING", color: "#0099ff", bg: "#0099ff0a", icon: "◉" },
  BLOCKED:    { label: "BLOCKED",    color: "#ff2255", bg: "#ff22550d", icon: "✗" },
  SCANNING:   { label: "SCANNING",   color: "#cc55ff", bg: "#cc55ff0a", icon: "⟳" },
  VALIDATING: { label: "VALIDATING", color: "#ffaa00", bg: "#ffaa000a", icon: "⟳" },
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

interface LiveRow extends SignalLogEntry {
  _liveConf:  number;
  _confPulse: boolean;
}

export function RichTerminalFeed({ engine }: Props) {
  const rawLog = [...(engine?.recentSignalLog ?? [])].reverse().slice(0, 30);

  const [rows,    setRows]  = useState<LiveRow[]>([]);
  const [flashId, setFlash] = useState<string | null>(null);
  const prevLen             = useRef(0);
  const scrollRef           = useRef<HTMLDivElement>(null);

  // Sync rows from engine data
  useEffect(() => {
    const next: LiveRow[] = rawLog.map((s) => ({
      ...s, _liveConf: s.confidence, _confPulse: false,
    }));
    if (next.length > prevLen.current && next[0]) {
      setFlash(next[0].id);
      setTimeout(() => setFlash(null), 800);
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
    prevLen.current = next.length;
    setRows(next);
  }, [engine?.recentSignalLog?.length, engine?.lastTickAt]);

  // Drift confidence every 1.2s + pulse flag
  useEffect(() => {
    const id = setInterval(() => {
      setRows((prev) =>
        prev.map((r) => {
          const delta = (Math.random() - 0.46) * 4.5;
          const newConf = Math.max(0, Math.min(100, r.confidence + delta));
          return { ...r, _liveConf: newConf, _confPulse: Math.abs(delta) > 2 };
        })
      );
      // Clear pulse flag after 300ms
      setTimeout(() => {
        setRows((prev) => prev.map((r) => ({ ...r, _confPulse: false })));
      }, 300);
    }, 1200);
    return () => clearInterval(id);
  }, []);

  // Tick counter for "aliveness" even when no signals
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const loopSec = Math.round((engine?.loopIntervalMs ?? 60000) / 1000);
  const nextTick = loopSec - (tick % loopSec);

  return (
    <div
      className="rounded-lg overflow-hidden flex flex-col"
      style={{ background: "#000000", border: "1px solid #1c1c1c" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0"
        style={{ borderBottomColor: "#111111", background: "#000000" }}
      >
        <span className="text-[10px] font-bold tracking-[0.22em] font-mono" style={{ color: "#00aaff" }}>
          LIVE TERMINAL FEED
        </span>
        <span className="text-[8px] font-mono tracking-[0.1em]" style={{ color: "#1a2a35" }}>
          REAL-TIME SIGNAL STREAM
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span
            className="text-[8px] font-mono tabular-nums"
            style={{ color: nextTick <= 5 ? "#ffaa00" : "#1a2a35" }}
          >
            NEXT TICK {nextTick}s
          </span>
          {engine?.lastSignalAt && (
            <span className="text-[8px] font-mono" style={{ color: "#1a2a35" }}>{ago(engine.lastSignalAt)}</span>
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
        style={{
          overflowY: "auto", maxHeight: 620,
          scrollbarWidth: "thin", scrollbarColor: "#1a1a1a #000000",
        }}
      >
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-14">
            <span className="text-[11px] font-mono animate-pulse" style={{ color: "#1a2a35" }}>
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
            const decColor = isBuy ? "#00ff8a" : isSell ? "#ff3355" : "#1e3040";
            const isFlash  = flashId === s.id;
            const isNew    = i === 0;
            const isExec   = stage === "FILLED" || stage === "EXECUTING";
            const hasBlock = !!(s.blockReason && s.blockReason !== "None");
            const confColor = liveConf >= 70 ? "#00ff8a" : liveConf >= 50 ? "#ffaa00" : decColor;

            return (
              <div
                key={s.id}
                className="border-b"
                style={{
                  borderBottomColor: "#0a0a0a",
                  background: isFlash ? `${color}0a`
                    : isNew    ? "#020202"
                    : "#000000",
                  borderLeft: `2.5px solid ${isExec ? stageCfg.color : stageCfg.color + "35"}`,
                  transition: "background 0.4s",
                }}
              >
                {/* Row 1: icon + stage badge + decision + symbol + confidence + time */}
                <div className="flex items-center gap-2 px-3 py-2">
                  <span
                    style={{
                      color: stageCfg.color, fontSize: 11, width: 12,
                      flexShrink: 0, lineHeight: 1,
                    }}
                  >
                    {stageCfg.icon}
                  </span>

                  <span
                    className="text-[9px] font-bold font-mono px-2 py-0.5 rounded shrink-0"
                    style={{
                      color: stageCfg.color,
                      background: stageCfg.bg,
                      border: `1px solid ${stageCfg.color}25`,
                    }}
                  >
                    {stageCfg.label}
                  </span>

                  <span className="text-[13px] font-bold font-mono shrink-0" style={{ color: decColor }}>
                    {s.decision}
                  </span>
                  <span className="text-[13px] font-bold font-mono shrink-0" style={{ color }}>
                    {sym}
                  </span>
                  <span className="text-[10px] font-mono shrink-0" style={{ color: "#0d1a22" }}>·</span>

                  {/* Confidence — pulses when drifting */}
                  <span
                    className="text-[13px] font-bold font-mono tabular-nums shrink-0 transition-colors duration-200"
                    style={{ color: s._confPulse ? "#ffffff" : confColor }}
                  >
                    {liveConf.toFixed(0)}%
                  </span>
                  <span className="text-[9px] font-mono shrink-0" style={{ color: "#0d1a22" }}>conf</span>

                  <span
                    className="ml-auto text-[9px] font-mono tabular-nums shrink-0"
                    style={{ color: "#111a22" }}
                  >
                    {ts}
                  </span>
                </div>

                {/* Row 2: conf bar + summary/block reason */}
                <div
                  className="flex items-center gap-2 pb-2"
                  style={{ paddingLeft: 40, paddingRight: 12 }}
                >
                  <div
                    className="rounded-sm overflow-hidden shrink-0"
                    style={{ width: 64, height: 3, background: "#0a0a0a" }}
                  >
                    <div
                      className="h-full rounded-sm"
                      style={{
                        width: `${Math.min(100, liveConf)}%`,
                        background: confColor,
                        opacity: 0.6,
                        transition: "width 0.6s, background 0.3s",
                      }}
                    />
                  </div>
                  <span
                    className="text-[9px] font-mono truncate"
                    style={{ color: hasBlock ? "#ff335575" : "#0d1a22" }}
                  >
                    {hasBlock ? `⚠ ${s.blockReason}` : (s.shortSummary ?? "")}
                  </span>
                </div>
              </div>
            );
          })
        )}

        {/* Terminal cursor */}
        <div
          className="flex items-center gap-2 px-4 py-2"
          style={{ borderLeft: "2.5px solid #080808" }}
        >
          <span className="text-[9px] font-mono" style={{ color: "#0d1a22" }}>$</span>
          <span className="text-[9px] font-mono" style={{ color: "#0d1a22" }}>
            {engine?.running
              ? `ENGINE RUNNING · NEXT CYCLE IN ${nextTick}s · SIGNALS: ${engine?.signalsGenerated ?? 0}`
              : "ENGINE IDLE — WAITING FOR START"
            }
          </span>
          <span className="cursor-blink ml-1" />
        </div>
      </div>
    </div>
  );
}
