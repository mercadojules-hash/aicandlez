/**
 * AIAutoTradeContext — server-backed AI auto-trade toggle for the PWA.
 *
 * Subscription-gated. Source of truth lives in `user_settings.autoMode`
 * on the API server; localStorage is a transient mirror only so the
 * pre-hydrate UI doesn't flash the wrong state. Even if a user manually
 * edits localStorage, the server gate (`resolveAiTradingGate`) and
 * per-trade live-execution gate reject unauthorized flips.
 *
 * State machine:
 *   allowed=false → setEnabled(true) is a no-op + sets `needsUpgrade`
 *                   so the caller can route to the upgrade screen.
 *   allowed=true  → setEnabled persists via POST /user/ai-trading/enable.
 *                   `enabled` only flips after the server confirms.
 */
import { authFetch } from "@/lib/authFetch";
import { getArmedForLive, setArmedForLive } from "@/hooks/useArmedForLive";
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

type Plan = "free" | "starter" | "pro";

interface AiTradingStateResponse {
  enabled: boolean;
  allowed: boolean;
  plan:    Plan;
  isAdmin: boolean;
  reason:  string | null;
}

interface AIAutoTradeCtx {
  enabled:       boolean;
  allowed:       boolean;
  plan:          Plan;
  isAdmin:       boolean;
  needsUpgrade:  boolean;
  setEnabled:    (v: boolean) => Promise<void>;
  clearUpgrade:  () => void;
  positions:     number;
  maxPositions:  number;
}

const LS_KEY = "ac_ai_autotrade";

const AIAutoTradeContext = createContext<AIAutoTradeCtx>({
  enabled:      false,
  allowed:      false,
  plan:         "free",
  isAdmin:      false,
  needsUpgrade: false,
  setEnabled:   async () => {},
  clearUpgrade: () => {},
  positions:    0,
  maxPositions: 3,
});

export function AIAutoTradeProvider({ children }: { children: ReactNode }) {
  // LocalStorage is a mirror only — used to avoid an OFF flash on first
  // paint before the hydration query returns. Never trusted as truth.
  const [enabled, setEnabledRaw] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_KEY) === "true"; }
    catch { return false; }
  });
  const [allowed,      setAllowed]      = useState(false);
  const [plan,         setPlan]         = useState<Plan>("free");
  const [isAdmin,      setIsAdmin]      = useState(false);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);

  // Hydrate from server, then poll every 60s so plan changes (e.g.
  // user upgraded in another tab) reach this provider without reload.
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const res  = await authFetch("/api/user/ai-trading/state");
        if (!res.ok) return;
        const data = (await res.json()) as AiTradingStateResponse;
        if (cancelled) return;
        const serverEnabled = !!data.enabled && !!data.allowed;
        setEnabledRaw(serverEnabled);
        setAllowed(!!data.allowed);
        setPlan(data.plan ?? "free");
        setIsAdmin(!!data.isAdmin);
        try { localStorage.setItem(LS_KEY, serverEnabled ? "true" : "false"); } catch {}
      } catch { /* fail-quiet — keeps last-known state */ }
    };
    void hydrate();
    const id = setInterval(hydrate, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const setEnabled = useCallback(async (v: boolean): Promise<void> => {
    // Disabling is always allowed — let the user turn AI off instantly.
    if (!v) {
      setEnabledRaw(false);
      try { localStorage.setItem(LS_KEY, "false"); } catch {}
      try {
        await authFetch("/api/user/ai-trading/enable", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ enabled: false }),
        });
      } catch { /* fail-quiet on disable */ }
      return;
    }

    // Enabling — server is authoritative. If it rejects with 402,
    // surface `needsUpgrade` so the caller routes to /subscribe.
    //
    // Auto-arm the per-session live gate (May 2026): ACTIVATE AI
    // TRADING is now the single customer-facing arming surface. The
    // separate ARM LIVE chip on the runtime switcher was removed
    // because the double-arm flow (pick exchange → ARM → ACTIVATE)
    // was operationally confusing. The disclaimer gate enforced on
    // the server is the user's authorization step; arming is an
    // internal infrastructure detail. Safe-by-construction: server
    // still enforces env kill switch + subscription + disclaimer +
    // runtime gates regardless of this flag.
    setArmedForLive(true);
    try {
      const res = await authFetch("/api/user/ai-trading/enable", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ enabled: true, armedForLive: getArmedForLive() }),
      });
      if (res.status === 402) {
        setNeedsUpgrade(true);
        return;
      }
      if (res.status === 412) {
        // runtime_not_armed — defensive only since May 2026 because
        // we set `armedForLive=true` above before this POST. Hitting
        // it means a client/server desync; clear the local flag so
        // the next ACTIVATE click re-arms cleanly, and keep AI off.
        // (PWA surfaces failure via `needsUpgrade`-style hooks; we
        // intentionally don't toast here to avoid coupling this
        // context to a UI lib.)
        setArmedForLive(false);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as AiTradingStateResponse;
      const serverEnabled = !!data.enabled && !!data.allowed;
      setEnabledRaw(serverEnabled);
      setAllowed(!!data.allowed);
      setPlan(data.plan ?? "free");
      setIsAdmin(!!data.isAdmin);
      try { localStorage.setItem(LS_KEY, serverEnabled ? "true" : "false"); } catch {}
    } catch {
      // Network failed — don't pretend AI is on.
    }
  }, []);

  const clearUpgrade = useCallback(() => setNeedsUpgrade(false), []);

  return (
    <AIAutoTradeContext.Provider value={{
      enabled, allowed, plan, isAdmin, needsUpgrade,
      setEnabled, clearUpgrade,
      positions: 0, maxPositions: 3,
    }}>
      {children}
    </AIAutoTradeContext.Provider>
  );
}

export const useAIAutoTrade = () => useContext(AIAutoTradeContext);
