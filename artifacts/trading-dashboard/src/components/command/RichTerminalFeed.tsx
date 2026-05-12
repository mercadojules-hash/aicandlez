import { useEffect, useRef, useState } from "react";
import type { EngineStatus, SignalLogEntry } from "./types";
import { SYMBOL_COLOR } from "./types";
import { ago } from "./helpers";

interface Props { engine: EngineStatus | undefined }

type Category = "ALL" | "SIGNAL" | "TRADE" | "ALERT" | "SYSTEM" | "AI" | "USER";

const CAT_CFG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  SIGNAL:    { label: "SIGNAL",    color: "#cc55ff", bg: "#cc55ff0d", icon: "◈" },
  TRADE:     { label: "TRADE",     color: "#00ff8a", bg: "#00ff8a0d", icon: "⟳" },
  EXECUTION: { label: "TRADE",     color: "#00ff8a", bg: "#00ff8a0d", icon: "✓" },
  ALERT:     { label: "ALERT",     color: "#ffaa00", bg: "#ffaa000d", icon: "⚠" },
  SYSTEM:    { label: "SYSTEM",    color: "#00aaff", bg: "#00aaff0d", icon: "◉" },
  AI:        { label: "AI",        color: "#00f0ff", bg: "#00f0ff0d", icon: "◆" },
  USER:      { label: "USER",      color: "#4a8fa8", bg: "#4a8fa80d", icon: "◎" },
  BLOCKED:   { label: "ALERT",     color: "#ff3355", bg: "#ff33550d", icon: "✗" },
  SCANNING:  { label: "SIGNAL",    color: "#7b68ee", bg: "#7b68ee0d", icon: "⟳" },
  VALIDATING:{ label: "SIGNAL",    color: "#ffaa00", bg: "#ffaa000d", icon: "⟳" },
  ROUTING:   { label: "TRADE",     color: "#00ccff", bg: "#00ccff0a", icon: "⟳" },
  MONITORING:{ label: "AI",        color: "#0099ff", bg: "#0099ff0a", icon: "◉" },
  FILLED:    { label: "TRADE",     color: "#00ff8a", bg: "#00ff8a0d", icon: "✓" },
};

function getStage(sig: SignalLogEntry) {
  if (sig.executedAs)                                   return "FILLED";
  if (sig.blockReason && sig.blockReason !== "None")    return "BLOCKED";
  if (sig.confidence >= 78)                             return "EXECUTION";
  if (sig.confidence >= 65)                             return "ROUTING";
  if (sig.confidence >= 55)                             return "MONITORING";
  if (sig.confidence >= 40)                             return "VALIDATING";
  return "SCANNING";
}

function getCategory(stage: string): Category {
  if (stage === "FILLED" || stage === "EXECUTION") return "TRADE";
  if (stage === "BLOCKED")                          return "ALERT";
  if (stage === "ROUTING" || stage === "MONITORING")return "AI";
  return "SIGNAL";
}

interface LiveRow extends SignalLogEntry { _liveConf: number; _pulse: boolean; _stage: string }

const FILTER_TABS: Category[] = ["ALL", "SIGNAL", "TRADE", "ALERT", "SYSTEM", "AI"];

