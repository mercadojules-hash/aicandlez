import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api, type Plan } from "@/lib/api";

interface PlansResponse { plans: Plan[] }

export default function Subscribe() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery<PlansResponse>({
    queryKey: ["plans"],
    queryFn:  () => api.get("/billing/plans"),
  });

  const checkout = useMutation({
    mutationFn: (planId: string) =>
      api.post<{ url: string }>("/billing/checkout", {
        planId,
        billingPeriod:  "monthly",
        successUrl: `${window.location.origin}/apex-trader-app/live?checkout=success`,
        cancelUrl:  `${window.location.origin}/apex-trader-app/subscribe`,
      }),
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  const plans = data?.plans ?? [];

  return (
    <div style={{ padding: "16px 16px 80px" }}>
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => setLocation("/live")}
          style={{ background: "none", border: "none", cursor: "pointer",
            fontFamily: "monospace", fontSize: 9, color: "#2a4060",
            letterSpacing: "0.1em", padding: "0 0 8px 0" }}>
          ← BACK TO LIVE
        </button>
        <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
          Unlock Live Trading
        </div>
        <div style={{ fontSize: 11, fontFamily: "system-ui, sans-serif", color: "#3a6080",
          lineHeight: 1.5, marginTop: 6 }}>
          Paper trading is always free. Subscribe to execute real trades.
        </div>
      </div>

      {checkout.isError && (
        <div style={{ background: "#ff444415", border: "1px solid #ff444440",
          borderRadius: 8, padding: "10px 14px", marginBottom: 16,
          fontSize: 11, fontFamily: "monospace", color: "#ff4466" }}>
          {checkout.error instanceof Error ? checkout.error.message : "Checkout failed. Try again."}
        </div>
      )}

      {isLoading && (
        <div style={{ textAlign: "center", padding: 40, fontFamily: "monospace",
          fontSize: 11, color: "#2a4060" }}>LOADING PLANS...</div>
      )}

      {plans.map(plan => (
        <div key={plan.id} style={{
          background:   "#050d18",
          border:       `1px solid ${plan.id !== "free" ? "#00aaff40" : "#0d2035"}`,
          borderRadius: 10,
          padding:      "18px 18px",
          marginBottom: 14,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>
                {plan.name}
              </div>
              {plan.performanceFee !== undefined && plan.performanceFee > 0 && (
                <div style={{ fontSize: 9, fontFamily: "monospace", color: "#ffaa00",
                  marginTop: 2 }}>
                  + {plan.performanceFee}% performance fee on profitable trades
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: "#00aaff" }}>
                {plan.price_monthly === 0 ? "FREE" : `$${plan.price_monthly.toFixed(2)}`}
              </div>
              {plan.price_monthly > 0 && (
                <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a4060" }}>/month</div>
              )}
            </div>
          </div>

          <ul style={{ listStyle: "none", margin: "0 0 14px 0", padding: 0 }}>
            {plan.features.map(f => (
              <li key={f} style={{ display: "flex", gap: 8, alignItems: "flex-start",
                padding: "4px 0" }}>
                <span style={{ color: "#00ff8a", fontSize: 10, flexShrink: 0, marginTop: 1 }}>✓</span>
                <span style={{ fontSize: 11, fontFamily: "system-ui, sans-serif",
                  color: "#6090b0", lineHeight: 1.5 }}>{f}</span>
              </li>
            ))}
          </ul>

          {plan.id !== "free" && (
            <button
              disabled={checkout.isPending}
              onClick={() => checkout.mutate(plan.id)}
              style={{
                width:        "100%",
                padding:      "12px 0",
                background:   "#00aaff18",
                border:       "1px solid #00aaff60",
                borderRadius: 8,
                color:        "#00aaff",
                fontFamily:   "monospace",
                fontSize:     12,
                fontWeight:   700,
                letterSpacing: "0.1em",
                cursor:       checkout.isPending ? "wait" : "pointer",
              }}>
              {checkout.isPending ? "REDIRECTING..." : `SUBSCRIBE — $${plan.price_monthly}/MO`}
            </button>
          )}
        </div>
      ))}

      <div style={{ marginTop: 8, padding: "10px 14px", background: "#050d18",
        border: "1px solid #0d2035", borderRadius: 6 }}>
        <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e3a50",
          letterSpacing: "0.08em", lineHeight: 1.6 }}>
          Subscriptions are billed monthly. Cancel any time. Powered by Stripe.
          Apex Trader never requests withdrawal permissions from your exchange.
        </div>
      </div>
    </div>
  );
}
