import { useEffect, useState } from "react";
import { Terminal, Zap } from "lucide-react";
import type { EngineStatus } from "./types";
import { SYMBOL_COLOR } from "./types";

interface Props { engine: EngineStatus | undefined }

const STAGE_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  FILLED:     { label: "✓ FILLED",    color: "#00ff8a", bg: "#00ff8a10", border: "#00ff8a35" },
  EXECUTING:  { label: "⚡ EXECUTING", color: "#ffb800", bg: "#ffb80010", border: "#ffb80040" },
  ROUTING:    { label: "→ ROUTING",   color: "#00f0ff", bg: "#00f0ff08", border: "#00f0ff30" },
  MONITORING: { label: "● MONITOR",   color: "#00f0ff", bg: "#00f0ff08", border: "#00f0ff28" },
  BLOCKED:    { label: "✗ BLOCKED",   color: "#ff2255", bg: "#ff225510", border: "#ff225535" },
  SCANNING:   { label: "◌ SCANNING",  color: "#c855f7", bg: "#c855f708", border: "#c855f728" },
  VALIDATING: { label: "⟳ VALIDATING",color: "#ffb800", bg: "#ffb80008", border: "#ffb80028" },
};

function getStage(sig: EngineStatus["recentSignalLog"][0]): string {
  if (sig.executedAs)                                  return "FILLED";
  if (sig.blockReason && sig.blockReason !== "None")   return "BLOCKED";
  if (sig.confidence >= 78)                            return "EXECUTING";
  if (sig.confidence >= 65)                            return "ROUTING";
  if (sig.confidence >= 55)                            return "MONITORING";
  if (sig.confidence >= 40)                            return "VALIDATING";
  return "SCANNING";
}

function emaLabel(conf: number): { text: string; color: string } {
  if (conf >= 68) return { text: "CONFIRMED",  color: "#00ff8a90" };
  if (conf >= 52) return { text: "DIVERGING",  color: "#ffb80090" };
  return              { text: "INVERTED",   color: "#ff225590" };
}

function rsiLabel(conf: number): { text: string; color: string } {
  if (conf > 80) return { text: "OVERBOUGHT", color: "#ff225590" };
  if (conf > 65) return { text: "BULLISH",    color: "#00ff8a90" };
  if (conf > 45) return { text: "NEUTRAL",    color: "#4a8fa890" };
  return              { text: "OVERSOLD",   color: "#00f0ff90" };
}

/* ── Blinking cursor ──────────────────────────────────────────────────────── */
function Cursor() {
  return <span className="cursor-blink" />;
}

