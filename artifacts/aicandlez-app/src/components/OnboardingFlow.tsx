import { authFetch } from "@/lib/authFetch";
/**
 * OnboardingFlow (PWA) — post-checkout live-trading onboarding for
 * app.aicandlez.com. Mirrors the trade-dashboard component but with a
 * mobile-first full-screen overlay.
 *
 * Trigger:    ?checkout=success appears on any route. Param is stripped
 *             after detection so the modal opens exactly once.
 *
 * Bypass:     1+ live exchange already connected AND intro seen → skip
 *             entirely. Connected but intro not seen → jump to intro.
 *
 * Steps:      choose → exchange_cta → connect → intro → done.
 *
 * Compliance copy is locked — never "deposit money into AICandlez"; always
 * "into your own regulated crypto exchange account (Kraken, Binance, or
 * Coinbase)". Withdrawal permissions never requested.
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useDisclaimerGate } from "@/hooks/useDisclaimerGate";

const LS_INTRO_SEEN = "acl_first_live_intro_seen_v1";

const BRAND      = "#66FF66";
const BRAND_DEEP = "#00C853";
const BRAND_BRGT = "#7CFF00";
const BRAND_GLOW = "rgba(102,255,102,0.45)";
const BG         = "#000000";
const CARD       = "#0A1410";
const CARD_HI    = "#0F1F18";
const BORDER     = "rgba(255,255,255,0.10)";
const TEXT_0     = "#E8F5EC";
const TEXT_1     = "#8A9C94";
const TEXT_2     = "#5A726A";
const SANS       = "Inter,-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif";
const MONO       = "'SF Mono','Fira Code','JetBrains Mono','Roboto Mono',monospace";

// Extension surface for upgrading the primary-exchange path to OAuth / Broker
// API later. The user-visible label is generic; the backend `id` still maps to
// the underlying credential vault entry.
interface OnboardingProvider {
  id: string; label: string;
  type: "external_cta" | "oauth" | "broker_api";
  externalUrl?: string;
}
const PRIMARY_EXCHANGE_PROVIDER: OnboardingProvider = {
  id:          "Kraken",
  label:       "Kraken",
  type:        "external_cta",
  externalUrl: "https://www.kraken.com/sign-up",
};

// Server-driven enablement of the in-app one-click exchange OAuth handshake.
// When `enabled === false` (env vars unset), the CTA falls back to the
// external sign-up CTA + paste-keys flow.
interface ExchangeOauthConfig { enabled: boolean; authorizeUrl?: string; scope?: string }

// R1.5 — shared registry hook for exchange product metadata.
import { useExchangeCatalog } from "@/hooks/useExchangeCatalog";

// R1.5 — exchange picker hydrates from /api/exchanges/catalog (single
// source of truth). The local fallback below mirrors the user-visible list
// of regulated crypto exchanges and is used only during the very first
// paint while the catalog request is in flight, so the CTAs never read
// undefined. IDs MUST match the backend catalog (case-sensitive).
type PickerEntry = { id: string; name: string; logo: string };
const FALLBACK_EXCHANGES: PickerEntry[] = [
  { id: "Kraken",   name: "Kraken",   logo: "K" },
  { id: "Binance",  name: "Binance",  logo: "B" },
  { id: "Coinbase", name: "Coinbase", logo: "C" },
];

function useOnboardingExchanges(): PickerEntry[] {
  const { exchanges } = useExchangeCatalog();
  return useMemo<PickerEntry[]>(() => {
    if (exchanges.length === 0) return FALLBACK_EXCHANGES;
    return exchanges
      .filter(c => c.status !== "coming_soon" && c.adapterAvailable)
      .map(c => ({
        id:   c.id,
        name: c.name,
        logo: c.sigil ?? c.name.charAt(0).toUpperCase(),
      }));
  }, [exchanges]);
}

type Step = "done" | "choose" | "exchange_cta" | "connect" | "intro";

interface ApiExchangeRow {
  exchange:  string;
  connected: boolean;
  connection?: { status?: string; lastError?: string | null } | null;
}
interface ApiExchanges   { exchanges: ApiExchangeRow[] }

// True when the primary exchange OAuth connection is in refresh-failed state.
// The background token refresher marks status="error" with lastError once
// the refresh_token is revoked/expired.
export function isPrimaryExchangeOauthErrored(rows: ApiExchangeRow[] | undefined): { errored: boolean; lastError: string | null } {
  const row = (rows ?? []).find(r => r.exchange === PRIMARY_EXCHANGE_PROVIDER.id && r.connected);
  const status    = row?.connection?.status ?? null;
  const lastError = row?.connection?.lastError ?? null;
  if (status !== "error") return { errored: false, lastError: null };
  if (!lastError) return { errored: false, lastError: null };
  const hint = lastError.toLowerCase();
  if (!hint.includes("oauth") && !hint.includes("refresh") && !hint.includes("token")) {
    return { errored: false, lastError: null };
  }
  return { errored: true, lastError };
}

export function OnboardingFlow() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const { gate: disclaimerGate, modal: disclaimerModal } = useDisclaimerGate();

  const [step, setStep] = useState<Step>("done");
  // Latches the bypass routing decision so query-disable on `step="done"`
  // can't race-reopen the flow on stale data.
  const [bypassResolved, setBypassResolved] = useState(false);
  // R1.5 — exchange list comes from the catalog hook. Initial state seeds
  // with the fallback's Alpaca row so `picked` is never null on first paint.
  const EXCHANGES = useOnboardingExchanges();
  const [picked, setPicked] = useState<PickerEntry>(FALLBACK_EXCHANGES[0]);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState("");

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
  const [oauthError, setOauthError] = useState("");
  const connectedCount = (exchanges.data?.exchanges ?? []).filter(e => e.connected).length;
  const exchangeErrored = isPrimaryExchangeOauthErrored(exchanges.data?.exchanges);
  const introSeen = typeof window !== "undefined" && localStorage.getItem(LS_INTRO_SEEN) === "1";

  // Trigger on ?checkout=success
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

  // Bypass logic — runs once per open-event.
  useEffect(() => {
    if (step !== "choose") return;
    if (bypassResolved) return;
    if (exchanges.isLoading) return;
    setBypassResolved(true);
    // When the primary exchange OAuth connection is errored, stay on the
    // choose screen so the reconnect banner is visible — never bypass.
    if (exchangeErrored.errored) return;
    if (connectedCount > 0 && introSeen) { setStep("done"); return; }
    if (connectedCount > 0 && !introSeen) { setStep("intro"); return; }
  }, [step, bypassResolved, exchanges.isLoading, connectedCount, introSeen, exchangeErrored.errored]);

  // External imperative trigger
  useEffect(() => {
    const handler = () => { setBypassResolved(false); setStep("choose"); };
    window.addEventListener("aicandlez:open-onboarding", handler);
    return () => window.removeEventListener("aicandlez:open-onboarding", handler);
  }, []);

  const connectMut = useMutation({
    mutationFn: () => api.post("/user/exchanges/connect", {
      exchange:  picked.id,
      label:     label.trim() || picked.name,
      apiKey:    apiKey.trim(),
      apiSecret: apiSecret.trim(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-exchanges"] });
      queryClient.invalidateQueries({ queryKey: ["user-exchanges"] });
      queryClient.invalidateQueries({ queryKey: ["exchange-connections"] });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      setApiKey(""); setApiSecret(""); setLabel(""); setErr("");
      setStep("intro");
    },
    onError: (e: unknown) => setErr(e instanceof Error
      ? e.message
      : "Connection failed. Check your credentials and try again."),
  });

  // ── One-click primary-exchange OAuth popup ───────────────────────────────
  // Server route postMessages the result back. Success → advance to "intro";
  // failure → surface a non-blocking inline error so the user can retry or
  // fall through to the pasted-keys path.
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
  const dismissIntro = () => {
    try { localStorage.setItem(LS_INTRO_SEEN, "1"); } catch { /* localStorage may be disabled */ }
    setStep("done");
  };
  const submitConnect = () => disclaimerGate(() => connectMut.mutate());
  const canSubmit = !!apiKey.trim() && !!apiSecret.trim() && !connectMut.isPending;

  if (step === "done") {
    // Render disclaimer modal even when closed in case it's still being shown
    // for an unrelated gate trigger (idle if not).
    return <>{disclaimerModal}</>;
  }

  return (
    <>
      <FullScreenShell onClose={close}>
        {step === "choose" && (
          <ChooseContent
            oauthEnabled={exchangeOauthEnabled}
            oauthError={oauthError}
            exchangeErrored={exchangeErrored.errored}
            exchangeErrorMsg={exchangeErrored.lastError}
            onReconnectExchange={() => { if (exchangeOauthEnabled) startExchangeOauth(); }}
            onPickPrimary={() => {
              if (exchangeOauthEnabled) { startExchangeOauth(); return; }
              setStep("exchange_cta");
            }}
            onPickExisting={() => {
              // Default existing-connection target = Binance, falling back to
              // catalog[0] if the catalog hasn't loaded yet.
              const fallback = EXCHANGES.find(e => e.id === "Binance") ?? EXCHANGES[1] ?? EXCHANGES[0];
              setPicked(fallback); setStep("connect");
            }}
          />
        )}
        {step === "exchange_cta" && (
          <ExchangeCtaContent
            onBack={() => setStep("choose")}
            onContinue={() => {
              const primary = EXCHANGES.find(e => e.id === PRIMARY_EXCHANGE_PROVIDER.id) ?? EXCHANGES[0];
              setPicked(primary); setStep("connect");
            }}
          />
        )}
        {step === "connect" && (
          <ConnectContent
            picked={picked}
            onPick={setPicked}
            label={label} onLabel={setLabel}
            apiKey={apiKey} onApiKey={setApiKey}
            apiSecret={apiSecret} onApiSecret={setApiSecret}
            error={err}
            submitting={connectMut.isPending}
            canSubmit={canSubmit}
            onSubmit={submitConnect}
            onBack={() => setStep("choose")}
          />
        )}
        {step === "intro" && <IntroContent onDone={dismissIntro} />}
      </FullScreenShell>
      {disclaimerModal}
    </>
  );
}

