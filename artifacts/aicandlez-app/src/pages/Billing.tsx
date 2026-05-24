import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api, type Subscription, type SimAccount } from "@/lib/api";
import { PERFORMANCE_FEE_LABEL } from "@/lib/fees";
import { useDisclaimerGate } from "@/hooks/useDisclaimerGate";

// ── Phase E: Wallet snapshot types (mirrors GET /api/billing/wallet) ────────
interface WalletHealth {
  userId:        string;
  plan:          string;
  threshold:     number | null;
  outstanding:   number;
  credits:       number;
  netOwed:       number;
  shouldHold:    boolean;
  currentStatus: string;
  reason:        string;
}
interface WalletCreditTx {
  id:                    string;
  amountUsd:             number | string;
  type:                  string;
  balanceAfter:          number | string;
  note:                  string | null;
  stripePaymentIntentId: string | null;
  createdAt:             string;
}
interface WalletFee {
  id:               string;
  symbol:           string | null;
  realizedPnl:      number | string;
  feeAmountUsd:     number | string;
  settlementStatus: string;
  isPaper:          boolean;
  createdAt:        string;
}
interface WalletResponse {
  health:         WalletHealth;
  packs:          ReadonlyArray<number>;
  recentFees:     WalletFee[];
  recentCreditTx: WalletCreditTx[];
}

const num = (v: number | string): number => typeof v === "number" ? v : parseFloat(v) || 0;

// ── Design tokens (locked to the neon-green system) ─────────────────────────────
const BG         = "#000000";
const CARD       = "#0A1410";
const CARD_HI    = "#0F1F18";
const E          = "rgba(255,255,255,0.07)";
const BRAND      = "#66FF66";
const BRAND_DEEP = "#00C853";
const BRAND_BRGT = "#7CFF00";
const W          = "#E8F5EC";
const GR         = "#8A9C94";
const DIM        = "#5A726A";
const SANS       = "'SF Pro Display','Inter',system-ui,-apple-system,sans-serif";
const MONO       = "'SF Mono','JetBrains Mono','Roboto Mono',Consolas,monospace";

type PlanId = "free" | "starter" | "pro";

interface PlanMeta {
  id:        PlanId;
  name:      string;
  caption:   string;
  price:     string;
  priceNum:  string;
  capacity:  string;
  features:  string[];
  accent:    string;
  glow:      string;
  border:    string;
  ctaStart:  string;
  ctaUpgrade:string;
  elite?:    boolean;
}

// The three tiers, source of truth in the UI. Backend Stripe products map by id.
const PLANS: PlanMeta[] = [
  {
    id: "free",
    name:     "Paper Trading",
    caption:  "7-Day Free AI Paper Trading. Signals + simulated execution.",
    price:    "Free",
    priceNum: "0",
    capacity: "Simulated only · No live execution",
    features: [
      "Simulated trading only",
      "AI Signals enabled",
      "Market scanner enabled",
      "Watchlists enabled",
      "No live execution",
      "No AI Auto Trade",
    ],
    accent: "rgba(232,245,236,0.85)",
    glow:   "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.10)",
    ctaStart:   "Start 7-Day AI Paper Trading Trial",
    ctaUpgrade: "Current Plan",
  },
  {
    id: "starter",
    name:     "AICandlez Starter",
    caption:  "Live AI execution on crypto. AI Auto Trade. Real positions.",
    price:    "$39.99",
    priceNum: "39.99",
    capacity: "Up to 3 Concurrent AI Trades",
    features: [
      "Live AI execution enabled",
      "AI Auto Trade enabled",
      "Up to 3 concurrent AI trades",
      "Crypto AI execution",
      "AI portfolio tracking",
      "AI performance analytics",
      "Live exchange connection",
      `${PERFORMANCE_FEE_LABEL} performance fee on profitable trades only`,
      "No fees on losing trades",
    ],
    accent: BRAND,
    glow:   "rgba(102,255,102,0.22)",
    border: "rgba(102,255,102,0.28)",
    ctaStart:   "Start AICandlez Starter — $39.99/MO",
    ctaUpgrade: "Upgrade to AICandlez Starter — $39.99/MO",
  },
  {
    id: "pro",
    name:     "AICandlez Pro",
    caption:  "Expanded AI capacity, crypto + equities, priority execution.",
    price:    "$79.99",
    priceNum: "79.99",
    capacity: "Up to 12 Concurrent AI Trades",
    features: [
      "Up to 12 concurrent AI trades",
      "Priority AI execution",
      "Crypto + Equities AI trading",
      "Advanced AI scanners",
      "Expanded AI confidence engine",
      "Enhanced analytics",
      "Advanced AI automation controls",
      "Priority execution layer",
      `${PERFORMANCE_FEE_LABEL} performance fee on profitable trades only`,
    ],
    accent: BRAND_BRGT,
    glow:   "rgba(124,255,0,0.36)",
    border: "rgba(124,255,0,0.38)",
    ctaStart:   "Start AICandlez Pro — $79.99/MO",
    ctaUpgrade: "Upgrade to Pro — $79.99/MO",
    elite:    true,
  },
];

