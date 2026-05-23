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
import { Zap } from "lucide-react";
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

import { authFetch } from "../../../lib/authFetch";
// API base URL — mirrors Portal.tsx resolution so production cross-origin
// API calls (api.aicandlez.com) work when SignalRow is rendered from any
// host. In dev it falls back to same-origin so the shared proxy handles it.
const apiBaseUrl: string = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? ""
).replace(/\/$/, "");

function fmt(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1)    return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

/* deterministic per-symbol values so the grid is stable across renders */
export function hashSymbol(sym: string): number {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 33 + sym.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Shared direction resolver — used both by SignalRow and by the filter logic
 * in SignalsRow so a row's displayed LONG/SHORT is always identical to the
 * filter classification.
 */
export function resolveDirection(
  symbol: string,
  breakdown?: SymBreakdown,
): "LONG" | "SHORT" {
  if (breakdown?.agreedAction === "BUY")  return "LONG";
  if (breakdown?.agreedAction === "SELL") return "SHORT";
  return (hashSymbol(symbol) % 100) > 55 ? "LONG" : "SHORT";
}

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
  const { isAdmin: isOperatorRole } = useUserRole();
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

  /** Mirror a paper open into the server-side sim so dashboard panels see it. */
  const mirrorPaperToServer = async (
    sym: string, side: "BUY" | "SELL",
  ) => {
    try {
      const token = await getToken().catch(() => null);
      // Conservative fixed notional matches the live-order endpoint default.
      // Server route /api/simulation/order expects { symbol, side, sizeUSD }.
      await authFetch(`${apiBaseUrl}/api/simulation/order`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ symbol: sym, side, sizeUSD: 100 }),
      });
    } catch { /* paper mirror is best-effort */ }
  };

  /** Submit a real-money order through the user's connected exchange. */
  const submitLive = async (
    sym: string, side: "BUY" | "SELL", sizeUSD: number, useSandbox: boolean = false,
  ): Promise<{
    ok: boolean;
    error?: string;
    fillPrice?: number;
    exchange?: string;
    exchangeOrderId?: string;
    dryRun?: boolean;
  }> => {
    try {
      const token = await getToken().catch(() => null);
      const res = await authFetch(`${apiBaseUrl}/api/user/live-order`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ symbol: sym, side, sizeUSD, useSandbox }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, error: (body as { error?: string }).error ?? `HTTP ${res.status}` };
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
  const fireTrade = (side: "LONG" | "SHORT") => {
    // ── [BUY-TRACE] entry ───────────────────────────────────────────────────
    // Hard instrumentation for the live BUY path. Use a unique [BUY-TRACE]
    // prefix so the user can grep browser console + server log together.
    // Remove these once the first real Kraken fill is confirmed end-to-end.
    console.warn("[BUY-TRACE] fireTrade ENTRY", {
      symbol: spec.symbol,
      side,
      entry,
      isOperatorRole,
      isCustomerPortal: portalMode.isCustomerPortal,
      mode: portalMode.mode,
      canUseLive: portalMode.canUseLive,
      hasExchange: portalMode.hasExchange,
      paperSandbox: portalMode.paperSandboxEnabled,
    });
    if (!entry || entry <= 0) {
      console.warn("[BUY-TRACE] fireTrade EXIT — entry<=0 (market feed warming up)");
      toast({
        title: "MARKET FEED WARMING UP",
        description: `${spec.display} — waiting for live price`,
      });
      return;
    }
    const sl = side === "LONG" ? entry * 0.98  : entry * 1.02;
    const tp = side === "LONG" ? entry * 1.045 : entry * 0.955;

    // LIVE routing — only when the customer Portal mode toggle is engaged
    // AND the tier permits live exec AND a validated exchange is connected.
    // If any condition fails we fall back to PAPER and toast once per row.
    if (
      portalMode.isCustomerPortal &&
      portalMode.mode === "LIVE" &&
      portalMode.canUseLive &&
      portalMode.hasExchange
    ) {
      toast({
        title: `LIVE ORDER SUBMITTED — ${spec.label}`,
        description: `${side} · routing to your connected exchange · $${liveSize} notional · AI ${conf}%`,
      });
      void submitLive(spec.symbol, side === "LONG" ? "BUY" : "SELL", liveSize).then(r => {
        if (!r.ok) {
          // Real exchange rejected (no connection, decrypt failed, etc.).
          // Mirror the order into PAPER so the user still sees feedback, and
          // surface a one-shot toast explaining why.
          if (!liveFallbackToastedRef.current) {
            liveFallbackToastedRef.current = true;
            toast({
              title: "LIVE ORDER FAILED — FELL BACK TO PAPER",
              description: r.error ?? "Live exchange rejected the order",
            });
          }
          firePaper(side, sl, tp);
          return;
        }
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

    // Admin / non-customer-portal trees (CommandCenter, /admintrade /portal):
    // real-only by invariant — route directly through the operator-env Kraken
    // execution path (`/api/exchange/order/execute`). Path A surgical bridge
    // so super-admin can manually fire a real Kraken order from a signal row
    // for live-test validation. Customer-portal trees never reach this branch.
    if (isOperatorRole || !portalMode.isCustomerPortal) {
      console.warn("[BUY-TRACE] BRANCH = OPERATOR (Kraken env path)");
      if (operatorOrderInFlightRef.current) {
        console.warn("[BUY-TRACE] OPERATOR EXIT — order already in flight");
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
          console.warn("[BUY-TRACE] BEFORE FETCH", { url, payload, hasToken: !!token });
          const res = await authFetch(url, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(payload),
          });
          console.warn("[BUY-TRACE] AFTER FETCH", { status: res.status, ok: res.ok });
          if (!res.ok) {
            const body = await res.json().catch(() => ({} as { error?: string }));
            console.warn("[BUY-TRACE] REJECTED body", body);
            toast({
              title: `OPERATOR ORDER REJECTED — ${spec.label}`,
              description: (body as { error?: string }).error ?? `HTTP ${res.status}`,
            });
            return;
          }
          const body = (await res.json().catch(() => ({}))) as {
            id?: string; status?: string; fillPrice?: number; avgPrice?: number;
          };
          console.warn("[BUY-TRACE] FILLED body", body);
          const fill = body.fillPrice ?? body.avgPrice;
          toast({
            title: `OPERATOR FILLED — ${spec.label}${fill ? ` @ $${fmt(fill)}` : ""}`,
            description: [side, "KRAKEN", body.status, body.id ? `#${body.id.slice(-8)}` : ""].filter(Boolean).join(" · "),
          });
        } catch (err) {
          console.error("[BUY-TRACE] FETCH THREW", err);
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
    console.warn("[BUY-TRACE] FELL THROUGH past operator branch — going to firePaper/firePaperSim");

    firePaper(side, sl, tp);
  };
  const change24hPos = change24h >= 0;
  const confColor  = conf >= 78 ? N.BRAND : conf >= 62 ? N.BRAND_DEEP : N.WARN;

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
    <div
      className="grid items-center transition-colors"
      style={{
        gridTemplateColumns: "260px 1fr 84px",
        gap: 10,
        padding: "10px 12px 10px 14px",
        minHeight: 72,
        borderBottom: `1px solid ${N.BORDER}`,
        background: rowBg,
        fontFamily: N.FONT_MONO,
        boxShadow: `inset 5px 0 0 0 ${dirColor}, inset 5px 0 14px 0 ${dirColor}28`,
        position: "relative",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = rowBgHover)}
      onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
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
              boxShadow: `0 0 8px ${dirColor}40`,
              fontFamily: N.FONT_MONO,
            }}>
            {direction}
          </span>
          <span style={{
            width: 5, height: 5, borderRadius: 5,
            background: state === "live" ? N.BRAND : state === "synthetic" ? N.WARN : N.TEXT_3,
            boxShadow:  state === "live" ? `0 0 6px ${N.BRAND}` : "none",
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
                       textShadow: state === "live" ? `0 0 5px ${dirGlow}` : "none" }}>
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
        boxShadow: `inset 0 0 10px ${confColor}10, 0 0 8px ${confColor}10`,
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
              textShadow: `0 0 6px ${confColor}80`,
            }}>
            {conf}
          </span>
        </div>
      </div>
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
          boxShadow: `0 0 6px ${N.BRAND}40`,
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
              boxShadow: `0 0 18px ${N.BRAND}30, 0 8px 24px rgba(0,0,0,0.6)`,
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
        boxShadow:  flashing
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
        boxShadow:  flashing
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