// ─── Shell (PWA: full-screen) ───────────────────────────────────────────────
function FullScreenShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 9100,
        background: BG,
        display: "flex", flexDirection: "column",
        fontFamily: SANS,
      }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        style={{
          position: "absolute", top: "max(14px, env(safe-area-inset-top))",
          right: 14,
          width: 36, height: 36, borderRadius: 10,
          background: "rgba(255,255,255,0.06)",
          border: `1px solid ${BORDER}`,
          color: TEXT_1,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", zIndex: 2,
        }}
      >
        ✕
      </button>
      <div style={{
        flex: 1, overflowY: "auto", overflowX: "hidden",
        padding: "calc(20px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom))",
        maxWidth: 480, margin: "0 auto", width: "100%", boxSizing: "border-box",
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Step 1: Choose path (PWA stacked cards) ────────────────────────────────
function ChooseContent({ oauthEnabled, oauthError, exchangeErrored, exchangeErrorMsg, onReconnectExchange, onPickPrimary, onPickExisting }: {
  oauthEnabled: boolean; oauthError: string;
  exchangeErrored?: boolean; exchangeErrorMsg?: string | null;
  onReconnectExchange?: () => void;
  onPickPrimary: () => void; onPickExisting: () => void;
}) {
  return (
    <>
      {exchangeErrored && (
        <div style={{
          marginBottom: 18, padding: "14px 16px", borderRadius: 12,
          background: "rgba(255,176,32,0.08)",
          border: "1px solid rgba(255,176,32,0.45)",
          boxShadow: "0 0 18px rgba(255,176,32,0.108) inset",
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 10, fontWeight: 800,
            letterSpacing: "0.18em", color: "#FFB020", marginBottom: 6,
          }}>
            ⚠ EXCHANGE NEEDS TO BE RECONNECTED
          </div>
          <div style={{ fontSize: 12.5, color: TEXT_1, lineHeight: 1.55, marginBottom: 10 }}>
            Your exchange authorization expired or was revoked, so live AI trades can no
            longer reach your account. Reconnect in one click to resume execution.
          </div>
          {exchangeErrorMsg && (
            <div style={{
              fontFamily: MONO, fontSize: 10.5, color: "rgba(255,176,32,0.85)",
              lineHeight: 1.5, marginBottom: 10, wordBreak: "break-word",
            }}>
              {exchangeErrorMsg}
            </div>
          )}
          {oauthEnabled && onReconnectExchange ? (
            <button
              type="button"
              onClick={onReconnectExchange}
              style={{
                display: "inline-block", padding: "10px 16px", borderRadius: 8,
                background: `linear-gradient(135deg, ${BRAND_DEEP} 0%, ${BRAND} 55%, ${BRAND_BRGT} 100%)`,
                border: `1px solid ${BRAND}`, color: "#001b06",
                fontFamily: MONO, fontSize: 11, fontWeight: 800,
                letterSpacing: "0.18em", textTransform: "uppercase",
                cursor: "pointer",
                boxShadow: `0 8px 22px rgba(102,255,102,0.18)`,
              }}
            >
              Reconnect Exchange →
            </button>
          ) : (
            <div style={{ fontSize: 11, color: TEXT_2, fontFamily: MONO, letterSpacing: "0.10em" }}>
              ONE-CLICK RECONNECT TEMPORARILY UNAVAILABLE — RE-ENTER API KEYS BELOW
            </div>
          )}
        </div>
      )}
      <div style={{ marginBottom: 26, paddingRight: 44 }}>
        <div style={{
          fontFamily: MONO, fontSize: 10, fontWeight: 800,
          letterSpacing: "0.20em", textTransform: "uppercase",
          color: BRAND, marginBottom: 8,
          textShadow: `0 0 8px ${BRAND_GLOW}`,
        }}>
          ◆ Welcome to Live Trading
        </div>
        <div style={{
          fontSize: 26, fontWeight: 800, color: TEXT_0,
          letterSpacing: -0.5, lineHeight: 1.15, marginBottom: 8,
        }}>
          Choose how you want to start
        </div>
        <div style={{ fontSize: 14, color: TEXT_1, lineHeight: 1.55 }}>
          Your funds always stay in your own regulated crypto exchange account —
          AICandlez never holds customer money and never requests withdrawal
          permissions.
        </div>
      </div>

      {/* PRIMARY */}
      <button
        type="button"
        onClick={onPickPrimary}
        style={{
          display: "block", width: "100%", textAlign: "left",
          padding: "20px 20px", marginBottom: 14, borderRadius: 16,
          background: `linear-gradient(160deg, rgba(102,255,102,0.14) 0%, rgba(0,200,83,0.08) 100%)`,
          border: `1.5px solid ${BRAND}`,
          boxShadow: `0 0 28px rgba(102,255,102,0.132), 0 0 0 1px rgba(102,255,102,0.108) inset`,
          cursor: "pointer",
        }}
      >
        <div style={{
          display: "inline-block", padding: "3px 10px", borderRadius: 999,
          background: BRAND, color: "#001b06",
          fontFamily: MONO, fontSize: 9, fontWeight: 800,
          letterSpacing: "0.16em", marginBottom: 10,
        }}>
          {oauthEnabled ? "ONE-CLICK · RECOMMENDED" : "RECOMMENDED FOR BEGINNERS"}
        </div>
        <div style={{
          fontSize: 18, fontWeight: 800, color: TEXT_0,
          letterSpacing: -0.3, marginBottom: 6, lineHeight: 1.25,
        }}>
          {oauthEnabled
            ? "Connect Your Crypto Exchange in One Click"
            : "Create / Fund a Regulated Crypto Exchange Account"}
        </div>
        <div style={{ fontSize: 13, color: TEXT_1, lineHeight: 1.55 }}>
          {oauthEnabled
            ? "Sign in to your exchange (or sign up in seconds) and authorize AICandlez to place trades on your behalf. No API keys to copy. Your funds stay at the exchange."
            : "Open a regulated crypto exchange account at Kraken, Binance, or Coinbase, fund it directly, then connect it back here. Withdrawal permissions are never requested."}
        </div>
        <div style={{
          marginTop: 14, color: BRAND,
          fontFamily: MONO, fontSize: 11, fontWeight: 800,
          letterSpacing: "0.18em",
        }}>
          {oauthEnabled ? "CONNECT EXCHANGE →" : "GET STARTED →"}
        </div>
      </button>

      {oauthError && (
        <div style={{
          marginBottom: 14, padding: "12px 14px", borderRadius: 12,
          background: "rgba(255,80,100,0.08)",
          border: "1px solid rgba(255,80,100,0.30)",
          color: "rgba(255,120,140,0.95)",
          fontSize: 12.5, lineHeight: 1.5,
        }}>
          {oauthError}
        </div>
      )}

      {/* SECONDARY */}
      <button
        type="button"
        onClick={onPickExisting}
        style={{
          display: "block", width: "100%", textAlign: "left",
          padding: "18px 20px", borderRadius: 16,
          background: "rgba(255,255,255,0.035)",
          border: `1px solid ${BORDER}`,
          cursor: "pointer",
        }}
      >
        <div style={{
          fontSize: 16, fontWeight: 700, color: TEXT_0,
          letterSpacing: -0.2, marginBottom: 6, lineHeight: 1.25,
        }}>
          Connect Your Existing Exchange
        </div>
        <div style={{ fontSize: 12.5, color: TEXT_1, lineHeight: 1.55 }}>
          Kraken · Binance · Coinbase — paste your read + trade API keys
          (withdrawal permissions never requested) to enable live execution.
        </div>
        <div style={{
          marginTop: 12, color: TEXT_0,
          fontFamily: MONO, fontSize: 10.5, fontWeight: 700,
          letterSpacing: "0.18em",
        }}>
          ENTER API KEYS →
        </div>
      </button>

      <div style={{
        marginTop: 22, padding: "12px 14px", borderRadius: 12,
        background: "rgba(102,255,102,0.04)",
        border: `1px solid ${BRAND}28`,
        fontSize: 12, color: TEXT_1, lineHeight: 1.55,
      }}>
        🛡  AICandlez <strong style={{ color: TEXT_0 }}>never holds your funds</strong>.
        Your balance stays at your regulated exchange. You can disconnect
        any time.
      </div>
    </>
  );
}

// ─── Step 2: Crypto exchange external CTA (PWA) ─────────────────────────────
function ExchangeCtaContent({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  return (
    <>
      <div style={{ marginBottom: 20, paddingRight: 44 }}>
        <div style={{
          fontFamily: MONO, fontSize: 10, fontWeight: 800,
          letterSpacing: "0.20em", textTransform: "uppercase",
          color: BRAND, marginBottom: 8,
          textShadow: `0 0 8px ${BRAND_GLOW}`,
        }}>
          ◆ Step 1 of 2 · Open Exchange Account
        </div>
        <div style={{
          fontSize: 22, fontWeight: 800, color: TEXT_0,
          letterSpacing: -0.4, lineHeight: 1.2,
        }}>
          Create &amp; fund a regulated crypto exchange account
        </div>
      </div>

      <ol style={{
        margin: 0, padding: "0 0 0 22px",
        fontSize: 14, color: TEXT_1, lineHeight: 1.7,
      }}>
        <li>Sign up at <strong style={{ color: TEXT_0 }}>kraken.com</strong>, <strong style={{ color: TEXT_0 }}>binance.com</strong>, or <strong style={{ color: TEXT_0 }}>coinbase.com</strong> and complete regulated KYC.</li>
        <li><strong style={{ color: TEXT_0 }}>Fund your exchange account</strong> directly — your money stays at the exchange.</li>
        <li>Generate <strong style={{ color: TEXT_0 }}>API keys</strong> in the exchange (Read + Trade only · withdrawals disabled).</li>
        <li>Come back here, paste your API key &amp; secret, start trading.</li>
      </ol>

      <a
        href={PRIMARY_EXCHANGE_PROVIDER.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "block", textAlign: "center",
          marginTop: 20, padding: "14px 18px", borderRadius: 12,
          background: `linear-gradient(135deg, ${BRAND_DEEP} 0%, ${BRAND} 55%, ${BRAND_BRGT} 100%)`,
          border: `1px solid ${BRAND}`,
          color: "#001b06",
          fontFamily: MONO, fontSize: 12, fontWeight: 800,
          letterSpacing: "0.18em", textTransform: "uppercase",
          textDecoration: "none",
          boxShadow: `0 10px 28px rgba(102,255,102,0.18), 0 1px 0 rgba(255,255,255,0.27) inset`,
        }}
      >
        Open Kraken ↗
      </a>

      <div style={{
        marginTop: 20, padding: "14px 14px", borderRadius: 12,
        background: "rgba(102,255,102,0.04)",
        border: `1px solid ${BRAND}28`,
        fontSize: 12.5, color: TEXT_1, lineHeight: 1.6,
      }}>
        <div style={{ marginBottom: 6 }}>
          🔒 <strong style={{ color: TEXT_0 }}>Funds remain inside your regulated crypto exchange account.</strong>
        </div>
        <div style={{ marginBottom: 6 }}>
          🛡 AICandlez never holds customer money. We only place trades using your read + trade API key.
        </div>
        <div>
          ✨ You may disconnect any time — withdrawal permissions are never requested.
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: "14px 18px", borderRadius: 12,
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${BORDER}`,
            color: TEXT_1,
            fontFamily: MONO, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.16em", textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          style={{
            flex: 1, padding: "14px 16px", borderRadius: 12,
            background: `linear-gradient(135deg, ${BRAND_DEEP} 0%, ${BRAND} 55%, ${BRAND_BRGT} 100%)`,
            border: `1px solid ${BRAND}`,
            color: "#001b06",
            fontFamily: MONO, fontSize: 11.5, fontWeight: 800,
            letterSpacing: "0.16em", textTransform: "uppercase",
            cursor: "pointer",
            boxShadow: `0 10px 28px rgba(102,255,102,0.18), 0 1px 0 rgba(255,255,255,0.27) inset`,
          }}
        >
          I have my keys →
        </button>
      </div>
    </>
  );
}

// ─── Step 3: Connect (PWA) ──────────────────────────────────────────────────
function ConnectContent({
  picked, onPick, label, onLabel, apiKey, onApiKey, apiSecret, onApiSecret,
  error, submitting, canSubmit, onSubmit, onBack,
}: {
  picked: { id: string; name: string; logo: string };
  onPick: (e: { id: string; name: string; logo: string }) => void;
  label: string; onLabel: (v: string) => void;
  apiKey: string; onApiKey: (v: string) => void;
  apiSecret: string; onApiSecret: (v: string) => void;
  error: string; submitting: boolean; canSubmit: boolean;
  onSubmit: () => void; onBack: () => void;
}) {
  // R1.5 — connect-step picker tiles hydrate from the shared catalog hook.
  const EXCHANGES = useOnboardingExchanges();
  return (
    <>
      <div style={{ marginBottom: 20, paddingRight: 44 }}>
        <div style={{
          fontFamily: MONO, fontSize: 10, fontWeight: 800,
          letterSpacing: "0.20em", textTransform: "uppercase",
          color: BRAND, marginBottom: 8,
          textShadow: `0 0 8px ${BRAND_GLOW}`,
        }}>
          ◆ Step 2 of 2 · Paste Your API Keys
        </div>
        <div style={{
          fontSize: 22, fontWeight: 800, color: TEXT_0,
          letterSpacing: -0.4, lineHeight: 1.2,
        }}>
          Link your trading account
        </div>
        <div style={{ fontSize: 12.5, color: TEXT_1, lineHeight: 1.55, marginTop: 6 }}>
          Withdrawal permissions are never requested. Keys are encrypted at
          rest with AES-256-GCM.
        </div>
      </div>

      <div style={{
        fontFamily: MONO, fontSize: 10, fontWeight: 700,
        letterSpacing: "0.16em", color: TEXT_1,
        marginBottom: 8, textTransform: "uppercase",
      }}>
        EXCHANGE
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8,
        marginBottom: 18,
      }}>
        {EXCHANGES.map((ex) => {
          const sel = ex.id === picked.id;
          return (
            <button
              key={ex.id}
              type="button"
              onClick={() => onPick(ex)}
              style={{
                padding: "12px 12px", borderRadius: 10,
                background: sel ? `rgba(102,255,102,0.10)` : "rgba(255,255,255,0.03)",
                border: `1.5px solid ${sel ? BRAND : BORDER}`,
                color: sel ? BRAND : TEXT_0,
                fontFamily: MONO, fontSize: 13, fontWeight: 800,
                letterSpacing: "0.08em",
                cursor: "pointer",
                boxShadow: sel ? `0 0 16px ${BRAND_GLOW}` : "none",
              }}
            >
              {ex.name.toUpperCase()}
            </button>
          );
        })}
      </div>

      <PWAField label="LABEL (OPTIONAL)" value={label} onChange={onLabel}
                placeholder={`My ${picked.name}`} />
      <PWAField label="API KEY" value={apiKey} onChange={onApiKey}
                placeholder="Paste API key" mono required />
      <PWAField label="API SECRET" value={apiSecret} onChange={onApiSecret}
                placeholder="Paste API secret" mono required masked />

      <div style={{
        padding: "12px 14px", borderRadius: 10,
        background: "rgba(102,255,102,0.04)",
        border: `1px solid ${BRAND}28`,
        fontSize: 12, color: TEXT_1, lineHeight: 1.55,
      }}>
        🛡 Create the API key with <strong style={{ color: TEXT_0 }}>trading enabled
        and withdrawals disabled</strong>. AICandlez never requests or stores
        withdrawal permissions.
      </div>

      {error && (
        <div style={{
          marginTop: 12, padding: "10px 12px", borderRadius: 10,
          background: "rgba(255,51,85,0.07)",
          border: "1px solid rgba(255,51,85,0.28)",
          color: "rgba(255,100,120,0.92)", fontSize: 12, lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          style={{
            padding: "14px 16px", borderRadius: 12,
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${BORDER}`,
            color: TEXT_1,
            fontFamily: MONO, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.16em", textTransform: "uppercase",
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{
            flex: 1, padding: "14px 16px", borderRadius: 12,
            background: canSubmit
              ? `linear-gradient(135deg, ${BRAND_DEEP} 0%, ${BRAND} 55%, ${BRAND_BRGT} 100%)`
              : "rgba(255,255,255,0.04)",
            border: `1px solid ${canSubmit ? BRAND : BORDER}`,
            color: canSubmit ? "#001b06" : TEXT_1,
            fontFamily: MONO, fontSize: 11.5, fontWeight: 800,
            letterSpacing: "0.16em", textTransform: "uppercase",
            cursor: canSubmit ? "pointer" : "not-allowed",
            boxShadow: canSubmit
              ? `0 10px 28px rgba(102,255,102,0.30), 0 1px 0 rgba(255,255,255,0.45) inset`
              : "none",
          }}
        >
          {submitting ? "Connecting…" : "Connect & Test"}
        </button>
      </div>
    </>
  );
}

function PWAField({ label, value, onChange, placeholder, mono, required, masked }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean; required?: boolean; masked?: boolean;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontFamily: MONO, fontSize: 9.5, fontWeight: 700,
        letterSpacing: "0.16em", color: TEXT_1, marginBottom: 6,
        textTransform: "uppercase",
      }}>
        {label}{required && <span style={{ color: BRAND, marginLeft: 4 }}>*</span>}
      </div>
      <input
        type={masked ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "13px 14px", borderRadius: 10,
          background: "rgba(0,0,0,0.4)",
          border: `1px solid ${BORDER}`,
          color: TEXT_0,
          fontSize: 14,
          fontFamily: mono ? MONO : SANS,
          outline: "none",
        }}
      />
    </div>
  );
}

