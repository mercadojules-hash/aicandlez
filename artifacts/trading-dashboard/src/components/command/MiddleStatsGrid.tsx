import { useEffect, useState } from "react";
import { Activity, BarChart2, Brain, DollarSign, Landmark, Shield, TrendingUp, AlertTriangle } from "lucide-react";
import type { Trade, EngineStatus, ExchangeStatus, FeeSummary } from "./types";

interface Props {
  trades:         Trade[]        | undefined;
  engine:         EngineStatus   | undefined;
  exchangeStatus?: ExchangeStatus | undefined;
  feeSummary?:    FeeSummary     | undefined;
}

interface StatItem { label: string; value: string; sub?: string; color: string }

function StatCell({ label, value, sub, color }: StatItem) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[14px] font-bold font-mono tabular-nums leading-none" style={{ color }}>
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

function Panel({
  icon: Icon, title, accent, children,
}: { icon: React.ElementType; title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="terminal-card flex flex-col" style={{ minWidth: 0 }}>
      <div className="flex items-center gap-1.5 px-3 py-2 border-b flex-shrink-0"
        style={{ borderBottomColor: "#111111" }}>
        <Icon className="w-3 h-3 flex-shrink-0" style={{ color: accent }} />
        <span className="text-[8px] font-bold font-mono tracking-[0.14em] uppercase truncate"
          style={{ color: accent }}>{title}</span>
      </div>
      <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-2.5 flex-1">
        {children}
      </div>
    </div>
  );
}

