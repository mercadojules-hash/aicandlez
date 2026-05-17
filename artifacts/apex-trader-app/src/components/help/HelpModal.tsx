// T011: Glossary / Help modal skeleton.
// Displays searchable glossary and paper vs live education.
// Not yet wired to a trigger — ready to be invoked from any page.

import { useState } from "react";
import { GLOSSARY } from "@/hooks/useOnboarding";

const SANS = "Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif";
const MONO = "'SF Mono', 'JetBrains Mono', Consolas, monospace";
const C    = "#00e5ff";
const W    = "#ffffff";
const GR   = "#8892a4";
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";

type TabId = "glossary" | "paper_vs_live" | "risk";

interface HelpModalProps {
  open:    boolean;
  onClose: () => void;
}

export function HelpModal({ open, onClose }: HelpModalProps) {
  const [tab,    setTab]    = useState<TabId>("glossary");
  const [search, setSearch] = useState("");

  if (!open) return null;

  const terms = Object.entries(GLOSSARY).filter(([term]) =>
    search.length === 0 || term.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      onClick={onClose}
      style={{
        position:"fixed", inset:0, zIndex:1000,
        background:"rgba(0,0,0,0.80)", display:"flex",
        alignItems:"flex-end", justifyContent:"center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width:"100%", maxWidth:480, maxHeight:"85vh",
          background:CARD, borderRadius:"20px 20px 0 0",
          border:`1px solid ${E}`, overflow:"hidden",
          display:"flex", flexDirection:"column",
        }}
      >
        {/* Header */}
        <div style={{
          padding:"18px 20px 14px",
          borderBottom:`1px solid ${E}`,
          display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0,
        }}>
          <div>
            <div style={{ fontSize:17, fontFamily:SANS, fontWeight:700, color:W }}>
              Help & Glossary
            </div>
            <div style={{ fontSize:10, fontFamily:SANS, color:GR, marginTop:2 }}>
              Explanations for every AI metric and term
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width:32, height:32, borderRadius:"50%",
              background:"rgba(255,255,255,0.06)", border:`1px solid ${E}`,
              color:"rgba(255,255,255,0.55)", fontSize:16,
              display:"flex", alignItems:"center", justifyContent:"center",
              cursor:"pointer",
            }}
          >×</button>
        </div>

        {/* Tabs */}
        <div style={{
          display:"flex", gap:0, borderBottom:`1px solid ${E}`, flexShrink:0,
        }}>
          {(["glossary", "paper_vs_live", "risk"] as TabId[]).map(t => {
            const labels: Record<TabId, string> = {
              glossary:      "Glossary",
              paper_vs_live: "Paper vs Live",
              risk:          "Risk",
            };
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex:1, padding:"11px 4px",
                  background:"transparent", border:"none",
                  borderBottom:`2px solid ${tab === t ? C : "transparent"}`,
                  fontSize:11, fontFamily:SANS, fontWeight:600,
                  color: tab === t ? C : GR,
                  cursor:"pointer", transition:"all 0.15s",
                  letterSpacing:"0.04em",
                }}
              >
                {labels[t]}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto", padding:"14px 16px" }}>

          {tab === "glossary" && (
            <>
              <input
                placeholder="Search terms…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width:"100%", padding:"9px 12px", marginBottom:12,
                  background:"rgba(255,255,255,0.04)", border:`1px solid ${E}`,
                  borderRadius:8, color:W, fontFamily:SANS, fontSize:13,
                  outline:"none", boxSizing:"border-box",
                }}
              />
              {terms.map(([term, entry]) => (
                <div
                  key={term}
                  style={{
                    padding:"12px 0",
                    borderBottom:`1px solid rgba(255,255,255,0.05)`,
                  }}
                >
                  <div style={{ fontSize:12, fontFamily:SANS, fontWeight:700, color:C,
                    marginBottom:4 }}>{term}</div>
                  <div style={{ fontSize:12, fontFamily:SANS, color:"rgba(255,255,255,0.75)",
                    lineHeight:1.65 }}>{entry.detail}</div>
                </div>
              ))}
              {terms.length === 0 && (
                <div style={{ textAlign:"center", padding:"40px 0",
                  fontSize:12, fontFamily:SANS, color:GR }}>
                  No terms match "{search}"
                </div>
              )}
            </>
          )}

          {tab === "paper_vs_live" && (
            <div style={{ fontSize:13, fontFamily:SANS, lineHeight:1.75,
              color:"rgba(255,255,255,0.80)" }}>
              <div style={{ background:"rgba(0,229,255,0.06)", border:"1px solid rgba(0,229,255,0.15)",
                borderRadius:10, padding:"12px 14px", marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C, marginBottom:6,
                  letterSpacing:"0.10em" }}>PAPER TRADING (SIMULATION)</div>
                <ul style={{ paddingLeft:16, margin:0, color:"rgba(255,255,255,0.75)" }}>
                  <li>Uses virtual capital — no real money involved</li>
                  <li>Trades execute against real market prices</li>
                  <li>Profits and losses are simulated only</li>
                  <li>Cannot withdraw simulated profits</li>
                  <li>Safe to test AI strategies risk-free</li>
                </ul>
              </div>
              <div style={{ background:"rgba(0,255,136,0.05)", border:"1px solid rgba(0,255,136,0.15)",
                borderRadius:10, padding:"12px 14px", marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#00ff88", marginBottom:6,
                  letterSpacing:"0.10em" }}>LIVE TRADING (REAL MONEY)</div>
                <ul style={{ paddingLeft:16, margin:0, color:"rgba(255,255,255,0.75)" }}>
                  <li>Requires a funded Alpaca brokerage account</li>
                  <li>Real capital is deployed in real markets</li>
                  <li>Profits and losses are real</li>
                  <li>Must explicitly confirm live mode activation</li>
                  <li>Withdrawal permissions are never requested</li>
                </ul>
              </div>
              <div style={{ fontSize:11, fontFamily:SANS, color:"rgba(136,146,164,0.75)",
                lineHeight:1.7, padding:"8px 4px" }}>
                ⚠️ Past paper trading performance does not guarantee future live trading results.
                Slippage, liquidity, and execution timing differ in live markets.
              </div>
            </div>
          )}

          {tab === "risk" && (
            <div style={{ fontSize:13, fontFamily:SANS, lineHeight:1.75,
              color:"rgba(255,255,255,0.80)" }}>
              <div style={{ background:"rgba(255,51,85,0.06)", border:"1px solid rgba(255,51,85,0.18)",
                borderRadius:10, padding:"12px 14px", marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,80,100,0.90)",
                  marginBottom:6, letterSpacing:"0.10em" }}>RISK DISCLOSURE</div>
                <p style={{ margin:"0 0 8px" }}>
                  Trading involves significant risk and may result in the loss of your entire investment.
                  AICandlez does not provide financial advice.
                </p>
                <p style={{ margin:"0 0 8px" }}>
                  AI signals are not guarantees. No AI system can predict markets with certainty.
                  Always trade within your risk tolerance.
                </p>
                <p style={{ margin:0 }}>
                  A 3% performance fee applies only to profitable closed trades.
                  No fee is charged on losing trades or unrealized P&L.
                </p>
              </div>
              <div style={{ fontSize:11, fontFamily:MONO, color:"rgba(100,115,133,0.80)",
                lineHeight:1.9, padding:"4px" }}>
                AICandlez · Withdrawal permissions never requested
                <br/>Read and Trade permissions only
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
