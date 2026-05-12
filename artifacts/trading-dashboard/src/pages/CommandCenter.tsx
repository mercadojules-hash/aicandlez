import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Clock, Zap, ShieldOff, Pause, Play } from "lucide-react";

import { TickerStrips }       from "@/components/command/TickerStrips";
import { TelemetryRow }       from "@/components/command/TelemetryRow";
import { CryptoChartGrid }    from "@/components/command/CryptoChartGrid";
import { RichTerminalFeed }   from "@/components/command/RichTerminalFeed";
import { OpportunityScanner } from "@/components/command/OpportunityScanner";
import { MarketRegimeCard }   from "@/components/command/MarketRegimeCard";
import { AIThreatMonitor }    from "@/components/command/AIThreatMonitor";
import { MiddleStatsGrid }    from "@/components/command/MiddleStatsGrid";
import { ActiveTradesPanel }  from "@/components/command/ActiveTradesPanel";
import { RiskCard }           from "@/components/command/RiskCard";
import { AIBriefCard }        from "@/components/command/AIBriefCard";
import { BrokerStatusCard }   from "@/components/command/BrokerStatusCard";
import { PlatformFeeCard }    from "@/components/command/PlatformFeeCard";

import type {
  EngineStatus, AppSettings, Trade, ExchangeStatus, FeeSummary,
} from "@/components/command/types";
import { ago, Q_OPTS } from "@/components/command/helpers";

