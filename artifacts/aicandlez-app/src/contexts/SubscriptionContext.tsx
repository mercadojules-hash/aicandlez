import { createContext, useContext, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { api, type Subscription } from "@/lib/api";
import { useUserRole } from "@/hooks/useUserRole";

/**
 * Operator (admin / super-admin) entitlements. When `useUserRole().isAdmin`
 * is true we project this onto the subscription state so the entire consumer
 * paywall / upgrade-banner / paper-only / limits machinery is bypassed for
 * platform operators. The api-server still enforces real role gates on every
 * sensitive endpoint via `requireRole(["admin","super-admin"])` — this is UI
 * unlock only.
 */
const OPERATOR_LIMITS = {
  exchanges:        "unlimited" as number | string,
  positions:        "unlimited" as number | string,
  trades:           "unlimited" as number | string,
  liveTrading:      true,
  concurrentTrades: 999,
  aiAutoTrade:      true,
  equitiesAI:       true,
};

export type PaywallReason = "trial_expired" | "live_trading" | "feature_locked" | null;

// Internal plan keys (kept stable for DB enum compatibility):
//   free    → Paper Trading
//   starter → AI Trading ($39.99/mo)
//   pro     → AI Trading Pro ($79.99/mo)
export type SubPlan   = "free" | "starter" | "pro";
export type SubStatus = "active" | "trialing" | "past_due" | "canceled" | "unpaid" | null;

export interface SubscriptionState {
  plan:              SubPlan;
  planStatus:        SubStatus;
  isLoading:         boolean;
  isActive:          boolean;
  isPaid:            boolean;
  isTrialing:        boolean;
  canLiveTrade:      boolean;
  daysUntilTrialEnd: number | null;
  trialEndsAt:       string | null;
  limits: {
    exchanges:        number | string;
    positions:        number | string;
    trades:           number | string;
    liveTrading:      boolean;
    concurrentTrades: number;
    aiAutoTrade:      boolean;
    equitiesAI:       boolean;
  };
  paywallVisible: boolean;
  paywallReason:  PaywallReason;
  showPaywall:    (reason?: PaywallReason) => void;
  hidePaywall:    () => void;
  refetch:        () => void;
}

const DEFAULT_LIMITS = {
  exchanges:        1 as number | string,
  positions:        3 as number | string,
  trades:           5 as number | string,
  liveTrading:      false,
  concurrentTrades: 0,
  aiAutoTrade:      false,
  equitiesAI:       false,
};

const DEFAULT_STATE: SubscriptionState = {
  plan:              "free",
  planStatus:        null,
  isLoading:         true,
  isActive:          true,
  isPaid:            false,
  isTrialing:        false,
  canLiveTrade:      false,
  daysUntilTrialEnd: null,
  trialEndsAt:       null,
  limits:            DEFAULT_LIMITS,
  paywallVisible:    false,
  paywallReason:     null,
  showPaywall:       () => {},
  hidePaywall:       () => {},
  refetch:           () => {},
};

const SubscriptionContext = createContext<SubscriptionState>(DEFAULT_STATE);

export function useSubscription() {
  return useContext(SubscriptionContext);
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useUser();
  const { isAdmin }    = useUserRole();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallReason,  setPaywallReason]  = useState<PaywallReason>(null);

  const {
    data,
    isLoading: qLoading,
    refetch,
  } = useQuery<Subscription>({
    queryKey:  ["subscription"],
    queryFn:   () => api.get<Subscription>("/billing/subscription"),
    enabled:   !!isSignedIn && !isAdmin,
    staleTime: 60_000,
    retry:     1,
  });

  // ── Operator override ──────────────────────────────────────────────────────
  // Admins / super-admins bypass the entire consumer subscription surface:
  //   • no upgrade banners, no paywall, no paper-only restrictions
  //   • unlimited concurrent trades, live execution enabled
  //   • plan reads as "pro" so any `plan === "pro"` gate (FeatureGate,
  //     UpgradeBanner, etc.) automatically unlocks without special-casing.
  const plan: SubPlan = isAdmin
    ? "pro"
    : ((data?.plan ?? "free") as SubPlan);

  const planStatus: SubStatus = isAdmin
    ? "active"
    : ((data?.planStatus ?? null) as SubStatus);

  const limits = isAdmin
    ? OPERATOR_LIMITS
    : (data?.limits ?? DEFAULT_LIMITS);

  const isTrialing  = !isAdmin && planStatus === "trialing";
  const isActive    = isAdmin
    || plan === "free"
    || planStatus === "active"
    || planStatus === "trialing"
    || planStatus === null;
  const isPaid       = isAdmin || plan !== "free";
  const canLiveTrade = isAdmin
    || ((limits.liveTrading === true) && isActive && isPaid);

  const trialEndsAt = (data as Record<string, unknown> | undefined)?.["trialEndsAt"] as string | null ?? null;
  let daysUntilTrialEnd: number | null = null;
  if (trialEndsAt) {
    const diff = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000);
    daysUntilTrialEnd = Math.max(0, diff);
  }

  const showPaywall = useCallback((reason: PaywallReason = "feature_locked") => {
    // Operators never see the paywall — silently no-op.
    if (isAdmin) return;
    setPaywallReason(reason);
    setPaywallVisible(true);
  }, [isAdmin]);

  const hidePaywall = useCallback(() => {
    setPaywallVisible(false);
    setPaywallReason(null);
  }, []);

  return (
    <SubscriptionContext.Provider value={{
      plan,
      planStatus,
      isLoading:         !isSignedIn ? false : qLoading,
      isActive,
      isPaid,
      isTrialing,
      canLiveTrade,
      daysUntilTrialEnd,
      trialEndsAt,
      limits: limits as SubscriptionState["limits"],
      paywallVisible,
      paywallReason,
      showPaywall,
      hidePaywall,
      refetch: () => { void refetch(); },
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}
