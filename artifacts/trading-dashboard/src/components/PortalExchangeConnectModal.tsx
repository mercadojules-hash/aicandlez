/**
 * PortalExchangeConnectModal — local modal for the /portal Connect Exchange CTA.
 *
 * Hosts the full Connect-Exchange flow inline on the trade.aicandlez.com /portal
 * route. Replaces the prior cross-app hard-navigation to
 * https://app.aicandlez.com/settings/exchanges, which trapped users on the PWA's
 * settings screen after closing the X. Per the production bug report, closing X
 * must:
 *   • close the modal ONLY
 *   • preserve current route/state (stay on /portal)
 *   • not push browser history
 *   • not mount profile/settings views
 *
 * Submission flow:
 *   • Auth: Clerk Bearer + httpOnly session cookie (matches Portal pattern)
 *   • POST /api/user/exchanges/connect — server-side requireDisclaimer
 *     middleware blocks customers who have not accepted the disclaimer
 *     (412 → caller pre-checks via useDisclaimerGate).
 *   • Withdrawal permissions are never requested (security promise — see
 *     replit.md). The connect endpoint refuses to enable withdrawal capability.
 */

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X, Loader2, ShieldCheck, AlertTriangle, Check, Link2Off, FlaskConical,
  ArrowRight, ArrowLeft, Lock, Zap, KeyRound, BookOpen, Sparkles,
} from "lucide-react";

import { authFetch } from "../lib/authFetch";
import { DisclaimerModal } from "./DisclaimerModal";
import type { DisclaimerAcks } from "@workspace/db/constants/disclaimer";
const N = {
  BG_OVERLAY: "rgba(0,0,0,0.86)",
  CARD:       "#0A1410",
  CARD_HI:    "#0F1F18",
  BORDER:     "rgba(255,255,255,0.10)",
  BRAND:      "#66FF66",
  BRAND_GLOW: "rgba(102,255,102,0.45)",
  BRAND_DEEP: "#00C853",
  BRAND_BRGT: "#7CFF00",
  TEXT_0:     "#E8F5EC",
  TEXT_1:     "#8A9C94",
  TEXT_2:     "#5A726A",
  ERROR:      "rgba(255,100,120,0.92)",
  FONT_MONO:  "ui-monospace, 'JetBrains Mono', Menlo, monospace",
  FONT_SANS:  "'SF Pro Display','Inter',system-ui,-apple-system,sans-serif",
};

// R1 (exchange registry unification) — the modal no longer hardcodes the
// supported-exchange list. Provider list is hydrated from the backend
// `EXCHANGE_CATALOG` (via `GET /api/exchanges/catalog`) and joined with
// per-user connection state from `GET /api/user/exchanges`. The picker is
// therefore the same single source of truth as admin telemetry, customer
// telemetry, and the connect endpoint validator.
interface Exchange {
  id:               string;
  name:             string;
  logo:             string;
  needsPassphrase?: boolean;
  /** Registry-level status ("live" | "beta" | "coming_soon"). */
  status:           "live" | "beta" | "coming_soon" | "simulation";
  /** Connect flow disabled (coming_soon, or simulation pseudo-entry). */
  disabled?:        boolean;
  /** Tooltip / sub-label rendered next to a disabled tile. */
  comingSoonNote?:  string;
  /** Live capability (requires admin or live-trading grant to connect). */
  requiresLiveGate?: boolean;
  /** Per-user state — only set after merge with /api/user/exchanges. */
  connected?:       boolean;
  /** True when this is the user's currently-active default exchange. */
  isActive?:        boolean;
  /** Connection trading mode ("paper" | "live") when connected. */
  tradingMode?:     string;
}

// Customer portal default-visible exchanges (no admin grant needed). Every
// other catalog entry is rendered as "LIVE GATED" (disabled) for customers
// until `liveExchangesEnabled=true` is passed by the host. Admin/operator
// portal mounts the modal with `liveExchangesEnabled={isAdmin}` so all live
// and beta tiles unlock there.
//
// Alpaca: primary US-friendly onboarding path (paper + brokerage).
// Coming-soon (Robinhood, dYdX, Hyperliquid) tiles are always visible but
// disabled by their `status === "coming_soon"` branch — they do not need to
// appear here.
const CUSTOMER_DEFAULT_VISIBLE_IDS = new Set<string>(["Alpaca"]);

// Simulation/paper trading is always available — modelled as a virtual
// catalog entry so it renders alongside real exchanges with the same UI
// affordances (CONNECTED badge, ACTIVE highlight). It is NOT in
// EXCHANGE_CATALOG (no adapter, no credentials), and the picker click
// handler skips the connect form for this entry.
const SIMULATION_ENTRY: Exchange = {
  id:        "Simulation",
  name:      "Simulation",
  logo:      "S",
  status:    "simulation",
  disabled:  false,
  connected: true,
  comingSoonNote: "Always available · no credentials · paper trading only",
};

// Backend catalog row shape (subset — matches EXCHANGE_CATALOG).
type CatalogRow = {
  id:               string;
  name:             string;
  status:           "live" | "beta" | "coming_soon";
  requiresPassphrase?: boolean;
  customerVisible?: boolean;
  adminOnly?:       boolean;
  comingSoonNote?:  string;
};

// Exchanges that ship a no-risk demo-trading surface we can opt into at
// connect time. Currently empty — kept as an extension surface (e.g. if
// Bitget is ever re-added it would expose a `PAPTRADING: 1` REST header).
const DEMO_TRADING_EXCHANGES = new Set<string>();

