import { useEffect, useRef, useState } from "react";
import type { EngineStatus, SignalLogEntry } from "./types";
import { SYMBOL_COLOR } from "./types";
import { ago } from "./helpers";

interface Props { engine: EngineStatus | undefined }

type Category = "ALL" | "SIGNAL" | "TRADE" | "ALERT" | "SYSTEM" | "AI";

const CAT: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  SIGNAL:     { label: "SIGNAL",  color: "#cc55ff", bg: "#cc55ff0f", border: "#cc55ff28", icon: "◈" },
  TRADE:      { label: "TRADE",   color: "#00ff8a", bg: "#00ff8a0f", border: "#00ff8a28", icon: "✓" },
  EXECUTION:  { label: "TRADE",   color: "#00ff8a", bg: "#00ff8a0f", border: "#00ff8a28", icon: "✓" },
  ALERT:      { label: "ALERT",   color: "#ff6600", bg: "#ff66000f", border: "#ff660028", icon: "⚠" },
  BLOCKED:    { label: "ALERT",   color: "#ff3355", bg: "#ff33550f", border: "#ff335528", icon: "✗" },
  SYSTEM:     { label: "SYSTEM",  color: "#00aaff", bg: "#00aaff0f", border: "#00aaff28", icon: "◉" },
  AI:         { label: "AI",      color: "#00f0ff", bg: "#00f0ff0f", border: "#00f0ff28", icon: "◆" },
  MONITORING: { label: "AI",      color: "#0099ff", bg: "#0099ff0a", border: "#0099ff20", icon: "◆" },
  ROUTING:    { label: "TRADE",   color: "#00ccff", bg: "#00ccff0a", border: "#00ccff20", icon: "⟳" },
  SCANNING:   { label: "SIGNAL",  color: "#7b68ee", bg: "#7b68ee0a", border: "#7b68ee20", icon: "⟳" },
  VALIDATING: { label: "SIGNAL",  color: "#ffaa00", bg: "#ffaa000a", border: "#ffaa0020", icon: "⟳" },
  FILLED:     { label: "TRADE",   color: "#00ff8a", bg: "#00ff8a0f", border: "#00ff8a28", icon: "✓" },
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

function getCategory(stage: string): Category {
  if (stage === "FILLED" || stage === "EXECUTION" || stage === "ROUTING") return "TRADE";
  if (stage === "BLOCKED")                                                  return "ALERT";
  if (stage === "MONITORING" || stage === "AI")                             return "AI";
  return "SIGNAL";
}

interface LiveRow extends SignalLogEntry { _liveConf: number; _pulse: boolean; _stage: string }

const FILTER_TABS: { key: Category; label: string; color: string }[] = [
  { key: "ALL",    label: "ALL",    color: "#4a8fa8" },
  { key: "SIGNAL", label: "SIGNAL", color: "#cc55ff" },
  { key: "TRADE",  label: "TRADE",  color: "#00ff8a" },
  { key: "ALERT",  label: "ALERT",  color: "#ff6600" },
  { key: "SYSTEM", label: "SYSTEM", color: "#00aaff" },
  { key: "AI",     label: "AI",     color: "#00f0ff" },
];

