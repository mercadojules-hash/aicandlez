import { useQuery, useMutation } from "@tanstack/react-query";
import { useClerk, useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { api, type Portfolio, type Subscription } from "@/lib/api";

const S = "#0d0e1a", B = "#1c1f32", C = "#00e5ff", G = "#00ff88",
      P = "#9b5cf5", W = "#ffffff", GR = "#8892a4", DIM = "#3a3f5c",
      GOLD = "#ffd200";

// ── Donut gauge ────────────────────────────────────────────────────────────────
function Donut({ value, color, label, size = 76 }: { value: number; color: string; label: string; size?: number }) {
  const r = (size - 12) / 2, c = size / 2;
  const circ = 2 * Math.PI * r;
  const fill = (value / 100) * circ;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#1a1d30" strokeWidth="7" />
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
          transform={`rotate(-90 ${c} ${c})`}
          style={{ filter: `drop-shadow(0 0 4px ${color}80)` }} />
        <text x={c} y={c + 6} textAnchor="middle" fill={color}
          fontSize="16" fontWeight="900" fontFamily="monospace">{value}</text>
      </svg>
      <div style={{ fontSize: 8, fontFamily: "monospace", color: DIM, letterSpacing: "0.12em", marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

// ── Monthly bar chart ──────────────────────────────────────────────────────────
const MONTHS  = ["NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY"];
const PERF    = [-180, 420, 640, 510, 820, 580, 370];
const MAX_ABS = Math.max(...PERF.map(Math.abs));

function MonthlyChart() {
  return (
    <div style={{ background: "#09091a", border: `1px solid ${B}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 9, fontFamily: "monospace", color: DIM, letterSpacing: "0.16em", marginBottom: 14 }}>
        MONTHLY AI PERFORMANCE
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80, marginBottom: 8 }}>
        {PERF.map((v, i) => {
          const up  = v >= 0;
          const h   = Math.max(4, (Math.abs(v) / MAX_ABS) * 70);
          const col = up ? G : "#ff3355";
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div style={{ width: "100%", height: h, background: col,
                borderRadius: "3px 3px 0 0", opacity: i === MONTHS.length - 1 ? 1 : 0.65,
                boxShadow: i === MONTHS.length - 1 ? `0 0 12px ${col}60` : "none" }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {MONTHS.map((m, i) => (
          <div key={m} style={{ flex: 1, textAlign: "center", fontSize: 7, fontFamily: "monospace",
            color: i === MONTHS.length - 1 ? W : DIM, fontWeight: i === MONTHS.length - 1 ? 700 : 400 }}>
            {m}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ value, label, color, sub }: { value: string; label: string; color: string; sub?: string }) {
  return (
    <div style={{ background: "#0b0c18", border: `1px solid ${B}`, borderRadius: 12, padding: "16px 14px" }}>
      <div style={{ fontSize: 22, fontFamily: "monospace", fontWeight: 900, color, marginBottom: 4, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 8, fontFamily: "monospace", color: DIM, marginBottom: 2 }}>{sub}</div>}
      <div style={{ fontSize: 8, fontFamily: "monospace", color: DIM, letterSpacing: "0.14em" }}>{label}</div>
    </div>
  );
}

export default function Profile() {
  const { signOut }  = useClerk();
  const { user }     = useUser();
  const [, setLocation] = useLocation();

  const { data: portfolio } = useQuery<Portfolio>({
    queryKey: ["mobile-portfolio"], queryFn: () => api.get("/mobile/portfolio"), staleTime: 30_000,
  });
  const { data: sub } = useQuery<Subscription>({
    queryKey: ["subscription"], queryFn: () => api.get("/billing/subscription"), staleTime: 60_000,
  });

  const portal = useMutation({
    mutationFn: () => api.post<{ url: string }>("/billing/portal", {
      returnUrl: `${window.location.origin}/apex-trader-app/profile`,
    }),
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  const tv       = portfolio?.totalValue ?? 103800;
  const pnl      = portfolio?.openPnL    ?? 127.35;
  const plan     = sub?.plan ?? "free";
  const initials = (user?.firstName?.[0] ?? "") + (user?.lastName?.[0] ?? "T");
  const email    = user?.emailAddresses?.[0]?.emailAddress ?? "trader@apexai.com";
  const name     = user?.fullName ?? user?.firstName ?? "Apex Trader";

  const realized = 3800;
  const fees     = 142.88;
  const winRate  = 63.2;
  const cumReturn = 3847;

  return (
    <div className="page-enter" style={{ background: "#080810", minHeight: "100%", paddingBottom: 24 }}>

      {/* ── Profile Card ────────────────────────────────────────────────────── */}
      <div style={{ margin: "16px 16px 12px", background: S, border: `1px solid ${B}`,
        borderRadius: 16, padding: "18px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%",
              background: `linear-gradient(135deg, ${C}30, ${P}30)`,
              border: `2px solid ${C}60`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontFamily: "monospace", fontWeight: 900, color: C }}>
              {initials.toUpperCase() || "AT"}
            </div>
            <div style={{ position: "absolute", bottom: 2, right: 2, width: 10, height: 10,
              borderRadius: "50%", background: G, border: "2px solid #080810",
              boxShadow: `0 0 6px ${G}` }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 17, fontFamily: "monospace", fontWeight: 900, color: W,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
              <span style={{ padding: "2px 8px", background: C+"18", border: `1px solid ${C}40`,
                borderRadius: 4, fontSize: 8, fontFamily: "monospace", fontWeight: 700,
                color: C, letterSpacing: "0.1em", flexShrink: 0 }}>
                {plan.toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: 10, fontFamily: "monospace", color: DIM, marginBottom: 2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: DIM, opacity: 0.6 }}>Member since Jan 2025</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>

        {/* ── Stats 2×2 ───────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <StatCard value={`$${(tv / 1000).toFixed(1)}K`} label="EQUITY"    color={C} />
          <StatCard value={`+$${(realized / 1000).toFixed(1)}K`} label="REALIZED" color={G} />
          <StatCard value={`${winRate}%`} label="WIN RATE"  color={G} sub="4W · 1L" />
          <StatCard value={`$${fees.toFixed(2)}`} label="FEES PAID" color={GOLD} />
        </div>

        {/* ── Performance Intelligence ─────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 3, height: 14, background: P, borderRadius: 2 }} />
            <span style={{ fontSize: 9, color: GR, letterSpacing: "0.2em", fontFamily: "monospace", fontWeight: 700 }}>
              PERFORMANCE INTELLIGENCE
            </span>
          </div>

          <MonthlyChart />

          {/* Donut gauges */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", marginTop: 16 }}>
            <Donut value={71} color={P} label="AI SCORE"    />
            <Donut value={59} color={C} label="CONSISTENCY" />
            <Donut value={57} color={G} label="EFFICIENCY"  />
          </div>

          {/* Cumulative return */}
          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between",
            alignItems: "center", padding: "12px 0", borderTop: `1px solid ${B}` }}>
            <span style={{ fontSize: 13, fontFamily: "monospace", color: W }}>Cumulative Return</span>
            <span style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 800, color: G }}>
              +${cumReturn.toLocaleString()}
            </span>
          </div>
        </div>

        {/* ── Account actions ─────────────────────────────────────────────── */}
        <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
          {[
            { label: "Manage Exchanges",  action: () => setLocation("/exchanges"), color: C },
            { label: "Billing & Plan",    action: () => portal.mutate(), color: GR },
          ].map(({ label, action, color }, i) => (
            <button key={label} onClick={action} style={{
              width: "100%", padding: "15px 18px", background: "transparent",
              border: "none", borderBottom: i === 0 ? `1px solid ${B}` : "none",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              cursor: "pointer",
            }}>
              <span style={{ fontSize: 13, fontFamily: "monospace", color }}>{label}</span>
              <span style={{ fontSize: 12, color: DIM }}>›</span>
            </button>
          ))}
        </div>

        <button onClick={() => signOut()} style={{
          width: "100%", padding: "14px 0", background: "transparent",
          border: `1px solid #ff335528`, borderRadius: 12, color: "#ff3355",
          fontFamily: "monospace", fontSize: 11, fontWeight: 700,
          letterSpacing: "0.1em", cursor: "pointer",
        }}>
          SIGN OUT
        </button>

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 7, fontFamily: "monospace",
          color: DIM, lineHeight: 1.9, letterSpacing: "0.06em" }}>
          APEX TRADER · WITHDRAWAL PERMISSIONS NEVER REQUESTED{"\n"}
          PAPER TRADING ALWAYS FREE
        </div>
      </div>
    </div>
  );
}
