import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { AlpacaHealth } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────
export type BrokerStatus =
  | "idle"
  | "onboarding"
  | "pending_verification"
  | "paper_active"
  | "live_active"
  | "rejected";

interface BrokerContextType {
  status:            BrokerStatus;
  accountNumber:     string | null;
  isOnboardingOpen:  boolean;
  openOnboarding:    () => void;
  closeOnboarding:   () => void;
  setStatus:         (s: BrokerStatus, acct?: string) => void;
  // Real Alpaca account data
  equity:            number;
  buyingPower:       number;
  alpacaOk:          boolean;
  marketDataOk:      boolean;
}

// ── Persistence ───────────────────────────────────────────────────────────────
const SK = "apex_broker";

function loadStatus(): BrokerStatus {
  try { return (localStorage.getItem(`${SK}_status`) as BrokerStatus) || "idle"; }
  catch { return "idle"; }
}
function loadAccount(): string | null {
  try { return localStorage.getItem(`${SK}_account`); }
  catch { return null; }
}

// ── Context ───────────────────────────────────────────────────────────────────
const Ctx = createContext<BrokerContextType | null>(null);

export function BrokerConnectionProvider({ children }: { children: ReactNode }) {
  const [status,        setStatusState]  = useState<BrokerStatus>(loadStatus);
  const [accountNumber, setAccountState] = useState<string | null>(loadAccount);
  const [isOnboardingOpen, setOpen]      = useState(false);
  const [equity,        setEquity]       = useState(0);
  const [buyingPower,   setBuyingPower]  = useState(0);
  const [alpacaOk,      setAlpacaOk]    = useState(false);
  const [marketDataOk,  setMarketDataOk] = useState(false);

  // On mount: verify credentials if already active
  useEffect(() => {
    const s = loadStatus();
    if (s === "paper_active" || s === "live_active") {
      void checkHealth(s);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkHealth(currentStatus: BrokerStatus) {
    try {
      const res = await fetch("/api/exchange/alpaca/health");
      if (!res.ok) return;
      const data = (await res.json()) as AlpacaHealth;
      if (!data.configured || !data.auth) {
        // Credentials missing or invalid — reset to idle
        setStatusRaw("idle");
        return;
      }
      setEquity(data.equity);
      setBuyingPower(data.buyingPower);
      setAlpacaOk(data.auth);
      setMarketDataOk(data.marketData);
      // Persist active status (already set)
      if (currentStatus !== "paper_active" && currentStatus !== "live_active") {
        setStatusRaw("paper_active");
      }
    } catch {
      // Network error — don't reset, just leave as-is
    }
  }

  function setStatusRaw(s: BrokerStatus) {
    setStatusState(s);
    try { localStorage.setItem(`${SK}_status`, s); } catch {}
  }

  const setStatus = (s: BrokerStatus, acct?: string) => {
    setStatusRaw(s);
    if (acct !== undefined) {
      setAccountState(acct);
      try { localStorage.setItem(`${SK}_account`, acct); } catch {}
    }
    // When becoming active, run a health check to populate account data
    if (s === "paper_active" || s === "live_active") {
      void checkHealth(s);
    }
  };

  return (
    <Ctx.Provider value={{
      status, accountNumber, isOnboardingOpen,
      openOnboarding:  () => setOpen(true),
      closeOnboarding: () => setOpen(false),
      setStatus,
      equity, buyingPower, alpacaOk, marketDataOk,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBrokerConnection() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBrokerConnection must be within BrokerConnectionProvider");
  return ctx;
}
