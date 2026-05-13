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
  EngineStatus, AppSettings, Trade, ExchangeStatus, FeeSummary, SimAccount,
} from "@/components/command/types";
import { ago, Q_OPTS } from "@/components/command/helpers";

/* ── Exchange Switcher ──────────────────────────────────────────────────────── */

type ExchangeOption = {
  id:       string;
  label:    string;
  color:    string;
  disabled?: boolean;
  soon?:    boolean;
  isSim?:   boolean;
};

const EXCHANGES: ExchangeOption[] = [
  { id: "kraken",   label: "Kraken",   color: "#5741d9"                              },
  { id: "sim",      label: "SIM",      color: "#ffaa00", isSim: true                 },
  { id: "coinbase", label: "Coinbase", color: "#2775ca", disabled: true, soon: true  },
  { id: "binance",  label: "Binance",  color: "#f0b90b", disabled: true, soon: true  },
  { id: "bybit",    label: "Bybit",    color: "#f7a600", disabled: true, soon: true  },
  { id: "bitget",   label: "Bitget",   color: "#00cfa0", disabled: true, soon: true  },
  { id: "kucoin",   label: "KuCoin",   color: "#24ae8f", disabled: true, soon: true  },
  { id: "okx",      label: "OKX",      color: "#b0b0b0", disabled: true, soon: true  },
  { id: "gateio",   label: "Gate.io",  color: "#2354e6", disabled: true, soon: true  },
];