export default function CommandCenter() {
  const qc = useQueryClient();

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

  const { data: exchangeStatus, refetch: refetchExchange } = useQuery<ExchangeStatus>({
    queryKey:        ["exchange-status-cmd"],
    queryFn:         () => fetch("/api/exchange/status", { cache: "no-store" }).then((r) => r.json()),
    refetchInterval: 15_000,
    ...Q_OPTS,
  });

  const { data: feeSummary } = useQuery<FeeSummary>({
    queryKey:        ["fees-cmd"],
    queryFn:         () => fetch("/api/fees", { cache: "no-store" }).then((r) => r.json()),
    refetchInterval: 30_000,
    ...Q_OPTS,
  });

  const breakdowns = engine ? Object.values(engine.symbolBreakdowns) : [];

  const isKill   = exchangeStatus?.killSwitch ?? false;
  const isPaused = exchangeStatus?.paused     ?? false;
  const isLive   = exchangeStatus?.mode === "live";
  const exName   = exchangeStatus?.exchangeName ?? "KRAKEN";

  const invalidateExchange = () => {
    qc.invalidateQueries({ queryKey: ["exchange-status-cmd"] });
    refetchExchange();
  };

  const toggleKill  = () =>
    fetch("/api/exchange/kill",  { method: "POST", cache: "no-store" }).then(invalidateExchange);
  const togglePause = () =>
    fetch("/api/exchange/pause", { method: "POST", cache: "no-store" }).then(invalidateExchange);
  const toggleMode  = () =>
    fetch("/api/exchange/mode",  {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ mode: isLive ? "simulation" : "live" }), cache: "no-store",
    }).then(invalidateExchange);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#060810" }}>

      {/* 1. Ticker strips */}
      <TickerStrips engine={engine} />

      {/* 2. Telemetry row */}
      <TelemetryRow
        engine={engine} settings={settings}
        trades={trades} exchangeStatus={exchangeStatus} feeSummary={feeSummary}
      />

      <div className="flex-1 p-3 sm:p-4 space-y-3 max-w-screen-2xl mx-auto w-full">

        {/* 3. Page header + Quick Controls Bar */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Title */}
          <div className="flex items-center gap-2.5 mr-2">
            <Cpu className="w-4 h-4" style={{ color: "#00aaff" }} />
            <h1 className="text-[13px] font-bold tracking-[0.18em] uppercase font-mono"
              style={{ color: "#00aaff" }}>
              Command Center
            </h1>
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded font-mono tracking-widest"
              style={{ background: "#00aaff08", color: "#00aaff40", border: "1px solid #00aaff12" }}>
              MOD 19
            </span>
            {engine?.running && (
              <span className="flex items-center gap-1.5 text-[9px] font-mono" style={{ color: "#00ff8a" }}>
                <span className="live-dot" style={{ width: 5, height: 5 }} />
                LIVE
              </span>
            )}
          </div>

          {/* ── Quick Controls ── always visible */}
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {/* Exchange badge */}
            <span
              className="text-[9px] font-bold px-2.5 py-1.5 rounded font-mono tracking-widest"
              style={{ background: "#00aaff0a", color: "#00aaff", border: "1px solid #00aaff22" }}
            >
              {exName.toUpperCase().slice(0, 8)}
            </span>

            {/* Simulation / Live */}
            <button
              onClick={toggleMode}
              className="text-[9px] font-bold px-2.5 py-1.5 rounded font-mono tracking-widest transition-all"
              style={isLive
                ? { background: "#ff33550e", color: "#ff3355", border: "1px solid #ff335530" }
                : { background: "#ffaa000e", color: "#ffaa00", border: "1px solid #ffaa0030" }
              }
            >
              {isLive ? "⚡ LIVE" : "◉ SIMULATION"}
            </button>

            {/* Pause */}
            <button
              onClick={togglePause}
              className="flex items-center gap-1.5 text-[9px] font-bold px-2.5 py-1.5 rounded font-mono transition-all"
              style={isPaused
                ? { background: "#ffaa0014", color: "#ffaa00", border: "1px solid #ffaa0035" }
                : { background: "#00000000", color: "#2a4a60",  border: "1px solid #1c1c1c"  }
              }
            >
              {isPaused
                ? <><Play  className="w-3 h-3" /> RESUME</>
                : <><Pause className="w-3 h-3" /> PAUSE</>
              }
            </button>

            {/* Kill Switch */}
            <button
              onClick={toggleKill}
              className="flex items-center gap-1.5 text-[9px] font-bold px-2.5 py-1.5 rounded font-mono transition-all"
              style={isKill
                ? { background: "#ff225518", color: "#ff2255", border: "1px solid #ff225540",
                    animation: "border-march 2s ease-in-out infinite" }
                : { background: "#00000000", color: "#2a4a60",  border: "1px solid #1c1c1c"  }
              }
            >
              <ShieldOff className="w-3 h-3" />
              {isKill ? "⚡ KILL ACTIVE" : "KILL SWITCH"}
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-[8px] font-mono" style={{ color: "#1e3040" }}>
            <Clock className="w-3 h-3" />
            {ago(engine?.lastTickAt ?? null)}
          </div>
        </div>

        {/* 4. Full-width chart wall */}
        <CryptoChartGrid breakdowns={breakdowns} />

        {/* 5. Below charts: Terminal Feed (2/3) + right stack (1/3) */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">

          {/* Left 2/3 — Terminal Feed + Active Trades stacked */}
          <div className="xl:col-span-2 space-y-3">
            <RichTerminalFeed engine={engine} />
            <ActiveTradesPanel trades={trades} />
          </div>

          {/* Right 1/3 — Scanner → Regime → Threat */}
          <div className="space-y-3">
            <OpportunityScanner breakdowns={breakdowns} />
            <MarketRegimeCard   breakdowns={breakdowns} lastTickAt={engine?.lastTickAt ?? null} />
            <AIThreatMonitor    engine={engine} breakdowns={breakdowns} />
          </div>
        </div>

        {/* 6. Portfolio snapshot */}
        <MiddleStatsGrid trades={trades} engine={engine} />

        {/* 7. Bottom row: Risk · AI Brief · Broker · Fees */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <RiskCard           engine={engine} settings={settings} />
          <AIBriefCard        engine={engine} />
          <BrokerStatusCard   exchangeStatus={exchangeStatus} />
          <PlatformFeeCard    feeSummary={feeSummary} />
        </div>

      </div>
    </div>
  );
}
