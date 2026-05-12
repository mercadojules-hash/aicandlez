import { useQuery } from "@tanstack/react-query";
import { Cpu, Clock } from "lucide-react";

import { TickerStrips }            from "@/components/command/TickerStrips";
import { TelemetryRow }            from "@/components/command/TelemetryRow";
import { CryptoChartGrid }         from "@/components/command/CryptoChartGrid";
import { RichTerminalFeed }        from "@/components/command/RichTerminalFeed";
import { OpportunityScanner }      from "@/components/command/OpportunityScanner";
import { MarketRegimeCard }        from "@/components/command/MarketRegimeCard";
import { AIThreatMonitor }         from "@/components/command/AIThreatMonitor";
import { MiddleStatsGrid }         from "@/components/command/MiddleStatsGrid";
import { ActiveTradesPanel }       from "@/components/command/ActiveTradesPanel";
import { RiskCard }                from "@/components/command/RiskCard";
import { AIBriefCard }             from "@/components/command/AIBriefCard";
import { BrokerStatusCard }        from "@/components/command/BrokerStatusCard";
import { PlatformFeeCard }         from "@/components/command/PlatformFeeCard";
import { AutonomousExecutionFeed } from "@/components/command/AutonomousExecutionFeed";

import type {
  EngineStatus, AppSettings, Trade, ExchangeStatus, FeeSummary,
} from "@/components/command/types";
import { ago, Q_OPTS } from "@/components/command/helpers";

export default function CommandCenter() {
  const { data: engine } = useQuery<EngineStatus>({
    queryKey:        ["engine-status-cmd"],
    queryFn:         () => fetch("/api/engine/status", { cache: "no-store" }).then((r) => r.json()),
    refetchInterval: 8_000,
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
    queryFn:         () =>
      fetch("/api/trades", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => Array.isArray(d) ? d : []),
    refetchInterval: 12_000,
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

  const breakdowns = engine ? Object.values(engine.symbolBreakdowns) : [];

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#060810" }}>

      {/* 1. Ticker strips */}
      <TickerStrips engine={engine} />

      {/* 2. Telemetry row */}
      <TelemetryRow
        engine={engine}
        settings={settings}
        trades={trades}
        exchangeStatus={exchangeStatus}
        feeSummary={feeSummary}
      />

      <div className="flex-1 p-3 sm:p-4 space-y-3 max-w-screen-2xl mx-auto w-full">

        {/* 3. Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4" style={{ color: "#00aaff" }} />
            <h1 className="text-[13px] font-bold tracking-[0.18em] uppercase" style={{ color: "#00aaff" }}>
              Command Center
            </h1>
            <span
              className="text-[8px] font-bold px-1.5 py-0.5 rounded font-mono tracking-widest"
              style={{ background: "#00aaff0d", color: "#00aaff45", border: "1px solid #00aaff15" }}
            >
              MODULE 19
            </span>
            {engine?.running && (
              <span className="flex items-center gap-1.5 text-[9px] font-mono" style={{ color: "#00ff88" }}>
                <span className="live-dot" style={{ width: 5, height: 5 }} />
                LIVE
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[8px] font-mono text-[#2a4a60]">
            <Clock className="w-3 h-3" />
            {ago(engine?.lastTickAt ?? null)}
          </div>
        </div>

        {/* 4. FULL-WIDTH chart wall */}
        <CryptoChartGrid breakdowns={breakdowns} />

        {/* 5. Below chart wall: Terminal Feed (2/3) | Right stack (1/3) */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">

          {/* Terminal Feed — left 2/3 */}
          <div className="xl:col-span-2">
            <RichTerminalFeed engine={engine} />
          </div>

          {/* Right stack — 1/3 */}
          <div className="space-y-3">
            <OpportunityScanner breakdowns={breakdowns} />
            <MarketRegimeCard   breakdowns={breakdowns} lastTickAt={engine?.lastTickAt ?? null} />
            <AIThreatMonitor    engine={engine} breakdowns={breakdowns} />
          </div>
        </div>

        {/* 6. Autonomous Execution Feed */}
        <AutonomousExecutionFeed engine={engine} />

        {/* 7. Portfolio snapshot */}
        <MiddleStatsGrid trades={trades} engine={engine} />

        {/* 8. Active trades + Risk */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <div className="xl:col-span-2">
            <ActiveTradesPanel trades={trades} />
          </div>
          <RiskCard engine={engine} settings={settings} />
        </div>

        {/* 9. AI Brief · Broker · Fees */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <AIBriefCard      engine={engine} />
          <BrokerStatusCard exchangeStatus={exchangeStatus} />
          <PlatformFeeCard  feeSummary={feeSummary} />
        </div>

      </div>
    </div>
  );
}