export function RichTerminalFeed({ engine }: Props) {
  const rawLog = [...(engine?.recentSignalLog ?? [])].reverse().slice(0, 50);

  const [rows,    setRows]  = useState<LiveRow[]>([]);
  const [flashId, setFlash] = useState<string | null>(null);
  const [filter,  setFilter]= useState<Category>("ALL");
  const prevLen             = useRef(0);
  const scrollRef           = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next: LiveRow[] = rawLog.map((s) => ({
      ...s, _liveConf: s.confidence, _pulse: false, _stage: getStage(s),
    }));
    if (next.length > prevLen.current && next[0]) {
      setFlash(next[0].id);
      setTimeout(() => setFlash(null), 700);
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
    prevLen.current = next.length;
    setRows(next);
  }, [engine?.recentSignalLog?.length, engine?.lastTickAt]);

  useEffect(() => {
    const id = setInterval(() => {
      setRows((prev) => prev.map((r) => {
        const delta = (Math.random() - 0.46) * 4;
        return { ...r, _liveConf: Math.max(0, Math.min(100, r.confidence + delta)), _pulse: Math.abs(delta) > 2 };
      }));
      setTimeout(() => setRows((p) => p.map((r) => ({ ...r, _pulse: false }))), 300);
    }, 1200);
    return () => clearInterval(id);
  }, []);

  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(id); }, []);

  const loopSec = Math.round((engine?.loopIntervalMs ?? 60000) / 1000);
  const nextTick = loopSec - (tick % loopSec);

  const exName = engine ? "KRAKEN" : "—";

  const visible = filter === "ALL"
    ? rows
    : rows.filter((r) => getCategory(r._stage) === filter);

  return (
    <div className="rounded-lg overflow-hidden flex flex-col"
      style={{ background: "#000000", border: "1px solid #1c1c1c" }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0"
        style={{ borderBottomColor: "#141414", background: "#000000" }}>
        <span className="text-[10px] font-bold tracking-[0.22em] font-mono" style={{ color: "#00aaff" }}>
          LIVE TERMINAL FEED
        </span>
        <span className="text-[8px] font-mono tracking-[0.1em]" style={{ color: "#1e3040" }}>
          REAL-TIME SIGNAL STREAM
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[8px] font-mono tabular-nums"
            style={{ color: nextTick <= 5 ? "#ffaa00" : "#1e3040" }}>
            NEXT TICK {nextTick}s
          </span>
          {engine?.lastSignalAt && (
            <span className="text-[8px] font-mono" style={{ color: "#1e3040" }}>{ago(engine.lastSignalAt)}</span>
          )}
          {engine?.running ? (
            <span className="flex items-center gap-1.5">
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              <span className="text-[9px] font-mono font-bold" style={{ color: "#00ff8a" }}>LIVE</span>
            </span>
          ) : (
            <span className="text-[9px] font-mono" style={{ color: "#1e3040" }}>IDLE</span>
          )}
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b"
        style={{ borderBottomColor: "#0d0d0d", background: "#000000" }}>
        {FILTER_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className="text-[8px] font-bold font-mono px-2 py-0.5 rounded tracking-wide transition-all"
            style={filter === tab
              ? { background: "#00aaff14", color: "#00aaff", border: "1px solid #00aaff28" }
              : { background: "transparent", color: "#1e3040",  border: "1px solid transparent" }
            }
          >
            {tab}
          </button>
        ))}
        <span className="ml-auto text-[8px] font-mono" style={{ color: "#1e3040" }}>
          {visible.length} events
        </span>
      </div>

      {/* Scrollable feed */}
      <div ref={scrollRef} className="feed-scroll" style={{ maxHeight: 560 }}>
        {visible.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <span className="text-[11px] font-mono animate-pulse" style={{ color: "#1e3040" }}>
              AWAITING SIGNAL STREAM…
            </span>
          </div>
        ) : (
          visible.map((s, i) => {
            const color    = SYMBOL_COLOR[s.symbol] ?? "#4a8fa8";
            const sym      = s.symbol.replace("USD", "");
            const stage    = s._stage;
            const stageCfg = CAT_CFG[stage] ?? CAT_CFG.SCANNING;
            const cat      = getCategory(stage);
            const catCfg   = CAT_CFG[cat] ?? CAT_CFG.SIGNAL;
            const ts       = new Date(s.timestamp).toLocaleTimeString("en-US", {
              hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
            });
            const isBuy    = s.decision === "BUY";
            const isSell   = s.decision === "SELL";
            const decColor = isBuy ? "#00ff8a" : isSell ? "#ff3355" : "#1e3040";
            const isFlash  = flashId === s.id;
            const isNew    = i === 0;
            const isExec   = stage === "FILLED" || stage === "EXECUTION";
            const hasBlock = !!(s.blockReason && s.blockReason !== "None");
            const confColor = s._liveConf >= 70 ? "#00ff8a" : s._liveConf >= 50 ? "#ffaa00" : decColor;

            return (
              <div key={s.id} className="border-b"
                style={{
                  borderBottomColor: "#080808",
                  background: isFlash ? `${color}0a` : isNew ? "#020202" : "#000000",
                  borderLeft: `2.5px solid ${isExec ? stageCfg.color : stageCfg.color + "30"}`,
                  transition: "background 0.4s",
                }}>

                {/* Main row */}
                <div className="flex items-center gap-2 px-3 py-1.5">
                  {/* Category badge */}
                  <span className="text-[7px] font-bold font-mono px-1.5 py-0.5 rounded shrink-0"
                    style={{ color: catCfg.color, background: catCfg.bg, border: `1px solid ${catCfg.color}20` }}>
                    {catCfg.label}
                  </span>

                  {/* Stage icon */}
                  <span style={{ color: stageCfg.color, fontSize: 10, width: 10, flexShrink: 0 }}>
                    {stageCfg.icon}
                  </span>

                  {/* Timestamp */}
                  <span className="text-[8px] font-mono tabular-nums shrink-0" style={{ color: "#1e3040" }}>
                    {ts}
                  </span>

                  {/* Decision + symbol */}
                  <span className="text-[12px] font-bold font-mono shrink-0" style={{ color: decColor }}>
                    {s.decision}
                  </span>
                  <span className="text-[12px] font-bold font-mono shrink-0" style={{ color }}>
                    {sym}
                  </span>

                  {/* Confidence */}
                  <span className="text-[12px] font-bold font-mono tabular-nums shrink-0 transition-colors duration-200"
                    style={{ color: s._pulse ? "#ffffff" : confColor }}>
                    {s._liveConf.toFixed(0)}%
                  </span>

                  {/* Exchange */}
                  <span className="text-[8px] font-mono shrink-0" style={{ color: "#1e3040" }}>
                    {exName}
                  </span>

                  {/* Summary / block reason */}
                  <span className="text-[8px] font-mono truncate flex-1"
                    style={{ color: hasBlock ? "#ff335565" : "#1a2a35" }}>
                    {hasBlock ? `⚠ ${s.blockReason}` : (s.shortSummary ?? "")}
                  </span>

                  {/* Stage badge */}
                  <span className="text-[8px] font-bold font-mono px-1.5 py-0.5 rounded shrink-0"
                    style={{ color: stageCfg.color, background: stageCfg.bg, border: `1px solid ${stageCfg.color}20` }}>
                    {stage === "BLOCKED" ? "BLOCKED" : stage === "FILLED" ? "FILLED" : stage}
                  </span>
                </div>

                {/* Confidence bar */}
                <div className="flex items-center gap-2 pb-1.5" style={{ paddingLeft: 44, paddingRight: 12 }}>
                  <div className="rounded-sm overflow-hidden shrink-0" style={{ width: 72, height: 2, background: "#0a0a0a" }}>
                    <div className="h-full rounded-sm"
                      style={{ width: `${Math.min(100, s._liveConf)}%`, background: confColor, opacity: 0.6, transition: "width 0.6s" }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Terminal cursor */}
        <div className="flex items-center gap-2 px-4 py-2" style={{ borderLeft: "2.5px solid #080808" }}>
          <span className="text-[9px] font-mono" style={{ color: "#0d1a22" }}>$</span>
          <span className="text-[9px] font-mono" style={{ color: "#0d1a22" }}>
            {engine?.running
              ? `ENGINE RUNNING · NEXT CYCLE ${nextTick}s · SIGNALS: ${engine.signalsGenerated ?? 0}`
              : "ENGINE IDLE"}
          </span>
          <span className="cursor-blink ml-1" />
        </div>
      </div>
    </div>
  );
}
