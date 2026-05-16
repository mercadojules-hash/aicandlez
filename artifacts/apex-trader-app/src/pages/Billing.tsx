import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api, type Subscription } from "@/lib/api";

// ── Design tokens ───────────────────────────────────────────────────────────────
const BG   = "#000000";
const CARD = "#0d151e";
const E    = "rgba(255,255,255,0.07)";
const C    = "#00e5ff";
const P    = "#9b5cf5";
const W    = "#ffffff";
const GR   = "#8892a4";
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
const MONO = "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Roboto Mono', monospace";

// ── Static plan definitions ─────────────────────────────────────────────────────
const PLANS = [
  {
    id:             "free",
    name:           "Free",
    price:          0,
    perfFee:        null as null | number,
    accent:         "rgba(255,255,255,0.25)",
    accentBg:       "rgba(255,255,255,0.03)",
    accentBorder:   E,
    cta:            null as string | null,
    features: [
      "Paper trading (unlimited)",
      "AI market scanner — 18 assets",
      "Signal intelligence dashboard",
      "Trade journal & analytics",
      "Portfolio performance tracking",
      "Mobile & web access",
    ],
  },
  {
    id:             "starter",
    name:           "Starter",
    price:          5.99,
    perfFee:        2,
    accent:         C,
    accentBg:       "rgba(0,229,255,0.05)",
    accentBorder:   "rgba(0,229,255,0.22)",
    cta:            "Start 7-Day Free Trial",
    features: [
      "Everything in Free",
      "Live trading on 1 exchange",
      "AI auto-execution engine",
      "Real-time trade alerts",
      "Advanced AI signal analytics",
      "Priority signal processing",
      "Stop-loss & take-profit automation",
    ],
  },
  {
    id:             "pro",
    name:           "Pro",
    price:          19.99,
    perfFee:        1,
    accent:         P,
    accentBg:       "rgba(155,92,245,0.05)",
    accentBorder:   "rgba(155,92,245,0.22)",
    cta:            "Upgrade to Pro",
    features: [
      "Everything in Starter",
      "Multi-exchange routing",
      "Institutional AI models",
      "Portfolio intelligence engine",
      "Advanced risk management suite",
      "Priority support",
      "Custom signal thresholds",
      "Unlimited trade history export",
    ],
  },
];

