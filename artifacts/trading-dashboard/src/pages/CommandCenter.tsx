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

/* ── Exchange Switcher ──────────────────────────────────────────────────────── */

type ExchangeOption = {
  id:       string;
  label:    string;
  short:    string;
  color:    string;
  disabled?: boolean;
  soon?:    boolean;
  isSim?:   boolean;
};

const EXCHANGES: ExchangeOption[] = [
  { id: "kraken",   label: "Kraken",   short: "KRK", color: "#5741d9" },
  { id: "coinbase", label: "Coinbase", short: "CB",  color: "#2775ca", disabled: true, soon: true },
  { id: "binance",  label: "Binance",  short: "BNB", color: "#f0b90b", disabled: true, soon: true },
  { id: "sim",      label: "Simulation", short: "SIM", color: "#ffaa00", isSim: true },
];

function ExchangeSwitcher({
  isLive, exName, onSelectSim, onSelectLive,
}: {
  isLive: boolean;
  exName: string;
  onSelectSim: () => void;
  onSelectLive: (exchange: string) => void;
}) {
  const activeId = !isLive ? "sim" : (exName.toLowerCase() || "kraken");

  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg"
      style={{ background: "#040d16", border: "1px solid #0d1e2e" }}>
      {EXCHANGES.map(ex => {
        const isActive   = activeId === ex.id;
        const isDisabled = ex.disabled === true;

        return (
          <button
            key={ex.id}
            disabled={isDisabled}
            onClick={() => {
              if (isDisabled) return;
              if (ex.isSim)   onSelectSim();
              else            onSelectLive(ex.id);
            }}
            title={isDisabled ? `${ex.label} — coming soon` : ex.label}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono font-bold transition-all"
            style={isActive ? {
              background:  `${ex.color}18`,
              color:        ex.color,
              border:      `1px solid ${ex.color}45`,
              boxShadow:   `0 0 12px ${ex.color}25, inset 0 0 8px ${ex.color}08`,
              fontSize:    "10px",
              letterSpacing: "0.1em",
            } : isDisabled ? {
              background:  "transparent",
              color:       "#1e3040",
              border:      "1px solid transparent",
              fontSize:    "10px",
              letterSpacing: "0.1em",
              cursor:      "not-allowed",
            } : {
              background:  "transparent",
              color:       "#4a7a95",
              border:      "1px solid transparent",
              fontSize:    "10px",
              letterSpacing: "0.1em",
            }}
            onMouseEnter={e => {
              if (!isActive && !isDisabled)
                e.currentTarget.style.color = "#9FB3C8";
            }}
            onMouseLeave={e => {
              if (!isActive && !isDisabled)
                e.currentTarget.style.color = "#4a7a95";
            }}
          >
            {/* Active glow dot */}
            {isActive && (
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: ex.color, boxShadow: `0 0 6px ${ex.color}` }} />
            )}

            <span>{ex.label}</span>

            {/* Coming soon badge */}
            {ex.soon && (
              <span className="text-[7px] font-bold px-1 py-px rounded font-mono"
                style={{ background: "#ffaa0012", color: "#ffaa0070", border: "1px solid #ffaa0020" }}>
                SOON
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */

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
  const exName     = exchangeStatus?.exchangeName ?? "kraken";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["exchange-status-cmd"] });
    refetchExchange();
  };

  const toggleKill  = () => fetch("/api/exchange/kill",  { method: "POST", cache: "no-store" }).then(invalidate);
  const togglePause = () => fetch("/api/exchange/pause", { method: "POST", cache: "no-store" }).then(invalidate);

  const selectSim  = () => fetch("/api/exchange/mode", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "simulation" }), cache: "no-store",
  }).then(invalidate);

  const selectLive = (_exchange: string) => fetch("/api/exchange/mode", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "live" }), cache: "no-store",
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
      <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
        style={{ borderBottomColor: "#0d1520", background: "#000000" }}>

        {/* Left: identity */}
        <Cpu className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#00aaff" }} />
        <span className="text-[10px] font-bold tracking-[0.2em] font-mono" style={{ color: "#EAF2FF" }}>
          COMMAND CENTER
        </span>
        <span className="text-[7px] font-bold px-1.5 py-0.5 rounded font-mono tracking-widest"
          style={{ background: "#00aaff08", color: "#9FB3C8", border: "1px solid #00aaff14" }}>
          MOD 19
        </span>
        {engine?.running && (
          <span className="flex items-center gap-1 text-[8px] font-mono font-semibold" style={{ color: "#00ff8a" }}>
            <span className="live-dot" style={{ width: 4, height: 4 }} /> LIVE
          </span>
        )}

        {/* Center: action controls — PAUSE + KILL only */}
        <div className="flex items-center gap-1.5 ml-4">
          <button onClick={togglePause}
            className="flex items-center gap-1.5 text-[9px] font-bold px-3 py-1.5 rounded font-mono transition-all border"
            style={isPaused
              ? { background: "#ffaa0012", color: "#ffaa00", border: "1px solid #ffaa0038", boxShadow: "0 0 8px #ffaa0020" }
              : { background: "transparent", color: "#9FB3C8", borderColor: "#1c2a36" }}>
            {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {isPaused ? "RESUME" : "PAUSE"}
          </button>
          <button onClick={toggleKill}
            className="flex items-center gap-1.5 text-[9px] font-bold px-3 py-1.5 rounded font-mono transition-all border"
            style={isKill
              ? { background: "#ff225514", color: "#ff2255", borderColor: "#ff225540", boxShadow: "0 0 8px #ff225520" }
              : { background: "transparent", color: "#9FB3C8", borderColor: "#1c2a36" }}>
            <ShieldOff className="w-3 h-3" />
            {isKill ? "KILL ACTIVE" : "KILL SWITCH"}
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: last tick */}
        <div className="flex items-center gap-1.5 text-[8px] font-mono font-medium mr-3"
          style={{ color: "#3a5a70" }}>
          <Clock className="w-3 h-3" />
          {ago(engine?.lastTickAt ?? null)}
        </div>

        {/* Right: Exchange Switcher */}
        <ExchangeSwitcher
          isLive={isLive}
          exName={exName}
          onSelectSim={selectSim}
          onSelectLive={selectLive}
        />
      </div>

      {/* ④–⑧ Main content */}
      <div className="flex-1 p-2 sm:p-3 space-y-2 max-w-screen-2xl mx-auto w-full">

        {/* ④ Chart wall */}
        <CryptoChartGrid breakdowns={breakdowns} />

        {/* ⑤ Three-column: Platform Overview | Terminal Feed | Scanner */}
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
