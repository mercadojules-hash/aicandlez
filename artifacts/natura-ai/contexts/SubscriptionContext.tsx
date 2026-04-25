import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type SubscriptionTier = "free" | "premium";

interface SubscriptionContextValue {
  tier: SubscriptionTier;
  isPremium: boolean;
  upgradeToPremium: () => Promise<void>;
  downgradeToFree: () => Promise<void>;
  showPaywall: boolean;
  openPaywall: () => void;
  closePaywall: () => void;
  freeAIUsage: number;
  incrementAIUsage: () => void;
  FREE_AI_LIMIT: number;
}

const FREE_AI_LIMIT = 3;
const SUB_KEY = "natura_subscription_tier";
const AI_USAGE_KEY = "natura_ai_usage_date";

const SubscriptionContext = createContext<SubscriptionContextValue>({
  tier: "free",
  isPremium: false,
  upgradeToPremium: async () => {},
  downgradeToFree: async () => {},
  showPaywall: false,
  openPaywall: () => {},
  closePaywall: () => {},
  freeAIUsage: 0,
  incrementAIUsage: () => {},
  FREE_AI_LIMIT,
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTier] = useState<SubscriptionTier>("free");
  const [showPaywall, setShowPaywall] = useState(false);
  const [freeAIUsage, setFreeAIUsage] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [savedTier, usageData] = await Promise.all([
        AsyncStorage.getItem(SUB_KEY),
        AsyncStorage.getItem(AI_USAGE_KEY),
      ]);
      if (savedTier === "premium") setTier("premium");

      if (usageData) {
        const { date, count } = JSON.parse(usageData);
        const today = new Date().toDateString();
        if (date === today) setFreeAIUsage(count);
      }
    };
    load();
  }, []);

  const upgradeToPremium = useCallback(async () => {
    setTier("premium");
    await AsyncStorage.setItem(SUB_KEY, "premium");
    setShowPaywall(false);
  }, []);

  const downgradeToFree = useCallback(async () => {
    setTier("free");
    await AsyncStorage.setItem(SUB_KEY, "free");
  }, []);

  const incrementAIUsage = useCallback(() => {
    const newCount = freeAIUsage + 1;
    setFreeAIUsage(newCount);
    AsyncStorage.setItem(
      AI_USAGE_KEY,
      JSON.stringify({ date: new Date().toDateString(), count: newCount })
    );
  }, [freeAIUsage]);

  return (
    <SubscriptionContext.Provider
      value={{
        tier,
        isPremium: tier === "premium",
        upgradeToPremium,
        downgradeToFree,
        showPaywall,
        openPaywall: () => setShowPaywall(true),
        closePaywall: () => setShowPaywall(false),
        freeAIUsage,
        incrementAIUsage,
        FREE_AI_LIMIT,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
