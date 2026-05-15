import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/api";

export default function Consent() {
  const [, setLocation]        = useLocation();
  const queryClient            = useQueryClient();
  const [checked, setChecked]  = useState(false);
  const [step, setStep]        = useState<"read" | "confirm">("read");

  const accept = useMutation({
    mutationFn: () => api.post("/user/consent", {
      consentVersion: "1.0",
      acknowledged:   true,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-eligibility"] });
      setLocation("/trade");
    },
  });

  if (step === "read") {
    return (
      <div style={{ padding: "16px 16px 80px" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
            letterSpacing: "0.2em", marginBottom: 4 }}>LEGAL DISCLOSURE</div>
          <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
            Performance Fee Agreement
          </div>
        </div>

        <div style={{
          background:   "#050d18",
          border:       "1px solid #ffaa0040",
          borderRadius: 10,
          padding:      "18px 18px",
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700,
            color: "#ffaa00", letterSpacing: "0.1em", marginBottom: 12 }}>
            ⚠ IMPORTANT — READ CAREFULLY
          </div>

          <div style={{ fontSize: 12, lineHeight: 1.7, color: "#8aaccc",
            fontFamily: "system-ui, sans-serif" }}>
            <p style={{ marginBottom: 12 }}>
              By enabling live trading, you agree that <strong style={{ color: "#e8f4ff" }}>
              Apex Trader charges a 2% performance fee</strong> on all profitable trades
              executed by the AI engine on your behalf.
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "#e8f4ff" }}>How it works:</strong> When a trade closes
              at a profit, 2% of that profit is debited from your account balance and credited to
              Apex Trader's fee ledger. You will see an itemized record of all performance fees
              in your Account page.
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "#e8f4ff" }}>No fees on losses:</strong> Performance fees
              are only charged on profitable closed positions. If a trade closes at a loss,
              no fee is charged.
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "#e8f4ff" }}>Withdrawal permissions:</strong> Apex Trader
              will NEVER request withdrawal permissions from your exchange. Only read and trade
              permissions are used. Your funds remain under your control at all times.
            </p>
            <p style={{ marginBottom: 0 }}>
              <strong style={{ color: "#e8f4ff" }}>Risk disclosure:</strong> Cryptocurrency
              trading involves substantial risk of loss. Past performance is not indicative of
              future results. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>

        <div style={{
          background: "#050d18", border: "1px solid #0d2035",
          borderRadius: 10, padding: "14px 16px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
            letterSpacing: "0.12em", marginBottom: 10 }}>FEE SUMMARY</div>
          {[
            ["Performance Fee",     "2% of profitable trades"],
            ["Monthly Subscription","$5.99 / month"],
            ["Fee on Losses",       "NONE"],
            ["Withdrawal Access",   "NEVER REQUESTED"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between",
              padding: "7px 0", borderBottom: "1px solid #0a1a28" }}>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "#3a6080" }}>{k}</span>
              <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>{v}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => setStep("confirm")}
          style={{
            width:        "100%",
            padding:      "14px 0",
            background:   "#00aaff18",
            border:       "1px solid #00aaff60",
            borderRadius: 8,
            color:        "#00aaff",
            fontFamily:   "monospace",
            fontSize:     13,
            fontWeight:   700,
            letterSpacing: "0.1em",
            cursor:       "pointer",
          }}>
          I HAVE READ AND UNDERSTAND →
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 16px 80px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060",
          letterSpacing: "0.2em", marginBottom: 4 }}>STEP 2 OF 2</div>
        <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
          Confirm Agreement
        </div>
      </div>

      {accept.isError && (
        <div style={{ background: "#ff444415", border: "1px solid #ff444440",
          borderRadius: 8, padding: "10px 14px", marginBottom: 16,
          fontSize: 11, fontFamily: "monospace", color: "#ff4466" }}>
          {accept.error instanceof Error ? accept.error.message : "Failed to record consent. Try again."}
        </div>
      )}

      <div style={{
        background:   "#050d18",
        border:       "1px solid #0d2035",
        borderRadius: 10,
        padding:      "18px",
        marginBottom: 20,
      }}>
        <label style={{ display: "flex", gap: 14, alignItems: "flex-start", cursor: "pointer" }}>
          <div
            onClick={() => setChecked(p => !p)}
            style={{
              width:        22,
              height:       22,
              borderRadius: 4,
              border:       `2px solid ${checked ? "#00aaff" : "#1e3a50"}`,
              background:   checked ? "#00aaff18" : "transparent",
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              flexShrink:   0,
              marginTop:    1,
              transition:   "all 0.15s ease",
            }}>
            {checked && <span style={{ color: "#00aaff", fontSize: 14, fontWeight: 700 }}>✓</span>}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.7, color: "#8aaccc",
            fontFamily: "system-ui, sans-serif" }}>
            I confirm that I have read and agree to the{" "}
            <strong style={{ color: "#e8f4ff" }}>2% performance fee</strong> on profitable
            trades, the <strong style={{ color: "#e8f4ff" }}>$5.99/month subscription</strong>,
            and the risk disclosures. I understand that cryptocurrency trading carries
            substantial risk of loss.
          </div>
        </label>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => setStep("read")}
          style={{
            flex:         "0 0 90px",
            padding:      "14px 0",
            background:   "transparent",
            border:       "1px solid #0d2035",
            borderRadius: 8,
            color:        "#2a4060",
            fontFamily:   "monospace",
            fontSize:     11,
            cursor:       "pointer",
          }}>
          ← BACK
        </button>
        <button
          disabled={!checked || accept.isPending}
          onClick={() => accept.mutate()}
          style={{
            flex:         1,
            padding:      "14px 0",
            background:   checked && !accept.isPending ? "#00aaff18" : "#050d18",
            border:       `1px solid ${checked && !accept.isPending ? "#00aaff60" : "#0d2035"}`,
            borderRadius: 8,
            color:        checked && !accept.isPending ? "#00aaff" : "#1e3a50",
            fontFamily:   "monospace",
            fontSize:     13,
            fontWeight:   700,
            letterSpacing: "0.1em",
            cursor:       checked && !accept.isPending ? "pointer" : "not-allowed",
            transition:   "all 0.15s ease",
          }}>
          {accept.isPending ? "RECORDING..." : "ACCEPT & ACTIVATE LIVE TRADING"}
        </button>
      </div>
    </div>
  );
}
