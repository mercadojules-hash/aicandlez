/**
 * PortalExchangeConnectModal — local modal for the /portal Connect Exchange CTA.
 *
 * Hosts the full Connect-Exchange flow inline on the trade.aicandlez.com /portal
 * route. Replaces the prior cross-app hard-navigation to
 * https://app.aicandlez.com/settings/exchanges, which trapped users on the PWA's
 * settings screen after closing the X. Per the production bug report, closing X
 * must:
 *   • close the modal ONLY
 *   • preserve current route/state (stay on /portal)
 *   • not push browser history
 *   • not mount profile/settings views
 *
 * Submission flow:
 *   • Auth: Clerk Bearer + httpOnly session cookie (matches Portal pattern)
 *   • POST /api/user/exchanges/connect — server-side requireDisclaimer
 *     middleware blocks customers who have not accepted the disclaimer
 *     (412 → caller pre-checks via useDisclaimerGate).
 *   • Withdrawal permissions are never requested (security promise — see
 *     replit.md). The connect endpoint refuses to enable withdrawal capability.
 */

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { X, Loader2, ShieldCheck, AlertTriangle, Check } from "lucide-react";

const N = {
  BG_OVERLAY: "rgba(0,0,0,0.86)",
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
  ERROR:      "rgba(255,100,120,0.92)",
  FONT_MONO:  "ui-monospace, 'JetBrains Mono', Menlo, monospace",
  FONT_SANS:  "'SF Pro Display','Inter',system-ui,-apple-system,sans-serif",
};

interface Exchange {
  id:               string;
  name:             string;
  logo:             string;
  needsPassphrase?: boolean;
}
// Supported live-trading exchanges. Order matches the onboarding catalog
// (Alpaca first = primary recommendation for US users). OKX / KuCoin / Bybit /
// Robinhood are deliberately omitted for US-compliance reasons — see
// artifacts/api-server/src/services/exchanges/catalog.ts header comment.
const EXCHANGES: Exchange[] = [
  { id: "Alpaca",       name: "Alpaca",      logo: "A" },
  { id: "Kraken",       name: "Kraken",      logo: "K" },
  { id: "Coinbase",     name: "Coinbase",    logo: "C" },
  { id: "CryptoDotCom", name: "Crypto.com",  logo: "ᶜ" },
  { id: "Binance",      name: "Binance",     logo: "B" },
];

interface Props {
  open:    boolean;
  onClose: () => void;
  /**
   * Optional ID (matches backend catalog: "Alpaca" | "Kraken" | "Coinbase" |
   * "CryptoDotCom" | "Binance") to lock the exchange picker to a single
   * choice. Used by OnboardingFlow when the user picks the "Create / Fund
   * Alpaca" path so they can't switch away mid-flow.
   */
  preselectedExchange?: string;
  /** Fires after a successful connect. OnboardingFlow uses it to advance state. */
  onConnected?: () => void;
}

