import { createContext, useContext, useState, type ReactNode } from "react";

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

  const setStatus = (s: BrokerStatus, acct?: string) => {
    setStatusState(s);
    try { localStorage.setItem(`${SK}_status`, s); } catch {}
    if (acct !== undefined) {
      setAccountState(acct);
      try { localStorage.setItem(`${SK}_account`, acct); } catch {}
    }
  };

  return (
    <Ctx.Provider value={{
      status, accountNumber, isOnboardingOpen,
      openOnboarding:  () => setOpen(true),
      closeOnboarding: () => setOpen(false),
      setStatus,
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
