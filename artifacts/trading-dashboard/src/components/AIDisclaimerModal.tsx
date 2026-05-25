import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { authFetch } from "../lib/authFetch";

// ── AIDisclaimerModal ──────────────────────────────────────────────────────
//
// Eligibility + risk acknowledgement modal shown the first time a customer
// tries to enable AI auto-trading. Acceptance is persisted server-side
// (versioned) so a tampered frontend cannot bypass it — `gate 0e` in
// `placeLiveAutoOrderForUser` will still reject orders until the server
// records acceptance for the CURRENT disclaimer version.

interface DisclaimerPayload {
  version:          string;
  title:            string;
  body:             string;
  acknowledgements: readonly string[];
  riskDisclosure:   string;
  links:            { terms: string; risk: string };
}

interface Props {
  open:        boolean;
  disclaimer:  DisclaimerPayload;
  onAccepted:  () => void;
  onCancel:    () => void;
  needsReaccept?: boolean;
}

const NEON  = "#66FF66";
const AMBER = "#FFB820";
const RED   = "#FF3040";
const INK0  = "#000";
const INK1  = "#0A1410";
const INK2  = "#0F1F18";

export function AIDisclaimerModal({ open, disclaimer, onAccepted, onCancel, needsReaccept }: Props) {
  const [acks, setAcks] = useState<boolean[]>(() => disclaimer.acknowledgements.map(() => false));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAcks(disclaimer.acknowledgements.map(() => false));
      setError(null);
      setSubmitting(false);
    }
  }, [open, disclaimer.acknowledgements]);

  if (!open) return null;

  const allChecked = acks.length > 0 && acks.every(Boolean);

  const submit = async (): Promise<void> => {
    if (!allChecked || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await authFetch("/api/user/ai-disclaimer", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ acknowledged: true, version: disclaimer.version }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => "");
        throw new Error(`HTTP ${r.status} ${detail}`);
      }
      onAccepted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-disclaimer-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(6px)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          overflow: "auto",
          background: `linear-gradient(180deg, ${INK1} 0%, ${INK0} 100%)`,
          border: `1px solid ${NEON}`,
          boxShadow: `0 0 22px rgba(102,255,102,0.18), inset 0 0 32px rgba(102,255,102,0.05)`,
          position: "relative",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 16px",
          borderBottom: `1px solid ${NEON}44`,
          background: `linear-gradient(90deg, rgba(102,255,102,0.10) 0%, transparent 100%)`,
        }}>
          <AlertTriangle size={18} color={AMBER} />
          <h2 id="ai-disclaimer-title" style={{
            margin: 0, flex: 1,
            fontSize: 13, color: "#fff", fontWeight: 800,
            letterSpacing: "0.18em", textTransform: "uppercase",
          }}>
            {disclaimer.title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel and close disclaimer"
            disabled={submitting}
            style={{
              appearance: "none", border: "none", background: "transparent",
              color: "#aaa", cursor: submitting ? "not-allowed" : "pointer",
              padding: 4, opacity: submitting ? 0.5 : 1,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          {needsReaccept ? (
            <div style={{
              padding: "8px 12px",
              border: `1px solid ${AMBER}66`,
              background: "rgba(255,184,32,0.08)",
              color: AMBER, fontSize: 11, letterSpacing: "0.10em",
            }}>
              Disclaimer terms have been updated. Please review and re-confirm to continue.
            </div>
          ) : null}

          <p style={{
            margin: 0, color: "#e8e8e8", fontSize: 13, lineHeight: 1.55,
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          }}>
            {disclaimer.body}
          </p>

          <div style={{
            padding: 12,
            background: INK2,
            border: `1px solid ${AMBER}44`,
            fontSize: 12, color: "#ffe8b5", lineHeight: 1.55,
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 10, color: AMBER, letterSpacing: "0.18em",
              marginBottom: 6, fontWeight: 800,
            }}>
              RISK DISCLOSURE · NOT FINANCIAL ADVICE
            </div>
            {disclaimer.riskDisclosure}
          </div>

          {/* Checkboxes — all required */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {disclaimer.acknowledgements.map((label, idx) => (
              <label
                key={idx}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: 10,
                  border: `1px solid ${acks[idx] ? NEON : "#333"}`,
                  background: acks[idx] ? "rgba(102,255,102,0.06)" : INK2,
                  cursor: "pointer",
                  fontSize: 12, color: "#eee", lineHeight: 1.5,
                  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
                  transition: "border-color 150ms ease, background 150ms ease",
                }}
              >
                <input
                  type="checkbox"
                  checked={acks[idx] ?? false}
                  onChange={(e) => {
                    const next = [...acks];
                    next[idx] = e.target.checked;
                    setAcks(next);
                  }}
                  disabled={submitting}
                  style={{
                    width: 16, height: 16, marginTop: 2, accentColor: NEON,
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          {/* Legal links */}
          <div style={{
            display: "flex", gap: 16, flexWrap: "wrap",
            fontSize: 11, color: "#888",
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            letterSpacing: "0.10em",
          }}>
            <a href={disclaimer.links.terms} target="_blank" rel="noopener noreferrer"
               style={{ color: NEON, textDecoration: "underline" }}>
              TERMS OF SERVICE ↗
            </a>
            <a href={disclaimer.links.risk} target="_blank" rel="noopener noreferrer"
               style={{ color: NEON, textDecoration: "underline" }}>
              RISK DISCLOSURE ↗
            </a>
          </div>

          {error ? (
            <div style={{
              padding: "8px 12px",
              border: `1px solid ${RED}66`,
              background: "rgba(255,48,64,0.08)",
              color: "#ffc8c8", fontSize: 11,
            }}>
              Could not record acceptance: {error}
            </div>
          ) : null}
        </div>

        {/* Footer actions */}
        <div style={{
          display: "flex", gap: 10, padding: 14,
          borderTop: `1px solid ${NEON}33`,
          background: "rgba(0,0,0,0.4)",
        }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              flex: 1, appearance: "none",
              padding: "10px 14px",
              border: "1px solid #444", background: "transparent",
              color: "#bbb", fontWeight: 700, fontSize: 11,
              letterSpacing: "0.16em", textTransform: "uppercase",
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.5 : 1,
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { void submit(); }}
            disabled={!allChecked || submitting}
            style={{
              flex: 2, appearance: "none",
              padding: "10px 14px",
              border: `1px solid ${allChecked ? NEON : "#333"}`,
              background: allChecked ? NEON : "#1a1a1a",
              color: allChecked ? "#000" : "#666",
              fontWeight: 800, fontSize: 11,
              letterSpacing: "0.18em", textTransform: "uppercase",
              cursor: allChecked && !submitting ? "pointer" : "not-allowed",
              boxShadow: allChecked ? "0 0 12px rgba(102,255,102,0.30)" : "none",
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              transition: "background 150ms ease, box-shadow 150ms ease",
            }}
          >
            {submitting ? "Recording…" : "I Agree & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
