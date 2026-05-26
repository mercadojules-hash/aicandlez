/**
 * OnboardingFlow — post-checkout live-trading onboarding for trade.aicandlez.com.
 *
 * Triggered by `?checkout=success` query param appearing on any route (the
 * Stripe success URL strips the param after detection so the modal opens
 * exactly once). Renders a 3-step wizard:
 *
 *   1. choose       — TWO paths:
 *                       PRIMARY  : Create / Fund a regulated crypto exchange
 *                                  account (Kraken, Binance, or Coinbase)
 *                       SECONDARY: Connect an existing exchange (paste API keys)
 *   2. exchange_cta — Explainer + external CTA to the primary exchange sign-up +
 *                     "I've got my keys" button that advances to step 3 with the
 *                     primary exchange preselected.
 *   3. connect      — Hosted via PortalExchangeConnectModal (exchange picker
 *                     + key paste + server-side test + AES-256 encryption).
 *   4. intro        — One-time "manual + AI trading" explainer modal. Persists
 *                     `acl_first_live_intro_seen_v1` to localStorage.
 *
 * Bypass behavior:
 *   - If `?checkout=success` is present AND user already has >=1 connected
 *     exchange AND intro modal seen → skip to "done" (close immediately).
 *   - If connected but intro not seen → jump straight to "intro".
 *
 * Modularity / future extension:
 *   - The primary-exchange path currently uses an external CTA. The
 *     `OnboardingProvider` shape below is the extension surface for upgrading
 *     to a Broker-API / OAuth / direct-funding flow without touching the UI.
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
import { X, ExternalLink, ShieldCheck, Sparkles, Lock, ArrowRight, Check, Cpu, Hand } from "lucide-react";
import { PortalExchangeConnectModal } from "./PortalExchangeConnectModal";

import { authFetch } from "../lib/authFetch";
// ── Provider extension surface ───────────────────────────────────────────────
//
// Today: external CTA → user opens the primary exchange sign-up, returns,
// pastes API keys. Future: swap `type: "external_cta"` for `"oauth"` /
// `"broker_api"` and the step 2 renderer below dispatches to the new
// handler. No UI tree changes.
interface OnboardingProvider {
  id:           string;
  label:        string;
  type:         "external_cta" | "oauth" | "broker_api";
  externalUrl?: string;
}
const PRIMARY_EXCHANGE_PROVIDER: OnboardingProvider = {
  id:          "Kraken",
  label:       "Kraken",
  type:        "external_cta",
  externalUrl: "https://www.kraken.com/sign-up",
};

// Server-driven config for the in-app one-click exchange OAuth handshake.
// When `enabled === true`, the CTA in step 2 swaps from "open exchange sign-up
// in a new tab" to a one-click OAuth popup that stores tokens via the existing
// CredentialVault. When disabled (env vars missing in dev / older deploys),
// we fall back to the proven external CTA without any UI churn.
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

type Step = "choose" | "exchange_cta" | "connect" | "intro" | "done";

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
    if (connectedCount > 0 && !introSeen) { setStep("intro"); return; }
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
  // advance straight to the "intro" step — same terminal state as the
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
        setStep("intro");
      } else {
        setOauthError(data.error ?? "The exchange did not authorize the connection.");
      }
    };
    window.addEventListener("message", onMessage);
  };

  const close = () => setStep("done");
  const advanceFromConnect = () => {
    // Refresh every surface that renders connection state.
    queryClient.invalidateQueries({ queryKey: ["onboarding-exchanges"] });
    queryClient.invalidateQueries({ queryKey: ["user-exchanges"] });
    queryClient.invalidateQueries({ queryKey: ["exchange-connections"] });
    queryClient.invalidateQueries({ queryKey: ["onboarding-sub"] });
    setStep("intro");
  };
  const dismissIntro = () => {
    try { localStorage.setItem(LS_INTRO_SEEN, "1"); } catch { /* localStorage may be disabled */ }
    setStep("done");
  };

  if (step === "done") return null;

  return (
    <>
      {step === "choose"     && <ChooseStep
        hasLiveSub={hasLiveSub}
        oauthEnabled={exchangeOauthEnabled}
        oauthError={oauthError}
        onClose={close}
        onPickPrimary={() => {
          // When the in-app OAuth provider is configured, skip the external
          // CTA explainer entirely — one click is the whole point.
          if (exchangeOauthEnabled) { startExchangeOauth(); return; }
          setStep("exchange_cta");
        }}
        onPickExisting={() => { setPreselect(undefined); setStep("connect"); }}
      />}
      {step === "exchange_cta" && <ExchangeCtaStep
        onClose={close}
        onBack={() => setStep("choose")}
        onContinue={() => { setPreselect(PRIMARY_EXCHANGE_PROVIDER.id); setStep("connect"); }}
      />}
      {step === "connect" && <PortalExchangeConnectModal
        open
        onClose={() => setStep("choose")}
        preselectedExchange={preselect}
        onConnected={advanceFromConnect}
      />}
      {step === "intro" && <IntroStep
        plan={sub.data?.plan ?? "starter"}
        onDone={dismissIntro}
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

// ─── Step 1: Choose path ─────────────────────────────────────────────────────
function ChooseStep({ hasLiveSub, oauthEnabled, oauthError, onClose, onPickPrimary, onPickExisting }: {
  hasLiveSub: boolean; oauthEnabled: boolean; oauthError: string;
  onClose: () => void;
  onPickPrimary: () => void; onPickExisting: () => void;
}) {
  return (
    <ModalShell onClose={onClose} maxWidth={640}>
      <div style={{ marginBottom: 22, paddingRight: 32 }}>
        <div style={{
          fontFamily: N.FONT_MONO, fontSize: 9.5, fontWeight: 800,
          letterSpacing: "0.20em", textTransform: "uppercase",
          color: N.BRAND, marginBottom: 8,
          textShadow: `0 0 8px ${N.BRAND_GLOW}`,
        }}>
          ◆ Welcome to AICandlez Live Trading
        </div>
        <h2 style={{
          fontSize: 22, fontWeight: 800, color: N.TEXT_0,
          letterSpacing: -0.4, margin: 0, lineHeight: 1.2,
        }}>
          Choose how you want to start
        </h2>
        <p style={{
          fontSize: 13, color: N.TEXT_1, lineHeight: 1.55,
          marginTop: 8, marginBottom: 0,
        }}>
          {hasLiveSub
            ? "Your subscription is active. Pick a path below — your funds always stay in your own regulated crypto exchange account."
            : "Pick a path below. Your funds always stay in your own regulated crypto exchange account, never with AICandlez."}
        </p>
      </div>

      {/* PRIMARY: Regulated crypto exchange */}
      <button
        type="button"
        onClick={onPickPrimary}
        style={{
          display: "block", width: "100%", textAlign: "left",
          padding: "20px 22px", marginBottom: 14,
          background: `linear-gradient(135deg, rgba(102,255,102,0.12) 0%, rgba(0,200,83,0.08) 100%)`,
          border: `1.5px solid ${N.BRAND}`,
          borderRadius: 14,
          boxShadow: `0 0 28px rgba(102,255,102,0.22), 0 0 0 1px rgba(102,255,102,0.16) inset`,
          cursor: "pointer", transition: "all 140ms ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{
            padding: "3px 9px", borderRadius: 999,
            background: N.BRAND, color: "#001b06",
            fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 800,
            letterSpacing: "0.16em",
          }}>
            {oauthEnabled ? "ONE-CLICK · RECOMMENDED" : "RECOMMENDED FOR BEGINNERS"}
          </div>
        </div>
        <div style={{
          fontSize: 17, fontWeight: 800, color: N.TEXT_0,
          letterSpacing: -0.3, marginBottom: 4,
        }}>
          {oauthEnabled
            ? "Connect Your Crypto Exchange in One Click"
            : "Create / Fund a Regulated Crypto Exchange Account"}
        </div>
        <div style={{ fontSize: 12.5, color: N.TEXT_1, lineHeight: 1.55 }}>
          {oauthEnabled
            ? "Sign in to your exchange (or sign up in seconds) and authorize AICandlez to place trades on your behalf. No API keys to copy. Your funds stay at the exchange."
            : "Open a regulated crypto exchange account at Kraken, Binance, or Coinbase, fund it directly, then connect it back to AICandlez. Withdrawal permissions are never requested."}
        </div>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          marginTop: 12, color: N.BRAND,
          fontFamily: N.FONT_MONO, fontSize: 11, fontWeight: 800,
          letterSpacing: "0.16em",
        }}>
          {oauthEnabled ? "CONNECT EXCHANGE" : "GET STARTED"} <ArrowRight size={13} strokeWidth={2.4} />
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

      {/* SECONDARY: Connect existing */}
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
        <div style={{
          fontSize: 15, fontWeight: 700, color: N.TEXT_0,
          letterSpacing: -0.2, marginBottom: 4,
        }}>
          Connect Your Existing Exchange
        </div>
        <div style={{ fontSize: 12, color: N.TEXT_1, lineHeight: 1.55 }}>
          Already trade on Kraken, Binance, or Coinbase? Paste your read +
          trade API keys (withdrawal permissions never requested) to enable
          live execution.
        </div>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          marginTop: 10, color: N.TEXT_0,
          fontFamily: N.FONT_MONO, fontSize: 10.5, fontWeight: 700,
          letterSpacing: "0.16em",
        }}>
          ENTER API KEYS <ArrowRight size={12} strokeWidth={2.2} />
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
          Your balance stays in your regulated crypto exchange account at all
          times. Withdrawal permissions are never requested.
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Step 2: Crypto exchange external CTA ────────────────────────────────────
// Only reached when the OAuth provider is *not* configured — the ChooseStep
// short-circuits straight to `startExchangeOauth()` otherwise. This step keeps
// the "sign up at your crypto exchange, then come back and paste API keys"
// path alive as the fallback.
function ExchangeCtaStep({ onClose, onBack, onContinue }: {
  onClose: () => void; onBack: () => void; onContinue: () => void;
}) {
  return (
    <ModalShell onClose={onClose}>
      <div style={{ marginBottom: 18, paddingRight: 32 }}>
        <div style={{
          fontFamily: N.FONT_MONO, fontSize: 9.5, fontWeight: 800,
          letterSpacing: "0.20em", textTransform: "uppercase",
          color: N.BRAND, marginBottom: 8,
          textShadow: `0 0 8px ${N.BRAND_GLOW}`,
        }}>
          ◆ Step 1 of 2 · Open Your Exchange Account
        </div>
        <h2 style={{
          fontSize: 20, fontWeight: 800, color: N.TEXT_0,
          letterSpacing: -0.3, margin: 0, lineHeight: 1.25,
        }}>
          Create &amp; fund a regulated crypto exchange account
        </h2>
      </div>

      <ol style={{
        margin: 0, padding: "0 0 0 22px",
        fontSize: 13, color: N.TEXT_1, lineHeight: 1.65,
      }}>
        <li>Sign up at <strong style={{ color: N.TEXT_0 }}>kraken.com</strong>, <strong style={{ color: N.TEXT_0 }}>binance.com</strong>, or <strong style={{ color: N.TEXT_0 }}>coinbase.com</strong> and complete regulated KYC.</li>
        <li><strong style={{ color: N.TEXT_0 }}>Fund your exchange account</strong> directly. Your money stays at the exchange — AICandlez never touches it.</li>
        <li>Inside the exchange, generate <strong style={{ color: N.TEXT_0 }}>API keys</strong> (Read + Trade only · withdrawals disabled).</li>
        <li>Come back here, paste your API key &amp; secret, and start trading.</li>
      </ol>

      <a
        href={PRIMARY_EXCHANGE_PROVIDER.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          marginTop: 18, padding: "12px 18px", borderRadius: 10,
          background: `linear-gradient(135deg, ${N.BRAND_DEEP} 0%, ${N.BRAND} 55%, ${N.BRAND_BRGT} 100%)`,
          border: `1px solid ${N.BRAND}`,
          color: "#001b06",
          fontFamily: N.FONT_MONO, fontSize: 11.5, fontWeight: 800,
          letterSpacing: "0.16em", textTransform: "uppercase",
          textDecoration: "none",
          boxShadow: `0 10px 28px rgba(102,255,102,0.30), 0 1px 0 rgba(255,255,255,0.45) inset`,
        }}
      >
        Open Kraken <ExternalLink size={13} strokeWidth={2.4} />
      </a>

      <div style={{
        marginTop: 18, padding: "12px 14px",
        background: "rgba(102,255,102,0.04)",
        border: `1px solid ${N.BRAND}28`,
        borderRadius: 10,
        fontSize: 11.5, color: N.TEXT_1, lineHeight: 1.55,
      }}>
        <div style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 6 }}>
          <Lock size={13} color={N.BRAND} style={{ flexShrink: 0, marginTop: 2 }} />
          <div><strong style={{ color: N.TEXT_0 }}>Funds remain inside your regulated crypto exchange account.</strong></div>
        </div>
        <div style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 6 }}>
          <ShieldCheck size={13} color={N.BRAND} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>AICandlez never holds customer money. We only place trades using your read + trade API key.</div>
        </div>
        <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
          <Sparkles size={13} color={N.BRAND} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>You may disconnect at any time. Withdrawal permissions are never requested.</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: "12px 16px",
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${N.BORDER}`,
            borderRadius: 10,
            color: N.TEXT_1,
            fontFamily: N.FONT_MONO, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.14em", textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          style={{
            flex: 1, padding: "12px 16px", borderRadius: 10,
            background: `linear-gradient(135deg, ${N.BRAND_DEEP} 0%, ${N.BRAND} 55%, ${N.BRAND_BRGT} 100%)`,
            border: `1px solid ${N.BRAND}`,
            color: "#001b06",
            fontFamily: N.FONT_MONO, fontSize: 11.5, fontWeight: 800,
            letterSpacing: "0.16em", textTransform: "uppercase",
            cursor: "pointer",
            boxShadow: `0 10px 28px rgba(102,255,102,0.30), 0 1px 0 rgba(255,255,255,0.45) inset`,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          I&apos;ve got my API keys → enter them
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Step 4: First-time live intro ───────────────────────────────────────────
function IntroStep({ plan, onDone }: { plan: string; onDone: () => void }) {
  const aiLimit = plan === "pro" ? 12 : 3;
  return (
    <ModalShell onClose={onDone} maxWidth={580}>
      <div style={{ marginBottom: 18, paddingRight: 32 }}>
        <div style={{
          fontFamily: N.FONT_MONO, fontSize: 9.5, fontWeight: 800,
          letterSpacing: "0.20em", textTransform: "uppercase",
          color: N.BRAND, marginBottom: 8,
          textShadow: `0 0 8px ${N.BRAND_GLOW}`,
        }}>
          ◆ You&apos;re Live · Quick Tour
        </div>
        <h2 style={{
          fontSize: 22, fontWeight: 800, color: N.TEXT_0,
          letterSpacing: -0.4, margin: 0, lineHeight: 1.2,
        }}>
          Two ways to trade
        </h2>
      </div>

      <IntroRow
        Icon={Hand}
        title="Trade manually"
        body="Buy and sell any supported asset yourself, on your schedule. AI signals stay visible so you can confirm or override every move."
      />
      <IntroRow
        Icon={Cpu}
        title="Let AI trade for you"
        body={`Auto Trade executes high-confidence signals on your behalf — up to ${aiLimit} concurrent trades on your ${plan === "pro" ? "AI Trading Pro" : "AI Trading"} plan. You can pause or stop AI anytime from the Portal.`}
      />
      <IntroRow
        Icon={ShieldCheck}
        title="You always keep custody"
        body="Funds remain in your own regulated crypto exchange account. AICandlez never holds customer money and withdrawal permissions are never requested."
      />

      <button
        type="button"
        onClick={onDone}
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
        <Check size={14} strokeWidth={2.6} /> Enter the Portal
      </button>
    </ModalShell>
  );
}

function IntroRow({ Icon, title, body }: {
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
