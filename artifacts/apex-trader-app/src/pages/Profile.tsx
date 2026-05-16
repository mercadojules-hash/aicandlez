import { useQuery, useMutation } from "@tanstack/react-query";
import { useClerk, useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { api, type Portfolio, type Subscription } from "@/lib/api";

// ── Design tokens ───────────────────────────────────────────────────────────────
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const C    = "#00e5ff";
const G    = "#00ff88";
const P    = "#9b5cf5";
const W    = "#ffffff";
const GR   = "#8892a4";
const GOLD = "#ffd200";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
const MONO = "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Roboto Mono', monospace";

// ── Donut gauge ─────────────────────────────────────────────────────────────────
function Donut({ value, color, label, size = 78 }: { value: number; color: string; label: string; size?: number }) {
  const r    = (size - 14) / 2;
  const cx   = size / 2;
  const circ = 2 * Math.PI * r;
  const fill = (value / 100) * circ;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cx} r={r} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth="6"/>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}/>
        <text x={cx} y={cx + 5} textAnchor="middle"
          fill="rgba(255,255,255,0.88)"
          fontSize="15" fontWeight="700" fontFamily={MONO}>{value}</text>
      </svg>
      <div style={{ fontSize: 8, fontFamily: SANS, fontWeight: 500,
        color: "rgba(136,146,164,0.85)",
        letterSpacing: "0.10em", marginTop: 4,
        textTransform: "uppercase" as const }}>
        {label}
      </div>
    </div>
  );
}

// ── Monthly bar chart ────────────────────────────────────────────────────────────
const MONTHS  = ["NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY"];
const PERF    = [-180, 420, 640, 510, 820, 580, 370];
const MAX_ABS = Math.max(...PERF.map(Math.abs));

function MonthlyChart() {
  return (
    <div style={{ background: CARD, border: `1px solid ${E}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 8, fontFamily: SANS, fontWeight: 500,
        color: "rgba(136,146,164,0.85)",
        letterSpacing: "0.14em", marginBottom: 14,
        textTransform: "uppercase" as const }}>
        Monthly AI Performance
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80, marginBottom: 8 }}>
        {PERF.map((v, i) => {
          const up   = v >= 0;
          const h    = Math.max(4, (Math.abs(v) / MAX_ABS) * 70);
          const col  = up ? "rgba(0,210,100,0.82)" : "rgba(230,70,70,0.82)";
          const last = i === MONTHS.length - 1;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div style={{ width: "100%", height: h, background: col,
                borderRadius: "3px 3px 0 0", opacity: last ? 1 : 0.70 }}/>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {MONTHS.map((m, i) => {
          const last = i === MONTHS.length - 1;
          return (
            <div key={m} style={{ flex: 1, textAlign: "center", fontSize: 7,
              fontFamily: SANS, fontWeight: last ? 600 : 400,
              color: last ? W : "rgba(136,146,164,0.80)" }}>
              {m}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── KPI stat card ────────────────────────────────────────────────────────────────
function StatCard({ value, label, color, sub }: { value: string; label: string; color: string; sub?: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${E}`, borderRadius: 12, padding: "16px 14px" }}>
      <div style={{ fontSize: 24, fontFamily: MONO, fontWeight: 700, color, marginBottom: 5, lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 8, fontFamily: SANS, color: "rgba(136,146,164,0.85)", marginBottom: 3 }}>{sub}</div>
      )}
      <div style={{ fontSize: 8, fontFamily: SANS, fontWeight: 500,
        color: "rgba(136,146,164,0.85)",
        letterSpacing: "0.10em", textTransform: "uppercase" as const }}>
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
      width: "100%", padding: "18px 20px", background: "transparent",
      border: "none",
      borderBottom: divider ? `1px solid rgba(255,255,255,0.06)` : "none",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      cursor: "pointer", textAlign: "left" as const,
    }}>
      <div>
        <div style={{ fontSize: 14, fontFamily: SANS, fontWeight: 500, color: W }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 9, fontFamily: SANS, color: "rgba(136,146,164,0.75)",
            marginTop: 2 }}>{sub}</div>
        )}
      </div>
      <span style={{ fontSize: 16, fontFamily: SANS, color: "rgba(255,255,255,0.35)", lineHeight: 1 }}>›</span>
    </button>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────────
