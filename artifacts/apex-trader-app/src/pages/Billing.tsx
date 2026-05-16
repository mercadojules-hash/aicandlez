import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api, type Subscription } from "@/lib/api";

// ── Design tokens ───────────────────────────────────────────────────────────────
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const C    = "#00e5ff";
const W    = "#ffffff";
const GR   = "#8892a4";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
const MONO = "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Roboto Mono', monospace";

const FEATURES = [
  "Paper & simulated trading (unlimited)",
  "AI scanner across 18 assets",
  "Live AI trade execution",
  "Real-time signal alerts",
  "Portfolio intelligence & analytics",
  "Trade journal with AI scoring",
  "Risk management automation",
  "Mobile + web access",
];

// ── Status card ──────────────────────────────────────────────────────────────────
function StatusCard({ sub }: { sub: Subscription | undefined }) {
  const plan    = sub?.plan ?? "free";
  const active  = plan !== "free";
  const accent  = active ? "rgba(0,210,100,0.88)" : "rgba(255,180,0,0.78)";
  const bgColor = active ? "rgba(0,210,100,0.04)" : "rgba(255,180,0,0.04)";
  const border  = active ? "rgba(0,210,100,0.18)" : "rgba(255,180,0,0.16)";

  return (
    <div style={{ background: bgColor, border: `1px solid ${border}`,
      borderRadius: 14, padding: "16px 18px", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: active ? 6 : 0 }}>
        <div>
          <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
            color: accent, letterSpacing: "0.10em",
            textTransform: "uppercase" as const, marginBottom: 4 }}>
            {active ? "Active Subscription" : "Free Trial"}
          </div>
          <div style={{ fontSize: 16, fontFamily: SANS, fontWeight: 700, color: W }}>
            {active ? "Apex AI Trader" : "7-Day Free Access"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontFamily: MONO, fontWeight: 700, color: accent, lineHeight: 1 }}>
            {active ? "$5.99" : "Free"}
          </div>
          {active && (
            <div style={{ fontSize: 9, fontFamily: SANS, color: GR, marginTop: 3 }}>/ month</div>
          )}
        </div>
      </div>
      {active && (
        <div style={{ fontSize: 9, fontFamily: SANS, color: GR, marginTop: 2 }}>
          Renews monthly · Cancel anytime
        </div>
      )}
      {!active && (
        <div style={{ fontSize: 10, fontFamily: SANS, color: "rgba(255,180,0,0.70)",
          marginTop: 6 }}>
          Full access for 7 days — no credit card required to start
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────────
export default function Billing() {
  const [, setLocation] = useLocation();

  const { data: sub, isLoading } = useQuery<Subscription>({
    queryKey:  ["subscription"],
    queryFn:   () => api.get("/billing/subscription"),
    staleTime: 60_000,
  });

  const checkout = useMutation({
    mutationFn: () =>
      api.post<{ url: string }>("/billing/checkout", {
        planId:        "starter",
        billingPeriod: "monthly",
        successUrl: `${window.location.origin}/apex-trader-app/profile?checkout=success`,
        cancelUrl:  `${window.location.origin}/apex-trader-app/billing`,
      }),
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  const isSubscribed = sub?.plan && sub.plan !== "free";

  return (
    <div className="page-enter" style={{ background: BG, minHeight: "100%", paddingBottom: 36 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: "18px 20px 18px", borderBottom: `1px solid ${E}` }}>
        <button onClick={() => setLocation("/profile")} style={{
          background: "none", border: "none", cursor: "pointer",
          fontFamily: SANS, fontSize: 10, fontWeight: 500,
          color: GR, padding: "0 0 10px 0", display: "block",
        }}>
          ← Profile
        </button>
        <div style={{ fontSize: 22, fontFamily: SANS, fontWeight: 700, color: W }}>
          Billing & Plan
        </div>
        <div style={{ fontSize: 11, fontFamily: SANS, color: GR, marginTop: 5, lineHeight: 1.5 }}>
          One plan. Everything included.
        </div>
      </div>

      <div style={{ padding: "20px 16px 0" }}>

        {/* Status card */}
        {!isLoading && <StatusCard sub={sub} />}

        {/* Error */}
        {checkout.isError && (
          <div style={{ background: "rgba(255,51,85,0.07)",
            border: "1px solid rgba(255,51,85,0.22)",
            borderRadius: 8, padding: "10px 14px", marginBottom: 16,
            fontSize: 10, fontFamily: SANS, color: "rgba(255,100,120,0.90)" }}>
            {checkout.error instanceof Error ? checkout.error.message : "Checkout failed. Please try again."}
          </div>
        )}

        {/* Plan card */}
        <div style={{ background: CARD,
          border: "1px solid rgba(0,229,255,0.18)",
          borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>

          {/* Plan header */}
          <div style={{ padding: "20px 20px 16px",
            borderBottom: `1px solid ${E}`,
            background: "rgba(0,229,255,0.02)" }}>
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: SANS, fontWeight: 600,
                  color: C, letterSpacing: "0.10em",
                  textTransform: "uppercase" as const, marginBottom: 6 }}>
                  Apex AI Trader
                </div>
                <div style={{ fontSize: 13, fontFamily: SANS,
                  color: GR, lineHeight: 1.5, maxWidth: 200 }}>
                  Full access to every feature, every day.
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 30, fontFamily: MONO, fontWeight: 700,
                  color: W, lineHeight: 1 }}>
                  $5.99
                </div>
                <div style={{ fontSize: 10, fontFamily: SANS, color: GR, marginTop: 4 }}>
                  / month
                </div>
              </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 9, fontFamily: SANS,
              color: "rgba(255,180,0,0.72)" }}>
              + 3% performance fee on profitable closed trades only
            </div>
          </div>

          {/* Features */}
          <div style={{ padding: "16px 20px 20px" }}>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {FEATURES.map(f => (
                <li key={f} style={{ display: "flex", gap: 10,
                  alignItems: "flex-start", padding: "5px 0" }}>
                  <span style={{ fontSize: 10, color: "rgba(0,210,100,0.75)",
                    flexShrink: 0, marginTop: 2 }}>✓</span>
                  <span style={{ fontSize: 12, fontFamily: SANS,
                    color: "rgba(255,255,255,0.78)", lineHeight: 1.5 }}>
                    {f}
                  </span>
                </li>
              ))}
            </ul>

            {/* Trial note */}
            <div style={{ marginTop: 16, padding: "10px 14px",
              background: "rgba(0,229,255,0.04)",
              border: "1px solid rgba(0,229,255,0.12)",
              borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontFamily: SANS, fontWeight: 600,
                color: "rgba(0,229,255,0.80)", marginBottom: 2 }}>
                7 days free to start
              </div>
              <div style={{ fontSize: 9, fontFamily: SANS, color: GR, lineHeight: 1.6 }}>
                Full access from day one. Cancel before day 7 and you won't be charged.
              </div>
            </div>

            {/* CTA */}
            {!isSubscribed && (
              <button
                disabled={checkout.isPending}
                onClick={() => checkout.mutate()}
                style={{
                  width: "100%", marginTop: 16, padding: "15px 0",
                  background: checkout.isPending
                    ? "rgba(0,229,255,0.06)" : "rgba(0,229,255,0.12)",
                  border: "1px solid rgba(0,229,255,0.35)",
                  borderRadius: 12, color: checkout.isPending ? GR : C,
                  fontFamily: SANS, fontSize: 14, fontWeight: 600,
                  cursor: checkout.isPending ? "wait" : "pointer",
                  transition: "all 0.15s ease",
                }}>
                {checkout.isPending ? "Redirecting…" : "Start Free — Then $5.99/mo"}
              </button>
            )}

            {isSubscribed && (
              <div style={{ marginTop: 16, textAlign: "center", fontSize: 10,
                fontFamily: SANS, color: GR }}>
                Manage or cancel via Stripe customer portal
              </div>
            )}
          </div>
        </div>

        {/* Trust strip */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8, marginBottom: 16 }}>
          {[
            { label: "Stripe Secure",  sub: "Payment processing" },
            { label: "Cancel Anytime", sub: "No lock-in"         },
            { label: "No Hidden Fees", sub: "Clear pricing"      },
          ].map(({ label, sub }) => (
            <div key={label} style={{ background: CARD, border: `1px solid ${E}`,
              borderRadius: 10, padding: "12px 10px", textAlign: "center" as const }}>
              <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
                color: "rgba(255,255,255,0.80)", marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 8, fontFamily: SANS, color: GR }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 16px", background: CARD,
          border: `1px solid ${E}`, borderRadius: 8 }}>
          <div style={{ fontSize: 9, fontFamily: SANS, color: GR, lineHeight: 1.8 }}>
            Billed monthly via Stripe. Performance fees apply only to closed profitable trades —
            never on unrealised gains. Apex AI Trader never holds funds or requests
            withdrawal access from connected exchanges.
          </div>
        </div>
      </div>
    </div>
  );
}
