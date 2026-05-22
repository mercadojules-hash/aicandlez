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
import { useAuth } from "@clerk/react";
import { LiveConsentModal, useLiveConsent } from "@/components/ConsentGate";

const apiBaseUrl = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ??
  (import.meta.env.BASE_URL ?? "/")
).replace(/\/$/, "");

// ── Operator bypass ───────────────────────────────────────────────────────────
// The /command desktop console is the institutional operator surface.
// Admin / super-admin / operator accounts have FULL unrestricted access:
//   • no consent modal     • no subscription gate
//   • no onboarding gate   • no live-trading paywall
//   • all controls unlocked at all times
// `useOperatorRole` resolves the bypass flag from /api/auth/me (DB-backed role).
interface MeResponse { role?: string }
function useOperatorRole(): { isOperator: boolean; isRoleResolved: boolean } {
  const { getToken } = useAuth();
  const { data, status, fetchStatus } = useQuery<MeResponse>({
    queryKey:  ["auth-me"],
    queryFn:   async () => {
      // Cross-subdomain Bearer fallback — see useUserRole.ts for rationale.
      const token = await getToken().catch(() => null);
      const r = await fetch(`${apiBaseUrl}/api/auth/me`, {
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
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
  CommandBar, PlatformOverview, OperatorTelemetryGrid, LiveAccountPanel,
  MarketHeartbeat, PositionsRow, LiveControlBar,
  CryptoSignalsPanel, EquitySignalsPanel,
} from "@/components/command/institutional";
import { N } from "@/components/command/institutional/theme";
import EngineHeartbeat from "@/components/EngineHeartbeat";
import LiveExecutionStream from "@/components/LiveExecutionStream";

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
  // Operator surface is LIVE-only — default the highlighted exchange tab to
  // KRAKEN when the engine hasn't reported a live mode yet (so the tab is
  // visually selected the moment the page mounts, even before the auto-arm
  // effect resolves).
  const activeId   = liveActive ? mode : "kraken";
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

  // NOTE: We do NOT auto-arm the engine on mount. Operator must explicitly
  // click the live-execution bar to switch the broker into live mode. The
  // CommandBar still highlights KRAKEN as the default exchange visually so
  // it's the obvious one-click target, but no live POST happens until
  // the operator presses ENABLE LIVE AI CRYPTO EXECUTION.

  /* ── Live-trading control bars (operator) ─────────────────────────────── */
  // Operator surface = two states only: HALTED (red, default) ↔ ARMED (gold).
  // No neutral STANDBY on the operator dashboard — the engine is either live
  // or it is hard-stopped. The bar starts HALTED on every mount until the
  // operator manually arms it.
  const cryptoState: "LIVE" | "STANDBY" | "PAUSED" =
    liveActive && !isPaused ? "LIVE" : "PAUSED";

  const toggleCryptoLive = () => {
    if (liveActive && !isPaused) {
      // ARMED → HALTED. Stop execution by pausing the engine.
      togglePause();
      return;
    }
    if (liveActive && isPaused) {
      // HALTED (already in live mode, just paused) → resume to ARMED.
      togglePause();
      return;
    }
    // HALTED + not in live mode → arm Kraken live execution.
    selectLive("kraken");
  };

  // EQUITIES execution is intentionally OFF for this phase — Kraken crypto
  // is the only sanctioned live broker. The equities bar renders HALTED/red
  // and is non-interactive.
  const equitiesState: "LIVE" | "STANDBY" | "PAUSED" = "PAUSED";
  const toggleEquitiesLive = () => { /* disabled — equities live not enabled */ };

  /* ── Derived trade pools ──────────────────────────────────────────────────
   * Operator dashboard rule: NEVER render simulated execution.
   *   - Active Positions  → ONLY when live engine is armed; otherwise empty.
   *   - Closed Trade Hist → ONLY real-execution rows; sim history is hidden.
   * If Kraken has no positions, the blotter is genuinely empty by design. */
  const tradesArr     = Array.isArray(trades) ? trades : [];
  const liveTrades    = liveActive
    ? tradesArr.filter(t => (t.mode ?? "").toLowerCase() === "live" || (t as { source?: string }).source === "live")
    : [];
  // If `mode`/`source` columns aren't populated yet, fall back to ALL trades
  // ONLY when live is armed — otherwise nothing renders.
  const effectiveTrades = liveTrades.length > 0 || !liveActive ? liveTrades : tradesArr;
  const openTrades    = effectiveTrades.filter(t => t.status?.toLowerCase() === "open");
  const closedTrades  = effectiveTrades.filter(t => t.status?.toLowerCase() !== "open" || t.exitPrice != null);
  const livePositions: SimAccount["positions"] = [];

  /* ── Live-execution confidence eligibility (80% hard floor) ───────────────
   * Compute the strongest current AI confidence per asset class from engine
   * breakdowns. STANDBY → ARMED transition is blocked unless ≥80%.
   * Backend `autoExecute` enforces the same floor as a hard rule. */
  const breakdowns = engine?.symbolBreakdowns ?? {};
  const CRYPTO_SYMS = new Set(["BTC","ETH","SOL","XRP","ADA","AVAX","DOGE","LINK","DOT","MATIC","LTC","ATOM","NEAR","ALGO","FIL","ARB","OP","INJ","SUI","APT","BCH","UNI","AAVE","ETC"]);
  let cryptoMax = 0, equitiesMax = 0;
  for (const [sym, b] of Object.entries(breakdowns)) {
    const base = sym.replace(/[\/-].*$/,"").replace(/USD[TC]?$/,"").toUpperCase();
    const conf = b?.avgConfidence ?? 0;
    if (CRYPTO_SYMS.has(base)) cryptoMax   = Math.max(cryptoMax,   conf);
    else                       equitiesMax = Math.max(equitiesMax, conf);
  }
  const LIVE_CONF_FLOOR = 80;
  const cryptoEligible   = cryptoMax   >= LIVE_CONF_FLOOR;
  const equitiesEligible = equitiesMax >= LIVE_CONF_FLOOR;
  const cryptoReason   = cryptoMax   > 0 ? `MAX ${cryptoMax.toFixed(0)}% · NEED 80%`   : "AWAITING SIGNALS";
  const equitiesReason = equitiesMax > 0 ? `MAX ${equitiesMax.toFixed(0)}% · NEED 80%` : "AWAITING SIGNALS";

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
        simAccount={undefined}
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

        {/* Row 0b — Operator deep-layer telemetry (admin-only)
            Latency · Funnel · Live Execution Stream · Fees · Subscriptions */}
        {isOperator && <OperatorTelemetryGrid />}

        {/* Row 0c — Live Execution Debugging (admin-only)
            Engine heartbeat + Safe Test Mode controls + real-time execution
            stream from executionStreamBus. The operator must NEVER be blind
            during live execution. */}
        {isOperator && (
          <section className="px-2 grid gap-2" style={{ gridTemplateColumns: "minmax(420px, 1fr) minmax(0, 2fr)" }}>
            <EngineHeartbeat />
            <LiveExecutionStream />
          </section>
        )}

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
              eligible={cryptoEligible}
              eligibilityReason={cryptoReason}
            />
            <CryptoSignalsPanel engine={engine} />
          </div>
          <div className="flex flex-col gap-2">
            <LiveControlBar
              assetClass="EQUITIES"
              state={equitiesState}
              onToggle={toggleEquitiesLive}
              eligible={equitiesEligible}
              eligibilityReason={equitiesReason}
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
