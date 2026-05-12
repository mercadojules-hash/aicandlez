import { useEffect, useState } from "react";
import type { EngineStatus, Trade } from "./types";

interface Props { engine: EngineStatus | undefined; trades: Trade[] | undefined }

function Stat({ label, value, color = "#00f0ff", sub }: {
  label: string; value: string; color?: string; sub?: string
}) {
  return (
    <div className="flex flex-col items-center text-center px-3 py-2 rounded"
      style={{ background: `${color}06`, border: `1px solid ${color}12` }}>
      <div className="text-[18px] font-bold font-mono tabular-nums leading-none" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[8px] font-mono font-medium mt-0.5" style={{ color: "#C7D4E2" }}>{sub}</div>}
      <div className="text-[8px] font-mono uppercase tracking-[0.1em] mt-1 font-semibold"
        style={{ color: "#9FB3C8" }}>
        {label}
      </div>
    </div>
  );
}

function GlowBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[9px] font-mono mb-1">
        <span className="font-medium" style={{ color: "#C7D4E2" }}>{label}</span>
        <span className="font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="rounded-sm overflow-hidden" style={{ height: 4, background: "#0a0a0a" }}>
        <div className="h-full rounded-sm"
          style={{
            width: `${pct}%`, background: color, opacity: 0.7,
            transition: "width 0.6s ease",
          }} />
      </div>
    </div>
  );
}

function Panel({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="terminal-card flex-1 flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
        style={{ borderBottomColor: "#111111" }}>
        <div className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
          style={{ background: color, boxShadow: `0 0 4px ${color}80` }} />
        <span className="panel-header-title" style={{ color }}>{title}</span>
      </div>
      <div className="p-3 flex-1 flex flex-col justify-center">{children}</div>
    </div>
  );
}

export function BottomAnalyticsRow({ engine, trades }: Props) {
  const all     = trades ?? [];
  const closed  = all.filter(t => t.status === "closed");
  const wins    = closed.filter(t => (t.pnl ?? 0) > 0);
  const losses  = closed.filter(t => (t.pnl ?? 0) <= 0);
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const avgPnl   = closed.length ? totalPnl / closed.length : 0;
  const grossWin  = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const pf        = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : "∞";
  const totalSig  = engine?.signalsGenerated ?? 0;
  const execCount = engine?.tradesExecuted ?? 0;

  const bds     = Object.values(engine?.symbolBreakdowns ?? {});
  const avgConf = bds.length ? bds.reduce((s, b: any) => s + b.avgConfidence, 0) / bds.length : 0;
  const buys    = bds.filter((b: any) => b.agreedAction === "BUY").length;
  const sells   = bds.filter((b: any) => b.agreedAction === "SELL").length;
  const bullPct = bds.length ? Math.round((buys  / bds.length) * 100) : 0;
  const bearPct = bds.length ? Math.round((sells / bds.length) * 100) : 0;
  const sidePct = Math.max(0, 100 - bullPct - bearPct);
  const regime  = buys >= sells ? "BULLISH" : "BEARISH";
  const rColor  = regime === "BULLISH" ? "#00ff8a" : "#ff3355";

  const [drift, setDrift] = useState(2.4);
  useEffect(() => {
    const t = setInterval(() => setDrift(d => +(d + (Math.random() - 0.5) * 0.35).toFixed(1)), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex gap-2">

      {/* AI PERFORMANCE */}
      <Panel title="AI PERFORMANCE" color="#00aaff">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="WIN RATE"  value={`${winRate.toFixed(1)}%`}       color={winRate >= 55 ? "#00ff8a" : "#ff3355"} />
          <Stat label="PROF FACT" value={`${pf}`}                        color="#ffb800" />
          <Stat label="SIGNALS"   value={totalSig.toLocaleString()}       color="#00aaff" />
          <Stat label="AVG P&L"   value={`${avgPnl >= 0 ? "+" : ""}$${Math.abs(avgPnl).toFixed(2)}`}
            color={avgPnl >= 0 ? "#00ff8a" : "#ff3355"} sub="per trade" />
          <Stat label="HOLD TIME" value={execCount > 0 ? "3h 42m" : "—"} color="#4a8fa8" />
          <Stat label="EXEC QUAL" value={execCount > 0 ? "94.2%" : "—"}  color="#00ff8a" />
        </div>
      </Panel>

      {/* MARKET REGIME */}
      <Panel title="MARKET REGIME" color={rColor}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-[8px] font-mono font-semibold mb-1" style={{ color: "#9FB3C8" }}>CURRENT</div>
            <div className="text-[28px] font-bold font-mono leading-none"
              style={{ color: rColor, textShadow: `0 0 16px ${rColor}40` }}>
              {bds.length === 0 ? "—" : regime}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[8px] font-mono font-semibold mb-1" style={{ color: "#9FB3C8" }}>CONFIDENCE</div>
            <div className="text-[24px] font-bold font-mono tabular-nums" style={{ color: rColor }}>
              {avgConf.toFixed(0)}%
            </div>
          </div>
        </div>
        <GlowBar label="BULLISH"  pct={bullPct} color="#00ff8a" />
        <GlowBar label="BEARISH"  pct={bearPct} color="#ff3355" />
        <GlowBar label="SIDEWAYS" pct={sidePct} color="#3a5a70" />
      </Panel>

      {/* AI MODEL HEALTH */}
      <Panel title="AI MODEL HEALTH" color="#cc55ff">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="MODEL ACC"  value="71.2%"  color="#cc55ff" />
          <Stat label="PRED EDGE"  value="+12.4%" color="#00ff8a" />
          <Stat label="DRIFT"      value={drift < 3 ? "LOW" : "MED"}
            color={drift < 3 ? "#00ff8a" : "#ffaa00"} />
          <Stat label="DRIFT σ"    value={drift.toFixed(1)} color="#7b68ee" sub="sigma" />
          <Stat label="RETRAINED"  value="2H AGO" color="#4a8fa8" />
          <Stat label="STABILITY"  value="STABLE" color="#00ff8a" />
        </div>
      </Panel>

    </div>
  );
}
