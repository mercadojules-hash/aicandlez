import { createContext, useContext, useState, type ReactNode } from "react";

interface AIAutoTradeCtx {
  enabled:    boolean;
  setEnabled: (v: boolean) => void;
  positions:  number;
  maxPositions: number;
}

const AIAutoTradeContext = createContext<AIAutoTradeCtx>({
  enabled:      false,
  setEnabled:   () => {},
  positions:    0,
  maxPositions: 6,
});

export function AIAutoTradeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledRaw] = useState<boolean>(() => {
    try { return localStorage.getItem("apex_ai_autotrade") === "true"; }
    catch { return false; }
  });

  const setEnabled = (v: boolean) => {
    setEnabledRaw(v);
    try { localStorage.setItem("apex_ai_autotrade", v ? "true" : "false"); }
    catch {}
  };

  return (
    <AIAutoTradeContext.Provider value={{ enabled, setEnabled, positions: 0, maxPositions: 6 }}>
      {children}
    </AIAutoTradeContext.Provider>
  );
}

export const useAIAutoTrade = () => useContext(AIAutoTradeContext);
