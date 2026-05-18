/**
 * /command — AICandlez Institutional Trading Workstation
 *
 * Desktop-only dashboard. 3-row layout, Bloomberg / TradingView / hedge-fund
 * aesthetic, matte black + neon green.
 *
 *   ┌─ CommandBar ─────────────────────────────────────────────────────────┐
 *   ├─ MarketHeartbeat (BTC ETH SOL · NVDA TSLA SPY · live sparklines) ────┤
 *   ├─ Active Positions          |  Closed Positions ─────────────────────-┤
 *   └─ Top 20 Crypto Signals     |  Top 20 Equity Signals (long/short) ───┘
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LiveConsentModal, useLiveConsent } from "@/components/ConsentGate";

import {
  CommandBar, MarketHeartbeat, PositionsRow, SignalsRow,
} from "@/components/command/institutional";
import { N } from "@/components/command/institutional/theme";

import type {
  EngineStatus, AppSettings, Trade, ExchangeStatus, SimAccount, LiveBalance,
} from "@/components/command/types";

/* ── React-Query options (poll cadence) ─────────────────────────────────── */
const Q_FAST   = { refetchInterval: 2_000, refetchOnWindowFocus: false, staleTime: 0 } as const;
const Q_MEDIUM = { refetchInterval: 4_000, refetchOnWindowFocus: false, staleTime: 0 } as const;
const Q_SLOW   = { refetchInterval: 10_000, refetchOnWindowFocus: false, staleTime: 0 } as const;

const j = <T,>(url: string) =>
  fetch(url, { cache: "no-store" }).then(r => r.json() as Promise<T>);

