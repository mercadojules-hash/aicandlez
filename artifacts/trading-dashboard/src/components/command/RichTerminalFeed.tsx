import { useEffect, useRef, useState } from "react";
import type { EngineStatus, SignalLogEntry } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { engine: EngineStatus | undefined }

type Category = "ALL" | "SIGNAL" | "TRADE" | "ALERT" | "AI";

const STAGE_CFG: Record<string, { label: string; color: string }> = {
  FILLED:     { label: "TRADE",   color: "#00ff8a" },
  EXECUTION:  { label: "EXEC",    color: "#00cc6a" },
  ROUTING:    { label: "ROUTE",   color: "#00ccff" },
  BLOCKED:    { label: "BLOCK",   color: "#ff3355" },
  MONITORING: { label: "AI",      color: "#0099ff" },
  VALIDATING: { label: "VALID",   color: "#ffaa00" },
  SCANNING:   { label: "SCAN",    color: "#7b68ee" },
};

const CAT_COLOR: Record<string, string> = {
  ALL: "#4a8fa8", SIGNAL: "#cc55ff", TRADE: "#00ff8a", ALERT: "#ff6600", AI: "#00f0ff",
};

function getStage(sig: SignalLogEntry): string {
  if (sig.executedAs)                                return "FILLED";
  if (sig.blockReason && sig.blockReason !== "None") return "BLOCKED";
  if (sig.confidence >= 78)                          return "EXECUTION";
  if (sig.confidence >= 65)                          return "ROUTING";
  if (sig.confidence >= 55)                          return "MONITORING";
  if (sig.confidence >= 40)                          return "VALIDATING";
  return "SCANNING";
}

function stageToCategory(stage: string): Category {
  if (stage === "FILLED" || stage === "EXECUTION" || stage === "ROUTING") return "TRADE";
  if (stage === "BLOCKED")                                                  return "ALERT";
  if (stage === "MONITORING")                                               return "AI";
  return "SIGNAL";
}

interface LiveRow extends SignalLogEntry { _conf: number; _stage: string }

const TABS: { key: Category; label: string }[] = [
  { key: "ALL",    label: "ALL"    },
  { key: "SIGNAL", label: "SIGNAL" },
  { key: "TRADE",  label: "TRADE"  },
  { key: "ALERT",  label: "ALERT"  },
  { key: "AI",     label: "AI"     },
];

