import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, CheckCircle2, Circle, AlertTriangle, Loader2, X } from "lucide-react";

// ── Live Trading Consent ───────────────────────────────────────────────────────
// Shown once per user (version "v1.0") at the moment they first try to activate
// a live exchange. Paper trading is always free and requires no consent.
// Modal is non-blocking — the dashboard renders normally behind it.

interface ConsentStatus {
  hasConsented:   boolean;
  consentVersion: string;
  consentedAt:    string | null;
}

const CONSENT_ITEMS = [
  {
    id:    "acceptedTerms",
    label: "I accept the AICandlez Terms of Service and understand this platform is for informational and research purposes. Crypto trading involves significant risk of loss.",
  },
  {
    id:    "acceptedMembershipFee",
    label: "I understand AICandlez charges a $5.99/month membership fee covering platform access, infrastructure, and AI compute. This fee applies regardless of trading performance.",
  },
  {
    id:    "acceptedPerformanceFee",
    label: "I understand AICandlez charges a 2% performance fee on PROFITABLE, CLOSED trades only. This fee is applied to realized gains when a trade closes in profit.",
  },
  {
    id:    "acceptedNoFeeOnLosses",
    label: "I confirm that NO performance fee is charged on losing trades. If a trade closes at a loss, zero performance fee is applied.",
  },
  {
    id:    "acceptedNoUnrealizedFee",
    label: "I confirm that NO performance fee is charged on unrealized PnL. Fees only apply to final, settled trade outcomes — not open positions.",
  },
] as const;

