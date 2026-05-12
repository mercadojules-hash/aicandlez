import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Clock, ShieldOff, Pause, Play } from "lucide-react";

import { TickerStrips }          from "@/components/command/TickerStrips";
import { PlatformTelemetryBar }  from "@/components/command/PlatformTelemetryBar";
import { CryptoChartGrid }       from "@/components/command/CryptoChartGrid";
import { PlatformOverviewPanel } from "@/components/command/PlatformOverviewPanel";
import { RichTerminalFeed }      from "@/components/command/RichTerminalFeed";
import { OpportunityScanner }    from "@/components/command/OpportunityScanner";
import { MiddleStatsGrid }       from "@/components/command/MiddleStatsGrid";
import { ActiveTradesPanel }     from "@/components/command/ActiveTradesPanel";
import { BottomAnalyticsRow }    from "@/components/command/BottomAnalyticsRow";

import type {
  EngineStatus, AppSettings, Trade, ExchangeStatus, FeeSummary,
} from "@/components/command/types";
import { ago, Q_OPTS } from "@/components/command/helpers";

export default function CommandCenter() {
  const qc = useQueryClient();

  const { data: engine } = useQuery<EngineStatus>({
    queryKey: ["engine-status-cmd"],
    queryFn:  () => fetch("/api/engine/status", { cache: "no-store" }).then(r => r.json()),
    refetchInterval: 8_000, ...Q_OPTS,
  });
  const { data: settings } = useQuery<AppSettings>({
    queryKey: ["settings-cmd"],
    queryFn:  () => fetch("/api/settings", { cache: "no-store" }).then(r => r.json()),
    refetchInterval: 60_000, ...Q_OPTS,
  });
  const { data: trades } = useQuery<Trade[]>({
    queryKey: ["trades-cmd"],
    queryFn:  () => fetch("/api/trades", { cache: "no-store" })
      .then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    refetchInterval: 12_000, ...Q_OPTS,
  });
  const { data: exchangeStatus, refetch: refetchExchange } = useQuery<ExchangeStatus>({
    queryKey: ["exchange-status-cmd"],
    queryFn:  () => fetch("/api/exchange/status", { cache: "no-store" }).then(r => r.json()),
    refetchInterval: 15_000, ...Q_OPTS,
  });
  const { data: feeSummary } = useQuery<FeeSummary>({
    queryKey: ["fees-cmd"],
    queryFn:  () => fetch("/api/fees", { cache: "no-store" }).then(r => r.json()),
    refetchInterval: 30_000, ...Q_OPTS,
  });

  const breakdowns = engine ? Object.values(engine.symbolBreakdowns) : [];
  const isKill     = exchangeStatus?.killSwitch ?? false;
  const isPaused   = exchangeStatus?.paused     ?? false;
  const isLive     = exchangeStatus?.mode === "live";
  const exName     = exchangeStatus?.exchangeName ?? "KRAKEN";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["exchange-status-cmd"] });
    refetchExchange();
  };
  const toggleKill  = () => fetch("/api/exchange/kill",  { method: "POST", cache: "no-store" }).then(invalidate);
  const togglePause = () => fetch("/api/exchange/pause", { method: "POST", cache: "no-store" }).then(invalidate);
  const toggleMode  = () => fetch("/api/exchange/mode",  {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: isLive ? "simulation" : "live" }), cache: "no-store",
  }).then(invalidate);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#060810" }}>

      {/* ① Ticker strips */}
      <TickerStrips engine={engine} />

      {/* ② Telemetry bar */}
      <PlatformTelemetryBar
        engine={engine} settings={settings}
        trades={trades} exchangeStatus={exchangeStatus} feeSummary={feeSummary}
      />

      {/* ③ Command strip */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b flex-wrap flex-shrink-0"
        style={{ borderBottomColor: "#111111", background: "#000000" }}>
        <Cpu className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#00aaff" }} />
        <span className="text-[10px] font-bold tracking-[0.2em] font-mono"
          style={{ color: "#EAF2FF" }}>COMMAND CENTER</span>
        <span className="text-[7px] font-bold px-1.5 py-0.5 rounded font-mono tracking-widest"
          style={{ background: "#00aaff08", color: "#9FB3C8", border: "1px solid #00aaff14" }}>
          MOD 19
        </span>
        {engine?.running && (
          <span className="flex items-center gap-1 text-[8px] font-mono font-semibold" style={{ color: "#00ff8a" }}>
            <span className="live-dot" style={{ width: 4, height: 4 }} /> LIVE
          </span>
        )}

        <div className="flex items-center gap-1.5 flex-wrap ml-2">
          <span className="text-[8px] font-bold px-2 py-0.5 rounded font-mono"
            style={{ background: "#00aaff0a", color: "#C7D4E2", border: "1px solid #00aaff1c" }}>
            {exName.toUpperCase().slice(0, 8)}
          </span>
          <button onClick={toggleMode}
            className="text-[8px] font-bold px-2 py-0.5 rounded font-mono transition-all"
            style={isLive
              ? { background: "#ff33550e", color: "#ff3355", border: "1px solid #ff335528" }
              : { background: "#ffaa000e", color: "#ffaa00", border: "1px solid #ffaa0028" }}>
            {isLive ? "⚡ LIVE" : "◉ SIM"}
          </button>
          <button onClick={togglePause}
            className="flex items-center gap-1 text-[8px] font-bold px-2 py-0.5 rounded font-mono transition-all"
            style={isPaused
              ? { background: "#ffaa0010", color: "#ffaa00", border: "1px solid #ffaa0028" }
              : { background: "transparent", color: "#9FB3C8", border: "1px solid #1c1c1c" }}>
            {isPaused ? <><Play className="w-2.5 h-2.5" /> RESUME</> : <><Pause className="w-2.5 h-2.5" /> PAUSE</>}
          </button>
          <button onClick={toggleKill}
            className="flex items-center gap-1 text-[8px] font-bold px-2 py-0.5 rounded font-mono transition-all"
            style={isKill
              ? { background: "#ff225514", color: "#ff2255", border: "1px solid #ff225538", animation: "border-march 2s ease-in-out infinite" }
              : { background: "transparent", color: "#9FB3C8", border: "1px solid #1c1c1c" }}>
            <ShieldOff className="w-2.5 h-2.5" />
            {isKill ? "KILL ACTIVE" : "KILL"}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1 text-[8px] font-mono font-medium"
          style={{ color: "#9FB3C8" }}>
          <Clock className="w-3 h-3" />
          {ago(engine?.lastTickAt ?? null)}
        </div>
      </div>

      {/* ④–⑧ Main content */}
      <div className="flex-1 p-2 sm:p-3 space-y-2 max-w-screen-2xl mx-auto w-full">

        {/* ④ Chart wall */}
        <CryptoChartGrid breakdowns={breakdowns} />

        {/* ⑤ Three-column: Platform Overview | Terminal Feed (fills height) | Scanner */}
        <div className="grid gap-2" style={{ gridTemplateColumns: "260px 1fr 260px", height: 780 }}>
          <PlatformOverviewPanel />
          <RichTerminalFeed engine={engine} />
          <OpportunityScanner breakdowns={breakdowns} />
        </div>

        {/* ⑥ Active Trades LEFT | Recently Closed RIGHT */}
        <ActiveTradesPanel trades={trades} />

        {/* ⑦ 8-container unified grid (4+4 two-row) */}
        <MiddleStatsGrid
          trades={trades} engine={engine}
          exchangeStatus={exchangeStatus} feeSummary={feeSummary}
        />

        {/* ⑧ Bottom analytics: AI Perf | Market Regime | Model Health */}
        <BottomAnalyticsRow engine={engine} trades={trades} />

      </div>
    </div>
  );
}
