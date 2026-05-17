import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Check, CreditCard, Loader2, Sparkles, Zap, Building2,
  ChevronRight, Star, AlertTriangle, ExternalLink,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlanLimit { exchanges: number | string; positions: number | string; trades: number | string; liveTrading: boolean }
interface Plan {
  id: string; name: string; price_monthly: number | null; price_yearly: number | null;
  description: string; features: string[]; limits: PlanLimit;
  priceIds: { monthly?: string; yearly?: string };
}
interface Subscription {
  plan: string; planStatus: string | null; stripeCustomerId: string | null;
  stripeSubscriptionId: string | null; trialEndsAt: string | null;
  limits: PlanLimit; features: string[];
  isActive?: boolean; isPaid?: boolean; isTrialing?: boolean;
  canLiveTrade?: boolean; daysUntilTrialEnd?: number | null;
}

// ── Plan icon mapping ─────────────────────────────────────────────────────────

const PLAN_ICONS: Record<string, React.ElementType> = {
  free:       Zap,
  starter:    Star,
  pro:        Sparkles,
  enterprise: Building2,
};

const PLAN_COLORS: Record<string, string> = {
  free:       "#4a6a80",
  starter:    "#00cc88",
  pro:        "#00aaff",
  enterprise: "#cc55ff",
};

// ── Plan Card ─────────────────────────────────────────────────────────────────

