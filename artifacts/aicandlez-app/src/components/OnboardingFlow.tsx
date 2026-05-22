/**
 * OnboardingFlow (PWA) — post-checkout live-trading onboarding for
 * app.aicandlez.com. Mirrors the trade-dashboard component but with a
 * mobile-first full-screen overlay. See
 * `artifacts/trading-dashboard/src/components/OnboardingFlow.tsx` for the
 * shared design contract.
 *
 * Trigger:    ?checkout=success appears on any route (Stripe success
 *             redirect → /aicandlez-app/profile?checkout=success).
 *             Param is stripped after detection so the modal opens once.
 *
 * Bypass:     1+ live exchange already connected AND intro seen → skip
 *             entirely. Connected but intro not seen → jump to intro.
 *
 * Steps:      choose → alpaca_cta → connect → intro → done.
 *
 * Compliance copy is locked — never "deposit money into AICandlez"; always
 * "into your Alpaca brokerage account" or "connect your existing exchange".
 */

import { useEffect, useState } from "react";
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

// Extension surface for upgrading the Alpaca path to OAuth / Broker API later.
interface OnboardingProvider {
  id: string; label: string;
  type: "external_cta" | "oauth" | "broker_api";
  externalUrl?: string;
}
const ALPACA_PROVIDER: OnboardingProvider = {
  id:          "alpaca",
  label:       "Alpaca",
  type:        "external_cta",
  externalUrl: "https://alpaca.markets/signup",
};

// IDs MUST match the backend catalog (case-sensitive).
const EXCHANGES = [
  { id: "Alpaca",       name: "Alpaca",     logo: "A" },
  { id: "Kraken",       name: "Kraken",     logo: "K" },
  { id: "Coinbase",     name: "Coinbase",   logo: "C" },
  { id: "CryptoDotCom", name: "Crypto.com", logo: "ᶜ" },
  { id: "Binance",      name: "Binance",    logo: "B" },
];

type Step = "done" | "choose" | "alpaca_cta" | "connect" | "intro";

interface ApiExchangeRow { exchange: string; connected: boolean }
interface ApiExchanges   { exchanges: ApiExchangeRow[] }

