/**
 * OnboardingFlow — post-checkout runtime-activation funnel for trade.aicandlez.com.
 *
 * Triggered by `?checkout=success` query param appearing on any route (the
 * Stripe success URL strips the param after detection so the modal opens
 * exactly once). Renders a 3-step wizard:
 *
 *   1. choose  — "Choose Your Trading Runtime" decision screen with TWO
 *                explicit paths so users understand the architecture:
 *
 *                  BEGINNER / RECOMMENDED   → Use Alpaca
 *                    Alpaca brokerage account, deposit USD directly, AI
 *                    trades on your behalf. When the Alpaca OAuth provider
 *                    is configured we open the one-click popup; otherwise
 *                    we route to `connect` with `preselect="Alpaca"` so the
 *                    user can't accidentally pick a different exchange.
 *
 *                  ADVANCED                 → Connect Existing Exchange
 *                    Coinbase / Kraken / Crypto.com / Binance via API keys.
 *                    Bring your own liquidity & advanced runtime switching.
 *                    Routes to `connect` with no preselect so the user
 *                    picks from the catalog.
 *
 *   2. connect — Hosted via PortalExchangeConnectModal (exchange picker
 *                + key paste + server-side test + AES-256 encryption).
 *   3. ready   — "Runtime Ready" confirmation. Pulls live data from
 *                `useRuntimeState` (active runtime label, hydrated equity),
 *                explains the ARM LIVE gate, and CTAs into the portal.
 *                Persists `acl_first_live_intro_seen_v1` to localStorage so
 *                a returning customer skips straight to "done".
 *
 * Bypass behavior:
 *   - If `?checkout=success` is present AND user already has >=1 connected
 *     exchange AND the ready/intro modal has been seen → skip to "done"
 *     (close immediately).
 *   - If connected but never confirmed → jump straight to "ready" so the
 *     user gets the runtime confirmation even on a re-entry.
 *
 * Compliance copy (LOCKED — do not modify without legal review):
 *   - "Funds remain inside your regulated crypto exchange account."
 *   - "AICandlez never holds customer money."
 *   - "Withdrawal permissions are never requested."
 *   - We NEVER use "deposit money into AICandlez" or any variant.
 */

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, ShieldCheck, Sparkles, ArrowRight, Check, Cpu, Zap, TrendingUp, Wallet } from "lucide-react";
import { PortalExchangeConnectModal } from "./PortalExchangeConnectModal";
import { useRuntimeState, runtimeLabel } from "../hooks/useRuntimeState";

import { authFetch } from "../lib/authFetch";

// Server-driven config for the in-app one-click Alpaca OAuth handshake.
// When `enabled === true`, the Alpaca card opens a one-click OAuth popup
// that stores tokens via CredentialVault. When disabled (env vars missing
// in dev / older deploys), we fall back to the manual connect modal with
// Alpaca preselected — no UI churn.
interface ExchangeOauthConfig { enabled: boolean; authorizeUrl?: string; scope?: string }

const LS_INTRO_SEEN = "acl_first_live_intro_seen_v1";

const N = {
  OVERLAY:    "rgba(0,0,0,0.88)",
  CARD:       "#0A1410",
  CARD_HI:    "#0F1F18",
  BORDER:     "rgba(255,255,255,0.10)",
  BRAND:      "#66FF66",
  BRAND_GLOW: "rgba(102,255,102,0.45)",
  BRAND_DEEP: "#00C853",
  BRAND_BRGT: "#7CFF00",
  TEXT_0:     "#E8F5EC",
  TEXT_1:     "#8A9C94",
  TEXT_2:     "#5A726A",
  FONT_MONO:  "ui-monospace, 'JetBrains Mono', Menlo, monospace",
  FONT_SANS:  "'SF Pro Display','Inter',system-ui,-apple-system,sans-serif",
};

type Step = "choose" | "connect" | "ready" | "done";

interface ApiSubscription {
  plan?:            string;
  status?:          string;
  /** Operator-granted complimentary entitlement — when true the user
   *  has the same access as a paying customer even though `plan` may
   *  read as "free" from Stripe. Mirrors the backend `/billing/
   *  subscription` payload and must be honored by every gate. */
  isComplimentary?: boolean;
  effectivePlan?:   string;
}
interface ApiExchangeRow  { exchange: string; connected: boolean }
interface ApiExchanges    { exchanges: ApiExchangeRow[] }

