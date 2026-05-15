import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Cpu, Clock, ShieldOff, Pause, Play } from "lucide-react";

import { TickerStrips }          from "@/components/command/TickerStrips";
import { TelemetryRow }          from "@/components/command/TelemetryRow";
import { LiveTradingConsole }    from "@/components/command/LiveTradingConsole";
import { CryptoChartGrid }       from "@/components/command/CryptoChartGrid";
import { PlatformOverviewPanel } from "@/components/command/PlatformOverviewPanel";
import { RichTerminalFeed }      from "@/components/command/RichTerminalFeed";
import { OpportunityScanner }    from "@/components/command/OpportunityScanner";
import { MiddleStatsGrid }       from "@/components/command/MiddleStatsGrid";
import { ActiveTradesPanel }     from "@/components/command/ActiveTradesPanel";
import { BottomAnalyticsRow }    from "@/components/command/BottomAnalyticsRow";
import { PlatformActivityHub }   from "@/components/command/PlatformActivityHub";

import type {
  EngineStatus, AppSettings, Trade, ExchangeStatus, FeeSummary, SimAccount, LiveBalance,
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
  isPaper?: boolean;
};

const EXCHANGES: ExchangeOption[] = [
  { id: "sim",      label: "PAPER AI",   color: "#ffaa00", isSim: true                  },
  { id: "alpaca",   label: "ALPACA",     color: "#30c78d", isPaper: true                },
  { id: "kraken",   label: "Kraken",     color: "#5741d9"                               },
  { id: "coinbase", label: "Coinbase",   color: "#2775ca"                               },
  { id: "binance",  label: "Binance",    color: "#f0b90b"                               },
  { id: "cryptocom",label: "Crypto.com", color: "#1199fa"                               },
  { id: "bybit",    label: "Bybit",      color: "#f7a600", disabled: true, soon: true   },
  { id: "kucoin",   label: "KuCoin",     color: "#24ae8f", disabled: true, soon: true   },
  { id: "okx",      label: "OKX",        color: "#b0b0b0", disabled: true, soon: true   },
  { id: "gateio",   label: "Gate.io",    color: "#2354e6", disabled: true, soon: true   },
];