// ─── Step 4: First-time intro (PWA) ─────────────────────────────────────────
function IntroContent({ onDone }: { onDone: () => void }) {
  return (
    <>
      <div style={{ marginBottom: 22, paddingRight: 44 }}>
        <div style={{
          fontFamily: MONO, fontSize: 10, fontWeight: 800,
          letterSpacing: "0.20em", textTransform: "uppercase",
          color: BRAND, marginBottom: 8,
          textShadow: `0 0 8px ${BRAND_GLOW}`,
        }}>
          ◆ You&apos;re Live · Quick Tour
        </div>
        <div style={{
          fontSize: 26, fontWeight: 800, color: TEXT_0,
          letterSpacing: -0.5, lineHeight: 1.15,
        }}>
          Two ways to trade
        </div>
      </div>

      <PWAIntroRow emoji="✋" title="Trade manually"
        body="Buy and sell any supported asset yourself, on your schedule. AI signals stay visible so you can confirm or override every move." />
      <PWAIntroRow emoji="🤖" title="Let AI trade for you"
        body="Auto Trade executes high-confidence signals on your behalf — up to 3 concurrent trades on Starter, 6 on Pro, 12 on Elite VIP. Pause or stop AI anytime." />
      <PWAIntroRow emoji="🛡" title="You always keep custody"
        body="Funds remain in your own regulated crypto exchange account. AICandlez never holds customer money and withdrawal permissions are never requested." />

      <button
        type="button"
        onClick={onDone}
        style={{
          width: "100%", marginTop: 22, padding: "16px 16px", borderRadius: 14,
          background: `linear-gradient(135deg, ${BRAND_DEEP} 0%, ${BRAND} 55%, ${BRAND_BRGT} 100%)`,
          border: `1px solid ${BRAND}`,
          color: "#001b06",
          fontFamily: MONO, fontSize: 12.5, fontWeight: 800,
          letterSpacing: "0.18em", textTransform: "uppercase",
          cursor: "pointer",
          boxShadow: `0 10px 30px rgba(102,255,102,0.192), 0 1px 0 rgba(255,255,255,0.27) inset`,
        }}
      >
        ✓ Start Trading
      </button>
    </>
  );
}

function PWAIntroRow({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div style={{
      display: "flex", gap: 14, alignItems: "flex-start",
      padding: "14px 14px", marginBottom: 12, borderRadius: 14,
      background: "rgba(255,255,255,0.025)",
      border: `1px solid ${BORDER}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: `rgba(102,255,102,0.10)`,
        border: `1px solid ${BRAND}40`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 18,
        boxShadow: `0 0 14px ${BRAND_GLOW}`,
      }}>
        {emoji}
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_0, marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: TEXT_1, lineHeight: 1.55 }}>
          {body}
        </div>
      </div>
    </div>
  );
}