function ExchangeSwitcher({
  isLive, exName, onSelectSim, onSelectLive,
}: {
  isLive:       boolean;
  exName:       string;
  onSelectSim:  () => void;
  onSelectLive: (exchange: string) => void;
}) {
  const activeId = !isLive ? "sim" : (exName.toLowerCase() || "kraken");

  return (
    <div className="flex items-center gap-px p-0.5 rounded-lg flex-shrink-0"
      style={{
        background:      "#020a12",
        border:          "1px solid #0d1e2e",
        overflow:        "hidden",
      }}>
      {EXCHANGES.map(ex => {
        const isActive   = activeId === ex.id;
        const isDisabled = !!ex.disabled;

        return (
          <button
            key={ex.id}
            disabled={isDisabled}
            onClick={() => {
              if (isDisabled) return;
              if (ex.isSim)   onSelectSim();
              else            onSelectLive(ex.id);
            }}
            title={isDisabled ? `${ex.label} — coming soon` : `Switch to ${ex.label}`}
            className="flex items-center gap-1 rounded font-mono font-bold transition-all flex-shrink-0"
            style={{
              padding:       "5px 9px",
              fontSize:      "9px",
              letterSpacing: "0.07em",
              whiteSpace:    "nowrap",
              cursor:        isDisabled ? "not-allowed" : "pointer",
              ...(isActive ? {
                background: `${ex.color}1e`,
                color:       ex.color,
                border:     `1px solid ${ex.color}48`,
                boxShadow:  `0 0 12px ${ex.color}28, inset 0 0 8px ${ex.color}0c`,
              } : isDisabled ? {
                background: "transparent",
                color:      "#1a2e3a",
                border:     "1px solid transparent",
              } : {
                background: "transparent",
                color:      "#4a7a94",
                border:     "1px solid transparent",
              }),
            }}
            onMouseEnter={e => {
              if (!isActive && !isDisabled) {
                e.currentTarget.style.color      = "#C7D4E2";
                e.currentTarget.style.background = "#0d1e2e";
                e.currentTarget.style.border     = "1px solid #1a3050";
              }
            }}
            onMouseLeave={e => {
              if (!isActive && !isDisabled) {
                e.currentTarget.style.color      = "#4a7a94";
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.border     = "1px solid transparent";
              }
            }}
          >
            {isActive && (
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: ex.color, boxShadow: `0 0 5px ${ex.color}` }} />
            )}
            <span>{ex.label}</span>
            {ex.soon && (
              <span className="text-[6px] font-bold px-1 py-px rounded-sm font-mono leading-none"
                style={{ background: "#ffffff06", color: "#2a4050", border: "1px solid #1a2a35" }}>
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
    refetchInterval: 3_000, ...Q_OPTS,
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
  const { data: simAccount } = useQuery<SimAccount>({
    queryKey: ["sim-account-cmd"],
    queryFn:  () => fetch("/api/simulation/account", { cache: "no-store" }).then(r => r.json()),
    refetchInterval: 5_000, ...Q_OPTS,
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

  const simTrades: Trade[] = (simAccount?.positions ?? []).map(p => ({
    id:         p.id,
    symbol:     p.symbol,
    side:       p.side.toUpperCase(),
    amount:     p.quantity,
    price:      p.entryPrice,
    pnl:        p.unrealizedPnL,
    pnlPercent: p.unrealizedPnLPct,
    status:     "open",
    mode:       "simulation",
    timestamp:  new Date(p.entryTime).toISOString(),
    closedAt:   null,
  }));

  const displayTrades: Trade[] = [
    ...simTrades,
    ...(trades ?? []).filter(t => t.status === "closed"),
  ];
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

      {/* ③ Command strip — two rows: top = identity + actions, bottom = exchange switcher */}
      <div className="flex-shrink-0 border-b" style={{ borderBottomColor: "#0d1520", background: "#000000" }}>

        {/* Row A: identity + action controls + clock */}
        <div className="flex items-center gap-2 px-3 py-2">
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

          <div className="w-px h-4 mx-2 flex-shrink-0" style={{ background: "#1a2a36" }} />

          {/* PAUSE */}
          <button onClick={togglePause}
            className="flex items-center gap-1.5 text-[9px] font-bold px-3 py-1.5 rounded font-mono transition-all border"
            style={isPaused
              ? { background: "#ffaa0012", color: "#ffaa00", borderColor: "#ffaa0038", boxShadow: "0 0 8px #ffaa0020" }
              : { background: "transparent", color: "#9FB3C8", borderColor: "#1c2a36" }}>
            {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {isPaused ? "RESUME" : "PAUSE"}
          </button>

          {/* KILL SWITCH */}
          <button onClick={toggleKill}
            className="flex items-center gap-1.5 text-[9px] font-bold px-3 py-1.5 rounded font-mono transition-all border"
            style={isKill
              ? { background: "#ff225514", color: "#ff2255", borderColor: "#ff225540", boxShadow: "0 0 8px #ff225520" }
              : { background: "transparent", color: "#9FB3C8", borderColor: "#1c2a36" }}>
            <ShieldOff className="w-3 h-3" />
            {isKill ? "KILL ACTIVE" : "KILL SWITCH"}
          </button>

          <div className="flex-1" />

          {/* Last tick clock */}
          <div className="flex items-center gap-1.5 text-[8px] font-mono font-medium"
            style={{ color: "#2a4050" }}>
            <Clock className="w-3 h-3" />
            {ago(engine?.lastTickAt ?? null)}
          </div>
        </div>

        {/* Row B: Exchange switcher — full-width, clearly visible */}
        <div className="flex items-center px-3 pb-2 gap-3">
          <span className="text-[8px] font-mono font-bold tracking-[0.15em] flex-shrink-0"
            style={{ color: "#4a6a80" }}>
            EXCHANGE
          </span>
          <ExchangeSwitcher
            isLive={isLive}
            exName={exName}
            onSelectSim={selectSim}
            onSelectLive={selectLive}
          />
          <span className="text-[8px] font-mono font-medium ml-2 flex-shrink-0"
            style={{ color: "#2a3a4a" }}>
            {isLive ? `LIVE · ${exName.toUpperCase()}` : "SIMULATION MODE"}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-2 sm:p-3 space-y-2 max-w-screen-2xl mx-auto w-full">

        {/* ④ Chart wall */}
        <CryptoChartGrid breakdowns={breakdowns} />

        {/* ⑤ Three-column: Platform Overview | Terminal Feed | Scanner */}
        <div className="grid gap-2" style={{ gridTemplateColumns: "260px 1fr 260px", height: 780 }}>
          <PlatformOverviewPanel simAccount={simAccount} />
          <RichTerminalFeed engine={engine} />
          <OpportunityScanner breakdowns={breakdowns} />
        </div>

        {/* ⑥ Active Trades LEFT | Recently Closed RIGHT */}
        <ActiveTradesPanel trades={displayTrades} />

        {/* ⑦ 8-container unified grid */}
        <MiddleStatsGrid
          trades={trades} engine={engine}
          exchangeStatus={exchangeStatus} feeSummary={feeSummary}
        />

        {/* ⑧ Bottom analytics */}
        <BottomAnalyticsRow engine={engine} trades={trades} />

      </div>
    </div>
  );
}