export function OnboardingFlow() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("done");
  const [preselect, setPreselect] = useState<string | undefined>(undefined);
  const [oauthError, setOauthError] = useState<string>("");
  // Once we've made a bypass routing decision for this open-event, latch it so
  // we don't re-evaluate when React Query stops fetching (or clears data) the
  // moment `step === "done"` disables the queries — that race could otherwise
  // re-open the flow on stale data.
  const [bypassResolved, setBypassResolved] = useState(false);

  // ── Bypass-state queries (only fetched while open so we don't pay the
  // network cost for every signed-in /portal visit).
  const sub = useQuery<ApiSubscription>({
    queryKey: ["onboarding-sub"],
    queryFn:  () => authFetch("/api/billing/subscription", { credentials: "include" })
      .then(r => r.ok ? r.json() : { plan: "free", status: null }),
    enabled:  isSignedIn === true && step !== "done",
    staleTime: 30_000,
  });
  const exchanges = useQuery<ApiExchanges>({
    queryKey: ["onboarding-exchanges"],
    queryFn:  () => authFetch("/api/user/exchanges", { credentials: "include" })
      .then(r => r.ok ? r.json() : { exchanges: [] }),
    enabled:  isSignedIn === true && step !== "done",
    staleTime: 5_000,
  });
  const oauthCfg = useQuery<ExchangeOauthConfig>({
    queryKey: ["exchange-oauth-config"],
    queryFn:  () => authFetch("/api/user/exchanges/alpaca/oauth/config", { credentials: "include" })
      .then(r => r.ok ? r.json() : { enabled: false }),
    enabled:  isSignedIn === true && step !== "done",
    staleTime: 60_000,
  });
  const exchangeOauthEnabled = oauthCfg.data?.enabled === true;

  // Honor the complimentary entitlement: operator-granted users skip
  // the upgrade-to-subscribe onboarding step exactly like a paying
  // customer. Reading raw `plan` here would re-trigger the paywall
  // flow on every /portal mount for those accounts.
  const effectivePlan = sub.data?.isComplimentary
    ? (sub.data?.effectivePlan ?? "pro")
    : sub.data?.plan;
  const hasLiveSub = !!sub.data && (effectivePlan === "starter" || effectivePlan === "pro");
  const connectedCount = (exchanges.data?.exchanges ?? []).filter(e => e.connected).length;
  const introSeen = typeof window !== "undefined" && localStorage.getItem(LS_INTRO_SEEN) === "1";

  // ── Trigger: ?checkout=success on URL ────────────────────────────────────
  useEffect(() => {
    if (!isSignedIn) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("checkout") !== "success") return;
    url.searchParams.delete("checkout");
    const cleanQuery = url.searchParams.toString();
    window.history.replaceState(
      {}, "",
      url.pathname + (cleanQuery ? `?${cleanQuery}` : "") + url.hash,
    );
    setBypassResolved(false);
    setStep("choose");
  }, [isSignedIn]);

  // ── Bypass: when opened, jump to the right step once. `bypassResolved`
  // latches the decision so query-disable on close cannot reopen the flow.
  useEffect(() => {
    if (step !== "choose") return;
    if (bypassResolved) return;
    if (exchanges.isLoading || sub.isLoading) return;
    setBypassResolved(true);
    if (connectedCount > 0 && introSeen) { setStep("done"); return; }
    if (connectedCount > 0 && !introSeen) { setStep("ready"); return; }
    // else: sit on the path-chooser (default render).
  }, [step, bypassResolved, exchanges.isLoading, sub.isLoading, connectedCount, introSeen]);

  // External hook: any code in the app can dispatch this event to manually open.
  useEffect(() => {
    const handler = () => { setBypassResolved(false); setStep("choose"); };
    window.addEventListener("aicandlez:open-onboarding", handler);
    return () => window.removeEventListener("aicandlez:open-onboarding", handler);
  }, []);

  // ── One-click primary-exchange OAuth popup ───────────────────────────────
  // Opens the exchange-hosted consent screen in a popup. The server callback
  // route posts the result back via `window.postMessage`. On success, we
  // advance straight to the "ready" step — same terminal state as the
  // pasted-keys path.
  const startExchangeOauth = () => {
    if (!exchangeOauthEnabled || !oauthCfg.data?.authorizeUrl) return;
    setOauthError("");
    const popup = window.open(
      oauthCfg.data.authorizeUrl,
      "aicandlez-exchange-oauth",
      "width=520,height=720,menubar=no,toolbar=no",
    );
    if (!popup) {
      setOauthError("Popup blocked — please allow popups for AICandlez and try again.");
      return;
    }
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { source?: string; ok?: boolean; error?: string } | null;
      if (!data || data.source !== "aicandlez:alpaca-oauth") return;
      window.removeEventListener("message", onMessage);
      if (data.ok) {
        queryClient.invalidateQueries({ queryKey: ["onboarding-exchanges"] });
        queryClient.invalidateQueries({ queryKey: ["user-exchanges"] });
        queryClient.invalidateQueries({ queryKey: ["exchange-connections"] });
        queryClient.invalidateQueries({ queryKey: ["runtime-state"] });
        setStep("ready");
      } else {
        setOauthError(data.error ?? "The exchange did not authorize the connection.");
      }
    };
    window.addEventListener("message", onMessage);
  };

  const close = () => setStep("done");
  const advanceFromConnect = () => {
    // Refresh every surface that renders connection state — including
    // runtime-state so the "Runtime Ready" screen shows the freshly-
    // hydrated equity instead of pre-connect zeros.
    queryClient.invalidateQueries({ queryKey: ["onboarding-exchanges"] });
    queryClient.invalidateQueries({ queryKey: ["user-exchanges"] });
    queryClient.invalidateQueries({ queryKey: ["exchange-connections"] });
    queryClient.invalidateQueries({ queryKey: ["onboarding-sub"] });
    queryClient.invalidateQueries({ queryKey: ["runtime-state"] });
    setStep("ready");
  };
  const dismissReady = () => {
    try { localStorage.setItem(LS_INTRO_SEEN, "1"); } catch { /* localStorage may be disabled */ }
    setStep("done");
  };

  if (step === "done") return null;

  return (
    <>
      {step === "choose" && <ChooseStep
        hasLiveSub={hasLiveSub}
        oauthError={oauthError}
        onClose={close}
        onPickAlpaca={() => {
          // Alpaca path — when the in-app OAuth provider is configured we
          // launch the one-click popup; otherwise fall through to the
          // manual connect modal with Alpaca preselected so the user
          // can't accidentally pick a different exchange mid-flow.
          if (exchangeOauthEnabled) { startExchangeOauth(); return; }
          setPreselect("Alpaca");
          setStep("connect");
        }}
        onPickExisting={() => { setPreselect(undefined); setStep("connect"); }}
      />}
      {step === "connect" && <PortalExchangeConnectModal
        open
        onClose={() => setStep("choose")}
        preselectedExchange={preselect}
        onConnected={advanceFromConnect}
      />}
      {step === "ready" && <RuntimeReadyStep
        plan={sub.data?.plan ?? "starter"}
        onStart={dismissReady}
      />}
    </>
  );
}

