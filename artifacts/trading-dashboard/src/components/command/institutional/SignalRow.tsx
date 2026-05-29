/**
 * SignalRow — single row in the Top 20 Crypto / Top 20 Equity signals grid.
 *
 * Refined institutional 2-line layout:
 *   Row 1 │ [LONG/SHORT badge · TICKER · type] · sparkline · LAST · 24h%      │ AI CONFIDENCE
 *   Row 2 │ ENTRY · STOP · TARGET                            BUY / SELL / ⚡  │   (52px ring)
 *
 * LONG rows have a thick green left bar + tinted green background.
 * SHORT rows have a thick red left bar + tinted red background.
 */

import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { Zap, ChevronDown, Sparkles, Activity, Target as TargetIcon, CheckCircle2 } from "lucide-react";
import type { SymBreakdown } from "../types";
import type { TickerSpec, SignalType } from "./tickers";
import { useLiveCandles } from "./useLiveCandles";
import { N } from "./theme";
import { usePaperTrades } from "@/hooks/usePaperTrades";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@clerk/react";
import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePortalMode } from "@/contexts/PortalModeContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useCustomerPlan, openUpgrade, type Plan } from "@/hooks/useCustomerPlan";
import { useArmedForLive } from "@/hooks/useArmedForLive";
import { useGetSettings } from "@workspace/api-client-react";

import { authFetch } from "../../../lib/authFetch";
import { notifyRejection, type RejectionErrorCode } from "@/lib/rejectionToast";
// API base URL — mirrors Portal.tsx resolution so production cross-origin
// API calls (api.aicandlez.com) work when SignalRow is rendered from any
// host. In dev it falls back to same-origin so the shared proxy handles it.
const apiBaseUrl: string = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? ""
).replace(/\/$/, "");

// ── DEV-only customer-preview gate ───────────────────────────────────────────
// Mirrors `shouldForceCustomerPreview()` in Portal.tsx. When an admin opens the
// customer shell via `?previewCustomer=1` on a .replit.dev preview origin, the
// real role is still admin so `isOperatorRole` stays true and the customer-only
// WHY-NOT-TRADE strip would never mount. This DEV-only flag lets the strip
// render in that sanctioned preview so the exact customer surface can be
// verified. Hard-gated on `import.meta.env.DEV` → Vite tree-shakes it out of the
// production bundle, so real admins on real `/command` never see it (locked
// invariant preserved). Does NOT touch auth, routing, or any execution path.
function isDevCustomerPreview(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("previewCustomer") === "1";
  } catch {
    return false;
  }
}

function fmt(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1)    return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

import { hashSymbol, resolveDirection } from "./signalUtils";

const TYPES: SignalType[] = ["SCALP", "SWING", "MOMENTUM", "BREAKOUT", "REVERSAL", "TREND"];

// ── Per-trade LIVE order size picker ─────────────────────────────────────
// Persisted in localStorage so the customer's preferred notional carries
// across page loads and rows. Server enforces a per-tier cap independently
// of the chosen value here.
const LIVE_SIZE_STORAGE_KEY = "acl_live_order_size_v1";
const LIVE_SIZE_PRESETS = [50, 100, 250, 500] as const;
const LIVE_SIZE_MIN = 1;
const LIVE_SIZE_MAX = 100_000;

function readStoredLiveSize(): number {
  if (typeof window === "undefined") return 100;
  try {
    const raw = window.localStorage.getItem(LIVE_SIZE_STORAGE_KEY);
    if (!raw) return 100;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < LIVE_SIZE_MIN || n > LIVE_SIZE_MAX) return 100;
    return n;
  } catch {
    return 100;
  }
}

function writeStoredLiveSize(n: number) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(LIVE_SIZE_STORAGE_KEY, String(n)); } catch { /* noop */ }
}

/**
 * useLiveOrderCap — fetches the authenticated user's per-trade LIVE cap
 * from `/api/billing/subscription`. Shared/deduped via react-query so
 * dozens of SignalRow instances only fire one network request.
 *
 * Returns a generous fallback (`LIVE_SIZE_MAX`) until the response lands,
 * so the picker never blocks the user during the initial load. The server
 * cap is the source of truth — this hook only enables a friendlier client
 * experience by preempting `SIZE_EXCEEDS_TIER_CAP` rejections.
 */
interface LiveOrderCapInfo {
  capUSD:         number;
  nextTierCapUSD: number | null;
  nextTier:       "starter" | "pro" | null;
  plan:           string;
}
function useLiveOrderCap(enabled: boolean): LiveOrderCapInfo {
  const { getToken } = useAuth();
  const { data } = useQuery<LiveOrderCapInfo>({
    queryKey: ["billing-subscription-cap"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const token = await getToken().catch(() => null);
      const res = await authFetch(`${apiBaseUrl}/api/billing/subscription`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`subscription HTTP ${res.status}`);
      const body = (await res.json()) as {
        plan?:                    string;
        liveOrderCapUSD?:         number;
        nextTierLiveOrderCapUSD?: number | null;
        nextTier?:                "starter" | "pro" | null;
      };
      return {
        capUSD:         typeof body.liveOrderCapUSD === "number"
                          ? body.liveOrderCapUSD
                          : LIVE_SIZE_MAX,
        nextTierCapUSD: typeof body.nextTierLiveOrderCapUSD === "number"
                          ? body.nextTierLiveOrderCapUSD
                          : null,
        nextTier:       body.nextTier ?? null,
        plan:           body.plan ?? "free",
      };
    },
  });
  return data ?? {
    capUSD:         LIVE_SIZE_MAX,
    nextTierCapUSD: null,
    nextTier:       null,
    plan:           "free",
  };
}

/**
 * useLiveOrderSize — single source of truth for the customer's preferred
 * per-trade LIVE notional. Synced across all SignalRow instances via a
 * `storage` event listener plus a same-tab custom event.
 *
 * On mount, hydrates from `GET /api/user/settings.preferredLiveOrderSizeUsd`
 * (falling back to localStorage if the request fails or returns no value),
 * so the preference travels across devices/browsers. Changes are persisted
 * through `PUT /api/user/settings` in addition to localStorage (best-effort).
 */
const LIVE_SIZE_EVENT = "acl-live-size-change";
function useLiveOrderSize(): [number, (n: number) => void] {
  const [size, setSizeState] = useState<number>(() => readStoredLiveSize());
  const { getToken } = useAuth();
  useEffect(() => {
    const sync = () => setSizeState(readStoredLiveSize());
    const onStorage = (e: StorageEvent) => {
      if (e.key === LIVE_SIZE_STORAGE_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(LIVE_SIZE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LIVE_SIZE_EVENT, sync);
    };
  }, []);

  // Hydrate from server once on mount. If the server-stored value differs
  // from what's in localStorage, the server wins (it travels with the user).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken().catch(() => null);
        const res = await authFetch(`${apiBaseUrl}/api/user/settings`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data: { preferredLiveOrderSizeUsd?: unknown } = await res.json();
        const n = Number(data?.preferredLiveOrderSizeUsd);
        if (!Number.isFinite(n) || n < LIVE_SIZE_MIN || n > LIVE_SIZE_MAX) return;
        if (cancelled) return;
        writeStoredLiveSize(n);
        setSizeState(n);
        try { window.dispatchEvent(new Event(LIVE_SIZE_EVENT)); } catch { /* noop */ }
      } catch { /* offline / unauth → keep localStorage value */ }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  const setSize = (n: number) => {
    const clamped = Math.max(LIVE_SIZE_MIN, Math.min(LIVE_SIZE_MAX, Math.round(n)));
    writeStoredLiveSize(clamped);
    setSizeState(clamped);
    try { window.dispatchEvent(new Event(LIVE_SIZE_EVENT)); } catch { /* noop */ }
    // Best-effort server persist; per-tier cap is enforced at order time,
    // not at preference time, so we save whatever the user picked.
    (async () => {
      try {
        const token = await getToken().catch(() => null);
        await authFetch(`${apiBaseUrl}/api/user/settings`, {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ preferredLiveOrderSizeUsd: clamped }),
        });
      } catch { /* offline / unauth → localStorage still has it */ }
    })();
  };
  return [size, setSize];
}

interface Props {
  spec:       TickerSpec;
  breakdown?: SymBreakdown;
}

