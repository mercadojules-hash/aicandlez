import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { api, type Portfolio, type Subscription, type SimAccount, type SimTrade } from "@/lib/api";
import { PERFORMANCE_FEE_LABEL } from "@/lib/fees";
import { useBrokerConnection } from "@/contexts/BrokerConnectionContext";
import { BrokerStatusCard } from "@/components/BrokerStatusCard";
import { useAIAutoTrade } from "@/contexts/AIAutoTradeContext";
import { useUserProfile, type UserProfile } from "@/contexts/UserProfileContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { PageHeader } from "@/components/PageHeader";
import { useFeedbackPrefs, ALERT_DEFINITIONS, type AlertKey } from "@/lib/feedback";

// ── Design tokens ────────────────────────────────────────────────────────────────
// Aligned with the Signals/Crypto/Equities neon-green system.
// Legacy cyan token `C` is kept as a name but remapped onto BRAND green so
// the entire existing layout re-skins without restructuring.
const BG   = "#000000";
const CARD = "#0A1410";
const E    = "rgba(255,255,255,0.07)";
const C    = "#66FF66";   // BRAND (was cyan #00e5ff)
const G    = "#7CFF00";   // bright lime accent
const W    = "#E8F5EC";
const GR   = "#8A9C94";
const DIM  = "#5A726A";
const GOLD = "#ffd200";
const SANS = "'SF Pro Display','Inter',system-ui,-apple-system,sans-serif";
const MONO = "'SF Mono','JetBrains Mono','Roboto Mono',Consolas,monospace";

// ── Helpers ──────────────────────────────────────────────────────────────────────
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0]?.slice(0, 2) ?? "A").toUpperCase();
}

// ── Donut ─────────────────────────────────────────────────────────────────────────
function Donut({ value, color, label }: { value: number; color: string; label: string }) {
  const size = 74, sw = 5.5, r = (size - sw * 2) / 2, cx = size / 2;
  const circ = 2 * Math.PI * r, arc = (Math.min(value, 100) / 100) * circ;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={sw}/>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${arc} ${circ - arc}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ filter:`drop-shadow(0 0 5px ${color}60)`, transition:"stroke-dasharray 0.5s" }}/>
        <text x={cx} y={cx} textAnchor="middle" dominantBaseline="central"
          fill="rgba(255,255,255,0.92)" fontSize="14" fontWeight="700" fontFamily={MONO}>{value}</text>
      </svg>
      <div style={{ fontSize:8, fontFamily:SANS, fontWeight:500, color:GR,
        letterSpacing:"0.11em", textTransform:"uppercase" as const, textAlign:"center" as const }}>{label}</div>
    </div>
  );
}

// ── Monthly chart (REAL user performance) ────────────────────────────────────
// Buckets closed sim trades into the last N month-buckets and shows realized
// PnL per bucket. Empty state shown when the user has no closed AI trades yet.
//
// Why month-buckets: gives the trader a felt sense of monthly compounding
// without being noisy. The most recent bar gets the brand-green glow so the
// chart reinforces "my AI account is growing."
const MONTH_LABELS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function bucketTradesByMonth(trades: { closedAt: string; pnl: number }[], bucketCount = 7) {
  // Build N month buckets ending at the current month.
  const now = new Date();
  const buckets: { label: string; value: number; key: string }[] = [];
  for (let i = bucketCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      label: MONTH_LABELS[d.getMonth()]!,
      value: 0,
      key:   `${d.getFullYear()}-${d.getMonth()}`,
    });
  }
  for (const t of trades) {
    const d = new Date(t.closedAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const b = buckets.find(x => x.key === key);
    if (b) b.value += (t.pnl ?? 0);
  }
  return buckets;
}

function MonthlyChart({
  trades,
  totalRealized,
}: {
  trades:        { closedAt: string; pnl: number }[];
  totalRealized: number;
}) {
  const buckets = bucketTradesByMonth(trades, 7);
  const maxAbs  = Math.max(1, ...buckets.map(b => Math.abs(b.value)));
  const hasData = trades.length > 0;
  const trendUp = buckets.length >= 2
    && (buckets[buckets.length - 1]!.value > 0
      || buckets[buckets.length - 1]!.value > buckets[buckets.length - 2]!.value);

  return (
    <div style={{
      position: "relative", overflow: "hidden",
      background: `linear-gradient(160deg, ${CARD} 0%, #0F1F18 100%)`,
      border: `1px solid ${E}`, borderRadius: 14, padding: "16px 16px 14px",
      boxShadow: hasData ? `0 0 0 1px rgba(102,255,102,0.04) inset` : "none",
    }}>
      {/* Header row */}
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize:8, fontFamily:SANS, fontWeight:700,
            color:"rgba(255,255,255,0.55)", letterSpacing:"0.18em",
            textTransform:"uppercase" as const, marginBottom: 4 }}>
            Monthly AI Performance (Illustrative)
          </div>
          <div style={{ fontSize:9.5, fontFamily:SANS, color: DIM,
            letterSpacing: 0.3 }}>
            Realized P&amp;L · last 7 months
          </div>
        </div>
        <div style={{ textAlign:"right" as const }}>
          <div style={{
            fontSize: 16, fontFamily: MONO, fontWeight: 800,
            color: totalRealized >= 0 ? "rgba(0,210,100,0.95)" : "rgba(255,90,108,0.90)",
            letterSpacing: -0.3,
            textShadow: totalRealized > 0 ? "0 0 10px rgba(0,210,100,0.35)" : "none",
          }}>
            {totalRealized >= 0 ? "+" : "−"}${Math.abs(totalRealized).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4,
            marginTop: 3, padding: "1px 7px",
            background: trendUp ? "rgba(102,255,102,0.10)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${trendUp ? "rgba(102,255,102,0.30)" : "rgba(255,255,255,0.10)"}`,
            borderRadius: 4 }}>
            <span style={{ fontSize: 8.5, fontFamily: MONO, fontWeight: 700,
              color: trendUp ? C : GR, letterSpacing: "0.08em" }}>
              {trendUp ? "▲ TRENDING UP" : "FLAT"}
            </span>
          </div>
        </div>
      </div>

      {/* Bars */}
      <div style={{ display:"flex", alignItems:"flex-end", gap:7, height:82, marginBottom:8,
        position: "relative" }}>
        {/* Zero baseline */}
        <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 40,
          height: 1, background: "rgba(255,255,255,0.06)", pointerEvents: "none" }}/>
        {buckets.map((b, i) => {
          const up   = b.value >= 0;
          const h    = Math.max(b.value === 0 ? 2 : 4, (Math.abs(b.value) / maxAbs) * 38);
          const last = i === buckets.length - 1;
          const col  = up ? "rgba(102,255,102,0.85)" : "rgba(255,90,108,0.82)";
          return (
            <div key={b.key} style={{ flex:1, display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent: up ? "flex-end" : "flex-start",
              height:"100%", position: "relative",
              paddingTop: up ? 0 : 42, paddingBottom: up ? 42 : 0 }}>
              <div style={{
                width: "70%", height: h, minHeight: 2,
                borderRadius: up ? "3px 3px 0 0" : "0 0 3px 3px",
                background: col,
                opacity: last ? 1 : 0.55,
                boxShadow: last && hasData ? `0 0 12px ${col}` : "none",
                transition: "height 0.4s ease",
              }}/>
            </div>
          );
        })}
      </div>

      {/* Month labels */}
      <div style={{ display:"flex", gap:7 }}>
        {buckets.map((b, i) => {
          const last = i === buckets.length - 1;
          return (
            <div key={`l-${b.key}`} style={{ flex:1, textAlign:"center" as const,
              fontSize:8, fontFamily: SANS, fontWeight: last ? 700 : 500,
              color: last ? "rgba(232,245,236,0.85)" : "rgba(138,156,148,0.70)",
              letterSpacing: 0.6 }}>{b.label}</div>
          );
        })}
      </div>

      {/* Empty state overlay */}
      {!hasData && (
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.85) 100%)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          padding: "0 16px 14px", pointerEvents: "none",
        }}>
          <div style={{ textAlign: "center" as const }}>
            <div style={{ fontSize: 10.5, fontFamily: SANS, fontWeight: 700, color: C,
              letterSpacing: 0.6, textTransform: "uppercase" as const, marginBottom: 3 }}>
              Performance unlocks
            </div>
            <div style={{ fontSize: 10, fontFamily: SANS, color: GR, lineHeight: 1.45 }}>
              Your AI performance chart will populate after your first closed trade.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tier status card ──────────────────────────────────────────────────────────