// Phase 2 — Cinematic onboarding. Per-exchange brand metadata + per-exchange
// step-by-step API key walkthrough. Keep copy concise; this surfaces inside
// the modal's CREDENTIALS step under "How to get your API key". Only the
// "featured" set (Kraken / Coinbase / Binance / Alpaca) gets walkthroughs
// today; other exchanges fall back to the security note alone.
type ExchangeMeta = {
  /** Brand accent color (used for tile glow + walkthrough icon). */
  accent:        string;
  /** Short tagline shown under the name on the choose-step cards. */
  tagline:       string;
  /** Optional URL to open in a new tab for the user to start the API-key flow. */
  apiUrl?:       string;
  /** Step-by-step instructions for the credentials walkthrough panel. */
  walkthrough?:  string[];
  /** Required permission scopes the user must enable (audit checklist). */
  requiredPerms?: string[];
};
const EXCHANGE_META: Record<string, ExchangeMeta> = {
  Kraken: {
    accent: "#7B6CF7",
    tagline: "Largest US-regulated crypto exchange",
    apiUrl: "https://www.kraken.com/u/security/api",
    walkthrough: [
      "Log in to Kraken and open Settings → API",
      "Click 'Add key' and name it 'AICandlez'",
      "Enable: Query Funds, Query Open Orders, Create & Modify Orders",
      "Leave Withdraw Funds UNCHECKED — we never request it",
      "Copy the API Key and Private Key below",
    ],
    requiredPerms: ["Query funds", "Query orders", "Create & modify orders"],
  },
  Coinbase: {
    accent: "#3B82F6",
    tagline: "Public US exchange · institutional-grade liquidity",
    apiUrl: "https://www.coinbase.com/settings/api",
    walkthrough: [
      "Log in to Coinbase and open Advanced Trade → API",
      "Create a new CDP key (modern) or HMAC key (legacy)",
      "Permissions: View accounts, Trade — never Transfer",
      "Download the JSON file Coinbase emails you",
      "Paste 'name' into API KEY NAME and 'privateKey' into PRIVATE KEY",
    ],
    requiredPerms: ["View accounts", "Trade"],
  },
  Binance: {
    accent: "#F0B90B",
    tagline: "World's deepest crypto orderbook",
    apiUrl: "https://www.binance.com/en/my/settings/api-management",
    walkthrough: [
      "Log in to Binance and open API Management",
      "Click 'Create API' → 'System generated'",
      "Enable: Enable Reading, Enable Spot & Margin Trading",
      "DISABLE Enable Withdrawals and IP-restrict the key",
      "Copy the API Key and Secret Key below",
    ],
    requiredPerms: ["Enable Reading", "Spot & Margin Trading"],
  },
  Alpaca: {
    accent: "#FFE600",
    tagline: "US-friendly · paper trading included",
    apiUrl: "https://app.alpaca.markets/paper/dashboard/overview",
    walkthrough: [
      "Sign up for Alpaca and open Paper Trading dashboard",
      "Generate paper-account API keys in the right rail",
      "Copy the Key ID and Secret Key below",
      "Live trading requires KYC + an upgrade to a brokerage account",
    ],
    requiredPerms: ["Paper account access"],
  },
  CryptoDotCom: {
    accent: "#0033AD",
    tagline: "Mobile-first exchange · 100M+ users",
    walkthrough: [
      "Log in to Crypto.com Exchange (not the App)",
      "Open Profile → API Keys → Create New Key",
      "Enable: Spot Trading, Account Information",
      "Leave Withdraw OFF",
      "Copy the API Key and Secret below",
    ],
    requiredPerms: ["Spot Trading", "Account Information"],
  },
  Gemini: {
    accent: "#00DCFA",
    tagline: "NYDFS-licensed US exchange",
    apiUrl: "https://exchange.gemini.com/settings/api",
    walkthrough: [
      "Log in to Gemini and open Settings → API",
      "Create a new Master API key",
      "Scopes: Trader (Auditor is read-only — choose Trader)",
      "Withdrawals: leave DISABLED",
      "Copy the API Key and Secret below",
    ],
    requiredPerms: ["Trader scope"],
  },
};
/** Featured-card lineup on the CHOOSE step (large branded cards at top). */
const FEATURED_EXCHANGE_IDS = ["Kraken", "Coinbase", "Binance"] as const;
function getExchangeMeta(id: string): ExchangeMeta {
  return EXCHANGE_META[id] ?? { accent: "#66FF66", tagline: "Trading account" };
}

interface Props {
  open:    boolean;
  onClose: () => void;
  /**
   * Optional ID (matches backend catalog: "Alpaca" | "Kraken" | "Coinbase" |
   * "CryptoDotCom" | "Binance") to lock the exchange picker to a single
   * choice. Used by OnboardingFlow when the user picks the "Create / Fund
   * Alpaca" path so they can't switch away mid-flow.
   */
  preselectedExchange?: string;
  /**
   * Task #165 — gate live-trading exchanges (Kraken / Coinbase / Crypto.com /
   * Binance) behind explicit opt-in. Default = false → customer surface shows
   * Alpaca-only (paper trading). Set to `true` only after the user has been
   * granted live-trading permission by an admin. Admin / super-admin role
   * bypass is handled by the caller passing `true`.
   */
  liveExchangesEnabled?: boolean;
  /** Fires after a successful connect. OnboardingFlow uses it to advance state. */
  onConnected?: () => void;
}

type ConnectedRow = {
  exchange: string;
  connected: boolean;
  connection: { tradingMode: string; status: string; label: string | null } | null;
};

