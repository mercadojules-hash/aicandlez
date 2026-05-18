import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api, type Plan, type Subscription } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";

interface PlansResponse { plans: Plan[] }

// ── Design tokens (locked to the Signals/Crypto/Equities neon-green system) ──
const BG       = "#000000";
const CARD     = "#0A1410";
const CARD_HI  = "#0F1F18";
const E        = "rgba(255,255,255,0.07)";
const BRAND    = "#66FF66";
const BRAND_DEEP = "#00C853";
const BRAND_BRGT = "#7CFF00";
const W        = "#E8F5EC";
const GR       = "#8A9C94";
const DIM      = "#5A726A";
const SANS     = "'SF Pro Display','Inter',system-ui,-apple-system,sans-serif";
const MONO     = "'SF Mono','JetBrains Mono','Roboto Mono',Consolas,monospace";

// Plan visual configuration keyed by backend plan id.
// Visual hierarchy: free → ai_trading → ai_trading_pro (left → right elevation).
const VISUAL: Record<string, {
  label:        string;
  caption:      string;
  badge:        string;            // FREE | ACTIVE | UPGRADE
  glow:         string;            // outer glow colour
  border:       string;            // base border colour
  borderActive: string;            // border colour when current plan
  accent:       string;            // tier accent
  capacity:     string;            // “6 Concurrent AI Trades” style label
  elite?:       boolean;
}> = {
  free: {
    label: "Paper Trading", caption: "Signals + paper trading. No live execution.",
    badge: "FREE",
    glow:         "rgba(255,255,255,0.04)",
    border:       "rgba(255,255,255,0.10)",
    borderActive: "rgba(255,255,255,0.30)",
    accent:       "rgba(232,245,236,0.85)",
    capacity:     "Simulated only",
  },
  starter: {
    label: "AI Trading", caption: "Live AI execution. Crypto. AI Auto Trade.",
    badge: "ACTIVE",
    glow:         "rgba(102,255,102,0.22)",
    border:       "rgba(102,255,102,0.28)",
    borderActive: "rgba(102,255,102,0.65)",
    accent:       BRAND,
    capacity:     "3 Concurrent AI Trades",
  },
  pro: {
    label: "AI Trading Pro", caption: "Expanded AI capacity. Crypto + Equities. Priority execution.",
    badge: "UPGRADE",
    glow:         "rgba(124,255,0,0.36)",
    border:       "rgba(124,255,0,0.38)",
    borderActive: "rgba(124,255,0,0.75)",
    accent:       BRAND_BRGT,
    capacity:     "12 Concurrent AI Trades",
    elite:        true,
  },
};

// Display order — visual upgrade ladder.
const ORDER = ["free", "starter", "pro"];

