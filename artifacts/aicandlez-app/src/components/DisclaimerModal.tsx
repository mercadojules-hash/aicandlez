/**
 * DisclaimerModal — mandatory risk disclaimer for customer users.
 *
 * Shown before any of:
 *   • Stripe checkout / plan upgrade
 *   • Activating live AI execution
 *   • Connecting an exchange API key
 *
 * Operators (admin / super-admin) bypass entirely — both client (this modal
 * never opens) and server (`requireDisclaimer` middleware short-circuits).
 *
 * Locked to AICandlez neon-green institutional aesthetic — fullscreen overlay,
 * centered card, mobile-first responsive, all six checkboxes required.
 */

import { useState } from "react";
import { DISCLAIMER_ACKS, type DisclaimerAcks } from "@workspace/db";

// Design tokens — locked to PWA neon-green system
const BG_OVERLAY = "rgba(0,0,0,0.88)";
const CARD       = "#0A1410";
const CARD_HI    = "#0F1F18";
const E          = "rgba(255,255,255,0.10)";
const BRAND      = "#66FF66";
const BRAND_DEEP = "#00C853";
const BRAND_BRGT = "#7CFF00";
const W          = "#E8F5EC";
const GR         = "#8A9C94";
const DIM        = "#5A726A";
const WARN       = "rgba(255,180,0,0.92)";
const SANS       = "'SF Pro Display','Inter',system-ui,-apple-system,sans-serif";

interface Props {
  open:       boolean;
  submitting: boolean;
  error:      string | null;
  onAccept:   (acks: DisclaimerAcks) => void;
  onCancel:   () => void;
}

const EMPTY_ACKS: DisclaimerAcks = {
  acceptedNotAdvice:       false,
  acceptedTradingRisk:     false,
  acceptedAiInaccuracy:    false,
  acceptedPastPerformance: false,
  acceptedUserResponsible: false,
  acceptedAutomatedLosses: false,
};

export function DisclaimerModal({ open, submitting, error, onAccept, onCancel }: Props) {
  const [acks, setAcks] = useState<DisclaimerAcks>(EMPTY_ACKS);

  if (!open) return null;

  const allChecked = DISCLAIMER_ACKS.every(a => acks[a.key]);
  const toggle = (k: keyof DisclaimerAcks) => setAcks(prev => ({ ...prev, [k]: !prev[k] }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: BG_OVERLAY,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px 16px",
        overflowY: "auto",
        fontFamily: SANS,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%", maxWidth: 460, maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
          background: `linear-gradient(160deg, ${CARD_HI} 0%, ${CARD} 70%)`,
          border: `1px solid rgba(102,255,102,0.32)`,
          borderRadius: 18,
          padding: "22px 22px 20px",
          boxShadow: `0 24px 72px rgba(0,0,0,0.7), 0 0 0 1px rgba(102,255,102,0.18) inset, 0 0 56px rgba(102,255,102,0.18)`,
        }}
      >
        {/* Top edge sweep */}
        <div aria-hidden style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent 0%, ${BRAND_BRGT} 50%, transparent 100%)`,
          opacity: 0.75,
        }}/>

        {/* Header */}
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.18em",
          textTransform: "uppercase", color: WARN, marginBottom: 6,
        }}>
          Required · Risk Disclaimer
        </div>
        <h2 id="disclaimer-title" style={{
          fontSize: 19, fontWeight: 800, color: W, letterSpacing: -0.3,
          margin: 0, lineHeight: 1.25,
        }}>
          Acknowledge Trading Risks
        </h2>
        <p style={{
          fontSize: 11.5, color: GR, lineHeight: 1.55,
          marginTop: 8, marginBottom: 16,
        }}>
          AICandlez is a tool, not financial advice. Before you can subscribe,
          upgrade, connect an exchange, or activate live AI trading, you must
          acknowledge each statement below. Acceptance is recorded and tied to
          your account.
        </p>

        {/* Acknowledgement list */}
        <div style={{
          background: "rgba(0,0,0,0.35)",
          border: `1px solid ${E}`,
          borderRadius: 12,
          padding: "10px 6px",
          marginBottom: 14,
        }}>
          {DISCLAIMER_ACKS.map((a) => {
            const checked = acks[a.key];
            return (
              <label
                key={a.key}
                htmlFor={`ack-${a.key}`}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 11,
                  padding: "10px 12px",
                  cursor: submitting ? "wait" : "pointer",
                  borderRadius: 8,
                  background: checked ? "rgba(102,255,102,0.05)" : "transparent",
                  transition: "background 120ms ease",
                }}
              >
                <span style={{
                  flexShrink: 0, marginTop: 1,
                  width: 18, height: 18, borderRadius: 5,
                  background: checked ? BRAND : "rgba(255,255,255,0.04)",
                  border: `1.5px solid ${checked ? BRAND : "rgba(255,255,255,0.22)"}`,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, color: "#001b06", fontWeight: 900,
                  boxShadow: checked ? `0 0 12px rgba(102,255,102,0.45)` : "none",
                  transition: "all 120ms ease",
                }}>
                  {checked ? "✓" : ""}
                </span>
                <input
                  id={`ack-${a.key}`}
                  type="checkbox"
                  checked={checked}
                  onChange={() => !submitting && toggle(a.key)}
                  disabled={submitting}
                  style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
                />
                <span style={{
                  fontSize: 12.5, lineHeight: 1.5,
                  color: checked ? W : "rgba(232,245,236,0.78)",
                  fontWeight: checked ? 500 : 400,
                }}>
                  {a.label}
                </span>
              </label>
            );
          })}
        </div>

        {/* Legal blurb */}
        <div style={{
          fontSize: 9.5, color: DIM, lineHeight: 1.55, marginBottom: 14,
          letterSpacing: 0.2,
        }}>
          By continuing you confirm you have read and understood the risks of
          trading and AI-assisted execution. AICandlez does not provide
          investment advice. Trading is at your own risk.
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "rgba(255,51,85,0.07)",
            border: "1px solid rgba(255,51,85,0.28)",
            borderRadius: 10, padding: "9px 12px", marginBottom: 12,
            fontSize: 11, color: "rgba(255,100,120,0.92)",
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              flex: "0 0 auto", padding: "12px 16px",
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${E}`, borderRadius: 10,
              color: GR, fontSize: 11.5, fontWeight: 600,
              letterSpacing: 0.5, textTransform: "uppercase",
              cursor: submitting ? "wait" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => allChecked && !submitting && onAccept(acks)}
            disabled={!allChecked || submitting}
            style={{
              flex: 1, padding: "12px 16px", borderRadius: 10,
              background: allChecked && !submitting
                ? `linear-gradient(135deg, ${BRAND_DEEP} 0%, ${BRAND} 55%, ${BRAND_BRGT} 100%)`
                : "rgba(255,255,255,0.04)",
              border: `1px solid ${allChecked ? BRAND : "rgba(255,255,255,0.10)"}`,
              color: allChecked ? "#001b06" : GR,
              fontSize: 12, fontWeight: 800,
              letterSpacing: 0.6, textTransform: "uppercase",
              cursor: allChecked && !submitting ? "pointer" : "not-allowed",
              boxShadow: allChecked && !submitting
                ? `0 10px 28px rgba(102,255,102,0.30), 0 1px 0 rgba(255,255,255,0.45) inset`
                : "none",
              transition: "all 120ms ease",
            }}
          >
            {submitting ? "Recording…" : "I Agree & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