export function PortalExchangeConnectModal({ open, onClose, preselectedExchange, liveExchangesEnabled = false, onConnected }: Props) {
  const { getToken } = useAuth();
  const qc           = useQueryClient();
  // Inline disclaimer state — owned by this modal so the flow is
  // transparent and we don't rely on the shared `useDisclaimerGate`
  // hook which has been observed silently failing to render its modal
  // in some browser configurations (Chrome + cross-subdomain + Clerk).
  // Trigger is server-driven: POST /api/user/exchanges/connect returns
  // 412 + needsDisclaimer:true when the customer hasn't accepted.
  const [discOpen,       setDiscOpen]       = useState(false);
  const [discSubmitting, setDiscSubmitting] = useState(false);
  const [discError,      setDiscError]      = useState<string | null>(null);

  // R1 — catalog hydrated from backend (single source of truth).
  // Public endpoint, no auth required.
  const { data: catalogData } = useQuery<{ exchanges: CatalogRow[] }>({
    queryKey:  ["exchanges-catalog"],
    queryFn:   async () => {
      const r = await authFetch("/api/exchanges/catalog", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    enabled:   open,
    staleTime: 5 * 60_000,
    retry:     false,
  });

  // Bootstrap fallback (used only on first render before catalog query resolves
  // — prevents picker from being empty / `picked` from being undefined). Mirrors
  // the Tier-1 live set + Robinhood + Simulation to avoid a visible flash.
  const FALLBACK_CATALOG: CatalogRow[] = [
    { id: "Alpaca",       name: "Alpaca",      status: "live" },
    { id: "Kraken",       name: "Kraken",      status: "live" },
    { id: "Coinbase",     name: "Coinbase",    status: "live" },
    { id: "CryptoDotCom", name: "Crypto.com",  status: "live" },
    { id: "Binance",      name: "Binance",     status: "live" },
    { id: "Gemini",       name: "Gemini",      status: "live" },
    { id: "Robinhood",    name: "Robinhood",   status: "coming_soon",
      comingSoonNote: "Integration in progress — pending compliance review" },
  ];
  const catalog = catalogData?.exchanges ?? FALLBACK_CATALOG;
  const [disconnecting,    setDisconnecting]    = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnectError,   setDisconnectError]   = useState<string | null>(null);
  const [disconnectDone,    setDisconnectDone]    = useState(false);

  // Live connection status so the modal can flip its CTA from "Connect" to
  // "Disconnect" when the picked exchange is already linked, and so the
  // picker can render CONNECTED / ACTIVE badges per tile.
  const { data: exchangesData } = useQuery<{ exchanges: ConnectedRow[] }>({
    queryKey:  ["user-exchanges"],
    queryFn:   async () => {
      const token = await getToken().catch(() => null);
      const r = await authFetch("/api/user/exchanges", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    enabled:   open,
    staleTime: 15_000,
    retry:     false,
  });

  // R1 — derive picker rows by joining catalog × connection state. Order:
  //   1. Catalog order (Alpaca, Kraken, Coinbase, Crypto.com, Binance, Gemini, …)
  //   2. Robinhood (coming_soon, disabled)
  //   3. Simulation pseudo-entry (always last; never connectable, always "available")
  // Gating:
  //   • Customer (liveExchangesEnabled=false, no preselection): Alpaca, Robinhood,
  //     Simulation enabled; LIVE_GATED_IDS rendered disabled with
  //     "REQUIRES LIVE TRADING ACCESS" sub-label.
  //   • Admin/preselection: every tile enabled (except registry coming_soon).
  const allExchanges: Exchange[] = (() => {
    const rows: Exchange[] = catalog
      .filter(c => !c.adminOnly || liveExchangesEnabled)
      .filter(c => c.customerVisible !== false || liveExchangesEnabled)
      .map(c => {
        const conn = exchangesData?.exchanges?.find(e => e.exchange === c.id) ?? null;
        const isComingSoon = c.status === "coming_soon";
        // R1 — every catalog row is "live gated" for customers EXCEPT the
        // default-visible allowlist (Alpaca) and coming_soon registry tiles
        // (handled separately). Beta exchanges (GateIO, Bitget, MEXC, HTX,
        // Bitstamp, Phemex, BloFin, BingX) therefore stay disabled for
        // non-admin customers — fixing R1 architect-flagged regression where
        // they would otherwise be selectable + submittable to /connect.
        const requiresLiveGate = !isComingSoon && !CUSTOMER_DEFAULT_VISIBLE_IDS.has(c.id);
        const gatedForCustomer = requiresLiveGate
          && !liveExchangesEnabled
          && preselectedExchange !== c.id;
        return {
          id:               c.id,
          name:             c.name,
          // Single-letter sigil fallback for tiles (mirrors the original
          // EXCHANGES[].logo affordance until brand SVGs are wired up).
          logo:             c.name.charAt(0).toUpperCase(),
          needsPassphrase:  !!c.requiresPassphrase,
          status:           c.status,
          disabled:         isComingSoon || gatedForCustomer,
          comingSoonNote:   isComingSoon
            ? (c.comingSoonNote ?? "Coming soon")
            : gatedForCustomer
              ? "Requires live trading access"
              : undefined,
          requiresLiveGate,
          connected:        !!conn?.connected,
          isActive:         !!(conn?.connected && (conn as { connection?: { isDefault?: boolean } | null }).connection?.isDefault),
          tradingMode:      conn?.connection?.tradingMode ?? undefined,
        };
      });
    rows.push({ ...SIMULATION_ENTRY });
    return rows;
  })();

  // Connectable subset used by the initial-pick + reset logic. Excludes
  // disabled tiles (coming_soon, gated) and the Simulation pseudo-entry,
  // which all have no credential form.
  const connectableExchanges = allExchanges.filter(e => !e.disabled && e.status !== "simulation");
  const visibleExchanges     = allExchanges;

  const fallbackPick: Exchange = connectableExchanges[0]
    ?? allExchanges[0]
    ?? { id: "Alpaca", name: "Alpaca", logo: "A", status: "live" };
  const [picked, setPicked] = useState<Exchange>(() => {
    if (preselectedExchange) {
      const m = allExchanges.find(e => e.id === preselectedExchange);
      if (m && !m.disabled && m.status !== "simulation") return m;
    }
    return fallbackPick;
  });

  // Keep `picked` referentially fresh against the latest catalog/connection
  // merge so the picker tile state (CONNECTED / ACTIVE badges) stays in sync.
  useEffect(() => {
    const fresh = allExchanges.find(e => e.id === picked.id);
    if (fresh && fresh !== picked
        && (fresh.connected !== picked.connected || fresh.isActive !== picked.isActive)) {
      setPicked(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogData, exchangesData]);

  const pickedConn = exchangesData?.exchanges?.find(e => e.exchange === picked.id && e.connected) ?? null;
  // `useState(initialPick)` only fires on mount, so a later `preselectedExchange`
  // change (e.g., re-entering the connect step with a different lock) would
  // be silently ignored. Sync via effect.
  useEffect(() => {
    if (!preselectedExchange) return;
    const next = allExchanges.find(e => e.id === preselectedExchange);
    if (next && !next.disabled && next.status !== "simulation" && next.id !== picked.id) {
      setPicked(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedExchange]);
  const [label,      setLabel]      = useState("");
  const [apiKey,     setApiKey]     = useState("");
  const [apiSecret,  setApiSecret]  = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [demoMode,   setDemoMode]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState(false);
  // Phase 2 — cinematic multi-step flow.
  //   "choose"      → exchange selection (featured cards + paper/live compare)
  //   "credentials" → per-exchange walkthrough + key form
  // Preselected exchanges (e.g. OnboardingFlow locking to Alpaca) skip
  // CHOOSE and land directly on CREDENTIALS. Success/disconnect/already-
  // connected branches are NOT step-gated — they preempt the multi-step
  // render entirely (preserving the existing behavior).
  const [step, setStep] = useState<"choose" | "credentials">(
    preselectedExchange ? "credentials" : "choose"
  );
  // Keep step in sync with preselection changes (mirrors picked-sync effect).
  useEffect(() => {
    if (preselectedExchange) setStep("credentials");
    else if (open) setStep("choose");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedExchange, open]);
  // Demo-trading toggle only applies to exchanges whose adapter honours the
  // demoMode flag (Bitget today). Reset when the user switches exchanges so
  // the flag never carries over from a previous picker selection.
  const demoSupported = DEMO_TRADING_EXCHANGES.has(picked.id);
  useEffect(() => {
    if (!demoSupported && demoMode) setDemoMode(false);
  }, [demoSupported, demoMode]);

  if (!open) return null;

  const reset = () => {
    setPicked(fallbackPick); setLabel(""); setApiKey(""); setApiSecret("");
    setPassphrase(""); setDemoMode(false); setError(null); setSuccess(false);
    setSubmitting(false);
    setConfirmDisconnect(false); setDisconnecting(false);
    setDisconnectError(null); setDisconnectDone(false);
    setStep(preselectedExchange ? "credentials" : "choose");
  };

  // Close button MUST stay local — never navigate, never push history.
  const handleClose = () => {
    if (submitting || disconnecting) return;
    reset();
    onClose();
  };

  const handleDisconnect = async () => {
    if (disconnecting || !pickedConn) return;
    setDisconnecting(true);
    setDisconnectError(null);
    try {
      const token = await getToken().catch(() => null);
      const r = await authFetch(`/api/user/exchanges/${picked.id}`, {
        method:      "DELETE",
        credentials: "include",
        headers:     token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await r.json().catch(() => ({} as { error?: string; revokeError?: string }));
      if (!r.ok) {
        throw new Error((data as { error?: string }).error
          ?? `Disconnect failed (HTTP ${r.status}).`);
      }
      // Mirror the connect-flow invalidation set so every surface that watches
      // exchange state (Portal status pills, Profile, OnboardingFlow) refreshes
      // in lockstep with the disconnect.
      qc.invalidateQueries({ queryKey: ["user-exchanges"] });
      qc.invalidateQueries({ queryKey: ["exchange-connections"] });
      qc.invalidateQueries({ queryKey: ["onboarding-exchanges"] });
      qc.invalidateQueries({ queryKey: ["portal-exchanges-status"] });
      setDisconnectDone(true);
      setTimeout(() => { reset(); onClose(); }, 1500);
    } catch (e) {
      setDisconnectError(e instanceof Error ? e.message : "Disconnect failed.");
    } finally {
      setDisconnecting(false);
    }
  };

  const canSubmit =
    !!apiKey.trim() &&
    !!apiSecret.trim() &&
    (!picked.needsPassphrase || !!passphrase.trim()) &&
    !submitting;

  const submitConnect = async () => {
    setSubmitting(true);
    setError(null);
    // Coinbase pre-flight: only validate when the key looks like a modern
    // CDP key (starts with `organizations/`). The backend adapter also
    // supports legacy HMAC and UUID/base64 secrets, so we must NOT block
    // those formats. The trap we're catching: users paste the CDP `name`
    // string into BOTH fields, causing OpenSSL `DECODER routines::unsupported`
    // on the server. Only fire when key shape unambiguously indicates CDP.
    if (picked.id === "Coinbase" && apiKey.trim().startsWith("organizations/")) {
      const s = apiSecret.trim();
      if (s.startsWith("organizations/")) {
        setError("It looks like you pasted the API Key Name into the Private Key field. Open the JSON file Coinbase gave you — copy the 'privateKey' value (starts with '-----BEGIN') into the Private Key field below.");
        setSubmitting(false);
        return;
      }
      if (!s.includes("-----BEGIN") || !s.includes("PRIVATE KEY")) {
        setError("Coinbase CDP Private Key must be the full PEM block from your JSON file (starts with '-----BEGIN EC PRIVATE KEY-----' or '-----BEGIN PRIVATE KEY-----'). Open the JSON file Coinbase emailed you and copy the entire 'privateKey' value, including the BEGIN/END lines.");
        setSubmitting(false);
        return;
      }
    }
    try {
      const token = await getToken().catch(() => null);
      const r = await authFetch("/api/user/exchanges/connect", {
        method:      "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          exchange:  picked.id,
          label:     label.trim() || picked.name,
          apiKey:    apiKey.trim(),
          apiSecret: apiSecret.trim(),
          ...(picked.needsPassphrase ? { passphrase: passphrase.trim() } : {}),
          ...(demoSupported ? { demoMode } : {}),
        }),
      });
      const data = await r.json().catch(() => ({} as Record<string, unknown>));
      // 412 + needsDisclaimer:true → server says customer must accept the
      // risk disclaimer before any credentialed mutation. Open the
      // disclaimer modal; the accept handler will retry submitConnect.
      if (r.status === 412 && (data as { needsDisclaimer?: boolean }).needsDisclaimer === true) {
        setDiscError(null);
        setDiscOpen(true);
        return;
      }
      if (!r.ok) {
        throw new Error((data as { error?: string }).error
          ?? `Connection failed (HTTP ${r.status}). Check your credentials and try again.`);
      }
      setSuccess(true);
      onConnected?.();
      setTimeout(() => { reset(); onClose(); }, 1500);
    } catch (e) {
      setError(e instanceof Error
        ? e.message
        : "Connection failed. Check your credentials and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Disclaimer accept → POST /api/user/disclaimer with all 6 acks → on
  // success close the disclaimer modal and immediately retry the
  // connect POST so the customer doesn't have to click again.
  const acceptDisclaimer = async (acks: DisclaimerAcks) => {
    setDiscSubmitting(true);
    setDiscError(null);
    try {
      const token = await getToken().catch(() => null);
      const r = await authFetch("/api/user/disclaimer", {
        method:      "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(acks),
      });
      const data = await r.json().catch(() => ({} as { error?: string }));
      if (!r.ok) {
        throw new Error((data as { error?: string }).error
          ?? `Failed to record acceptance (HTTP ${r.status}).`);
      }
      setDiscOpen(false);
      // Retry the connect now that the server-side disclaimer gate is satisfied.
      await submitConnect();
    } catch (e) {
      setDiscError(e instanceof Error ? e.message : "Failed to record acceptance.");
    } finally {
      setDiscSubmitting(false);
    }
  };

  return (
    <>
    <DisclaimerModal
      open={discOpen}
      submitting={discSubmitting}
      error={discError}
      onAccept={(acks) => { void acceptDisclaimer(acks); }}
      onCancel={() => { if (!discSubmitting) { setDiscOpen(false); setDiscError(null); } }}
    />
    <style>{`
      /* Phase 2 — cinematic onboarding modal. Mobile-first fullscreen
         experience (no rounded corners, no margins, edge-to-edge) so the
         flow feels like a native app sheet rather than a cramped web
         dialog. Desktop keeps the centered card. */
      @keyframes pec-fade-in {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes pec-glow-pulse {
        0%, 100% { box-shadow: 0 0 24px rgba(102,255,102,0.30), 0 0 0 1px rgba(102,255,102,0.45) inset; }
        50%      { box-shadow: 0 0 48px rgba(102,255,102,0.60), 0 0 0 1px rgba(102,255,102,0.85) inset; }
      }
      @keyframes pec-mode-flip {
        0%   { transform: rotateX(0deg);  opacity: 1; }
        45%  { transform: rotateX(90deg); opacity: 0; }
        55%  { transform: rotateX(-90deg); opacity: 0; }
        100% { transform: rotateX(0deg);  opacity: 1; }
      }
      .pec-step { animation: pec-fade-in 220ms ease both; }
      .pec-success-badge { animation: pec-glow-pulse 1600ms ease-in-out infinite; }
      .pec-mode-flip { animation: pec-mode-flip 900ms cubic-bezier(.6,.2,.2,1) both; transform-style: preserve-3d; }
      @media (max-width: 640px) {
        .pec-overlay { padding: 0 !important; align-items: stretch !important; }
        .pec-shell {
          max-width: 100% !important;
          max-height: 100vh !important;
          min-height: 100vh !important;
          border-radius: 0 !important;
          padding: calc(14px + env(safe-area-inset-top, 0px)) 16px calc(20px + env(safe-area-inset-bottom, 0px)) !important;
          border-left: 0 !important;
          border-right: 0 !important;
        }
      }
    `}</style>
    <div
      className="pec-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="portal-exchange-title"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: N.BG_OVERLAY,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px 16px",
        overflowY: "auto",
        fontFamily: N.FONT_SANS,
      }}
    >
      <div
        className="pec-shell"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%", maxWidth: 560,
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
          background: `linear-gradient(160deg, ${N.CARD_HI} 0%, ${N.CARD} 70%)`,
          border: `1px solid rgba(102,255,102,0.32)`,
          borderRadius: 16,
          padding: "22px 22px 20px",
          boxShadow: `0 24px 72px rgba(0,0,0,0.7), 0 0 0 1px rgba(102,255,102,0.18) inset, 0 0 56px rgba(102,255,102,0.18)`,
        }}
      >
        {/* Top sweep */}
        <div aria-hidden style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent 0%, ${N.BRAND_BRGT} 50%, transparent 100%)`,
          opacity: 0.75,
        }}/>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 800,
              letterSpacing: "0.18em", textTransform: "uppercase",
              color: N.BRAND, marginBottom: 6,
              textShadow: `0 0 8px ${N.BRAND_GLOW}`,
            }}>
              ◆ Connect Exchange
            </div>
            <h2 id="portal-exchange-title" style={{
              fontSize: 19, fontWeight: 800, color: N.TEXT_0,
              letterSpacing: -0.3, margin: 0, lineHeight: 1.25,
            }}>
              Link your trading account
            </h2>
            <p style={{
              fontSize: 11.5, color: N.TEXT_1, lineHeight: 1.55,
              marginTop: 6, marginBottom: 0,
            }}>
              Read-only trading credentials. Withdrawal permission is never
              requested. Keys are encrypted at rest with AES-256-GCM.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={handleClose}
            disabled={submitting}
            style={{
              flexShrink: 0,
              width: 32, height: 32, borderRadius: 8,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${N.BORDER}`,
              color: N.TEXT_1,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              cursor: submitting ? "wait" : "pointer",
              transition: "all 120ms ease",
            }}
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        {/* ── Disconnect success state ───────────────────────────────────── */}
        {disconnectDone ? (
          <div style={{
            padding: "32px 16px", textAlign: "center",
            background: "rgba(255,100,120,0.05)",
            border: `1px solid rgba(255,100,120,0.45)`,
            borderRadius: 12,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(255,100,120,0.14)", border: "2px solid rgba(255,100,120,0.85)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              marginBottom: 14,
            }}>
              <Link2Off size={26} color="rgba(255,150,165,0.95)" strokeWidth={2.4} />
            </div>
            <div style={{
              fontFamily: N.FONT_MONO, fontSize: 14, fontWeight: 900,
              color: "rgba(255,150,165,0.95)", letterSpacing: "0.18em",
            }}>
              {picked.name.toUpperCase()} DISCONNECTED
            </div>
            <div style={{ fontSize: 12, color: N.TEXT_1, marginTop: 8, lineHeight: 1.5 }}>
              OAuth grant revoked · stored credentials deleted
            </div>
          </div>
        ) :
        /* ── Disconnect panel (renders when picked exchange already connected) ─ */
        pickedConn ? (
          <div>
            <div style={{
              padding: "14px 14px",
              background: "rgba(102,255,102,0.04)",
              border: `1px solid ${N.BRAND}28`,
              borderRadius: 10,
              marginBottom: 14,
            }}>
              <div style={{
                fontFamily: N.FONT_MONO, fontSize: 10, fontWeight: 900,
                letterSpacing: "0.20em", color: N.BRAND, marginBottom: 8,
                textShadow: `0 0 10px ${N.BRAND_GLOW}, 0 0 22px ${N.BRAND_GLOW}`,
              }}>
                ◆ ALREADY CONNECTED
              </div>
              <div style={{ fontSize: 16, color: "#FFFFFF", fontWeight: 800, marginBottom: 4,
                letterSpacing: -0.2,
                textShadow: `0 0 12px ${N.BRAND_GLOW}80` }}>
                {picked.name} · {(pickedConn.connection?.tradingMode ?? "paper").toUpperCase()}
              </div>
              <div style={{ fontSize: 11, color: N.TEXT_1, lineHeight: 1.5 }}>
                Disconnecting revokes the OAuth grant at {picked.name} and
                permanently deletes your encrypted credentials from AICandlez.
                You can reconnect at any time.
              </div>
            </div>

            {disconnectError && (
              <div style={{
                display: "flex", gap: 9, alignItems: "flex-start",
                padding: "10px 12px",
                background: "rgba(255,51,85,0.07)",
                border: "1px solid rgba(255,51,85,0.28)",
                borderRadius: 10,
                marginBottom: 12,
                fontSize: 11, color: N.ERROR,
              }}>
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{disconnectError}</span>
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={handleClose}
                disabled={disconnecting}
                style={{
                  padding: "12px 16px",
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${N.BORDER}`,
                  borderRadius: 10,
                  color: N.TEXT_1,
                  fontFamily: N.FONT_MONO, fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.14em", textTransform: "uppercase",
                  cursor: disconnecting ? "wait" : "pointer",
                }}
              >
                Cancel
              </button>
              {!confirmDisconnect ? (
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  disabled={disconnecting}
                  style={{
                    flex: 1, padding: "12px 16px", borderRadius: 10,
                    background: "rgba(255,68,85,0.10)",
                    border: "1px solid rgba(255,68,85,0.50)",
                    color: "#FF6478",
                    fontFamily: N.FONT_MONO, fontSize: 11.5, fontWeight: 800,
                    letterSpacing: "0.16em", textTransform: "uppercase",
                    cursor: "pointer",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  <Link2Off size={13} /> Disconnect {picked.name}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  style={{
                    flex: 1, padding: "12px 16px", borderRadius: 10,
                    background: "linear-gradient(135deg, #7a1020 0%, #c11a32 55%, #ff445a 100%)",
                    border: "1px solid rgba(255,68,85,0.85)",
                    color: "#FFE8EC",
                    fontFamily: N.FONT_MONO, fontSize: 11.5, fontWeight: 800,
                    letterSpacing: "0.16em", textTransform: "uppercase",
                    cursor: disconnecting ? "wait" : "pointer",
                    boxShadow: "0 10px 28px rgba(255,68,85,0.30), 0 1px 0 rgba(255,255,255,0.30) inset",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  {disconnecting && <Loader2 size={13} className="animate-spin" />}
                  {disconnecting ? "Disconnecting…" : "Confirm Disconnect"}
                </button>
              )}
            </div>
          </div>
        ) :
        /* ── Connect success state ─────────────────────────────────────── */
        success ? (
          <div style={{
            padding: "32px 16px", textAlign: "center",
            background: "rgba(102,255,102,0.05)",
            border: `1px solid ${N.BRAND}40`,
            borderRadius: 12,
          }}>
            <div
              className="pec-success-badge"
              style={{
                width: 64, height: 64, borderRadius: "50%",
                background: `${N.BRAND}22`, border: `2px solid ${N.BRAND}`,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Check size={32} color={N.BRAND} strokeWidth={3} />
            </div>
            {/* PAPER → LIVE CONNECTED transition. The mode chip flips 3D
                so customers feel the unlock viscerally. The "from" label
                is intentional even when the connected mode is paper —
                it communicates "you've left the simulator" regardless. */}
            <div
              className="pec-mode-flip"
              style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                padding: "6px 14px", borderRadius: 999,
                background: "rgba(0,0,0,0.4)",
                border: `1px solid ${N.BRAND}55`,
                marginBottom: 10,
              }}
            >
              <span style={{
                fontFamily: N.FONT_MONO, fontSize: 10, fontWeight: 700,
                letterSpacing: "0.18em", color: N.TEXT_2,
                textDecoration: "line-through",
              }}>PAPER</span>
              <ArrowRight size={12} color={N.BRAND} />
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontFamily: N.FONT_MONO, fontSize: 10.5, fontWeight: 900,
                letterSpacing: "0.20em", color: N.BRAND,
                textShadow: `0 0 10px ${N.BRAND_GLOW}`,
              }}>
                <Sparkles size={11} /> LIVE CONNECTED
              </span>
            </div>
            <div style={{
              fontFamily: N.FONT_MONO, fontSize: 14, fontWeight: 900,
              color: N.BRAND, letterSpacing: "0.18em",
              textShadow: `0 0 14px ${N.BRAND_GLOW}, 0 0 28px ${N.BRAND_GLOW}`,
            }}>
              {picked.name.toUpperCase()} CONNECTED
            </div>
            <div style={{ fontSize: 13, color: N.TEXT_0, marginTop: 8, fontWeight: 600,
              letterSpacing: 0.1 }}>
              Encrypted · withdrawal-locked · ready for AI execution
            </div>
          </div>
        ) : step === "choose" ? (
          /* ═══════════════ STEP 1 · CHOOSE ═══════════════════════════
             Cinematic onboarding entry. Renders:
               • Hero header + paper-vs-live comparison strip
               • Featured exchange cards (Kraken / Coinbase / Binance)
                 with brand-accent glow rings
               • Compact grid of remaining catalog exchanges
               • Security pledge ("Funds cannot be withdrawn")
             Tapping any enabled tile sets `picked` and advances to
             CREDENTIALS. The simulation pseudo-entry is not selectable. */
          <div className="pec-step">
            {/* PAPER vs LIVE comparison — sets expectations upfront so
                customers understand the platform is paper-by-default and
                live execution requires an exchange connection. */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
              marginBottom: 16,
            }}>
              <div style={{
                padding: "12px 12px",
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${N.BORDER}`,
                borderRadius: 10,
              }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 800,
                  letterSpacing: "0.18em", color: N.TEXT_1, marginBottom: 8,
                }}>
                  <FlaskConical size={11} /> PAPER · DEFAULT
                </div>
                <div style={{ fontSize: 11, color: N.TEXT_0, lineHeight: 1.5, fontWeight: 600 }}>
                  Simulated trades on live market data
                </div>
                <div style={{ fontSize: 10, color: N.TEXT_1, lineHeight: 1.5, marginTop: 4 }}>
                  $100,000 starting capital · zero risk · no setup
                </div>
              </div>
              <div style={{
                padding: "12px 12px",
                background: `linear-gradient(160deg, ${N.BRAND}10 0%, ${N.BRAND}04 100%)`,
                border: `1px solid ${N.BRAND}55`,
                borderRadius: 10,
                boxShadow: `0 0 18px ${N.BRAND_GLOW}`,
              }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 800,
                  letterSpacing: "0.18em", color: N.BRAND, marginBottom: 8,
                  textShadow: `0 0 8px ${N.BRAND_GLOW}`,
                }}>
                  <Zap size={11} /> LIVE · UNLOCK
                </div>
                <div style={{ fontSize: 11, color: N.TEXT_0, lineHeight: 1.5, fontWeight: 600 }}>
                  Real orders on your exchange account
                </div>
                <div style={{ fontSize: 10, color: N.TEXT_1, lineHeight: 1.5, marginTop: 4 }}>
                  Connect Kraken, Coinbase, or Binance to enable
                </div>
              </div>
            </div>

            {/* Featured cards — Kraken / Coinbase / Binance, large
                branded tiles. Filtered to those present + connectable in
                the live catalog; gracefully drops off in customer-gated
                mode (Alpaca-only) so customers don't see locked tiles
                marketed as primary. */}
            {(() => {
              const featured = FEATURED_EXCHANGE_IDS
                .map(id => allExchanges.find(e => e.id === id))
                .filter((e): e is Exchange => !!e && !e.disabled);
              if (featured.length === 0) return null;
              return (
                <>
                  <div style={{
                    fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 700,
                    letterSpacing: "0.18em", color: N.TEXT_1, marginBottom: 8,
                  }}>
                    ◆ FEATURED EXCHANGES
                  </div>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${featured.length}, 1fr)`,
                    gap: 8, marginBottom: 18,
                  }}>
                    {featured.map(ex => {
                      const meta    = getExchangeMeta(ex.id);
                      const isConn  = !!ex.connected;
                      return (
                        <button
                          key={ex.id}
                          type="button"
                          onClick={() => { setPicked(ex); setError(null); setStep("credentials"); }}
                          style={{
                            position: "relative",
                            padding: "16px 10px 14px",
                            background: `linear-gradient(160deg, ${meta.accent}18 0%, ${meta.accent}06 100%)`,
                            border: `1.5px solid ${meta.accent}66`,
                            borderRadius: 12,
                            cursor: "pointer",
                            textAlign: "left",
                            color: N.TEXT_0,
                            transition: "all 160ms ease",
                            boxShadow: `0 0 22px ${meta.accent}33, inset 0 1px 0 rgba(255,255,255,0.06)`,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.boxShadow = `0 8px 36px ${meta.accent}55, inset 0 1px 0 rgba(255,255,255,0.10)`;
                            e.currentTarget.style.borderColor = meta.accent;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = `0 0 22px ${meta.accent}33, inset 0 1px 0 rgba(255,255,255,0.06)`;
                            e.currentTarget.style.borderColor = `${meta.accent}66`;
                          }}
                        >
                          <div style={{
                            width: 36, height: 36, borderRadius: 9,
                            background: `linear-gradient(160deg, ${meta.accent} 0%, ${meta.accent}99 100%)`,
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            fontFamily: N.FONT_SANS, fontSize: 16, fontWeight: 900,
                            color: "#000", marginBottom: 10,
                            boxShadow: `0 4px 14px ${meta.accent}55`,
                          }}>
                            {ex.name.charAt(0)}
                          </div>
                          <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: -0.2 }}>
                            {ex.name}
                          </div>
                          <div style={{ fontSize: 10, color: N.TEXT_1, marginTop: 3, lineHeight: 1.4 }}>
                            {meta.tagline}
                          </div>
                          {isConn && (
                            <div style={{
                              position: "absolute", top: 8, right: 8,
                              fontFamily: N.FONT_MONO, fontSize: 8, fontWeight: 900,
                              letterSpacing: "0.14em", color: N.BRAND,
                              padding: "2px 6px",
                              border: `1px solid ${N.BRAND}55`,
                              background: `${N.BRAND}14`,
                              borderRadius: 4,
                              textShadow: `0 0 6px ${N.BRAND_GLOW}`,
                            }}>● LIVE</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              );
            })()}

            {/* All exchanges grid (existing picker, kept for completeness:
                Alpaca paper-onboarding, Gemini, Crypto.com, simulation, etc.) */}
            <div style={{
              fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 700,
              letterSpacing: "0.16em", color: N.TEXT_1,
              marginBottom: 8,
            }}>
              ALL EXCHANGES
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6,
              marginBottom: 16,
            }}>
              {visibleExchanges.map((ex) => {
                const isSel        = ex.id === picked.id;
                const isComingSoon = ex.status === "coming_soon";
                const isSim        = ex.status === "simulation";
                const isActive     = !!ex.isActive;
                const isConnected  = !!ex.connected;
                const isDisabled   = !!ex.disabled || submitting;

                // Status-driven theming (preserves institutional neon).
                const ring = isActive
                  ? "rgba(102,255,102,0.95)"
                  : isSel
                    ? N.BRAND
                    : isConnected
                      ? "rgba(102,255,102,0.55)"
                      : isComingSoon
                        ? "rgba(255,200,80,0.32)"
                        : N.BORDER;
                const bg = isSel
                  ? `linear-gradient(160deg, rgba(102,255,102,0.18) 0%, rgba(0,200,83,0.10) 100%)`
                  : isActive
                    ? `linear-gradient(160deg, rgba(102,255,102,0.12) 0%, rgba(0,200,83,0.06) 100%)`
                    : isComingSoon
                      ? "rgba(255,200,80,0.04)"
                      : "rgba(255,255,255,0.03)";
                const badge = isComingSoon
                  ? { text: "COMING SOON", color: "rgba(255,200,80,0.95)" }
                  : isActive
                    ? { text: "● ACTIVE",   color: N.BRAND }
                    : isConnected
                      ? { text: "CONNECTED", color: "rgba(102,255,102,0.85)" }
                      : isSim
                        ? { text: "PAPER", color: N.BRAND_DEEP }
                        : ex.requiresLiveGate && ex.disabled
                          ? { text: "LIVE GATED", color: "rgba(255,200,80,0.85)" }
                          : null;

                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => {
                      if (isDisabled || isSim) return;
                      setPicked(ex);
                      setError(null);
                      setStep("credentials");
                    }}
                    disabled={isDisabled || isSim}
                    title={ex.comingSoonNote ?? ex.name}
                    aria-label={`${ex.name}${badge ? ` (${badge.text.replace(/[●·]/g, "").trim()})` : ""}`}
                    style={{
                      position: "relative",
                      padding: "14px 8px 18px",
                      borderRadius: 9,
                      background: bg,
                      border: `1.5px solid ${ring}`,
                      color: isComingSoon
                        ? "rgba(255,220,160,0.85)"
                        : isSel
                          ? "#FFFFFF"
                          : N.TEXT_0,
                      fontFamily: N.FONT_SANS, fontSize: 13.5, fontWeight: 800,
                      letterSpacing: -0.2,
                      opacity: isComingSoon || (ex.disabled && !isSim) ? 0.72 : 1,
                      cursor: isDisabled || isSim ? "not-allowed" : "pointer",
                      boxShadow: isSel
                        ? `0 0 28px ${N.BRAND_GLOW}, 0 0 0 1px ${N.BRAND}55 inset`
                        : isActive
                          ? `0 0 18px ${N.BRAND_GLOW}`
                          : "none",
                      textShadow: isSel || isActive ? `0 0 14px ${N.BRAND_GLOW}` : "none",
                      transition: "all 120ms ease",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ lineHeight: 1.15 }}>{ex.name.toUpperCase()}</div>
                    {badge && (
                      <div style={{
                        position: "absolute",
                        bottom: 4, left: 0, right: 0,
                        fontFamily: N.FONT_MONO, fontSize: 7.5, fontWeight: 900,
                        letterSpacing: "0.14em", color: badge.color,
                        textShadow: isActive ? `0 0 8px ${N.BRAND_GLOW}` : "none",
                      }}>
                        {badge.text}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Security pledge — locked invariant: AICandlez never requests
                withdrawal permissions. Always rendered, always visible. */}
            <div style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              padding: "12px 12px", marginTop: 4,
              background: "rgba(102,255,102,0.04)",
              border: `1px solid ${N.BRAND}33`,
              borderRadius: 10,
            }}>
              <Lock size={14} color={N.BRAND} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 10.5, color: N.TEXT_0, lineHeight: 1.55 }}>
                <strong>Funds cannot be withdrawn.</strong>{" "}
                <span style={{ color: N.TEXT_1 }}>
                  AICandlez never requests withdrawal permissions on any
                  exchange. Keys are encrypted with AES-256-GCM and only
                  authorize reads + trades on your account.
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* ═══════════════ STEP 2 · CREDENTIALS ═══════════════════════
             Back button → CHOOSE (unless preselected/locked); per-
             exchange walkthrough panel; existing API key form.
             Preselected exchanges (e.g. OnboardingFlow Alpaca lock) hide
             the back button so the user can't change exchanges mid-flow. */
          <div className="pec-step">
            {/* Back row + locked-exchange chip */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
            }}>
              {!preselectedExchange && (
                <button
                  type="button"
                  onClick={() => { setStep("choose"); setError(null); }}
                  disabled={submitting}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "7px 10px", borderRadius: 8,
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${N.BORDER}`,
                    color: N.TEXT_1,
                    fontFamily: N.FONT_MONO, fontSize: 10, fontWeight: 700,
                    letterSpacing: "0.14em", textTransform: "uppercase",
                    cursor: submitting ? "wait" : "pointer",
                  }}
                >
                  <ArrowLeft size={11} /> Back
                </button>
              )}
              <div style={{
                flex: 1, display: "inline-flex", alignItems: "center", gap: 8,
                padding: "7px 10px", borderRadius: 8,
                background: `linear-gradient(160deg, ${getExchangeMeta(picked.id).accent}18 0%, ${getExchangeMeta(picked.id).accent}06 100%)`,
                border: `1px solid ${getExchangeMeta(picked.id).accent}55`,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 5,
                  background: `linear-gradient(160deg, ${getExchangeMeta(picked.id).accent} 0%, ${getExchangeMeta(picked.id).accent}99 100%)`,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontFamily: N.FONT_SANS, fontSize: 11, fontWeight: 900, color: "#000",
                }}>
                  {picked.name.charAt(0)}
                </div>
                <div style={{ fontSize: 12, color: N.TEXT_0, fontWeight: 700, letterSpacing: -0.1 }}>
                  {picked.name}
                </div>
                {preselectedExchange && (
                  <Lock size={11} color={N.TEXT_2} style={{ marginLeft: "auto" }} />
                )}
              </div>
            </div>

            {/* Per-exchange walkthrough — only shown when meta has content.
                Renders the numbered API-key creation steps + required
                permission checklist + "Open API page" deep link. */}
            {(() => {
              const meta = getExchangeMeta(picked.id);
              if (!meta.walkthrough?.length) return null;
              return (
                <div style={{
                  padding: "14px 14px",
                  background: "rgba(255,255,255,0.025)",
                  border: `1px solid ${N.BORDER}`,
                  borderRadius: 12,
                  marginBottom: 14,
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    marginBottom: 10,
                  }}>
                    <BookOpen size={13} color={meta.accent} />
                    <div style={{
                      flex: 1,
                      fontFamily: N.FONT_MONO, fontSize: 9.5, fontWeight: 800,
                      letterSpacing: "0.18em", color: N.TEXT_0,
                    }}>
                      HOW TO GET YOUR API KEY
                    </div>
                    {meta.apiUrl && (
                      <a
                        href={meta.apiUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "4px 8px", borderRadius: 6,
                          background: `${meta.accent}18`,
                          border: `1px solid ${meta.accent}55`,
                          color: meta.accent,
                          fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 800,
                          letterSpacing: "0.14em", textTransform: "uppercase",
                          textDecoration: "none",
                        }}
                      >
                        Open <ArrowRight size={10} />
                      </a>
                    )}
                  </div>
                  <ol style={{
                    margin: 0, padding: 0, listStyle: "none",
                    display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    {meta.walkthrough.map((s, i) => (
                      <li key={i} style={{
                        display: "flex", gap: 10, alignItems: "flex-start",
                        fontSize: 11.5, color: N.TEXT_0, lineHeight: 1.5,
                      }}>
                        <span style={{
                          flexShrink: 0,
                          width: 18, height: 18, borderRadius: "50%",
                          background: `${meta.accent}22`,
                          border: `1px solid ${meta.accent}66`,
                          color: meta.accent,
                          fontFamily: N.FONT_MONO, fontSize: 10, fontWeight: 900,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          marginTop: 1,
                        }}>{i + 1}</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                  {meta.requiredPerms?.length ? (
                    <div style={{
                      marginTop: 12, paddingTop: 10,
                      borderTop: `1px dashed ${N.BORDER}`,
                    }}>
                      <div style={{
                        fontFamily: N.FONT_MONO, fontSize: 8.5, fontWeight: 800,
                        letterSpacing: "0.16em", color: N.TEXT_1, marginBottom: 6,
                      }}>
                        REQUIRED PERMISSIONS
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {meta.requiredPerms.map(p => (
                          <span key={p} style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "3px 7px", borderRadius: 5,
                            background: `${N.BRAND}10`,
                            border: `1px solid ${N.BRAND}40`,
                            color: N.TEXT_0,
                            fontFamily: N.FONT_MONO, fontSize: 9.5, fontWeight: 700,
                          }}>
                            <Check size={9} color={N.BRAND} strokeWidth={3} /> {p}
                          </span>
                        ))}
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "3px 7px", borderRadius: 5,
                          background: "rgba(255,100,120,0.08)",
                          border: "1px solid rgba(255,100,120,0.35)",
                          color: "rgba(255,180,190,0.95)",
                          fontFamily: N.FONT_MONO, fontSize: 9.5, fontWeight: 700,
                        }}>
                          <X size={9} strokeWidth={3} /> Withdrawals · never
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })()}

            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontFamily: N.FONT_MONO, fontSize: 9.5, fontWeight: 800,
              letterSpacing: "0.18em", color: N.TEXT_1, marginBottom: 8,
            }}>
              <KeyRound size={11} /> ENTER CREDENTIALS
            </div>

            {/* Label */}
            <Field label="LABEL (OPTIONAL)" value={label}
                   onChange={setLabel} placeholder={`My ${picked.name}`}
                   disabled={submitting} />

            {/* Coinbase-specific guidance — Coinbase's CDP credential format
                differs from every other exchange and the field names are
                confusing. Showing this banner BEFORE the inputs eliminates
                the "pasted key name into both fields" support trap. */}
            {picked.id === "Coinbase" && (
              <div style={{
                padding: "10px 12px", marginBottom: 12,
                background: "rgba(102,255,102,0.05)",
                border: `1px solid ${N.BRAND}33`,
                borderRadius: 8,
                fontSize: 10.5, fontFamily: N.FONT_SANS, color: N.TEXT_0,
                lineHeight: 1.55,
              }}>
                <div style={{
                  fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 800,
                  letterSpacing: "0.16em", color: N.BRAND, marginBottom: 6,
                }}>
                  ◆ COINBASE CDP KEY FORMAT
                </div>
                Using a new Coinbase CDP key? Coinbase downloads a
                <b> JSON file</b> with two fields:
                <div style={{ marginTop: 6, paddingLeft: 8, color: N.TEXT_1 }}>
                  • <b style={{ color: N.TEXT_0 }}>name</b> → paste into <b style={{ color: N.BRAND }}>API KEY NAME</b> below (starts with <code style={{ fontFamily: N.FONT_MONO }}>organizations/</code>)<br/>
                  • <b style={{ color: N.TEXT_0 }}>privateKey</b> → paste into <b style={{ color: N.BRAND }}>PRIVATE KEY</b> below (starts with <code style={{ fontFamily: N.FONT_MONO }}>-----BEGIN</code>)
                </div>
                <div style={{ marginTop: 6, fontSize: 9.5, color: N.TEXT_2, fontStyle: "italic" }}>
                  Legacy HMAC keys (short base64 secret) are also accepted.
                </div>
              </div>
            )}

            {/* API Key */}
            <Field label={picked.id === "Coinbase" ? "API KEY NAME" : "API KEY"} value={apiKey}
                   onChange={setApiKey}
                   placeholder={picked.id === "Coinbase" ? "organizations/.../apiKeys/..." : "Paste API key"}
                   monospace required disabled={submitting} />
            {/* API Secret */}
            <Field label={picked.id === "Coinbase" ? "PRIVATE KEY" : "API SECRET"} value={apiSecret}
                   onChange={setApiSecret}
                   placeholder={picked.id === "Coinbase" ? "-----BEGIN EC PRIVATE KEY-----..." : "Paste API secret"}
                   monospace required masked disabled={submitting} />
            {/* Passphrase */}
            {picked.needsPassphrase && (
              <Field label="PASSPHRASE" value={passphrase}
                     onChange={setPassphrase} placeholder="Required for this exchange"
                     monospace required masked disabled={submitting} />
            )}

            {/* Demo-trading toggle (Bitget today). Routes signed calls to the
                exchange's demo wallet on the production host via the
                `PAPTRADING: 1` header — no real funds touched. */}
            {demoSupported && (
              <button
                type="button"
                onClick={() => !submitting && setDemoMode(v => !v)}
                disabled={submitting}
                aria-pressed={demoMode}
                style={{
                  width: "100%",
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "11px 12px",
                  background: demoMode
                    ? "rgba(102,255,102,0.06)"
                    : "rgba(255,255,255,0.03)",
                  border: `1px solid ${demoMode ? N.BRAND : N.BORDER}`,
                  borderRadius: 10,
                  marginTop: 2, marginBottom: 12,
                  cursor: submitting ? "not-allowed" : "pointer",
                  textAlign: "left",
                  transition: "all 120ms ease",
                  boxShadow: demoMode
                    ? `0 0 18px ${N.BRAND_GLOW}, 0 0 0 1px ${N.BRAND}40 inset`
                    : "none",
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: demoMode ? `${N.BRAND}22` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${demoMode ? N.BRAND : N.BORDER}`,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>
                  <FlaskConical size={14} color={demoMode ? N.BRAND : N.TEXT_1} strokeWidth={2.2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: N.FONT_MONO, fontSize: 10, fontWeight: 800,
                    letterSpacing: "0.16em", color: demoMode ? N.BRAND : N.TEXT_0,
                    marginBottom: 2,
                  }}>
                    DEMO TRADING
                  </div>
                  <div style={{ fontSize: 10.5, color: N.TEXT_1, lineHeight: 1.45 }}>
                    Practice on {picked.name}'s demo wallet — real broker, no real funds.
                  </div>
                </div>
                <div style={{
                  width: 34, height: 20, borderRadius: 999,
                  background: demoMode ? N.BRAND : "rgba(255,255,255,0.10)",
                  position: "relative", flexShrink: 0,
                  transition: "background 120ms ease",
                  boxShadow: demoMode ? `0 0 12px ${N.BRAND_GLOW}` : "none",
                }}>
                  <div style={{
                    position: "absolute",
                    top: 2, left: demoMode ? 16 : 2,
                    width: 16, height: 16, borderRadius: "50%",
                    background: demoMode ? "#001b06" : "#E8F5EC",
                    transition: "left 120ms ease",
                  }}/>
                </div>
              </button>
            )}

            {/* Security note */}
            <div style={{
              display: "flex", gap: 9, alignItems: "flex-start",
              padding: "10px 12px",
              background: "rgba(102,255,102,0.04)",
              border: `1px solid ${N.BRAND}28`,
              borderRadius: 10,
              marginTop: 4, marginBottom: 14,
            }}>
              <ShieldCheck size={14} color={N.BRAND} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 10.5, color: N.TEXT_1, lineHeight: 1.5 }}>
                Create the API key with <strong style={{ color: N.TEXT_0 }}>trading enabled and withdrawals disabled</strong>.
                AICandlez will <strong style={{ color: N.TEXT_0 }}>never</strong> request or store withdrawal permissions.
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                display: "flex", gap: 9, alignItems: "flex-start",
                padding: "10px 12px",
                background: "rgba(255,51,85,0.07)",
                border: "1px solid rgba(255,51,85,0.28)",
                borderRadius: 10,
                marginBottom: 12,
                fontSize: 11, color: N.ERROR,
              }}>
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                style={{
                  padding: "12px 16px",
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${N.BORDER}`,
                  borderRadius: 10,
                  color: N.TEXT_1,
                  fontFamily: N.FONT_MONO, fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.14em", textTransform: "uppercase",
                  cursor: submitting ? "wait" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { if (canSubmit) void submitConnect(); }}
                disabled={!canSubmit}
                style={{
                  flex: 1, padding: "12px 16px", borderRadius: 10,
                  background: canSubmit
                    ? `linear-gradient(135deg, ${N.BRAND_DEEP} 0%, ${N.BRAND} 55%, ${N.BRAND_BRGT} 100%)`
                    : "rgba(255,255,255,0.04)",
                  border: `1px solid ${canSubmit ? N.BRAND : N.BORDER}`,
                  color: canSubmit ? "#001b06" : N.TEXT_1,
                  fontFamily: N.FONT_MONO, fontSize: 11.5, fontWeight: 800,
                  letterSpacing: "0.16em", textTransform: "uppercase",
                  cursor: canSubmit ? "pointer" : "not-allowed",
                  boxShadow: canSubmit
                    ? `0 10px 28px rgba(102,255,102,0.30), 0 1px 0 rgba(255,255,255,0.45) inset`
                    : "none",
                  transition: "all 120ms ease",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {submitting && <Loader2 size={13} className="animate-spin" />}
                {submitting ? "Connecting…" : "Connect Exchange"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

interface FieldProps {
  label:        string;
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;
  monospace?:   boolean;
  required?:    boolean;
  masked?:      boolean;
  disabled?:    boolean;
}
function Field({ label, value, onChange, placeholder, monospace, required, masked, disabled }: FieldProps) {
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{
        fontFamily: N.FONT_MONO, fontSize: 9, fontWeight: 700,
        letterSpacing: "0.16em", color: N.TEXT_1, marginBottom: 5,
      }}>
        {label}{required && <span style={{ color: N.BRAND, marginLeft: 4 }}>*</span>}
      </div>
      <input
        type={masked ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "rgba(0,0,0,0.4)",
          border: `1px solid ${N.BORDER}`,
          borderRadius: 9,
          color: N.TEXT_0,
          fontSize: 12.5,
          fontFamily: monospace ? N.FONT_MONO : N.FONT_SANS,
          letterSpacing: monospace ? 0.4 : "normal",
          outline: "none",
          transition: "border-color 120ms ease, box-shadow 120ms ease",
        }}
        onFocus={(e) => {
          e.target.style.borderColor = N.BRAND;
          e.target.style.boxShadow = `0 0 0 3px ${N.BRAND}18`;
        }}
        onBlur={(e) => {
          e.target.style.borderColor = N.BORDER;
          e.target.style.boxShadow = "none";
        }}
      />
    </div>
  );
}