function ExchangeSwitcher({
  activeId, onSelectSim, onSelectLive,
}: {
  activeId:     string;
  onSelectSim:  () => void;
  onSelectLive: (exchange: string) => void;
}) {

  return (
    <div className="flex items-center gap-1 flex-shrink-0"
      style={{
        background:   "#000000",
        border:       "1px solid #141f2e",
        borderRadius: 10,
        padding:      "5px",
        overflow:     "hidden",
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
            className="flex items-center gap-2 rounded-lg font-mono font-bold transition-all flex-shrink-0"
            style={{
              padding:       "10px 18px",
              fontSize:      "11px",
              letterSpacing: "0.11em",
              whiteSpace:    "nowrap",
              cursor:        isDisabled ? "not-allowed" : "pointer",
              ...(isActive ? {
                background: `${ex.color}22`,
                color:       ex.color,
                border:     `1px solid ${ex.color}70`,
                boxShadow:  `0 0 22px ${ex.color}40, 0 0 8px ${ex.color}20, inset 0 0 14px ${ex.color}12`,
              } : isDisabled ? {
                background: "transparent",
                color:      "#182838",
                border:     "1px solid transparent",
              } : {
                background: "transparent",
                color:      "#3a6070",
                border:     "1px solid transparent",
              }),
            }}
            onMouseEnter={e => {
              if (!isActive && !isDisabled) {
                e.currentTarget.style.color      = "#C7D4E2";
                e.currentTarget.style.background = "#0a1622";
                e.currentTarget.style.border     = `1px solid ${ex.color}35`;
              }
            }}
            onMouseLeave={e => {
              if (!isActive && !isDisabled) {
                e.currentTarget.style.color      = "#3a6070";
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.border     = "1px solid transparent";
              }
            }}
          >
            {/* Active pulse indicator */}
            {isActive && (
              <span
                className="w-2 h-2 rounded-full flex-shrink-0 live-dot"
                style={{ background: ex.color, boxShadow: `0 0 8px ${ex.color}, 0 0 16px ${ex.color}60` }}
              />
            )}

            <span>{ex.label}</span>

            {/* PAPER badge on Alpaca */}
            {ex.isPaper && !isDisabled && (
              <span
                className="font-bold px-1.5 py-0.5 rounded font-mono leading-none"
                style={{
                  fontSize:   "7.5px",
                  background: `${ex.color}18`,
                  color:      isActive ? ex.color : `${ex.color}70`,
                  border:     `1px solid ${ex.color}35`,
                }}
              >
                PAPER
              </span>
            )}

            {/* SOON badge */}
            {ex.soon && (
              <span className="font-bold px-1.5 py-0.5 rounded font-mono leading-none"
                style={{ fontSize: "7px", background: "#ffffff06", color: "#1e3040", border: "1px solid #141e28" }}>
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

  // Optimistic mode — reflects button click immediately before the server round-trip completes.
  // null = use server state; "sim" | "kraken" | "coinbase" | … = pending click
  const [pendingMode,  setPendingMode]  = useState<string | null>(null);
  const [switchError,  setSwitchError]  = useState<string | null>(null);
  const [closingAll,   setClosingAll]   = useState(false);

  const { data: engine } = useQuery<EngineStatus>({
    queryKey: ["engine-status-cmd"],
    queryFn:  () => fetch("/api/engine/status", { cache: "no-store" }).then(r => r.json()),
    refetchInterval: 3_000, ...Q_OPTS,
  });
  const { data: settings, refetch: refetchSettings } = useQuery<AppSettings>({
    queryKey: ["settings-cmd"],
    queryFn:  () => fetch("/api/settings", { cache: "no-store" }).then(r => r.json()),
    refetchInterval: 10_000, ...Q_OPTS,
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
    refetchInterval: 8_000, ...Q_OPTS,
  });
  const { data: feeSummary } = useQuery<FeeSummary>({
    queryKey: ["fees-cmd"],
    queryFn:  () => fetch("/api/fees", { cache: "no-store" }).then(r => r.json()),
    refetchInterval: 30_000, ...Q_OPTS,
  });

  const isKill   = exchangeStatus?.killSwitch ?? false;
  const isPaused = exchangeStatus?.paused     ?? false;
  const isLive   = exchangeStatus?.mode === "live";
  const exName   = exchangeStatus?.exchangeName ?? "kraken";

  // Adapter name → button ID (adapter uses canonical names, buttons use short IDs)
  const ADAPTER_TO_BTN: Record<string, string> = {
    "cryptodotcom": "cryptocom",
    "cryptodotcom.com": "cryptocom",
    "binanceus": "binance",
  };
  const normalizeExId = (n: string) =>
    ADAPTER_TO_BTN[n.toLowerCase().replace(/[\s._-]/g, "")] ?? n.toLowerCase();

  // Resolved active mode: pending click wins until server confirms
  const confirmedId = !isLive ? "sim" : normalizeExId(exName);
  const activeId    = pendingMode ?? confirmedId;
  const liveActive  = activeId !== "sim";

  // /api/simulation/account: only poll when in simulation mode (confirmed + not switching to live)
  const simEnabled = !liveActive;
  const { data: simAccount } = useQuery<SimAccount>({
    queryKey: ["sim-account-cmd"],
    queryFn:  () => fetch("/api/simulation/account", { cache: "no-store" }).then(r => r.json()),
    refetchInterval: simEnabled ? 5_000 : false,
    enabled:         simEnabled,
    ...Q_OPTS,
  });

  // /api/exchange/balances: keyed by activeId — each exchange has its own cache slot
  const { data: liveBalance } = useQuery<LiveBalance>({
    queryKey: ["live-balance-cmd", activeId],
    queryFn:  () => fetch("/api/exchange/balances", { cache: "no-store" }).then(r => r.json()),
    refetchInterval: liveActive ? 15_000 : false,
    enabled:         liveActive,
    ...Q_OPTS,
  });

  const breakdowns = engine ? Object.values(engine.symbolBreakdowns) : [];

  const simTrades: Trade[] = (simAccount?.positions ?? []).map(p => ({
    id:          p.id,
    symbol:      p.symbol,
    side:        p.side.toUpperCase(),
    amount:      p.quantity,
    price:       p.entryPrice,
    exitPrice:   null,
    pnl:         p.unrealizedPnL,
    pnlPercent:  p.unrealizedPnLPct,
    status:      "open",
    mode:        "simulation",
    signalId:    null,
    stopLoss:    null,
    takeProfit:  null,
    reason:      null,
    timestamp:   new Date(p.entryTime).toISOString(),
    closedAt:    null,
  }));

  const displayTrades: Trade[] = [
    ...simTrades,
    ...(trades ?? []),
  ];

  const invalidateExchange = () => {
    qc.invalidateQueries({ queryKey: ["exchange-status-cmd"] });
    void refetchExchange().then(() => setPendingMode(null));
  };

  const closeAllPositions = () => {
    setClosingAll(true);
    fetch("/api/engine/close-all-positions", { method: "POST", cache: "no-store" })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["trades-cmd"] });
        qc.invalidateQueries({ queryKey: ["sim-account-cmd"] });
      })
      .finally(() => setClosingAll(false));
  };

  const toggleKill  = () => fetch("/api/exchange/kill",  { method: "POST", cache: "no-store" })
    .then(() => { qc.invalidateQueries({ queryKey: ["exchange-status-cmd"] }); void refetchExchange(); });
  const togglePause = () => fetch("/api/exchange/pause", { method: "POST", cache: "no-store" })
    .then(() => { qc.invalidateQueries({ queryKey: ["exchange-status-cmd"] }); void refetchExchange(); });

  const startEngine = () => fetch("/api/engine/start", { method: "POST", cache: "no-store" })
    .then(() => qc.invalidateQueries({ queryKey: ["engine-status-cmd"] }));
  const stopEngine  = () => fetch("/api/engine/stop",  { method: "POST", cache: "no-store" })
    .then(() => qc.invalidateQueries({ queryKey: ["engine-status-cmd"] }));

  const settingsPatch = (patch: Record<string, number | boolean>) =>
    fetch("/api/settings", {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(patch),
      cache:   "no-store",
    }).then(() => { void refetchSettings(); });

  // pendingId: the button ID that should highlight immediately ("sim" | "kraken" | …)
  // apiMode:   what to send to the backend ("simulation" | "kraken" | …)
  const switchExchangeMode = (pendingId: string, apiMode: string) => {
    setPendingMode(pendingId);
    setSwitchError(null);
    // Clear stale sim data when switching away from simulation
    if (pendingId !== "sim") {
      qc.removeQueries({ queryKey: ["sim-account-cmd"] });
    }
    // Remove stale live-balance cache for the previous exchange before fetching fresh
    qc.removeQueries({ queryKey: ["live-balance-cmd"] });

    fetch("/api/engine/exchange-mode", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ mode: apiMode }),
      cache:   "no-store",
    })
      .then(r => {
        if (!r.ok) return r.json().then((j: { error?: string }) => Promise.reject(j.error ?? "Exchange switch failed"));
        return r.json();
      })
      .then(() => { setSwitchError(null); invalidateExchange(); })
      .catch((err: unknown) => {
        setPendingMode(null);
        setSwitchError(typeof err === "string" ? err : "Exchange switch failed — check API key configuration in Settings");
      });
  };

  const selectSim  = ()           => switchExchangeMode("sim", "simulation");
  const selectLive = (ex: string) => switchExchangeMode(ex.toLowerCase(), ex.toLowerCase());

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#060810" }}>

      {/* ① Live Trading Console — always visible at the top */}
      <LiveTradingConsole
        engine={engine}
        settings={settings}
        exchangeStatus={exchangeStatus}
        trades={trades}
        simAccount={liveActive ? undefined : simAccount}
        liveBalance={liveBalance}
        activeId={activeId}
        liveActive={liveActive}
        onToggleKill={toggleKill}
        onTogglePause={togglePause}
        onStartEngine={startEngine}
        onStopEngine={stopEngine}
        onSettingsPatch={settingsPatch}
        onSelectSim={selectSim}
        onSelectLive={selectLive}
        switchError={switchError}
        onClearSwitchError={() => setSwitchError(null)}
        onCloseAllPositions={closeAllPositions}
        closingAll={closingAll}
      />

      {/* ② Ticker strips */}
      <TickerStrips engine={engine} />

      {/* ② Telemetry panels — two rows */}
      <TelemetryRow
        engine={engine} settings={settings}
        trades={trades} exchangeStatus={exchangeStatus} feeSummary={feeSummary}
        liveBalance={liveBalance} simAccount={liveActive ? undefined : simAccount}
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
            activeId={activeId}
            onSelectSim={selectSim}
            onSelectLive={selectLive}
          />
          <span className="text-[8px] font-mono font-medium ml-2 flex-shrink-0"
            style={{ color: "#2a3a4a" }}>
            {liveActive ? `LIVE · ${activeId.toUpperCase()}` : "SIMULATION MODE"}
          </span>
        </div>
      </div>

      {/* ④ Platform Activity Hub — operator layer before chart wall */}
      <PlatformActivityHub
        engine={engine}
        exchangeStatus={exchangeStatus}
        feeSummary={feeSummary}
      />

      {/* Main content */}
      <div className="flex-1 p-2 sm:p-3 space-y-2 max-w-screen-2xl mx-auto w-full">

        {/* ⑤ Chart wall */}
        <CryptoChartGrid breakdowns={breakdowns} />

        {/* ⑤ Three-column: Platform Overview | Terminal Feed | Scanner */}
        <div className="grid gap-2" style={{ gridTemplateColumns: "305px 1fr 290px", height: 960 }}>
          <PlatformOverviewPanel simAccount={liveActive ? undefined : simAccount} liveBalance={liveBalance} engine={engine} feeSummary={feeSummary} exchangeName={exchangeStatus?.exchangeName} liveActive={liveActive} />
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
