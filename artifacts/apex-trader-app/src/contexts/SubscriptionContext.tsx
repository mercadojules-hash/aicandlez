import { createContext, useContext, useState } from "react";

export type PaywallReason = "trial_expired" | "live_trading" | "feature_locked" | null;

type SubscriptionContextType = {
  paywallVisible: boolean;
  paywallReason:  PaywallReason;
  showPaywall: (reason?: PaywallReason) => void;
  hidePaywall: () => void;
};

export const SubscriptionContext = createContext<SubscriptionContextType>({
  paywallVisible: false,
  paywallReason:  null,
  showPaywall:    () => {},
  hidePaywall:    () => {},
});

export function useSubscription() {
  return useContext(SubscriptionContext);
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [reason,  setReason]  = useState<PaywallReason>(null);

  return (
    <SubscriptionContext.Provider value={{
      paywallVisible: visible,
      paywallReason:  reason,
      showPaywall: (r = "feature_locked") => { setReason(r); setVisible(true); },
      hidePaywall: () => { setVisible(false); setReason(null); },
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}
