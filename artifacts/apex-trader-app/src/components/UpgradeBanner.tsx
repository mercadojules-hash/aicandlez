import { useLocation } from "wouter";
import { useSubscription } from "@/contexts/SubscriptionContext";

const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
const C    = "#00e5ff";
const W    = "#ffffff";
const GR   = "#8892a4";
const O    = "#ff9400";
const R    = "#ff3355";

export function UpgradeBanner() {
  const { isPaid, isTrialing, daysUntilTrialEnd, planStatus, isLoading, showPaywall } = useSubscription();
  const [, navigate] = useLocation();

  if (isLoading) return null;

  // Active paid, non-trialing: no banner
  if (isPaid && planStatus === "active" && !isTrialing) return null;

  // Trial expired (trialing status but 0 days left)
  if (isTrialing && daysUntilTrialEnd === 0) {
    return (
      <BannerShell bg="rgba(255,51,85,0.08)" border="rgba(255,51,85,0.28)">
        <div style={{ fontSize: 11, lineHeight: 1 }}>🚨</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: R, marginBottom: 2 }}>
            Trial ended
          </div>
          <div style={{ fontSize: 10, color: GR }}>Subscribe to keep full access to AI trading</div>
        </div>
        <BannerBtn color={R} border="rgba(255,51,85,0.40)" onClick={() => showPaywall("trial_expired")}>
          Subscribe
        </BannerBtn>
      </BannerShell>
    );
  }

  // Trial active — low urgency (4+ days)
  if (isTrialing && daysUntilTrialEnd !== null && daysUntilTrialEnd >= 4) {
    return (
      <BannerShell bg="rgba(0,229,255,0.04)" border="rgba(0,229,255,0.14)">
        <div style={{ fontSize: 11 }}>⏱</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C, marginBottom: 2 }}>
            Trial active — {daysUntilTrialEnd} days remaining
          </div>
          <div style={{ fontSize: 10, color: GR }}>Subscribe before trial ends to keep live trading access</div>
        </div>
        <BannerBtn color={C} border="rgba(0,229,255,0.30)" onClick={() => navigate("/billing")}>
          Subscribe
        </BannerBtn>
      </BannerShell>
    );
  }

  // Trial expiring soon (1-3 days)
  if (isTrialing && daysUntilTrialEnd !== null && daysUntilTrialEnd <= 3) {
    const urgent = daysUntilTrialEnd <= 1;
    return (
      <BannerShell bg="rgba(255,148,0,0.07)" border="rgba(255,148,0,0.30)">
        <div style={{ fontSize: 11 }}>{urgent ? "🔥" : "⚠️"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: O, marginBottom: 2 }}>
            {urgent
              ? "Trial ends tomorrow — subscribe now"
              : `Trial ends in ${daysUntilTrialEnd} days`}
          </div>
          <div style={{ fontSize: 10, color: GR }}>Don't lose access to AI trading</div>
        </div>
        <BannerBtn color={O} border="rgba(255,148,0,0.45)" onClick={() => showPaywall("trial_expired")}>
          Subscribe
        </BannerBtn>
      </BannerShell>
    );
  }

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
        <BannerBtn color={C} border="rgba(0,229,255,0.30)" onClick={() => showPaywall("feature_locked")}>
          Reactivate
        </BannerBtn>
      </BannerShell>
    );
  }

  // Free user (no subscription)
  if (!isPaid) {
    return (
      <BannerShell bg="rgba(155,92,245,0.06)" border="rgba(155,92,245,0.22)">
        <div style={{ fontSize: 11 }}>✨</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#9b5cf5", marginBottom: 2 }}>
            Upgrade to live AI trading
          </div>
          <div style={{ fontSize: 10, color: GR }}>14-day free trial • $5.99/mo • Cancel anytime</div>
        </div>
        <BannerBtn color="#9b5cf5" border="rgba(155,92,245,0.38)" onClick={() => showPaywall("feature_locked")}>
          Try free
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