// Displays the user's active membership tier with live concurrent trade usage.
// FREE tier shows an upgrade CTA. Paid tiers show "ACTIVE · X/Y AI Trades".
function TierStatusCard({
  plan,
  isActive,
  concurrentLimit,
  currentRunning,
  onUpgrade,
}: {
  plan:            string;
  isActive:        boolean;
  concurrentLimit: number;
  currentRunning:  number;
  onUpgrade:       () => void;
}) {
  const v = plan === "pro"
    ? { name: "AICandlez Pro", accent: G,    glow: "rgba(124,255,0,0.32)", border: "rgba(124,255,0,0.40)", elite: true  }
    : plan === "starter"
      ? { name: "AICandlez Starter",   accent: C,    glow: "rgba(102,255,102,0.28)", border: "rgba(102,255,102,0.35)", elite: false }
      : { name: "Paper Trading (Free)", accent: "rgba(232,245,236,0.85)", glow: "rgba(255,255,255,0.05)",  border: "rgba(255,255,255,0.14)", elite: false };

  const isPaid = plan !== "free";
  const usagePct = concurrentLimit > 0
    ? Math.min(100, (currentRunning / concurrentLimit) * 100)
    : 0;

  return (
    <div style={{
      position: "relative", overflow: "hidden",
      background: v.elite
        ? `linear-gradient(160deg, #0F1F18 0%, ${CARD} 100%)`
        : CARD,
      border: `1px solid ${v.border}`,
      borderRadius: 14, padding: "14px 16px",
      boxShadow: isPaid ? `0 14px 30px ${v.glow}` : "none",
      marginBottom: 14,
    }}>
      {v.elite && (
        <div aria-hidden style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent 0%, ${G} 50%, transparent 100%)`,
          opacity: 0.7,
        }}/>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 8.5, fontFamily: SANS, fontWeight: 700,
            color: GR, letterSpacing: "0.16em",
            textTransform: "uppercase" as const, marginBottom: 3 }}>
            Membership
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontFamily: SANS, fontWeight: 800,
              color: W, letterSpacing: -0.3 }}>{v.name}</span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "2px 8px",
              background: isPaid && isActive ? "rgba(102,255,102,0.12)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${isPaid && isActive ? "rgba(102,255,102,0.40)" : "rgba(255,255,255,0.14)"}`,
              borderRadius: 4, fontSize: 8, fontFamily: SANS, fontWeight: 700,
              color: isPaid && isActive ? C : GR,
              letterSpacing: "0.10em", textTransform: "uppercase" as const,
            }}>
              {isPaid && isActive && (
                <span style={{ width: 4, height: 4, borderRadius: "50%",
                  background: C, boxShadow: `0 0 6px ${C}`,
                  animation: "dot-pulse 1.4s ease-in-out infinite" }}/>
              )}
              {isPaid && isActive ? "Active" : "Free"}
            </span>
          </div>
        </div>
        {plan !== "pro" && (
          <button
            onClick={onUpgrade}
            style={{
              flexShrink: 0, padding: "8px 14px", borderRadius: 999, cursor: "pointer",
              background: plan === "free"
                ? `linear-gradient(135deg, rgba(102,255,102,0.18) 0%, rgba(124,255,0,0.18) 100%)`
                : `linear-gradient(135deg, rgba(124,255,0,0.20) 0%, rgba(124,255,0,0.10) 100%)`,
              border: `1px solid ${plan === "free" ? "rgba(102,255,102,0.45)" : "rgba(124,255,0,0.50)"}`,
              color: plan === "free" ? C : G,
              fontFamily: SANS, fontSize: 11, fontWeight: 700,
              letterSpacing: 0.5, textTransform: "uppercase" as const,
              boxShadow: `0 6px 18px ${v.glow}`,
            }}>
            {plan === "free" ? "Upgrade" : "Upgrade to Pro"}
          </button>
        )}
      </div>

      {/* Concurrent AI trade usage — only meaningful for paid tiers */}
      {isPaid && concurrentLimit > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontFamily: SANS, fontWeight: 600,
              color: GR, letterSpacing: 0.4 }}>
              AI Trades Running
            </span>
            <span style={{ fontSize: 14, fontFamily: MONO, fontWeight: 800,
              color: v.accent, letterSpacing: -0.2 }}>
              {currentRunning}<span style={{ color: DIM, fontWeight: 600 }}> / {concurrentLimit}</span>
            </span>
          </div>
          <div style={{ position: "relative", height: 6, borderRadius: 999,
            background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0, width: `${usagePct}%`,
              background: `linear-gradient(90deg, ${v.accent} 0%, ${G} 100%)`,
              borderRadius: 999,
              boxShadow: `0 0 10px ${v.glow}`,
              transition: "width 0.6s ease",
            }}/>
          </div>
        </div>
      )}

      {!isPaid && (
        <div style={{ fontSize: 10.5, fontFamily: SANS, color: GR, lineHeight: 1.5 }}>
          Live AI execution and AI Auto Trade are <span style={{ color: W, fontWeight: 600 }}>locked</span>.
          Upgrade to enable concurrent AI execution on your account.
        </div>
      )}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────────
function StatCard({ value, label, color, sub }: { value:string; label:string; color:string; sub?:string }) {
  return (
    <div style={{ background:CARD, border:`1px solid ${E}`, borderRadius:12, padding:"16px 14px" }}>
      <div style={{ fontSize:23, fontFamily:MONO, fontWeight:700, color, marginBottom:sub?3:5, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:9, fontFamily:SANS, color:"rgba(136,146,164,0.85)", marginBottom:3 }}>{sub}</div>}
      <div style={{ fontSize:8, fontFamily:SANS, fontWeight:600, color:"rgba(136,146,164,0.80)",
        letterSpacing:"0.12em", textTransform:"uppercase" as const }}>{label}</div>
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────────
function SectionHead({ label, accent="rgba(255,255,255,0.30)" }: { label:string; accent?:string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
      <div style={{ width:2, height:14, background:accent, borderRadius:2, flexShrink:0 }}/>
      <span style={{ fontSize:9, fontFamily:SANS, fontWeight:600, color:"rgba(255,255,255,0.55)",
        letterSpacing:"0.18em", textTransform:"uppercase" as const }}>{label}</span>
    </div>
  );
}

// ── Editable text field ───────────────────────────────────────────────────────────
function EditField({ label, value, onChange, placeholder, type="text" }: {
  label:string; value:string; onChange:(v:string)=>void; placeholder?:string; type?:string;
}) {
  return (
    <div style={{ marginBottom:13 }}>
      <div style={{ fontSize:8, fontFamily:SANS, fontWeight:600, color:GR,
        letterSpacing:"0.12em", textTransform:"uppercase" as const, marginBottom:6 }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.11)",
          borderRadius:10, padding:"11px 14px", color:W, fontFamily:SANS, fontSize:13,
          outline:"none", boxSizing:"border-box" as const,
          transition:"border-color 0.15s ease",
        }}
        onFocus={e => e.target.style.borderColor = "rgba(102,255,102,0.40)"}
        onBlur={e  => e.target.style.borderColor = "rgba(255,255,255,0.11)"}
      />
    </div>
  );
}

// ── AI toggle (institutional) ─────────────────────────────────────────────────────
function AIToggle({ label, sub, value, onChange, divider=true }: {
  label:string; sub?:string; value:boolean; onChange:(v:boolean)=>void; divider?:boolean;
}) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"13px 0",
      borderBottom:divider?"1px solid rgba(255,255,255,0.05)":"none" }}>
      <div style={{ flex:1, paddingRight:16 }}>
        <div style={{ fontSize:13, fontFamily:SANS, fontWeight:500, color:W }}>{label}</div>
        {sub && <div style={{ fontSize:9, fontFamily:SANS, color:GR, marginTop:2 }}>{sub}</div>}
      </div>
      <button onClick={() => onChange(!value)} style={{
        flexShrink:0, cursor:"pointer",
        position:"relative", width:46, height:26, borderRadius:13,
        background:value?"rgba(102,255,102,0.15)":"rgba(255,255,255,0.05)",
        border:`1px solid ${value?"rgba(102,255,102,0.40)":"rgba(255,255,255,0.10)"}`,
        boxShadow:value?"0 0 14px rgba(102,255,102,0.22)":"none",
        transition:"all 0.25s ease",
      }}>
        <div style={{
          position:"absolute", top:3,
          left:value?"calc(100% - 22px)":"3px",
          width:18, height:18, borderRadius:"50%",
          background:value?C:"rgba(255,255,255,0.35)",
          boxShadow:value?"0 0 8px rgba(102,255,102,0.60)":"none",
          transition:"left 0.25s ease, background 0.25s ease, box-shadow 0.25s ease",
        }}/>
      </button>
    </div>
  );
}

// ── Stepper row ───────────────────────────────────────────────────────────────────
function StepperRow({ label, sub, value, min, max, onChange }: {
  label:string; sub?:string; value:number; min:number; max:number; onChange:(v:number)=>void;
}) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"13px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ flex:1, paddingRight:16 }}>
        <div style={{ fontSize:13, fontFamily:SANS, fontWeight:500, color:W }}>{label}</div>
        {sub && <div style={{ fontSize:9, fontFamily:SANS, color:GR, marginTop:2 }}>{sub}</div>}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <button onClick={() => onChange(Math.max(min, value-1))} style={{
          width:28, height:28, borderRadius:7, background:"rgba(255,255,255,0.04)",
          border:"1px solid rgba(255,255,255,0.10)", color:W, fontFamily:MONO, fontSize:14,
          cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
        }}>−</button>
        <span style={{ fontSize:16, fontFamily:MONO, fontWeight:700, color:C,
          minWidth:22, textAlign:"center" as const }}>{value}</span>
        <button onClick={() => onChange(Math.min(max, value+1))} style={{
          width:28, height:28, borderRadius:7, background:"rgba(255,255,255,0.04)",
          border:"1px solid rgba(255,255,255,0.10)", color:W, fontFamily:MONO, fontSize:14,
          cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
        }}>+</button>
      </div>
    </div>
  );
}

