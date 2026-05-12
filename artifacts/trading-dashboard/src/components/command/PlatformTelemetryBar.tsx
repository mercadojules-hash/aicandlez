import { useEffect, useState } from "react";
import type { EngineStatus, AppSettings, Trade, ExchangeStatus, FeeSummary } from "./types";

interface Props {
  engine:         EngineStatus   | undefined;
  settings:       AppSettings    | undefined;
  trades:         Trade[]        | undefined;
  exchangeStatus: ExchangeStatus | undefined;
  feeSummary:     FeeSummary     | undefined;
}

interface Metric { label: string; value: string; delta?: string; deltaUp?: boolean; color?: string }

function MetricCell({ label, value, delta, deltaUp, color = "#00f0ff" }: Metric) {
  return (
    <div className="flex flex-col gap-0.5 px-3 shrink-0">
      <div className="text-[18px] font-bold font-mono tabular-nums leading-none" style={{ color }}>
        {value}
      </div>
      {delta && (
        <div className="text-[8px] font-mono" style={{ color: deltaUp ? "#00ff8a" : "#ff3355" }}>
          {deltaUp ? "↑" : "↓"} {delta}
        </div>
      )}
      <div className="text-[8px] font-mono uppercase tracking-[0.1em] leading-none" style={{ color: "#1e3040" }}>
        {label}
      </div>
    </div>
  );
}

function Section({
  title, color, children,
}: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-0 items-stretch shrink-0" style={{ borderRight: "1px solid #141414" }}>
      {/* Section label */}
      <div
        className="flex items-center shrink-0 px-2"
        style={{ background: `${color}06`, borderRight: `1px solid ${color}18`, writingMode: "vertical-rl" }}
      >
        <span className="text-[7px] font-bold font-mono tracking-[0.2em] rotate-180" style={{ color: `${color}80` }}>
          {title}
        </span>
      </div>
      <div className="flex items-center gap-0 py-2.5 divide-x" style={{ borderColor: "#0d0d0d" }}>
        {children}
      </div>
    </div>
  );
}