export function PortalExchangeConnectModal({ open, onClose, preselectedExchange, onConnected }: Props) {
  const { getToken } = useAuth();
  const initialPick = preselectedExchange
    ? (EXCHANGES.find(e => e.id === preselectedExchange) ?? EXCHANGES[0])
    : EXCHANGES[0];
  const [picked,     setPicked]     = useState<Exchange>(initialPick);
  // `useState(initialPick)` only fires on mount, so a later `preselectedExchange`
  // change (e.g., re-entering the connect step with a different lock) would
  // be silently ignored. Sync via effect.
  useEffect(() => {
    if (!preselectedExchange) return;
    const next = EXCHANGES.find(e => e.id === preselectedExchange);
    if (next && next.id !== picked.id) setPicked(next);
    // We intentionally don't depend on `picked` to avoid fighting user changes
    // after the lock — when a preselection arrives, we honor it once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedExchange]);
  const [label,      setLabel]      = useState("");
  const [apiKey,     setApiKey]     = useState("");
  const [apiSecret,  setApiSecret]  = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState(false);

  if (!open) return null;

  const reset = () => {
    setPicked(EXCHANGES[0]); setLabel(""); setApiKey(""); setApiSecret("");
    setPassphrase(""); setError(null); setSuccess(false); setSubmitting(false);
  };

  // Close button MUST stay local — never navigate, never push history.
  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const canSubmit =
    !!apiKey.trim() &&
    !!apiSecret.trim() &&
    (!picked.needsPassphrase || !!passphrase.trim()) &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken().catch(() => null);
      const r = await fetch("/api/user/exchanges/connect", {
        method:      "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          exchange:  picked.id,
          label:     label.trim() || picked.name,
          apiKey:    apiKey.trim(),
          apiSecret: apiSecret.trim(),
          ...(picked.needsPassphrase ? { passphrase: passphrase.trim() } : {}),
        }),
      });
      const data = await r.json().catch(() => ({} as { error?: string }));
      if (!r.ok) {
        throw new Error((data as { error?: string }).error
          ?? `Connection failed (HTTP ${r.status}). Check your credentials and try again.`);
      }
      setSuccess(true);
      onConnected?.();
      setTimeout(() => { reset(); onClose(); }, 1500);
    } catch (e) {
      setError(e instanceof Error
        ? e.message
        : "Connection failed. Check your credentials and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="portal-exchange-title"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: N.BG_OVERLAY,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px 16px",
        overflowY: "auto",
        fontFamily: N.FONT_SANS,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%", maxWidth: 520,
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
          background: `linear-gradient(160deg, ${N.CARD_HI} 0%, ${N.CARD} 70%)`,
          border: `1px solid rgba(102,255,102,0.32)`,
          borderRadius: 16,
          padding: "22px 22px 20px",
          boxShadow: `0 24px 72px rgba(0,0,0,0.7), 0 0 0 1px rgba(102,255,102,0.18) inset, 0 0 56px rgba(102,255,102,0.18)`,
        }}
      >
        {/* Top sweep */}
        <div aria-hidden style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent 0%, ${N.BRAND_BRGT} 50%, transparent 100%)`,
          opacity: 0.75,
        }}/>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 800,
              letterSpacing: "0.18em", textTransform: "uppercase",
              color: N.BRAND, marginBottom: 6,
              textShadow: `0 0 8px ${N.BRAND_GLOW}`,
            }}>
              ◆ Connect Exchange
            </div>
            <h2 id="portal-exchange-title" style={{
              fontSize: 19, fontWeight: 800, color: N.TEXT_0,
              letterSpacing: -0.3, margin: 0, lineHeight: 1.25,
            }}>
              Link your trading account
            </h2>
            <p style={{
              fontSize: 11.5, color: N.TEXT_1, lineHeight: 1.55,
              marginTop: 6, marginBottom: 0,
            }}>
              Read-only trading credentials. Withdrawal permission is never
              requested. Keys are encrypted at rest with AES-256-GCM.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={handleClose}
            disabled={submitting}
            style={{
              flexShrink: 0,
              width: 32, height: 32, borderRadius: 8,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${N.BORDER}`,
              color: N.TEXT_1,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              cursor: submitting ? "wait" : "pointer",
              transition: "all 120ms ease",
            }}
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        {/* Success state */}
        {success ? (
          <div style={{
            padding: "32px 16px", textAlign: "center",
            background: "rgba(102,255,102,0.05)",
            border: `1px solid ${N.BRAND}40`,
            borderRadius: 12,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: `${N.BRAND}22`, border: `2px solid ${N.BRAND}`,
              boxShadow: `0 0 20px ${N.BRAND_GLOW}`,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              marginBottom: 14,
            }}>
              <Check size={28} color={N.BRAND} strokeWidth={3} />
            </div>
            <div style={{
              fontFamily: N.FONT_MONO, fontSize: 14, fontWeight: 900,
              color: N.BRAND, letterSpacing: "0.18em",
              textShadow: `0 0 14px ${N.BRAND_GLOW}, 0 0 28px ${N.BRAND_GLOW}`,
            }}>
              EXCHANGE CONNECTED
            </div>
            <div style={{ fontSize: 14, color: N.TEXT_0, marginTop: 8, fontWeight: 700,
              letterSpacing: 0.2 }}>
              {picked.name} <span style={{ color: N.TEXT_1, fontWeight: 500 }}>ready for trading</span>
            </div>
          </div>
        ) : (
          <>
            {/* Exchange picker */}
            <div style={{
              fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 700,
              letterSpacing: "0.16em", color: N.TEXT_1,
              marginBottom: 8,
            }}>
              EXCHANGE
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6,
              marginBottom: 16,
            }}>
              {EXCHANGES.map((ex) => {
                const isSel = ex.id === picked.id;
                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => { setPicked(ex); setError(null); }}
                    disabled={submitting}
                    style={{
                      padding: "12px 10px",
                      borderRadius: 8,
                      background: isSel ? `rgba(102,255,102,0.10)` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isSel ? N.BRAND : N.BORDER}`,
                      color: isSel ? N.BRAND : N.TEXT_0,
                      fontFamily: N.FONT_MONO, fontSize: 14, fontWeight: 900,
                      letterSpacing: "0.14em",
                      cursor: submitting ? "not-allowed" : "pointer",
                      boxShadow: isSel ? `0 0 20px ${N.BRAND_GLOW}, 0 0 0 1px ${N.BRAND}55 inset` : "none",
                      textShadow: isSel ? `0 0 10px ${N.BRAND_GLOW}` : "none",
                      transition: "all 120ms ease",
                    }}
                  >
                    {ex.name.toUpperCase()}
                  </button>
                );
              })}
            </div>

            {/* Label */}
            <Field label="LABEL (OPTIONAL)" value={label}
                   onChange={setLabel} placeholder={`My ${picked.name}`}
                   disabled={submitting} />
            {/* API Key */}
            <Field label="API KEY" value={apiKey}
                   onChange={setApiKey} placeholder="Paste API key"
                   monospace required disabled={submitting} />
            {/* API Secret */}
            <Field label="API SECRET" value={apiSecret}
                   onChange={setApiSecret} placeholder="Paste API secret"
                   monospace required masked disabled={submitting} />
            {/* Passphrase */}
            {picked.needsPassphrase && (
              <Field label="PASSPHRASE" value={passphrase}
                     onChange={setPassphrase} placeholder="Required for this exchange"
                     monospace required masked disabled={submitting} />
            )}

            {/* Security note */}
            <div style={{
              display: "flex", gap: 9, alignItems: "flex-start",
              padding: "10px 12px",
              background: "rgba(102,255,102,0.04)",
              border: `1px solid ${N.BRAND}28`,
              borderRadius: 10,
              marginTop: 4, marginBottom: 14,
            }}>
              <ShieldCheck size={14} color={N.BRAND} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 10.5, color: N.TEXT_1, lineHeight: 1.5 }}>
                Create the API key with <strong style={{ color: N.TEXT_0 }}>trading enabled and withdrawals disabled</strong>.
                AICandlez will <strong style={{ color: N.TEXT_0 }}>never</strong> request or store withdrawal permissions.
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                display: "flex", gap: 9, alignItems: "flex-start",
                padding: "10px 12px",
                background: "rgba(255,51,85,0.07)",
                border: "1px solid rgba(255,51,85,0.28)",
                borderRadius: 10,
                marginBottom: 12,
                fontSize: 11, color: N.ERROR,
              }}>
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                style={{
                  padding: "12px 16px",
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${N.BORDER}`,
                  borderRadius: 10,
                  color: N.TEXT_1,
                  fontFamily: N.FONT_MONO, fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.14em", textTransform: "uppercase",
                  cursor: submitting ? "wait" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{
                  flex: 1, padding: "12px 16px", borderRadius: 10,
                  background: canSubmit
                    ? `linear-gradient(135deg, ${N.BRAND_DEEP} 0%, ${N.BRAND} 55%, ${N.BRAND_BRGT} 100%)`
                    : "rgba(255,255,255,0.04)",
                  border: `1px solid ${canSubmit ? N.BRAND : N.BORDER}`,
                  color: canSubmit ? "#001b06" : N.TEXT_1,
                  fontFamily: N.FONT_MONO, fontSize: 11.5, fontWeight: 800,
                  letterSpacing: "0.16em", textTransform: "uppercase",
                  cursor: canSubmit ? "pointer" : "not-allowed",
                  boxShadow: canSubmit
                    ? `0 10px 28px rgba(102,255,102,0.30), 0 1px 0 rgba(255,255,255,0.45) inset`
                    : "none",
                  transition: "all 120ms ease",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {submitting && <Loader2 size={13} className="animate-spin" />}
                {submitting ? "Connecting…" : "Connect Exchange"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface FieldProps {
  label:        string;
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;
  monospace?:   boolean;
  required?:    boolean;
  masked?:      boolean;
  disabled?:    boolean;
}
function Field({ label, value, onChange, placeholder, monospace, required, masked, disabled }: FieldProps) {
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{
        fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 700,
        letterSpacing: "0.16em", color: N.TEXT_1, marginBottom: 5,
      }}>
        {label}{required && <span style={{ color: N.BRAND, marginLeft: 4 }}>*</span>}
      </div>
      <input
        type={masked ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "rgba(0,0,0,0.4)",
          border: `1px solid ${N.BORDER}`,
          borderRadius: 9,
          color: N.TEXT_0,
          fontSize: 12.5,
          fontFamily: monospace ? N.FONT_MONO : N.FONT_SANS,
          letterSpacing: monospace ? 0.4 : "normal",
          outline: "none",
          transition: "border-color 120ms ease, box-shadow 120ms ease",
        }}
        onFocus={(e) => {
          e.target.style.borderColor = N.BRAND;
          e.target.style.boxShadow = `0 0 0 3px ${N.BRAND}18`;
        }}
        onBlur={(e) => {
          e.target.style.borderColor = N.BORDER;
          e.target.style.boxShadow = "none";
        }}
      />
    </div>
  );
}