// ── Plan card ────────────────────────────────────────────────────────────────────
function PlanCard({
  plan, isCurrent, onUpgrade, loading,
}: {
  plan: typeof PLANS[0];
  isCurrent: boolean;
  onUpgrade: (id: string) => void;
  loading: boolean;
}) {
  const { accent, accentBg, accentBorder } = plan;

  return (
    <div style={{ background: isCurrent ? accentBg : CARD,
      border: `1px solid ${isCurrent ? accentBorder : E}`,
      borderRadius: 14, overflow: "hidden", marginBottom: 14 }}>

      {/* Card header */}
      <div style={{ padding: "18px 18px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 16, fontFamily: SANS, fontWeight: 700, color: W }}>
                {plan.name}
              </span>
              {isCurrent && (
                <span style={{ padding: "2px 8px",
                  background: accent + "18", border: `1px solid ${accent}35`,
                  borderRadius: 4, fontSize: 8, fontFamily: SANS, fontWeight: 600,
                  color: accent, letterSpacing: "0.06em" }}>
                  Current Plan
                </span>
              )}
            </div>
            {plan.perfFee && (
              <div style={{ fontSize: 9, fontFamily: SANS, color: "rgba(255,180,0,0.78)" }}>
                + {plan.perfFee}% performance fee on profitable trades
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 24, fontFamily: MONO, fontWeight: 700, color: accent,
              lineHeight: 1 }}>
              {plan.price === 0 ? "Free" : `$${plan.price}`}
            </div>
            {plan.price > 0 && (
              <div style={{ fontSize: 9, fontFamily: SANS, color: GR, marginTop: 3 }}>/ month</div>
            )}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: E, margin: "14px 0" }}/>

      {/* Feature list */}
      <div style={{ padding: "0 18px 18px" }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {plan.features.map(f => (
            <li key={f} style={{ display: "flex", gap: 10, alignItems: "flex-start",
              padding: "5px 0" }}>
              <span style={{ fontSize: 10, color: accent + "c0",
                flexShrink: 0, marginTop: 2 }}>✓</span>
              <span style={{ fontSize: 12, fontFamily: SANS, color: "rgba(255,255,255,0.75)",
                lineHeight: 1.5 }}>
                {f}
              </span>
            </li>
          ))}
        </ul>

        {/* CTA button */}
        {plan.cta && !isCurrent && (
          <button
            disabled={loading}
            onClick={() => onUpgrade(plan.id)}
            style={{ width: "100%", marginTop: 16, padding: "14px 0",
              background: accent + "12",
              border: `1px solid ${accent}40`,
              borderRadius: 10, color: loading ? GR : accent,
              fontFamily: SANS, fontSize: 13, fontWeight: 600,
              letterSpacing: "0.03em",
              cursor: loading ? "wait" : "pointer",
              transition: "all 0.15s ease" }}>
            {loading ? "Redirecting…" : plan.cta}
          </button>
        )}
        {isCurrent && plan.price > 0 && (
          <div style={{ marginTop: 14, textAlign: "center", fontSize: 9,
            fontFamily: SANS, color: GR }}>
            Renews monthly · Cancel anytime
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────────
export default function Billing() {
  const [, setLocation] = useLocation();

  const { data: sub } = useQuery<Subscription>({
    queryKey:  ["subscription"],
    queryFn:   () => api.get("/billing/subscription"),
    staleTime: 60_000,
  });

  const checkout = useMutation({
    mutationFn: (planId: string) =>
      api.post<{ url: string }>("/billing/checkout", {
        planId,
        billingPeriod: "monthly",
        successUrl: `${window.location.origin}/apex-trader-app/profile?checkout=success`,
        cancelUrl:  `${window.location.origin}/apex-trader-app/billing`,
      }),
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  const currentPlan = sub?.plan ?? "free";

  return (
    <div className="page-enter" style={{ background: BG, minHeight: "100%", paddingBottom: 32 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: "18px 20px 20px",
        borderBottom: `1px solid ${E}` }}>
        <button onClick={() => setLocation("/profile")} style={{
          background: "none", border: "none", cursor: "pointer",
          fontFamily: SANS, fontSize: 10, fontWeight: 500,
          color: GR, letterSpacing: "0.04em",
          padding: "0 0 10px 0", display: "block",
        }}>
          ← Profile
        </button>
        <div style={{ fontSize: 22, fontFamily: SANS, fontWeight: 700, color: W }}>
          Plans & Billing
        </div>
        <div style={{ fontSize: 11, fontFamily: SANS, color: GR, marginTop: 5, lineHeight: 1.5 }}>
          Paper trading is always free. Subscribe for live AI execution.
        </div>
      </div>

      <div style={{ padding: "20px 16px 0" }}>

        {/* Checkout error */}
        {checkout.isError && (
          <div style={{ background: "rgba(255,51,85,0.07)",
            border: "1px solid rgba(255,51,85,0.22)",
            borderRadius: 8, padding: "10px 14px", marginBottom: 16,
            fontSize: 10, fontFamily: SANS, color: "rgba(255,100,120,0.90)" }}>
            {checkout.error instanceof Error ? checkout.error.message : "Checkout failed. Please try again."}
          </div>
        )}

        {/* Plan cards */}
        {PLANS.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={currentPlan === plan.id}
            onUpgrade={id => checkout.mutate(id)}
            loading={checkout.isPending}
          />
        ))}

        {/* Trust strip */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8, marginBottom: 16 }}>
          {[
            { icon: "🔒", label: "Stripe Secure",  sub: "Payment processing" },
            { icon: "↩",  label: "Cancel Anytime", sub: "No lock-in"         },
            { icon: "✓",  label: "No Hidden Fees", sub: "Clear pricing"      },
          ].map(({ icon, label, sub }) => (
            <div key={label} style={{ background: CARD, border: `1px solid ${E}`,
              borderRadius: 10, padding: "12px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 16, marginBottom: 6 }}>{icon}</div>
              <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
                color: W, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 8, fontFamily: SANS, color: GR }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div style={{ padding: "12px 16px", background: CARD,
          border: `1px solid ${E}`, borderRadius: 8 }}>
          <div style={{ fontSize: 9, fontFamily: SANS, color: GR, lineHeight: 1.8 }}>
            Subscriptions billed monthly via Stripe. Performance fees apply only to closed profitable trades.
            Apex AI Trader never holds funds or requests withdrawal access from connected exchanges.
          </div>
        </div>
      </div>
    </div>
  );
}
