import { useQuery } from "@tanstack/react-query";
import { Activity, Clock } from "lucide-react";
import { TrendingUp, TrendingDown, Zap, BarChart2 } from "lucide-react";

import { StatChip }              from "@/components/command/StatChip";
import { LiveTicker }            from "@/components/command/LiveTicker";
import { CryptoChartGrid }       from "@/components/command/CryptoChartGrid";
import { OpportunityScanner }    from "@/components/command/OpportunityScanner";
import { MarketRegimeCard }      from "@/components/command/MarketRegimeCard";
import { MiddleStatsGrid }       from "@/components/command/MiddleStatsGrid";
import { BrokerStatusCard }      from "@/components/command/BrokerStatusCard";
import { PlatformFeeCard }       from "@/components/command/PlatformFeeCard";
import { SignalSummaryCard }     from "@/components/command/SignalSummaryCard";
import { RiskCard }              from "@/components/command/RiskCard";
import { AIBriefCard }           from "@/components/command/AIBriefCard";
import { ActiveTradesPanel }     from "@/components/command/ActiveTradesPanel";
import { LiveTerminalFeed }      from "@/components/command/LiveTerminalFeed";
import { AutonomousExecutionFeed } from "@/components/command/AutonomousExecutionFeed";

import type { EngineStatus, AppSettings, Trade, ExchangeStatus, FeeSummary } from "@/components/command/types";
import { ago, Q_OPTS } from "@/components/command/helpers";

export default function CommandCenter() {
  const { data: engine } = useQuery<EngineStatus>({
    queryKey:        ["engine-status-cmd"],
    queryFn:         () => fetch("/api/engine/status", { cache: "no-store" }).then((r) => r.json()),
    refetchInterval: 12_000,
    ...Q_OPTS,
  });

  const { data: settings } = useQuery<AppSettings>({
    queryKey:        ["settings-cmd"],
    queryFn:         () => fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()),
    refetchInterval: 60_000,
    ...Q_OPTS,
  });

  const { data: trades } = useQuery<Trade[]>({
    queryKey:        ["trades-cmd"],
    queryFn:         () => fetch("/api/trades", { cache: "no-store" }).then((r) => r.json()).then((d) => Array.isArray(d) ? d : []),
    refetchInterval: 15_000,
    ...Q_OPTS,
  });

  const { data: exchangeStatus } = useQuery<ExchangeStatus>({
    queryKey:        ["exchange-status-cmd"],
    queryFn:         () => fetch("/api/exchange/status", { cache: "no-store" }).then((r) => r.json()),
    refetchInterval: 30_000,
    ...Q_OPTS,
  });

  const { data: feeSummary } = useQuery<FeeSummary>({
    queryKey:        ["fees-cmd"],
    queryFn:         () => fetch("/api/fees", { cache: "no-store" }).then((r) => r.json()),
    refetchInterval: 30_000,
    ...Q_OPTS,
  });

  const breakdowns   = engine ? Object.values(engine.symbolBreakdowns) : [];
  const activeTrades = (trades ?? []).filter((t) => t.status === "open").length;
  const buySig       = engine?.signalCounts.BUY  ?? 0;
  const sellSig      = engine?.signalCounts.SELL ?? 0;

  return (
    <div className="p-4 sm:p-5 space-y-4 max-w-screen-2xl mx-auto">

      {/* 1 — Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Activity className="w-5 h-5 text-primary" />
            <h1 className="text-lg sm:text-xl font-bold tracking-wide">Command Center</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono border bg-primary/10 text-primary border-primary/30">
              MODULE 19
            </span>
            {engine?.running && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/60">
            Unified view · all markets · all signals · all controls
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
          <Clock className="w-3 h-3" />
          Last tick {ago(engine?.lastTickAt ?? null)}
        </div>
      </div>

      {/* 2 — Live AI ticker */}
      <LiveTicker engine={engine} />

      {/* 3 — Stat chips */}
      <div className="flex gap-2 flex-wrap">
        <StatChip label="BUY signals"   value={buySig}   color="text-emerald-400" icon={TrendingUp} />
        <StatChip label="SELL signals"  value={sellSig}  color="text-red-400"     icon={TrendingDown} />
        <StatChip label="Executed"      value={engine?.tradesExecuted ?? 0}
                  color={engine?.tradesExecuted ? "text-amber-400" : "text-muted-foreground"} icon={Zap} />
        <StatChip label="Active trades" value={activeTrades}
                  color={activeTrades > 0 ? "text-sky-400" : "text-muted-foreground"} icon={BarChart2} />
      </div>

      {/* 4 — Opportunity scanner + Market regime (2-col) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <OpportunityScanner breakdowns={breakdowns} />
        <MarketRegimeCard   breakdowns={breakdowns} lastTickAt={engine?.lastTickAt ?? null} />
      </div>

      {/* 5 — Crypto chart grid (8 charts) */}
      <CryptoChartGrid breakdowns={breakdowns} />

      {/* 6-15 — Middle section: 3-col grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Left col: Portfolio snapshot + Active trades */}
        <div className="xl:col-span-2 space-y-4">
          <MiddleStatsGrid trades={trades} engine={engine} />
          <ActiveTradesPanel trades={trades} />
        </div>

        {/* Right col: Signal summary + Risk + AI brief + Broker + Fees */}
        <div className="space-y-4">
          <SignalSummaryCard engine={engine} />
          <RiskCard          engine={engine} settings={settings} />
          <AIBriefCard       engine={engine} />
          <BrokerStatusCard  exchangeStatus={exchangeStatus} />
          <PlatformFeeCard   feeSummary={feeSummary} />
        </div>
      </div>

      {/* 16 — Live terminal feed */}
      <LiveTerminalFeed engine={engine} />

      {/* 17 — Autonomous execution feed (lowest priority) */}
      <AutonomousExecutionFeed engine={engine} />

    </div>
  );
}
