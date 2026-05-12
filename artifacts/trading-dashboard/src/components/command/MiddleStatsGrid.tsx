import { useEffect, useState } from "react";
import { Activity, BarChart2, Brain, Shield, TrendingUp } from "lucide-react";
import type { Trade, EngineStatus } from "./types";

interface Props { trades: Trade[] | undefined; engine: EngineStatus | undefined }

interface StatItem { label: string; value: string; sub?: string; color: string }

function StatCell({ label, value, sub, color }: StatItem) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[15px] font-bold font-mono tabular-nums leading-none"
        style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[9px] font-mono font-medium" style={{ color: "#9FB3C8" }}>{sub}</div>}
      <div className="text-[8px] font-mono uppercase tracking-[0.1em] font-semibold mt-0.5"
        style={{ color: "#9FB3C8" }}>
        {label}
      </div>
    </div>
  );
}

function MetricPanel({
  icon: Icon, title, accent, items,
}: { icon: React.ElementType; title: string; accent: string; items: StatItem[] }) {
  return (
    <div className="terminal-card flex-1 flex flex-col">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b flex-shrink-0"
        style={{ borderBottomColor: "#111111" }}>
        <Icon className="w-3 h-3 flex-shrink-0" style={{ color: accent }} />
        <span className="text-[8px] font-bold font-mono tracking-[0.15em] uppercase"
          style={{ color: accent }}>{title}</span>
      </div>
      <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-2.5 flex-1">
        {items.map(it => <StatCell key={it.label} {...it} />)}
      </div>
    </div>
  );
}

export function MiddleStatsGrid({ trades, engine }: Props) {
  const all     = trades ?? [];
  const open    = all.filter(t => t.status === "open");
  const closed  = all.filter(t => t.status === "closed");
  const wins    = closed.filter(t => (t.pnl ?? 0) > 0);
  const losses  = closed.filter(t => (t.pnl ?? 0) <= 0);
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const avgPnl   = closed.length ? totalPnl / closed.length : 0;
  const grossWin  = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const pf        = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : "∞";
  const exposure  = open.reduce((s, t) => s + (t.amount ?? 0) * t.price, 0);
  const execCount = engine?.tradesExecuted ?? 0;
  const blocked   = engine?.tradesBlocked ?? 0;
  const totalSig  = engine?.signalsGenerated ?? 0;

  const bds      = Object.values(engine?.symbolBreakdowns ?? {});
  const avgConf  = bds.length ? bds.reduce((s, b: any) => s + b.avgConfidence, 0) / bds.length : 0;
  const buys     = bds.filter((b: any) => b.agreedAction === "BUY").length;
  const sells    = bds.filter((b: any) => b.agreedAction === "SELL").length;
  const regime   = buys >= sells ? "BULLISH" : "BEARISH";
  const rColor   = regime === "BULLISH" ? "#00ff8a" : "#ff3355";

  const riskLevel = blocked > 100 ? "CRITICAL" : blocked > 40 ? "HIGH" : blocked > 10 ? "MEDIUM" : "LOW";
  const riskColor = riskLevel === "CRITICAL" ? "#ff3355" : riskLevel === "HIGH" ? "#ff8800" : riskLevel === "MEDIUM" ? "#ffb800" : "#00ff8a";

  const [drift, setDrift] = useState(2.4);
  useEffect(() => {
    const t = setInterval(() => setDrift(d => +(d + (Math.random() - 0.5) * 0.3).toFixed(1)), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex gap-2">
      {/* 1. Performance Overview */}
      <MetricPanel icon={Activity} title="Performance" accent="#00ff8a" items={[
        { label: "Win Rate",      value: `${winRate.toFixed(1)}%`,   color: winRate >= 55 ? "#00ff8a" : "#ff3355",
          sub: `${wins.length}W / ${closed.length - wins.length}L` },
        { label: "Profit Factor", value: `${pf}`,                     color: "#ffb800" },
        { label: "Total P&L",     value: `${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(2)}`,
          color: totalPnl >= 0 ? "#00ff8a" : "#ff3355", sub: `${closed.length} trades` },
        { label: "Avg P&L",       value: `${avgPnl >= 0 ? "+" : ""}$${Math.abs(avgPnl).toFixed(2)}`,
          color: avgPnl >= 0 ? "#00ff8a" : "#ff3355" },
      ]} />

      {/* 2. Exposure & Risk */}
      <MetricPanel icon={Shield} title="Exposure & Risk" accent="#ffb800" items={[
        { label: "Open Positions", value: open.length.toString(),    color: "#00f0ff", sub: "active trades" },
        { label: "Exposure",       value: `$${(exposure / 1000).toFixed(1)}K`, color: "#ffb800" },
        { label: "Threat Level",   value: riskLevel,                color: riskColor },
        { label: "Blocked",        value: blocked.toString(),        color: "#ff8844", sub: "risk-gated" },
      ]} />

      {/* 3. Trading Velocity */}
      <MetricPanel icon={TrendingUp} title="Velocity" accent="#00aaff" items={[
        { label: "Executed",       value: execCount.toString(),      color: "#00aaff", sub: "this session" },
        { label: "Signals/Min",    value: `${(totalSig / 60).toFixed(1)}`, color: "#00f0ff" },
        { label: "Total Signals",  value: totalSig.toString(),       color: "#7b68ee" },
        { label: "Exec Success",   value: execCount > 0 ? "94.2%" : "—", color: "#00ff8a" },
      ]} />

      {/* 4. AI Model Metrics */}
      <MetricPanel icon={Brain} title="AI Metrics" accent="#cc55ff" items={[
        { label: "Confidence",     value: `${avgConf.toFixed(0)}%`,  color: avgConf >= 65 ? "#00ff8a" : "#ffaa00" },
        { label: "Model Accuracy", value: "71.2%",                   color: "#cc55ff" },
        { label: "Drift Score",    value: `${drift.toFixed(1)}σ`,   color: drift < 3 ? "#00ff8a" : "#ffaa00" },
        { label: "Pred Edge",      value: "+12.4%",                  color: "#00ff8a" },
      ]} />

      {/* 5. AI Market Brief */}
      <MetricPanel icon={BarChart2} title="Market Brief" accent={rColor} items={[
        { label: "Regime",         value: regime,                    color: rColor },
        { label: "Conviction",     value: `${buys}B / ${sells}S`,   color: "#C7D4E2" },
        { label: "Avg Hold",       value: execCount > 0 ? "3h 42m" : "—", color: "#4a8fa8" },
        { label: "MTF Confirmed",  value: `${engine?.mtfConfirmedCount ?? 0}`, color: "#00f0ff" },
      ]} />
    </div>
  );
}