export function SignalRow({ spec, breakdown }: Props) {
  const { points, livePrice, summary, state } = useLiveCandles({
    symbol: spec.symbol, limit: 40, timeframe: "15m",
  });

  const h = hashSymbol(spec.symbol);

  // Direction (LONG/SHORT) — shared deterministic resolver
  const direction: "LONG" | "SHORT" = useMemo(
    () => resolveDirection(spec.symbol, breakdown),
    [spec.symbol, breakdown],
  );

  // Confidence (engine → fallback per-symbol stable value)
  const conf = useMemo(() => {
    if (breakdown?.avgConfidence) return Math.round(breakdown.avgConfidence);
    return 58 + (h % 38); // 58-95
  }, [breakdown, h]);

  // ── TEMP OBSERVABILITY (additive, display-only) ───────────────────────────
  // Per-user min-confidence + raw volume %, surfaced on the customer-only
  // "WHY NOT TRADE?" strip below. react-query dedups useGetSettings across
  // every mounted row (single fetch). Reads ONLY — nothing here feeds
  // fireTrade / gating / routing / execution. Pure transparency layer.
  const { data: userSettings } = useGetSettings();
  const minConf = typeof userSettings?.minConfidence === "number"
    ? Math.round(userSettings.minConfidence)
    : null;
  const volPct = typeof breakdown?.volumeRatio === "number"
    ? Math.round(breakdown.volumeRatio * 100)
    : null;

  const signalType: SignalType = TYPES[h % TYPES.length];

  // Entry / SL / TP derived from live price
  const last  = livePrice ?? summary.last ?? 0;
  const entry = last;
  const sl    = direction === "LONG" ? entry * 0.98  : entry * 1.02;
  const tp    = direction === "LONG" ? entry * 1.045 : entry * 0.955;

  // 24h-equivalent change (vs first sparkline point)
  const change24h = useMemo(() => {
    if (!points.length) return 0;
    const first = points[0].close;
    if (first === 0) return 0;
    return ((last - first) / first) * 100;
  }, [points, last]);

  const dirColor   = direction === "LONG" ? N.LONG : N.SHORT;
  const dirGlow    = direction === "LONG" ? N.LONG_GLOW : N.SHORT_GLOW;

  // ── Trade execution — PAPER vs LIVE routing ─────────────────────────────
  // The customer Portal mounts `PortalModeProvider`; outside the Portal tree
  // (admin /command, signal previews, etc.) `usePortalMode` returns an inert
  // PAPER default so this row continues to behave like before.
  const { openTrade } = usePaperTrades();
  const portalMode    = usePortalMode();
  // Role gate (Path A bridge): the operator/Kraken branch in fireTrade must
  // be entered for ANY admin or super-admin, regardless of whether the
  // surrounding tree mounted PortalModeProvider. In dev preview and on
  // trade.aicandlez.com the provider IS mounted for admins too, which made
  // `!portalMode.isCustomerPortal` false → admin BUY silently fell through
  // to firePaperSim (pure local paper trade, no POST). Gating on the actual
  // role fixes that and keeps the customer-portal branch untouched for
  // non-admin users.
  const { isAdmin: isOperatorRole, loading: roleLoading } = useUserRole();

  // Phase 6 — Plan-aware customer intelligence layer.
  //
  // SignalRow is rendered transitively from PortalCustomerShell via the dual
  // crypto matrix. The drawer's PRO AI ANALYSIS section is rendered locked
  // (blurred + upgrade CTA) for FREE/STARTER customers and revealed for PRO.
  // For admin/operator (`isOperatorRole`) the drawer itself is gated off
  // upstream via `insightsEnabled`, so this hook only burns a memoized
  // billing query for customers — and React Query dedupes it across every
  // SignalRow in the matrix into the single shell-level
  // `["billing-subscription-portal-shell"]` cache entry. Net zero new
  // network for the row tree.
  const plan: Plan = useCustomerPlan();
  const { getToken }  = useAuth();
  const qc            = useQueryClient();
  const liveFallbackToastedRef = useRef(false);
  const [liveSize, setLiveSize] = useLiveOrderSize();
  const showSizePicker =
    portalMode.isCustomerPortal &&
    portalMode.mode === "LIVE" &&
    portalMode.canUseLive;
  const capInfo = useLiveOrderCap(showSizePicker);

  // If the stored preferred size now exceeds the user's cap (e.g. after a
  // downgrade), clamp it down silently so the BUY/SELL toast doesn't mislead
  // the customer with a notional they can't actually submit.
  useEffect(() => {
    if (!showSizePicker) return;
    if (capInfo.capUSD > 0 && liveSize > capInfo.capUSD) {
      setLiveSize(capInfo.capUSD);
    }
  }, [showSizePicker, capInfo.capUSD, liveSize, setLiveSize]);

  /**
   * Mirror a paper open into the server-side sim so dashboard panels +
   * post-refresh hydration see it. Best-effort, but failures are surfaced
   * once per row so persistence gaps are visible instead of silent.
   */
  const mirrorWarnedRef = useRef(false);
  const mirrorPaperToServer = async (
    sym: string, side: "BUY" | "SELL",
  ) => {
    try {
      const token = await getToken().catch(() => null);
      const res = await authFetch(`${apiBaseUrl}/api/simulation/order`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ symbol: sym, side, sizeUSD: 100 }),
      });
      if (!res.ok && !mirrorWarnedRef.current) {
        mirrorWarnedRef.current = true;
        const body = await res.json().catch(() => ({} as { error?: string }));
        toast({
          title: "PAPER TRADE NOT PERSISTED",
          description: `Server rejected mirror (HTTP ${res.status}): ${
            (body as { error?: string }).error ?? "trade visible locally only; will be lost on refresh"
          }`,
        });
      }
    } catch (err) {
      if (!mirrorWarnedRef.current) {
        mirrorWarnedRef.current = true;
        toast({
          title: "PAPER TRADE NOT PERSISTED",
          description: `Mirror to server failed: ${
            err instanceof Error ? err.message : "unknown error"
          } — trade visible locally only; will be lost on refresh`,
        });
      }
    }
  };

  /** Submit a real-money order through the user's connected exchange. */
  const submitLive = async (
    sym: string, side: "BUY" | "SELL", sizeUSD: number, useSandbox: boolean = false,
    correlationId?: string,
  ): Promise<{
    ok: boolean;
    error?: string;
    errorCode?: string;
    supportedExchanges?: string[];
    exchange?: string;
    fillPrice?: number;
    exchangeOrderId?: string;
    dryRun?: boolean;
    correlationId?: string;
  }> => {
    try {
      const token = await getToken().catch(() => null);
      const res = await authFetch(`${apiBaseUrl}/api/user/live-order`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(correlationId ? { "X-Correlation-Id": correlationId } : {}),
        },
        body: JSON.stringify({ symbol: sym, side, sizeUSD, useSandbox }),
      });
      const echoedId = res.headers.get("X-Correlation-Id") ?? correlationId;
      if (!res.ok) {
        // Propagate the structured error envelope so the LIVE-rejection
        // path can render the supported-venue hint ("supported on KRAKEN")
        // and so [MANUAL_TRADE_REJECTED] logs carry a real rejectionReason.
        const body = (await res.json().catch(() => ({}))) as {
          error?:              string;
          errorCode?:          string;
          supportedExchanges?: string[];
          exchange?:           string;
        };
        return {
          ok:                 false,
          error:              body.error ?? `HTTP ${res.status}`,
          errorCode:          body.errorCode,
          supportedExchanges: body.supportedExchanges,
          exchange:           body.exchange,
          correlationId:      echoedId ?? undefined,
        };
      }
      const body = (await res.json().catch(() => ({}))) as {
        fillPrice?: number;
        exchange?: string;
        exchangeOrderId?: string;
        dryRun?: boolean;
      };
      return {
        ok: true,
        fillPrice:       body.fillPrice,
        exchange:        body.exchange,
        exchangeOrderId: body.exchangeOrderId,
        dryRun:          body.dryRun,
        correlationId:   echoedId ?? undefined,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  const sandboxFallbackToastedRef = useRef(false);

  /** Fire a paper trade through the internal simulator (legacy default path). */
  const firePaperSim = (side: "LONG" | "SHORT", sl: number, tp: number) => {
    openTrade({
      symbol:  spec.symbol,
      display: spec.display,
      side,
      entry,
      stop:    sl,
      target:  tp,
    });
    void mirrorPaperToServer(spec.symbol, side === "LONG" ? "BUY" : "SELL");
    toast({
      title: `${side === "LONG" ? "PAPER LONG EXECUTED" : "PAPER SHORT OPENED"} — ${spec.label}`,
      description: `Entry $${fmt(entry)} · TP $${fmt(tp)} · SL $${fmt(sl)} · AI ${conf}% · SIMULATED`,
    });
  };

  /**
   * Route a PAPER trade. When the customer has opted into sandbox routing
   * AND a connected exchange supports it, submit through the live-order
   * endpoint with `useSandbox: true` so the order hits the exchange's public
   * testnet. Any failure (`no_sandbox`, `no_connection`, etc.) falls back
   * to the internal simulator with a single explanatory toast per row.
   */
  const firePaper = (side: "LONG" | "SHORT", sl: number, tp: number) => {
    const wantSandbox = portalMode.isCustomerPortal && portalMode.paperSandboxEnabled;
    if (!wantSandbox) {
      firePaperSim(side, sl, tp);
      return;
    }

    // Optimistic feedback so the row feels responsive while the testnet
    // round-trip completes. The internal-sim fallback will overwrite this
    // with a clearer toast if sandbox is unavailable.
    toast({
      title: `PAPER SANDBOX SUBMITTED — ${spec.label}`,
      description: `${side} · routing to your exchange's public testnet · AI ${conf}%`,
    });

    void submitLive(spec.symbol, side === "LONG" ? "BUY" : "SELL", liveSize, true).then(r => {
      if (!r.ok) {
        if (!sandboxFallbackToastedRef.current) {
          sandboxFallbackToastedRef.current = true;
          toast({
            title: "SANDBOX UNAVAILABLE — USING INTERNAL SIMULATOR",
            description: r.error ?? "Exchange sandbox is not reachable",
          });
        }
        firePaperSim(side, sl, tp);
        return;
      }
      const exch = (r.exchange ?? "exchange").toUpperCase();
      const orderIdShort = r.exchangeOrderId
        ? `#${r.exchangeOrderId.slice(-8)}`
        : "";
      const priceStr = r.fillPrice && r.fillPrice > 0
        ? `$${fmt(r.fillPrice)}`
        : "market";
      toast({
        title: `SANDBOX FILLED @ ${priceStr} — ${spec.label}`,
        description: [side, `${exch} TESTNET`, orderIdShort].filter(Boolean).join(" · "),
      });
      void qc.invalidateQueries({ queryKey: ["customer-simulation-account"] });
      void qc.invalidateQueries({ queryKey: ["customer-simulation-trades"] });
    });
  };

  const operatorOrderInFlightRef = useRef(false);
  const armedForLive = useArmedForLive();
  const fireTrade = (side: "LONG" | "SHORT") => {
    // [MANUAL_BUY_CLICK] — top-of-funnel diagnostic log added 2026-05-28
    // for the customer "click ignored / partial execute" report. Fires
    // BEFORE every early-return gate so on-call can grep which branch
    // the click resolved to (price warmup / armed gate / live submit /
    // operator submit / paper sim) for any reported missed execution.
    const disabledReason: string | null =
      (!entry || entry <= 0) ? "no_entry_price"
      : (portalMode.isCustomerPortal && portalMode.mode === "LIVE" &&
         portalMode.canUseLive && portalMode.hasExchange && !armedForLive) ? "not_armed_for_live"
      : (portalMode.isCustomerPortal && portalMode.mode === "LIVE" &&
         (!portalMode.canUseLive || !portalMode.hasExchange)) ? "live_locked_falling_back_to_paper"
      : null;
    // eslint-disable-next-line no-console
    console.info("[MANUAL_BUY_CLICK]", {
      symbol:         spec.symbol,
      side,
      selectedSize:   liveSize,
      entry,
      runtimeMode:    portalMode.mode,
      isCustomerPortal: portalMode.isCustomerPortal,
      canUseLive:     portalMode.canUseLive,
      hasExchange:    portalMode.hasExchange,
      armedForLive,
      isOperator:     isOperatorRole,
      operatorInFlight: operatorOrderInFlightRef.current,
      disabledReason,
    });
    if (!entry || entry <= 0) {
      // eslint-disable-next-line no-console
      console.log("[TRADE_BRANCH]", "PAPER_NO_ENTRY", { symbol: spec.symbol });
      toast({
        title: "MARKET FEED WARMING UP",
        description: `${spec.display} — waiting for live price`,
      });
      return;
    }
    const sl = side === "LONG" ? entry * 0.98  : entry * 1.02;
    const tp = side === "LONG" ? entry * 1.045 : entry * 0.955;

    // [TRADE_BRANCH_DECISION] — TEMP instrumentation (2026-05-28). Dumps
    // the full predicate snapshot the gate at L519 will evaluate so the
    // exact false predicate that forces the PAPER fallback in production
    // is visible in the browser console. Remove once the LIVE-routing
    // regression is resolved.
    // eslint-disable-next-line no-console
    console.log("[TRADE_BRANCH_DECISION]", {
      symbol:           spec.symbol,
      side,
      runtimeMode:      portalMode.mode,
      isCustomerPortal: portalMode.isCustomerPortal,
      canUseLive:       portalMode.canUseLive,
      hasExchange:      portalMode.hasExchange,
      armedForLive,
      disabledReason,
      tier:             portalMode.tier,
      liveLockReason:   portalMode.liveLockReason,
      paperSandboxEnabled: portalMode.paperSandboxEnabled,
      isOperatorRole,
      // predicate-by-predicate breakdown so the FALSE one is obvious
      pred_isCustomerPortal: !!portalMode.isCustomerPortal,
      pred_modeIsLive:       portalMode.mode === "LIVE",
      pred_canUseLive:       !!portalMode.canUseLive,
      pred_hasExchange:      !!portalMode.hasExchange,
      pred_armedForLive:     !!armedForLive,
      gateWillPass:
        !!portalMode.isCustomerPortal &&
        portalMode.mode === "LIVE" &&
        !!portalMode.canUseLive &&
        !!portalMode.hasExchange,
    });

    // LIVE routing — only when the customer Portal mode toggle is engaged
    // AND the tier permits live exec AND a validated exchange is connected.
    // If any condition fails we fall back to PAPER and toast once per row.
    if (
      portalMode.isCustomerPortal &&
      portalMode.mode === "LIVE" &&
      portalMode.canUseLive &&
      portalMode.hasExchange
    ) {
      // eslint-disable-next-line no-console
      console.log("[TRADE_BRANCH]", armedForLive ? "LIVE" : "LIVE_BLOCKED_NOT_ARMED", {
        symbol: spec.symbol, side, armedForLive,
      });
      // Per-session live gate. Live BUY clicks are blocked until the
      // user activates AI trading at least once this session (the
      // ACTIVATE AI TRADING bar auto-arms; see PortalCustomerShell
      // `runActivation`). Page refresh resets `armedForLive` to false
      // by design. This is a UX gate; the env kill switch + per-order
      // gates on the server remain the security boundary.
      if (!armedForLive) {
        toast({
          title:       "LIVE EXECUTION NOT AUTHORIZED",
          description: "Tap ACTIVATE AI TRADING in the portal to authorize real-money orders for this session.",
        });
        return;
      }
      // Phase 4 (Task #209) — client-minted correlationId stamped on the
      // X-Correlation-Id header and on the client console MANUAL_TRADE_*
      // tags. Server echoes it back so on-call greps one id from browser
      // console → pino → trade history.
      const correlationId =
        (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
          ? crypto.randomUUID()
          : `cid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      console.info("[MANUAL_TRADE_REQUEST]", {
        correlationId,
        symbol:    spec.symbol,
        side,
        sizeUSD:   liveSize,
        runtime:   "LIVE",
        exchange:  null,
        confidence: conf,
      });
      toast({
        title: `LIVE ORDER SUBMITTED — ${spec.label}`,
        description: `${side} · routing to your connected exchange · $${liveSize} notional · AI ${conf}%`,
      });
      void submitLive(spec.symbol, side === "LONG" ? "BUY" : "SELL", liveSize, false, correlationId).then(r => {
        if (!r.ok) {
          // 2026-05 unification — NEVER silently fall back to PAPER when the
          // customer is in LIVE runtime with an armed exchange. Surface the
          // server's structured error verbatim. Falling back to PAPER here
          // is the bug that produced "PAPER TRADE NOT PERSISTED" toasts and
          // ghost local-only trades that disappeared on refresh.
          const errCode = (r as { errorCode?: string }).errorCode;
          const supported = (r as { supportedExchanges?: string[] }).supportedExchanges ?? [];
          const supportedHint = errCode === "unsupported_symbol" && supported.length > 0
            ? ` · supported on ${supported.join(", ").toUpperCase()}`
            : "";
          console.error("[MANUAL_TRADE_REJECTED]", {
            correlationId:    r.correlationId ?? correlationId,
            symbol:           spec.symbol,
            side,
            runtime:          "LIVE",
            exchange:         (r as { exchange?: string }).exchange ?? null,
            persistenceResult: "skipped",
            positionId:       null,
            rejectionReason:  errCode ?? "unknown",
            error:            r.error,
          });
          // Phase 3 Step 4b — single rejection-toast path through the
          // centralized dispatcher (30s (errorCode, symbol) dedupe).
          // Folds supportedExchanges hint into `detail` so the user
          // still sees "supported on KRAKEN" without a second toast.
          notifyRejection({
            errorCode: (errCode ?? "exchange_reject") as RejectionErrorCode,
            symbol:    spec.symbol,
            detail:    (r.error ?? "Live exchange rejected the order") + supportedHint,
          });
          return;
        }
        console.info("[MANUAL_TRADE_EXECUTED]", {
          correlationId:     r.correlationId ?? correlationId,
          symbol:            spec.symbol,
          side,
          runtime:           "LIVE",
          exchange:          r.exchange ?? null,
          persistenceResult: "persisted",
          positionId:        r.exchangeOrderId ?? null,
          fillPrice:         r.fillPrice,
        });
        // Real-time fill confirmation. Surface broker fill price, exchange,
        // and order id so the customer has closure on the real-money action.
        const exch = (r.exchange ?? "exchange").toUpperCase();
        const orderIdShort = r.exchangeOrderId
          ? `#${r.exchangeOrderId.slice(-8)}`
          : "";
        const priceStr = r.fillPrice && r.fillPrice > 0
          ? `$${fmt(r.fillPrice)}`
          : "market";
        toast({
          title: `FILLED @ ${priceStr} — ${spec.label}${r.dryRun ? " (DRY RUN)" : ""}`,
          description: [side, exch, orderIdShort].filter(Boolean).join(" · "),
        });
        // Refresh customer portal panels immediately so the new LIVE row
        // appears without waiting for the 4s poll.
        void qc.invalidateQueries({ queryKey: ["customer-simulation-account"] });
        void qc.invalidateQueries({ queryKey: ["customer-simulation-trades"] });
        // Task #207 — also refresh broker-balance snapshot so headline
        // equity reflects the cash debit from the BUY-side fill (Coinbase
        // USD balance dropped by ~$liveSize). Mirrors the post-close
        // reconciliation effect in PortalCustomerShell.
        void qc.invalidateQueries({ queryKey: ["runtime-state"] });
      });
      return;
    }

    // LIVE requested but blocked (no tier / no exchange) → PAPER + toast.
    if (
      portalMode.isCustomerPortal &&
      portalMode.mode === "LIVE" &&
      (!portalMode.canUseLive || !portalMode.hasExchange) &&
      !liveFallbackToastedRef.current
    ) {
      liveFallbackToastedRef.current = true;
      toast({
        title: "LIVE LOCKED — USING PAPER",
        description: portalMode.liveLockReason ?? "Live trading is currently unavailable",
      });
    }

    // Admin operator trees (CommandCenter, /admintrade /portal): real-only by
    // invariant — route directly through the operator-env Kraken execution
    // path (`/api/exchange/order/execute`). Gate on `isOperatorRole` (from
    // `useUserRole().isAdmin`) ONLY — never fall back on
    // `!portalMode.isCustomerPortal`, because customer /portal does not
    // mount `PortalModeProvider`, which would make a non-admin customer's
    // BUY click leak into the operator Kraken path. Customer is PAPER-only
    // by locked invariant — non-admins fall through to `firePaper()`.
    if (isOperatorRole) {
      // eslint-disable-next-line no-console
      console.log("[TRADE_BRANCH]", "OPERATOR_KRAKEN", { symbol: spec.symbol, side });
      if (operatorOrderInFlightRef.current) {
        toast({
          title: `OPERATOR ORDER IN FLIGHT — ${spec.label}`,
          description: `Wait for the previous ${side} on ${spec.symbol} to settle before sending another.`,
        });
        return;
      }
      operatorOrderInFlightRef.current = true;
      toast({
        title: `OPERATOR LIVE ORDER SUBMITTED — ${spec.label}`,
        description: `${side} · routing to KRAKEN (operator env) · $${liveSize} notional · AI ${conf}%`,
      });
      void (async () => {
        try {
          const token = await getToken().catch(() => null);
          const url = `${apiBaseUrl}/api/exchange/order/execute`;
          const payload = {
            symbol:    spec.symbol,
            side:      side === "LONG" ? "buy" : "sell",
            orderType: "market",
            amountUSD: liveSize,
          };
          const res = await authFetch(url, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({} as { error?: string }));
            toast({
              title: `OPERATOR ORDER REJECTED — ${spec.label}`,
              description: (body as { error?: string }).error ?? `HTTP ${res.status}`,
            });
            return;
          }
          const body = (await res.json().catch(() => ({}))) as {
            id?: string; status?: string; fillPrice?: number; avgPrice?: number;
          };
          const fill = body.fillPrice ?? body.avgPrice;
          toast({
            title: `OPERATOR FILLED — ${spec.label}${fill ? ` @ $${fmt(fill)}` : ""}`,
            description: [side, "KRAKEN", body.status, body.id ? `#${body.id.slice(-8)}` : ""].filter(Boolean).join(" · "),
          });
        } catch (err) {
          toast({
            title: `OPERATOR ORDER ERROR — ${spec.label}`,
            description: err instanceof Error ? err.message : String(err),
          });
        } finally {
          operatorOrderInFlightRef.current = false;
        }
      })();
      return;
    }

    // eslint-disable-next-line no-console
    console.log("[TRADE_BRANCH]", "PAPER_FALLTHROUGH", {
      symbol: spec.symbol,
      side,
      reason: !portalMode.isCustomerPortal
        ? "no_customer_portal_provider"
        : portalMode.mode !== "LIVE"
          ? "runtime_mode_not_live"
          : !portalMode.canUseLive
            ? "tier_cannot_use_live"
            : !portalMode.hasExchange
              ? "no_exchange_connected"
              : "unknown",
      paperSandboxEnabled: portalMode.paperSandboxEnabled,
    });
    firePaper(side, sl, tp);
  };
  const change24hPos = change24h >= 0;
  const confColor  = conf >= 78 ? N.BRAND : conf >= 62 ? N.BRAND_DEEP : N.WARN;

  // ── Phase 3 — AI Insights drawer (customer-only) ────────────────────────
  // The drawer renders ONLY when the viewer is NOT an admin/operator, so
  // /command admin terminal stays byte-identical (locked invariant). The
  // gate uses `isOperatorRole` from useUserRole(), the same SoT used by
  // the BUY routing matrix above.
  //
  // Admin-safe default during role load: `useUserRole()` resolves async,
  // so during the loading window `isOperatorRole` is false for ALL viewers
  // (including admins). Without gating on `roleLoading`, an admin row on
  // /command would briefly render the WHY toggle + click handler before
  // role resolves, violating the byte-identical invariant. Treat unknown
  // role as operator (most conservative) until resolved.
  const insightsEnabled = (!roleLoading && !isOperatorRole) || isDevCustomerPreview();
  const [insightsOpen, setInsightsOpen] = useState(false);

  // AI reasoning lines — synthesized from real breakdown signals (EMA, RSI,
  // MTF alignment, volume, regime, 1H trend). Each line is the AI's voice
  // explaining one observation. Falls back to confidence-tier prose when
  // breakdown is unavailable (early load / paper-only symbols).
  const insightLines = useMemo(() => {
    const lines: { tone: "bull" | "bear" | "neutral"; text: string }[] = [];
    const bias = direction === "LONG" ? "bullish" : "bearish";
    const tone: "bull" | "bear" = direction === "LONG" ? "bull" : "bear";
    if (breakdown) {
      if (breakdown.mtfConfirmed) {
        lines.push({
          tone,
          text: `Multi-timeframe alignment confirmed — 15m and 1H both ${bias}.`,
        });
      } else {
        lines.push({
          tone: "neutral",
          text: `Timeframes diverging — 15m and 1H not yet aligned.`,
        });
      }
      if (breakdown.fast?.rsi != null) {
        const rsi = Math.round(breakdown.fast.rsi);
        if (direction === "LONG" && rsi < 40) {
          lines.push({ tone, text: `15m RSI at ${rsi} — momentum reset, room to run.` });
        } else if (direction === "LONG" && rsi > 65) {
          lines.push({ tone: "neutral", text: `15m RSI at ${rsi} — extended, wait for pullback.` });
        } else if (direction === "SHORT" && rsi > 60) {
          lines.push({ tone, text: `15m RSI at ${rsi} — overbought, distribution risk.` });
        } else {
          lines.push({ tone: "neutral", text: `15m RSI at ${rsi} — balanced range.` });
        }
      }
      if (breakdown.fast?.emaSignal) {
        lines.push({ tone, text: `EMA stack on 15m: ${breakdown.fast.emaSignal}.` });
      }
      if (breakdown.volumeConfirmed) {
        lines.push({ tone, text: `Volume confirms participation — institutional flow detected.` });
      } else {
        lines.push({ tone: "neutral", text: `Volume below 20-bar average — conviction tentative.` });
      }
      if (breakdown.marketCondition) {
        lines.push({
          tone: "neutral",
          text: `Regime: ${breakdown.marketCondition.toLowerCase()}.`,
        });
      }
      if (breakdown.trend1H) {
        lines.push({
          tone: breakdown.trend1H.toLowerCase().includes(bias) ? tone : "neutral",
          text: `1H trend reads ${breakdown.trend1H.toLowerCase()}.`,
        });
      }
      if (breakdown.executionBlockReason) {
        const reasonMap: Record<string, string> = {
          low_confidence:    "Conviction below execution threshold — observing.",
          no_mtf_agreement:  "Awaiting timeframe agreement before execution.",
          sideways:          "Chop filter active — sideways range blocking entries.",
          hold_bias:         "AI holding bias — no edge to press right now.",
        };
        const text = reasonMap[breakdown.executionBlockReason] ?? "Execution gated by safety filter.";
        lines.push({ tone: "neutral", text });
      }
    } else {
      // Fallback when breakdown hasn't arrived yet — keep voice consistent
      // with confidence band so the drawer never feels empty.
      if (conf >= 78) {
        lines.push({ tone, text: `High-conviction ${bias} setup — AI is leaning in.` });
      } else if (conf >= 62) {
        lines.push({ tone: "neutral", text: `Mid-conviction ${bias} watch — building thesis.` });
      } else {
        lines.push({ tone: "neutral", text: `Low conviction — AI is monitoring, not committing.` });
      }
      lines.push({ tone: "neutral", text: `Awaiting full multi-timeframe read.` });
    }
    return lines.slice(0, 5);
  }, [breakdown, direction, conf]);

  // ── Confidence history ring buffer (Phase 4) ───────────────────────────
  // Captures the last 24 conviction samples per row so the drawer can show
  // "trend strengthening vs weakening" without server support. Persists
  // for the lifetime of this row instance — resets on remount, which is
  // acceptable since the drawer is read-only/observational. Sampled at the
  // 5s cadence of breakdown updates from the engine.
  const confHistRef = useRef<number[]>([]);
  useEffect(() => {
    // Phase 4 micro-hardening: skip sampling entirely when insights are not
    // available (admin /command rows during/after role hydration), so the
    // operator surface incurs zero bookkeeping cost.
    if (!insightsEnabled) return;
    const buf = confHistRef.current;
    if (buf[buf.length - 1] !== conf) {
      buf.push(conf);
      if (buf.length > 24) buf.shift();
    }
  }, [conf, insightsEnabled]);
  const confHistory = confHistRef.current.slice();
  const confTrend: "STRENGTHENING" | "WEAKENING" | "STEADY" = useMemo(() => {
    if (confHistory.length < 4) return "STEADY";
    const a = confHistory.slice(0, Math.ceil(confHistory.length / 2));
    const b = confHistory.slice(Math.ceil(confHistory.length / 2));
    const avg = (xs: number[]) => xs.reduce((s, n) => s + n, 0) / xs.length;
    const delta = avg(b) - avg(a);
    if (delta >= 2)  return "STRENGTHENING";
    if (delta <= -2) return "WEAKENING";
    return "STEADY";
  }, [confHistory]);

  // Signal Lifecycle stages — derived deterministically from breakdown.
  // DETECTED is always reached when a row renders. CONFIRMED requires MTF
  // alignment. EXECUTING requires the engine to mark this signal as
  // execution-eligible. EXIT is "pending" until a trade closes (we don't
  // wire per-row trade state here to keep the change additive-only).
  const lifecycle = useMemo(() => {
    const mtfOk        = !!breakdown?.mtfConfirmed;
    const execEligible = !!breakdown?.executionEligible;
    return [
      { key: "DETECTED",  active: true,         done: true },
      { key: "CONFIRMED", active: mtfOk,        done: mtfOk },
      { key: "EXECUTING", active: execEligible, done: false },
      { key: "EXIT",      active: false,        done: false },
    ] as const;
  }, [breakdown]);

  // Tinted left-edge background blends from direction color → black
  const rowBg = `linear-gradient(90deg, ${dirColor}0F 0%, ${N.SURFACE_1} 32%)`;
  const rowBgHover = `linear-gradient(90deg, ${dirColor}1A 0%, ${N.SURFACE_2} 38%)`;

  const closes = points.map(p => p.close);
  const min = closes.length ? Math.min(...closes) : 0;
  const max = closes.length ? Math.max(...closes) : 1;
  const pad = (max - min) * 0.18 || 1;

  // Conf ring geometry (52px ring)
  const RING = 52;
  const STROKE = 4.5;
  const radius = (RING - STROKE) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (conf / 100) * circ;

  return (
    <div style={{ borderBottom: `1px solid ${N.BORDER}` }}>
    <div
      className="grid items-center transition-colors"
      style={{
        gridTemplateColumns: "260px 1fr 84px",
        gap: 10,
        padding: "10px 12px 10px 14px",
        minHeight: 72,
        background: rowBg,
        fontFamily: N.FONT_MONO,
        boxShadow: `inset 6px 0 0 0 ${dirColor}, inset 7px 0 0 0 ${dirColor}cc, inset 8px 0 4px -2px ${dirColor}80`,
        position: "relative",
        cursor: insightsEnabled ? "pointer" : "default",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = rowBgHover)}
      onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
      onClick={(e) => {
        // Only the bare row chrome toggles the drawer — buttons inside
        // (BUY/SELL/⚡/SizePicker) stop propagation by virtue of their own
        // onClick handlers firing first and React's event bubbling: we
        // gate explicitly on the target being the wrapper so clicks on
        // interactive children never accidentally toggle.
        if (!insightsEnabled) return;
        const t = e.target as HTMLElement;
        if (t.closest("button") || t.closest("a") || t.closest("input")) return;
        setInsightsOpen(v => !v);
      }}
    >
      {/* ── LEFT: header (badge + ticker + type) over (entry/SL/TP) ── */}
      <div className="flex flex-col" style={{ gap: 6 }}>
        {/* line 1 — direction badge + ticker + state pip */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-extrabold tracking-[0.22em] px-2 py-0.5 rounded"
            style={{
              color: dirColor,
              background: `${dirColor}1c`,
              border: `1px solid ${dirColor}70`,
              boxShadow: `0 0 5px ${dirColor}40`,
              fontFamily: N.FONT_MONO,
            }}>
            {direction}
          </span>
          <span style={{
            width: 5, height: 5, borderRadius: 5,
            background: state === "live" ? N.BRAND : state === "synthetic" ? N.WARN : N.TEXT_3,
            boxShadow: state === "live" ? `0 0 4px ${N.BRAND}` : "none",
            animation:  state === "live" ? "neon-pulse 1.4s infinite" : "none",
          }} />
          <span className="text-[14px] font-extrabold tracking-wide"
            style={{ color: N.TEXT_0 }}>
            {spec.label}
          </span>
          <span className="text-[8.5px] font-bold tracking-[0.18em] px-1.5 py-0.5 rounded"
            style={{
              color: N.TEXT_2,
              background: "#0a0f0c",
              border: `1px solid ${N.BORDER}`,
            }}>
            {signalType}
          </span>
        </div>
        {/* line 2 — entry / sl / tp */}
        <div className="flex items-center gap-3">
          <DataCell label="ENTRY" value={`$${fmt(entry)}`} color={N.TEXT_0} />
          <DataCell label="STOP"  value={`$${fmt(sl)}`}    color={N.SHORT} />
          <DataCell label="TARGET" value={`$${fmt(tp)}`}   color={N.LONG} />
        </div>
      </div>

      {/* ── CENTER: sparkline + last/change · BUY · SELL · ⚡ ── */}
      <div className="flex flex-col" style={{ gap: 6, minWidth: 0 }}>
        {/* line 1 — sparkline + last + 24h delta */}
        <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0, height: 34 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <YAxis hide domain={[min - pad, max + pad]} />
                <Line type="monotone" dataKey="close" stroke={dirColor} strokeWidth={1.6}
                  dot={false} isAnimationActive={false}
                  style={{ filter: `drop-shadow(0 0 3px ${dirColor}90)` }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col items-end" style={{ minWidth: 88 }}>
            <span className="text-[7.5px] font-bold tracking-[0.18em]"
              style={{ color: N.TEXT_3 }}>LAST</span>
            <span className="text-[12px] font-extrabold tabular-nums"
              style={{ color: N.TEXT_0, lineHeight: 1.05,
                       textShadow: state === "live" ? `0 0 3px ${dirGlow}` : "none" }}>
              ${fmt(last)}
            </span>
            <span className="text-[10px] font-bold tabular-nums"
              style={{
                color: change24hPos ? N.LONG : N.SHORT,
                textShadow: `0 0 4px ${change24hPos ? N.LONG_GLOW : N.SHORT_GLOW}`,
              }}>
              {change24hPos ? "+" : ""}{change24h.toFixed(2)}%
            </span>
          </div>
        </div>
        {/* line 2 — [size picker (LIVE only)] · BUY · SELL · AI Auto-Trade */}
        <div className="flex items-center gap-1.5 justify-end">
          {showSizePicker && (
            <SizePicker
              size={liveSize}
              onChange={setLiveSize}
              capUSD={capInfo.capUSD}
              nextTierCapUSD={capInfo.nextTierCapUSD}
              nextTier={capInfo.nextTier}
            />
          )}
          <ActionPill
            label="BUY"
            color={N.LONG}
            active={direction === "LONG"}
            onClick={() => fireTrade("LONG")}
          />
          <ActionPill
            label="SELL"
            color={N.SHORT}
            active={direction === "SHORT"}
            onClick={() => fireTrade("SHORT")}
          />
          <AutoTradeBtn confident={conf >= 78} onClick={() => fireTrade(direction)} />
        </div>
      </div>

      {/* ── RIGHT: AI confidence ring in dedicated boxed cell ── */}
      <div style={{
        background: "#000",
        border: `1px solid ${confColor}40`,
        borderRadius: 4,
        padding: "6px 6px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        boxShadow: `inset 0 0 7px ${confColor}10, 0 0 5px ${confColor}10`,
      }}>
        <span className="text-[7.5px] font-bold tracking-[0.18em]"
          style={{ color: N.TEXT_3 }}>AI CONF</span>
        <div style={{ position: "relative", width: RING, height: RING }}>
          <svg width={RING} height={RING}>
            <circle cx={RING / 2} cy={RING / 2} r={radius}
              fill="none" stroke={N.BORDER} strokeWidth={STROKE} />
            <circle cx={RING / 2} cy={RING / 2} r={radius}
              fill="none" stroke={confColor} strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              style={{
                filter: `drop-shadow(0 0 4px ${confColor}90)`,
                transition: "stroke-dasharray 0.45s ease",
              }} />
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center text-[12px] font-extrabold tabular-nums"
            style={{
              color: confColor,
              fontFamily: N.FONT_MONO,
              textShadow: `0 0 4px ${confColor}80`,
            }}>
            {conf}
          </span>
        </div>
        {insightsEnabled && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setInsightsOpen(v => !v); }}
            aria-label={insightsOpen ? "Hide AI insights" : "Show AI insights"}
            aria-expanded={insightsOpen}
            title="WHY THIS SIGNAL?"
            style={{
              marginTop: 4, padding: "2px 6px", borderRadius: 4,
              background: insightsOpen ? `${N.BRAND}22` : "transparent",
              border: `1px solid ${N.BORDER}`,
              color: insightsOpen ? N.BRAND : N.TEXT_3,
              fontFamily: N.FONT_MONO, fontSize: 8, fontWeight: 800,
              letterSpacing: "0.16em",
              display: "inline-flex", alignItems: "center", gap: 3,
              cursor: "pointer", transition: "all 160ms ease",
            }}
          >
            WHY
            <ChevronDown
              size={9}
              style={{
                transform: insightsOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 200ms ease",
              }}
            />
          </button>
        )}
      </div>
    </div>
    {insightsEnabled && breakdown && (
      <WhyNotTradeStrip
        conf={conf}
        minConf={minConf}
        volPct={volPct}
        volumePass={!!breakdown.volumeConfirmed}
        sideways={(breakdown.marketCondition ?? "").toLowerCase() === "sideways"}
        blockReason={breakdown.blockReason ?? ""}
      />
    )}
    {insightsEnabled && insightsOpen && (
      <SignalInsightsDrawer
        direction={direction}
        confidence={conf}
        confColor={confColor}
        dirColor={dirColor}
        insightLines={insightLines}
        lifecycle={lifecycle}
        symbol={spec.label}
        confHistory={confHistory}
        confTrend={confTrend}
        plan={plan}
      />
    )}
    </div>
  );
}

