/**
 * PortalModeContext — customer /portal PAPER vs LIVE mode.
 *
 * Scope:
 *   • Only mounted on the customer Portal path (`!isAdmin`).
 *   • Admins on /admintrade never see this — they are real-only, always LIVE,
 *     unconditionally, regardless of localStorage.
 *
 * Persistence: localStorage key `acl_portal_mode_v1`.
 * Free users are hard-locked to PAPER (cannot switch).
 * Paid users (starter/pro) get a real toggle.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PortalMode = "PAPER" | "LIVE";
export type PortalTier = "free" | "starter" | "pro";

const STORAGE_KEY = "acl_portal_mode_v1";
const SANDBOX_STORAGE_KEY = "acl_portal_paper_sandbox_v1";

/**
 * Exchanges with a public testnet / sandbox host that the adapter factory
 * can switch into via `{ testnet: true }`. Must stay in sync with
 * `SANDBOX_SUPPORTED_EXCHANGES` in
 * `artifacts/api-server/src/services/exchanges/adapterFactory.ts`.
 */
export const SANDBOX_SUPPORTED_EXCHANGES = new Set<string>([
  "Binance",
  "Gemini",
  "GateIO",
  "Phemex",
]);

export function exchangeSupportsSandbox(exchange: string | null | undefined): boolean {
  return !!exchange && SANDBOX_SUPPORTED_EXCHANGES.has(exchange);
}

function readSandboxStored(): boolean {
  try { return localStorage.getItem(SANDBOX_STORAGE_KEY) === "1"; }
  catch { return false; }
}

function writeSandboxStored(on: boolean) {
  try { localStorage.setItem(SANDBOX_STORAGE_KEY, on ? "1" : "0"); }
  catch { /* tolerate quota errors */ }
}

function readStored(): PortalMode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "LIVE" || raw === "PAPER" ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(mode: PortalMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch { /* tolerate quota errors */ }
}

interface PortalModeContextValue {
  mode:             PortalMode;
  setMode:          (m: PortalMode) => void;
  canUseLive:       boolean;            // paid tier
  hasExchange:      boolean;            // at least one active exchange connection
  liveLockReason:   string | null;      // human-readable reason live is locked, if locked
  tier:             PortalTier;
  /** PAPER-mode opt-in: route orders through exchange's public sandbox. */
  paperSandboxEnabled: boolean;
  setPaperSandboxEnabled: (on: boolean) => void;
}

const PortalModeContext = createContext<PortalModeContextValue | null>(null);

interface ProviderProps {
  tier:        PortalTier;
  hasExchange: boolean;
  children:    ReactNode;
}

export function PortalModeProvider({ tier, hasExchange, children }: ProviderProps) {
  const canUseLive = tier === "starter" || tier === "pro";

  const [mode, setModeState] = useState<PortalMode>(() => {
    const stored = readStored();
    // Free tier is always forced to PAPER on read.
    if (!canUseLive) return "PAPER";
    return stored ?? "PAPER";
  });

  const [paperSandboxEnabled, setPaperSandboxState] = useState<boolean>(() => readSandboxStored());

  const setPaperSandboxEnabled = useCallback((on: boolean) => {
    setPaperSandboxState(on);
    writeSandboxStored(on);
  }, []);

  // Cross-tab sync for the sandbox preference.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SANDBOX_STORAGE_KEY) return;
      setPaperSandboxState(e.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // When tier downgrades to free mid-session, snap back to PAPER and clear LIVE.
  useEffect(() => {
    if (!canUseLive && mode !== "PAPER") {
      setModeState("PAPER");
      writeStored("PAPER");
    }
  }, [canUseLive, mode]);

  // Cross-tab sync via storage events.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue === "LIVE" || e.newValue === "PAPER" ? e.newValue : "PAPER";
      if (!canUseLive && next === "LIVE") return;
      setModeState(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [canUseLive]);

  const setMode = useCallback((m: PortalMode) => {
    // Free tier cannot switch to LIVE.
    if (m === "LIVE" && !canUseLive) return;
    setModeState(m);
    writeStored(m);
  }, [canUseLive]);

  const liveLockReason = useMemo<string | null>(() => {
    if (!canUseLive) return "Upgrade to unlock LIVE";
    if (!hasExchange) return "Connect an exchange to enable LIVE";
    return null;
  }, [canUseLive, hasExchange]);

  const value: PortalModeContextValue = useMemo(() => ({
    mode,
    setMode,
    canUseLive,
    hasExchange,
    liveLockReason,
    tier,
    paperSandboxEnabled,
    setPaperSandboxEnabled,
  }), [mode, setMode, canUseLive, hasExchange, liveLockReason, tier, paperSandboxEnabled, setPaperSandboxEnabled]);

  return (
    <PortalModeContext.Provider value={value}>
      {children}
    </PortalModeContext.Provider>
  );
}

/**
 * Returns the current Portal mode context, or a safe inert default when called
 * outside the customer Portal tree (e.g. SignalRow rendered on /command for
 * admins). Default mode is `LIVE` for admins (`tierOverride === "pro"` and no
 * provider mounted on admin path) — admin BUY/SELL has always been treated as
 * a live operator action there, so this preserves existing behavior.
 */
export function usePortalMode(): PortalModeContextValue & { isCustomerPortal: boolean } {
  const ctx = useContext(PortalModeContext);
  if (ctx) return { ...ctx, isCustomerPortal: true };
  return {
    mode:           "PAPER",
    setMode:        () => {},
    canUseLive:     false,
    hasExchange:    false,
    liveLockReason: null,
    tier:           "free",
    paperSandboxEnabled:    false,
    setPaperSandboxEnabled: () => {},
    isCustomerPortal: false,
  };
}

/**
 * Context-free reader for the persisted portal mode. Lets components mounted
 * OUTSIDE the PortalModeProvider (e.g. PortalInner's metric tiles, which
 * render before the provider wraps them) observe and react to mode changes
 * without a refactor. Cross-tab synced via the same storage event.
 */
export function useStoredPortalMode(): PortalMode {
  const [mode, setMode] = useState<PortalMode>(() => readStored() ?? "PAPER");
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setMode(e.newValue === "LIVE" ? "LIVE" : "PAPER");
    };
    window.addEventListener("storage", onStorage);
    // Also re-read on mount in case the provider wrote before us.
    setMode(readStored() ?? "PAPER");
    const id = window.setInterval(() => {
      const cur = readStored() ?? "PAPER";
      setMode(prev => (prev === cur ? prev : cur));
    }, 1000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(id);
    };
  }, []);
  return mode;
}
