import { useMutation } from "@tanstack/react-query";
import { useSubscription, type PaywallReason } from "@/contexts/SubscriptionContext";
import { useDisclaimerGate } from "@/hooks/useDisclaimerGate";
import { api } from "@/lib/api";
import { PERFORMANCE_FEE_LABEL } from "@/lib/fees";

// ── Design tokens ───────────────────────────────────────────────────────────────
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
  "Mobile + web access",
];

const REASON_COPY: Record<NonNullable<PaywallReason>, { title: string; sub: string }> = {
  trial_expired: {
    title: "Subscribe to unlock AI trading",
    sub:   "Paper trading stays free. Subscribe to enable AI autotrading.",
  },
  live_trading: {
    title: "Live trading requires a subscription",
    sub:   "Subscribe to execute real trades with AI automation.",
  },
  feature_locked: {
    title: "Subscription required",
    sub:   "Get full access to AICandlez from $39.99/mo.",
  },
};

export function SubscriptionModal() {
  const { paywallVisible, paywallReason, hidePaywall } = useSubscription();
  const { gate: disclaimerGate, modal: disclaimerModal } = useDisclaimerGate();

  const checkout = useMutation({
    mutationFn: () =>
      api.post<{ url: string }>("/billing/checkout", {
        planId: "starter", billingPeriod: "monthly",
        // BASE_URL-derived for correct return in dev + prod. Task #162 Phase B.
        successUrl: `${window.location.origin}${(import.meta.env.BASE_URL ?? "/").replace(/\/$/, "")}/profile?checkout=success`,
        cancelUrl:  `${window.location.origin}${(import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") || "/"}`,
      }),
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  if (!paywallVisible) return <>{disclaimerModal}</>;

  const copy = REASON_COPY[paywallReason ?? "feature_locked"];

  return (
    <div
      onClick={hidePaywall}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px 20px",
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 400,
          background: CARD,
          border: `1px solid rgba(0,229,255,0.18)`,
          borderRadius: 20,
          overflow: "hidden",
        }}>

        {/* ── Header band ──────────────────────────────────────────────────── */}
        <div style={{
          padding: "24px 24px 20px",
          borderBottom: `1px solid ${E}`,
          background: "rgba(0,229,255,0.03)",
        }}>
          {/* Close */}
          <button
            onClick={hidePaywall}
            style={{
              float: "right", background: "none", border: "none",
              cursor: "pointer", padding: 0,
              fontSize: 18, color: GR, lineHeight: 1,
            }}>
            ×
          </button>

          {/* Price badge */}
          <div style={{ marginBottom: 12 }}>
            <span style={{
              padding: "4px 12px",
              background: "rgba(0,229,255,0.08)",
              border: "1px solid rgba(0,229,255,0.22)",
              borderRadius: 20,
              fontSize: 10, fontFamily: SANS, fontWeight: 600, color: C,
              letterSpacing: "0.05em",
            }}>
              AICandlez
            </span>
          </div>

          <div style={{ fontSize: 20, fontFamily: SANS, fontWeight: 700, color: W,
            marginBottom: 6, lineHeight: 1.2 }}>
            {copy.title}
          </div>
          <div style={{ fontSize: 12, fontFamily: SANS, color: GR, lineHeight: 1.5 }}>
            {copy.sub}
          </div>
        </div>

        {/* ── Pricing ──────────────────────────────────────────────────────── */}
        <div style={{ padding: "18px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 36, fontFamily: MONO, fontWeight: 700, color: W,
              lineHeight: 1 }}>
              $39.99
            </span>
            <span style={{ fontSize: 12, fontFamily: SANS, color: GR }}>/ month</span>
          </div>
          <div style={{ fontSize: 10, fontFamily: SANS,
            color: "rgba(255,180,0,0.78)", marginBottom: 16 }}>
            + {PERFORMANCE_FEE_LABEL} performance fee on profitable closed trades
          </div>

          {/* Plan note — paper trading is free, subscription unlocks AI */}
          <div style={{
            padding: "10px 14px",
            background: "rgba(0,229,255,0.04)",
            border: "1px solid rgba(0,229,255,0.12)",
            borderRadius: 8, marginBottom: 16,
          }}>
            <div style={{ fontSize: 10, fontFamily: SANS, fontWeight: 600,
              color: "rgba(0,229,255,0.80)", marginBottom: 2 }}>
              Paper trading stays free
            </div>
            <div style={{ fontSize: 9, fontFamily: SANS, color: GR, lineHeight: 1.6 }}>
              Subscribe to unlock AI autotrading, ARM LIVE execution, and premium analytics. Cancel anytime.
            </div>
          </div>

          {/* Feature list */}
          <ul style={{ listStyle: "none", margin: "0 0 18px 0", padding: 0 }}>
            {FEATURES.map(f => (
              <li key={f} style={{ display: "flex", gap: 10,
                alignItems: "flex-start", padding: "4px 0" }}>
                <span style={{ fontSize: 10, color: "rgba(0,210,100,0.75)",
                  flexShrink: 0, marginTop: 2 }}>✓</span>
                <span style={{ fontSize: 12, fontFamily: SANS,
                  color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>
                  {f}
                </span>
              </li>
            ))}
          </ul>

          {/* Error */}
          {checkout.isError && (
            <div style={{ background: "rgba(255,51,85,0.07)",
              border: "1px solid rgba(255,51,85,0.22)", borderRadius: 8,
              padding: "10px 14px", marginBottom: 12,
              fontSize: 10, fontFamily: SANS, color: "rgba(255,100,120,0.90)" }}>
              {checkout.error instanceof Error ? checkout.error.message : "Something went wrong. Please try again."}
            </div>
          )}

          {/* CTA */}
          <button
            disabled={checkout.isPending}
            onClick={() => disclaimerGate(() => checkout.mutate())}
            style={{
              width: "100%", padding: "15px 0",
              background: checkout.isPending ? "rgba(0,229,255,0.06)" : "rgba(0,229,255,0.12)",
              border: "1px solid rgba(0,229,255,0.35)",
              borderRadius: 12, color: checkout.isPending ? GR : C,
              fontFamily: SANS, fontSize: 14, fontWeight: 600,
              letterSpacing: "0.03em",
              cursor: checkout.isPending ? "wait" : "pointer",
              transition: "all 0.15s ease",
              marginBottom: 10,
            }}>
            {checkout.isPending ? "Redirecting…" : "Start 7-Day AI Paper Trading Trial"}
          </button>

          {/* Dismiss */}
          <button
            onClick={hidePaywall}
            style={{
              width: "100%", padding: "11px 0",
              background: "transparent", border: "none",
              color: GR, fontFamily: SANS,
              fontSize: 11, cursor: "pointer",
              marginBottom: 20,
            }}>
            Not now
          </button>

          {/* Legal line */}
          <div style={{
            borderTop: `1px solid ${E}`,
            padding: "14px 0",
            fontSize: 8, fontFamily: SANS, color: "rgba(136,146,164,0.60)",
            textAlign: "center", lineHeight: 1.7,
          }}>
            Cancel anytime. Billed monthly via Stripe.
            Withdrawal permissions are never requested from connected exchanges.
          </div>
        </div>
      </div>
      {disclaimerModal}
    </div>
  );
}