export function OnboardingFlow() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const { gate: disclaimerGate, modal: disclaimerModal } = useDisclaimerGate();

  const [step, setStep] = useState<Step>("done");
  // Latches the bypass routing decision so query-disable on `step="done"`
  // can't race-reopen the flow on stale data.
  const [bypassResolved, setBypassResolved] = useState(false);
  const [picked, setPicked] = useState(EXCHANGES[0]);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState("");

  const exchanges = useQuery<ApiExchanges>({
    queryKey: ["onboarding-exchanges"],
    queryFn:  () => fetch("/api/user/exchanges", { credentials: "include" })
      .then(r => r.ok ? r.json() : { exchanges: [] }),
    enabled:  isSignedIn === true && step !== "done",
    staleTime: 5_000,
  });
  const connectedCount = (exchanges.data?.exchanges ?? []).filter(e => e.connected).length;
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
    if (connectedCount > 0 && introSeen) { setStep("done"); return; }
    if (connectedCount > 0 && !introSeen) { setStep("intro"); return; }
  }, [step, bypassResolved, exchanges.isLoading, connectedCount, introSeen]);

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
            onPickAlpaca={() => setStep("alpaca_cta")}
            onPickExisting={() => { setPicked(EXCHANGES[1]); setStep("connect"); }}
          />
        )}
        {step === "alpaca_cta" && (
          <AlpacaCtaContent
            onBack={() => setStep("choose")}
            onContinue={() => { setPicked(EXCHANGES[0]); setStep("connect"); }}
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
function ChooseContent({ onPickAlpaca, onPickExisting }: {
  onPickAlpaca: () => void; onPickExisting: () => void;
}) {
  return (
    <>
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
          Your funds always stay in your own brokerage or exchange account —
          AICandlez never holds customer money.
        </div>
      </div>

      {/* PRIMARY */}
      <button
        type="button"
        onClick={onPickAlpaca}
        style={{
          display: "block", width: "100%", textAlign: "left",
          padding: "20px 20px", marginBottom: 14, borderRadius: 16,
          background: `linear-gradient(160deg, rgba(102,255,102,0.14) 0%, rgba(0,200,83,0.08) 100%)`,
          border: `1.5px solid ${BRAND}`,
          boxShadow: `0 0 28px rgba(102,255,102,0.22), 0 0 0 1px rgba(102,255,102,0.18) inset`,
          cursor: "pointer",
        }}
      >
        <div style={{
          display: "inline-block", padding: "3px 10px", borderRadius: 999,
          background: BRAND, color: "#001b06",
          fontFamily: MONO, fontSize: 9, fontWeight: 800,
          letterSpacing: "0.16em", marginBottom: 10,
        }}>
          RECOMMENDED FOR BEGINNERS
        </div>
        <div style={{
          fontSize: 18, fontWeight: 800, color: TEXT_0,
          letterSpacing: -0.3, marginBottom: 6, lineHeight: 1.25,
        }}>
          Create / Fund Alpaca Brokerage Account
        </div>
        <div style={{ fontSize: 13, color: TEXT_1, lineHeight: 1.55 }}>
          Open a regulated US brokerage account at Alpaca, deposit funds into
          your Alpaca account, then connect it back here. Best path if you
          don&apos;t already have exchange API keys.
        </div>
        <div style={{
          marginTop: 14, color: BRAND,
          fontFamily: MONO, fontSize: 11, fontWeight: 800,
          letterSpacing: "0.18em",
        }}>
          GET STARTED →
        </div>
      </button>

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
          Kraken · Coinbase · Crypto.com · Binance · Alpaca — paste your
          read + trade API keys (never withdrawal) to enable live execution.
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
        Your balance stays at your brokerage or exchange. You can disconnect
        any time.
      </div>
    </>
  );
}

// ─── Step 2: Alpaca external CTA (PWA) ──────────────────────────────────────
function AlpacaCtaContent({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  return (
    <>
      <div style={{ marginBottom: 20, paddingRight: 44 }}>
        <div style={{
          fontFamily: MONO, fontSize: 10, fontWeight: 800,
          letterSpacing: "0.20em", textTransform: "uppercase",
          color: BRAND, marginBottom: 8,
          textShadow: `0 0 8px ${BRAND_GLOW}`,
        }}>
          ◆ Step 1 of 2 · Open Alpaca Account
        </div>
        <div style={{
          fontSize: 22, fontWeight: 800, color: TEXT_0,
          letterSpacing: -0.4, lineHeight: 1.2,
        }}>
          Create &amp; fund your Alpaca brokerage account
        </div>
      </div>

      <ol style={{
        margin: 0, padding: "0 0 0 22px",
        fontSize: 14, color: TEXT_1, lineHeight: 1.7,
      }}>
        <li>Open <strong style={{ color: TEXT_0 }}>alpaca.markets</strong> in a new tab and complete the regulated KYC sign-up.</li>
        <li><strong style={{ color: TEXT_0 }}>Deposit funds into your Alpaca brokerage account</strong> directly — your money stays at Alpaca.</li>
        <li>Generate live <strong style={{ color: TEXT_0 }}>API keys</strong> inside Alpaca (Read + Trade only).</li>
        <li>Come back here, paste your API key &amp; secret, start trading.</li>
      </ol>

      <a
        href={ALPACA_PROVIDER.externalUrl}
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
          boxShadow: `0 10px 28px rgba(102,255,102,0.30), 0 1px 0 rgba(255,255,255,0.45) inset`,
        }}
      >
        Open Alpaca ↗
      </a>

      <div style={{
        marginTop: 20, padding: "14px 14px", borderRadius: 12,
        background: "rgba(102,255,102,0.04)",
        border: `1px solid ${BRAND}28`,
        fontSize: 12.5, color: TEXT_1, lineHeight: 1.6,
      }}>
        <div style={{ marginBottom: 6 }}>
          🔒 <strong style={{ color: TEXT_0 }}>Funds remain inside your Alpaca brokerage account.</strong>
        </div>
        <div style={{ marginBottom: 6 }}>
          🛡 AICandlez never holds customer money. We only place trades using your API key.
        </div>
        <div>
          ✨ You may disconnect your account any time — withdrawals happen at Alpaca.
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
            boxShadow: `0 10px 28px rgba(102,255,102,0.30), 0 1px 0 rgba(255,255,255,0.45) inset`,
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
        body="Auto Trade executes high-confidence signals on your behalf — up to 3 concurrent trades on AI Trading, 12 on AI Trading Pro. Pause or stop AI anytime." />
      <PWAIntroRow emoji="🛡" title="You always keep custody"
        body="Funds remain in your own brokerage or exchange account. AICandlez never holds customer money." />

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
          boxShadow: `0 10px 30px rgba(102,255,102,0.32), 0 1px 0 rgba(255,255,255,0.45) inset`,
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