export function RichTerminalFeed({ engine }: Props) {
  const rawLog = [...(engine?.recentSignalLog ?? [])].reverse().slice(0, 60);
  const [rows,    setRows]  = useState<LiveRow[]>([]);
  const [flashId, setFlash] = useState<string | null>(null);
  const [filter,  setFilter]= useState<Category>("ALL");
  const prevLen             = useRef(0);
  const scrollRef           = useRef<HTMLDivElement>(null);
  const [tick,    setTick]  = useState(0);

  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id); }, []);

  useEffect(() => {
    const next: LiveRow[] = rawLog.map((s) => ({ ...s, _liveConf: s.confidence, _pulse: false, _stage: getStage(s) }));
    if (next.length > prevLen.current && next[0]) {
      setFlash(next[0].id);
      setTimeout(() => setFlash(null), 800);
      if (filter === "ALL" || getCategory(next[0]._stage) === filter)
        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
    prevLen.current = next.length;
    setRows(next);
  }, [engine?.recentSignalLog?.length, engine?.lastTickAt]);

  useEffect(() => {
    const id = setInterval(() => {
      setRows((prev) => prev.map((r) => {
        const d = (Math.random() - 0.46) * 5;
        return { ...r, _liveConf: Math.max(0, Math.min(100, r.confidence + d)), _pulse: Math.abs(d) > 2.5 };
      }));
      setTimeout(() => setRows((p) => p.map((r) => ({ ...r, _pulse: false }))), 250);
    }, 1100);
    return () => clearInterval(id);
  }, []);

  const loopSec  = Math.round((engine?.loopIntervalMs ?? 60000) / 1000);
  const nextTick = loopSec - (tick % loopSec);

  const visible = filter === "ALL"
    ? rows
    : rows.filter((r) => getCategory(r._stage) === filter);

  return (
    <div className="terminal-card flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0"
        style={{ borderBottomColor: "#0f0f0f", background: "#000000" }}>
        <span className="panel-header-title" style={{ color: "#00aaff" }}>LIVE TERMINAL FEED</span>
        <span className="text-[8px] font-mono tracking-[0.1em]" style={{ color: "#1a2a35" }}>
          REAL-TIME SIGNAL STREAM
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[8px] font-mono tabular-nums"
            style={{ color: nextTick <= 5 ? "#ffaa00" : "#1a2a35" }}>
            NEXT {nextTick}s
          </span>
          {engine?.running ? (
            <span className="flex items-center gap-1.5">
              <span className="live-dot" style={{ width: 5, height: 5 }} />
              <span className="text-[9px] font-mono font-bold" style={{ color: "#00ff8a" }}>LIVE</span>
            </span>
          ) : (
            <span className="text-[9px] font-mono" style={{ color: "#1a2a35" }}>IDLE</span>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b"
        style={{ borderBottomColor: "#0a0a0a", background: "#010101" }}>
        {FILTER_TABS.map((tab) => (
          <button key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="text-[8px] font-bold font-mono px-2 py-0.5 rounded tracking-wide transition-all"
            style={filter === tab.key
              ? { background: `${tab.color}16`, color: tab.color, border: `1px solid ${tab.color}30`, boxShadow: `0 0 8px ${tab.color}18` }
              : { background: "transparent", color: "#1a2a35", border: "1px solid transparent" }
            }>
            {tab.label}
          </button>
        ))}
        <span className="ml-auto text-[8px] font-mono" style={{ color: "#1a2a35" }}>
          {visible.length} events
        </span>
      </div>

      {/* Feed */}
      <div ref={scrollRef} className="feed-scroll flex-1" style={{ maxHeight: 560 }}>
        {visible.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-[11px] font-mono animate-pulse" style={{ color: "#1e3040" }}>
              AWAITING SIGNAL STREAM…
            </span>
          </div>
        ) : (
          visible.map((s, i) => {
            const color     = SYMBOL_COLOR[s.symbol] ?? "#4a8fa8";
            const sym       = s.symbol.replace("USD", "");
            const stage     = s._stage;
            const stageCfg  = CAT[stage] ?? CAT.SCANNING;
            const cat       = getCategory(stage);
            const catCfg    = CAT[cat] ?? CAT.SIGNAL;
            const isBuy     = s.decision === "BUY";
            const isSell    = s.decision === "SELL";
            const decColor  = isBuy ? "#00ff8a" : isSell ? "#ff3355" : "#2a4a60";
            const isFlash   = flashId === s.id;
            const isExec    = stage === "FILLED" || stage === "EXECUTION";
            const hasBlock  = !!(s.blockReason && s.blockReason !== "None");
            const confColor = s._liveConf >= 70 ? "#00ff8a" : s._liveConf >= 50 ? "#ffaa00" : "#ff3355";
            const ts        = new Date(s.timestamp).toLocaleTimeString("en-US", {
              hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
            });

            return (
              <div key={s.id}
                style={{
                  borderBottom: `1px solid #080808`,
                  borderLeft: `3px solid ${isExec ? stageCfg.color : stageCfg.color + "40"}`,
                  background: isFlash
                    ? `${color}0c`
                    : hasBlock ? "#ff335504"
                    : isExec ? "#00ff8a04"
                    : i === 0 ? "#030303" : "#000000",
                  transition: "background 0.5s",
                  animation: i === 0 ? "feed-row-in 0.3s ease-out" : undefined,
                }}>

                <div className="flex items-center gap-2 px-3 py-2">
                  {/* Category pill */}
                  <span className="text-[7px] font-bold font-mono px-1.5 py-0.5 rounded shrink-0"
                    style={{
                      color: catCfg.color, background: catCfg.bg,
                      border: `1px solid ${catCfg.border}`,
                      boxShadow: `0 0 6px ${catCfg.color}20`,
                      minWidth: 40, textAlign: "center",
                    }}>
                    {catCfg.label}
                  </span>

                  {/* Stage icon */}
                  <span className="text-[11px] shrink-0" style={{ color: stageCfg.color, filter: `drop-shadow(0 0 3px ${stageCfg.color})` }}>
                    {stageCfg.icon}
                  </span>

                  {/* Timestamp */}
                  <span className="text-[9px] font-mono tabular-nums shrink-0" style={{ color: "#1a2a35" }}>
                    {ts}
                  </span>

                  {/* Decision */}
                  <span className="text-[13px] font-bold font-mono shrink-0"
                    style={{ color: decColor, textShadow: s.decision !== "HOLD" ? `0 0 8px ${decColor}60` : undefined }}>
                    {s.decision}
                  </span>

                  {/* Symbol */}
                  <span className="text-[13px] font-bold font-mono shrink-0" style={{ color, textShadow: `0 0 6px ${color}40` }}>
                    {sym}
                  </span>

                  {/* Confidence */}
                  <span
                    className="text-[13px] font-bold font-mono tabular-nums shrink-0 transition-all duration-200"
                    style={{
                      color: s._pulse ? "#ffffff" : confColor,
                      textShadow: s._pulse ? `0 0 12px #ffffff` : `0 0 6px ${confColor}50`,
                    }}>
                    {s._liveConf.toFixed(0)}%
                  </span>

                  {/* Exchange label */}
                  <span className="text-[8px] font-mono shrink-0 px-1.5 py-0.5 rounded"
                    style={{ color: "#1a2a35", background: "#0a0a0a", border: "1px solid #111111" }}>
                    KRAKEN
                  </span>

                  {/* Summary / block reason */}
                  <span className="text-[8px] font-mono truncate flex-1"
                    style={{ color: hasBlock ? "#ff335550" : "#1a2a35" }}>
                    {hasBlock ? `⚠ ${s.blockReason}` : (s.shortSummary ?? "")}
                  </span>

                  {/* Stage badge */}
                  <span className="text-[7px] font-bold font-mono px-1.5 py-0.5 rounded shrink-0"
                    style={{
                      color: stageCfg.color,
                      background: stageCfg.bg,
                      border: `1px solid ${stageCfg.border}`,
                      boxShadow: isExec ? `0 0 8px ${stageCfg.color}30` : undefined,
                    }}>
                    {stage === "BLOCKED" ? "BLOCKED"
                      : stage === "FILLED" ? "FILLED"
                      : stage}
                  </span>
                </div>

                {/* Confidence progress bar */}
                <div style={{ paddingLeft: 52, paddingRight: 12, paddingBottom: 6 }}>
                  <div className="rounded-sm overflow-hidden" style={{ height: 3, background: "#080808" }}>
                    <div className="h-full rounded-sm"
                      style={{
                        width: `${Math.min(100, s._liveConf)}%`,
                        background: confColor,
                        boxShadow: `0 0 6px ${confColor}60`,
                        transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)",
                      }} />
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Terminal cursor */}
        <div className="flex items-center gap-2 px-4 py-2" style={{ borderLeft: "3px solid #080808" }}>
          <span className="text-[8px] font-mono" style={{ color: "#0d1522" }}>$</span>
          <span className="text-[8px] font-mono" style={{ color: "#0d1522" }}>
            {engine?.running
              ? `ENGINE RUNNING · NEXT CYCLE ${nextTick}s · SIG: ${engine.signalsGenerated ?? 0}`
              : "ENGINE IDLE · WAITING"}
          </span>
          <span className="cursor-blink ml-1" />
        </div>
      </div>
    </div>
  );
}