export default function CommandCenter() {
  const qc = useQueryClient();

  /* ── Data ─────────────────────────────────────────────────────────────── */
  const { data: engine }   = useQuery({ queryKey: ["engine-status-cmd"],   queryFn: () => j<EngineStatus>("/api/engine/status"),     ...Q_MEDIUM });
  const { data: settings } = useQuery({ queryKey: ["settings-cmd"],        queryFn: () => j<AppSettings>("/api/settings"),           ...Q_SLOW   });
  const { data: trades }   = useQuery({ queryKey: ["trades-cmd"],          queryFn: () => j<Trade[]>("/api/trades"),                 ...Q_FAST   });
  const { data: exchangeStatus, refetch: refetchExchange } = useQuery({
    queryKey: ["exchange-status-cmd"],
    queryFn:  () => j<ExchangeStatus>("/api/exchange/status"),
    ...Q_MEDIUM,
  });
  const { data: simAccount }  = useQuery({ queryKey: ["sim-account-cmd"],  queryFn: () => j<SimAccount>("/api/simulation/account"),  ...Q_FAST   });
  const { data: liveBalance } = useQuery({ queryKey: ["live-balance-cmd"], queryFn: () => j<LiveBalance>("/api/exchange/balances"),  ...Q_MEDIUM });

  void settings; // settings PATCH UI lives elsewhere; keep call to warm cache

  /* ── Active exchange ──────────────────────────────────────────────────── */
  const mode       = exchangeStatus?.mode ?? "simulation";
  const liveActive = mode !== "simulation" && (exchangeStatus?.liveEnabled ?? false);
  const activeId   = liveActive ? mode : "sim";

  /* ── Consent flow ─────────────────────────────────────────────────────── */
  const { hasConsented } = useLiveConsent();
  const [pendingLiveEx, setPendingLiveEx] = useState<string | null>(null);

  /* ── Mutations ────────────────────────────────────────────────────────── */
  const post = (url: string, body?: Record<string, unknown>) =>
    fetch(url, {
      method:  "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body:    body ? JSON.stringify(body) : undefined,
      cache:   "no-store",
    });

  const startEngine = () => post("/api/engine/start").then(() => qc.invalidateQueries({ queryKey: ["engine-status-cmd"] }));
  const stopEngine  = () => post("/api/engine/stop").then(()  => qc.invalidateQueries({ queryKey: ["engine-status-cmd"] }));
  const togglePause = () => post("/api/exchange/pause").then(() => { void refetchExchange(); });
  const toggleKill  = () => post("/api/exchange/kill").then(()  => { void refetchExchange(); });

  const switchExchangeMode = (pendingId: string, apiMode: string) => {
    if (pendingId !== "sim") qc.removeQueries({ queryKey: ["sim-account-cmd"] });
    qc.removeQueries({ queryKey: ["live-balance-cmd"] });
    post("/api/engine/exchange-mode", { mode: apiMode })
      .then(() => qc.invalidateQueries({ queryKey: ["exchange-status-cmd"] }));
  };

  const selectSim  = () => switchExchangeMode("sim", "simulation");
  const selectLive = (ex: string) => {
    const id = ex.toLowerCase();
    if (hasConsented) {
      switchExchangeMode(id, id);
    } else {
      setPendingLiveEx(id);
    }
  };

  /* ── Derived trade pools ──────────────────────────────────────────────── */
  const tradesArr     = Array.isArray(trades) ? trades : [];
  const openTrades    = tradesArr.filter(t => t.status?.toLowerCase() === "open");
  const closedTrades  = tradesArr.filter(t => t.status?.toLowerCase() !== "open" || t.exitPrice != null);
  const livePositions = liveActive ? [] : (simAccount?.positions ?? []);

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div
      className="flex flex-col min-h-screen w-full"
      style={{
        background: N.BG,
        // Subtle radial neon-green glow behind the workstation
        backgroundImage: `radial-gradient(1200px 600px at 50% -10%, ${N.BRAND}06 0%, transparent 60%), radial-gradient(800px 400px at 20% 100%, ${N.BRAND_DEEP}05 0%, transparent 55%)`,
      }}
    >
      {/* Slim top bar */}
      <CommandBar
        engine={engine}
        exchangeStatus={exchangeStatus}
        simAccount={liveActive ? undefined : simAccount}
        liveBalance={liveBalance}
        activeId={activeId}
        liveActive={liveActive}
        onStartEngine={startEngine}
        onStopEngine={stopEngine}
        onTogglePause={togglePause}
        onToggleKill={toggleKill}
        onSelectSim={selectSim}
        onSelectLive={selectLive}
      />

      {/* Workstation body — desktop widescreen layout */}
      <main className="flex-1 flex flex-col gap-2 py-2"
            style={{ maxWidth: 1880, width: "100%", margin: "0 auto" }}>

        {/* ── Row 1: Market Heartbeat ─────────────────────────────────── */}
        <MarketHeartbeat />

        {/* ── Row 2: Positions ────────────────────────────────────────── */}
        <PositionsRow
          positions={livePositions}
          openTrades={openTrades}
          closedTrades={closedTrades}
        />

        {/* ── Row 3: Top 20 Crypto + Top 20 Equity Signals ────────────── */}
        <SignalsRow engine={engine} />

        {/* Footer marker */}
        <footer
          className="px-3 py-2 flex items-center justify-between text-[8.5px] font-bold tracking-[0.22em]"
          style={{
            color: N.TEXT_3,
            borderTop: `1px solid ${N.BORDER}`,
            fontFamily: N.FONT_MONO,
          }}
        >
          <span>AICANDLEZ · INSTITUTIONAL DESK · v2.0</span>
          <span>AI EXECUTION ENGINE · {engine?.running ? "RUNNING" : "IDLE"} · {engine?.signalsGenerated ?? 0} SIGNALS · {engine?.tradesExecuted ?? 0} EXECS</span>
        </footer>
      </main>

      {/* Live trading consent modal — gated handoff to live exchanges */}
      <LiveConsentModal
        open={pendingLiveEx !== null}
        onConsented={() => {
          if (pendingLiveEx) switchExchangeMode(pendingLiveEx, pendingLiveEx);
          setPendingLiveEx(null);
        }}
        onCancel={() => setPendingLiveEx(null)}
      />
    </div>
  );
}
