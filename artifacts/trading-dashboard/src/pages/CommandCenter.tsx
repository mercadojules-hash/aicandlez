/**
 * /command — AICandlez Institutional Trading Workstation (operator console)
 *
 * Desktop-only command center. Matte black + neon green.
 *
 *   ┌─ CommandBar ─────────────────────────────────────────────────────────────┐
 *   ├─ PlatformOverview  (13-metric global telemetry) ─────────────────────────┤
 *   ├─ LiveAccountPanel  (my Kraken proof-of-performance) ─────────────────────┤
 *   ├─ MarketHeartbeat   (BTC ETH SOL · NVDA TSLA SPY · live sparklines) ──────┤
 *   ├─ PositionsRow      (Active · Closed hedge-fund blotter) ────────────────-┤
 *   ├─ LiveControlBar    ENABLE LIVE AI CRYPTO TRADING ───────────────────────-┤
 *   ├─ Top 20 Crypto Signals (grouped LONG / SHORT) ──────────────────────────-┤
 *   ├─ LiveControlBar    ENABLE LIVE AI EQUITIES TRADING ──────────────────────┤
 *   └─ Top 20 Equity Signals (grouped LONG / SHORT) ──────────────────────────-┘
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LiveConsentModal, useLiveConsent } from "@/components/ConsentGate";

// ── Operator bypass ───────────────────────────────────────────────────────────
// The /command desktop console is the institutional operator surface.
// Admin / super-admin / operator accounts have FULL unrestricted access:
//   • no consent modal     • no subscription gate
//   • no onboarding gate   • no live-trading paywall
//   • all controls unlocked at all times
// `useOperatorRole` resolves the bypass flag from /api/auth/me (DB-backed role).
interface MeResponse { role?: string }
function useOperatorRole(): { isOperator: boolean; isRoleResolved: boolean } {
  const { data, status, fetchStatus } = useQuery<MeResponse>({
    queryKey:  ["auth-me"],
    queryFn:   async () => {
      const r = await fetch("/api/auth/me");
      if (!r.ok) throw new Error(`auth/me ${r.status}`);
      return r.json() as Promise<MeResponse>;
    },
    // staleTime: 0 + refetchOnMount: "always" forces a fresh role read on
    // every mount, eliminating the stale-cache race entirely. Combined with
    // the fetchStatus === "idle" check in `isRoleResolved`, the modal
    // cannot render until a fresh /auth/me response confirms role identity.
    staleTime:        0,
    refetchOnMount:   "always",
    retry:            2,
  });
  const role = (data?.role ?? "").toLowerCase();
  // Role is only "resolved" when we have a definitive successful response AND
  // there is no in-flight refetch. This blocks ALL race windows including:
  //   • initial load (status !== "success")
  //   • error states (status === "error")
  //   • stale-cache background refetch (fetchStatus === "fetching")
  // The consent modal must NEVER appear before role is fully settled.
  const isRoleResolved =
    status === "success" && data !== undefined && fetchStatus === "idle";
  return {
    isOperator:     role === "admin" || role === "super-admin" || role === "operator",
    isRoleResolved,
  };
}

import {
  CommandBar, PlatformOverview, LiveAccountPanel,
  MarketHeartbeat, PositionsRow, LiveControlBar,
  CryptoSignalsPanel, EquitySignalsPanel,
} from "@/components/command/institutional";
import { N } from "@/components/command/institutional/theme";

import type {
  EngineStatus, AppSettings, Trade, ExchangeStatus, SimAccount, LiveBalance,
} from "@/components/command/types";

const Q_FAST   = { refetchInterval: 2_000, refetchOnWindowFocus: false, staleTime: 0 } as const;
const Q_MEDIUM = { refetchInterval: 4_000, refetchOnWindowFocus: false, staleTime: 0 } as const;
const Q_SLOW   = { refetchInterval: 10_000, refetchOnWindowFocus: false, staleTime: 0 } as const;

const j = <T,>(url: string) =>
  fetch(url, { cache: "no-store" }).then(r => r.json() as Promise<T>);

export default function CommandCenter() {
  const qc = useQueryClient();
  const { isOperator, isRoleResolved } = useOperatorRole();

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

  void settings;

  /* ── Active exchange ──────────────────────────────────────────────────── */
  const mode       = exchangeStatus?.mode ?? "simulation";
  const liveActive = mode !== "simulation" && (exchangeStatus?.liveEnabled ?? false);
  const activeId   = liveActive ? mode : "sim";
  const isPaused   = exchangeStatus?.paused ?? false;

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
    // Operator bypass — admins skip the consent gate entirely.
    if (isOperator) { switchExchangeMode(id, id); return; }
    // Role must be definitively resolved before we ever open the modal.
    // Loading / error / refetch / stale-cache states all block the modal.
    if (!isRoleResolved) return;
    if (hasConsented) {
      switchExchangeMode(id, id);
    } else {
      setPendingLiveEx(id);
    }
  };

  // Defensive auto-close — if the modal was opened before role resolved and the
  // user turns out to be an operator, close it immediately and proceed.
  useEffect(() => {
    if (isOperator && pendingLiveEx) {
      const id = pendingLiveEx;
      setPendingLiveEx(null);
      switchExchangeMode(id, id);
    }
    // switchExchangeMode is a stable closure within this render — intentionally
    // omitted from deps to avoid re-firing on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOperator, pendingLiveEx]);

  /* ── Live-trading control bars (operator) ─────────────────────────────── */
  // Operator surface uses institutional language — no "SIMULATION" pills.
  // CRYPTO control bar mirrors the actual exchange mode (kraken/etc).
  const cryptoState: "LIVE" | "STANDBY" | "PAUSED" =
    isPaused ? "PAUSED" : liveActive ? "LIVE" : "STANDBY";

  // Cycle: STANDBY → LIVE → PAUSED → STANDBY
  const toggleCryptoLive = () => {
    if (isPaused)   { togglePause(); selectSim(); return; }  // PAUSED → STANDBY
    if (liveActive) { togglePause(); return; }               // LIVE   → PAUSED
    selectLive("kraken");                                    // STANDBY → LIVE
  };

  // EQUITIES control bar is operator-local for now — wire to real alpaca/etc later.
  const [equitiesLive, setEquitiesLive] = useState(false);
  const equitiesState: "LIVE" | "STANDBY" | "PAUSED" = equitiesLive ? "LIVE" : "STANDBY";
  const toggleEquitiesLive = () => setEquitiesLive(v => !v);
  useEffect(() => { if (isPaused) setEquitiesLive(false); }, [isPaused]);

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
        backgroundImage: `radial-gradient(1200px 600px at 50% -10%, ${N.BRAND}06 0%, transparent 60%), radial-gradient(800px 400px at 20% 100%, ${N.BRAND_DEEP}05 0%, transparent 55%)`,
      }}
    >
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

      <main className="flex-1 flex flex-col gap-2 py-2"
            style={{ maxWidth: 1880, width: "100%", margin: "0 auto" }}>

        {/* Row 0 — Global platform telemetry */}
        <div className="px-2">
          <PlatformOverview />
        </div>

        {/* Row 1 — My live Kraken account */}
        <div className="px-2">
          <LiveAccountPanel
            engine={engine}
            exchangeStatus={exchangeStatus}
            liveBalance={liveBalance}
            trades={tradesArr}
          />
        </div>

        {/* Row 2 — Market Heartbeat */}
        <MarketHeartbeat />

        {/* Row 3 — Positions blotter */}
        <PositionsRow
          positions={livePositions}
          openTrades={openTrades}
          closedTrades={closedTrades}
        />

        {/* Row 4 — Bar+Panel pairs, side-by-side. Each control bar sits
            DIRECTLY ABOVE its own signal panel (per asset class). */}
        <section
          className="grid gap-2 px-2 mt-1"
          style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}
        >
          <div className="flex flex-col gap-2">
            <LiveControlBar
              assetClass="CRYPTO"
              state={cryptoState}
              onToggle={toggleCryptoLive}
            />
            <CryptoSignalsPanel engine={engine} />
          </div>
          <div className="flex flex-col gap-2">
            <LiveControlBar
              assetClass="EQUITIES"
              state={equitiesState}
              onToggle={toggleEquitiesLive}
            />
            <EquitySignalsPanel engine={engine} />
          </div>
        </section>

        <footer
          className="px-3 py-2 flex items-center justify-between text-[8.5px] font-bold tracking-[0.22em]"
          style={{
            color: N.TEXT_3,
            borderTop: `1px solid ${N.BORDER}`,
            fontFamily: N.FONT_MONO,
          }}
        >
          <span>AICANDLEZ · OPERATOR COMMAND CENTER · v2.1{isOperator ? " · INTERNAL ACCESS" : ""}</span>
          <span>AI ENGINE · {engine?.running ? "RUNNING" : "IDLE"} · {engine?.signalsGenerated ?? 0} SIGNALS · {engine?.tradesExecuted ?? 0} EXECS · {isOperator ? "OPERATOR · ALL GATES BYPASSED · UNLIMITED" : "UNLIMITED"}</span>
        </footer>
      </main>

      {/* Consent modal — render-gate triple-locks against operator surfaces:
          must have a pending exchange, role must be resolved, and user must
          NOT be an operator. Any one being false hard-blocks display. */}
      <LiveConsentModal
        open={pendingLiveEx !== null && isRoleResolved && !isOperator}
        onConsented={() => {
          if (pendingLiveEx) switchExchangeMode(pendingLiveEx, pendingLiveEx);
          setPendingLiveEx(null);
        }}
        onCancel={() => setPendingLiveEx(null)}
      />
    </div>
  );
}