// ─── Shared shell ────────────────────────────────────────────────────────────
function ModalShell({ children, onClose, maxWidth = 560 }: {
  children: React.ReactNode; onClose: () => void; maxWidth?: number;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9100,
        background: N.OVERLAY,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px 16px", overflowY: "auto",
        fontFamily: N.FONT_SANS,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%", maxWidth,
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
          background: `linear-gradient(160deg, ${N.CARD_HI} 0%, ${N.CARD} 70%)`,
          border: `1px solid rgba(102,255,102,0.32)`,
          borderRadius: 16,
          padding: "26px 26px 22px",
          boxShadow: `0 24px 72px rgba(0,0,0,0.75), 0 0 0 1px rgba(102,255,102,0.18) inset, 0 0 64px rgba(102,255,102,0.20)`,
        }}
      >
        <div aria-hidden style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent 0%, ${N.BRAND_BRGT} 50%, transparent 100%)`,
          opacity: 0.75,
        }}/>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            position: "absolute", top: 14, right: 14,
            width: 32, height: 32, borderRadius: 8,
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${N.BORDER}`,
            color: N.TEXT_1,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <X size={16} strokeWidth={2.2} />
        </button>
        {children}
      </div>
    </div>
  );
}

// ─── Step 1: Choose Your Trading Runtime ─────────────────────────────────────
// Two explicit cards so users understand the architecture before they click:
//   - Alpaca       → brokerage path (beginner / recommended)
//   - Existing     → external exchange APIs (advanced)
// This replaces the older "regulated-exchange external CTA vs paste keys"
// framing which conflated "brokerage" and "external exchange" into one
// vague primary card.
function ChooseStep({ hasLiveSub, oauthError, onClose, onPickAlpaca, onPickExisting }: {
  hasLiveSub: boolean; oauthError: string;
  onClose: () => void;
  onPickAlpaca: () => void; onPickExisting: () => void;
}) {
  return (
    <ModalShell onClose={onClose} maxWidth={680}>
      <div style={{ marginBottom: 20, paddingRight: 32 }}>
        <div style={{
          fontFamily: N.FONT_MONO, fontSize: 9.5, fontWeight: 800,
          letterSpacing: "0.20em", textTransform: "uppercase",
          color: N.BRAND, marginBottom: 8,
          textShadow: `0 0 8px ${N.BRAND_GLOW}`,
        }}>
          ◆ Step 1 of 3 · Activate Your Runtime
        </div>
        <h2 style={{
          fontSize: 22, fontWeight: 800, color: N.TEXT_0,
          letterSpacing: -0.4, margin: 0, lineHeight: 1.2,
        }}>
          Choose Your Trading Runtime
        </h2>
        <p style={{
          fontSize: 13, color: N.TEXT_1, lineHeight: 1.55,
          marginTop: 8, marginBottom: 0,
        }}>
          {hasLiveSub
            ? "Your subscription is active. Pick the path that fits — you can always add the other later from Settings."
            : "Pick the path that fits — you can always add the other later from Settings. Your funds stay in your own account; AICandlez never holds customer money."}
        </p>
      </div>

      {/* PRIMARY: Alpaca (beginner / recommended) */}
      <button
        type="button"
        onClick={onPickAlpaca}
        style={{
          display: "block", width: "100%", textAlign: "left",
          padding: "20px 22px", marginBottom: 14,
          background: `linear-gradient(135deg, rgba(102,255,102,0.13) 0%, rgba(0,200,83,0.08) 100%)`,
          border: `1.5px solid ${N.BRAND}`,
          borderRadius: 14,
          boxShadow: `0 0 28px rgba(102,255,102,0.22), 0 0 0 1px rgba(102,255,102,0.16) inset`,
          cursor: "pointer", transition: "all 140ms ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <div style={{
            padding: "3px 9px", borderRadius: 999,
            background: N.BRAND, color: "#001b06",
            fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 800,
            letterSpacing: "0.16em",
          }}>
            BEGINNER · RECOMMENDED
          </div>
          <div style={{
            padding: "2px 8px", borderRadius: 999,
            background: "rgba(102,255,102,0.10)",
            border: `1px solid ${N.BRAND}55`,
            color: N.BRAND,
            fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 700,
            letterSpacing: "0.14em",
          }}>
            BROKERAGE
          </div>
        </div>
        <div style={{
          fontSize: 18, fontWeight: 800, color: N.TEXT_0,
          letterSpacing: -0.3, marginBottom: 6,
        }}>
          Use Alpaca
        </div>
        <ul style={{
          margin: 0, padding: 0, listStyle: "none",
          fontSize: 12.5, color: N.TEXT_1, lineHeight: 1.7,
        }}>
          <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Check size={12} color={N.BRAND} strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 4 }} />
            <span>Deposit USD directly — no separate exchange account needed</span>
          </li>
          <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Check size={12} color={N.BRAND} strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 4 }} />
            <span>Simplest setup, one-click connect when available</span>
          </li>
          <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Check size={12} color={N.BRAND} strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 4 }} />
            <span>AI trades on your behalf inside your Alpaca account</span>
          </li>
          <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Check size={12} color={N.BRAND} strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 4 }} />
            <span>Best for users new to crypto trading</span>
          </li>
        </ul>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          marginTop: 14, color: N.BRAND,
          fontFamily: N.FONT_MONO, fontSize: 11, fontWeight: 800,
          letterSpacing: "0.18em",
        }}>
          SET UP ALPACA <ArrowRight size={13} strokeWidth={2.4} />
        </div>
      </button>

      {oauthError && (
        <div style={{
          marginTop: 10, marginBottom: 4, padding: "10px 12px", borderRadius: 10,
          background: "rgba(255,80,100,0.08)",
          border: "1px solid rgba(255,80,100,0.30)",
          color: "rgba(255,120,140,0.95)",
          fontSize: 12, lineHeight: 1.5,
        }}>
          {oauthError}
        </div>
      )}

      {/* SECONDARY: Connect Existing Exchange (advanced) */}
      <button
        type="button"
        onClick={onPickExisting}
        style={{
          display: "block", width: "100%", textAlign: "left",
          padding: "18px 22px",
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${N.BORDER}`,
          borderRadius: 14,
          cursor: "pointer", transition: "all 140ms ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <div style={{
            padding: "3px 9px", borderRadius: 999,
            background: "rgba(255,255,255,0.06)",
            border: `1px solid ${N.BORDER}`,
            color: N.TEXT_0,
            fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 800,
            letterSpacing: "0.16em",
          }}>
            ADVANCED USERS
          </div>
          <div style={{
            padding: "2px 8px", borderRadius: 999,
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${N.BORDER}`,
            color: N.TEXT_1,
            fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 700,
            letterSpacing: "0.14em",
          }}>
            EXTERNAL EXCHANGE
          </div>
        </div>
        <div style={{
          fontSize: 16, fontWeight: 700, color: N.TEXT_0,
          letterSpacing: -0.2, marginBottom: 6,
        }}>
          Connect Existing Exchange
        </div>
        <ul style={{
          margin: 0, padding: 0, listStyle: "none",
          fontSize: 12, color: N.TEXT_1, lineHeight: 1.7,
        }}>
          <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <ArrowRight size={11} color={N.TEXT_1} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 4 }} />
            <span>Use existing Coinbase / Kraken / Crypto.com / Binance balances</span>
          </li>
          <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <ArrowRight size={11} color={N.TEXT_1} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 4 }} />
            <span>Connect via read + trade API keys (withdrawals never requested)</span>
          </li>
          <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <ArrowRight size={11} color={N.TEXT_1} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 4 }} />
            <span>Bring your own liquidity — funds stay at the exchange</span>
          </li>
          <li style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <ArrowRight size={11} color={N.TEXT_1} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 4 }} />
            <span>Advanced runtime switching between connected venues</span>
          </li>
        </ul>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          marginTop: 12, color: N.TEXT_0,
          fontFamily: N.FONT_MONO, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.18em",
        }}>
          CONNECT EXCHANGE <ArrowRight size={12} strokeWidth={2.2} />
        </div>
      </button>

      <div style={{
        marginTop: 18, padding: "10px 12px",
        background: "rgba(102,255,102,0.04)",
        border: `1px solid ${N.BRAND}28`,
        borderRadius: 10,
        display: "flex", gap: 9, alignItems: "flex-start",
      }}>
        <ShieldCheck size={14} color={N.BRAND} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 11, color: N.TEXT_1, lineHeight: 1.5 }}>
          AICandlez <strong style={{ color: N.TEXT_0 }}>never holds your funds</strong>.
          Your balance stays in your own brokerage or exchange account at all
          times. Withdrawal permissions are never requested.
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Step 3: Runtime Ready ───────────────────────────────────────────────────
// Final confirmation after a successful connect (or re-entry for a user
// who already connected previously). Pulls live data from `useRuntimeState`
// so the equity & runtime label match what /portal will render the moment
// the user clicks through. Explains the ARM LIVE gate so the next click in
// the portal isn't a surprise.
function RuntimeReadyStep({ plan, onStart }: { plan: string; onStart: () => void }) {
  const { data: runtime, isLoading } = useRuntimeState();
  const label    = runtimeLabel(runtime);
  const isLive   = runtime?.mode === "live";
  const equityN  = runtime?.totalEquityUSD ?? 0;
  const equity   = equityN.toLocaleString("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 2,
  });
  const exchange = runtime?.activeExchange ?? null;
  const aiLimit  = plan === "pro" ? 12 : 3;

  return (
    <ModalShell onClose={onStart} maxWidth={600}>
      <div style={{ marginBottom: 18, paddingRight: 32 }}>
        <div style={{
          fontFamily: N.FONT_MONO, fontSize: 9.5, fontWeight: 800,
          letterSpacing: "0.20em", textTransform: "uppercase",
          color: N.BRAND, marginBottom: 8,
          textShadow: `0 0 8px ${N.BRAND_GLOW}`,
        }}>
          ◆ Step 3 of 3 · Runtime Ready
        </div>
        <h2 style={{
          fontSize: 22, fontWeight: 800, color: N.TEXT_0,
          letterSpacing: -0.4, margin: 0, lineHeight: 1.2,
        }}>
          Your trading runtime is active
        </h2>
      </div>

      {/* Hero runtime panel — institutional readout, not a marketing card */}
      <div style={{
        padding: "18px 20px", marginBottom: 14,
        background: `linear-gradient(135deg, rgba(102,255,102,0.10) 0%, rgba(0,200,83,0.06) 100%)`,
        border: `1.5px solid ${N.BRAND}`,
        borderRadius: 14,
        boxShadow: `0 0 22px rgba(102,255,102,0.18), 0 0 0 1px rgba(102,255,102,0.14) inset`,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          marginBottom: 12, gap: 12, flexWrap: "wrap",
        }}>
          <div>
            <div style={{
              fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 800,
              letterSpacing: "0.20em", color: N.TEXT_1, marginBottom: 4,
            }}>
              ACTIVE RUNTIME
            </div>
            <div style={{
              fontFamily: N.FONT_MONO, fontSize: 18, fontWeight: 800,
              letterSpacing: "0.06em", color: N.BRAND_BRGT,
              textShadow: `0 0 12px ${N.BRAND_GLOW}`,
            }}>
              {isLoading ? "—" : label}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 800,
              letterSpacing: "0.20em", color: N.TEXT_1, marginBottom: 4,
            }}>
              HYDRATED EQUITY
            </div>
            <div style={{
              fontFamily: N.FONT_MONO, fontSize: 18, fontWeight: 800,
              letterSpacing: "-0.02em", color: N.TEXT_0,
            }}>
              {isLoading ? "—" : equity}
            </div>
          </div>
        </div>
        <div style={{
          fontSize: 11.5, color: N.TEXT_1, lineHeight: 1.55,
          paddingTop: 10, borderTop: `1px solid ${N.BRAND}22`,
          display: "flex", gap: 8, alignItems: "flex-start",
        }}>
          <Wallet size={12} color={N.BRAND} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            {isLive && exchange
              ? <>Balances synced from <strong style={{ color: N.TEXT_0 }}>{exchange}</strong>. Your funds remain at the exchange — AICandlez never holds customer money.</>
              : <>Paper mode is active. Connect a live exchange any time from Settings to enable real-money execution.</>}
          </span>
        </div>
      </div>

      {/* ARM LIVE explainer */}
      <ReadyRow
        Icon={Zap}
        title={isLive ? "Live execution requires ARM" : "Live execution will require ARM"}
        body="Every real-money order goes through three gates: server kill-switch, runtime ready check, and an explicit per-session ARM you click in the portal. This prevents accidental live trades — paper trading runs immediately, no ARM needed."
      />
      <ReadyRow
        Icon={Cpu}
        title="AI Auto Trade is ready"
        body={`Your ${plan === "pro" ? "AI Trading Pro" : "AI Trading"} plan can run up to ${aiLimit} concurrent AI trades. Start it from the portal whenever you're ready — pause or stop any time.`}
      />
      <ReadyRow
        Icon={TrendingUp}
        title="Manual trading is always on"
        body="High-confidence AI signals stay visible on every surface. Confirm one yourself or override the AI at any point."
      />

      <button
        type="button"
        onClick={onStart}
        style={{
          width: "100%", marginTop: 20, padding: "14px 16px", borderRadius: 12,
          background: `linear-gradient(135deg, ${N.BRAND_DEEP} 0%, ${N.BRAND} 55%, ${N.BRAND_BRGT} 100%)`,
          border: `1px solid ${N.BRAND}`,
          color: "#001b06",
          fontFamily: N.FONT_MONO, fontSize: 12, fontWeight: 800,
          letterSpacing: "0.18em", textTransform: "uppercase",
          cursor: "pointer",
          boxShadow: `0 10px 30px rgba(102,255,102,0.32), 0 1px 0 rgba(255,255,255,0.45) inset`,
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        <Sparkles size={14} strokeWidth={2.6} /> Start AI Trading
      </button>
    </ModalShell>
  );
}

function ReadyRow({ Icon, title, body }: {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }>;
  title: string; body: string;
}) {
  return (
    <div style={{
      display: "flex", gap: 14, alignItems: "flex-start",
      padding: "12px 14px", marginBottom: 10,
      background: "rgba(255,255,255,0.025)",
      border: `1px solid ${N.BORDER}`,
      borderRadius: 12,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: `rgba(102,255,102,0.10)`,
        border: `1px solid ${N.BRAND}40`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 0 12px ${N.BRAND_GLOW}`,
      }}>
        <Icon size={15} color={N.BRAND} strokeWidth={2.2} />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: N.TEXT_0, marginBottom: 3 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: N.TEXT_1, lineHeight: 1.55 }}>
          {body}
        </div>
      </div>
    </div>
  );
}
