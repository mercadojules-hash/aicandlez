import { createContext, useContext, useState, type ReactNode } from "react";
import type { AlpacaActivateResult } from "@/lib/api";

interface AIAutoTradeCtx {
  enabled:      boolean;
  setEnabled:   (v: boolean) => void;
  positions:    number;
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

    // When enabling, try to activate Alpaca paper trading
    if (v) {
      void fetch("/api/exchange/alpaca/activate", { method: "POST" })
        .then(r => r.ok ? r.json() as Promise<AlpacaActivateResult> : null)
        .then(data => {
          if (data?.ok) {
            console.debug("[AIAutoTrade] Alpaca activated — equity:", data.equity);
          }
        })
        .catch(() => { /* credentials may not be set — silently ignore */ });
    }
  };

  return (
    <AIAutoTradeContext.Provider value={{ enabled, setEnabled, positions: 0, maxPositions: 6 }}>
      {children}
    </AIAutoTradeContext.Provider>
  );
}

export const useAIAutoTrade = () => useContext(AIAutoTradeContext);