// ── Status pill ────────────────────────────────────────────────────────────────
function statusBadge(plan: PlanId, current: PlanId, sub: Subscription | undefined):
  { text: string; bg: string; border: string; color: string } | null
{
  if (!sub?.isActive && plan !== "free") return null;
  if (plan === current) {
    if (plan === "free") {
      return { text: "CURRENT PLAN", bg: "rgba(255,255,255,0.06)",
        border: "rgba(255,255,255,0.16)", color: "rgba(232,245,236,0.80)" };
    }
    if (plan === "starter") {
      return { text: "ACTIVE", bg: "rgba(102,255,102,0.16)",
        border: "rgba(102,255,102,0.45)", color: BRAND };
    }
    return { text: "PRO ACTIVE", bg: "rgba(124,255,0,0.14)",
      border: "rgba(124,255,0,0.45)", color: BRAND_BRGT };
  }
  return null;
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Billing() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { gate: disclaimerGate, modal: disclaimerModal } = useDisclaimerGate();

  const { data: sub, isLoading } = useQuery<Subscription>({
    queryKey:  ["subscription"],
    queryFn:   () => api.get("/billing/subscription"),
    staleTime: 60_000,
  });

  const { data: simAcc } = useQuery<SimAccount>({
    queryKey:  ["sim-account"],
    queryFn:   () => api.get("/account"),
    staleTime: 30_000,
  });

  // ── Phase E: Wallet snapshot ───────────────────────────────────────────────
  // Polled at 20s so the customer sees their balance update after a webhook
  // round-trip. Stripe redirects back to /billing?topup=success — when that
  // marker appears, force an immediate refetch so the new balance lands
  // without waiting for the next poll.
  const { data: wallet, refetch: refetchWallet } = useQuery<WalletResponse>({
    queryKey:        ["billing-wallet"],
    queryFn:         () => api.get<WalletResponse>("/billing/wallet"),
    staleTime:       10_000,
    refetchInterval: 20_000,
  });

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("topup") === "success" || qs.get("outstanding") === "success") {
      void refetchWallet();
      void qc.invalidateQueries({ queryKey: ["subscription"] });
    }
  }, [qc, refetchWallet]);

  const topup = useMutation({
    mutationFn: (amount: number) =>
      api.post<{ url: string; amount: number }>("/billing/topup", { amount }),
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  const payOutstanding = useMutation({
    mutationFn: () => api.post<{ url: string; amount: number }>("/billing/pay_outstanding", {}),
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  const totalRealized = simAcc?.totalRealized ?? (simAcc as { realizedPnL?: number } | undefined)?.realizedPnL ?? 0;
  const totalFeesPaid = simAcc?.totalFeesPaid ?? 0;
  const realizedPos   = totalRealized >= 0;

  const checkout = useMutation({
    mutationFn: (planId: PlanId) =>
      api.post<{ url: string }>("/billing/checkout", {
        planId, billingPeriod: "monthly",
        // Use BASE_URL so the return path is correct in both dev (mounted at
        // `/aicandlez-app/`) and production (mounted at `/` on app.aicandlez.com).
        // Hardcoding `/aicandlez-app/...` here 404s in prod. Task #162 Phase B.
        successUrl: `${window.location.origin}${(import.meta.env.BASE_URL ?? "/").replace(/\/$/, "")}/profile?checkout=success`,
        cancelUrl:  `${window.location.origin}${(import.meta.env.BASE_URL ?? "/").replace(/\/$/, "")}/billing`,
      }),
    onSuccess: ({ url }) => { window.location.href = url; },
  });

  const portal = useMutation({
    mutationFn: () => api.post<{ url: string }>("/billing/portal", {}),
    onSuccess:  ({ url }) => { window.location.href = url; },
  });

  const currentPlan = (sub?.plan ?? "free") as PlanId;
  const isPaidActive = sub?.isActive && currentPlan !== "free";

  // ── Wallet derived values ──────────────────────────────────────────────────
  const health      = wallet?.health;
  const credits     = health?.credits ?? 0;
  const outstanding = health?.outstanding ?? 0;
  const netOwed     = health?.netOwed ?? 0;
  const threshold   = health?.threshold ?? null;
  const onHold      = health?.currentStatus === "billing_hold";
  const packs       = wallet?.packs ?? [25, 50, 100, 250];
  const headroom    = threshold !== null ? Math.max(0, threshold - netOwed) : null;
  const pct         = (threshold !== null && threshold > 0)
    ? Math.min(100, (netOwed / threshold) * 100)
    : 0;

  return (
    <div className="page-enter" style={{ background: BG, minHeight: "100%", paddingBottom: 36 }}>
      {disclaimerModal}

      {/* ── Phase E: Persistent billing-hold banner ───────────────────────── */}
      {onHold && (
        <div style={{
          background: "linear-gradient(180deg,rgba(255,90,90,0.16) 0%,rgba(255,90,90,0.06) 100%)",
          borderBottom: "1px solid rgba(255,90,90,0.42)",
          padding: "12px 16px",
        }}>
          <div style={{
            fontSize: 9, fontFamily: SANS, fontWeight: 800, color: "#FF8A8A",
            letterSpacing: "0.16em", textTransform: "uppercase" as const, marginBottom: 4,
          }}>
            Live AI Execution Paused
          </div>
          <div style={{ fontSize: 12, fontFamily: SANS, color: W, lineHeight: 1.45, marginBottom: 10 }}>
            Live AI execution paused until outstanding balance is resolved.
            Your paper trading and signals remain fully available.
          </div>
          <button
            onClick={() => payOutstanding.mutate()}
            disabled={payOutstanding.isPending || netOwed <= 0}
            style={{
              width: "100%",
              padding: "10px 14px",
              background: "linear-gradient(180deg,#66FF66 0%,#00C853 100%)",
              border: "none", borderRadius: 8, color: "#000",
              fontFamily: SANS, fontSize: 12, fontWeight: 800,
              letterSpacing: 0.4, textTransform: "uppercase" as const,
              cursor: payOutstanding.isPending ? "wait" : "pointer",
              opacity: payOutstanding.isPending || netOwed <= 0 ? 0.6 : 1,
            }}
          >
            {payOutstanding.isPending
              ? "Opening Stripe…"
              : `Resolve $${netOwed.toFixed(2)} & Restore`}
          </button>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: "18px 20px", borderBottom: `1px solid ${E}` }}>
        <button onClick={() => setLocation("/profile")} style={{
          background: "none", border: "none", cursor: "pointer",
          fontFamily: SANS, fontSize: 10, fontWeight: 500,
          color: GR, padding: "0 0 10px 0", display: "block",
        }}>
          ← Profile
        </button>
        <div style={{ fontSize: 22, fontFamily: SANS, fontWeight: 700, color: W,
          letterSpacing: -0.4 }}>
          Billing & Plan
        </div>
        <div style={{ fontSize: 11, fontFamily: SANS, color: GR, marginTop: 5, lineHeight: 1.5 }}>
          Choose your AICandlez plan. Cancel anytime · Secured by Stripe.
        </div>
      </div>

      <div style={{ padding: "18px 16px 0" }}>

        {/* ── Current status banner ───────────────────────────────────────── */}
        {!isLoading && (
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 14px", marginBottom: 16,
            background: isPaidActive ? "rgba(102,255,102,0.05)" : "rgba(255,180,0,0.04)",
            border: `1px solid ${isPaidActive ? "rgba(102,255,102,0.22)" : "rgba(255,180,0,0.18)"}`,
            borderRadius: 12,
          }}>
            <div>
              <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 700,
                letterSpacing: "0.12em", textTransform: "uppercase" as const,
                color: isPaidActive ? BRAND : "rgba(255,180,0,0.85)", marginBottom: 4 }}>
                {isPaidActive ? "Subscription Active" : "Free Tier"}
              </div>
              <div style={{ fontSize: 14, fontFamily: SANS, fontWeight: 600, color: W }}>
                {PLANS.find(p => p.id === currentPlan)?.name ?? "Paper Trading"}
              </div>
            </div>
            {isPaidActive && (
              <button
                onClick={() => portal.mutate()}
                disabled={portal.isPending}
                style={{
                  padding: "9px 14px",
                  background: "rgba(102,255,102,0.08)",
                  border: `1px solid rgba(102,255,102,0.32)`,
                  borderRadius: 8, color: BRAND, fontFamily: SANS,
                  fontSize: 11, fontWeight: 700,
                  letterSpacing: 0.4, textTransform: "uppercase" as const,
                  cursor: portal.isPending ? "wait" : "pointer",
                }}>
                {portal.isPending ? "Opening…" : "Manage Billing"}
              </button>
            )}
          </div>
        )}

        {/* ── Phase E: Wallet (credits + outstanding + top-up packs) ─────── */}
        {wallet && (
          <div style={{
            background: CARD, border: `1px solid ${E}`, borderRadius: 14,
            padding: "16px 16px 14px", marginBottom: 14,
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14,
            }}>
              <div>
                <div style={{
                  fontSize: 9, fontFamily: SANS, fontWeight: 800, color: BRAND,
                  letterSpacing: "0.16em", textTransform: "uppercase" as const, marginBottom: 4,
                }}>
                  AI Wallet
                </div>
                <div style={{ fontSize: 13, fontFamily: SANS, color: GR }}>
                  Prepaid balance for performance fees.
                </div>
              </div>
              <div style={{
                fontSize: 9, fontFamily: MONO, fontWeight: 700,
                color: onHold ? "#FF8A8A" : credits > 0 ? BRAND : GR,
                letterSpacing: "0.14em", textTransform: "uppercase" as const,
              }}>
                {onHold ? "ON HOLD" : credits > 0 ? "HEALTHY" : "OK"}
              </div>
            </div>

            {/* Balance + outstanding side-by-side */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12,
            }}>
              <div style={{
                background: CARD_HI, border: `1px solid ${E}`, borderRadius: 10,
                padding: "12px 14px",
              }}>
                <div style={{
                  fontSize: 9, fontFamily: SANS, fontWeight: 700, color: GR,
                  letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 6,
                }}>Credits</div>
                <div style={{
                  fontSize: 22, fontFamily: MONO, fontWeight: 700,
                  color: credits > 0 ? BRAND : W, letterSpacing: -0.3,
                }}>
                  ${credits.toFixed(2)}
                </div>
              </div>
              <div style={{
                background: CARD_HI, border: `1px solid ${E}`, borderRadius: 10,
                padding: "12px 14px",
              }}>
                <div style={{
                  fontSize: 9, fontFamily: SANS, fontWeight: 700, color: GR,
                  letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 6,
                }}>Net Owed</div>
                <div style={{
                  fontSize: 22, fontFamily: MONO, fontWeight: 700,
                  color: netOwed > 0 ? "#FFC75A" : W, letterSpacing: -0.3,
                }}>
                  ${netOwed.toFixed(2)}
                </div>
                {outstanding > 0 && (
                  <div style={{
                    fontSize: 8.5, fontFamily: SANS, color: DIM, marginTop: 3,
                    letterSpacing: 0.3,
                  }}>
                    {credits > 0
                      ? `Pending fees $${outstanding.toFixed(2)} − credits`
                      : `Pending fees only`}
                  </div>
                )}
              </div>
            </div>

            {/* Threshold meter (only when plan has one) */}
            {threshold !== null && (
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  fontSize: 10, fontFamily: SANS, color: GR, marginBottom: 6,
                }}>
                  <span>Net owed · ${netOwed.toFixed(2)}</span>
                  <span style={{ color: headroom !== null && headroom > 0 ? BRAND : "#FFC75A" }}>
                    {headroom !== null && headroom > 0
                      ? `$${headroom.toFixed(2)} until hold`
                      : `Threshold reached`}
                  </span>
                </div>
                <div style={{
                  position: "relative", height: 6, background: "rgba(255,255,255,0.06)",
                  borderRadius: 999, overflow: "hidden",
                }}>
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: `${pct}%`,
                    background: pct >= 100
                      ? "linear-gradient(90deg,#FFC75A,#FF6B6B)"
                      : pct >= 70
                        ? "linear-gradient(90deg,#66FF66,#FFC75A)"
                        : `linear-gradient(90deg,${BRAND_DEEP},${BRAND})`,
                    transition: "width 400ms ease",
                  }} />
                </div>
                <div style={{
                  fontSize: 9.5, fontFamily: SANS, color: DIM, marginTop: 6, lineHeight: 1.5,
                }}>
                  Hold threshold: ${threshold.toFixed(2)}. Top up to keep AI execution running.
                </div>
              </div>
            )}

            {/* Pay outstanding CTA (in-card, also surfaced in top banner when held) */}
            {netOwed > 0 && !onHold && (
              <button
                onClick={() => payOutstanding.mutate()}
                disabled={payOutstanding.isPending}
                style={{
                  width: "100%", padding: "10px 14px", marginBottom: 12,
                  background: "rgba(255,199,90,0.10)",
                  border: "1px solid rgba(255,199,90,0.42)",
                  borderRadius: 8, color: "#FFC75A",
                  fontFamily: SANS, fontSize: 11, fontWeight: 700,
                  letterSpacing: 0.4, textTransform: "uppercase" as const,
                  cursor: payOutstanding.isPending ? "wait" : "pointer",
                }}
              >
                {payOutstanding.isPending
                  ? "Opening Stripe…"
                  : `Pay $${netOwed.toFixed(2)} outstanding`}
              </button>
            )}

            {/* Top-up packs */}
            <div style={{
              fontSize: 9, fontFamily: SANS, fontWeight: 700, color: GR,
              letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 8,
            }}>
              Add Credits
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6,
            }}>
              {packs.map(p => (
                <button
                  key={p}
                  onClick={() => topup.mutate(p)}
                  disabled={topup.isPending}
                  style={{
                    padding: "12px 0",
                    background: "linear-gradient(180deg,rgba(102,255,102,0.10) 0%,rgba(102,255,102,0.04) 100%)",
                    border: `1px solid rgba(102,255,102,0.34)`,
                    borderRadius: 10, color: W,
                    fontFamily: SANS, fontSize: 13, fontWeight: 700,
                    cursor: topup.isPending ? "wait" : "pointer",
                    transition: "all 160ms ease",
                  }}
                >
                  ${p}
                </button>
              ))}
            </div>
            {topup.isError && (
              <div style={{
                marginTop: 10, padding: "8px 10px",
                background: "rgba(255,90,90,0.08)", border: "1px solid rgba(255,90,90,0.32)",
                borderRadius: 8, fontSize: 11, fontFamily: SANS, color: "#FF8A8A",
              }}>
                {topup.error instanceof Error ? topup.error.message : "Top-up failed."}
              </div>
            )}
            <div style={{
              fontSize: 9.5, fontFamily: SANS, color: DIM, marginTop: 10, lineHeight: 1.5,
            }}>
              Credits auto-apply to fees on profitable closed trades. Never on losing trades.
            </div>
          </div>
        )}

        {/* ── Lifetime account stats ─────────────────────────────────────── */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14,
        }}>
          <div style={{
            background: CARD, border: `1px solid ${E}`, borderRadius: 10,
            padding: "12px 14px",
          }}>
            <div style={{
              fontSize: 9, fontFamily: SANS, fontWeight: 700, color: GR,
              letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 4,
            }}>Total Realized PnL</div>
            <div style={{
              fontSize: 18, fontFamily: MONO, fontWeight: 700,
              color: realizedPos ? BRAND : "#ff4466", letterSpacing: -0.2,
            }}>
              {realizedPos ? "+" : ""}${totalRealized.toFixed(2)}
            </div>
          </div>
          <div
            title="Lifetime broker commission paid across every closed live trade"
            style={{
              background: CARD, border: `1px solid ${E}`, borderRadius: 10,
              padding: "12px 14px",
            }}>
            <div style={{
              fontSize: 9, fontFamily: SANS, fontWeight: 700, color: GR,
              letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 4,
            }}>Lifetime Fees Paid</div>
            <div style={{
              fontSize: 18, fontFamily: MONO, fontWeight: 700,
              color: totalFeesPaid > 0 ? W : DIM, letterSpacing: -0.2,
            }}>
              −${totalFeesPaid.toFixed(2)}
            </div>
            <div style={{
              fontSize: 8.5, fontFamily: SANS, color: DIM, marginTop: 3,
              letterSpacing: 0.3,
            }}>
              Broker commissions · paper trades excluded
            </div>
          </div>
        </div>

        {checkout.isError && (
          <div style={{ background: "rgba(255,51,85,0.07)",
            border: "1px solid rgba(255,51,85,0.22)",
            borderRadius: 10, padding: "10px 14px", marginBottom: 14,
            fontSize: 11, fontFamily: SANS, color: "rgba(255,100,120,0.92)" }}>
            {checkout.error instanceof Error ? checkout.error.message : "Checkout failed. Please try again."}
          </div>
        )}

        {/* ── Plan cards (3-tier ladder) ─────────────────────────────────── */}
        {PLANS.map(plan => {
          const badge   = statusBadge(plan.id, currentPlan, sub);
          const isCur   = plan.id === currentPlan && (sub?.isActive ?? plan.id === "free");
          const planRank = ["free", "starter", "pro"].indexOf(plan.id);
          const curRank  = ["free", "starter", "pro"].indexOf(currentPlan);
          const isUpgrade = planRank > curRank;
          const isDowngrade = planRank < curRank && plan.id !== "free";

          return (
            <div key={plan.id} style={{
              position: "relative",
              marginBottom: 14,
              background: plan.elite
                ? `linear-gradient(160deg, ${CARD_HI} 0%, ${CARD} 60%)`
                : CARD,
              border: `1px solid ${isCur ? plan.accent : plan.border}`,
              borderRadius: 16,
              padding: "18px 18px 16px",
              boxShadow: isCur
                ? `0 0 0 1px ${plan.accent} inset, 0 18px 44px ${plan.glow}`
                : plan.elite
                  ? `0 14px 36px ${plan.glow}`
                  : "none",
              overflow: "hidden",
            }}>
              {/* Elite top edge sweep */}
              {plan.elite && (
                <div aria-hidden style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 1,
                  background: `linear-gradient(90deg, transparent 0%, ${BRAND_BRGT} 50%, transparent 100%)`,
                  opacity: 0.7,
                }}/>
              )}

              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between",
                alignItems: "flex-start", marginBottom: 12, gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 17, fontFamily: SANS, fontWeight: 700,
                      color: W, letterSpacing: -0.2 }}>{plan.name}</span>
                    {badge && (
                      <span style={{
                        padding: "2px 8px",
                        background: badge.bg,
                        border:`1px solid ${badge.border}`,
                        color:      badge.color,
                        borderRadius: 4, fontSize: 8.5, fontFamily: SANS, fontWeight: 700,
                        letterSpacing: "0.10em", textTransform: "uppercase" as const,
                      }}>{badge.text}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, fontFamily: SANS, color: GR,
                    lineHeight: 1.45 }}>{plan.caption}</div>
                </div>
                <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                  <div style={{
                    fontSize: 24, fontFamily: SANS, fontWeight: 800,
                    color: plan.id === "free" ? W : plan.accent,
                    letterSpacing: -0.8, lineHeight: 1,
                    textShadow: plan.elite ? `0 0 18px ${plan.glow}` : "none",
                  }}>{plan.price}</div>
                  {plan.id !== "free" && (
                    <div style={{ fontSize: 9.5, fontFamily: SANS, color: DIM,
                      marginTop: 2, letterSpacing: 0.4 }}>/month</div>
                  )}
                </div>
              </div>

              {/* Capacity pill */}
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
                  background: plan.id === "free" ? DIM : plan.accent,
                  boxShadow: plan.id === "free" ? "none" : `0 0 8px ${plan.accent}` }}/>
                <span style={{ fontSize: 10.5, fontFamily: SANS, fontWeight: 700,
                  color: plan.id === "free" ? GR : plan.accent,
                  letterSpacing: 0.6, textTransform: "uppercase" as const }}>
                  {plan.capacity}
                </span>
              </div>

              {/* Features */}
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
                      color: plan.id === "free" ? GR : plan.accent,
                    }}>✓</span>
                    <span style={{ fontSize: 12, fontFamily: SANS, color: "rgba(232,245,236,0.82)",
                      lineHeight: 1.5 }}>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
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
                  }}>{plan.ctaUpgrade}</button>
              )}

              {plan.id !== "free" && isCur && (
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

              {plan.id !== "free" && !isCur && isUpgrade && (
                <button
                  onClick={() => disclaimerGate(() => checkout.mutate(plan.id))}
                  disabled={checkout.isPending}
                  style={{
                    position: "relative", overflow: "hidden",
                    width: "100%", padding: "14px 0", borderRadius: 12,
                    background: plan.elite
                      ? `linear-gradient(135deg, ${BRAND_DEEP} 0%, ${BRAND} 50%, ${BRAND_BRGT} 100%)`
                      : `linear-gradient(135deg, ${BRAND_DEEP} 0%, ${BRAND} 100%)`,
                    border: `1px solid ${plan.elite ? BRAND_BRGT : BRAND}`,
                    color: "#001b06",
                    fontFamily: SANS, fontSize: 13, fontWeight: 800,
                    letterSpacing: 0.6, textTransform: "uppercase" as const,
                    cursor: checkout.isPending ? "wait" : "pointer",
                    boxShadow: `0 10px 30px ${plan.glow}, 0 1px 0 rgba(255,255,255,0.45) inset`,
                  }}>
                  {checkout.isPending
                    ? "Redirecting…"
                    : currentPlan === "free" ? plan.ctaStart : plan.ctaUpgrade}
                  <span aria-hidden style={{
                    position: "absolute", top: 0, left: "-30%", height: "100%", width: "30%",
                    background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.30) 50%, transparent 100%)",
                    animation: "edge-sweep 4.5s ease-in-out infinite",
                  }}/>
                </button>
              )}

              {plan.id !== "free" && !isCur && isDowngrade && (
                <button
                  onClick={() => portal.mutate()}
                  disabled={portal.isPending}
                  style={{
                    width: "100%", padding: "13px 0", borderRadius: 12,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    color: GR, fontFamily: SANS, fontSize: 12, fontWeight: 700,
                    letterSpacing: 0.5, textTransform: "uppercase" as const,
                    cursor: portal.isPending ? "wait" : "pointer",
                  }}>
                  {portal.isPending ? "Opening Portal…" : `Downgrade to ${plan.name}`}
                </button>
              )}
            </div>
          );
        })}

        {/* ── Trust strip ─────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8, marginTop: 6, marginBottom: 14 }}>
          {[
            { label: "Stripe Secure",     sub: "Payment processing"          },
            { label: "Cancel Anytime",    sub: "No lock-in"                  },
            { label: "Profits-Only Fees", sub: `${PERFORMANCE_FEE_LABEL} on wins only` },
          ].map(({ label, sub }) => (
            <div key={label} style={{ background: CARD, border: `1px solid ${E}`,
              borderRadius: 10, padding: "12px 10px", textAlign: "center" as const }}>
              <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 700,
                color: "rgba(232,245,236,0.86)", marginBottom: 3,
                letterSpacing: 0.3 }}>{label}</div>
              <div style={{ fontSize: 8, fontFamily: SANS, color: GR }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div style={{ padding: "12px 14px", background: CARD,
          border: `1px solid ${E}`, borderRadius: 10 }}>
          <div style={{ fontSize: 9.5, fontFamily: SANS, color: DIM, lineHeight: 1.7,
            letterSpacing: 0.2 }}>
            Subscriptions billed monthly via Stripe · Cancel anytime · Performance fees apply
            only to closed profitable trades (never on losses or unrealised gains) · AICandlez
            never requests withdrawal permissions from your exchange.
          </div>
        </div>
      </div>
    </div>
  );
}