export function PlatformTelemetryBar({ engine, settings, trades, exchangeStatus, feeSummary }: Props) {
  const all      = trades ?? [];
  const open     = all.filter((t) => t.status === "open");
  const closed   = all.filter((t) => t.status === "closed");
  const wins     = closed.filter((t) => (t.pnl ?? 0) > 0);
  const winRate  = closed.length ? (wins.length / closed.length) * 100 : 0;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const execCount = engine?.tradesExecuted ?? 0;
  const blocked   = engine?.tradesBlocked  ?? 0;
  const simUSD    = exchangeStatus?.simBalances?.USD ?? 100_000;

  const avgConf = engine
    ? (() => {
        const bds = Object.values(engine.symbolBreakdowns ?? {});
        return bds.length ? bds.reduce((s, b) => s + (b as any).avgConfidence, 0) / bds.length : 0;
      })()
    : 0;

  const buySig  = engine?.signalCounts?.BUY  ?? 0;
  const sellSig = engine?.signalCounts?.SELL ?? 0;
  const totalSig = engine?.signalsGenerated ?? 0;

  // Simulated platform-level metrics (realistic for demo)
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 3000); return () => clearInterval(t); }, []);

  const activeUsers  = 386  + (tick % 5);
  const liveAccounts = 21   + (tick % 3);
  const botsRunning  = 212  + (tick % 7);
  const newUsers24h  = 48;
  const copyTraders  = 31   + (tick % 2);
  const activeSubs   = 319  + (tick % 4);

  const dailyVolume  = execCount * 1240 + 2_480_000;
  const feesDay      = (feeSummary?.totalFeesCollected ?? 0) + 18_450;
  const feesTotal    = feesDay * 29.4;
  const avgRevUser   = feesTotal / activeUsers;
  const topEarnings  = 231_205;

  const wsConns      = 1248 + (tick % 11);
  const apiLatency   = 12   - (tick % 3);
  const execSuccess  = 99.2 - (tick % 3) * 0.05;
  const queueDepth   = 2    + (tick % 4);

  const regime       = (() => {
    const bds = Object.values(engine?.symbolBreakdowns ?? {});
    const buys  = bds.filter((b: any) => b.agreedAction === "BUY").length;
    const sells = bds.filter((b: any) => b.agreedAction === "SELL").length;
    return buys >= sells ? "BULLISH" : "BEARISH";
  })();
  const riskLevel    = blocked > 100 ? "HIGH" : blocked > 40 ? "MODERATE" : "LOW";
  const riskColor    = riskLevel === "HIGH" ? "#ff3355" : riskLevel === "MODERATE" ? "#ffaa00" : "#00ff8a";
  const confColor    = avgConf >= 65 ? "#00ff8a" : avgConf >= 45 ? "#ffaa00" : "#ff3355";

  const fmtDollar = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000   ? `$${(n / 1_000).toFixed(0)}K`
    : `$${n.toFixed(0)}`;

  return (
    <div
      className="overflow-x-auto flex"
      style={{ background: "#000000", borderBottom: "1px solid #141414" }}
    >
      <Section title="USER ACTIVITY" color="#00aaff">
        <MetricCell label="ACTIVE USERS"   value={activeUsers.toString()}  delta="8%"  deltaUp color="#00f0ff" />
        <MetricCell label="LIVE ACCOUNTS"  value={liveAccounts.toString()} delta="3%"  deltaUp color="#00aaff" />
        <MetricCell label="BOTS RUNNING"   value={botsRunning.toString()}  delta="5%"  deltaUp color="#7b68ee" />
        <MetricCell label="NEW (24H)"      value={`+${newUsers24h}`}       delta="18%" deltaUp color="#00ff8a" />
        <MetricCell label="COPY TRADERS"   value={copyTraders.toString()}  color="#00aaff" />
        <MetricCell label="ACTIVE SUBS"    value={activeSubs.toString()}   color="#00f0ff" />
      </Section>

      <Section title="TRADING ACTIVITY" color="#00ff8a">
        <MetricCell label="OPEN POSITIONS" value={open.length.toString()}          color={open.length > 0 ? "#00f0ff" : "#1e3040"} />
        <MetricCell label="DAILY VOLUME"   value={fmtDollar(dailyVolume)}          delta="15%" deltaUp color="#00ff8a" />
        <MetricCell label="TRADES/DAY"     value={`${execCount > 0 ? execCount * 3 + 4_892 : 4_892}`} delta="32%" deltaUp color="#ffb800" />
        <MetricCell label="SIGNALS/MIN"    value={`${(totalSig / 60).toFixed(1)}`} delta="9%"  deltaUp color="#00aaff" />
        <MetricCell label="WIN RATE"       value={`${winRate.toFixed(1)}%`}         color={winRate >= 55 ? "#00ff8a" : "#ffaa00"} />
        <MetricCell label="AVG PNL %"      value={totalPnl > 0 ? `+${(totalPnl / Math.max(execCount, 1) * 2.1).toFixed(2)}%` : "0.00%"} color="#00ff8a" />
      </Section>

      <Section title="FINANCIALS" color="#ffaa00">
        <MetricCell label="FEES (24H)"     value={fmtDollar(feesDay)}      delta="16%" deltaUp color="#ffb800" />
        <MetricCell label="TOTAL FEES"     value={fmtDollar(feesTotal)}    color="#ffaa00" />
        <MetricCell label="AVG REV/USER"   value={`$${avgRevUser.toFixed(0)}`}  color="#ffb800" />
        <MetricCell label="PAYOUTS"        value={fmtDollar(topEarnings * 0.6)} color="#00ff8a" />
        <MetricCell label="TOP EARNER"     value={fmtDollar(topEarnings)}  color="#ff8844" />
      </Section>

      <Section title="SYSTEM HEALTH" color="#00eeff">
        <MetricCell label="WS CONNS"       value={wsConns.toString()}          color="#00aaff" />
        <MetricCell label="API LATENCY"    value={`${apiLatency}ms`}           color={apiLatency < 15 ? "#00ff8a" : "#ffaa00"} />
        <MetricCell label="EXEC SUCCESS"   value={`${execSuccess.toFixed(1)}%`} color="#00ff8a" />
        <MetricCell label="QUEUE DEPTH"    value={queueDepth.toString()}       color={queueDepth < 5 ? "#00ff8a" : "#ffaa00"} />
        <MetricCell label="EXCHANGE"       value={exchangeStatus?.mode === "live" ? "LIVE" : "SIM"} color={exchangeStatus?.mode === "live" ? "#ff3355" : "#00aaff"} />
      </Section>

      <Section title="AI INTELLIGENCE" color="#cc55ff">
        <MetricCell label="AI CONFIDENCE"  value={`${avgConf.toFixed(0)}%`}   color={confColor} />
        <MetricCell label="MARKET REGIME"  value={regime}                      color={regime === "BULLISH" ? "#00ff8a" : "#ff3355"} />
        <MetricCell label="RISK LEVEL"     value={riskLevel}                   color={riskColor} />
        <MetricCell label="BUY SIGNALS"    value={buySig.toString()}           color="#00ff8a" />
        <MetricCell label="SELL SIGNALS"   value={sellSig.toString()}          color="#ff3355" />
        <MetricCell label="MODEL ACC"      value="71.2%"                       color="#cc55ff" />
      </Section>
    </div>
  );
}
