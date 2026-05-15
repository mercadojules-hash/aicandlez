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

const TABS: { key: Category; label: string }[] = [
  { key: "ALL",    label: "ALL"    },
  { key: "SIGNAL", label: "SIGNAL" },
  { key: "TRADE",  label: "TRADE"  },
  { key: "ALERT",  label: "ALERT"  },
  { key: "AI",     label: "AI"     },
];

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

interface LiveRow extends SignalLogEntry { _conf: number; _stage: string; _ghost?: boolean }

/* ── Synthetic historical rows that fill dead space ─────────────────────────
   These are styled dimmer so real entries stay visually dominant.          */
const GHOST_SYMBOLS   = ["BTCUSD","ETHUSD","SOLUSD","XRPUSD","DOGEUSD","AVAXUSD","LINKUSD","ADAUSD"];
const GHOST_DECISIONS = ["BUY","SELL","HOLD","HOLD","BUY","SELL"];
const GHOST_REASONS   = [
  "EMA cross confirmed, RSI pullback",
  "Volume below threshold — blocked",
  "MTF divergence — scanning",
  "RSI neutral zone, EMA tight",
  "Momentum building, trend aligned",
  "Sideways filter active",
  "AI conviction building",
  "1H trend misaligned — monitoring",
  "Low volatility regime",
  "Confidence gate not met",
  "MACD zero-line crossover",
  "Spread compression detected",
  "High-confidence override triggered",
  "Correlation block — BTC/ETH exposure",
  "Bollinger band squeeze detected",
  "RSI divergence on 15m — caution",
  "EMA9 above EMA21 — bullish bias",
  "MTF confirmed on second pass",
  "Risk engine: daily loss limit check",
  "Volume surge: 2.4× avg — executing",
  "MACD histogram expanding — buy signal",
  "Trailing stop tightened 0.8%",
  "Max positions gate: 2 of 3 used",
  "Sentiment alignment: bullish +14%",
  "Session high retest — monitoring",
  "Order book pressure: buy side dominant",
  "AI regime: trending — filters relaxed",
  "Mean reversion signal: oversold",
  "Breakout detected: 4h resistance level",
  "Confidence rising: 48% → 63%",
  "Signal accepted: execution queue",
];

function makeGhosts(count: number, baseTime: number): LiveRow[] {
  const rows: LiveRow[] = [];
  for (let i = 0; i < count; i++) {
    const sym  = GHOST_SYMBOLS[i % GHOST_SYMBOLS.length];
    const dec  = GHOST_DECISIONS[i % GHOST_DECISIONS.length];
    const conf = 15 + Math.floor(Math.sin(i * 2.3 + 1) * 22 + Math.cos(i * 1.7) * 18 + 40);
    const clampedConf = Math.max(8, Math.min(88, conf));
    const stageKey =
      dec !== "HOLD" && clampedConf >= 72 ? "EXECUTION" :
      dec !== "HOLD" && clampedConf >= 60 ? "ROUTING"   :
      clampedConf >= 50                   ? "MONITORING" :
      clampedConf >= 35                   ? "VALIDATING" : "SCANNING";
    rows.push({
      id:           `ghost-${i}`,
      symbol:       sym,
      timeframe:    i % 2 === 0 ? "5m" : "15m",
      decision:     dec,
      confidence:   clampedConf,
      shortSummary: GHOST_REASONS[i % GHOST_REASONS.length],
      blockReason:  stageKey === "SCANNING" ? "Low conviction" : null,
      executedAs:   null,
      timestamp:    baseTime - (i + 1) * 47_000,
      _conf:        clampedConf,
      _stage:       stageKey,
      _ghost:       true,
    });
  }
  return rows;
}

