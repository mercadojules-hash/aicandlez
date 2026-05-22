/**
 * DisclaimerModal — mandatory risk disclaimer for customer users on
 * trade.aicandlez.com (institutional desktop terminal).
 *
 * Operators (admin / super-admin) bypass entirely both client- and
 * server-side. This modal is only rendered for customer-role users.
 *
 * Locked to AICandlez neon-green institutional aesthetic per master spec.
 */

import { useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { DISCLAIMER_ACKS, type DisclaimerAcks } from "@workspace/db/constants/disclaimer";

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
  const toggle = (k: keyof DisclaimerAcks) =>
    setAcks(prev => ({ ...prev, [k]: !prev[k] }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title-dashboard"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onCancel(); }}
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-6 overflow-y-auto"
      style={{
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-2xl p-6 overflow-y-auto"
        style={{
          maxHeight: "calc(100vh - 48px)",
          background: "linear-gradient(160deg, #0F1F18 0%, #0A1410 70%)",
          border: "1px solid rgba(102,255,102,0.32)",
          boxShadow: "0 24px 72px rgba(0,0,0,0.7), 0 0 0 1px rgba(102,255,102,0.18) inset, 0 0 56px rgba(102,255,102,0.18)",
          fontFamily: "'SF Pro Display','Inter',system-ui,sans-serif",
        }}
      >
        {/* Top edge sweep */}
        <div aria-hidden className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent 0%, #7CFF00 50%, transparent 100%)",
            opacity: 0.75,
          }}
        />

        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: "rgba(255,180,0,0.92)" }} />
          <div className="font-mono text-[9px] font-bold tracking-[0.18em] uppercase"
               style={{ color: "rgba(255,180,0,0.92)" }}>
            Required · Risk Disclaimer
          </div>
        </div>
        <h2 id="disclaimer-title-dashboard"
            className="text-[20px] font-extrabold leading-tight"
            style={{ color: "#E8F5EC", letterSpacing: -0.3 }}>
          Acknowledge Trading Risks
        </h2>
        <p className="text-[12px] leading-relaxed mt-2 mb-4"
           style={{ color: "#8A9C94" }}>
          AICandlez is a tool, not financial advice. Before you can subscribe,
          upgrade, connect an exchange, or activate live AI trading, you must
          acknowledge each statement below. Acceptance is recorded against your
          account and required by the platform.
        </p>

        {/* Acknowledgement list */}
        <div className="rounded-xl p-1.5 mb-4"
             style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.10)" }}>
          {DISCLAIMER_ACKS.map((a) => {
            const checked = acks[a.key];
            return (
              <label
                key={a.key}
                htmlFor={`ack-d-${a.key}`}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors"
                style={{
                  background: checked ? "rgba(102,255,102,0.05)" : "transparent",
                  cursor: submitting ? "wait" : "pointer",
                }}
              >
                <span
                  className="shrink-0 mt-0.5 inline-flex items-center justify-center"
                  style={{
                    width: 18, height: 18, borderRadius: 5,
                    background: checked ? "#66FF66" : "rgba(255,255,255,0.04)",
                    border: `1.5px solid ${checked ? "#66FF66" : "rgba(255,255,255,0.22)"}`,
                    boxShadow: checked ? "0 0 12px rgba(102,255,102,0.45)" : "none",
                    color: "#001b06",
                    transition: "all 120ms ease",
                  }}
                >
                  {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                </span>
                <input
                  id={`ack-d-${a.key}`}
                  type="checkbox"
                  checked={checked}
                  disabled={submitting}
                  onChange={() => !submitting && toggle(a.key)}
                  className="sr-only"
                />
                <span
                  className="text-[12.5px] leading-snug"
                  style={{
                    color: checked ? "#E8F5EC" : "rgba(232,245,236,0.78)",
                    fontWeight: checked ? 500 : 400,
                  }}
                >
                  {a.label}
                </span>
              </label>
            );
          })}
        </div>

        {/* Legal blurb */}
        <div className="text-[10px] leading-relaxed mb-4"
             style={{ color: "#5A726A", letterSpacing: 0.2 }}>
          By continuing you confirm you have read and understood the risks of
          trading and AI-assisted execution. AICandlez does not provide
          investment advice. Trading is at your own risk.
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md px-3 py-2 mb-3 text-[11px]"
               style={{
                 background: "rgba(255,51,85,0.07)",
                 border: "1px solid rgba(255,51,85,0.28)",
                 color: "rgba(255,100,120,0.92)",
               }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-3 rounded-lg font-mono text-[11px] font-semibold uppercase tracking-wide transition-all"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "#8A9C94",
              cursor: submitting ? "wait" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => allChecked && !submitting && onAccept(acks)}
            disabled={!allChecked || submitting}
            className="flex-1 px-4 py-3 rounded-lg font-mono text-[12px] font-extrabold uppercase tracking-wide flex items-center justify-center gap-2 transition-all"
            style={{
              background: allChecked && !submitting
                ? "linear-gradient(135deg, #00C853 0%, #66FF66 55%, #7CFF00 100%)"
                : "rgba(255,255,255,0.04)",
              border: `1px solid ${allChecked ? "#66FF66" : "rgba(255,255,255,0.10)"}`,
              color: allChecked ? "#001b06" : "#8A9C94",
              cursor: allChecked && !submitting ? "pointer" : "not-allowed",
              boxShadow: allChecked && !submitting
                ? "0 10px 28px rgba(102,255,102,0.30), 0 1px 0 rgba(255,255,255,0.45) inset"
                : "none",
            }}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {submitting ? "Recording…" : "I Agree & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