export default function Subscribe() {
  const [, setLocation] = useLocation();

  const { data: plansData, isLoading: plansLoading } = useQuery<PlansResponse>({
    queryKey: ["plans"],
    queryFn:  () => api.get("/billing/plans"),
  });

  const { data: sub } = useQuery<Subscription>({
    queryKey: ["subscription"],
    queryFn:  () => api.get("/billing/subscription"),
    staleTime: 30_000,
    retry: 1,
  });

  const checkout = useMutation({
    mutationFn: (planId: string) =>
      api.post<{ url: string }>("/billing/checkout", {
        planId, billingPeriod: "monthly",
        successUrl: `${window.location.origin}/aicandlez-app/profile?checkout=success`,
        cancelUrl:  `${window.location.origin}/aicandlez-app/subscribe`,
      }),
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  const portal = useMutation({
    mutationFn: () => api.post<{ url: string }>("/billing/portal", {}),
    onSuccess:  ({ url }) => { window.location.href = url; },
  });

  const currentPlan = sub?.plan ?? "free";
  const plansById   = new Map((plansData?.plans ?? []).map(p => [p.id, p]));
  const orderedPlans = ORDER.map(id => plansById.get(id)).filter(Boolean) as Plan[];

  // For a Free user, AI Trading shows "UPGRADE", Pro shows "UPGRADE".
  // For an AI Trading user, Pro shows "UPGRADE", AI Trading shows "ACTIVE".
  // For a Pro user, AI Trading shows "DOWNGRADE", Pro shows "ACTIVE".
  function badgeFor(planId: string): { text: string; tone: "neutral" | "active" | "upgrade" } {
    if (planId === currentPlan && sub?.isActive) return { text: "ACTIVE", tone: "active" };
    if (planId === "free")                       return { text: "FREE",   tone: "neutral" };
    const order = ORDER.indexOf(planId);
    const cur   = ORDER.indexOf(currentPlan);
    if (order > cur)  return { text: "UPGRADE",  tone: "upgrade" };
    return { text: "DOWNGRADE", tone: "neutral" };
  }

  return (
    <div className="page-enter" style={{ background: BG, minHeight: "100%", paddingBottom: 96 }}>

      <PageHeader title="Membership" caption="ACCESS · CAPACITY · AI POWER"/>

      {/* ── Subhead ──────────────────────────────────────────────────────── */}
      <div style={{ padding: "12px 16px 18px" }}>
        <div style={{ fontSize: 22, fontFamily: SANS, fontWeight: 700, color: W,
          letterSpacing: -0.4, lineHeight: 1.15, marginBottom: 6 }}>
          Unlock Live AI Trading
        </div>
        <div style={{ fontSize: 12.5, fontFamily: SANS, color: GR, lineHeight: 1.5 }}>
          Free Paper Trading is included. Subscribe to enable Live AI execution
          and AI Auto Trade. Upgrade for expanded AI capacity and equities.
        </div>
      </div>

      {/* ── Upgrade ladder visualization ─────────────────────────────────── */}
      <div style={{ padding: "0 16px 18px" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 8, padding: "12px 14px",
          background: CARD, border: `1px solid ${E}`, borderRadius: 12,
        }}>
          {ORDER.map((id, i) => {
            const v       = VISUAL[id]!;
            const reached = ORDER.indexOf(currentPlan) >= i;
            const active  = id === currentPlan;
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", flex: i === ORDER.length - 1 ? 0 : 1, gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: active ? v.accent : reached ? "rgba(102,255,102,0.22)" : "rgba(255,255,255,0.06)",
                    border: `1.5px solid ${active ? v.accent : reached ? "rgba(102,255,102,0.45)" : "rgba(255,255,255,0.12)"}`,
                    boxShadow: active ? `0 0 14px ${v.glow}` : "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontFamily: MONO, fontWeight: 800,
                    color: active ? "#001b06" : reached ? BRAND : DIM,
                  }}>{i + 1}</div>
                  <div style={{ fontSize: 8, fontFamily: SANS, fontWeight: 600,
                    color: active ? v.accent : reached ? GR : DIM,
                    letterSpacing: 0.6, textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>
                    {id === "free" ? "Free" : id === "starter" ? "AI Trading" : "Pro"}
                  </div>
                </div>
                {i < ORDER.length - 1 && (
                  <div style={{ flex: 1, height: 2, borderRadius: 1,
                    background: ORDER.indexOf(currentPlan) > i
                      ? `linear-gradient(90deg, ${BRAND} 0%, rgba(102,255,102,0.25) 100%)`
                      : "rgba(255,255,255,0.06)" }}/>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {checkout.isError && (
        <div style={{ margin: "0 16px 12px", padding: "10px 14px",
          background: "rgba(255,68,68,0.08)", border: "1px solid rgba(255,68,68,0.35)",
          borderRadius: 10, fontSize: 11.5, fontFamily: SANS, color: "#ff7088" }}>
          {checkout.error instanceof Error ? checkout.error.message : "Checkout failed. Try again."}
        </div>
      )}

      {plansLoading && (
        <div style={{ textAlign: "center", padding: 40, fontFamily: MONO, fontSize: 11, color: DIM,
          letterSpacing: "0.18em" }}>LOADING PLANS…</div>
      )}

      {/* ── Plan cards (3-tier neon-green hierarchy) ─────────────────────── */}
      <div style={{ padding: "0 16px" }}>
        {orderedPlans.map(plan => {
          const v       = VISUAL[plan.id] ?? VISUAL["free"]!;
          const active  = plan.id === currentPlan && (sub?.isActive ?? false);
          const b       = badgeFor(plan.id);
          const priceUsd = plan.price_monthly === 0 ? "Free" : `$${(plan.price_monthly / 100).toFixed(2)}`;

          return (
            <div key={plan.id} style={{
              position: "relative",
              marginBottom: 14,
              background: v.elite
                ? `linear-gradient(160deg, ${CARD_HI} 0%, ${CARD} 60%)`
                : CARD,
              border: `1px solid ${active ? v.borderActive : v.border}`,
              borderRadius: 16,
              padding: "18px 18px 16px",
              boxShadow: active
                ? `0 0 0 1px ${v.borderActive} inset, 0 18px 44px ${v.glow}`
                : v.elite
                  ? `0 14px 36px ${v.glow}`
                  : "none",
              overflow: "hidden",
            }}>
              {/* Elite top sweep */}
              {v.elite && (
                <div aria-hidden style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 1,
                  background: `linear-gradient(90deg, transparent 0%, ${BRAND_BRGT} 50%, transparent 100%)`,
                  opacity: 0.7,
                }}/>
              )}

              {/* ── Header row ─────────────────────────────────────────── */}
              <div style={{ display: "flex", justifyContent: "space-between",
                alignItems: "flex-start", marginBottom: 12, gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 17, fontFamily: SANS, fontWeight: 700,
                      color: W, letterSpacing: -0.2 }}>{plan.name}</span>
                    <span style={{
                      padding: "2px 8px",
                      background:
                        b.tone === "active"  ? "rgba(102,255,102,0.16)" :
                        b.tone === "upgrade" ? "rgba(124,255,0,0.14)"   :
                                               "rgba(255,255,255,0.06)",
                      border: `1px solid ${
                        b.tone === "active"  ? "rgba(102,255,102,0.45)" :
                        b.tone === "upgrade" ? "rgba(124,255,0,0.40)"   :
                                               "rgba(255,255,255,0.14)"}`,
                      color:
                        b.tone === "active"  ? BRAND        :
                        b.tone === "upgrade" ? BRAND_BRGT   :
                                               "rgba(232,245,236,0.75)",
                      borderRadius: 4, fontSize: 8.5, fontFamily: SANS, fontWeight: 700,
                      letterSpacing: "0.10em", textTransform: "uppercase" as const,
                    }}>{b.text}</span>
                  </div>
                  <div style={{ fontSize: 11.5, fontFamily: SANS, color: GR,
                    lineHeight: 1.45 }}>{v.caption}</div>
                </div>
                <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                  <div style={{
                    fontSize: 24, fontFamily: SANS, fontWeight: 800,
                    color: plan.id === "free" ? W : v.accent,
                    letterSpacing: -0.8, lineHeight: 1,
                    textShadow: plan.id === "pro" ? `0 0 18px ${v.glow}` : "none",
                  }}>{priceUsd}</div>
                  {plan.price_monthly > 0 && (
                    <div style={{ fontSize: 9.5, fontFamily: SANS, color: DIM,
                      marginTop: 2, letterSpacing: 0.4 }}>/month</div>
                  )}
                </div>
              </div>

              {/* ── Capacity pill ─────────────────────────────────────── */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "8px 12px", marginBottom: 14,
                background: plan.id === "free"
                  ? "rgba(255,255,255,0.04)"
                  : `rgba(102,255,102,0.08)`,
                border: `1px solid ${plan.id === "free" ? "rgba(255,255,255,0.10)" : "rgba(102,255,102,0.24)"}`,
                borderRadius: 999,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%",
                  background: plan.id === "free" ? DIM : v.accent,
                  boxShadow: plan.id === "free" ? "none" : `0 0 8px ${v.accent}` }}/>
                <span style={{ fontSize: 10.5, fontFamily: SANS, fontWeight: 700,
                  color: plan.id === "free" ? GR : v.accent,
                  letterSpacing: 0.6, textTransform: "uppercase" as const }}>
                  {v.capacity}
                </span>
              </div>

              {/* ── Features list ─────────────────────────────────────── */}
              <ul style={{ listStyle: "none", margin: 0, padding: 0, marginBottom: 14 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display: "flex", gap: 10, alignItems: "flex-start",
                    padding: "5px 0" }}>
                    <span style={{
                      width: 14, height: 14, flexShrink: 0, marginTop: 2,
                      borderRadius: "50%",
                      background: plan.id === "free"
                        ? "rgba(255,255,255,0.06)"
                        : `rgba(102,255,102,0.14)`,
                      border: `1px solid ${plan.id === "free" ? "rgba(255,255,255,0.14)" : "rgba(102,255,102,0.35)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 800, lineHeight: 1,
                      color: plan.id === "free" ? GR : v.accent,
                    }}>✓</span>
                    <span style={{ fontSize: 12, fontFamily: SANS, color: "rgba(232,245,236,0.82)",
                      lineHeight: 1.5 }}>{f}</span>
                  </li>
                ))}
              </ul>

              {plan.performanceFee !== undefined && plan.performanceFee > 0 && (
                <div style={{ fontSize: 10, fontFamily: SANS, color: "rgba(255,210,0,0.85)",
                  marginBottom: 12, letterSpacing: 0.2 }}>
                  + {(plan.performanceFee * 100).toFixed(0)}% performance fee on profitable trades only
                </div>
              )}

              {/* ── CTA ───────────────────────────────────────────────── */}
              {plan.id === "free" && currentPlan === "free" && (
                <button
                  disabled
                  style={{
                    width: "100%", padding: "13px 0", borderRadius: 12,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: GR, fontFamily: SANS, fontSize: 12.5, fontWeight: 700,
                    letterSpacing: 0.6, textTransform: "uppercase" as const,
                    cursor: "default",
                  }}>Current Plan</button>
              )}

              {plan.id !== "free" && active && (
                <button
                  onClick={() => portal.mutate()}
                  disabled={portal.isPending}
                  style={{
                    width: "100%", padding: "13px 0", borderRadius: 12,
                    background: "rgba(102,255,102,0.06)",
                    border: `1px solid rgba(102,255,102,0.30)`,
                    color: BRAND, fontFamily: SANS, fontSize: 12.5, fontWeight: 700,
                    letterSpacing: 0.6, textTransform: "uppercase" as const,
                    cursor: portal.isPending ? "wait" : "pointer",
                  }}>{portal.isPending ? "Opening Portal…" : "Manage Billing"}</button>
              )}

              {plan.id !== "free" && !active && (
                <button
                  onClick={() => checkout.mutate(plan.id)}
                  disabled={checkout.isPending}
                  title={!plan.priceIds.monthly
                    ? "Stripe price not yet synced — backend will resolve by planId."
                    : undefined}
                  style={{
                    position: "relative", overflow: "hidden",
                    width: "100%", padding: "14px 0", borderRadius: 12,
                    background: v.elite
                      ? `linear-gradient(135deg, ${BRAND_DEEP} 0%, ${BRAND} 50%, ${BRAND_BRGT} 100%)`
                      : `linear-gradient(135deg, ${BRAND_DEEP} 0%, ${BRAND} 100%)`,
                    border: `1px solid ${v.elite ? BRAND_BRGT : BRAND}`,
                    color: "#001b06",
                    fontFamily: SANS, fontSize: 13, fontWeight: 800,
                    letterSpacing: 0.6, textTransform: "uppercase" as const,
                    cursor: checkout.isPending ? "wait" : "pointer",
                    boxShadow: `0 10px 30px ${v.glow}, 0 1px 0 rgba(255,255,255,0.45) inset`,
                  }}>
                  {checkout.isPending
                    ? "Redirecting…"
                    : currentPlan === "free"
                      ? `Start ${plan.name} — ${priceUsd}/mo`
                      : `Upgrade to ${plan.name} — ${priceUsd}/mo`}
                  <span aria-hidden style={{
                    position: "absolute", top: 0, left: "-30%", height: "100%", width: "30%",
                    background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.30) 50%, transparent 100%)",
                    animation: "edge-sweep 4.5s ease-in-out infinite",
                  }}/>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footnote ─────────────────────────────────────────────────────── */}
      <div style={{ margin: "10px 16px 0", padding: "12px 14px",
        background: CARD, border: `1px solid ${E}`, borderRadius: 10 }}>
        <div style={{ fontSize: 9.5, fontFamily: SANS, color: DIM,
          letterSpacing: 0.2, lineHeight: 1.6 }}>
          Subscriptions are billed monthly · Cancel anytime · Secured by Stripe ·
          AICandlez never requests withdrawal permissions from your exchange.
        </div>
        <button
          onClick={() => setLocation("/profile")}
          style={{
            marginTop: 10, background: "none", border: "none", cursor: "pointer",
            fontFamily: SANS, fontSize: 10.5, color: GR,
            letterSpacing: 0.4, padding: 0,
          }}>← Back to Profile</button>
      </div>
    </div>
  );
}
