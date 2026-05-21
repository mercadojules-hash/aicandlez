import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { AlpacaHealth } from "@/lib/api";

// Cross-origin API base — production lives on api.aicandlez.com via
// VITE_API_BASE_URL. Falls back to same-origin "/api" in dev. NEVER use a
// bare relative "/api/..." here — on app.aicandlez.com that returns the SPA
// index.html with status 200, which then fails JSON.parse silently and
// leaves the broker provider stuck in "idle" state.
const API_BASE = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? ""
).replace(/\/$/, "") + "/api";

// ── Types ─────────────────────────────────────────────────────────────────────
export type BrokerStatus =
  | "idle"
  | "onboarding"
  | "pending_verification"
  | "paper_active"
  | "live_active"
  | "rejected"
  | "credential_error";

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
  credentialError:   string | null;
}

// ── Persistence ───────────────────────────────────────────────────────────────
const SK = "ac_broker";

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
  const [alpacaOk,        setAlpacaOk]       = useState(false);
  const [marketDataOk,    setMarketDataOk]   = useState(false);
  const [credentialError, setCredentialError] = useState<string | null>(null);

  // On mount: always run a health check so credential_error shows immediately
  useEffect(() => {
    void checkHealth(loadStatus());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkHealth(currentStatus: BrokerStatus) {
    try {
      const res = await fetch(`${API_BASE}/exchange/alpaca/health`, {
        credentials: "include",
        headers:     { Accept: "application/json" },
      });
      if (!res.ok) return;
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        console.error("[broker-health] non-JSON response", { contentType, url: `${API_BASE}/exchange/alpaca/health` });
        return;
      }
      const data = (await res.json()) as AlpacaHealth;

      if (!data.configured) {
        setCredentialError("Alpaca API keys are not configured in server environment.");
        if (currentStatus === "paper_active" || currentStatus === "live_active") {
          setStatusRaw("credential_error");
        }
        return;
      }

      if (!data.auth) {
        // Keys present but invalid — distinguish Broker vs Paper key type
        const hint = "Credentials rejected (HTTP 401). You may be using Broker API keys (CK prefix). Paper trading requires Paper Trading API keys (PK prefix) — generate them at app.alpaca.markets under Paper Trading → API Keys.";
        setCredentialError(hint);
        if (currentStatus === "paper_active" || currentStatus === "live_active") {
          setStatusRaw("credential_error");
        }
        return;
      }

      // Credentials are valid
      setCredentialError(null);
      setEquity(data.equity);
      setBuyingPower(data.buyingPower);
      setAlpacaOk(data.auth);
      setMarketDataOk(data.marketData);
      if (currentStatus !== "paper_active" && currentStatus !== "live_active") {
        setStatusRaw("paper_active");
      }
    } catch {
      // Network error — don't reset
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
      credentialError,
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
