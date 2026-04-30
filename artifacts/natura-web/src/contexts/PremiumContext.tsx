import React, { createContext, useContext, useState } from "react";

interface PremiumContextValue {
  isPremium: boolean;
  upgrade: () => void;
}

const PremiumContext = createContext<PremiumContextValue>({
  isPremium: false,
  upgrade: () => {},
});

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const upgrade = () => setIsPremium(true);
  return (
    <PremiumContext.Provider value={{ isPremium, upgrade }}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  return useContext(PremiumContext);
}