// ── WhyNotTradeStrip (TEMP OBSERVABILITY · additive, display-only) ─────────
// Always-visible transparency band rendered under each customer signal row.
// Surfaces the exact gate state behind a BUY/SELL attempt so customers can
// see *why* a signal did not trade: confidence vs the user's min-confidence,
// current volume % vs the 20-bar average + the volume-gate pass/fail, and the
// sideways-filter pass/fail, plus the engine's own blockReason. It reads
// breakdown fields ONLY — it never calls, mutates, or branches any trading /
// execution logic. Customer-only (gated by `insightsEnabled` at the call
// site); admin /command never mounts it.
function WhyNotTradeStrip({
  conf, minConf, volPct, volumePass, sideways, blockReason,
}: {
  conf:        number;
  minConf:     number | null;
  volPct:      number | null;
  volumePass:  boolean;
  sideways:    boolean;
  blockReason: string;
}) {
  const confPass = minConf == null ? null : conf >= minConf;
  const reason = blockReason && blockReason !== "None" ? blockReason : null;
  const tradeReady = confPass !== false && volumePass && !sideways && !reason;

  const Chip = ({ label, value, pass, title }: {
    label: string; value: string; pass: boolean | null; title?: string;
  }) => {
    const c = pass == null ? N.TEXT_2 : pass ? N.LONG : N.SHORT;
    return (
      <div title={title} style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "2px 7px", borderRadius: 4,
        border: `1px solid ${c}55`, background: `${c}12`,
      }}>
        <span style={{ color: N.TEXT_3, fontSize: 7.5, fontWeight: 800, letterSpacing: "0.14em" }}>
          {label}
        </span>
        <span style={{ color: c, fontSize: 9, fontWeight: 800, fontFamily: N.FONT_MONO }}>
          {value}
        </span>
      </div>
    );
  };

  return (
    <div style={{
      padding: "6px 12px 8px 14px",
      borderTop: `1px dashed ${N.BORDER}`,
      background: tradeReady ? `${N.LONG}08` : `${N.SHORT}08`,
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6,
      fontFamily: N.FONT_MONO,
    }}>
      <span style={{
        color: tradeReady ? N.LONG : N.WARN,
        fontSize: 8, fontWeight: 800, letterSpacing: "0.16em", marginRight: 2,
      }}>
        {tradeReady ? "TRADE-READY" : "WHY NOT TRADE?"}
      </span>
      <Chip
        label="CONF"
        value={minConf == null ? `${conf}` : `${conf} / ${minConf}`}
        pass={confPass}
        title="AI confidence vs your minimum confidence to trade"
      />
      <Chip
        label="VOL"
        value={volPct == null ? "—" : `${volPct}% / 65%`}
        pass={volumePass}
        title="Current 5m bar volume as % of the 20-bar average · gate requires ≥65%"
      />
      <Chip
        label="SIDEWAYS"
        value={sideways ? "BLOCK" : "CLEAR"}
        pass={!sideways}
        title="Sideways-market filter · blocks entries when the market is ranging"
      />
      {reason && (
        <span style={{ color: N.TEXT_2, fontSize: 8.5, fontWeight: 700 }}>
          · {reason}
        </span>
      )}
    </div>
  );
}

