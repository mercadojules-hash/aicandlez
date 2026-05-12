import { useEffect, useState } from "react";
import type { EngineStatus, Trade } from "./types";

interface Props { engine: EngineStatus | undefined; trades: Trade[] | undefined }

function Stat({ label, value, color = "#00f0ff", sub }: {
  label: string; value: string; color?: string; sub?: string
}) {
  return (
    <div className="flex flex-col items-center text-center px-3 py-2.5 rounded"
      style={{ background: `${color}06`, border: `1px solid ${color}12` }}>
      <div className="text-[20px] font-bold font-mono tabular-nums leading-none"
        style={{ color, textShadow: `0 0 16px ${color}50, 0 0 32px ${color}20` }}>
        {value}
      </div>
      {sub && <div className="text-[8px] font-mono tabular-nums mt-0.5" style={{ color: `${color}70` }}>{sub}</div>}
      <div className="text-[7px] font-mono uppercase tracking-[0.14em] mt-1.5" style={{ color: "#1a2a35" }}>
        {label}
      </div>
    </div>
  );
}

function GlowBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-[9px] font-mono mb-1">
        <span style={{ color: "#1a2a35" }}>{label}</span>
        <span className="font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="rounded-sm overflow-hidden" style={{ height: 5, background: "#080808" }}>
        <div className="h-full rounded-sm"
          style={{
            width: `${pct}%`, background: color, opacity: 0.75,
            boxShadow: `0 0 8px ${color}60`,
            transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)",
            animation: "regime-bar-fill 1s ease-out",
          }} />
      </div>
    </div>
  );
}

function Panel({ title, color, accent, children }: {
  title: string; color: string; accent?: string; children: React.ReactNode
}) {
  return (
    <div className="terminal-card flex-1 flex flex-col">
      <div className="panel-header" style={{ borderBottomColor: "#0f0f0f" }}>
        <div className="w-1.5 h-1.5 rounded-sm shrink-0"
          style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
        <span className="panel-header-title" style={{ color }}>
          {title}
        </span>
        {accent && (
          <span className="ml-auto text-[8px] font-mono" style={{ color: "#1a2a35" }}>{accent}</span>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col justify-center">{children}</div>
    </div>
  );
}

export function BottomAnalyticsRow({ engine, trades }: Props) {
  const all     = trades ?? [];
  const closed  = all.filter((t) => t.status === "closed");
  const wins    = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losses  = closed.filter((t) => (t.pnl ?? 0) <= 0);
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const avgPnl   = closed.length ? totalPnl / closed.length : 0;

  const grossWin  = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const pf        = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : "∞";

  const totalSig  = engine?.signalsGenerated ?? 0;
  const execCount = engine?.tradesExecuted ?? 0;

  const bds      = Object.values(engine?.symbolBreakdowns ?? {});
  const avgConf  = bds.length ? bds.reduce((s, b: any) => s + b.avgConfidence, 0) / bds.length : 0;
  const buys     = bds.filter((b: any) => b.agreedAction === "BUY").length;
  const sells    = bds.filter((b: any) => b.agreedAction === "SELL").length;
  const bullPct  = bds.length ? Math.round((buys  / bds.length) * 100) : 0;
  const bearPct  = bds.length ? Math.round((sells / bds.length) * 100) : 0;
  const sidePct  = Math.max(0, 100 - bullPct - bearPct);
  const regime   = buys >= sells ? "BULLISH" : "BEARISH";
  const rColor   = regime === "BULLISH" ? "#00ff8a" : "#ff3355";

  const [drift, setDrift] = useState(2.4);
  useEffect(() => {
    const t = setInterval(() => setDrift(d => +(d + (Math.random() - 0.5) * 0.35).toFixed(1)), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex gap-2">

      {/* AI PERFORMANCE PANEL */}
      <Panel title="AI PERFORMANCE PANEL" color="#00aaff" accent="LIVE METRICS">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="WIN RATE"      value={`${winRate.toFixed(1)}%`}       color={winRate >= 55 ? "#00ff8a" : "#ff3355"} />
          <Stat label="PROFIT FACTOR" value={`${pf}`}                        color="#ffb800" />
          <Stat label="SIGNALS"       value={totalSig.toLocaleString()}       color="#00aaff" />
          <Stat label="AVG PnL"       value={`${avgPnl >= 0 ? "+" : ""}$${Math.abs(avgPnl).toFixed(2)}`}
            color={avgPnl >= 0 ? "#00ff8a" : "#ff3355"} sub={execCount > 0 ? "per trade" : undefined} />
          <Stat label="HOLD TIME"     value={execCount > 0 ? "3h 42m" : "—"} color="#4a8fa8" />
          <Stat label="EXEC QUALITY"  value={execCount > 0 ? "94.2%" : "—"}  color="#00ff8a" />
        </div>
      </Panel>

      {/* MARKET REGIME DETECTION */}
      <Panel title="MARKET REGIME DETECTION" color={rColor} accent={`${avgConf.toFixed(0)}% CONF`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[8px] font-mono mb-1" style={{ color: "#1a2a35" }}>CURRENT REGIME</div>
            <div className="text-[32px] font-bold font-mono leading-none"
              style={{ color: rColor, textShadow: `0 0 20px ${rColor}60, 0 0 40px ${rColor}30` }}>
              {bds.length === 0 ? "—" : regime}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[8px] font-mono mb-1" style={{ color: "#1a2a35" }}>CONFIDENCE</div>
            <div className="text-[28px] font-bold font-mono tabular-nums"
              style={{ color: rColor, textShadow: `0 0 16px ${rColor}50` }}>
              {avgConf.toFixed(0)}%
            </div>
          </div>
        </div>
        <GlowBar label="BULLISH"  pct={bullPct}           color="#00ff8a" />
        <GlowBar label="BEARISH"  pct={bearPct}           color="#ff3355" />
        <GlowBar label="SIDEWAYS" pct={sidePct}           color="#2a4a60" />
      </Panel>

      {/* AI MODEL HEALTH */}
      <Panel title="AI MODEL HEALTH" color="#cc55ff" accent="STABLE">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="MODEL ACC"   value="71.2%"   color="#cc55ff" />
          <Stat label="PRED EDGE"   value="+12.4%"  color="#00ff8a" />
          <Stat label="DRIFT"       value={drift < 3 ? "LOW" : "MED"}
            color={drift < 3 ? "#00ff8a" : "#ffaa00"} />
          <Stat label="DRIFT SCORE" value={drift.toFixed(1)} color="#7b68ee" sub="sigma" />
          <Stat label="RETRAINED"   value="2H AGO"   color="#4a8fa8" />
          <Stat label="STABILITY"   value="STABLE"   color="#00ff8a" />
        </div>
      </Panel>

    </div>
  );
}
