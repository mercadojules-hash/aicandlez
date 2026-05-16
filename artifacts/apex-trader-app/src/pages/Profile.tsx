import { useQuery } from "@tanstack/react-query";
import { useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { api, type Portfolio, type Subscription } from "@/lib/api";
import { useBrokerConnection } from "@/contexts/BrokerConnectionContext";
import { BrokerStatusCard } from "@/components/BrokerStatusCard";

// ── Design tokens ───────────────────────────────────────────────────────────────
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const C    = "#00e5ff";
const W    = "#ffffff";
const GR   = "#8892a4";
const GOLD = "#ffd200";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
const MONO = "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Roboto Mono', monospace";

// ── Donut gauge — pixel-perfect SVG centering ────────────────────────────────────
function Donut({ value, color, label }: { value: number; color: string; label: string }) {
  const size  = 74;
  const sw    = 5.5;
  const r     = (size - sw * 2) / 2;
  const cx    = size / 2;
  const circ  = 2 * Math.PI * r;
  const arc   = (Math.min(value, 100) / 100) * circ;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 6,
    }}>
      <svg width={size} height={size} style={{ display: "block" }}>
        {/* Track */}
        <circle cx={cx} cy={cx} r={r} fill="none"
          stroke="rgba(255,255,255,0.05)" strokeWidth={sw}/>
        {/* Arc */}
        <circle cx={cx} cy={cx} r={r} fill="none"
          stroke={color} strokeWidth={sw}
          strokeDasharray={`${arc} ${circ - arc}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: "stroke-dasharray 0.5s ease" }}/>
        {/* Value — dominantBaseline for true vertical centering */}
        <text
          x={cx} y={cx}
          textAnchor="middle" dominantBaseline="central"
          fill="rgba(255,255,255,0.92)"
          fontSize="14" fontWeight="700"
          fontFamily={MONO}>
          {value}
        </text>
      </svg>
      <div style={{
        fontSize: 8, fontFamily: SANS, fontWeight: 500,
        color: "rgba(136,146,164,0.90)", letterSpacing: "0.11em",
        textTransform: "uppercase" as const, textAlign: "center",
      }}>
        {label}
      </div>
    </div>
  );
}

// ── Monthly bar chart ─────────────────────────────────────────────────────────────
const MONTHS  = ["NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY"];
const PERF    = [-180, 420, 640, 510, 820, 580, 370];
const MAX_ABS = Math.max(...PERF.map(Math.abs));

function MonthlyChart() {
  return (
    <div style={{ background: CARD, border: `1px solid ${E}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 8, fontFamily: SANS, fontWeight: 600,
        color: "rgba(255,255,255,0.45)", letterSpacing: "0.16em",
        marginBottom: 14, textTransform: "uppercase" as const }}>
        Monthly AI Performance
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 76, marginBottom: 8 }}>
        {PERF.map((v, i) => {
          const up   = v >= 0;
          const h    = Math.max(4, (Math.abs(v) / MAX_ABS) * 68);
          const col  = up ? "rgba(0,210,100,0.80)" : "rgba(230,70,70,0.78)";
          const last = i === MONTHS.length - 1;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div style={{ width: "100%", height: h, background: col,
                borderRadius: "3px 3px 0 0", opacity: last ? 1 : 0.65 }}/>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {MONTHS.map((m, i) => {
          const last = i === MONTHS.length - 1;
          return (
            <div key={m} style={{ flex: 1, textAlign: "center" as const, fontSize: 7,
              fontFamily: SANS, fontWeight: last ? 600 : 400,
              color: last ? "rgba(255,255,255,0.75)" : "rgba(136,146,164,0.75)" }}>
              {m}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── KPI stat card ─────────────────────────────────────────────────────────────────
function StatCard({ value, label, color, sub }: { value: string; label: string; color: string; sub?: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${E}`, borderRadius: 12, padding: "16px 14px" }}>
      <div style={{ fontSize: 23, fontFamily: MONO, fontWeight: 700, color,
        marginBottom: sub ? 3 : 5, lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 9, fontFamily: SANS, color: "rgba(136,146,164,0.85)", marginBottom: 3 }}>{sub}</div>
      )}
      <div style={{ fontSize: 8, fontFamily: SANS, fontWeight: 600,
        color: "rgba(136,146,164,0.80)", letterSpacing: "0.12em",
        textTransform: "uppercase" as const }}>
        {label}
      </div>
    </div>
  );
}

// ── Settings row ─────────────────────────────────────────────────────────────────
function SettingsRow({ label, sub, onPress, divider = true }: {
  label: string; sub?: string; onPress: () => void; divider?: boolean;
}) {
  return (
    <button onClick={onPress} style={{
      width: "100%", padding: "17px 20px", background: "transparent",
      border: "none",
      borderBottom: divider ? "1px solid rgba(255,255,255,0.06)" : "none",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      cursor: "pointer", textAlign: "left" as const,
    }}>
      <div>
        <div style={{ fontSize: 14, fontFamily: SANS, fontWeight: 500, color: W }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 9, fontFamily: SANS, color: "rgba(136,146,164,0.80)",
            marginTop: 2.5 }}>{sub}</div>
        )}
      </div>
      <span style={{ fontSize: 18, fontFamily: SANS,
        color: "rgba(255,255,255,0.30)", lineHeight: 1, flexShrink: 0 }}>›</span>
    </button>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────────
function SectionHead({ label, accent = "rgba(255,255,255,0.30)" }: { label: string; accent?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ width: 2, height: 14, background: accent, borderRadius: 2, flexShrink: 0 }}/>
      <span style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
        color: "rgba(255,255,255,0.55)", letterSpacing: "0.18em",
        textTransform: "uppercase" as const }}>
        {label}
      </span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────────
export default function Profile() {
  const { signOut }     = useClerk();
  const [, setLocation] = useLocation();
  const { openOnboarding } = useBrokerConnection();

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

  const tv       = portfolio?.totalValue ?? 103800;
  const plan     = sub?.plan ?? "free";
  const initials = "AM";
  const email    = "alex@apexai.trade";
  const name     = "Alex Morgan";

  const realized  = 3800;
  const fees      = 142.88;
  const winRate   = 63.2;
  const cumReturn = 3847;

  return (
    <div className="page-enter" style={{ background: BG, minHeight: "100%", paddingBottom: 28 }}>

      {/* ── Identity card ──────────────────────────────────────────────────── */}
      <div style={{ margin: "16px 16px 14px", background: CARD, border: `1px solid ${E}`,
        borderRadius: 16, padding: "20px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Avatar */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(0,229,255,0.12), rgba(155,92,245,0.12))",
              border: "1.5px solid rgba(0,229,255,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 19, fontFamily: MONO, fontWeight: 700, color: C }}>
              {initials}
            </div>
            <div style={{ position: "absolute", bottom: 2, right: 2,
              width: 10, height: 10, borderRadius: "50%",
              background: "rgba(0,210,100,0.90)",
              border: "2px solid #000000" }}/>
          </div>
          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 18, fontFamily: SANS, fontWeight: 700, color: W,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {name}
              </span>
              <span style={{
                padding: "2px 9px", flexShrink: 0,
                background: plan === "free" ? "rgba(255,255,255,0.05)" : "rgba(0,229,255,0.08)",
                border: `1px solid ${plan === "free" ? "rgba(255,255,255,0.14)" : "rgba(0,229,255,0.22)"}`,
                borderRadius: 4, fontSize: 8, fontFamily: SANS, fontWeight: 600,
                color: plan === "free" ? "rgba(136,146,164,0.90)" : C,
                letterSpacing: "0.07em", textTransform: "uppercase" as const }}>
                {plan === "free" ? "Trial" : "Active"}
              </span>
            </div>
            <div style={{ fontSize: 11, fontFamily: SANS, color: "rgba(136,146,164,0.90)",
              marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap" as const }}>
              {email}
            </div>
            <div style={{ fontSize: 9, fontFamily: SANS, color: "rgba(136,146,164,0.70)" }}>
              Member since Jan 2026
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>

        {/* ── Stats 2×2 ───────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          <StatCard value={`$${(tv / 1000).toFixed(1)}K`}        label="Equity"    color={C} />
          <StatCard value={`+$${(realized / 1000).toFixed(1)}K`} label="Realized"  color="rgba(0,210,100,0.88)" />
          <StatCard value={`${winRate}%`}                         label="Win Rate"  color="rgba(0,210,100,0.88)" sub="4W · 1L" />
          <StatCard value={`$${fees.toFixed(2)}`}                 label="Fees Paid" color={GOLD} />
        </div>

        {/* ── Performance Intelligence ─────────────────────────────────────── */}
        <div style={{ marginBottom: 18 }}>
          <SectionHead label="Performance Intelligence" accent="rgba(155,92,245,0.65)"/>
          <MonthlyChart/>

          {/* Donut row — fixed alignment */}
          <div style={{
            marginTop: 10, background: CARD, border: `1px solid ${E}`,
            borderRadius: 12, padding: "20px 8px",
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            alignItems: "start",
          }}>
            <Donut value={71} color="rgba(155,92,245,0.80)"  label="AI Score"    />
            <Donut value={59} color="rgba(0,185,215,0.78)"   label="Consistency" />
            <Donut value={57} color="rgba(0,200,100,0.76)"   label="Efficiency"  />
          </div>

          {/* Cumulative return */}
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between",
            alignItems: "center", padding: "14px 0",
            borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: 13, fontFamily: SANS, fontWeight: 500,
              color: "rgba(255,255,255,0.88)" }}>
              Cumulative Return
            </span>
            <span style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700,
              color: "rgba(0,210,100,0.88)" }}>
              +${cumReturn.toLocaleString()}
            </span>
          </div>
        </div>

        {/* ── Trading Account Status ───────────────────────────────────────── */}
        <div style={{ marginBottom: 18 }}>
          <SectionHead label="Trading Account" accent={C}/>
          <BrokerStatusCard />
        </div>

        {/* ── Account ──────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 12 }}>
          <SectionHead label="Account"/>
          <div style={{ background: CARD, border: `1px solid ${E}`,
            borderRadius: 14, overflow: "hidden" }}>
            <SettingsRow
              label="AI Trading Account"
              sub="Powered by Alpaca · Sandbox paper mode"
              onPress={openOnboarding}
            />
            <SettingsRow
              label="Billing & Plan"
              onPress={() => setLocation("/billing")}
              divider={false}
            />
          </div>
        </div>

        {/* ── Legal & Compliance ───────────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <SectionHead label="Legal & Compliance"/>
          <div style={{ background: CARD, border: `1px solid ${E}`,
            borderRadius: 14, overflow: "hidden" }}>
            <SettingsRow label="Terms & Conditions" onPress={() => setLocation("/legal/terms")}      />
            <SettingsRow label="Privacy Policy"     onPress={() => setLocation("/legal/privacy")}    />
            <SettingsRow label="Risk Disclosure"    onPress={() => setLocation("/legal/risk")}       />
            <SettingsRow label="Trading Disclaimer" onPress={() => setLocation("/legal/disclaimer")}
              divider={false} />
          </div>
        </div>

        {/* ── Sign out ─────────────────────────────────────────────────────── */}
        <button onClick={() => signOut()} style={{
          width: "100%", padding: "15px 0", background: "transparent",
          border: "1px solid rgba(255,51,85,0.22)", borderRadius: 12,
          color: "rgba(255,80,100,0.80)",
          fontFamily: SANS, fontSize: 12, fontWeight: 600,
          letterSpacing: "0.06em", cursor: "pointer", marginBottom: 16,
        }}>
          Sign Out
        </button>

        {/* ── Disclaimer ───────────────────────────────────────────────────── */}
        <div style={{ background: CARD, border: `1px solid ${E}`,
          borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontFamily: SANS,
            color: "rgba(136,146,164,0.88)", lineHeight: 1.75 }}>
            Trading involves risk and may result in loss of capital. Apex AI Trader does not
            provide financial advice. Past performance does not guarantee future results.
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div style={{ textAlign: "center" as const, fontSize: 9, fontFamily: SANS,
          color: "rgba(136,146,164,0.65)", lineHeight: 2.0 }}>
          Apex AI Trader · Withdrawal permissions never requested
          <br/>
          Paper trading always free · v1.0.0
        </div>
      </div>
    </div>
  );
}