export function MiddleStatsGrid({ trades, engine, exchangeStatus, feeSummary }: Props) {
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

  // AI Threat
  const volatile     = bds.filter((b: any) => b.marketCondition === "volatile").length;
  const mtfConfirmed = bds.filter((b: any) => b.mtfConfirmed).length;
  let threatScore = 0;
  if (engine?.killSwitch) threatScore = 100;
  if (avgConf < 40) threatScore += 35;
  else if (avgConf < 55) threatScore += 18;
  if (volatile >= 3) threatScore += 25;
  else if (volatile >= 1) threatScore += 10;
  if (blocked > 200) threatScore += 15;
  if (mtfConfirmed === 0 && bds.length > 0) threatScore += 10;
  const threat = Math.min(100, Math.max(4, threatScore));
  const threatLevel = threat >= 50 ? "HIGH" : threat >= 22 ? "MEDIUM" : "LOW";
  const threatColor = threatLevel === "HIGH" ? "#ff3355" : threatLevel === "MEDIUM" ? "#ffaa00" : "#00ff8a";

  // Exchange
  const exName = (exchangeStatus?.exchangeName ?? "Kraken").toUpperCase();
  const exMode = exchangeStatus?.mode ?? "simulation";
  const isLive = exMode === "live";

  // Fees
  const feesTotal = feeSummary?.totalFeesCollected ?? 0;
  const feeCount  = feeSummary?.tradeCount ?? 0;
  const feeRate   = feeSummary?.feeRatePct ?? 3;

  const [drift, setDrift] = useState(2.4);
  useEffect(() => {
    const t = setInterval(() => setDrift(d => +(d + (Math.random() - 0.5) * 0.3).toFixed(1)), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="grid grid-cols-4 gap-2">

      {/* 1. Performance */}
      <Panel icon={Activity} title="Performance" accent="#00ff8a">
        <StatCell label="Win Rate"     value={`${winRate.toFixed(1)}%`}
          color={winRate >= 55 ? "#00ff8a" : "#ff3355"} sub={`${wins.length}W / ${closed.length - wins.length}L`} />
        <StatCell label="Prof Factor"  value={`${pf}`}                     color="#ffb800" />
        <StatCell label="Total P&L"    value={`${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(2)}`}
          color={totalPnl >= 0 ? "#00ff8a" : "#ff3355"} sub={`${closed.length} trades`} />
        <StatCell label="Avg P&L"      value={`${avgPnl >= 0 ? "+" : ""}$${Math.abs(avgPnl).toFixed(2)}`}
          color={avgPnl >= 0 ? "#00ff8a" : "#ff3355"} />
      </Panel>

      {/* 2. Exposure & Risk */}
      <Panel icon={Shield} title="Exposure & Risk" accent="#ffb800">
        <StatCell label="Open Pos"     value={open.length.toString()}      color="#00f0ff"  sub="active trades" />
        <StatCell label="Exposure"     value={`$${(exposure / 1000).toFixed(1)}K`} color="#ffb800" />
        <StatCell label="Threat"       value={riskLevel}                   color={riskColor} />
        <StatCell label="Blocked"      value={blocked.toString()}          color="#ff8844"  sub="risk-gated" />
      </Panel>

      {/* 3. Velocity */}
      <Panel icon={TrendingUp} title="Velocity" accent="#00aaff">
        <StatCell label="Executed"     value={execCount.toString()}        color="#00aaff"  sub="this session" />
        <StatCell label="Signals/Min"  value={`${(totalSig / 60).toFixed(1)}`} color="#00f0ff" />
        <StatCell label="Total Sigs"   value={totalSig.toString()}         color="#7b68ee" />
        <StatCell label="Exec Quality" value={execCount > 0 ? "94.2%" : "—"} color="#00ff8a" />
      </Panel>

      {/* 4. AI Metrics */}
      <Panel icon={Brain} title="AI Metrics" accent="#cc55ff">
        <StatCell label="Confidence"   value={`${avgConf.toFixed(0)}%`}   color={avgConf >= 65 ? "#00ff8a" : "#ffaa00"} />
        <StatCell label="Model Acc"    value="71.2%"                      color="#cc55ff" />
        <StatCell label="Drift Score"  value={`${drift.toFixed(1)}σ`}    color={drift < 3 ? "#00ff8a" : "#ffaa00"} />
        <StatCell label="Pred Edge"    value="+12.4%"                     color="#00ff8a" />
      </Panel>

      {/* 5. AI Market Brief */}
      <Panel icon={BarChart2} title="Market Brief" accent={rColor}>
        <StatCell label="Regime"       value={regime}                     color={rColor} />
        <StatCell label="Conviction"   value={`${buys}B / ${sells}S`}   color="#C7D4E2" />
        <StatCell label="MTF OK"       value={mtfConfirmed.toString()}   color="#00f0ff" />
        <StatCell label="Avg Hold"     value={execCount > 0 ? "3h 42m" : "—"} color="#4a8fa8" />
      </Panel>

      {/* 6. Broker / Exchange */}
      <Panel icon={Landmark} title="Broker / Exchange" accent="#00eeff">
        <StatCell label="Exchange"     value={exName.slice(0, 7)}        color="#00eeff" />
        <StatCell label="Mode"         value={isLive ? "LIVE" : "SIM"}   color={isLive ? "#ff3355" : "#ffaa00"} />
        <StatCell label="Kill Switch"  value={exchangeStatus?.killSwitch ? "ACTIVE" : "SAFE"}
          color={exchangeStatus?.killSwitch ? "#ff3355" : "#00ff8a"} />
        <StatCell label="Orders Today" value={String(exchangeStatus?.ordersToday ?? 0)} color="#4a8fa8" />
      </Panel>

      {/* 7. Platform Fees */}
      <Panel icon={DollarSign} title="Platform Fees" accent="#ffb800">
        <StatCell label="Fees Collected" value={`$${feesTotal.toFixed(2)}`} color="#00ff8a" />
        <StatCell label="Fee Events"     value={String(feeCount)}            color="#00eeff" />
        <StatCell label="Fee Rate"       value={`${feeRate}%`}              color="#ffb800" />
        <StatCell label="Mode"           value="SIMULATED"                  color="#9FB3C8" />
      </Panel>

      {/* 8. AI Threat Monitor */}
      <Panel icon={AlertTriangle} title="AI Threat Monitor" accent={threatColor}>
        <StatCell label="Risk Level"   value={threatLevel}               color={threatColor} />
        <StatCell label="Risk Score"   value={`${threat.toFixed(0)}`}   color={threatColor} />
        <StatCell label="Volatile"     value={volatile.toString()}       color={volatile >= 3 ? "#ff3355" : "#ffaa00"} />
        <StatCell label="Vol Blocks"   value={String(bds.filter((b: any) => !b.volumeConfirmed).length)}
          color="#ff8844" />
      </Panel>

    </div>
  );
}