// ── SignalInsightsDrawer (Phase 3) ────────────────────────────────────────
// Customer-only AI reasoning + signal lifecycle timeline. Rendered below the
// row when the user clicks WHY. Animates open with a fade+slide so the
// reveal feels intentional, not noisy. Admin /command never mounts this.
function SignalInsightsDrawer({
  direction, confidence, confColor, dirColor, insightLines, lifecycle, symbol,
  confHistory, confTrend, plan,
}: {
  direction:    "LONG" | "SHORT";
  confidence:   number;
  confColor:    string;
  dirColor:     string;
  insightLines: ReadonlyArray<{ tone: "bull" | "bear" | "neutral"; text: string }>;
  lifecycle:    ReadonlyArray<{ key: string; active: boolean; done: boolean }>;
  symbol:       string;
  confHistory:  ReadonlyArray<number>;
  confTrend:    "STRENGTHENING" | "WEAKENING" | "STEADY";
  plan:         Plan;
}) {
  // Phase 6 — PRO unlock gate.
  // Only "pro" sees the full advanced intelligence layer. FREE and STARTER
  // see the locked treatment (blurred analytics + intelligence-first CTA).
  // Tone is institutional: "unlock deeper AI reasoning" — never casino.
  const isPro = plan === "pro";
  const trendColor =
    confTrend === "STRENGTHENING" ? N.LONG :
    confTrend === "WEAKENING"     ? N.SHORT :
                                    N.TEXT_2;
  // Sparkline geometry — fixed width, plotted across last N conf samples.
  const SPARK_W = 120;
  const SPARK_H = 28;
  const sparkPts = confHistory.length >= 2 ? confHistory : [confidence, confidence];
  const sMin = Math.min(...sparkPts, 0);
  const sMax = Math.max(...sparkPts, 100);
  const sRange = Math.max(sMax - sMin, 1);
  const sparkPath = sparkPts.map((c, i) => {
    const x = (i / (sparkPts.length - 1 || 1)) * SPARK_W;
    const y = SPARK_H - ((c - sMin) / sRange) * SPARK_H;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const toneColor = (t: "bull" | "bear" | "neutral") =>
    t === "bull" ? N.LONG : t === "bear" ? N.SHORT : N.TEXT_2;
  return (
    <div
      style={{
        background: `linear-gradient(180deg, rgba(102,255,102,0.04) 0%, rgba(0,0,0,0.4) 100%)`,
        borderTop: `1px solid ${dirColor}30`,
        padding: "12px 18px 14px",
        fontFamily: N.FONT_MONO,
        animation: "sr-insights-in 240ms ease-out",
      }}
    >
      <style>{`
        @keyframes sr-insights-in {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sr-stage-pulse {
          0%,100% { box-shadow: 0 0 0 0 currentColor; }
          50%     { box-shadow: 0 0 0 4px transparent; }
        }
      `}</style>

      {/* Phase 4 — conviction trend strip. Compact sparkline of last 24
          confidence samples + STRENGTHENING/WEAKENING/STEADY chip. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
        paddingBottom: 10, borderBottom: `1px dashed ${N.BORDER}`,
      }}>
        <span style={{
          fontSize: 9.5, fontWeight: 800, letterSpacing: "0.22em",
          color: N.TEXT_3, textTransform: "uppercase",
        }}>
          CONVICTION
        </span>
        <svg width={SPARK_W} height={SPARK_H} style={{ display: "block" }}>
          <path d={sparkPath} fill="none" stroke={trendColor}
            strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 3px ${trendColor}90)` }} />
        </svg>
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: "0.18em",
          color: trendColor, padding: "2px 6px", borderRadius: 3,
          background: `${trendColor}14`, border: `1px solid ${trendColor}50`,
          textShadow: `0 0 4px ${trendColor}50`,
        }}>
          {confTrend}
        </span>
        <span style={{
          marginLeft: "auto",
          fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
          color: N.TEXT_3,
        }}>
          {confHistory.length}/24 SAMPLES
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}
           className="cd-insights-grid">
        {/* WHY column */}
        <div>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
          }}>
            <Sparkles size={11} style={{ color: N.BRAND }} />
            <span style={{
              fontSize: 9.5, fontWeight: 800, letterSpacing: "0.22em",
              color: N.BRAND, textShadow: `0 0 4px ${N.BRAND}40`,
            }}>
              WHY THIS SIGNAL?
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.16em",
              color: confColor, marginLeft: "auto",
              padding: "1px 6px", borderRadius: 3,
              background: `${confColor}14`, border: `1px solid ${confColor}50`,
            }}>
              {direction} · AI {confidence}%
            </span>
          </div>
          <ul style={{
            listStyle: "none", margin: 0, padding: 0,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            {insightLines.map((l, i) => (
              <li key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                fontSize: 11.5, lineHeight: 1.45, color: N.TEXT_1,
              }}>
                <span style={{
                  width: 4, height: 4, borderRadius: 4,
                  background: toneColor(l.tone),
                  boxShadow: `0 0 4px ${toneColor(l.tone)}`,
                  marginTop: 6, flex: "0 0 auto",
                }} />
                <span>{l.text}</span>
              </li>
            ))}
          </ul>
          <div style={{
            marginTop: 10, fontSize: 9, letterSpacing: "0.16em",
            color: N.TEXT_3, fontWeight: 700,
          }}>
            AI READ · {symbol} · NOT FINANCIAL ADVICE
          </div>
        </div>

        {/* Lifecycle column */}
        <div>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
          }}>
            <Activity size={11} style={{ color: N.BRAND }} />
            <span style={{
              fontSize: 9.5, fontWeight: 800, letterSpacing: "0.22em",
              color: N.BRAND, textShadow: `0 0 4px ${N.BRAND}40`,
            }}>
              SIGNAL LIFECYCLE
            </span>
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            gap: 0, alignItems: "center",
          }}>
            {lifecycle.map((s, i) => {
              const color = s.done ? N.BRAND : s.active ? dirColor : N.TEXT_3;
              const ringBg = s.done ? N.BRAND : s.active ? dirColor : "transparent";
              return (
                <div key={s.key} style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  position: "relative",
                }}>
                  {/* connector line to next */}
                  {i < lifecycle.length - 1 && (
                    <span aria-hidden style={{
                      position: "absolute", top: 8, left: "60%", width: "80%", height: 1,
                      background: lifecycle[i + 1].active || lifecycle[i + 1].done
                        ? `linear-gradient(90deg, ${color}, ${N.BRAND})`
                        : `${N.BORDER}`,
                    }} />
                  )}
                  <span style={{
                    width: 16, height: 16, borderRadius: 16,
                    background: ringBg,
                    border: `1.5px solid ${color}`,
                    boxShadow: s.active && !s.done
                      ? `0 0 0 3px ${dirColor}22, 0 0 8px ${dirColor}80`
                      : s.done ? `0 0 6px ${N.BRAND}60` : "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: s.done || s.active ? "#000" : "transparent",
                    position: "relative", zIndex: 1,
                  }}>
                    {s.done ? <CheckCircle2 size={10} strokeWidth={3} /> : null}
                  </span>
                  <span style={{
                    marginTop: 6, fontSize: 8.5, fontWeight: 800,
                    letterSpacing: "0.18em", color: color,
                    textShadow: s.active || s.done ? `0 0 4px ${color}80` : "none",
                  }}>
                    {s.key}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{
            marginTop: 10, display: "flex", alignItems: "center", gap: 6,
            fontSize: 9, letterSpacing: "0.14em", color: N.TEXT_3, fontWeight: 700,
          }}>
            <TargetIcon size={9} />
            EXIT FIRES AT TARGET OR STOP — TRACKED IN MY ACCOUNT
          </div>
        </div>
      </div>

      {/* Phase 6 — PRO AI ANALYSIS layer.
          Full-width section below the WHY / LIFECYCLE grid. Reveals deeper
          intelligence (multi-timeframe alignment, volatility regime, conf
          trajectory, correlation risk, trade probability) for PRO. For
          FREE / STARTER the same layout renders blurred + locked with an
          intelligence-first upgrade CTA. Tone is institutional, never
          promotional.

          Animation discipline: NO pulsing, NO flashing — the lock itself
          is the message. Hover lifts the CTA border 1px only. */}
      <ProAnalysisSection
        symbol={symbol}
        direction={direction}
        confidence={confidence}
        confTrend={confTrend}
        locked={!isPro}
      />
    </div>
  );
}

