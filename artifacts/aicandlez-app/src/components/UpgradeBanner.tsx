import { useLocation } from "wouter";
import { useSubscription } from "@/contexts/SubscriptionContext";

const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";

// Brand neon palette (matches index.css tokens)
const BRAND        = "#66FF66";
const BRAND_BRIGHT = "#7CFF00";
const W            = "#ffffff";
const GR           = "#8892a4";
const R            = "#ff3355";

export function UpgradeBanner() {
  // NOTE: Stripe 7-day trial was removed from new checkout sessions.
  // Free experience IS paper mode now. We still treat `isTrialing` as
  // paid for entitlement gating (existing customers mid-trial), but we
  // no longer render "trial ending / N days remaining" customer copy.
  const {
    plan,
    isPaid,
    isTrialing,
    planStatus,
    isLoading,
    showPaywall,
  } = useSubscription();
  const [, navigate] = useLocation();

  if (isLoading) return null;

  // ───────────────────────────────────────────────────────────────────────────
  // PRO — fully clean. No banners of any kind.
  // ───────────────────────────────────────────────────────────────────────────
  if (plan === "pro" && planStatus !== "past_due" && planStatus !== "canceled") {
    return null;
  }

  // Active paid (incl. trialing — treat as active) — no banner unless billing requires attention
  if (isPaid && (planStatus === "active" || isTrialing) && plan !== "starter") {
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Billing-state banners apply to all tiers (trump tier-specific copy)
  // ───────────────────────────────────────────────────────────────────────────

  // Past due
  if (planStatus === "past_due") {
    return (
      <BannerShell bg="rgba(255,51,85,0.06)" border="rgba(255,51,85,0.24)">
        <div style={{ fontSize: 11 }}>⚠️</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: R, marginBottom: 2 }}>Payment issue</div>
          <div style={{ fontSize: 10, color: GR }}>Update billing to restore full access</div>
        </div>
        <BannerBtn color={R} border="rgba(255,51,85,0.40)" onClick={() => navigate("/billing")}>
          Fix billing
        </BannerBtn>
      </BannerShell>
    );
  }

  // Canceled
  if (planStatus === "canceled") {
    return (
      <BannerShell bg="rgba(136,146,164,0.06)" border="rgba(136,146,164,0.18)">
        <div style={{ fontSize: 11 }}>💤</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: W, marginBottom: 2 }}>Subscription inactive</div>
          <div style={{ fontSize: 10, color: GR }}>Reactivate to restore AI trading access</div>
        </div>
        <BannerBtn color={BRAND} border="rgba(102,255,102,0.34)" onClick={() => showPaywall("feature_locked")}>
          Reactivate
        </BannerBtn>
      </BannerShell>
    );
  }

  // Trial countdown banners removed (Stripe 7-day trial removed from new
  // checkout). Existing trialing customers are silently treated as paid
  // via the early-return above — no "N days remaining / trial ended"
  // copy is shown anywhere customer-facing.

  // ───────────────────────────────────────────────────────────────────────────
  // STARTER — single subtle "Upgrade to Pro" line, no locked/unlock language
  // ───────────────────────────────────────────────────────────────────────────
  if (plan === "starter") {
    return (
      <BannerShell bg="rgba(102,255,102,0.03)" border="rgba(102,255,102,0.14)">
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: BRAND, boxShadow: `0 0 8px ${BRAND}`,
        }}/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: W, marginBottom: 2, letterSpacing: 0.1 }}>
            Unlock up to 12 concurrent AI trades
          </div>
          <div style={{ fontSize: 10, color: GR }}>
            AICandlez Pro · $99.95/mo · Elite VIP · $199.95/mo
          </div>
        </div>
        <BannerBtn color={BRAND_BRIGHT} border="rgba(124,255,0,0.32)" onClick={() => navigate("/subscribe")}>
          Upgrade to Pro
        </BannerBtn>
      </BannerShell>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FREE — full upgrade prompt with locked/unlock messaging
  // ───────────────────────────────────────────────────────────────────────────
  if (!isPaid) {
    return (
      <BannerShell bg="rgba(102,255,102,0.05)" border="rgba(102,255,102,0.22)">
        <div style={{ fontSize: 11 }}>✨</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, marginBottom: 2 }}>
            Paper Trading Active — Unlock Live AI Execution
          </div>
          <div style={{ fontSize: 10, color: GR }}>
            AICandlez Starter from $49.95/mo · Pro $99.95/mo
          </div>
        </div>
        <BannerBtn color={BRAND_BRIGHT} border="rgba(124,255,0,0.40)" onClick={() => showPaywall("feature_locked")}>
          Start AI Trading
        </BannerBtn>
      </BannerShell>
    );
  }

  return null;
}

function BannerShell({
  children, bg, border,
}: { children: React.ReactNode; bg: string; border: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px",
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 10,
      margin: "0 16px 12px",
    }}>
      {children}
    </div>
  );
}

function BannerBtn({
  children, color, border, onClick,
}: { children: React.ReactNode; color: string; border: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        background: "transparent",
        border: `1px solid ${border}`,
        borderRadius: 7,
        color,
        fontSize: 10, fontFamily: SANS, fontWeight: 600,
        cursor: "pointer", whiteSpace: "nowrap",
        letterSpacing: "0.04em",
      }}>
      {children}
    </button>
  );
}