// ── Risk selector ─────────────────────────────────────────────────────────────────
type RiskLevel = UserProfile["riskLevel"];
function RiskSelector({ value, onChange }: { value:RiskLevel; onChange:(v:RiskLevel)=>void }) {
  const opts: { key:RiskLevel; label:string; color:string }[] = [
    { key:"low",        label:"LOW",  color:"rgba(0,255,136,0.85)" },
    { key:"balanced",   label:"BAL",  color:"rgba(102,255,102,0.85)" },
    { key:"aggressive", label:"HIGH", color:"rgba(255,148,0,0.85)" },
  ];
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"13px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ flex:1, paddingRight:16 }}>
        <div style={{ fontSize:13, fontFamily:SANS, fontWeight:500, color:W }}>Risk Level</div>
        <div style={{ fontSize:9, fontFamily:SANS, color:GR, marginTop:2 }}>Position sizing and stop-loss thresholds</div>
      </div>
      <div style={{ display:"flex", gap:5, flexShrink:0 }}>
        {opts.map(o => (
          <button key={o.key} onClick={() => onChange(o.key)} style={{
            padding:"5px 9px",
            background:value===o.key?`${o.color.replace("0.85","0.12")}`:"rgba(255,255,255,0.03)",
            border:`1px solid ${value===o.key?o.color.replace("0.85","0.40"):"rgba(255,255,255,0.08)"}`,
            borderRadius:6, fontSize:8, fontFamily:SANS, fontWeight:700,
            color:value===o.key?o.color:GR, cursor:"pointer",
            letterSpacing:"0.06em", transition:"all 0.15s ease",
          }}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

// ── AI Status card ────────────────────────────────────────────────────────────────
function AIStatusCard({ enabled, positions, maxPositions }: {
  enabled:boolean; positions:number; maxPositions:number;
}) {
  return (
    <div style={{
      position:"relative", overflow:"hidden",
      background:enabled
        ?"linear-gradient(160deg,#06140C 0%,#030C06 100%)"
        :"linear-gradient(160deg,#0A1410 0%,#050A07 100%)",
      border:`1px solid ${enabled?"rgba(102,255,102,0.30)":"rgba(255,255,255,0.08)"}`,
      borderRadius:18, padding:"18px 16px",
      boxShadow:enabled
        ?"0 0 50px rgba(102,255,102,0.10),0 12px 40px rgba(0,0,0,0.95)"
        :"0 8px 32px rgba(0,0,0,0.90)",
      transition:"all 0.40s ease", marginBottom:18,
    }}>
      <div aria-hidden style={{
        position:"absolute", top:0, left:0, right:0, height:2,
        background:enabled
          ?"linear-gradient(90deg,transparent 5%,rgba(102,255,102,0.70) 35%,rgba(124,255,0,0.60) 65%,transparent 95%)"
          :"linear-gradient(90deg,transparent 5%,rgba(124,255,0,0.35) 45%,transparent 95%)",
      }}/>
      {enabled && (
        <div aria-hidden style={{
          position:"absolute", top:-60, right:-40, width:220, height:220, borderRadius:"50%",
          background:"radial-gradient(circle,rgba(102,255,102,0.07) 0%,transparent 65%)",
          pointerEvents:"none",
        }}/>
      )}
      <div style={{ position:"relative" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <div style={{
                width:8, height:8, borderRadius:"50%",
                background:enabled?C:GR,
                boxShadow:enabled?`0 0 12px ${C}80`:"none",
                animation:enabled?"dot-pulse 1.2s ease-in-out infinite":"none",
                transition:"all 0.30s ease",
              }}/>
              <span style={{ fontSize:7, fontFamily:SANS, fontWeight:700,
                color:enabled?"rgba(102,255,102,0.65)":GR,
                letterSpacing:"0.22em", textTransform:"uppercase" as const }}>
                {enabled?"AI Portfolio Manager Online":"AI Autopilot Standby"}
              </span>
            </div>
            <div style={{ fontSize:17, fontFamily:SANS, fontWeight:800, color:W, letterSpacing:"-0.02em" }}>
              {enabled?"Autonomous Mode Active":"Auto Trade Disabled"}
            </div>
          </div>
          <div style={{
            padding:"5px 12px", borderRadius:20,
            background:enabled?"rgba(102,255,102,0.08)":"rgba(255,255,255,0.04)",
            border:`1px solid ${enabled?"rgba(102,255,102,0.25)":"rgba(255,255,255,0.10)"}`,
            fontSize:8, fontFamily:SANS, fontWeight:700,
            color:enabled?C:GR, letterSpacing:"0.08em",
          }}>{enabled?"ACTIVE":"OFF"}</div>
        </div>
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"10px 14px",
          background:enabled?"rgba(102,255,102,0.06)":"rgba(255,255,255,0.03)",
          border:`1px solid ${enabled?"rgba(102,255,102,0.14)":"rgba(255,255,255,0.06)"}`,
          borderRadius:10, marginBottom:12, transition:"all 0.30s ease",
        }}>
          <div>
            <div style={{ fontSize:7, fontFamily:SANS, color:DIM,
              letterSpacing:"0.12em", textTransform:"uppercase" as const, marginBottom:3 }}>AI Positions</div>
            <div style={{ fontSize:24, fontFamily:MONO, fontWeight:800,
              color:enabled?C:"rgba(255,255,255,0.40)", letterSpacing:"-0.02em",
              transition:"color 0.30s ease" }}>{positions}/{maxPositions}</div>
          </div>
          <div style={{ textAlign:"right" as const }}>
            <div style={{ fontSize:7, fontFamily:SANS, color:DIM,
              letterSpacing:"0.12em", textTransform:"uppercase" as const, marginBottom:3 }}>Status</div>
            <div style={{ fontSize:10, fontFamily:SANS, fontWeight:600,
              color:enabled?"rgba(0,255,136,0.85)":GR }}>
              {enabled?"Risk Engine Active":"Monitoring Paused"}
            </div>
            <div style={{ fontSize:9, fontFamily:SANS, color:DIM, marginTop:2 }}>
              {enabled?"124 assets monitored":"Enable on Markets tab"}
            </div>
          </div>
        </div>
        {enabled ? (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            {[
              { label:"Assets Scanned", val:"124", color:C },
              { label:"MTF Confirmed",  val:"3",   color:G },
              { label:"Entry Threshold",val:"65%", color:"rgba(124,255,0,0.90)" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background:"rgba(255,255,255,0.03)",
                border:"1px solid rgba(255,255,255,0.06)", borderRadius:9, padding:"9px 8px",
                textAlign:"center" as const }}>
                <div style={{ fontSize:16, fontFamily:MONO, fontWeight:800, color }}>{val}</div>
                <div style={{ fontSize:7, fontFamily:SANS, color:GR, letterSpacing:"0.06em", marginTop:3 }}>{label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize:9, fontFamily:SANS, color:GR, lineHeight:1.6,
            padding:"8px 12px", background:"rgba(255,255,255,0.02)",
            border:"1px solid rgba(255,255,255,0.05)", borderRadius:8 }}>
            Toggle "Let AI Trade For Me" on the Crypto or Equities tab to activate autonomous trading.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Branded exchange row ──────────────────────────────────────────────────────────
function ExchangeRow({ name, status, statusCol, icon, iconBg, iconBorder, iconColor }: {
  name:string; status:string; statusCol:string;
  icon:string; iconBg:string; iconBorder:string; iconColor:string;
}) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"14px 16px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <div style={{
          width:38, height:38, borderRadius:10, flexShrink:0,
          background:iconBg, border:`1px solid ${iconBorder}`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:16, fontFamily:MONO, fontWeight:800, color:iconColor,
          boxShadow:`0 0 14px ${iconColor}30`,
        }}>{icon}</div>
        <span style={{ fontSize:17, fontFamily:SANS, fontWeight:800, color:"#FFFFFF",
          letterSpacing:-0.25, textShadow:`0 0 12px ${iconColor}40` }}>{name}</span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background:statusCol,
          boxShadow:`0 0 12px ${statusCol}, 0 0 22px ${statusCol}90`,
          animation:"dot-pulse 2.5s ease-in-out infinite" }}/>
        <span style={{ fontSize:12, fontFamily:SANS, fontWeight:800, color:statusCol,
          letterSpacing:"0.16em", textShadow:`0 0 10px ${statusCol}80` }}>{status}</span>
      </div>
    </div>
  );
}

// ── Exchange connection health (live polling of /user/exchanges/balances) ─────
// Lists every user-connected exchange with a green/amber/red health pill,
// surfaces the raw error string for any failing connection, and exposes a
// per-row "Test connection" affordance that re-polls the same endpoint Home
// and Portal already consume. Driven by react-query — invalidating the
// `user-exchanges-balances` key here refreshes every consumer in lockstep.

interface ExchangeListEntry {
  exchange:  string;
  connected: boolean;
  connection: { id: string; exchange: string; label: string | null; tradingMode: string; lastVerifiedAt?: string | null; lastError?: string | null } | null;
  meta:      { id: string; name: string; logo?: string; color?: string } | null;
}
interface BalanceConn {
  exchange:       string;
  label:          string | null;
  tradingMode:    string;
  ok:             boolean;
  totalEquityUSD: number;
  error?:         string;
}

function ExchangeConnectionsHealth() {
  const qc = useQueryClient();
  const { data: listData, isLoading: listLoading } = useQuery<{ exchanges: ExchangeListEntry[] }>({
    queryKey: ["user-exchanges"],
    queryFn:  () => api.get("/user/exchanges"),
    retry:    false,
    staleTime: 60_000,
  });
  const { data: balData, isFetching: balFetching, dataUpdatedAt } = useQuery<{
    connections: BalanceConn[]; totalEquityUSD: number; fetchedAt: number;
  }>({
    queryKey: ["user-exchanges-balances"],
    queryFn:  () => api.get("/user/exchanges/balances"),
    retry:    false,
    refetchInterval:      30_000,
    refetchOnWindowFocus: true,
    staleTime:            10_000,
  });

  const connected = useMemo(
    () => (listData?.exchanges ?? []).filter(e => e.connected && e.connection),
    [listData],
  );
  const balanceByExchange = useMemo(() => {
    const m: Record<string, BalanceConn> = {};
    for (const c of balData?.connections ?? []) m[c.exchange] = c;
    return m;
  }, [balData]);

  const handleTest = () => {
    void qc.invalidateQueries({ queryKey: ["user-exchanges-balances"] });
  };

  if (listLoading) {
    return (
      <div style={{ padding:"14px 16px", fontSize:11, fontFamily:SANS, color:DIM }}>
        Loading exchange connections…
      </div>
    );
  }
  if (connected.length === 0) {
    return (
      <div style={{ padding:"14px 16px", fontSize:11, fontFamily:SANS, color:DIM, lineHeight:1.6 }}>
        No exchanges connected yet. Connect one from Live Trading Account to enable real-money execution.
      </div>
    );
  }

  return (
    <>
      {connected.map((row, i) => {
        const bal = balanceByExchange[row.exchange];
        const meta = row.meta;
        const name = meta?.name ?? row.exchange;
        const iconCh = (meta?.logo ?? name).toString().charAt(0).toUpperCase();
        // Health resolution:
        //   GREEN  — balances endpoint returned ok:true for this row
        //   RED    — balances endpoint returned ok:false (auth fail / network / revoked key)
        //   AMBER  — balances response hasn't arrived yet for a freshly listed row,
        //            OR a stored lastError exists on the connection itself
        const hasBalance = bal !== undefined;
        const storedErr  = row.connection?.lastError ?? null;
        const healthy    = hasBalance && bal!.ok;
        const failing    = hasBalance && !bal!.ok;
        const pending    = !hasBalance && balFetching;
        const pillCol    = healthy ? "#66FF66" : failing ? "#FF5860" : storedErr ? "#FFB020" : pending ? "#FFB020" : "#8A9C94";
        const pillLabel  = healthy ? "HEALTHY" : failing ? "DEGRADED" : pending ? "CHECKING" : storedErr ? "ATTENTION" : "UNKNOWN";
        const errText    = bal?.error ?? storedErr ?? null;
        const verifiedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }) : null;
        const iconColor  = meta?.color ?? C;

        return (
          <div key={row.exchange} style={{
            padding:"14px 16px",
            borderBottom: i < connected.length-1 ? "1px solid rgba(255,255,255,0.05)" : "none",
            display:"flex", flexDirection:"column", gap:10,
          }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0 }}>
                <div style={{
                  width:38, height:38, borderRadius:10, flexShrink:0,
                  background:`${iconColor}1A`, border:`1px solid ${iconColor}55`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:16, fontFamily:MONO, fontWeight:800, color:iconColor,
                  boxShadow:`0 0 14px ${iconColor}30`,
                }}>{iconCh}</div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:15, fontFamily:SANS, fontWeight:800, color:"#FFFFFF",
                    letterSpacing:-0.25, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {name}
                  </div>
                  <div style={{ fontSize:9, fontFamily:SANS, color:GR, marginTop:2,
                    letterSpacing:"0.10em", textTransform:"uppercase" as const }}>
                    {(row.connection?.tradingMode ?? "paper")} ·
                    {" "}{verifiedAt ? `Checked ${verifiedAt}` : "Awaiting check"}
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0,
                padding:"5px 10px", borderRadius:999,
                background:`${pillCol}14`, border:`1px solid ${pillCol}55`,
              }}>
                <div style={{ width:7, height:7, borderRadius:"50%", background:pillCol,
                  boxShadow:`0 0 8px ${pillCol}, 0 0 16px ${pillCol}80`,
                  animation: pending ? "dot-pulse 1.4s ease-in-out infinite" : "dot-pulse 2.5s ease-in-out infinite" }}/>
                <span style={{ fontSize:9.5, fontFamily:SANS, fontWeight:800, color:pillCol,
                  letterSpacing:"0.16em" }}>{pillLabel}</span>
              </div>
            </div>

            {errText && (
              <div style={{
                padding:"8px 10px", borderRadius:8,
                background:"rgba(255,88,96,0.06)", border:"1px solid rgba(255,88,96,0.28)",
                fontSize:10.5, fontFamily:MONO, color:"#FFB8BC", lineHeight:1.45,
                wordBreak:"break-word",
              }}>
                {errText}
              </div>
            )}

            <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end" }}>
              <button
                type="button"
                onClick={handleTest}
                disabled={balFetching}
                style={{
                  padding:"6px 12px", borderRadius:8, cursor: balFetching ? "wait" : "pointer",
                  background:`${C}10`, border:`1px solid ${C}45`,
                  color:C, fontSize:10, fontFamily:SANS, fontWeight:700,
                  letterSpacing:"0.12em", textTransform:"uppercase" as const,
                  opacity: balFetching ? 0.6 : 1,
                }}>
                {balFetching ? "Testing…" : "Test connection"}
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── Alpaca Reconnect Banner ─────────────────────────────────────────────────
// Surfaces an inline "Reconnect Alpaca" CTA whenever the per-user Alpaca
// connection row is marked status="error" with an OAuth-refresh-failure
// `lastError` by the background AlpacaTokenRefresher. Reopens the same
// one-click OAuth popup used by OnboardingFlow. Clears automatically as
// soon as the next /api/user/exchanges poll reports status back to "active".
const API_BASE_RECONNECT = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? ""
).replace(/\/$/, "") + "/api";

interface ApiExchangesResp {
  exchanges: Array<{
    exchange:    string;
    connected:   boolean;
    connection?: { status?: string; lastError?: string | null } | null;
  }>;
}
interface ApiAlpacaOauthCfg { enabled: boolean; authorizeUrl?: string }

function AlpacaReconnectBanner() {
  const qc = useQueryClient();
  const { data: exData } = useQuery<ApiExchangesResp>({
    queryKey: ["profile-exchanges-health"],
    queryFn:  () => fetch(`${API_BASE_RECONNECT}/user/exchanges`, { credentials: "include" })
      .then(r => r.ok ? r.json() : { exchanges: [] }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
  const { data: oauthCfg } = useQuery<ApiAlpacaOauthCfg>({
    queryKey: ["profile-alpaca-oauth-config"],
    queryFn:  () => fetch(`${API_BASE_RECONNECT}/user/exchanges/alpaca/oauth/config`, { credentials: "include" })
      .then(r => r.ok ? r.json() : { enabled: false }),
    staleTime: 60_000,
  });
  const [popupErr, setPopupErr] = useState<string | null>(null);

  const row = (exData?.exchanges ?? []).find(e => e.exchange === "Alpaca" && e.connected);
  const status    = row?.connection?.status ?? null;
  const lastError = row?.connection?.lastError ?? null;
  const isOauthError =
    status === "error" &&
    !!lastError &&
    (lastError.toLowerCase().includes("oauth")
      || lastError.toLowerCase().includes("refresh")
      || lastError.toLowerCase().includes("token"));

  if (!isOauthError) return null;

  const oauthEnabled = oauthCfg?.enabled === true && !!oauthCfg?.authorizeUrl;

  const onReconnect = () => {
    setPopupErr(null);
    if (!oauthEnabled || !oauthCfg?.authorizeUrl) {
      // Fall back to the onboarding flow so the user can re-enter Alpaca keys
      // manually when the in-app OAuth handshake isn't available.
      window.dispatchEvent(new Event("aicandlez:open-onboarding"));
      return;
    }
    const popup = window.open(
      oauthCfg.authorizeUrl,
      "aicandlez-alpaca-oauth",
      "width=520,height=720,menubar=no,toolbar=no",
    );
    if (!popup) {
      setPopupErr("Popup blocked — please allow popups for AICandlez and try again.");
      return;
    }
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { source?: string; ok?: boolean; error?: string } | null;
      if (!data || data.source !== "aicandlez:alpaca-oauth") return;
      window.removeEventListener("message", onMessage);
      if (data.ok) {
        qc.invalidateQueries({ queryKey: ["profile-exchanges-health"] });
        qc.invalidateQueries({ queryKey: ["onboarding-exchanges"] });
        qc.invalidateQueries({ queryKey: ["user-exchanges"] });
        qc.invalidateQueries({ queryKey: ["exchange-connections"] });
      } else {
        setPopupErr(data.error ?? "Alpaca did not authorize the connection.");
      }
    };
    window.addEventListener("message", onMessage);
  };

  return (
    <div style={{
      marginBottom: 10, padding: "12px 14px", borderRadius: 12,
      background: "rgba(255,176,32,0.08)",
      border: "1px solid rgba(255,176,32,0.45)",
      boxShadow: "0 0 16px rgba(255,176,32,0.16) inset",
    }}>
      <div style={{
        fontFamily: MONO, fontSize: 9.5, fontWeight: 800,
        letterSpacing: "0.18em", color: "#FFB020", marginBottom: 6,
      }}>
        ⚠ ALPACA NEEDS TO BE RECONNECTED
      </div>
      <div style={{ fontSize: 12, fontFamily: SANS, color: W, lineHeight: 1.5, marginBottom: 8 }}>
        Your Alpaca authorization expired or was revoked, so live AI trades can
        no longer reach your brokerage account.
      </div>
      <div style={{
        fontFamily: MONO, fontSize: 10, color: "rgba(255,176,32,0.80)",
        lineHeight: 1.5, marginBottom: 10, wordBreak: "break-word",
      }}>
        {lastError}
      </div>
      <button
        type="button"
        onClick={onReconnect}
        style={{
          display: "inline-block", padding: "9px 14px", borderRadius: 8,
          background: "linear-gradient(135deg,#00C853 0%,#66FF66 55%,#7CFF00 100%)",
          border: "1px solid #66FF66", color: "#001b06",
          fontFamily: MONO, fontSize: 10.5, fontWeight: 800,
          letterSpacing: "0.16em", textTransform: "uppercase" as const,
          cursor: "pointer",
          boxShadow: "0 6px 18px rgba(102,255,102,0.30)",
        }}
      >
        {oauthEnabled ? "Reconnect Alpaca →" : "Re-enter Alpaca Keys →"}
      </button>
      {popupErr && (
        <div style={{
          marginTop: 8, fontSize: 11, fontFamily: SANS,
          color: "rgba(255,120,140,0.95)", lineHeight: 1.45,
        }}>
          {popupErr}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────────
// ── Alert & Feedback Preferences (notification scaffolding) ─────────────────
// Surfaces every alert key from `lib/feedback` as a toggle row. Master switches
// for Sounds / Haptics / Push live in the same card. Push backend is not wired
// here — these prefs are read by future push-registration code.
// Server-backed outage prefs — mute exchange outage email or push from the server.
// Defaults to ON for both channels (matches pre-pref behaviour). DB column lives
// on `user_settings.exchange_outage_{email,push}_enabled` and the API
// surface is `GET/PUT /user/settings`.
interface UserSettingsRow {
  exchangeOutageEmailEnabled: boolean;
  exchangeOutagePushEnabled:  boolean;
}
function useExchangeOutagePrefs() {
  const qc = useQueryClient();
  const { data } = useQuery<UserSettingsRow>({
    queryKey:  ["user-settings"],
    queryFn:   () => api.get<UserSettingsRow>("/user/settings"),
    staleTime: 60_000,
  });
  const emailEnabled = data?.exchangeOutageEmailEnabled ?? true;
  const pushEnabled  = data?.exchangeOutagePushEnabled  ?? true;
  const setPref = async (patch: Partial<UserSettingsRow>) => {
    qc.setQueryData<UserSettingsRow>(["user-settings"], prev =>
      prev ? { ...prev, ...patch } : { exchangeOutageEmailEnabled: true, exchangeOutagePushEnabled: true, ...patch });
    try { await api.put("/user/settings", patch); }
    catch { qc.invalidateQueries({ queryKey: ["user-settings"] }); }
  };
  return { emailEnabled, pushEnabled, setPref };
}

function AlertPreferencesSection() {
  const { prefs, update, toggleAlert } = useFeedbackPrefs();
  const pushNotifs = usePushNotifications();
  const queryClient = useQueryClient();
  const outage     = useExchangeOutagePrefs();

  // ── Server-authoritative per-alert mute/unmute toggles ────────────────────
  // EVERY ALERT_DEFINITIONS key is mirrored into `user_settings.alertPrefs`
  // on the server, so a customer can mute any alert from anywhere — phone,
  // tablet, desktop — and the backend push dispatcher honors it before
  // sending. Local storage is kept in sync purely so the toggles feel
  // instant when offline. Server is the source of truth on load.
  const settingsQuery = useQuery<{
    alertPrefs?:            Partial<Record<AlertKey, boolean>>;
    notificationsLiveFills?: boolean;  // legacy column — superseded by alertPrefs.liveTradeFilled
  }>({
    queryKey: ["/user/settings"],
    queryFn:  () => api.get("/user/settings"),
  });

  // Seed local state from server once it loads. Server values take precedence
  // over any locally-cached toggles so mutes propagate across devices.
  const serverAlertPrefs = settingsQuery.data?.alertPrefs;
  const liveFillsLegacy  = settingsQuery.data?.notificationsLiveFills;
  useEffect(() => {
    if (!serverAlertPrefs && typeof liveFillsLegacy !== "boolean") return;
    const patch: Partial<Record<AlertKey, boolean>> = {};
    if (serverAlertPrefs) {
      for (const [k, v] of Object.entries(serverAlertPrefs)) {
        if (typeof v === "boolean") patch[k as AlertKey] = v;
      }
    }
    // Honor the legacy column for users who never re-saved after the
    // alertPrefs rollout — only used when alertPrefs has no liveTradeFilled.
    if (typeof liveFillsLegacy === "boolean"
        && typeof patch.liveTradeFilled !== "boolean") {
      patch.liveTradeFilled = liveFillsLegacy;
    }
    if (Object.keys(patch).length === 0) return;
    // Only update if there's an actual divergence — avoids render loops.
    const diverges = Object.entries(patch).some(
      ([k, v]) => prefs.alerts[k as AlertKey] !== v,
    );
    if (diverges) update({ alerts: { ...prefs.alerts, ...patch } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverAlertPrefs, liveFillsLegacy]);

  // PUT a single-key patch to the server. The route merges with the existing
  // alertPrefs blob, so toggling one key never wipes the others.
  const alertPrefMutation = useMutation({
    mutationFn: (patch: { key: AlertKey; value: boolean }) => {
      const body: Record<string, unknown> = {
        alertPrefs: { [patch.key]: patch.value },
      };
      // Keep the legacy boolean column in sync for any downstream caller
      // still reading it (defense-in-depth during the alertPrefs rollout).
      if (patch.key === "liveTradeFilled") body.notificationsLiveFills = patch.value;
      return api.put("/user/settings", body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/user/settings"] });
    },
  });

  const onToggleAlert = (key: AlertKey) => {
    const next = !prefs.alerts[key];
    toggleAlert(key);
    alertPrefMutation.mutate({ key, value: next });
  };

  const onTogglePush = () => {
    const next = !prefs.pushEnabled;
    update({ pushEnabled: next });
    if (pushNotifs.supported && pushNotifs.permission !== "denied") {
      if (next) void pushNotifs.subscribe();
      else      void pushNotifs.unsubscribe();
    }
  };

  return (
    <div style={{ marginBottom:18 }}>
      <SectionHead label="Alert Preferences" accent="rgba(124,255,0,0.65)"/>
      <div style={{ background:CARD, border:`1px solid ${E}`, borderRadius:16, overflow:"hidden" }}>

        {/* Master switches */}
        <PrefRow
          label="Push Notifications"
          sub={
            !pushNotifs.supported ? "Not supported in this browser · In-app alerts only" :
            pushNotifs.permission === "denied" ? "Blocked by browser — adjust site settings" :
            prefs.pushEnabled ? "Enabled · Background trade + signal alerts" :
            "Disabled · Tap to enable background alerts"
          }
          value={prefs.pushEnabled}
          onChange={onTogglePush}
          accent="rgba(124,255,0,0.65)"
        />
        <PrefRow
          label="Sounds"
          sub="Premium institutional cues on execution, profit, and signals"
          value={prefs.soundsEnabled}
          onChange={() => update({ soundsEnabled: !prefs.soundsEnabled })}
          accent="rgba(102,255,102,0.55)"
        />
        <PrefRow
          label="Haptics"
          sub="Subtle vibration on mobile devices · OFF by default"
          value={prefs.hapticsEnabled}
          onChange={() => update({ hapticsEnabled: !prefs.hapticsEnabled })}
          accent="rgba(102,255,102,0.55)"
        />

        <div style={{ padding:"10px 16px 6px", borderTop:"1px solid rgba(255,255,255,0.05)",
          background:"rgba(255,255,255,0.015)" }}>
          <div style={{ fontSize:8.5, fontFamily:SANS, fontWeight:700,
            color:"rgba(232,245,236,0.55)", letterSpacing:"0.14em",
            textTransform:"uppercase" as const }}>
            Alert Types
          </div>
        </div>

        {ALERT_DEFINITIONS.map((d, i) => (
          <PrefRow
            key={d.key}
            label={d.label}
            sub={d.sub}
            value={prefs.alerts[d.key as AlertKey]}
            onChange={() => onToggleAlert(d.key as AlertKey)}
            accent="rgba(102,255,102,0.55)"
            divider={i < ALERT_DEFINITIONS.length - 1}
            disabled={!prefs.pushEnabled && !prefs.soundsEnabled}
          />
        ))}

        <div style={{ padding:"10px 16px 6px", borderTop:"1px solid rgba(255,255,255,0.05)",
          background:"rgba(255,255,255,0.015)" }}>
          <div style={{ fontSize:8.5, fontFamily:SANS, fontWeight:700,
            color:"rgba(232,245,236,0.55)", letterSpacing:"0.14em",
            textTransform:"uppercase" as const }}>
            Exchange Outage Notifications
          </div>
        </div>
        <PrefRow
          label="Outage Emails"
          sub="Email me when an exchange connection goes down or recovers"
          value={outage.emailEnabled}
          onChange={() => void outage.setPref({ exchangeOutageEmailEnabled: !outage.emailEnabled })}
          accent="rgba(102,255,102,0.55)"
        />
        <PrefRow
          label="Outage Push"
          sub="Push notification when an exchange connection goes down or recovers"
          value={outage.pushEnabled}
          onChange={() => void outage.setPref({ exchangeOutagePushEnabled: !outage.pushEnabled })}
          accent="rgba(102,255,102,0.55)"
          divider={false}
        />
      </div>
      <div style={{ marginTop:8, padding:"9px 14px",
        background:"rgba(124,255,0,0.04)", border:"1px solid rgba(124,255,0,0.10)",
        borderRadius:8, fontSize:8.5, fontFamily:SANS, color:"rgba(124,255,0,0.60)", lineHeight:1.55 }}>
        ⚑ Alert preferences persist locally · Background delivery requires Push Notifications enabled.
      </div>
    </div>
  );
}

// Lightweight toggle row used by AlertPreferencesSection — matches AIToggle visuals
// but supports a `disabled` dimmed state for child rows when masters are off.
function PrefRow({ label, sub, value, onChange, accent, divider=true, disabled=false }: {
  label: string; sub: string; value: boolean; onChange: () => void;
  accent: string; divider?: boolean; disabled?: boolean;
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        width:"100%", padding:"14px 16px",
        background:"transparent", border:"none",
        borderBottom: divider ? "1px solid rgba(255,255,255,0.05)" : "none",
        display:"flex", justifyContent:"space-between", alignItems:"center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        textAlign:"left" as const,
      }}>
      <div style={{ minWidth:0, paddingRight:14 }}>
        <div style={{ fontSize:13, fontFamily:SANS, fontWeight:500, color:W }}>{label}</div>
        <div style={{ fontSize:9.5, fontFamily:SANS, color:GR, marginTop:2, lineHeight:1.45 }}>{sub}</div>
      </div>
      <div style={{
        width:38, height:22, borderRadius:11, flexShrink:0,
        background: value ? "rgba(102,255,102,0.18)" : "rgba(255,255,255,0.07)",
        border:`1px solid ${value ? accent : "rgba(255,255,255,0.12)"}`,
        transition:"all 0.2s", display:"flex", alignItems:"center", padding:"2px",
      }}>
        <div style={{
          width:16, height:16, borderRadius:"50%",
          background: value ? C : "rgba(255,255,255,0.30)",
          transform:`translateX(${value ? 16 : 0}px)`,
          transition:"transform 0.22s",
          boxShadow: value ? `0 0 10px ${accent}` : "none",
        }}/>
      </div>
    </button>
  );
}

export default function Profile() {
  const { signOut }        = useClerk();
  const [location, setLocation] = useLocation();
  const { openOnboarding } = useBrokerConnection();
  const qc                 = useQueryClient();

  // Auto-open the broker connection wizard when the user lands on
  // /settings/exchanges (the canonical exchange-onboarding path used by
  // cross-app links from the operator dashboard and upgrade flows).
  useEffect(() => {
    if (location === "/settings/exchanges") openOnboarding();
    // openOnboarding is a stable context callback; intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);
  const { enabled: aiEnabled, setEnabled: setAiEnabled } = useAIAutoTrade();
  const { profile, updateProfile } = useUserProfile();
  const pushNotifs = usePushNotifications();

  // Edit-mode state (draft)
  const [editing,      setEditing]      = useState(false);
  const [draftName,    setDraftName]    = useState("");
  const [draftUsername,setDraftUsername]= useState("");
  const [draftEmail,   setDraftEmail]   = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Connected exchanges (drives the Broker Connection card disconnect CTA) ─
  // Live-fetched so the Disconnect button only renders when there's actually
  // something to disconnect — matches the dashboard Settings flow.
  type ConnectedExchange = {
    exchange: string;
    connected: boolean;
    connection: { tradingMode: string; status: string; label: string | null } | null;
  };
  const { data: exchangesData } = useQuery<{ exchanges: ConnectedExchange[] }>({
    queryKey:  ["user-exchanges"],
    queryFn:   () => api.get("/user/exchanges"),
    staleTime: 30_000,
    retry:     false,
  });
  const alpacaConn = exchangesData?.exchanges?.find(e => e.exchange === "Alpaca" && e.connected) ?? null;

  // In-app confirm modal + toast state for the Alpaca disconnect flow.
  // Replaces native window.confirm/alert so the UX matches the institutional
  // tone of the rest of the PWA and surfaces the server's { revoked, revokeError }
  // payload distinctly (full revoke vs local-only delete).
  const [alpacaConfirmOpen, setAlpacaConfirmOpen] = useState(false);
  type AlpacaToast = {
    tone: "success" | "warn" | "error";
    title: string;
    detail: string;
  };
  const [alpacaToast, setAlpacaToast] = useState<AlpacaToast | null>(null);
  useEffect(() => {
    if (!alpacaToast) return;
    const t = window.setTimeout(() => setAlpacaToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [alpacaToast]);

  const disconnectAlpaca = useMutation({
    mutationFn: () => api.delete<{ ok: boolean; revoked?: boolean; revokeError?: string }>("/user/exchanges/Alpaca"),
    onSuccess: (data) => {
      // Match the connect-flow invalidation set so every surface that watches
      // exchange state refreshes in lockstep.
      qc.invalidateQueries({ queryKey: ["onboarding-exchanges"] });
      qc.invalidateQueries({ queryKey: ["user-exchanges"] });
      qc.invalidateQueries({ queryKey: ["exchange-connections"] });
      qc.invalidateQueries({ queryKey: ["user-exchanges-balances"] });
      setAlpacaConfirmOpen(false);
      if (data?.revoked) {
        setAlpacaToast({
          tone: "success",
          title: "Alpaca disconnected",
          detail: "OAuth grant revoked · encrypted credentials removed.",
        });
      } else {
        setAlpacaToast({
          tone: "warn",
          title: "Disconnected locally",
          detail: data?.revokeError
            ? `Revoke failed at Alpaca — re-check from your Alpaca account. (${data.revokeError})`
            : "Revoke failed at Alpaca — re-check from your Alpaca account.",
        });
      }
    },
    onError: (err) => {
      setAlpacaConfirmOpen(false);
      setAlpacaToast({
        tone: "error",
        title: "Disconnect failed",
        detail: (err as Error).message || "Please try again in a moment.",
      });
    },
  });

  const { data: portfolio } = useQuery<Portfolio>({
    queryKey:  ["mobile-portfolio"],
    queryFn:   () => api.get("/mobile/portfolio"),
    staleTime: 30_000,
  });
  const { data: sub } = useQuery<Subscription>({
    queryKey:  ["subscription"],
    queryFn:   () => api.get("/billing/subscription"),
    staleTime: 60_000,
  });

    const { data: simAcc } = useQuery<SimAccount>({
      queryKey:  ["sim-account"],
      queryFn:   () => api.get("/account"),
      staleTime: 30_000,
      retry:     false,
    });

    // Closed sim trades — drives the REAL monthly performance chart.
    const { data: simTradesData } = useQuery<{ trades: SimTrade[] }>({
      queryKey:  ["sim-trades"],
      queryFn:   () => api.get("/simulation/trades"),
      staleTime: 30_000,
      retry:     false,
    });
    const simTrades = simTradesData?.trades ?? [];

    const tv        = portfolio?.totalValue ?? simAcc?.balance ?? 100_000;
    const plan      = sub?.plan ?? "free";
    const isActive  = sub?.isActive ?? (plan === "free");

    const realized  = simAcc?.realizedPnL ?? 0;
    const fees      = +(realized * 0.03).toFixed(2);
    const netProfit = realized - fees;
    const winRate   = simAcc?.winRate ?? 0;

    // Per-tier concurrent AI trade capacity — single source of truth is the
    // backend PLAN_FEATURES table, surfaced through /billing/subscription.
    const concurrentLimit = sub?.limits?.concurrentTrades ?? 0;
    const currentRunning  = portfolio?.positions?.length ?? 0;

  function openEdit() {
    setDraftName(profile.name);
    setDraftUsername(profile.username);
    setDraftEmail(profile.email);
    setEditing(true);
  }
  function saveEdit() {
    updateProfile({
      name:     draftName.trim()     || profile.name,
      username: draftUsername.trim() || profile.username,
      email:    draftEmail.trim()    || profile.email,
    });
    setEditing(false);
  }
  function cancelEdit() { setEditing(false); }

  function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target?.result as string;
      if (url) updateProfile({ avatarUrl: url });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const ini = initials(profile.name);

  return (
    <div className="page-enter" style={{ background:BG, minHeight:"100%", paddingBottom:32 }}>

      {/* ── Branded page header ────────────────────────────────────────────── */}
      <PageHeader title="Profile" caption="ACCOUNT · AI · BROKER"/>

      {/* ── Identity card ──────────────────────────────────────────────────── */}
      <div style={{ margin:"16px 16px 14px", background:CARD, border:`1px solid ${E}`,
        borderRadius:16, padding:"20px 18px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom: editing ? 20 : 0 }}>
          {/* Avatar — click to upload */}
          <div style={{ position:"relative", flexShrink:0, cursor:"pointer" }}
               onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept="image/*"
              style={{ display:"none" }} onChange={handleAvatarFile}/>
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="avatar"
                style={{ width:60, height:60, borderRadius:"50%",
                  border:"1.5px solid rgba(102,255,102,0.35)", objectFit:"cover" as const }}/>
            ) : (
              <div style={{
                width:60, height:60, borderRadius:"50%",
                background:"linear-gradient(135deg,rgba(102,255,102,0.12),rgba(124,255,0,0.12))",
                border:"1.5px solid rgba(102,255,102,0.35)",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:19, fontFamily:MONO, fontWeight:700, color:C,
              }}>{ini}</div>
            )}
            {/* Camera badge */}
            <div style={{
              position:"absolute", bottom:0, right:0,
              width:20, height:20, borderRadius:"50%",
              background:"rgba(102,255,102,0.18)", border:"1.5px solid rgba(102,255,102,0.50)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:9,
            }}>📷</div>
            <div style={{ position:"absolute", bottom:20, right:-1,
              width:10, height:10, borderRadius:"50%",
              background:"rgba(0,210,100,0.90)", border:"2px solid #000",
              boxShadow:"0 0 8px rgba(0,210,100,0.60)" }}/>
          </div>

          {/* Name & badges */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
              <span style={{ fontSize:18, fontFamily:SANS, fontWeight:700, color:W,
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                {profile.name}
              </span>
              <span style={{
                padding:"2px 9px", flexShrink:0,
                background:plan==="free"?"rgba(255,255,255,0.05)":"rgba(102,255,102,0.08)",
                border:`1px solid ${plan==="free"?"rgba(255,255,255,0.14)":"rgba(102,255,102,0.22)"}`,
                borderRadius:4, fontSize:8, fontFamily:SANS, fontWeight:600,
                color:plan==="free"?"rgba(136,146,164,0.90)":C,
                letterSpacing:"0.07em", textTransform:"uppercase" as const,
              }}>{plan==="free"?"Trial":"Active"}</span>
            </div>
            <div style={{ fontSize:11, fontFamily:SANS, color:"rgba(136,146,164,0.90)",
              marginBottom:3, overflow:"hidden", textOverflow:"ellipsis",
              whiteSpace:"nowrap" as const }}>
              @{profile.username} · {profile.email}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              {aiEnabled && (
                <div style={{ display:"flex", alignItems:"center", gap:4,
                  padding:"2px 8px",
                  background:"rgba(102,255,102,0.07)", border:"1px solid rgba(102,255,102,0.20)",
                  borderRadius:4 }}>
                  <div style={{ width:4, height:4, borderRadius:"50%", background:C,
                    animation:"dot-pulse 1.2s ease-in-out infinite",
                    boxShadow:`0 0 6px ${C}80` }}/>
                  <span style={{ fontSize:7.5, fontFamily:SANS, fontWeight:700, color:C,
                    letterSpacing:"0.10em" }}>AI ACTIVE</span>
                </div>
              )}
              {!editing ? (
                <button onClick={openEdit} style={{
                  background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.11)",
                  borderRadius:5, padding:"2px 10px", cursor:"pointer",
                  fontSize:8, fontFamily:SANS, fontWeight:600, color:GR,
                  letterSpacing:"0.08em",
                }}>EDIT</button>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Inline edit form ─────────────────────────────────────────────── */}
        {editing && (
          <div>
            <div style={{ height:1, background:"rgba(255,255,255,0.06)", marginBottom:18 }}/>
            <EditField label="Full Name"  value={draftName}     onChange={setDraftName}     placeholder="Your full name"/>
            <EditField label="Username"   value={draftUsername} onChange={setDraftUsername} placeholder="username"/>
            <EditField label="Email"      value={draftEmail}    onChange={setDraftEmail}    placeholder="email@example.com" type="email"/>
            <div style={{ display:"flex", gap:10, marginTop:4 }}>
              <button onClick={saveEdit} style={{
                flex:1, padding:"12px 0",
                background:"rgba(102,255,102,0.12)", border:"1px solid rgba(102,255,102,0.35)",
                borderRadius:10, color:C, fontFamily:SANS, fontSize:13, fontWeight:700,
                letterSpacing:"0.04em", cursor:"pointer",
              }}>Save Changes</button>
              <button onClick={cancelEdit} style={{
                flex:1, padding:"12px 0",
                background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.10)",
                borderRadius:10, color:GR, fontFamily:SANS, fontSize:13, fontWeight:600,
                letterSpacing:"0.04em", cursor:"pointer",
              }}>Cancel</button>
            </div>
            <button onClick={() => alert("Password change is managed through your sign-in provider.")} style={{
              marginTop:10, width:"100%", padding:"11px 0",
              background:"transparent", border:"1px solid rgba(255,255,255,0.07)",
              borderRadius:10, color:DIM, fontFamily:SANS, fontSize:12, fontWeight:500,
              cursor:"pointer",
            }}>Change Password →</button>
          </div>
        )}
      </div>

      <div style={{ padding:"0 16px" }}>

        {/* ── Membership tier status (NEW — real plan + concurrent usage) ───── */}
        <SectionHead label="Membership" accent={C}/>
        <TierStatusCard
          plan={plan}
          isActive={isActive}
          concurrentLimit={concurrentLimit}
          currentRunning={currentRunning}
          onUpgrade={() => setLocation("/subscribe")}
        />

        {/* ── AI Status ────────────────────────────────────────────────────── */}
        <SectionHead label="AI Portfolio Manager" accent={C}/>
        <AIStatusCard
          enabled={aiEnabled}
          positions={currentRunning}
          maxPositions={concurrentLimit > 0 ? concurrentLimit : profile.maxTrades}
        />

        {/* ── Stats 2×2 ───────────────────────────────────────────────────── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:18 }}>
          <StatCard value={`$${(tv/1000).toFixed(1)}K`}        label="Portfolio Value"       color={C}  sub="simulation equity"/>
          <StatCard value={`+$${(realized/1000).toFixed(1)}K`} label="Realized P&L"          color="rgba(0,210,100,0.88)" sub="lifetime · simulated"/>
          <StatCard value={`${winRate}%`}                       label="Win Rate"              color="rgba(0,210,100,0.88)" sub="4W · 1L"/>
          <StatCard value={`$${fees.toFixed(2)}`}               label={`Performance Fees (${PERFORMANCE_FEE_LABEL})`} color={GOLD} sub="on closed profits only"/>
        </div>

        {/* ── Performance Intelligence ─────────────────────────────────────── */}
        <div style={{ marginBottom:18 }}>
          <SectionHead label="Performance Intelligence" accent="rgba(124,255,0,0.65)"/>
          <MonthlyChart trades={simTrades} totalRealized={realized}/>
          <div style={{ marginTop:10, background:CARD, border:`1px solid ${E}`,
            borderRadius:12, padding:"20px 8px",
            display:"grid", gridTemplateColumns:"1fr 1fr 1fr", alignItems:"start" }}>
            <Donut value={71} color="rgba(124,255,0,0.80)" label="AI Score"/>
            <Donut value={59} color="rgba(0,185,215,0.78)"  label="Consistency"/>
            <Donut value={57} color="rgba(0,200,100,0.76)"  label="Efficiency"/>
          </div>
          <div style={{ marginTop:10, background:CARD, border:`1px solid ${E}`,
            borderRadius:12, overflow:"hidden" }}>
            {[
              { label:"Best Performing Asset",   val:"NVDA · +18.4%",  color:"rgba(0,255,136,0.88)" },
              { label:"Avg Trade Duration",       val:"4h 22m",         color:"rgba(102,255,102,0.82)" },
              { label:"Total AI Trades Executed", val:"47",             color:W },
              { label:"Most Profitable Sector",   val:"Technology",     color:"rgba(124,255,0,0.85)" },
              { label:"Highest Confidence Trade",  val:"NVDA · 91%",    color:GOLD },
            ].map(({ label, val, color }, i, arr) => (
              <div key={label} style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", padding:"12px 16px",
                borderBottom:i<arr.length-1?"1px solid rgba(255,255,255,0.05)":"none" }}>
                <span style={{ fontSize:12, fontFamily:SANS, color:GR }}>{label}</span>
                <span style={{ fontSize:12, fontFamily:MONO, fontWeight:700, color }}>{val}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop:10, display:"flex", justifyContent:"space-between",
            alignItems:"center", padding:"14px 0", borderTop:"1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize:13, fontFamily:SANS, fontWeight:500, color:"rgba(255,255,255,0.88)" }}>
              Cumulative Return
            </span>
            <span style={{ fontSize:16, fontFamily:MONO, fontWeight:700, color:"rgba(0,210,100,0.88)" }}>
              +${netProfit.toFixed(2)}
            </span>
          </div>
        </div>

        {/* ── Simulation Performance ───────────────────────────────────────── */}
        <div style={{ marginBottom:18 }}>
          <SectionHead label="Simulation Performance" accent="rgba(255,200,0,0.65)"/>
          <div style={{ background:CARD, border:`1px solid ${E}`, borderRadius:16 }}>
            <div style={{ background:"rgba(255,148,0,0.07)", borderBottom:"1px solid rgba(255,148,0,0.15)",
              padding:"9px 16px", display:"flex", alignItems:"center", gap:8, borderRadius:"16px 16px 0 0" }}>
              <div style={{ width:5, height:5, borderRadius:"50%", background:"rgba(255,148,0,0.90)", flexShrink:0 }}/>
              <span style={{ fontSize:9, fontFamily:SANS, fontWeight:600,
                color:"rgba(255,148,0,0.85)", letterSpacing:"0.08em" }}>
                PAPER MODE — Simulated profits · Switch to Live to withdraw
              </span>
            </div>
            {[
              { label:"Capital Under AI Management", val:`$${tv.toLocaleString()}`,    color:C },
              { label:"Realized P&L (All-Time · Simulated)",     val:`+$${realized.toLocaleString()}`, color:"rgba(0,255,136,0.88)" },
              { label:`AI Performance Fees (${PERFORMANCE_FEE_LABEL})`,     val:`–$${fees.toFixed(2)}`,      color:GOLD },
              { label:"Net Profit After Fees",        val:`+$${netProfit.toFixed(2)}`, color:"rgba(0,255,136,0.88)" },
            ].map(({ label, val, color }, i, arr) => (
              <div key={label} style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", padding:"13px 16px",
                borderBottom:i<arr.length-1?"1px solid rgba(255,255,255,0.05)":"none" }}>
                <span style={{ fontSize:12, fontFamily:SANS, color:GR }}>{label}</span>
                <span style={{ fontSize:14, fontFamily:MONO, fontWeight:700, color }}>{val}</span>
              </div>
            ))}
            <div style={{ padding:"12px 16px", borderTop:"1px solid rgba(255,255,255,0.05)" }}>
              <button onClick={() => setLocation("/billing")} style={{
                width:"100%", padding:"12px 0",
                background:"rgba(102,255,102,0.07)", border:"1px solid rgba(102,255,102,0.22)",
                borderRadius:10, color:C, fontFamily:SANS, fontSize:12, fontWeight:600,
                letterSpacing:"0.04em", cursor:"pointer",
              }}>Enable Live Execution →</button>
            </div>
          </div>
        </div>

        {/* ── AI Settings ──────────────────────────────────────────────────── */}
        <div style={{ marginBottom:18 }}>
          <SectionHead label="AI Settings" accent="rgba(102,255,102,0.65)"/>
          <div style={{ background:CARD, border:`1px solid ${E}`, borderRadius:16, padding:"0 16px" }}>
            <AIToggle
              label="Autonomous Trading"
              sub="AI selects, enters and exits positions automatically"
              value={aiEnabled}
              onChange={setAiEnabled}
              divider={true}
            />
            <StepperRow
              label="Max Concurrent AI Trades"
              sub="AI will not open more than this many positions at once"
              value={profile.maxTrades} min={1} max={12}
              onChange={v => updateProfile({ maxTrades: v })}
            />
            <RiskSelector
              value={profile.riskLevel}
              onChange={v => updateProfile({ riskLevel: v })}
            />
            <AIToggle
              label="Stop Loss Protection"
              sub="AI enforces stop-loss on every position"
              value={profile.stopLoss}
              onChange={v => updateProfile({ stopLoss: v })}
            />
            <AIToggle
              label="AI Trade Notifications"
              sub="Push alerts on AI entries, exits and signals"
              value={profile.notifications}
              onChange={v => updateProfile({ notifications: v })}
            />
            <AIToggle
              label="Auto-Reinvest Profits"
              sub="Compound realized gains into new AI positions"
              value={profile.autoReinvest}
              onChange={v => updateProfile({ autoReinvest: v })}
            />
            <AIToggle
              label="Paper Trading Mode"
              sub="Simulate trades with virtual capital — no real money involved"
              value={profile.paperMode}
              onChange={v => updateProfile({ paperMode: v })}
              divider={false}
            />
          </div>
          <div style={{ marginTop:8, padding:"9px 14px",
            background:"rgba(102,255,102,0.04)", border:"1px solid rgba(102,255,102,0.10)",
            borderRadius:8, fontSize:8.5, fontFamily:SANS, color:"rgba(102,255,102,0.60)", lineHeight:1.55 }}>
            ⚡ All settings persist across sessions. Paper mode is never a restriction on AI scanning.
          </div>
        </div>

        {/* ── Alert & Feedback Preferences (notification scaffolding) ──────── */}
        <AlertPreferencesSection/>

        {/* ── Connected Accounts ───────────────────────────────────────────── */}
        {/* BROKER */}
        <div style={{ marginBottom:14 }}>
          <SectionHead label="Broker Connection" accent="rgba(0,255,136,0.55)"/>
          <AlpacaReconnectBanner/>
          <div style={{ background:CARD, border:`1px solid ${E}`, borderRadius:16, overflow:"hidden" }}>
            <ExchangeRow
              name={alpacaConn
                ? (alpacaConn.connection?.tradingMode === "live" ? "Alpaca (Live Account)" : "Alpaca (Paper Account)")
                : "Alpaca (Not Connected)"}
              status={alpacaConn
                ? `${(alpacaConn.connection?.tradingMode ?? "paper").toUpperCase()} · CONNECTED`
                : "NOT CONNECTED"}
              statusCol={alpacaConn ? "rgba(102,255,102,0.95)" : "rgba(255,255,255,0.45)"}
              icon="A"
              iconBg="rgba(102,255,102,0.10)" iconBorder="rgba(102,255,102,0.45)" iconColor="rgba(102,255,102,0.95)"
            />
            {alpacaConn && (
              <div style={{
                padding:"12px 16px",
                borderTop:"1px solid rgba(255,255,255,0.06)",
                display:"flex", justifyContent:"space-between", alignItems:"center", gap:12,
              }}>
                <div style={{ fontSize:9, fontFamily:SANS, color:DIM, lineHeight:1.5, flex:1 }}>
                  Revokes the OAuth grant at Alpaca and deletes your encrypted credentials from AICandlez.
                </div>
                <button
                  onClick={() => {
                    if (disconnectAlpaca.isPending) return;
                    setAlpacaConfirmOpen(true);
                  }}
                  disabled={disconnectAlpaca.isPending}
                  style={{
                    padding:"8px 14px",
                    background:"rgba(255,68,85,0.08)",
                    border:"1px solid rgba(255,68,85,0.40)",
                    borderRadius:8, color:"#FF6478",
                    fontFamily:SANS, fontSize:10, fontWeight:700, letterSpacing:"0.06em",
                    cursor: disconnectAlpaca.isPending ? "wait" : "pointer",
                    opacity: disconnectAlpaca.isPending ? 0.6 : 1,
                    whiteSpace:"nowrap",
                  }}>
                  {disconnectAlpaca.isPending ? "DISCONNECTING…" : "DISCONNECT"}
                </button>
              </div>
            )}
          </div>
          <div style={{ marginTop:6, fontSize:8.5, fontFamily:SANS, color:DIM, lineHeight:1.6, padding:"0 4px" }}>
            Withdrawal permissions are never requested. Read + Trade permissions only.
          </div>
        </div>

        {/* EXCHANGE CONNECTIONS — live health */}
        <div style={{ marginBottom:14 }}>
          <SectionHead label="Exchange Connections" accent="rgba(102,255,102,0.55)"/>
          <div style={{ background:CARD, border:`1px solid ${E}`, borderRadius:16, overflow:"hidden" }}>
            <ExchangeConnectionsHealth/>
          </div>
          <div style={{ marginTop:6, fontSize:8.5, fontFamily:SANS, color:DIM, lineHeight:1.6, padding:"0 4px" }}>
            Health is polled every 30s from the same balances feed used by Home and Portal.
          </div>
        </div>

        {/* BILLING */}
        <div style={{ marginBottom:18 }}>
          <SectionHead label="Billing" accent="rgba(0,114,255,0.55)"/>
          <div style={{ background:CARD, border:`1px solid ${E}`, borderRadius:16, overflow:"hidden" }}>
            <ExchangeRow
              name="Stripe" status="SUBSCRIPTION ACTIVE" statusCol="rgba(0,114,255,0.82)"
              icon="$"
              iconBg="rgba(0,80,255,0.10)"  iconBorder="rgba(0,100,255,0.28)" iconColor="rgba(80,140,255,0.90)"
            />
          </div>
          <div style={{ marginTop:6, fontSize:8.5, fontFamily:SANS, color:DIM, lineHeight:1.6, padding:"0 4px" }}>
            Manage your subscription and payment method in Billing & Plan.
          </div>
        </div>

        {/* ── Trading Account ───────────────────────────────────────────────── */}
        <div style={{ marginBottom:18 }}>
          <SectionHead label="Trading Account" accent={C}/>
          <BrokerStatusCard/>
        </div>

        {/* ── Account ──────────────────────────────────────────────────────── */}
        <div style={{ marginBottom:12 }}>
          <SectionHead label="Account"/>
          <div style={{ background:CARD, border:`1px solid ${E}`, borderRadius:14, overflow:"hidden" }}>
            <button onClick={openOnboarding} style={{
              width:"100%", padding:"17px 20px", background:"transparent", border:"none",
              borderBottom:"1px solid rgba(255,255,255,0.06)",
              display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer",
            }}>
              <div>
                <div style={{ fontSize:14, fontFamily:SANS, fontWeight:500, color:W,
                  textAlign:"left" as const }}>Live Trading Account</div>
                <div style={{ fontSize:9, fontFamily:SANS, color:GR, marginTop:2 }}>Powered by Alpaca · Sandbox paper mode</div>
              </div>
              <span style={{ fontSize:18, color:"rgba(255,255,255,0.30)" }}>›</span>
            </button>
            <button
              onClick={() => {
                const next = !profile.notifications;
                updateProfile({ notifications: next });
                if (pushNotifs.supported && pushNotifs.permission !== "denied") {
                  if (next) void pushNotifs.subscribe();
                  else      void pushNotifs.unsubscribe();
                }
              }}
              disabled={pushNotifs.loading}
              style={{
                width:"100%", padding:"17px 20px", background:"transparent", border:"none",
                borderBottom:"1px solid rgba(255,255,255,0.06)",
                display:"flex", justifyContent:"space-between", alignItems:"center",
                cursor: pushNotifs.loading ? "wait" : "pointer",
                opacity: pushNotifs.loading ? 0.6 : 1,
              }}>
              <div>
                <div style={{ fontSize:14, fontFamily:SANS, fontWeight:500, color:W, textAlign:"left" as const }}>
                  Push Notifications
                </div>
                <div style={{ fontSize:9, fontFamily:SANS, color:GR, marginTop:2, textAlign:"left" as const }}>
                  {profile.notifications
                    ? (pushNotifs.supported
                        ? (pushNotifs.permission === "denied"
                            ? "Enabled in app · Browser blocked — check site settings"
                            : pushNotifs.subscribed
                              ? "Enabled · Trade alerts + signals"
                              : "Enabled · Grant browser permission to receive pushes")
                        : "Enabled · In-app alerts only (push not supported in this browser)")
                    : "Disabled · Tap to enable trade alerts"}
                </div>
              </div>
              <div style={{
                width:38, height:22, borderRadius:11,
                background: profile.notifications ? "rgba(102,255,102,0.18)" : "rgba(255,255,255,0.07)",
                border:`1px solid ${profile.notifications ? "rgba(102,255,102,0.38)" : "rgba(255,255,255,0.12)"}`,
                transition:"all 0.2s", display:"flex", alignItems:"center", padding:"2px", flexShrink:0,
              }}>
                <div style={{
                  width:16, height:16, borderRadius:"50%",
                  background: profile.notifications ? C : "rgba(255,255,255,0.30)",
                  transform:`translateX(${profile.notifications ? 16 : 0}px)`,
                  transition:"transform 0.22s", flexShrink:0,
                }}/>
              </div>
            </button>
            <button onClick={() => setLocation("/billing")} style={{
              width:"100%", padding:"17px 20px", background:"transparent", border:"none",
              display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer",
            }}>
              <div style={{ fontSize:14, fontFamily:SANS, fontWeight:500, color:W,
                textAlign:"left" as const }}>Billing & Plan</div>
              <span style={{ fontSize:18, color:"rgba(255,255,255,0.30)" }}>›</span>
            </button>
          </div>
        </div>

        {/* ── Legal & Compliance ───────────────────────────────────────────── */}
        <div style={{ marginBottom:16 }}>
          <SectionHead label="Legal & Compliance"/>
          <div style={{ background:CARD, border:`1px solid ${E}`, borderRadius:14, overflow:"hidden" }}>
            {([
              ["Terms & Conditions", "/legal/terms"],
              ["Privacy Policy",     "/legal/privacy"],
              ["Risk Disclosure",    "/legal/risk"],
              ["Trading Disclaimer", "/legal/disclaimer"],
            ] as [string,string][]).map(([label, path], i, arr) => (
              <button key={path} onClick={() => setLocation(path)} style={{
                width:"100%", padding:"17px 20px", background:"transparent", border:"none",
                borderBottom:i<arr.length-1?"1px solid rgba(255,255,255,0.06)":"none",
                display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer",
              }}>
                <div style={{ fontSize:14, fontFamily:SANS, fontWeight:500, color:W,
                  textAlign:"left" as const }}>{label}</div>
                <span style={{ fontSize:18, color:"rgba(255,255,255,0.30)" }}>›</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Sign out ─────────────────────────────────────────────────────── */}
        <button onClick={() => signOut()} style={{
          width:"100%", padding:"15px 0", background:"transparent",
          border:"1px solid rgba(255,51,85,0.22)", borderRadius:12,
          color:"rgba(255,80,100,0.80)", fontFamily:SANS, fontSize:12, fontWeight:600,
          letterSpacing:"0.06em", cursor:"pointer", marginBottom:16,
        }}>Sign Out</button>

        {/* ── Disclaimer ───────────────────────────────────────────────────── */}
        <div style={{ background:CARD, border:`1px solid ${E}`,
          borderRadius:10, padding:"14px 16px", marginBottom:16 }}>
          <div style={{ fontSize:10, fontFamily:SANS, color:"rgba(136,146,164,0.88)", lineHeight:1.75 }}>
            Trading involves risk and may result in loss of capital. AICandlez does not provide
            financial advice. Past performance does not guarantee future results.
            A {PERFORMANCE_FEE_LABEL} performance fee applies only to profitable closed trades.
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div style={{ textAlign:"center" as const, fontSize:9, fontFamily:SANS,
          color:"rgba(136,146,164,0.65)", lineHeight:2.0 }}>
          AICandlez · Withdrawal permissions never requested
          <br/>
          7-Day AI Paper Trading Trial · {PERFORMANCE_FEE_LABEL} performance fee on profits only · v1.0.0
        </div>
      </div>

      {/* ── Alpaca disconnect: in-app confirm modal ───────────────────────── */}
      {alpacaConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="alpaca-disconnect-title"
          onClick={() => { if (!disconnectAlpaca.isPending) setAlpacaConfirmOpen(false); }}
          style={{
            position:"fixed", inset:0, zIndex:9000,
            background:"rgba(0,0,0,0.72)", backdropFilter:"blur(6px)",
            display:"flex", alignItems:"center", justifyContent:"center",
            padding:"24px", animation:"alpaca-fade 0.18s ease-out both",
          }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width:"100%", maxWidth:360, background:CARD,
              border:"1px solid rgba(255,68,85,0.32)", borderRadius:16,
              boxShadow:"0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)",
              padding:"22px 22px 18px",
              animation:"alpaca-pop 0.22s cubic-bezier(0.2,0.9,0.3,1.2) both",
            }}>
            <div id="alpaca-disconnect-title" style={{
              fontFamily:SANS, fontSize:14, fontWeight:700, color:W, letterSpacing:"0.02em",
              marginBottom:8,
            }}>
              Disconnect Alpaca?
            </div>
            <div style={{
              fontFamily:SANS, fontSize:11.5, color:GR, lineHeight:1.55, marginBottom:18,
            }}>
              This revokes the OAuth grant at Alpaca and permanently deletes your
              stored credentials from AICandlez. You can reconnect any time.
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button
                onClick={() => setAlpacaConfirmOpen(false)}
                disabled={disconnectAlpaca.isPending}
                style={{
                  padding:"9px 16px", background:"transparent",
                  border:`1px solid ${E}`, borderRadius:8, color:W,
                  fontFamily:SANS, fontSize:10.5, fontWeight:600, letterSpacing:"0.06em",
                  cursor: disconnectAlpaca.isPending ? "not-allowed" : "pointer",
                  opacity: disconnectAlpaca.isPending ? 0.5 : 1,
                }}>
                CANCEL
              </button>
              <button
                onClick={() => disconnectAlpaca.mutate()}
                disabled={disconnectAlpaca.isPending}
                style={{
                  padding:"9px 16px",
                  background:"rgba(255,68,85,0.14)",
                  border:"1px solid rgba(255,68,85,0.55)",
                  borderRadius:8, color:"#FF6478",
                  fontFamily:SANS, fontSize:10.5, fontWeight:700, letterSpacing:"0.06em",
                  cursor: disconnectAlpaca.isPending ? "wait" : "pointer",
                  opacity: disconnectAlpaca.isPending ? 0.7 : 1,
                }}>
                {disconnectAlpaca.isPending ? "DISCONNECTING…" : "DISCONNECT"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Alpaca disconnect: in-app toast ───────────────────────────────── */}
      {alpacaToast && (() => {
        const accent =
          alpacaToast.tone === "success" ? "rgba(102,255,102,0.85)" :
          alpacaToast.tone === "warn"    ? "rgba(255,210,0,0.85)"   :
                                           "rgba(255,100,120,0.90)";
        const accentBg =
          alpacaToast.tone === "success" ? "rgba(102,255,102,0.10)" :
          alpacaToast.tone === "warn"    ? "rgba(255,210,0,0.10)"   :
                                           "rgba(255,68,85,0.12)";
        return (
          <div
            role="status"
            aria-live="polite"
            style={{
              position:"fixed", left:"50%", bottom:88, transform:"translateX(-50%)",
              zIndex:9100, width:"min(360px, calc(100% - 32px))",
              background:CARD, border:`1px solid ${accent}`,
              borderLeft:`3px solid ${accent}`, borderRadius:12,
              padding:"12px 14px", display:"flex", alignItems:"flex-start", gap:12,
              boxShadow:"0 18px 40px rgba(0,0,0,0.55)",
              animation:"alpaca-toast-in 0.28s cubic-bezier(0.2,0.9,0.3,1.2) both",
            }}>
            <div style={{
              width:24, height:24, borderRadius:6, background:accentBg,
              border:`1px solid ${accent}`, color:accent, flexShrink:0,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontFamily:MONO, fontSize:12, fontWeight:700,
            }}>
              {alpacaToast.tone === "success" ? "✓" : alpacaToast.tone === "warn" ? "!" : "×"}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{
                fontFamily:SANS, fontSize:11.5, fontWeight:700, color:W,
                letterSpacing:"0.02em", marginBottom:2,
              }}>
                {alpacaToast.title}
              </div>
              <div style={{ fontFamily:SANS, fontSize:10.5, color:GR, lineHeight:1.45 }}>
                {alpacaToast.detail}
              </div>
            </div>
            <button
              onClick={() => setAlpacaToast(null)}
              aria-label="Dismiss"
              style={{
                background:"transparent", border:"none", color:DIM,
                fontSize:16, lineHeight:1, cursor:"pointer", padding:"0 2px",
                flexShrink:0,
              }}>
              ×
            </button>
          </div>
        );
      })()}

      <style>{`
        @keyframes dot-pulse   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.40;transform:scale(0.80)} }
        @keyframes page-in     { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes alpaca-fade { from{opacity:0} to{opacity:1} }
        @keyframes alpaca-pop  { from{opacity:0;transform:translateY(8px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes alpaca-toast-in { from{opacity:0;transform:translate(-50%, 12px)} to{opacity:1;transform:translate(-50%, 0)} }
        .page-enter            { animation: page-in 0.35s ease-out both; }
        input::placeholder     { color: rgba(136,146,164,0.45); }
        input                  { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}