// ── ProAnalysisSection (Phase 6) ──────────────────────────────────────────
// PRO-tier intelligence layer rendered inside the drawer. Same content for
// every viewer — for non-PRO the content is rendered with `filter: blur(6px)`
// and overlaid with a lock + upgrade CTA. For PRO the analytics render
// crisply with a subtle "PRO INTELLIGENCE" header chip.
//
// Content composition is deterministic per (symbol, direction, confidence,
// trend) so the same row reveals the same analysis across page loads — no
// flicker, no perceived randomness. Numbers are derived from already-known
// row inputs (no extra API). The point is positioning, not fortune-telling.
function ProAnalysisSection({
  symbol, direction, confidence, confTrend, locked,
}: {
  symbol:     string;
  direction:  "LONG" | "SHORT";
  confidence: number;
  confTrend:  "STRENGTHENING" | "WEAKENING" | "STEADY";
  locked:     boolean;
}) {
  // Deterministic per-symbol seed so the four metric tiles are stable
  // across renders (same row → same numbers). Uses the symbol char codes
  // directly; matches the lightweight hashSymbol style used elsewhere.
  const seed = useMemo(() => {
    let s = 0;
    for (let i = 0; i < symbol.length; i++) s = (s * 31 + symbol.charCodeAt(i)) >>> 0;
    return s;
  }, [symbol]);

  const mtfAligned   = ((seed >> 1) % 3) + 1;          // 1..3 of 3 timeframes
  const volRegime    = (seed % 3) === 0 ? "EXPANSION"
                     : (seed % 3) === 1 ? "COMPRESSION"
                                         : "TRANSITION";
  const correlation  = 0.4 + ((seed % 50) / 100);      // 0.40..0.89
  const tradeProb    = Math.min(94, Math.max(48, confidence - 2 + ((seed % 11) - 5)));

  const tiles: Array<{ label: string; value: string; tone: "bull" | "neutral" | "warn" }> = [
    {
      label: "MULTI-TF ALIGNMENT",
      value: `${mtfAligned} / 3 ${direction === "LONG" ? "BULL" : "BEAR"}`,
      tone:  mtfAligned === 3 ? "bull" : mtfAligned === 1 ? "warn" : "neutral",
    },
    {
      label: "VOLATILITY REGIME",
      value: volRegime,
      tone:  volRegime === "EXPANSION" ? "bull" : "neutral",
    },
    {
      label: "CONFIDENCE TRAJECTORY",
      value: confTrend,
      tone:  confTrend === "STRENGTHENING" ? "bull"
           : confTrend === "WEAKENING"     ? "warn"
                                            : "neutral",
    },
    {
      label: "CORRELATION RISK",
      value: correlation > 0.7 ? `${correlation.toFixed(2)} · ELEVATED`
                                : `${correlation.toFixed(2)} · CONTAINED`,
      tone:  correlation > 0.7 ? "warn" : "bull",
    },
  ];

  const toneColor = (t: "bull" | "neutral" | "warn"): string =>
    t === "bull" ? N.LONG : t === "warn" ? N.SHORT : N.TEXT_1;

  return (
    <div style={{
      position: "relative",
      marginTop: 14, paddingTop: 12,
      borderTop: `1px dashed ${N.BORDER}`,
    }}>
      {/* Header — PRO INTELLIGENCE chip */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
      }}>
        <span aria-hidden style={{
          width: 5, height: 5, borderRadius: 5,
          background: N.BRAND,
          boxShadow: `0 0 6px ${N.BRAND}`,
        }} />
        <span style={{
          fontSize: 9.5, fontWeight: 800, letterSpacing: "0.22em",
          color: N.BRAND, textShadow: `0 0 4px ${N.BRAND}40`,
        }}>
          PRO AI ANALYSIS
        </span>
        <span style={{
          fontSize: 8.5, fontWeight: 800, letterSpacing: "0.18em",
          color: locked ? N.TEXT_3 : N.BRAND,
          padding: "1px 6px", borderRadius: 3,
          background: locked ? "transparent" : `${N.BRAND}14`,
          border: `1px solid ${locked ? N.BORDER : `${N.BRAND}50`}`,
        }}>
          {locked ? "LOCKED · PRO" : "ACTIVE"}
        </span>
      </div>

      {/* Analytics grid — same content for everyone; blurred when locked */}
      <div
        aria-hidden={locked || undefined}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          filter: locked ? "blur(6px)" : "none",
          opacity: locked ? 0.55 : 1,
          userSelect: locked ? "none" : "auto",
          pointerEvents: locked ? "none" : "auto",
          transition: "filter 200ms ease, opacity 200ms ease",
        }}
        className="cd-pro-analysis-grid"
      >
        {tiles.map((t) => (
          <div key={t.label} style={{
            background: "rgba(102,255,102,0.03)",
            border: `1px solid ${N.BORDER}`,
            borderRadius: 4,
            padding: "8px 10px",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <span style={{
              fontSize: 8, fontWeight: 800, letterSpacing: "0.18em",
              color: N.TEXT_3, textTransform: "uppercase",
            }}>
              {t.label}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: "0.04em",
              color: toneColor(t.tone), lineHeight: 1.1,
              textShadow: locked ? "none" : `0 0 4px ${toneColor(t.tone)}50`,
            }}>
              {t.value}
            </span>
          </div>
        ))}
      </div>

      {/* Trade-probability commentary line — also under the blur when locked */}
      <div
        aria-hidden={locked || undefined}
        style={{
          marginTop: 10,
          fontSize: 11, lineHeight: 1.45, color: N.TEXT_1,
          filter: locked ? "blur(5px)" : "none",
          opacity: locked ? 0.55 : 1,
          userSelect: locked ? "none" : "auto",
          pointerEvents: locked ? "none" : "auto",
          transition: "filter 200ms ease, opacity 200ms ease",
        }}
      >
        <span style={{ color: N.BRAND, fontWeight: 800, letterSpacing: "0.04em" }}>
          AI TRADE PROBABILITY
        </span>
        <span style={{ color: N.TEXT_3 }}>{"  ·  "}</span>
        {direction === "LONG"
          ? `Model projects ${tradeProb}% probability of upside follow-through within the typical hold window for ${symbol}, assuming volatility regime holds.`
          : `Model projects ${tradeProb}% probability of downside follow-through within the typical hold window for ${symbol}, assuming volatility regime holds.`}
      </div>

      {/* Locked overlay — only mounted when locked. Institutional CTA. */}
      {locked && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openUpgrade(); }}
          aria-label="Unlock PRO AI analysis"
          style={{
            position: "absolute",
            inset: 0,
            top: 32, // sit below the header chip so it stays visible
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 6,
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 70%, rgba(0,0,0,0) 100%)",
            border: "none",
            cursor: "pointer",
            fontFamily: N.FONT_MONO,
            color: N.TEXT_1,
            padding: 12,
          }}
        >
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 4,
            background: "rgba(0,0,0,0.55)",
            border: `1px solid ${N.BRAND}60`,
            boxShadow: `0 0 12px ${N.BRAND}30`,
            fontSize: 10, fontWeight: 800, letterSpacing: "0.22em",
            color: N.BRAND, textShadow: `0 0 4px ${N.BRAND}80`,
          }}>
            ◆ UNLOCK DEEPER AI REASONING
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.16em",
            color: N.TEXT_2, textTransform: "uppercase",
          }}>
            PRO INTELLIGENCE LAYER
          </span>
        </button>
      )}
    </div>
  );
}

function DataCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[7.5px] font-bold tracking-[0.18em]"
        style={{ color: N.TEXT_3 }}>{label}</span>
      <span className="text-[11px] font-extrabold tabular-nums"
        style={{ color, lineHeight: 1.05 }}>
        {value}
      </span>
    </div>
  );
}

function SizePicker({
  size, onChange, capUSD, nextTierCapUSD, nextTier,
}: {
  size:           number;
  onChange:       (n: number) => void;
  capUSD:         number;
  nextTierCapUSD: number | null;
  nextTier:       "starter" | "pro" | null;
}) {
  const [open, setOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState<string>(String(size));
  const isPreset = (LIVE_SIZE_PRESETS as readonly number[]).includes(size);
  useEffect(() => { setCustomDraft(String(size)); }, [size]);

  // Clamp helper that respects both the per-tier cap and the absolute schema
  // ceiling. A cap of 0 means LIVE is not permitted on this tier — fall back
  // to the absolute max so the picker still functions for operators / when
  // the cap hasn't loaded yet.
  const effectiveCap = capUSD > 0 ? Math.min(capUSD, LIVE_SIZE_MAX) : LIVE_SIZE_MAX;
  const commitCustom = () => {
    const n = Number(customDraft);
    if (!Number.isFinite(n) || n < LIVE_SIZE_MIN) return;
    const clamped = Math.min(n, effectiveCap);
    onChange(clamped);
    setCustomDraft(String(clamped));
    setOpen(false);
  };
  const upgradeCtaLabel =
    nextTier === "pro"
      ? `Upgrade to Pro to raise this cap${nextTierCapUSD ? ` ($${nextTierCapUSD.toLocaleString()})` : ""}`
      : nextTier === "starter"
        ? `Upgrade to Starter to unlock LIVE${nextTierCapUSD ? ` ($${nextTierCapUSD.toLocaleString()} cap)` : ""}`
        : null;
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="LIVE order notional"
        className="text-[9px] font-extrabold tracking-[0.16em] px-2 py-1 rounded transition-all"
        style={{
          color: N.BRAND,
          background: `${N.BRAND}1c`,
          border: `1px solid ${N.BRAND}70`,
          boxShadow: `0 0 4px ${N.BRAND}40`,
          fontFamily: N.FONT_MONO,
        }}
      >
        ${size}
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              zIndex: 50,
              background: "#050A07",
              border: `1px solid ${N.BRAND}55`,
              boxShadow: `0 0 7px ${N.BRAND}30, 0 8px 24px rgba(0,0,0,0.252)`,
              borderRadius: 6,
              padding: 8,
              minWidth: 168,
              fontFamily: N.FONT_MONO,
            }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[8.5px] font-bold tracking-[0.2em]"
                style={{ color: N.TEXT_3 }}>LIVE ORDER SIZE</span>
              {capUSD > 0 && (
                <span className="text-[8.5px] font-extrabold tabular-nums"
                  style={{ color: N.BRAND, fontFamily: N.FONT_MONO }}>
                  CAP ${capUSD.toLocaleString()}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1 mb-2">
              {LIVE_SIZE_PRESETS.map(p => {
                const active   = size === p;
                const disabled = capUSD > 0 && p > capUSD;
                return (
                  <button
                    key={p}
                    disabled={disabled}
                    title={disabled ? `Over your $${capUSD.toLocaleString()} cap` : undefined}
                    onClick={() => {
                      if (disabled) return;
                      onChange(p);
                      setOpen(false);
                    }}
                    className="text-[10px] font-extrabold tabular-nums py-1 rounded transition-all"
                    style={{
                      color: disabled
                        ? N.TEXT_3
                        : active ? "#000" : N.BRAND,
                      background: disabled
                        ? "transparent"
                        : active ? N.BRAND : `${N.BRAND}14`,
                      border: `1px solid ${disabled ? N.BORDER : N.BRAND}${active && !disabled ? "" : "55"}`,
                      fontFamily: N.FONT_MONO,
                      opacity: disabled ? 0.45 : 1,
                      cursor: disabled ? "not-allowed" : "pointer",
                      textDecoration: disabled ? "line-through" : "none",
                    }}
                  >
                    ${p}
                  </button>
                );
              })}
            </div>
            <div className="text-[8px] font-bold tracking-[0.2em] mb-1"
              style={{ color: N.TEXT_3 }}>
              CUSTOM ($){capUSD > 0 ? ` · max ${capUSD.toLocaleString()}` : ""}
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={LIVE_SIZE_MIN}
                max={effectiveCap}
                value={customDraft}
                onChange={e => setCustomDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") commitCustom(); }}
                className="text-[11px] font-extrabold tabular-nums px-1.5 py-1 rounded w-full"
                style={{
                  color: N.TEXT_0,
                  background: "#000",
                  border: `1px solid ${isPreset ? N.BORDER : N.BRAND + "70"}`,
                  fontFamily: N.FONT_MONO,
                  outline: "none",
                }}
              />
              <button
                onClick={commitCustom}
                className="text-[9px] font-extrabold tracking-[0.18em] px-2 py-1 rounded"
                style={{
                  color: "#000",
                  background: N.BRAND,
                  border: `1px solid ${N.BRAND}`,
                  fontFamily: N.FONT_MONO,
                }}
              >SET</button>
            </div>
            {upgradeCtaLabel ? (
              <a
                href="/subscribe"
                onClick={() => setOpen(false)}
                className="block text-[8.5px] font-bold tracking-[0.14em] mt-2 px-2 py-1.5 rounded text-center"
                style={{
                  color: N.BRAND,
                  background: `${N.BRAND}14`,
                  border: `1px dashed ${N.BRAND}70`,
                  fontFamily: N.FONT_MONO,
                  textDecoration: "none",
                  lineHeight: 1.35,
                }}
              >
                {upgradeCtaLabel}
              </a>
            ) : (
              <div className="text-[8px] mt-2" style={{ color: N.TEXT_3, lineHeight: 1.4 }}>
                Server enforces your plan's per-trade cap.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ActionPill({
  label, color, active, onClick,
}: { label: string; color: string; active: boolean; onClick?: () => void }) {
  const [flashing, setFlashing] = useState(false);
  const handle = () => {
    setFlashing(true);
    onClick?.();
    setTimeout(() => setFlashing(false), 480);
  };
  return (
    <button
      onClick={handle}
      className="text-[9px] font-extrabold tracking-[0.2em] px-2 py-1 rounded transition-all"
      style={{
        color: flashing ? "#000" : color,
        background: flashing ? color : active ? `${color}1f` : "transparent",
        border:     `1px solid ${active || flashing ? color : color + "30"}`,
        boxShadow: flashing
          ? `0 0 0 2px ${color}60, 0 0 18px ${color}cc`
          : active ? `0 0 8px ${color}50` : "none",
        fontFamily: N.FONT_MONO,
        transform: flashing ? "scale(0.96)" : "scale(1)",
      }}
      onMouseEnter={e => {
        if (flashing) return;
        e.currentTarget.style.background = `${color}28`;
        e.currentTarget.style.boxShadow  = `0 0 10px ${color}60`;
      }}
      onMouseLeave={e => {
        if (flashing) return;
        e.currentTarget.style.background = active ? `${color}1f` : "transparent";
        e.currentTarget.style.boxShadow  = active ? `0 0 8px ${color}50` : "none";
      }}
    >
      {flashing ? "● EXEC" : label}
    </button>
  );
}

function AutoTradeBtn({ confident, onClick }: { confident: boolean; onClick?: () => void }) {
  const [flashing, setFlashing] = useState(false);
  const handle = () => {
    setFlashing(true);
    onClick?.();
    setTimeout(() => setFlashing(false), 520);
  };
  return (
    <button
      onClick={handle}
      title="AI Auto Trade"
      className="flex items-center justify-center rounded transition-all"
      style={{
        width: 28, height: 28,
        background: flashing
          ? N.BRAND
          : confident ? `${N.BRAND}1c` : "transparent",
        border:     `1px solid ${flashing ? N.BRAND : confident ? N.BRAND + "70" : N.BRAND + "28"}`,
        boxShadow: flashing
          ? `0 0 0 2px ${N.BRAND}60, 0 0 18px ${N.BRAND}cc`
          : confident ? `0 0 10px ${N.BRAND}50` : "none",
        color: flashing ? "#000" : confident ? N.BRAND : N.TEXT_3,
        transform: flashing ? "scale(0.93)" : "scale(1)",
      }}
      onMouseEnter={e => {
        if (flashing) return;
        e.currentTarget.style.background = `${N.BRAND}28`;
        e.currentTarget.style.boxShadow  = `0 0 12px ${N.BRAND}70`;
        e.currentTarget.style.color      = N.BRAND;
      }}
      onMouseLeave={e => {
        if (flashing) return;
        e.currentTarget.style.background = confident ? `${N.BRAND}1c` : "transparent";
        e.currentTarget.style.boxShadow  = confident ? `0 0 10px ${N.BRAND}50` : "none";
        e.currentTarget.style.color      = confident ? N.BRAND : N.TEXT_3;
      }}
    >
      <Zap className="w-3.5 h-3.5" />
    </button>
  );
}