/* ── Confidence strike bar ────────────────────────────────────────────────── */
function ConfidenceStrike({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="relative" style={{ height: 6 }}>
      <div className="absolute inset-0 rounded-sm" style={{ background: "#ffffff06" }} />
      <div
        className="absolute left-0 top-0 bottom-0 rounded-sm"
        style={{
          width: `${Math.min(100, pct)}%`,
          background: `linear-gradient(90deg, ${color}60, ${color})`,
          boxShadow: `0 0 12px ${color}80, 0 0 24px ${color}40`,
          animation: "conf-fill 1s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
      {/* Strike marker */}
      <div
        className="absolute top-0 bottom-0 w-[2px]"
        style={{
          left: `${Math.min(99, pct)}%`,
          background: color,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
    </div>
  );
}

export function RichTerminalFeed({ engine }: Props) {
  const log     = [...(engine?.recentSignalLog ?? [])].reverse().slice(0, 12);
  const [tick, setTick] = useState(0);

  /* subtle refresh pulse every 8s */
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="terminal-card rounded-lg overflow-hidden">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ borderBottomColor: "#0D2235", background: "linear-gradient(90deg, #040F1C, #020A14)" }}
      >
        <Terminal className="w-4 h-4" style={{ color: "#00f0ff", filter: "drop-shadow(0 0 6px #00f0ff)" }} />
        <span
          className="text-[12px] font-bold tracking-[0.2em] uppercase"
          style={{ color: "#00f0ff", textShadow: "0 0 12px #00f0ff80" }}
        >
          LIVE TERMINAL FEED
        </span>

        <div className="ml-auto flex items-center gap-3">
          {engine?.running ? (
            <>
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              <span className="text-[10px] font-mono" style={{ color: "#00ff8a90" }}>
                STREAMING · {log.length} EVENTS
              </span>
            </>
          ) : (
            <span className="text-[10px] font-mono text-[#1e4060]">IDLE</span>
          )}
        </div>
      </div>

      {/* ── Feed ─────────────────────────────────────────────────────── */}
      <div className="p-3 space-y-2 font-mono" style={{ minHeight: 320 }}>
        {log.length === 0 ? (
          <div className="flex items-center justify-center" style={{ minHeight: 200 }}>
            <div className="text-center">
              <div className="text-[13px] text-[#1a3850] font-mono mb-2">
                $ AWAITING SIGNAL STREAM
                <Cursor />
              </div>
              <div className="text-[10px] text-[#0E2235] font-mono animate-pulse">
                ENGINE INITIALIZING…
              </div>
            </div>
          </div>
        ) : (
          log.map((s, i) => {
            const color    = SYMBOL_COLOR[s.symbol] ?? "#4a8fa8";
            const sym      = s.symbol.replace("USD", "");
            const stage    = getStage(s);
            const stageCfg = STAGE_CFG[stage] ?? STAGE_CFG.SCANNING;
            const ts       = new Date(s.timestamp).toLocaleTimeString("en-US", {
              hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
            });
            const ema    = emaLabel(s.confidence);
            const rsi    = rsiLabel(s.confidence);
            const confPc = Math.min(100, s.confidence);
            const barClr = s.decision === "BUY" ? "#00ff8a" : s.decision === "SELL" ? "#ff2255" : "#4a8fa8";
            const isExec = stage === "FILLED" || stage === "EXECUTING";

            return (
              <div
                key={s.id + i + tick}
                className="rounded-md border overflow-hidden"
                style={{
                  background: isExec
                    ? `linear-gradient(135deg, ${color}05 0%, #020A14 100%)`
                    : "linear-gradient(135deg, #030D1C 0%, #020910 100%)",
                  borderColor: stageCfg.border,
                  boxShadow: isExec ? `0 0 16px ${color}10` : "none",
                  animation: `slide-in-left 0.25s ease ${i * 0.03}s both`,
                }}
              >
                {/* Row 1: stage + symbol + decision + time */}
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <span
                    className={`text-[9px] font-bold tracking-[0.12em] px-2 py-1 rounded shrink-0 ${isExec ? "exec-badge" : ""}`}
                    style={{
                      color: stageCfg.color,
                      background: stageCfg.bg,
                      border: `1px solid ${stageCfg.border}`,
                      textShadow: `0 0 8px ${stageCfg.color}60`,
                      minWidth: 90,
                      textAlign: "center",
                    }}
                  >
                    {stageCfg.label}
                  </span>

                  <div className="flex items-center gap-1.5 flex-1">
                    <span
                      className="text-[13px] font-bold"
                      style={{ color, textShadow: `0 0 8px ${color}60` }}
                    >
                      {sym}
                    </span>
                    <span className="text-[10px] text-[#1a3850]">/USD</span>
                    <span
                      className="text-[13px] font-bold ml-1"
                      style={{
                        color: s.decision === "BUY" ? "#00ff8a" : s.decision === "SELL" ? "#ff2255" : "#2a5a70",
                        textShadow: s.decision !== "HOLD" ? `0 0 8px ${barClr}70` : "none",
                      }}
                    >
                      {s.decision}
                    </span>
                  </div>

                  {isExec && <Zap className="w-3.5 h-3.5 shrink-0" style={{ color: stageCfg.color }} />}
                  <span className="text-[10px] font-mono text-[#1e4060] shrink-0">{ts}</span>
                </div>

                {/* Row 2: confidence strike bar */}
                <div className="px-3 pb-2">
                  <div className="flex items-center justify-between text-[9px] text-[#1a3850] mb-1">
                    <span className="tracking-[0.1em]">CONFIDENCE LEVEL</span>
                    <span
                      className="font-bold text-[11px]"
                      style={{ color: barClr, textShadow: `0 0 8px ${barClr}60` }}
                    >
                      {s.confidence.toFixed(1)}%
                    </span>
                  </div>
                  <ConfidenceStrike pct={confPc} color={barClr} />
                </div>

                {/* Row 3: metrics grid */}
                <div
                  className="grid grid-cols-4 gap-px border-t"
                  style={{ borderTopColor: "#0A1E30" }}
                >
                  {[
                    { label: "EMA ALIGN",   value: ema.text,  color: ema.color },
                    { label: "RSI STATE",   value: rsi.text,  color: rsi.color },
                    { label: "ROUTING",     value: s.executedAs ? "BINANCE" : "PENDING", color: "#00f0ff60" },
                    {
                      label: "EXEC STATUS",
                      value: s.executedAs  ? `${s.executedAs} FILLED` :
                             (s.blockReason && s.blockReason !== "None") ? "BLOCKED" : "PENDING",
                      color: s.executedAs ? "#00ff8a90" :
                             (s.blockReason && s.blockReason !== "None") ? "#ff225590" : "#4a8fa890",
                    },
                  ].map(({ label, value, color: c }) => (
                    <div
                      key={label}
                      className="px-3 py-2"
                      style={{ background: "#010812" }}
                    >
                      <div className="text-[8px] text-[#1a3850] uppercase tracking-[0.12em] mb-0.5">{label}</div>
                      <div className="text-[10px] font-bold" style={{ color: c }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Block reason */}
                {s.blockReason && s.blockReason !== "None" && (
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 border-t text-[9px]"
                    style={{ borderTopColor: "#0A1E30", color: "#ff225560", background: "#ff225504" }}
                  >
                    <span>⚠</span>
                    <span className="truncate">{s.blockReason}</span>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Terminal cursor line */}
        {engine?.running && (
          <div className="flex items-center gap-2 px-2 py-1">
            <span className="text-[10px] font-mono" style={{ color: "#00f0ff40" }}>
              $ AI_ENGINE LOOP ACTIVE · NEXT TICK IN ~10s
            </span>
            <Cursor />
          </div>
        )}
      </div>
    </div>
  );
}
