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
// 2026-05-28 — sticky flag set ONLY when the user explicitly chose PAPER
// via the runtime switcher AFTER LIVE was actually available
// (liveReady + hasExchange + canUseLive). If set, auto-promotion to LIVE
// is suppressed for this user/device until they explicitly toggle back.
// Set==="1" → explicit paper override is sticky.
const EXPLICIT_PAPER_KEY = "acl_portal_mode_explicit_paper_v1";

function readExplicitPaper(): boolean {
  try { return localStorage.getItem(EXPLICIT_PAPER_KEY) === "1"; }
  catch { return false; }
}
function writeExplicitPaper(on: boolean) {
  try {
    if (on) localStorage.setItem(EXPLICIT_PAPER_KEY, "1");
    else    localStorage.removeItem(EXPLICIT_PAPER_KEY);
  } catch { /* tolerate quota errors */ }
}

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
  tier:             PortalTier;
  hasExchange:      boolean;
  /**
   * Server-truth signal that the runtime aggregator has resolved this user
   * to a healthy active live exchange (mirrors `/api/user/runtime-state`
   * `liveReady`). When TRUE and the user has NOT explicitly forced paper,
   * the provider auto-promotes local `mode` from PAPER → LIVE so the
   * SignalRow execution gate (which reads provider state, not server
   * state) matches the top strip "LIVE READY" chrome.
   *
   * Without this signal, provider initializes to PAPER from localStorage
   * default and never flips — producing the 2026-05-28 regression where
   * `LIVE READY · COINBASE` shows in the header but `fireTrade` falls
   * through to `firePaperSim` because `portalMode.mode === "PAPER"`.
   */
  runtimeLiveReady?: boolean;
  children:         ReactNode;
}

export function PortalModeProvider({ tier, hasExchange, runtimeLiveReady = false, children }: ProviderProps) {
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
    // 2026-05-28 sticky-paper override. Set the sticky flag ONLY when the
    // user explicitly chooses PAPER while LIVE is actually available
    // (canUseLive + hasExchange + runtimeLiveReady) — otherwise picking
    // PAPER under a locked-out condition would spuriously suppress
    // future auto-promotion. Clearing on LIVE re-opt-in.
    if (m === "PAPER" && canUseLive && hasExchange && runtimeLiveReady) {
      writeExplicitPaper(true);
    } else if (m === "LIVE") {
      writeExplicitPaper(false);
    }
  }, [canUseLive, hasExchange, runtimeLiveReady]);

  // 2026-05-28 auto-promotion — sync provider local `mode` to server-truth
  // `liveReady` so SignalRow.fireTrade's gate (reads provider state) stops
  // diverging from the runtime-state aggregator (powers the LIVE READY
  // header chrome). Conditions must ALL hold:
  //   • runtimeLiveReady === true        (server says ready)
  //   • hasExchange === true             (provider has an exchange)
  //   • canUseLive === true              (paid tier)
  //   • mode === "PAPER"                 (we're behind)
  //   • !readExplicitPaper()             (user has not explicitly opted out)
  // The opposite direction (LIVE → PAPER) is INTENTIONALLY one-way here —
  // demoting to PAPER when liveReady drops would be jarring mid-session
  // (e.g. transient balance poll failure). The existing tier-downgrade
  // effect above still snaps free-tier back to PAPER unconditionally.
  useEffect(() => {
    if (
      runtimeLiveReady &&
      hasExchange &&
      canUseLive &&
      mode === "PAPER" &&
      !readExplicitPaper()
    ) {
      setModeState("LIVE");
      writeStored("LIVE");
    }
  }, [runtimeLiveReady, hasExchange, canUseLive, mode]);

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