type ConsentKey = typeof CONSENT_ITEMS[number]["id"];

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLiveConsent() {
  const { data, isLoading } = useQuery<ConsentStatus>({
    queryKey: ["user-consent"],
    queryFn:  () => fetch("/api/user/consent").then(r => r.json()),
    staleTime: Infinity,
    retry: false,
  });
  return {
    hasConsented: data?.hasConsented ?? false,
    isLoading,
  };
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface LiveConsentModalProps {
  open:        boolean;
  onConsented: () => void;
  onCancel:    () => void;
}

export function LiveConsentModal({ open, onConsented, onCancel }: LiveConsentModalProps) {
  const qc = useQueryClient();

  const [checked, setChecked] = useState<Record<ConsentKey, boolean>>({
    acceptedTerms:           false,
    acceptedMembershipFee:   false,
    acceptedPerformanceFee:  false,
    acceptedNoFeeOnLosses:   false,
    acceptedNoUnrealizedFee: false,
  });

  const allChecked = Object.values(checked).every(Boolean);

  const { mutate: submitConsent, isPending, isError } = useMutation({
    mutationFn: () =>
      fetch("/api/user/consent", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(checked),
      }).then(r => {
        if (!r.ok) throw new Error("Consent submission failed");
        return r.json();
      }),
    onSuccess: () => {
      qc.setQueryData(["user-consent"], (old: ConsentStatus | undefined) =>
        old ? { ...old, hasConsented: true, consentedAt: new Date().toISOString() } : old
      );
      qc.invalidateQueries({ queryKey: ["user-consent"] });
      onConsented();
    },
  });

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,2,8,0.92)",
      backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px",
    }}>
      <div style={{
        background: "#00050d",
        border: "1px solid #0d2035",
        borderRadius: 8,
        width: "100%",
        maxWidth: 580,
        maxHeight: "90vh",
        overflow: "auto",
        boxShadow: "0 0 60px #00aaff08, 0 0 120px #00aaff04",
        position: "relative",
      }}>

        {/* Close (cancel) */}
        <button
          onClick={onCancel}
          style={{
            position: "absolute", top: 14, right: 14,
            background: "none", border: "none",
            cursor: "pointer", padding: 4, color: "#2a4060",
          }}
          title="Cancel"
        >
          <X size={14} />
        </button>

        {/* Header */}
        <div style={{
          padding: "20px 24px 16px",
          borderBottom: "1px solid #0a1828",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 6,
            background: "#00aaff0c", border: "1px solid #00aaff28",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Shield className="w-5 h-5" style={{ color: "#00aaff" }} />
          </div>
          <div>
            <div style={{
              fontSize: 13, fontFamily: "monospace", fontWeight: 700,
              color: "#e8f4ff", letterSpacing: "0.06em",
            }}>
              LIVE TRADING AGREEMENT
            </div>
            <div style={{
              fontSize: 9, fontFamily: "monospace",
              color: "#3a6080", letterSpacing: "0.14em", marginTop: 2,
            }}>
              AICANDLEZ · REQUIRED ONCE · BEFORE LIVE EXCHANGE ACTIVATION
            </div>
          </div>
        </div>

        {/* Fee summary banner */}
        <div style={{
          margin: "16px 24px 0",
          padding: "12px 16px",
          background: "#00aaff08",
          border: "1px solid #00aaff20",
          borderRadius: 6,
          display: "grid",
          gridTemplateColumns: "1fr 1px 1fr",
          gap: 16,
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 22, fontFamily: "monospace", fontWeight: 700,
              color: "#00f0ff", textShadow: "0 0 12px #00f0ff60",
            }}>$5.99</div>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: "#3a6080",
              letterSpacing: "0.14em", marginTop: 3 }}>PER MONTH</div>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a5070",
              letterSpacing: "0.1em", marginTop: 1 }}>MEMBERSHIP FEE</div>
          </div>
          <div style={{ background: "#0d2035" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 22, fontFamily: "monospace", fontWeight: 700,
              color: "#00ff8a", textShadow: "0 0 12px #00ff8a60",
            }}>2%</div>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: "#3a6080",
              letterSpacing: "0.14em", marginTop: 3 }}>PROFITABLE TRADES ONLY</div>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: "#2a5070",
              letterSpacing: "0.1em", marginTop: 1 }}>PERFORMANCE FEE</div>
          </div>
        </div>

        {/* Zero-fee clarification */}
        <div style={{
          margin: "10px 24px 0",
          padding: "8px 12px",
          background: "#00050d",
          border: "1px solid #0a1828",
          borderRadius: 4,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: "#ffaa00" }} />
          <span style={{ fontSize: 8.5, fontFamily: "monospace", color: "#5a8090",
            letterSpacing: "0.08em", lineHeight: 1.5 }}>
            NO FEE on losing trades · NO FEE on unrealized PnL · Performance fee only applies to final, realized, profitable outcomes
          </span>
        </div>

        {/* Consent items */}
        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
          {CONSENT_ITEMS.map(item => {
            const isChecked = checked[item.id];
            return (
              <button
                key={item.id}
                onClick={() => setChecked(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  textAlign: "left", cursor: "pointer",
                  background: isChecked ? "#00ff8a06" : "#00050d",
                  border: `1px solid ${isChecked ? "#00ff8a28" : "#0d2035"}`,
                  borderRadius: 6,
                  padding: "10px 12px",
                  transition: "all 0.15s ease",
                  width: "100%",
                }}
              >
                {isChecked
                  ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#00ff8a" }} />
                  : <Circle      className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#1e4060" }} />
                }
                <span style={{
                  fontSize: 10, fontFamily: "monospace", lineHeight: 1.6,
                  color: isChecked ? "#8ab8cc" : "#4a6a80",
                }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* CTA */}
        <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
          {isError && (
            <div style={{
              padding: "8px 12px", borderRadius: 4,
              background: "#ff222508", border: "1px solid #ff222530",
              fontSize: 9, fontFamily: "monospace", color: "#ff6688",
              letterSpacing: "0.08em",
            }}>
              Failed to record consent. Please try again.
            </div>
          )}

          <button
            disabled={!allChecked || isPending}
            onClick={() => submitConsent()}
            style={{
              width: "100%",
              padding: "13px 24px",
              borderRadius: 6,
              fontFamily: "monospace",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              cursor: allChecked && !isPending ? "pointer" : "not-allowed",
              opacity: allChecked ? 1 : 0.35,
              background:   allChecked ? "#00aaff18" : "#050d18",
              color:        allChecked ? "#00f0ff"   : "#2a4050",
              border: `1px solid ${allChecked ? "#00aaff50" : "#0d2035"}`,
              boxShadow: allChecked ? "0 0 20px #00aaff15" : "none",
              transition: "all 0.2s ease",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {isPending ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> RECORDING CONSENT…</>
            ) : (
              "I ACCEPT ALL TERMS — ACTIVATE LIVE TRADING"
            )}
          </button>

          <div style={{
            fontSize: 8, fontFamily: "monospace", color: "#1e3040",
            textAlign: "center", letterSpacing: "0.1em", lineHeight: 1.5,
          }}>
            All five items must be checked. Your acceptance is recorded with a timestamp for compliance.
          </div>
        </div>
      </div>
    </div>
  );
}