function PlanCard({
  plan, current, billing, onUpgrade, loading,
}: {
  plan: Plan; current: string; billing: "monthly" | "yearly";
  onUpgrade: (priceId: string) => void; loading: boolean;
}) {
  const isCurrent = plan.id === current;
  const Icon      = PLAN_ICONS[plan.id] ?? Zap;
  const color     = PLAN_COLORS[plan.id] ?? "#4a6a80";
  const priceId   = billing === "monthly" ? plan.priceIds.monthly : plan.priceIds.yearly;
  const amount    = billing === "monthly" ? plan.price_monthly : plan.price_yearly;
  const monthly   = billing === "yearly" && plan.price_yearly
    ? Math.round(plan.price_yearly / 12)
    : plan.price_monthly;

  const isFree = plan.id === "free";

  return (
    <div
      className="rounded border flex flex-col gap-4 p-5 transition-all relative"
      style={{
        background:   isCurrent ? `${color}08` : "#010C18",
        borderColor:  isCurrent ? `${color}40` : "#0D2035",
        boxShadow:    isCurrent ? `0 0 20px ${color}10` : "none",
      }}
    >
      {isCurrent && (
        <div
          className="absolute top-3 right-3 font-mono text-[8px] px-2 py-0.5 rounded tracking-widest"
          style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
        >
          CURRENT
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 shrink-0" style={{ color, filter: `drop-shadow(0 0 6px ${color}60)` }} />
        <div>
          <div className="font-mono text-[13px] font-bold" style={{ color: "#EAF2FF" }}>{plan.name}</div>
          <div className="font-mono text-[9px]" style={{ color: "#3a5a70" }}>{plan.description}</div>
        </div>
      </div>

      {/* Price */}
      <div>
        {isFree ? (
          <div className="font-mono text-[28px] font-bold" style={{ color: "#EAF2FF" }}>
            $0<span className="text-[12px] font-normal" style={{ color: "#3a5a70" }}>/mo</span>
          </div>
        ) : (
          <>
            <div className="font-mono text-[28px] font-bold" style={{ color: "#EAF2FF" }}>
              ${monthly !== null ? (monthly / 100).toFixed(0) : "—"}
              <span className="text-[12px] font-normal" style={{ color: "#3a5a70" }}>/mo</span>
            </div>
            {billing === "yearly" && amount !== null && (
              <div className="font-mono text-[9px] mt-0.5" style={{ color: "#4a8a4a" }}>
                ${(amount / 100).toFixed(0)}/year — 2 months free
              </div>
            )}
            <div className="font-mono text-[8px] mt-1" style={{ color: "#3a5a70" }}>
              7-day free AI paper trading trial
            </div>
          </>
        )}
      </div>

      {/* Features */}
      <div className="grid gap-1.5 flex-1">
        {plan.features.map((f, i) => (
          <div key={i} className="flex items-start gap-2">
            <Check className="w-3 h-3 shrink-0 mt-0.5" style={{ color }} />
            <span className="font-mono text-[10px]" style={{ color: "#7ab8cc" }}>{f}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      {isCurrent ? (
        <div
          className="w-full py-2 rounded font-mono text-[10px] text-center"
          style={{ background: `${color}10`, border: `1px solid ${color}20`, color: `${color}` }}
        >
          Active plan
        </div>
      ) : isFree ? (
        <div
          className="w-full py-2 rounded font-mono text-[10px] text-center"
          style={{ background: "#010C18", border: "1px solid #1a3a50", color: "#3a5a70" }}
        >
          Your base plan
        </div>
      ) : (
        <button
          onClick={() => priceId && onUpgrade(priceId)}
          disabled={loading || !priceId}
          className="w-full py-2 rounded font-mono text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all"
          style={{
            background: `${color}18`,
            border:     `1px solid ${color}60`,
            color,
            opacity:    loading || !priceId ? 0.6 : 1,
          }}
        >
          {loading
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Processing…</>
            : <><ChevronRight className="w-3 h-3" /> Upgrade to {plan.name}</>
          }
        </button>
      )}
    </div>
  );
}

// ── Main Billing Page ─────────────────────────────────────────────────────────

export default function Billing() {
  const [plans,        setPlans]        = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [billing,      setBilling]      = useState<"monthly" | "yearly">("monthly");
  const [loadingPlan,  setLoadingPlan]  = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [, setLocation] = useLocation();

  // Detect success/cancel query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success")) {
      // Refetch subscription after successful checkout
      setTimeout(loadSubscription, 2000);
    }
  }, []);

  useEffect(() => {
    loadPlans();
    loadSubscription();
  }, []);

  async function loadPlans() {
    try {
      const r    = await fetch("/api/billing/plans");
      const data = await r.json() as { plans?: Plan[] };
      if (data.plans) setPlans(data.plans);
    } catch {
      setError("Failed to load plans");
    }
  }

  async function loadSubscription() {
    try {
      const r    = await fetch("/api/billing/subscription");
      const data = await r.json() as Subscription & { error?: string };
      if (!data.error) setSubscription(data);
    } catch { /* ignore */ }
  }

  async function handleUpgrade(priceId: string) {
    setLoadingPlan(priceId);
    setError(null);
    try {
      const r    = await fetch("/api/billing/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ priceId }),
      });
      const data = await r.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Failed to create checkout session");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoadingPlan(null);
    }
  }

  async function handlePortal() {
    setLoadingPlan("portal");
    try {
      const r    = await fetch("/api/billing/portal", { method: "POST" });
      const data = await r.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Failed to open billing portal");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoadingPlan(null);
    }
  }

  const currentPlan = subscription?.plan ?? "free";
  const params      = new URLSearchParams(window.location.search);
  const checkoutOk  = params.get("success") === "1";
  const checkoutCancel = params.get("canceled") === "1";

  return (
    <div
      className="min-h-screen p-6"
      style={{ background: "#060810", color: "#EAF2FF" }}
    >
      <div className="max-w-5xl mx-auto grid gap-6">

        {/* Header */}
        <div>
          <div className="font-mono text-[11px] tracking-[0.3em]" style={{ color: "#3a5a70" }}>
            BILLING &amp; SUBSCRIPTION
          </div>
          <h1 className="font-mono text-[22px] font-bold mt-1" style={{ color: "#EAF2FF" }}>
            Choose your plan
          </h1>
          <p className="font-mono text-[11px] mt-1" style={{ color: "#4a6a80" }}>
            Start with a 7-day free AI paper trading trial. Cancel anytime.
          </p>
        </div>

        {/* Success / cancel banners */}
        {checkoutOk && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded border font-mono text-[11px]"
            style={{ background: "#0a1a0a", borderColor: "#00ff8a30", color: "#00ff8a" }}
          >
            <Check className="w-3.5 h-3.5 shrink-0" />
            Subscription activated! Your plan will update shortly.
          </div>
        )}
        {checkoutCancel && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded border font-mono text-[11px]"
            style={{ background: "#1a0d0d", borderColor: "#ff445530", color: "#ff8844" }}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Checkout was canceled. Your current plan is unchanged.
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded border font-mono text-[11px]"
            style={{ background: "#1a050a", borderColor: "#ff445530", color: "#ff4455" }}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Trial countdown / status banner */}
        {subscription && (
          subscription.isTrialing ? (
            <div
              className="flex items-center justify-between gap-4 px-4 py-3 rounded border"
              style={{
                background:   (subscription.daysUntilTrialEnd ?? 99) <= 3 ? "#1a0d0a" : "#011018",
                borderColor:  (subscription.daysUntilTrialEnd ?? 99) <= 3 ? "#ff884430" : "#00aaff25",
              }}
            >
              <div>
                <div className="font-mono text-[9px] font-bold tracking-wider mb-0.5"
                  style={{ color: (subscription.daysUntilTrialEnd ?? 99) <= 3 ? "#ff8844" : "#00aaff" }}>
                  TRIAL ACTIVE
                </div>
                <div className="font-mono text-[12px] font-bold" style={{ color: "#EAF2FF" }}>
                  {subscription.daysUntilTrialEnd === 0
                    ? "Trial ends today"
                    : `${subscription.daysUntilTrialEnd ?? 0} days remaining`}
                </div>
              </div>
              <div className="font-mono text-[9px] font-bold px-3 py-1.5 rounded"
                style={{ background: "#00aaff15", border: "1px solid #00aaff30", color: "#00aaff" }}>
                Subscribe now
              </div>
            </div>
          ) : !subscription.isActive && subscription.plan !== "free" ? (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded border font-mono text-[11px]"
              style={{ background: "#1a0d0d", borderColor: "#ff445530", color: "#ff8844" }}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Subscription issue — please update your billing details
            </div>
          ) : null
        )}

        {/* Current subscription banner */}
        {subscription && subscription.stripeSubscriptionId && (
          <div
            className="flex items-center justify-between gap-4 px-4 py-3 rounded border"
            style={{ background: "#010C18", borderColor: "#0D2035" }}
          >
            <div>
              <div className="font-mono text-[9px] font-bold tracking-wider mb-0.5" style={{ color: "#4a6a80" }}>
                ACTIVE SUBSCRIPTION
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-3 h-3" style={{ color: "#00aaff" }} />
                <span className="font-mono text-[12px] font-bold" style={{ color: "#EAF2FF" }}>
                  {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} Plan
                </span>
                <span
                  className="font-mono text-[8px] px-1.5 py-0.5 rounded"
                  style={{
                    background: subscription.planStatus === "active" ? "#0a1a0a" : "#1a0a0a",
                    color:      subscription.planStatus === "active" ? "#00ff8a" : "#ff8844",
                    border:     `1px solid ${subscription.planStatus === "active" ? "#00ff8a30" : "#ff884430"}`,
                  }}
                >
                  {(subscription.planStatus ?? "none").toUpperCase()}
                </span>
              </div>
            </div>
            <button
              onClick={handlePortal}
              disabled={loadingPlan === "portal"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-[10px] transition-all"
              style={{ background: "#020E1C", borderColor: "#1a3a50", color: "#7ab8cc" }}
            >
              {loadingPlan === "portal"
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <ExternalLink className="w-3 h-3" />
              }
              Manage Billing
            </button>
          </div>
        )}

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setBilling("monthly")}
            className="font-mono text-[10px] px-4 py-1.5 rounded transition-all"
            style={{
              background:  billing === "monthly" ? "#00aaff18" : "transparent",
              border:      `1px solid ${billing === "monthly" ? "#00aaff40" : "#1a3a50"}`,
              color:       billing === "monthly" ? "#00aaff" : "#4a6a80",
            }}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling("yearly")}
            className="font-mono text-[10px] px-4 py-1.5 rounded transition-all"
            style={{
              background:  billing === "yearly" ? "#00aaff18" : "transparent",
              border:      `1px solid ${billing === "yearly" ? "#00aaff40" : "#1a3a50"}`,
              color:       billing === "yearly" ? "#00aaff" : "#4a6a80",
            }}
          >
            Yearly
            <span
              className="ml-1.5 font-mono text-[7px] px-1.5 py-0.5 rounded"
              style={{ background: "#0a1a0a", color: "#00ff8a", border: "1px solid #00ff8a30" }}
            >
              SAVE 17%
            </span>
          </button>
        </div>

        {/* Plan cards */}
        {plans.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {["Free", "Pro", "Enterprise"].map(name => (
              <div
                key={name}
                className="rounded border p-5 animate-pulse"
                style={{ background: "#010C18", borderColor: "#0D2035", height: 340 }}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                current={currentPlan}
                billing={billing}
                onUpgrade={handleUpgrade}
                loading={loadingPlan !== null && loadingPlan !== "portal"}
              />
            ))}
          </div>
        )}

        {/* Limits comparison */}
        {subscription && (
          <div className="rounded border overflow-hidden" style={{ borderColor: "#0D2035" }}>
            <div
              className="px-4 py-2.5 font-mono text-[10px] font-bold tracking-widest"
              style={{ background: "#020E1C", color: "#7ab8cc" }}
            >
              YOUR CURRENT LIMITS
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px" style={{ background: "#0D2035" }}>
              {[
                { label: "Exchange Connections", value: subscription.limits.exchanges === -1 ? "Unlimited" : String(subscription.limits.exchanges) },
                { label: "Active Positions",     value: subscription.limits.positions === -1 ? "Unlimited" : String(subscription.limits.positions) },
                { label: "Trades / Day",          value: subscription.limits.trades === -1 || subscription.limits.trades === "unlimited" ? "Unlimited" : String(subscription.limits.trades) },
                { label: "Live Trading",          value: subscription.limits.liveTrading ? "Enabled" : "Disabled" },
              ].map(({ label, value }) => (
                <div key={label} className="px-4 py-3" style={{ background: "#010C18" }}>
                  <div className="font-mono text-[8px] mb-1" style={{ color: "#3a5a70" }}>{label.toUpperCase()}</div>
                  <div
                    className="font-mono text-[13px] font-bold"
                    style={{ color: value === "Disabled" ? "#3a5a70" : value === "Enabled" ? "#00ff8a" : "#EAF2FF" }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Safety note */}
        <div
          className="flex items-start gap-2 px-4 py-3 rounded border font-mono text-[9px]"
          style={{ background: "#010C18", borderColor: "#0D2035", color: "#3a5a70" }}
        >
          <CreditCard className="w-3 h-3 shrink-0 mt-0.5" style={{ color: "#4a6a80" }} />
          <span>
            Payments are processed securely by Stripe. AICandlez never stores your card details.
            Subscriptions can be canceled at any time from the billing portal.
          </span>
        </div>

      </div>
    </div>
  );
}
