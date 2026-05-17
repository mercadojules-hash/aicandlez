import { createContext, useContext, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { api, type Subscription } from "@/lib/api";

export type PaywallReason = "trial_expired" | "live_trading" | "feature_locked" | null;

export type SubPlan   = "free" | "starter" | "pro" | "enterprise";
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
    exchanges:  number | string;
    positions:  number | string;
    trades:     number | string;
    liveTrading: boolean;
  };
  paywallVisible: boolean;
  paywallReason:  PaywallReason;
  showPaywall:    (reason?: PaywallReason) => void;
  hidePaywall:    () => void;
  refetch:        () => void;
}

const DEFAULT_LIMITS = {
  exchanges:   1    as number | string,
  positions:   3    as number | string,
  trades:      5    as number | string,
  liveTrading: false,
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
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallReason,  setPaywallReason]  = useState<PaywallReason>(null);

  const {
    data,
    isLoading: qLoading,
    refetch,
  } = useQuery<Subscription>({
    queryKey:  ["subscription"],
    queryFn:   () => api.get<Subscription>("/billing/subscription"),
    enabled:   !!isSignedIn,
    staleTime: 60_000,
    retry:     1,
  });

  const plan       = ((data?.plan       ?? "free") as SubPlan);
  const planStatus = ((data?.planStatus ?? null)   as SubStatus);
  const limits     = data?.limits ?? DEFAULT_LIMITS;

  const isTrialing  = planStatus === "trialing";
  const isActive    = plan === "free"
    || planStatus === "active"
    || planStatus === "trialing"
    || planStatus === null;
  const isPaid      = plan !== "free";
  const canLiveTrade = (limits.liveTrading === true) && isActive && isPaid;

  const trialEndsAt = (data as Record<string, unknown> | undefined)?.["trialEndsAt"] as string | null ?? null;
  let daysUntilTrialEnd: number | null = null;
  if (trialEndsAt) {
    const diff = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000);
    daysUntilTrialEnd = Math.max(0, diff);
  }

  const showPaywall = useCallback((reason: PaywallReason = "feature_locked") => {
    setPaywallReason(reason);
    setPaywallVisible(true);
  }, []);

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