export function RichTerminalFeed({ engine }: Props) {
  const raw = [...(engine?.recentSignalLog ?? [])].reverse().slice(0, 80);
  const [rows,   setRows]   = useState<LiveRow[]>([]);
  const [filter, setFilter] = useState<Category>("ALL");
  const [tick,   setTick]   = useState(0);
  const scrollRef           = useRef<HTMLDivElement>(null);
  const prevLen             = useRef(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const next: LiveRow[] = raw.map(s => ({ ...s, _conf: s.confidence, _stage: getStage(s) }));
    if (next.length > prevLen.current) {
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
    prevLen.current = next.length;
    setRows(next);
  }, [engine?.recentSignalLog?.length, engine?.lastTickAt]);

  useEffect(() => {
    const id = setInterval(() => {
      setRows(prev => prev.map(r => ({
        ...r,
        _conf: Math.max(0, Math.min(100, r.confidence + (Math.random() - 0.46) * 4)),
      })));
    }, 1200);
    return () => clearInterval(id);
  }, []);

  const loopSec  = Math.round((engine?.loopIntervalMs ?? 60000) / 1000);
  const nextTick = loopSec - (tick % loopSec);
  const visible  = filter === "ALL" ? rows : rows.filter(r => stageToCategory(r._stage) === filter);

  return (
    <div className="terminal-card flex flex-col" style={{ height: "100%" }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2 border-b flex-shrink-0"
        style={{ borderBottomColor: "#111111" }}>
        <div className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
          style={{ background: "#00aaff", boxShadow: "0 0 5px #00aaff" }} />
        <span className="text-[11px] font-bold font-mono tracking-[0.18em]" style={{ color: "#00aaff" }}>
          LIVE TERMINAL FEED
        </span>
        <span className="text-[9px] font-mono font-medium" style={{ color: "#9FB3C8" }}>
          · SIGNAL STREAM
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[9px] font-mono tabular-nums font-medium"
            style={{ color: nextTick <= 5 ? "#ffaa00" : "#9FB3C8" }}>
            NEXT {nextTick}s
          </span>
          {engine?.running ? (
            <span className="flex items-center gap-1.5">
              <span className="live-dot" style={{ width: 5, height: 5 }} />
              <span className="text-[9px] font-mono font-bold" style={{ color: "#00ff8a" }}>LIVE</span>
            </span>
          ) : (
            <span className="text-[9px] font-mono font-medium" style={{ color: "#9FB3C8" }}>IDLE</span>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-3 py-1 border-b flex-shrink-0"
        style={{ borderBottomColor: "#0d0d0d", background: "#020202" }}>
        {TABS.map(tab => (
          <button key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="text-[8px] font-bold font-mono px-2 py-0.5 rounded tracking-wide transition-all"
            style={filter === tab.key
              ? { background: `${CAT_COLOR[tab.key]}14`, color: CAT_COLOR[tab.key], border: `1px solid ${CAT_COLOR[tab.key]}30` }
              : { background: "transparent", color: "#9FB3C8", border: "1px solid transparent" }
            }>
            {tab.label}
          </button>
        ))}
        <span className="ml-auto text-[8px] font-mono font-semibold tabular-nums" style={{ color: "#C7D4E2" }}>
          {visible.length}
        </span>
      </div>

      {/* Feed — fills all remaining height, tighter rows for ~15 visible */}
      <div ref={scrollRef} className="feed-scroll"
        style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {visible.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <span className="text-[11px] font-mono animate-pulse font-medium" style={{ color: "#9FB3C8" }}>
              AWAITING SIGNAL STREAM…
            </span>
          </div>
        ) : (
          <>
            {visible.map((s, i) => {
              const symColor  = SYMBOL_COLOR[s.symbol] ?? "#4a8fa8";
              const sym       = s.symbol.replace("USD", "");
              const stage     = s._stage;
              const stageCfg  = STAGE_CFG[stage] ?? STAGE_CFG.SCANNING;
              const isBuy     = s.decision === "BUY";
              const isSell    = s.decision === "SELL";
              const decColor  = isBuy ? "#00ff8a" : isSell ? "#ff3355" : "#9FB3C8";
              const isBlocked = stage === "BLOCKED";
              const isFilled  = stage === "FILLED";
              const confColor = s._conf >= 70 ? "#00ff8a" : s._conf >= 50 ? "#ffaa00" : "#ff4466";

              const ts = new Date(s.timestamp).toLocaleTimeString("en-US", {
                hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
              });

              return (
                <div key={s.id}
                  style={{
                    borderBottom: "1px solid #0d0d0d",
                    borderLeft:   `2px solid ${stageCfg.color}${isFilled ? "90" : "35"}`,
                    background:   isBlocked ? "#ff33550c" : isFilled ? "#00ff8a08" : i === 0 ? "#050505" : "transparent",
                    animation:    i === 0 ? "feed-row-in 0.25s ease-out" : undefined,
                  }}>

                  {/* Row — tighter py-1.5 to show ~15 rows in container */}
                  <div className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className="text-[7px] font-bold font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{
                        color:      stageCfg.color,
                        background: `${stageCfg.color}14`,
                        border:     `1px solid ${stageCfg.color}28`,
                        minWidth:   40, textAlign: "center",
                      }}>
                      {stageCfg.label}
                    </span>
                    <span className="text-[9px] font-mono tabular-nums flex-shrink-0 font-semibold"
                      style={{ color: "#C7D4E2" }}>
                      {ts}
                    </span>
                    <span className="text-[11px] font-bold font-mono flex-shrink-0"
                      style={{
                        color: decColor,
                        textShadow: s.decision !== "HOLD" ? `0 0 8px ${decColor}50` : undefined,
                      }}>
                      {s.decision}
                    </span>
                    <span className="text-[11px] font-bold font-mono flex-shrink-0" style={{ color: symColor }}>
                      {sym}
                    </span>
                    <span className="text-[10px] font-bold font-mono tabular-nums flex-shrink-0"
                      style={{ color: confColor }}>
                      {s._conf.toFixed(0)}%
                    </span>
                    <span className="text-[9px] font-mono truncate flex-1"
                      style={{ color: isBlocked ? "#ff335580" : "#9FB3C8" }}>
                      {isBlocked ? `⚠ ${s.blockReason}` : (s.shortSummary ?? "")}
                    </span>
                    <span className="text-[7px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ color: "#C7D4E2", background: "#0d0d0d", border: "1px solid #1a1a1a" }}>
                      KRK
                    </span>
                  </div>

                  {/* Conf bar — slim */}
                  <div style={{ paddingLeft: 64, paddingRight: 10, paddingBottom: 4 }}>
                    <div style={{ height: 2, background: "#0a0a0a", borderRadius: 2 }}>
                      <div style={{
                        height: "100%",
                        width:  `${Math.min(100, s._conf)}%`,
                        background: confColor,
                        borderRadius: 2,
                        opacity: 0.6,
                        transition: "width 0.8s ease",
                      }} />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Terminal cursor */}
            <div className="flex items-center gap-2 px-4 py-2" style={{ borderLeft: "2px solid #0d0d0d" }}>
              <span className="text-[9px] font-mono font-semibold" style={{ color: "#C7D4E2" }}>$</span>
              <span className="text-[9px] font-mono" style={{ color: "#9FB3C8" }}>
                {engine?.running
                  ? `ENGINE RUNNING · NEXT TICK ${nextTick}s · SIGNALS: ${engine.signalsGenerated ?? 0}`
                  : "ENGINE IDLE — AWAITING FIRST TICK"}
              </span>
              <span className="cursor-blink" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