export function RichTerminalFeed({ engine }: Props) {
  const raw = [...(engine?.recentSignalLog ?? [])].reverse().slice(0, 120);

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
    const real: LiveRow[] = raw.map(s => ({ ...s, _conf: s.confidence, _stage: getStage(s) }));
    /* Always render at least 80 rows — pad with ghost rows when real count < 80 */
    const ghostCount = Math.max(0, 80 - real.length);
    const ghosts     = makeGhosts(ghostCount, real[real.length - 1]?.timestamp ?? Date.now());
    const next       = [...real, ...ghosts];
    if (real.length > prevLen.current) {
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
    prevLen.current = real.length;
    setRows(next);
  }, [engine?.recentSignalLog?.length, engine?.lastTickAt]);

  /* Animate confidence values on live rows only */
  useEffect(() => {
    const id = setInterval(() => {
      setRows(prev => prev.map(r => r._ghost ? r : {
        ...r,
        _conf: Math.max(0, Math.min(100, r.confidence + (Math.random() - 0.46) * 4)),
      }));
    }, 1400);
    return () => clearInterval(id);
  }, []);

  const loopSec  = Math.round((engine?.loopIntervalMs ?? 60000) / 1000);
  const nextTick = loopSec - (tick % loopSec);
  const realCount = rows.filter(r => !r._ghost).length;
  const visible   = filter === "ALL"
    ? rows
    : rows.filter(r => stageToCategory(r._stage) === filter);

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
        <span className="ml-auto text-[8px] font-mono tabular-nums" style={{ color: "#4a6a80" }}>
          {realCount} LIVE
        </span>
      </div>

      {/* Feed scroll area — always full */}
      <div ref={scrollRef} className="feed-scroll"
        style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
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
            const isGhost   = s._ghost === true;

            const ts = new Date(s.timestamp).toLocaleTimeString("en-US", {
              hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
            });

            return (
              <div key={s.id}
                className="flex items-center gap-3 px-3 py-2"
                style={{
                  borderBottom: `1px solid ${isGhost ? "#090909" : "#111111"}`,
                  borderLeft:   `3px solid ${stageCfg.color}${isGhost ? "18" : isFilled ? "cc" : "55"}`,
                  background:   isGhost
                    ? "transparent"
                    : isBlocked ? "#ff33550f" : isFilled ? "#00ff8a0d" : i === 0 ? "#060909" : "transparent",
                  opacity:      isGhost ? 0.38 : 1,
                  animation:    (!isGhost && i === 0) ? "feed-row-in 0.25s ease-out" : undefined,
                  minHeight:    36,
                }}>

                <span className="font-bold font-mono px-2 rounded flex-shrink-0"
                  style={{
                    fontSize:   10,
                    color:      stageCfg.color,
                    background: `${stageCfg.color}12`,
                    border:     `1px solid ${stageCfg.color}28`,
                    minWidth:   46,
                    textAlign:  "center",
                    lineHeight: "22px",
                  }}>
                  {stageCfg.label}
                </span>
                <span className="font-mono tabular-nums flex-shrink-0 font-semibold"
                  style={{ fontSize: 11, color: isGhost ? "#3a5a70" : "#9FB3C8" }}>
                  {ts}
                </span>
                <span className="font-bold font-mono flex-shrink-0"
                  style={{
                    fontSize:   13,
                    color:      decColor,
                    textShadow: (!isGhost && s.decision !== "HOLD") ? `0 0 12px ${decColor}65` : undefined,
                    minWidth:   38,
                  }}>
                  {s.decision}
                </span>
                <span className="font-bold font-mono flex-shrink-0" style={{ fontSize: 13, color: symColor, minWidth: 36 }}>
                  {sym}
                </span>
                {/* Inline confidence bar */}
                <div style={{ width: 52, height: 6, background: "#0a0a0a", borderRadius: 3, flexShrink: 0, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width:  `${Math.min(100, s._conf)}%`,
                    background: isGhost ? "#1a2a35" : confColor,
                    borderRadius: 3,
                    transition:   "width 0.8s ease",
                    boxShadow:    isGhost ? "none" : `0 0 7px ${confColor}65`,
                  }} />
                </div>
                <span className="font-bold font-mono tabular-nums flex-shrink-0"
                  style={{ fontSize: 12, color: isGhost ? "#2a4a5a" : confColor, minWidth: 34 }}>
                  {s._conf.toFixed(0)}%
                </span>
                <span className="font-mono truncate flex-1"
                  style={{ fontSize: 10, color: isGhost ? "#1e3040" : isBlocked ? "#ff335585" : "#9FB3C8" }}>
                  {isBlocked ? `⚠ ${s.blockReason}` : (s.shortSummary ?? "")}
                </span>
              </div>
            );
          })}

          {/* Terminal cursor */}
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderLeft: "2px solid #0a0a0a" }}>
            <span className="text-[9px] font-mono font-semibold" style={{ color: "#C7D4E2" }}>$</span>
            <span className="text-[9px] font-mono" style={{ color: "#4a6a80" }}>
              {engine?.running
                ? `ENGINE RUNNING · NEXT TICK ${nextTick}s · SIGNALS: ${engine.signalsGenerated ?? 0}`
                : "ENGINE IDLE — AWAITING FIRST TICK"}
            </span>
            <span className="cursor-blink" />
          </div>
        </>
      </div>
    </div>
  );
}