function SectionHead({ label, accent = "rgba(255,255,255,0.25)" }: { label: string; accent?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ width: 2, height: 13, background: accent, borderRadius: 2, flexShrink: 0 }}/>
      <span style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
        color: "rgba(255,255,255,0.50)", letterSpacing: "0.18em",
        textTransform: "uppercase" as const }}>
        {label}
      </span>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────────
export default function Profile() {
  const { signOut }     = useClerk();
  const { user }        = useUser();
  const [, setLocation] = useLocation();

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

  const portal = useMutation({
    mutationFn: () => api.post<{ url: string }>("/billing/portal", {
      returnUrl: `${window.location.origin}/apex-trader-app/profile`,
    }),
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  const tv       = portfolio?.totalValue ?? 103800;
  const plan     = sub?.plan ?? "free";
  const initials = ((user?.firstName?.[0] ?? "A") + (user?.lastName?.[0] ?? "C")).toUpperCase();
  const email    = user?.emailAddresses?.[0]?.emailAddress ?? "alex.carter@apextrader.ai";
  const name     = user?.fullName ?? user?.firstName ?? "Alex Carter";

  const realized  = 3800;
  const fees      = 142.88;
  const winRate   = 63.2;
  const cumReturn = 3847;

  return (
    <div className="page-enter" style={{ background: BG, minHeight: "100%", paddingBottom: 28 }}>

      {/* ── Profile identity card ──────────────────────────────────────────── */}
      <div style={{ margin: "16px 16px 14px", background: CARD, border: `1px solid ${E}`,
        borderRadius: 16, padding: "20px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>

          {/* Avatar */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{ width: 62, height: 62, borderRadius: "50%",
              background: `linear-gradient(135deg, rgba(0,229,255,0.14), rgba(155,92,245,0.14))`,
              border: `1.5px solid rgba(0,229,255,0.40)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontFamily: MONO, fontWeight: 700, color: C }}>
              {initials}
            </div>
            <div style={{ position: "absolute", bottom: 2, right: 2, width: 10, height: 10,
              borderRadius: "50%", background: "rgba(0,210,100,0.90)",
              border: "2px solid #000000" }}/>
          </div>

          {/* User info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 19, fontFamily: SANS, fontWeight: 700, color: W,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {name}
              </span>
              <span style={{
                padding: "2px 9px",
                background: plan === "free" ? "rgba(255,255,255,0.05)" : "rgba(0,229,255,0.08)",
                border: `1px solid ${plan === "free" ? "rgba(255,255,255,0.14)" : "rgba(0,229,255,0.25)"}`,
                borderRadius: 4, fontSize: 8, fontFamily: SANS, fontWeight: 600,
                color: plan === "free" ? "rgba(136,146,164,0.90)" : C,
                letterSpacing: "0.07em", flexShrink: 0,
                textTransform: "uppercase" as const }}>
                {plan}
              </span>
            </div>
            <div style={{ fontSize: 11, fontFamily: SANS, color: "rgba(136,146,164,0.90)", marginBottom: 3,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {email}
            </div>
            <div style={{ fontSize: 9, fontFamily: SANS, color: "rgba(136,146,164,0.65)" }}>
              Member since Jan 2026
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>

        {/* ── KPI 2×2 grid ────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          <StatCard value={`$${(tv / 1000).toFixed(1)}K`}        label="Equity"    color={C} />
          <StatCard value={`+$${(realized / 1000).toFixed(1)}K`} label="Realized"  color="rgba(0,210,100,0.88)" />
          <StatCard value={`${winRate}%`}                         label="Win Rate"  color="rgba(0,210,100,0.88)" sub="4W · 1L" />
          <StatCard value={`$${fees.toFixed(2)}`}                 label="Fees Paid" color={GOLD} />
        </div>

        {/* ── Performance Intelligence ─────────────────────────────────────── */}
        <div style={{ marginBottom: 18 }}>
          <SectionHead label="Performance Intelligence" accent="rgba(155,92,245,0.60)"/>

          <MonthlyChart/>

          {/* Donut gauges */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            marginTop: 12, background: CARD, border: `1px solid ${E}`,
            borderRadius: 10, padding: "16px 0" }}>
            <Donut value={71} color="rgba(155,92,245,0.80)"  label="AI Score"    />
            <Donut value={59} color="rgba(0,185,215,0.78)"   label="Consistency" />
            <Donut value={57} color="rgba(0,200,100,0.76)"   label="Efficiency"  />
          </div>

          {/* Cumulative return */}
          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between",
            alignItems: "center", padding: "13px 0",
            borderTop: `1px solid rgba(255,255,255,0.06)` }}>
            <span style={{ fontSize: 13, fontFamily: SANS, fontWeight: 500, color: W }}>
              Cumulative Return
            </span>
            <span style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700,
              color: "rgba(0,210,100,0.88)" }}>
              +${cumReturn.toLocaleString()}
            </span>
          </div>
        </div>

        {/* ── Account actions ──────────────────────────────────────────────── */}
        <div style={{ marginBottom: 12 }}>
          <SectionHead label="Account"/>
          <div style={{ background: CARD, border: `1px solid ${E}`,
            borderRadius: 14, overflow: "hidden" }}>
            <SettingsRow
              label="Manage Exchanges"
              sub="API keys encrypted and securely stored"
              onPress={() => setLocation("/exchanges")}
            />
            <SettingsRow
              label="Billing & Plan"
              onPress={() => portal.mutate()}
              divider={false}
            />
          </div>
        </div>

        {/* ── Legal & Compliance ───────────────────────────────────────────── */}
        <div style={{ marginBottom: 12 }}>
          <SectionHead label="Legal & Compliance"/>
          <div style={{ background: CARD, border: `1px solid ${E}`,
            borderRadius: 14, overflow: "hidden" }}>
            <SettingsRow label="Terms & Conditions" onPress={() => {}} />
            <SettingsRow label="Privacy Policy"     onPress={() => {}} />
            <SettingsRow label="Risk Disclosure"    onPress={() => {}} />
            <SettingsRow label="Trading Disclaimer" onPress={() => {}} divider={false} />
          </div>
        </div>

        {/* ── Sign out ─────────────────────────────────────────────────────── */}
        <button onClick={() => signOut()} style={{
          width: "100%", padding: "15px 0", background: "transparent",
          border: `1px solid rgba(255,51,85,0.22)`, borderRadius: 12,
          color: "rgba(255,51,85,0.75)",
          fontFamily: SANS, fontSize: 12, fontWeight: 600,
          letterSpacing: "0.06em", cursor: "pointer",
          marginBottom: 14,
        }}>
          Sign Out
        </button>

        {/* ── Legal disclaimer ─────────────────────────────────────────────── */}
        <div style={{ background: CARD, border: `1px solid ${E}`,
          borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontFamily: SANS, fontWeight: 400,
            color: "rgba(136,146,164,0.85)",
            lineHeight: 1.7 }}>
            Trading involves risk and may result in loss of capital. Apex AI Trader does not provide financial advice. Past performance does not guarantee future results.
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div style={{ textAlign: "center", fontSize: 8, fontFamily: SANS,
          color: "rgba(136,146,164,0.70)", lineHeight: 2.0, letterSpacing: "0.05em" }}>
          Apex AI Trader · Withdrawal permissions never requested
          {"\n"}
          Paper trading always free · v1.0.0
        </div>
      </div>
    </div>
  );
}
