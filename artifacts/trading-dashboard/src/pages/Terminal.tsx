import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bell,
  Bot,
  Crosshair,
  Flame,
  Radio,
  Shield,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { usePaperSignals, type OpportunityVM } from "../hooks/usePaperSignals";
import {
  PaperTradesProvider,
  usePaperTrades,
  STARTING_EQUITY,
} from "../hooks/usePaperTrades";
import { useExecutionState } from "../hooks/useExecutionState";
import { authFetch } from "../lib/authFetch";
import type { SignalLogEntry } from "../components/command/types";

const apiBaseUrl: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

/* ── exchange-balances hook (canonical /api/user/exchanges/balances) ─────
 * Mirrors the AdminPortalLegacy + PortalCustomerShell pattern. 30s poll,
 * fail-soft. Customer Portal LOCKED INVARIANT: this is presentational
 * only — customers never route their own orders through this connection;
 * AICandlez executes via server-side Kraken keys. */
type BalanceMap = Record<string, { free: number; locked: number; total: number }>;
interface BalanceConnection {
  exchange:       string;
  label:          string | null;
  tradingMode:    string;
  ok:             boolean;
  totalEquityUSD: number;
  balances:       BalanceMap;
  lastUpdated:    number;
  error?:         string;
}
interface BalancesResponse {
  connections:    BalanceConnection[];
  totalEquityUSD: number;
  fetchedAt:      number;
}
function useExchangeBalances() {
  return useQuery<BalancesResponse>({
    queryKey: ["user-exchanges-balances-terminal"],
    queryFn: async () => {
      const res = await authFetch(`${apiBaseUrl}/api/user/exchanges/balances`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`balances_${res.status}`);
      return (await res.json()) as BalancesResponse;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
}

/* ── AI AUTOTRADE state (canonical /api/user/ai-trading/*) ───────────────
 * Server-backed (`user_settings.autoMode`), gated by `resolveAiTradingGate`
 * (plan + planStatus + role). Free users can't flip it ON — mutation
 * returns 402 and the query continues to report enabled=false. Mirrors
 * PortalCustomerShell's `useAiTradingState`. */
interface AiTradingState {
  enabled: boolean;
  allowed: boolean;
  plan:    "free" | "starter" | "pro";
  isAdmin: boolean;
  reason:  string | null;
}
const AI_TRADING_QK = ["ai-trading-state-terminal"] as const;
function useAiTradingState() {
  const q = useQuery<AiTradingState>({
    queryKey: AI_TRADING_QK,
    queryFn: async () => {
      const res = await authFetch(`${apiBaseUrl}/api/user/ai-trading/state`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json();
    },
    staleTime:            30_000,
    refetchInterval:      60_000,
    refetchOnWindowFocus: true,
  });
  const state: AiTradingState = q.data ?? {
    enabled: false, allowed: false, plan: "free", isAdmin: false, reason: null,
  };
  const setEnabled = async (next: boolean): Promise<{ ok: boolean; needsUpgrade?: boolean }> => {
    try {
      const res = await authFetch(`${apiBaseUrl}/api/user/ai-trading/enable`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ enabled: next }),
      });
      if (res.status === 402) return { ok: false, needsUpgrade: true };
      if (!res.ok) return { ok: false };
      const data = await res.json();
      q.refetch();
      return { ok: !!data.enabled === next };
    } catch {
      return { ok: false };
    }
  };
  return { ...state, isLoading: q.isLoading, refetch: q.refetch, setEnabled };
}

/** Convert raw engine blockReason → punchy, human-readable clause for the
 *  AI activity feed. Preserves intelligence/realism without leaking raw
 *  engine internals into the cinematic surface. */
function prettyBlockReason(raw: string | null | undefined): string {
  if (!raw || raw === "None") return "";
  if (/^MTF mismatch/i.test(raw))            return "conflicting MTF · 5m / 15m";
  if (/sideways/i.test(raw))                 return "sideways · volatility compression";
  if (/HOLD bias/i.test(raw))                return "no directional bias · HOLD";
  if (/below.*threshold/i.test(raw))         return "confidence below execution floor";
  if (/max active positions/i.test(raw))     return "position cap reached";
  if (/volume/i.test(raw))                   return "weak volume confirmation";
  if (/correlation/i.test(raw))              return "correlation cluster — risk gate";
  if (/trend/i.test(raw))                    return "1H trend misalignment";
  return raw.toLowerCase();
}

function fmtHHMMSS(ts: number): string {
  const d = new Date(ts);
  const h = d.getUTCHours().toString().padStart(2, "0");
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  const s = d.getUTCSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}
function fmtBalanceQty(qty: number, asset: string): string {
  const isFiat = /^(USD|USDT|USDC|EUR|GBP)$/i.test(asset);
  if (isFiat) {
    return qty.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (qty >= 1)   return qty.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (qty >= 0.01) return qty.toFixed(5);
  return qty.toFixed(8);
}

const BRAND = "#66FF66";
const LIME = "#7CFF00";
const EMERALD = "#00C853";
const VIVID = "#39FF14";
const RED = "#FF3B3B";
const RED_SOFT = "#FF6B6B";
const BG_0 = "#000000";
const BG_1 = "#050A07";
const BG_2 = "#0A1410";
const BG_3 = "#0F1F18";
const HAIR_10 = "rgba(124,255,0,0.10)";
const HAIR_18 = "rgba(124,255,0,0.18)";
const HAIR_RED_18 = "rgba(255,59,59,0.18)";
const TXT_85 = "rgba(255,255,255,0.85)";
const TXT_65 = "rgba(255,255,255,0.65)";
const TXT_40 = "rgba(255,255,255,0.40)";
const TXT_25 = "rgba(255,255,255,0.22)";

type Dir = "LONG" | "SHORT";
type Signal = {
  sym: string;
  dir: Dir;
  reason: string;
  tag: string;
  price: string;
  changePct: number;
  conf: number;
  entry: string;
  sl: string;
  tp: string;
  rr: string;
  m5: "up" | "down" | "flat";
  m15: "up" | "down" | "flat";
  h1: "up" | "down" | "flat";
  spark: number[];
};

const FALLBACK_LONGS: Signal[] = [
  { sym: "BTC",  dir: "LONG", reason: "BREAKOUT", tag: "MTF aligned · vol surge",   price: "$67,284.10", changePct: 1.92, conf: 91, entry: "67,210", sl: "66,420", tp: "69,180", rr: "2.4R", m5: "up", m15: "up", h1: "up",   spark: [10,11,11,13,12,14,15,14,17,18,20,22,24,26,28,30] },
  { sym: "SOL",  dir: "LONG", reason: "MOMENTUM", tag: "trend continuation",        price: "$172.65",    changePct: 2.27, conf: 87, entry: "171.80", sl: "168.10", tp: "181.40", rr: "2.6R", m5: "up", m15: "up", h1: "up",   spark: [9,10,10,11,12,13,14,13,15,17,18,19,20,22,23,24] },
  { sym: "ETH",  dir: "LONG", reason: "TREND",    tag: "higher highs · clean",       price: "$3,128.44",  changePct: 1.84, conf: 84, entry: "3,118",  sl: "3,070",  tp: "3,260",  rr: "2.0R", m5: "up", m15: "up", h1: "flat", spark: [6,7,7,8,9,8,10,11,12,11,13,14,15,16,17,18] },
  { sym: "INJ",  dir: "LONG", reason: "BREAKOUT", tag: "range expansion",            price: "$28.40",     changePct: 2.71, conf: 82, entry: "28.20",  sl: "27.40",  tp: "30.10",  rr: "2.3R", m5: "up", m15: "up", h1: "flat", spark: [9,10,10,11,12,11,12,13,14,15,16,17,18,19,20,21] },
  { sym: "AVAX", dir: "LONG", reason: "TREND",    tag: "demand zone hold",           price: "$39.27",     changePct: 1.89, conf: 80, entry: "39.10",  sl: "38.20",  tp: "41.40",  rr: "1.9R", m5: "up", m15: "flat","h1": "up", spark: [8,8,9,9,9,10,10,11,11,11,12,12,12,13,13,14] },
  { sym: "LINK", dir: "LONG", reason: "MOMENTUM", tag: "VWAP reclaim",               price: "$19.74",     changePct: 2.12, conf: 79, entry: "19.60",  sl: "19.10",  tp: "20.80",  rr: "2.1R", m5: "up", m15: "up", h1: "flat", spark: [11,11,12,11,12,12,12,12,13,13,13,14,14,14,15,15] },
  { sym: "TIA",  dir: "LONG", reason: "BREAKOUT", tag: "compression release",        price: "$7.82",      changePct: 2.76, conf: 77, entry: "7.78",   sl: "7.52",   tp: "8.40",   rr: "2.2R", m5: "up", m15: "flat","h1": "up", spark: [6,6,7,7,7,7,7,8,8,8,8,8,9,9,9,9] },
  { sym: "SUI",  dir: "LONG", reason: "TREND",    tag: "MA stack bullish",           price: "$2.16",      changePct: 2.37, conf: 76, entry: "2.15",   sl: "2.08",   tp: "2.31",   rr: "1.8R", m5: "up", m15: "up", h1: "flat", spark: [7,7,7,8,8,8,8,9,9,9,9,9,10,10,10,10] },
  { sym: "APT",  dir: "LONG", reason: "REVERSAL", tag: "bull div · RSI 38",          price: "$7.95",      changePct: 2.71, conf: 74, entry: "7.92",   sl: "7.66",   tp: "8.40",   rr: "1.7R", m5: "up", m15: "flat","h1": "flat", spark: [4,4,4,5,5,5,5,5,5,5,5,5,6,6,6,6] },
  { sym: "FET",  dir: "LONG", reason: "MOMENTUM", tag: "narrative bid",              price: "$1.348",     changePct: 3.85, conf: 73, entry: "1.342",  sl: "1.298",  tp: "1.440",  rr: "2.0R", m5: "up", m15: "up", h1: "flat", spark: [6,7,7,7,8,8,8,9,9,9,10,10,10,11,11,11] },
];

const FALLBACK_SHORTS: Signal[] = [
  { sym: "WIF",   dir: "SHORT", reason: "DISTRIBUTION", tag: "topping pattern · vol", price: "$2.0840",      changePct: -4.93, conf: 87, entry: "2.0880",   sl: "2.1620", tp: "1.9120", rr: "2.4R", m5: "down", m15: "down", h1: "down", spark: [22,22,21,21,20,21,20,19,20,19,18,19,17,17,16,15] },
  { sym: "PEPE",  dir: "SHORT", reason: "MOMENTUM",     tag: "lower lows · MA cross", price: "$0.00000814",  changePct: -5.57, conf: 85, entry: "0.0000082","sl": "0.0000085", tp: "0.0000074", rr: "2.5R", m5: "down", m15: "down", h1: "down", spark: [24,23,23,22,22,22,21,20,21,20,19,19,18,17,16,15] },
  { sym: "BONK",  dir: "SHORT", reason: "REVERSAL",     tag: "exhaustion top",        price: "$0.00001921",  changePct: -7.11, conf: 83, entry: "0.0000193","sl": "0.0000201","tp": "0.0000172", rr: "2.6R", m5: "down", m15: "down", h1: "flat", spark: [21,20,20,19,19,19,18,18,18,17,17,16,16,15,15,14] },
  { sym: "SHIB",  dir: "SHORT", reason: "TREND",        tag: "channel breakdown",     price: "$0.00001784",  changePct: -3.36, conf: 81, entry: "0.0000179","sl": "0.0000185","tp": "0.0000164", rr: "2.0R", m5: "down", m15: "flat","h1": "down", spark: [19,18,18,18,17,17,17,16,16,16,15,15,14,14,14,13] },
  { sym: "DOGE",  dir: "SHORT", reason: "MOMENTUM",     tag: "rejection at supply",   price: "$0.1842",      changePct: -3.14, conf: 79, entry: "0.1848",   sl: "0.1902","tp": "0.1722","rr": "2.1R", m5: "down","m15": "down","h1": "flat", spark: [20,19,19,18,18,18,17,17,17,16,16,15,15,14,14,13] },
  { sym: "FLOKI", dir: "SHORT", reason: "REVERSAL",     tag: "MACD bearish cross",    price: "$0.0001624",   changePct: -5.14, conf: 78, entry: "0.000163", sl: "0.000170","tp": "0.000148","rr": "2.3R","m5": "down","m15": "down","h1": "flat", spark: [20,19,19,18,18,18,17,17,16,16,15,15,14,14,13,13] },
  { sym: "ORDI",  dir: "SHORT", reason: "TREND",        tag: "bear flag",             price: "$34.18",       changePct: -4.04, conf: 76, entry: "34.30",   sl: "35.40","tp": "31.80","rr": "2.1R","m5": "down","m15": "down","h1": "down", spark: [17,17,16,16,16,15,15,15,14,14,14,13,13,12,12,11] },
  { sym: "NEAR",  dir: "SHORT", reason: "MOMENTUM",     tag: "supply rejection",      price: "$6.28",        changePct: -2.06, conf: 74, entry: "6.30",    sl: "6.48","tp": "5.92","rr": "1.9R","m5": "down","m15": "flat","h1": "down", spark: [18,17,17,17,16,16,16,15,15,15,14,14,14,13,13,12] },
  { sym: "OP",    dir: "SHORT", reason: "TREND",        tag: "MTF bearish",           price: "$1.2747",      changePct: -3.05, conf: 73, entry: "1.278",   sl: "1.318","tp": "1.198","rr": "2.0R","m5": "down","m15": "down","h1": "flat", spark: [16,16,15,15,15,14,14,14,13,13,13,12,12,11,11,10] },
  { sym: "XRP",   dir: "SHORT", reason: "REVERSAL",     tag: "double top",            price: "$0.5184",      changePct: -1.93, conf: 71, entry: "0.520",   sl: "0.534","tp": "0.488","rr": "1.7R","m5": "down","m15": "flat","h1": "flat", spark: [10,10,10,10,9,9,9,9,9,8,8,8,8,7,7,7] },
];

const TICKERS = [
  { sym: "BTC",  price: "67,284", chg: +1.92 },
  { sym: "ETH",  price: "3,128",  chg: +1.84 },
  { sym: "SOL",  price: "172.65", chg: +2.27 },
  { sym: "AVAX", price: "39.27",  chg: +1.89 },
];

const CONVICTION_CHIPS = [
  { sym: "BTC",  dir: "LONG"  as Dir, val: 91 },
  { sym: "WIF",  dir: "SHORT" as Dir, val: 87 },
  { sym: "SOL",  dir: "LONG"  as Dir, val: 84 },
];

type PositionRow = { sym: string; dir: Dir; entry: string; cur: string; pnl: number };
const FALLBACK_POSITIONS: PositionRow[] = [
  { sym: "BTC", dir: "LONG",  entry: "66,810", cur: "67,284", pnl: +1.42 },
  { sym: "SOL", dir: "LONG",  entry: "168.40", cur: "172.65", pnl: +2.51 },
  { sym: "WIF", dir: "SHORT", entry: "2.1820", cur: "2.0840", pnl: +4.49 },
];

/* ── price formatting helpers (adaptive precision for crypto majors+micro) ── */
function fmtPrice(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000)  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (abs >= 1)     return n.toFixed(abs >= 100 ? 2 : abs >= 10 ? 2 : 3);
  if (abs >= 0.01)  return n.toFixed(4);
  if (abs >= 0.0001) return n.toFixed(6);
  return n.toFixed(8);
}
function fmtPriceUsd(n: number): string {
  return `$${fmtPrice(n)}`;
}
function fmtPctSigned(n: number): string {
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(2)}%`;
}
function fmtMoneySigned(n: number): string {
  const s = n >= 0 ? "+$" : "-$";
  return `${s}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function relAge(ts: number, now: number): string {
  const sec = Math.max(0, Math.round((now - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

/** Convert MtfDot ("green"/"amber"/"red") → Signal mtf state. */
function mtfToState(dot: "green" | "amber" | "red"): "up" | "down" | "flat" {
  if (dot === "green") return "up";
  if (dot === "red")   return "down";
  return "flat";
}

/** Derive % change from the sparkline (last vs first). Returns 0 if not enough data. */
function sparkChangePct(spark: number[]): number {
  if (!spark || spark.length < 2) return 0;
  const a = spark[0];
  const b = spark[spark.length - 1];
  if (!a) return 0;
  return ((b - a) / a) * 100;
}

/** Adapt OpportunityVM → existing Signal card shape so the V6 cinematic
 *  card renderer stays untouched. For FLAT engine signals, `lean` is
 *  used to route into the correct column at the call site. */
function vmToSignal(vm: OpportunityVM): Signal {
  const isLong = vm.direction === "LONG" || (vm.direction === "FLAT" && vm.lean === "LONG");
  const dir: Dir = isLong ? "LONG" : "SHORT";
  // Market-direction change: sparkline already encodes true price slope
  // (down for SHORT setups), so we use it as-is. No polarity inversion.
  const changePct = sparkChangePct(vm.sparkline);
  const rrNum = (() => {
    const reward = Math.abs(vm.target - vm.entry);
    const risk   = Math.abs(vm.entry - vm.stop);
    if (!risk) return 0;
    return reward / risk;
  })();
  return {
    sym:       vm.symbol,
    dir,
    reason:    vm.regime,
    tag:       (vm.reason ?? "").slice(0, 64),
    price:     fmtPriceUsd(vm.entry),
    changePct,
    conf:      Math.round(vm.convictionScore),
    entry:     fmtPrice(vm.entry),
    sl:        fmtPrice(vm.stop),
    tp:        fmtPrice(vm.target),
    rr:        `${rrNum.toFixed(1)}R`,
    m5:        mtfToState(vm.mtf[0]),
    m15:       mtfToState(vm.mtf[1]),
    h1:        mtfToState(vm.mtf[2]),
    spark:     vm.sparkline?.length ? vm.sparkline : [10, 10, 10, 10, 10, 10],
  };
}

/* BALANCES + FEED constants removed in Priority 2: right-rail is now
 * wired to /api/user/exchanges/balances + engine.recentSignalLog. */

const EQUITY_SPARK = [82,83,84,85,84,86,87,88,90,91,92,94,95,97,99,101,103,104,106,107,108];
const PULSE_WAVE = [40,42,38,46,44,50,48,54,52,58,55,62,60,66,64,70,68,72,69,74,71,76,73,78,75,80,76,82,78,84,80,86];

type Meta = { thesis: string; age: string; traj: number[]; rising: boolean };
const META: Record<string, Meta> = {
  BTC:   { thesis: "EMA9>21 cross · vol 2.4x avg · MTF 5m/15m/1H aligned",        age: "3s ago",  traj: [72, 79, 86, 91], rising: true },
  SOL:   { thesis: "trend continuation · VWAP reclaim · liquidity sweep below",   age: "11s ago", traj: [70, 76, 82, 87], rising: true },
  ETH:   { thesis: "higher highs · 200MA stack · order block hold",               age: "24s ago", traj: [74, 78, 81, 84], rising: true },
  INJ:   { thesis: "range expansion · BB squeeze release · vol 1.9x",             age: "38s ago", traj: [68, 74, 78, 82], rising: true },
  AVAX:  { thesis: "demand zone hold · RSI 54 reset · 4H bullish",                age: "52s ago", traj: [72, 75, 78, 80], rising: true },
  LINK:  { thesis: "VWAP reclaim · CVD positive · 5m momentum thrust",            age: "1m ago",  traj: [70, 73, 76, 79], rising: true },
  TIA:   { thesis: "compression release · ATR pop · MTF 5m/15m bullish",          age: "1m ago",  traj: [69, 72, 75, 77], rising: true },
  SUI:   { thesis: "MA stack bullish · range high break · vol 1.6x",              age: "2m ago",  traj: [70, 72, 74, 76], rising: true },
  APT:   { thesis: "bullish div · RSI 38 reset · liquidity below swept",          age: "2m ago",  traj: [66, 70, 72, 74], rising: true },
  FET:   { thesis: "narrative bid · 5m breakout · vol 2.1x avg",                  age: "3m ago",  traj: [65, 68, 71, 73], rising: true },
  WIF:   { thesis: "topping pattern · vol divergence · MTF 5m/15m/1H bearish",    age: "8s ago",  traj: [70, 76, 82, 87], rising: true },
  PEPE:  { thesis: "lower lows · 21MA cross down · CVD negative",                 age: "16s ago", traj: [72, 77, 81, 85], rising: true },
  BONK:  { thesis: "exhaustion top · RSI bear div · liquidity sweep above",       age: "29s ago", traj: [70, 74, 79, 83], rising: true },
  SHIB:  { thesis: "channel breakdown · 5m supply rejection · vol 1.7x",          age: "44s ago", traj: [70, 74, 77, 81], rising: true },
  DOGE:  { thesis: "rejection at supply · MTF 5m/15m bearish · OBV down",         age: "1m ago",  traj: [68, 72, 75, 79], rising: true },
  FLOKI: { thesis: "MACD bear cross · 4H trend down · vol 1.5x",                  age: "1m ago",  traj: [69, 72, 75, 78], rising: true },
  ORDI:  { thesis: "bear flag · MTF aligned bearish · liquidity above swept",     age: "2m ago",  traj: [68, 71, 74, 76], rising: true },
  NEAR:  { thesis: "supply rejection · RSI bear div · 1H downtrend",              age: "2m ago",  traj: [66, 69, 71, 74], rising: true },
  OP:    { thesis: "MTF bearish · range low break · vol 1.4x avg",                age: "3m ago",  traj: [65, 68, 70, 73], rising: true },
  XRP:   { thesis: "double top · MACD divergence · 4H supply rejection",          age: "3m ago",  traj: [64, 66, 68, 71], rising: true },
};

function Sparkline({
  data, color, w, h, strokeW = 1.8,
}: { data: number[]; color: string; w: number; h: number; strokeW?: number }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(2)},${(h - ((v - min) / range) * h).toFixed(2)}`).join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  const gid = `spk-${color.replace("#", "")}-${Math.round(data[0] * 1000)}-${data.length}-${w}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block w-full" style={{ height: h }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"  stopColor={color} stopOpacity="0.55" />
          <stop offset="60%" stopColor={color} stopOpacity="0.10" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ConvictionRing({
  value, color, size = 64,
}: { value: number; color: string; size?: number }) {
  const stroke = 4;
  const r = (size - stroke - 2) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  const glow = value >= 85 ? 14 : value >= 75 ? 8 : 3;
  return (
    <div className="relative" style={{ width: size, height: size, filter: `drop-shadow(0 0 ${glow}px ${color}AA)` }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 grid place-items-center" style={{ color }}>
        <div className="text-[15px] font-bold tabular-nums leading-none" style={{ letterSpacing: "-0.04em" }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function MtfDot({ s, color }: { s: "up" | "down" | "flat"; color: string }) {
  const fill = s === "flat" ? "rgba(255,255,255,0.22)" : color;
  const glow = s === "flat" ? "none" : `0 0 6px ${color}`;
  return <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: fill, boxShadow: glow }} />;
}

function SignalCard({ s, top, ignite }: { s: Signal; top?: boolean; ignite?: boolean }) {
  const isLong = s.dir === "LONG";
  const color = isLong ? BRAND : RED;
  const colorSoft = isLong ? EMERALD : RED_SOFT;
  const cardBg = top
    ? (isLong
        ? `linear-gradient(180deg, rgba(102,255,102,0.07), rgba(102,255,102,0.02) 55%, rgba(0,0,0,0.55)), ${BG_0}`
        : `linear-gradient(180deg, rgba(255,59,59,0.07), rgba(255,59,59,0.02) 55%, rgba(0,0,0,0.55)), ${BG_0}`)
    : (isLong
        ? `radial-gradient(120% 80% at 50% 0%, rgba(102,255,102,0.025), rgba(0,0,0,0) 60%), linear-gradient(180deg, ${BG_2} 0%, ${BG_1} 55%, ${BG_0} 100%)`
        : `radial-gradient(120% 80% at 50% 0%, rgba(255,59,59,0.025), rgba(0,0,0,0) 60%), linear-gradient(180deg, ${BG_2} 0%, ${BG_1} 55%, ${BG_0} 100%)`);
  const borderCol = isLong ? "rgba(102,255,102,0.22)" : "rgba(255,59,59,0.26)";
  const topBorder = isLong ? "rgba(102,255,102,0.55)" : "rgba(255,59,59,0.55)";
  const meta = META[s.sym];
  return (
    <div
      className={`sigcard${top ? " sigcard-top" : ""}${ignite ? (isLong ? " sigcard-ignite-long" : " sigcard-ignite-short") : ""} relative flex min-w-0 flex-col overflow-hidden`}
      style={{
        background: cardBg,
        border: `1px solid ${top ? topBorder : borderCol}`,
        boxShadow: top
          ? `0 0 0 1px ${color}22, 0 0 28px ${color}3a inset, inset 0 1px 0 rgba(255,255,255,0.05), 0 6px 24px rgba(0,0,0,0.55)`
          : `inset 0 1px 0 rgba(255,255,255,0.045), inset 0 -40px 60px -30px rgba(0,0,0,0.65), 0 4px 18px rgba(0,0,0,0.45)`,
        animation: top
          ? (isLong ? "edgePulse 4.2s ease-in-out infinite" : "edgePulseRed 4.6s ease-in-out infinite")
          : undefined,
      }}
    >
      {/* CONVICTION RING IGNITION — one-shot when a brand-new top signal
       *  arrives. Brief expanding ring + soft glow that decays in ~1.2s,
       *  then card returns to its breathing edgePulse. Communicates
       *  "AI found something significant" without spamming motion. */}
      {ignite && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            border: `1px solid ${color}`,
            animation: isLong ? "signalIgnitionLong 1200ms ease-out 1 forwards" : "signalIgnitionShort 1200ms ease-out 1 forwards",
          }}
        />
      )}
      {/* ROW 1 — header */}
      <div className="flex min-w-0 items-center gap-2.5 px-3.5 pt-3.5">
        <div
          className="shrink-0 px-2 py-0.5 text-[10px] font-bold tracking-[0.16em]"
          style={{
            color,
            background: isLong ? "rgba(0,200,83,0.12)" : "rgba(255,59,59,0.10)",
            border: `1px solid ${color}66`,
            boxShadow: `0 0 8px ${color}55 inset`,
          }}
        >
          {s.dir}
        </div>
        <div className="shrink-0 text-[26px] font-bold leading-none text-white" style={{ letterSpacing: "-0.04em" }}>
          {s.sym}
        </div>
        <div className="shrink-0 text-[10px] font-semibold tracking-[0.14em]" style={{ color: TXT_65 }}>
          {s.reason}
        </div>
        <div className="min-w-0 flex-1 truncate text-[9.5px] tracking-[0.10em]" style={{ color: TXT_40 }}>
          · {s.tag}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {top && (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.18em]"
              style={{ color, border: `1px solid ${color}88`, background: `${color}14` }}
            >
              <Flame size={9} /> TOP SIGNAL
            </div>
          )}
          <div
            className="text-[8.5px] font-semibold tabular-nums tracking-[0.14em]"
            style={{ color: TXT_40, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          >
            {meta?.age ?? "live"}
          </div>
        </div>
      </div>

      {/* AI THESIS LINE */}
      <div
        className="truncate px-3.5 pt-1 text-[9.5px]"
        style={{
          color: TXT_65,
          letterSpacing: "0.12em",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {meta?.thesis ?? `${s.reason.toLowerCase()} · ${s.tag}`}
      </div>

      {/* ROW 2 — price + sparkline + ring */}
      <div className="flex min-w-0 items-center gap-3 px-3.5 pt-2">
        <div className="flex min-w-0 max-w-[140px] shrink flex-col">
          <div
            className="truncate text-[20px] font-bold tabular-nums text-white leading-none"
            style={{
              letterSpacing: "-0.03em",
              animation: top ? "priceTick 3.2s ease-in-out infinite" : undefined,
            }}
          >
            {s.price}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            {isLong ? <TrendingUp size={11} style={{ color }} /> : <TrendingDown size={11} style={{ color }} />}
            <div className="text-[12px] font-bold tabular-nums" style={{ color }}>
              {s.changePct > 0 ? "+" : ""}{s.changePct.toFixed(2)}%
            </div>
            <div className="text-[9px] tracking-[0.14em]" style={{ color: TXT_40 }}>5M</div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <Sparkline data={s.spark} color={color} w={260} h={52} strokeW={2} />
        </div>

        <div
          className="flex shrink-0 flex-col items-center gap-1"
          style={top ? ({ animation: "convictionBreath 3.6s ease-in-out infinite", "--ring-glow": `${color}aa` } as React.CSSProperties & Record<string, string>) : undefined}
        >
          <ConvictionRing value={s.conf} color={color} size={62} />
          <div className="text-[8.5px] font-semibold tracking-[0.16em]" style={{ color: colorSoft }}>
            CONVICTION
          </div>
        </div>
      </div>

      {/* TRAJECTORY MICRO-ROW */}
      <div className="flex items-center gap-2 px-3.5 pt-2">
        <span className="text-[8.5px] tracking-[0.18em]" style={{ color: TXT_40 }}>TRAJECTORY</span>
        <div className="flex items-center gap-1.5">
          {(meta?.traj ?? [s.conf - 9, s.conf - 6, s.conf - 3, s.conf]).map((v, i, arr) => {
            const last = i === arr.length - 1;
            const rising = arr[arr.length - 1] > arr[0];
            const filled = last || v >= arr[arr.length - 1] - 4;
            return (
              <span
                key={i}
                className="inline-block rounded-full"
                style={{
                  width: last ? 6 : 5,
                  height: last ? 6 : 5,
                  background: filled ? color : "rgba(255,255,255,0.12)",
                  boxShadow: last && rising ? `0 0 8px ${color}` : "none",
                  opacity: filled ? (last ? 1 : 0.7) : 1,
                }}
              />
            );
          })}
        </div>
        <span className="text-[8.5px] tabular-nums tracking-[0.14em]" style={{ color: colorSoft }}>
          {meta?.traj ? `${meta.traj[0]}→${meta.traj[meta.traj.length - 1]}` : ""}
        </span>
      </div>

      {/* ROW 3 — micro plan */}
      <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-2 px-3.5 pb-3.5 pt-2.5" style={{ borderTop: `1px solid ${borderCol}` }}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <div className="flex shrink-0 items-center gap-1 text-[9.5px] tracking-[0.10em]" style={{ color: TXT_40 }}>
            ENTRY <span className="font-semibold tabular-nums" style={{ color: TXT_85 }}>{s.entry}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-[9.5px] tracking-[0.10em]" style={{ color: TXT_40 }}>
            SL <span className="font-semibold tabular-nums" style={{ color: RED_SOFT }}>{s.sl}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-[9.5px] tracking-[0.10em]" style={{ color: TXT_40 }}>
            TP <span className="font-semibold tabular-nums" style={{ color: BRAND }}>{s.tp}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-[9.5px] tracking-[0.10em]" style={{ color: TXT_40 }}>
            RR <span className="font-semibold tabular-nums" style={{ color: TXT_85 }}>{s.rr}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[8.5px] tracking-[0.14em]" style={{ color: TXT_40 }}>5m</span>
            <MtfDot s={s.m5} color={color} />
            <span className="ml-1 text-[8.5px] tracking-[0.14em]" style={{ color: TXT_40 }}>15m</span>
            <MtfDot s={s.m15} color={color} />
            <span className="ml-1 text-[8.5px] tracking-[0.14em]" style={{ color: TXT_40 }}>1H</span>
            <MtfDot s={s.h1} color={color} />
          </div>
        </div>
        <div className="ml-auto flex shrink-0 flex-col items-end gap-0.5">
          {top && (
            <div
              className="text-[8.5px] font-bold tracking-[0.18em]"
              style={{ color }}
            >
              {isLong ? "HUNT INITIATED" : "EXECUTION ARMED"}
            </div>
          )}
          <button
            className="flex shrink-0 items-center gap-1.5 px-3 py-1 text-[11px] font-bold tracking-[0.18em]"
            style={{
              color: isLong ? BG_0 : "#fff",
              background: isLong ? color : "rgba(255,59,59,0.92)",
              border: `1px solid ${color}`,
              boxShadow: top ? `0 0 14px ${color}88` : `0 0 6px ${color}55`,
              transition: "all 180ms ease",
            }}
          >
            {isLong ? <Target size={11} strokeWidth={3} /> : <Crosshair size={11} strokeWidth={3} />}
            {isLong ? "BUY" : "SELL"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConvictionChip({ sym, dir, val }: { sym: string; dir: Dir; val: number }) {
  const color = dir === "LONG" ? BRAND : RED;
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5"
      style={{
        background: dir === "LONG" ? "rgba(102,255,102,0.06)" : "rgba(255,59,59,0.06)",
        border: `1px solid ${color}55`,
        boxShadow: `0 0 14px ${color}33`,
      }}
    >
      <span className="text-[13px] font-bold text-white" style={{ letterSpacing: "-0.03em" }}>{sym}</span>
      <span className="text-[9.5px] font-bold tracking-[0.16em]" style={{ color }}>{dir}</span>
      <span className="text-[14px] font-bold tabular-nums" style={{ color, letterSpacing: "-0.03em" }}>{val}</span>
    </div>
  );
}

function MiniStat({ label, value, color = "#fff" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2.5" style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
      <div className="text-[8.5px] font-semibold tracking-[0.18em]" style={{ color: TXT_40 }}>{label}</div>
      <div className="text-[15px] font-bold tabular-nums" style={{ color, letterSpacing: "-0.03em" }}>{value}</div>
    </div>
  );
}

/** Idle battlefield state — rendered inside a LONGS or SHORTS column
 *  when no signals are clearing gates. Communicates AI discipline
 *  rather than emptiness: pulsing orb + ring breath, funnel counters
 *  ("19 MARKETS · 0 PASSED GATES"), and a rotating gate-reason chip
 *  ("SIDEWAYS MARKET", "LOW VOLUME", etc.). Matte-black surface, no
 *  new typography or spacing — pulls existing animation tokens. */
function IdleBattlefieldState({
  side,
  marketsScanned,
  gatesPassed,
  currentReason,
}: {
  side: "long" | "short";
  marketsScanned: number;
  gatesPassed: number;
  currentReason: string;
}) {
  const color = side === "long" ? BRAND : RED;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      <div className="relative h-10 w-10">
        <div
          className="absolute inset-0 rounded-full"
          style={{ border: `1px solid ${color}55`, animation: "ringBreath 3.2s ease-in-out infinite" }}
        />
        <div
          className="absolute inset-0 rounded-full"
          style={{ border: `1px solid ${color}33`, animation: "ringBreathSlow 4.4s ease-in-out infinite" }}
        />
        <div
          className="absolute inset-[14px] rounded-full"
          style={{ background: color, opacity: 0.55, animation: "pulseOrb 2.4s ease-in-out infinite" }}
        />
      </div>

      <div className="text-[10.5px] font-bold tracking-[0.22em]" style={{ color: TXT_85 }}>
        AI SCANNING
      </div>

      <div className="text-[9.5px] tracking-[0.14em]" style={{ color: TXT_65 }}>
        <span className="tabular-nums font-bold text-white">{marketsScanned}</span> MARKETS
        <span className="mx-2" style={{ color: TXT_25 }}>·</span>
        <span className="tabular-nums font-bold" style={{ color: gatesPassed > 0 ? color : TXT_85 }}>{gatesPassed}</span> PASSED GATES
      </div>

      <div
        key={currentReason}
        className="flex items-center gap-1.5 px-2 py-1"
        style={{
          border: `1px solid ${HAIR_18}`,
          background: BG_2,
          animation: "feedFadeIn 320ms ease-out both",
        }}
      >
        <span
          className="h-1 w-1 rounded-full"
          style={{ background: "#FFC83D", boxShadow: `0 0 6px #FFC83D` }}
        />
        <span className="text-[9px] font-semibold tracking-[0.18em]" style={{ color: TXT_85 }}>
          {currentReason}
        </span>
      </div>

      <div className="text-[9px] tracking-[0.16em]" style={{ color: TXT_40 }}>
        AI WAITING FOR HIGH-CONVICTION SETUP
      </div>
    </div>
  );
}

function TerminalInner() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const clock = now.toISOString().split("T")[1].split(".")[0] + " UTC";

  /* ── live data wiring (Priority 1) ────────────────────────────────────────
   * Hooks are the canonical sources of truth used by PortalCustomerShell.
   * Fallback constants preserve the cinematic identity during bootstrap so
   * the matrix never blanks — once the first poll returns we cut over. */
  const { majors, alts, engine, isLoading: signalsLoading } = usePaperSignals();
  const { open: openPositions, stats } = usePaperTrades();
  const exec = useExecutionState();
  const { data: balancesData } = useExchangeBalances();
  const aiTrading = useAiTradingState();

  /* Bootstrap detector — true only before the first successful engine poll.
   * Once `engine` is non-null we cut over to live data and accept honest
   * empty states ("no qualifying LONGS yet" reads better than stale mock). */
  const isBootstrap = signalsLoading || engine === null;
  /* For positions, "no activity ever" (totalCount === 0) is the bootstrap
   * signal; after the user opens their first paper trade, an empty `open`
   * list is the truthful state and we render it honestly. */
  const positionsBootstrap = stats.totalCount === 0;

  /* Split signals into LONG / SHORT columns. `direction` is the engine's
   * decision; FLAT signals are routed via `lean` so the matrix shows
   * in-progress cognition rather than a dead column. */
  const liveSignals = useMemo(() => {
    const all: OpportunityVM[] = [...majors, ...alts].filter(o => o.executionEligible !== false || o.convictionScore >= 60);
    const longs = all
      .filter(o => o.direction === "LONG" || (o.direction === "FLAT" && o.lean === "LONG"))
      .sort((a, b) => b.convictionScore - a.convictionScore)
      .slice(0, 10)
      .map(vmToSignal);
    const shorts = all
      .filter(o => o.direction === "SHORT" || (o.direction === "FLAT" && o.lean === "SHORT"))
      .sort((a, b) => b.convictionScore - a.convictionScore)
      .slice(0, 10)
      .map(vmToSignal);
    return { longs, shorts };
  }, [majors, alts]);

  /* HYDRATION REALISM — do NOT render FALLBACK_LONGS/SHORTS during
   * bootstrap. Rendering the demo set as real cards and then collapsing
   * to the live filtered set (~1-2 signals) feels like the AI is hiding
   * data, flickering, or filtering after the fact. Instead, render []
   * during bootstrap so the existing IdleBattlefieldState (AI SCANNING)
   * covers the hydration window. The arrival sweep + top-card ignition
   * then fire naturally on the first real signal landing — reads as
   * "the AI just found something significant", not as a UI collapse.
   * Scarcity stays intact; the battlefield never exposes raw unfiltered
   * data. (FALLBACK_LONGS/SHORTS constants retained — useful for
   * mockups / Storybook previews; just not for live render.) */
  const longs  = isBootstrap ? [] : liveSignals.longs;
  const shorts = isBootstrap ? [] : liveSignals.shorts;

  /* ── Signal arrival ignition (one-shot emotional impact) ─────────────────
   * Scarcity is now the platform's strength — when a signal *does* clear
   * every gate, the surface needs to register it. Track count-up and
   * top-symbol transitions; bump a counter that re-keys the column
   * battlefield sweep + sets a timestamp the top card uses to ignite.
   * Bootstrap is excluded so the fallback set doesn't pre-fire on load. */
  const prevLongCountRef  = useRef(longs.length);
  const prevShortCountRef = useRef(shorts.length);
  const prevTopLongRef    = useRef<string | null>(longs[0]?.sym ?? null);
  const prevTopShortRef   = useRef<string | null>(shorts[0]?.sym ?? null);
  const [longArrivalSeq,  setLongArrivalSeq]  = useState(0);
  const [shortArrivalSeq, setShortArrivalSeq] = useState(0);
  const [longIgniteAt,    setLongIgniteAt]    = useState(0);
  const [shortIgniteAt,   setShortIgniteAt]   = useState(0);
  useEffect(() => {
    if (isBootstrap) return;
    const topSym = longs[0]?.sym ?? null;
    if (longs.length > prevLongCountRef.current || (topSym && topSym !== prevTopLongRef.current)) {
      setLongArrivalSeq(k => k + 1);
      setLongIgniteAt(Date.now());
    }
    prevLongCountRef.current = longs.length;
    prevTopLongRef.current   = topSym;
  }, [longs, isBootstrap]);
  useEffect(() => {
    if (isBootstrap) return;
    const topSym = shorts[0]?.sym ?? null;
    if (shorts.length > prevShortCountRef.current || (topSym && topSym !== prevTopShortRef.current)) {
      setShortArrivalSeq(k => k + 1);
      setShortIgniteAt(Date.now());
    }
    prevShortCountRef.current = shorts.length;
    prevTopShortRef.current   = topSym;
  }, [shorts, isBootstrap]);
  const igniteLongTop  = longIgniteAt  > 0 && (now.getTime() - longIgniteAt)  < 1200;
  const igniteShortTop = shortIgniteAt > 0 && (now.getTime() - shortIgniteAt) < 1200;

  /* Live positions adapter — paper-trading store → row shape used by the
   * LIVE POSITIONS table. Fallback only while the user has zero lifetime
   * activity; once they have any history, an empty open list reads as the
   * honest "no open positions right now" state. */
  const positions: PositionRow[] = useMemo(() => {
    if (positionsBootstrap && !openPositions.length) return FALLBACK_POSITIONS;
    return openPositions.slice(0, 6).map(p => ({
      sym:   p.symbol.replace(/(USDT|USDC|USD)$/i, ""),
      dir:   p.side,
      entry: fmtPrice(p.entry),
      cur:   fmtPrice(p.last),
      pnl:   p.pnlPct,
    }));
  }, [openPositions]);

  /* ── Priority 2: right-rail live wiring ───────────────────────────────────
   * BALANCES → first ok connection from /api/user/exchanges/balances, top
   * non-zero assets. If none, render the honest "no broker linked" state
   * (NOT mock data) — the right rail tells the truth.
   * AI ACTIVITY FEED → engine.recentSignalLog (unified AI decisions +
   * promotions/demotions + risk-gate blocks + executions). */
  const liveConn = useMemo<BalanceConnection | null>(() => {
    const conns = balancesData?.connections ?? [];
    return conns.find(c => c.ok) ?? conns[0] ?? null;
  }, [balancesData]);
  const balanceRows = useMemo(() => {
    if (!liveConn?.ok) return [];
    return Object.entries(liveConn.balances)
      .filter(([, b]) => b.total > 0)
      .map(([asset, b]) => ({ asset, qty: b.total }))
      .sort((a, b) => {
        // crude USD-ish ordering: fiat first by qty desc, then crypto by qty desc
        const aFiat = /^(USD|USDT|USDC)$/i.test(a.asset);
        const bFiat = /^(USD|USDT|USDC)$/i.test(b.asset);
        if (aFiat !== bFiat) return aFiat ? -1 : 1;
        return b.qty - a.qty;
      })
      .slice(0, 5);
  }, [liveConn]);
  const balanceFlashKey = liveConn?.lastUpdated ?? 0;

  const feedRows = useMemo(() => {
    const log: SignalLogEntry[] = engine?.recentSignalLog ?? [];
    return log.slice(0, 9).map((e) => {
      const dec = e.decision.toUpperCase();
      const isLong    = dec.includes("BUY")  || dec.includes("LONG");
      const isShort   = dec.includes("SELL") || dec.includes("SHORT");
      const isExec    = !!e.executedAs;
      const isBlocked = !!e.blockReason;
      const dot =
        isBlocked ? "#FFC83D" :
        isExec    ? EMERALD   :
        isLong    ? BRAND     :
        isShort   ? RED       : "#888";
      const verb =
        isBlocked ? "BLOCKED"  :
        isExec    ? "EXECUTED" :
        isLong    ? "LONG"     :
        isShort   ? "SHORT"    : dec;
      /* Push the AI thought stream further: prefer the prettified
       * blockReason on blocked entries so users see *why* the AI held
       * back ("weak volume confirmation", "conflicting MTF", etc.)
       * rather than a generic block. */
      const rawDetail = isBlocked
        ? (prettyBlockReason(e.blockReason) || e.shortSummary || "")
        : (e.shortSummary || prettyBlockReason(e.blockReason) || "");
      const detail = rawDetail.slice(0, 64);
      const sym = e.symbol.replace(/(USDT|USDC|USD)$/i, "");
      return {
        id:    e.id,
        t:     fmtHHMMSS(e.timestamp),
        msg:   detail ? `AI ${verb} ${sym} · ${detail}` : `AI ${verb} ${sym}`,
        dot,
        fresh: Date.now() - e.timestamp < 30_000,
        ts:    e.timestamp,
      };
    });
  }, [engine?.recentSignalLog]);

  /* Idle battlefield intelligence — when no signals clear gates, columns
   * must NOT look dead. Surface AI discipline instead: rotating gate
   * reasons (1 every 3s, derived from `now` tick) + funnel counters
   * pulled from engine telemetry. Reads as "the AI is being selective",
   * not "the platform is broken". */
  const idleReasons = useMemo(() => [
    "LOW VOLUME",
    "SIDEWAYS MARKET",
    "LOW CONFIDENCE",
    "TREND MISALIGNMENT",
    "RISK FILTER ACTIVE",
  ], []);
  const idleReasonIdx = Math.floor(now.getTime() / 3000) % idleReasons.length;
  const currentIdleReason = idleReasons[idleReasonIdx];
  /* Honest "right now" metrics — engine.funnel counters are cumulative
   * across the engine's lifetime (would show 5000+ / 400+), which reads
   * as noise. Use the *current* monitored symbol set + the *current*
   * passing-signal count across both columns. */
  const marketsScanned = (engine?.symbolBreakdowns
    ? Object.keys(engine.symbolBreakdowns).length
    : 0) || 19;
  const gatesPassed = longs.length + shorts.length;

  /* AI autotrade — derive max-trade capacity from plan tier. Free=0 disables
   * the toggle path (server gate returns 402 anyway). */
  const aiMaxTrades = aiTrading.isAdmin ? 99 : aiTrading.plan === "pro" ? 12 : aiTrading.plan === "starter" ? 3 : 0;
  const [aiBusy, setAiBusy] = useState(false);
  const [aiUpgradeFlash, setAiUpgradeFlash] = useState(false);
  /* aiArming = staged activation; true only while transitioning OFF→ON.
   * Drives the arming sweep + "ARMING…" copy. Disarming is instant.
   * Timeout IDs tracked in refs + cleared on unmount to avoid stale
   * setState after the user navigates away mid-arm. */
  const [aiArming, setAiArming] = useState(false);
  const aiArmingTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiUpgradeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (aiArmingTimerRef.current)  clearTimeout(aiArmingTimerRef.current);
    if (aiUpgradeTimerRef.current) clearTimeout(aiUpgradeTimerRef.current);
  }, []);
  const toggleAi = async () => {
    if (aiBusy) return;
    const isArming = !aiTrading.enabled;
    setAiBusy(true);
    if (isArming) setAiArming(true);
    const result = await aiTrading.setEnabled(!aiTrading.enabled);
    if (result.needsUpgrade) {
      setAiUpgradeFlash(true);
      if (aiUpgradeTimerRef.current) clearTimeout(aiUpgradeTimerRef.current);
      aiUpgradeTimerRef.current = setTimeout(() => setAiUpgradeFlash(false), 2400);
    }
    setAiBusy(false);
    if (isArming) {
      /* Hold the arming sweep ~700ms past response so users feel the
       * staged activation, not a network blip. */
      if (aiArmingTimerRef.current) clearTimeout(aiArmingTimerRef.current);
      aiArmingTimerRef.current = setTimeout(() => setAiArming(false), 700);
    }
  };

  /* Account telemetry — wired from the paper-trade store. */
  const equityTotal = stats.equity ?? STARTING_EQUITY;
  const equityInt   = Math.floor(equityTotal);
  const equityCents = Math.round((equityTotal - equityInt) * 100).toString().padStart(2, "0");
  const equityIntStr = equityInt.toLocaleString("en-US");
  const realizedPct  = ((stats.realizedPnl / STARTING_EQUITY) * 100);
  const realizedPctLabel = `${realizedPct >= 0 ? "+" : ""}${realizedPct.toFixed(2)}% MTD`;
  const isProfitToday = stats.todayPnl >= 0;
  const isProfitReal  = stats.realizedPnl >= 0;
  const isProfitUnreal = stats.unrealizedPnl >= 0;

  /* Engine status — drives the AI ENGINE · HUNTING pill and the
   * footer "AI · HUNTING N MARKETS" string. */
  const tickersCount = engine?.symbolBreakdowns ? Object.keys(engine.symbolBreakdowns).length : 0;
  const engineRunning = exec.data?.engine.running ?? true;
  const cryptoState   = exec.data?.crypto.state ?? "armed";
  const huntingLabel = !engineRunning
    ? "AI ENGINE · OFFLINE"
    : cryptoState === "halted"
      ? "AI ENGINE · HALTED"
      : cryptoState === "executing"
        ? "AI ENGINE · EXECUTING"
        : "AI ENGINE · HUNTING";
  const huntingFooterLabel = !engineRunning
    ? "AI · OFFLINE"
    : `AI · HUNTING ${tickersCount || 30} MARKETS`;
  const lastSignalAt = exec.data?.crypto.lastSignalAt ?? null;
  const lastSurgeLabel = lastSignalAt ? relAge(lastSignalAt, now.getTime()) : "—";

  return (
    <div
      className="relative h-screen w-full overflow-hidden flex flex-col"
      style={{
        background: BG_0,
        color: "white",
        fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif",
        fontFeatureSettings: '"tnum"',
      }}
    >
      {/* keyframes */}
      <style>{`
        @keyframes pulseOrb {
          0%,100% { transform: scale(1); opacity: 0.85; box-shadow: 0 0 14px ${BRAND}, 0 0 28px ${BRAND}66; }
          50%     { transform: scale(1.22); opacity: 1;  box-shadow: 0 0 22px ${BRAND}, 0 0 44px ${BRAND}88; }
        }
        @keyframes ringBreath {
          0%,100% { transform: scale(1);   opacity: 0.55; }
          50%     { transform: scale(1.7); opacity: 0;   }
        }
        @keyframes ringBreathSlow {
          0%,100% { transform: scale(1);   opacity: 0.35; }
          50%     { transform: scale(2.2); opacity: 0;   }
        }
        @keyframes edgePulse {
          0%,100% { box-shadow: 0 0 0 1px ${BRAND}22, 0 0 18px ${BRAND}22 inset; }
          50%     { box-shadow: 0 0 0 1px ${BRAND}55, 0 0 36px ${BRAND}44 inset; }
        }
        @keyframes edgePulseRed {
          0%,100% { box-shadow: 0 0 0 1px ${RED}22, 0 0 18px ${RED}22 inset; }
          50%     { box-shadow: 0 0 0 1px ${RED}55, 0 0 36px ${RED}44 inset; }
        }
        @keyframes wavePan {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes feedDot {
          0%,100% { opacity: .55; }
          50%     { opacity: 1; }
        }
        @keyframes heroSweep {
          0%   { transform: translateX(-30%); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateX(130%); opacity: 0; }
        }
        @keyframes scanBar {
          0%   { transform: translateX(-10%); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateX(110%); opacity: 0; }
        }
        @keyframes sparkRise {
          0%   { transform: translateY(0);     opacity: 0; }
          15%  { opacity: 0.5; }
          85%  { opacity: 0.5; }
          100% { transform: translateY(-140px); opacity: 0; }
        }
        @keyframes equityShimmer {
          0%,100% { text-shadow: 0 0 6px rgba(102,255,102,0.10); }
          50%     { text-shadow: 0 0 14px rgba(102,255,102,0.40); }
        }
        @keyframes livePulse {
          0%,100% { transform: scale(1);   opacity: 0.65; }
          50%     { transform: scale(1.35); opacity: 1;   }
        }
        @keyframes priceTick {
          0%,100% { text-shadow: 0 0 0 transparent; }
          50%     { text-shadow: 0 0 10px rgba(255,255,255,0.22); }
        }
        @keyframes convictionBreath {
          0%,100% { filter: drop-shadow(0 0 6px var(--ring-glow, rgba(102,255,102,0.55))); }
          50%     { filter: drop-shadow(0 0 14px var(--ring-glow, rgba(102,255,102,0.85))); }
        }
        /* P2: subtle live-data motion */
        @keyframes balanceFlash {
          0%   { background: rgba(102,255,102,0.10); }
          100% { background: transparent; }
        }
        @keyframes feedFadeIn {
          0%   { opacity: 0; transform: translateY(-2px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        /* P2/P3: institutional stream scrollbars + soft top/bottom fade.
         * Mask gives the impression that signals are flowing through a
         * fixed viewport rather than ending in a hard edge. */
        .stream-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(102,255,102,0.18) transparent;
          -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%);
                  mask-image: linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%);
          scroll-behavior: smooth;
        }
        .stream-scroll::-webkit-scrollbar { width: 6px; }
        .stream-scroll::-webkit-scrollbar-track { background: transparent; }
        .stream-scroll::-webkit-scrollbar-thumb {
          background: rgba(102,255,102,0.18);
          border-radius: 3px;
        }
        .stream-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(102,255,102,0.32);
        }
        @keyframes aiActivePulse {
          0%,100% { box-shadow: 0 0 0 1px rgba(102,255,102,0.55), 0 0 18px rgba(102,255,102,0.18) inset; }
          50%     { box-shadow: 0 0 0 1px rgba(102,255,102,0.85), 0 0 32px rgba(102,255,102,0.32) inset; }
        }

        /* SIGNAL IGNITION — one-shot expanding conviction ring when a
         * fresh top signal clears every gate. ~1.2s and done. */
        @keyframes signalIgnitionLong {
          0%   { opacity: 0;    transform: scale(0.985); box-shadow: 0 0 0 0 rgba(102,255,102,0.55), 0 0 0 0 rgba(102,255,102,0.85) inset; }
          25%  { opacity: 1;    transform: scale(1.012); box-shadow: 0 0 0 2px rgba(102,255,102,0.55), 0 0 48px 0 rgba(102,255,102,0.55) inset; }
          100% { opacity: 0;    transform: scale(1.045); box-shadow: 0 0 0 6px rgba(102,255,102,0.00), 0 0 0 0 rgba(102,255,102,0.00) inset; }
        }
        @keyframes signalIgnitionShort {
          0%   { opacity: 0;    transform: scale(0.985); box-shadow: 0 0 0 0 rgba(255,59,59,0.55), 0 0 0 0 rgba(255,59,59,0.85) inset; }
          25%  { opacity: 1;    transform: scale(1.012); box-shadow: 0 0 0 2px rgba(255,59,59,0.55), 0 0 48px 0 rgba(255,59,59,0.55) inset; }
          100% { opacity: 0;    transform: scale(1.045); box-shadow: 0 0 0 6px rgba(255,59,59,0.00), 0 0 0 0 rgba(255,59,59,0.00) inset; }
        }

        /* COLUMN ARRIVAL SWEEP — soft battlefield wash when a fresh
         * signal arrives in the column. Rises bottom→top, fades. */
        @keyframes columnArrivalSweepLong {
          0%   { opacity: 0;    transform: translateY(10%); }
          25%  { opacity: 1;    transform: translateY(0); }
          100% { opacity: 0;    transform: translateY(-6%); }
        }
        @keyframes columnArrivalSweepShort {
          0%   { opacity: 0;    transform: translateY(10%); }
          25%  { opacity: 1;    transform: translateY(0); }
          100% { opacity: 0;    transform: translateY(-6%); }
        }

        /* AI ARMING — staged activation sweep across the AUTOTRADE
         * control while the toggle request is in flight. Reads as
         * weapons-system arming, not a generic spinner. */
        @keyframes aiArmingSweep {
          0%   { transform: translateX(-110%); }
          100% { transform: translateX(110%); }
        }
        @keyframes aiArmedWarning {
          0%,100% { opacity: 0.45; }
          50%     { opacity: 0.95; }
        }

        /* card hover micro-state — subtle lift, brighter material edge */
        .sigcard { transition: transform 220ms cubic-bezier(.2,.7,.2,1), border-color 220ms ease, box-shadow 220ms ease; }
        .sigcard:hover { transform: translateY(-1px) scale(1.003); }
        .sigcard-top { transform: scale(1.005); }
        .sigcard-top:hover { transform: translateY(-1px) scale(1.008); }

        /* honor user motion preference — kill atmospheric loops */
        @media (prefers-reduced-motion: reduce) {
          .sigcard, .sigcard:hover { transition: none; transform: none; }
          [style*="animation"] { animation: none !important; }
        }
      `}</style>

      {/* RADIAL VIGNETTES — deepened */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `
            radial-gradient(820px 540px at 0% 0%, rgba(102,255,102,0.09), transparent 62%),
            radial-gradient(920px 580px at 100% 100%, rgba(102,255,102,0.075), transparent 62%),
            radial-gradient(1500px 760px at 50% -12%, rgba(102,255,102,0.06), transparent 72%),
            radial-gradient(900px 600px at 50% 110%, rgba(0,0,0,0.55), transparent 70%)
          `,
        }}
      />
      {/* SCANLINES — slightly more present on gutters */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(124,255,0,0.055) 0px, rgba(124,255,0,0.055) 1px, transparent 1px, transparent 3px)",
          mixBlendMode: "overlay",
          opacity: 0.85,
        }}
      />

      <div className="relative z-10 flex flex-1 min-h-0 flex-col">
        {/* TOP BAR */}
        <div
          className="flex h-[56px] items-center gap-5 px-5"
          style={{ background: BG_1, borderBottom: `1px solid ${HAIR_10}` }}
        >
          <div className="flex items-center gap-2.5">
            <div className="grid h-7 w-7 place-items-center" style={{ background: BRAND, color: BG_0, boxShadow: `0 0 14px ${BRAND}88` }}>
              <Zap size={15} strokeWidth={3} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-white text-[15px] font-bold" style={{ letterSpacing: "-0.03em" }}>AICandlez</span>
              <span className="text-[8.5px] font-semibold tracking-[0.22em]" style={{ color: TXT_40 }}>PERSONAL · TERMINAL</span>
            </div>
            <div
              className="ml-2 px-2 py-1 text-[9px] font-bold tracking-[0.20em]"
              style={{ color: BRAND, border: `1px solid ${BRAND}66`, background: "rgba(102,255,102,0.06)" }}
            >
              PAPER TRADING
            </div>
          </div>

          {/* center tickers */}
          <div className="mx-auto flex items-center gap-5">
            {TICKERS.map((t) => {
              const up = t.chg >= 0;
              return (
                <div key={t.sym} className="flex items-center gap-2">
                  <span className="text-[11px] font-bold tracking-[0.10em] text-white">{t.sym}</span>
                  <span className="text-[12px] font-semibold tabular-nums text-white">{t.price}</span>
                  <span
                    className="px-1.5 py-[1px] text-[9.5px] font-bold tabular-nums"
                    style={{
                      color: up ? BRAND : RED,
                      border: `1px solid ${(up ? BRAND : RED)}55`,
                      background: up ? "rgba(102,255,102,0.06)" : "rgba(255,59,59,0.06)",
                    }}
                  >
                    {up ? "+" : ""}{t.chg.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4">
            <Bell size={14} style={{ color: TXT_65 }} />
            <div className="text-[10.5px] tabular-nums tracking-[0.10em]" style={{ color: TXT_65 }}>{clock}</div>
            <div
              className="grid h-7 w-7 place-items-center text-[10px] font-bold"
              style={{ background: BG_3, color: BRAND, border: `1px solid ${HAIR_18}` }}
            >
              JM
            </div>
          </div>
        </div>

        {/* HERO BAND */}
        <div
          className="relative grid items-stretch overflow-hidden"
          style={{ gridTemplateColumns: "3fr 2fr", height: 140, background: BG_1, borderBottom: `1px solid ${HAIR_10}` }}
        >
          {/* HERO LIGHT SWEEP — single slow drift */}
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{ gridColumn: "1 / -1" }}
          >
            <div
              className="absolute top-0 h-full"
              style={{
                width: "30%",
                left: 0,
                background: "linear-gradient(90deg, transparent, rgba(102,255,102,0.06), transparent)",
                animation: "heroSweep 18s linear infinite",
              }}
            />
          </div>
          {/* CONVICTION SPARK RAIN — extremely subtle */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ gridColumn: "1 / -1" }}>
            {[12, 26, 41, 58, 73, 88].map((leftPct, i) => (
              <span
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${leftPct}%`,
                  bottom: 0,
                  width: 2,
                  height: 2,
                  background: BRAND,
                  boxShadow: `0 0 4px ${BRAND}`,
                  animation: `sparkRise ${9 + i}s linear ${i * 1.4}s infinite`,
                }}
              />
            ))}
          </div>

          {/* AI HUNTING */}
          <div className="relative flex flex-col justify-center gap-2.5 px-6" style={{ borderRight: `1px solid ${HAIR_10}` }}>
            <div className="flex items-center gap-3">
              <span className="relative inline-block h-3 w-3">
                <span
                  className="absolute inset-0 rounded-full"
                  style={{ background: BRAND, animation: "pulseOrb 2.4s ease-in-out infinite" }}
                />
                <span
                  className="absolute inset-0 rounded-full"
                  style={{ border: `1px solid ${BRAND}`, animation: "ringBreath 2.4s ease-out infinite" }}
                />
                <span
                  className="absolute inset-0 rounded-full"
                  style={{ border: `1px solid ${BRAND}`, animation: "ringBreathSlow 4.8s ease-out infinite" }}
                />
              </span>
              <div className="text-[10px] font-bold tracking-[0.30em]" style={{ color: BRAND }}>{huntingLabel}</div>
              <div className="flex items-center gap-1 text-[9.5px] tracking-[0.16em]" style={{ color: TXT_40 }}>
                <Bot size={11} /> autonomous
              </div>
            </div>
            <div className="text-[30px] font-bold leading-[1.02] text-white" style={{ letterSpacing: "-0.05em" }}>
              Scanning <span style={{ color: BRAND }}>{tickersCount || 30} markets</span> · last surge{" "}
              <span style={{ color: BRAND }}>{longs[0]?.sym ?? "—"} {longs[0]?.conf ?? 0}</span>
              <span className="ml-2 text-[14px] font-semibold" style={{ color: TXT_40, letterSpacing: 0 }}>· {lastSurgeLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              {CONVICTION_CHIPS.map((c) => (
                <ConvictionChip key={c.sym} {...c} />
              ))}
              <div className="ml-2 flex items-center gap-1 text-[9.5px] tracking-[0.16em]" style={{ color: TXT_40 }}>
                <Activity size={10} /> live conviction stream
              </div>
            </div>
          </div>

          {/* MARKET PULSE */}
          <div className="relative flex flex-col justify-center gap-2 px-6">
            <div className="flex items-center gap-2">
              <Radio size={11} style={{ color: BRAND }} />
              <div className="text-[10px] font-bold tracking-[0.30em]" style={{ color: TXT_65 }}>MARKET PULSE</div>
            </div>
            <div className="flex items-end gap-3">
              <div className="text-[32px] font-bold leading-none" style={{ color: BRAND, letterSpacing: "-0.05em", textShadow: `0 0 18px ${BRAND}66` }}>
                BULL
              </div>
              <div className="text-[28px] font-bold leading-none text-white tabular-nums" style={{ letterSpacing: "-0.04em" }}>
                · 73
              </div>
              <div className="pb-1 text-[10px] font-semibold tracking-[0.20em]" style={{ color: TXT_65 }}>CONVICTION</div>
            </div>
            <div className="relative h-[42px] w-full overflow-hidden">
              <div className="absolute inset-0 flex" style={{ animation: "wavePan 12s linear infinite", width: "200%" }}>
                <Sparkline data={PULSE_WAVE} color={BRAND} w={600} h={42} strokeW={1.8} />
                <Sparkline data={PULSE_WAVE} color={BRAND} w={600} h={42} strokeW={1.8} />
              </div>
              {/* SCAN BAR — sweeps across waveform every ~3s */}
              <div
                className="pointer-events-none absolute top-1/2 h-px"
                style={{
                  left: 0,
                  width: "12%",
                  background: `linear-gradient(90deg, transparent, ${BRAND}4D, transparent)`,
                  animation: "scanBar 3s linear infinite",
                }}
              />
            </div>
          </div>
        </div>

        {/* MAIN — battlefield + right rail
         * VIEWPORT-LOCKED: outer container is `h-screen flex-col`, this
         * grid takes `flex-1 min-h-0` so battlefield + rail fit exactly
         * in the remaining vertical space. Inner streams scroll, page
         * doesn't. Institutional terminal feel. */}
        <div
          className="grid gap-4 px-4 pb-4 flex-1 min-h-0 overflow-hidden"
          style={{ gridTemplateColumns: "1fr 340px", paddingTop: 20 }}
        >
          {/* BATTLEFIELD — matte-black wrapper */}
          <div
            className="flex min-w-0 min-h-0 flex-col gap-4 p-3.5 overflow-hidden"
            style={{ background: BG_0, border: `1px solid ${HAIR_10}` }}
          >
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[26px] font-bold text-white" style={{ letterSpacing: "-0.04em" }}>
                  LIVE OPPORTUNITY <span style={{ color: BRAND, textShadow: `0 0 14px ${BRAND}55` }}>BATTLEFIELD</span>
                </div>
                <div className="mt-1 text-[10.5px] tracking-[0.18em]" style={{ color: TXT_40 }}>
                  30 MARKETS · AI-RANKED BY CONVICTION · LIVE EXECUTION ARMED
                </div>
              </div>
              <div className="flex items-center gap-2 text-[9.5px] tracking-[0.18em]" style={{ color: TXT_40 }}>
                <Shield size={11} style={{ color: BRAND }} />
                RISK GATES <span className="font-bold text-white">ACTIVE</span>
                <span className="mx-2" style={{ color: TXT_25 }}>|</span>
                EXEC <span className="font-bold" style={{ color: BRAND }}>ARMED</span>
              </div>
            </div>

            <div className="grid gap-3.5 flex-1 min-h-0 overflow-hidden" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
              {/* LONGS column — header pinned, signal list independently scrolls */}
              <div className="relative flex min-w-0 min-h-0 flex-col gap-3 overflow-hidden">
                {/* COLUMN ARRIVAL SWEEP — one-shot green wash up the column
                 *  when a fresh LONG signal clears every gate. Keyed by
                 *  longArrivalSeq so it re-fires each arrival. Decays in
                 *  ~1s; no infinite loop, no noise. */}
                {longArrivalSeq > 0 && (
                  <div
                    key={`long-sweep-${longArrivalSeq}`}
                    className="pointer-events-none absolute inset-0 z-10"
                    style={{
                      background: `linear-gradient(0deg, rgba(102,255,102,0.16), rgba(102,255,102,0.02) 55%, transparent 100%)`,
                      animation: "columnArrivalSweepLong 1100ms ease-out 1 forwards",
                      mixBlendMode: "screen",
                    }}
                  />
                )}
                <div
                  className="flex items-center gap-2.5 px-3 py-2 flex-shrink-0"
                  style={{ background: "rgba(0,200,83,0.05)", border: `1px solid ${HAIR_18}` }}
                >
                  <div
                    className="grid h-7 min-w-[28px] place-items-center px-1 text-[12px] font-bold"
                    style={{ background: BRAND, color: BG_0, boxShadow: `0 0 12px ${BRAND}88` }}
                  >
                    {longs.length}
                  </div>
                  <div className="text-[13px] font-bold tracking-[0.18em]" style={{ color: BRAND }}>LONGS · ACTIVE</div>
                  <div className="ml-auto flex items-center gap-1.5 text-[9.5px] tracking-[0.16em]" style={{ color: TXT_65 }}>
                    <TrendingUp size={11} style={{ color: BRAND }} />
                    AI BIAS: <span className="font-bold" style={{ color: BRAND }}>BULLISH</span>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto stream-scroll flex flex-col gap-3 pr-1 py-2">
                  {longs.length === 0 ? (
                    <IdleBattlefieldState
                      side="long"
                      marketsScanned={marketsScanned}
                      gatesPassed={gatesPassed}
                      currentReason={currentIdleReason}
                    />
                  ) : longs.map((s, i) => (
                    <SignalCard key={s.sym} s={s} top={i === 0} ignite={i === 0 && igniteLongTop} />
                  ))}
                </div>
              </div>

              {/* SHORTS column — header pinned, signal list independently scrolls */}
              <div className="relative flex min-w-0 min-h-0 flex-col gap-3 overflow-hidden">
                {shortArrivalSeq > 0 && (
                  <div
                    key={`short-sweep-${shortArrivalSeq}`}
                    className="pointer-events-none absolute inset-0 z-10"
                    style={{
                      background: `linear-gradient(0deg, rgba(255,59,59,0.16), rgba(255,59,59,0.02) 55%, transparent 100%)`,
                      animation: "columnArrivalSweepShort 1100ms ease-out 1 forwards",
                      mixBlendMode: "screen",
                    }}
                  />
                )}
                <div
                  className="flex items-center gap-2.5 px-3 py-2 flex-shrink-0"
                  style={{ background: "rgba(255,59,59,0.05)", border: `1px solid ${HAIR_RED_18}` }}
                >
                  <div
                    className="grid h-7 min-w-[28px] place-items-center px-1 text-[12px] font-bold"
                    style={{ background: RED, color: "#fff", boxShadow: `0 0 12px ${RED}88` }}
                  >
                    {shorts.length}
                  </div>
                  <div className="text-[13px] font-bold tracking-[0.18em]" style={{ color: RED }}>SHORTS · ACTIVE</div>
                  <div className="ml-auto flex items-center gap-1.5 text-[9.5px] tracking-[0.16em]" style={{ color: TXT_65 }}>
                    <TrendingDown size={11} style={{ color: RED }} />
                    AI BIAS: <span className="font-bold" style={{ color: RED }}>BEARISH</span>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto stream-scroll flex flex-col gap-3 pr-1 py-2">
                  {shorts.length === 0 ? (
                    <IdleBattlefieldState
                      side="short"
                      marketsScanned={marketsScanned}
                      gatesPassed={gatesPassed}
                      currentReason={currentIdleReason}
                    />
                  ) : shorts.map((s, i) => (
                    <SignalCard key={s.sym} s={s} top={i === 0} ignite={i === 0 && igniteShortTop} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT RAIL — MY ACCOUNT (viewport-locked, scrolls independently
           * if content exceeds height — preserves account/AI controls
           * visibility without making the whole page scroll). */}
          <div className="flex flex-col gap-3.5 min-h-0 overflow-y-auto stream-scroll pr-1 py-2">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-bold tracking-[0.22em] text-white">MY ACCOUNT</div>
              <div
                className="px-2 py-0.5 text-[9px] font-bold tracking-[0.18em]"
                style={{ color: BRAND, border: `1px solid ${BRAND}66`, background: "rgba(102,255,102,0.06)" }}
              >
                PAPER MODE
              </div>
            </div>

            {/* EQUITY HERO */}
            <div
              className="relative flex flex-col gap-2 p-4"
              style={{
                background: `linear-gradient(180deg, rgba(102,255,102,0.06), rgba(102,255,102,0.01)), ${BG_2}`,
                border: `1px solid ${HAIR_18}`,
                boxShadow: `0 0 28px rgba(102,255,102,0.06) inset`,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="text-[8.5px] font-bold tracking-[0.22em]" style={{ color: TXT_40 }}>EQUITY</div>
                <div className="flex items-center gap-1 text-[8.5px] tracking-[0.18em]" style={{ color: BRAND }}>
                  <Bot size={10} /> AI MANAGED
                </div>
              </div>
              <div
                className="text-[30px] font-bold leading-none tabular-nums text-white"
                style={{ letterSpacing: "-0.04em", animation: "equityShimmer 4s ease-in-out infinite" }}
              >
                ${equityIntStr}<span style={{ color: TXT_40 }}>.{equityCents}</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="px-1.5 py-[1px] text-[10px] font-bold tabular-nums"
                  style={{
                    color: isProfitReal ? BRAND : RED,
                    border: `1px solid ${(isProfitReal ? BRAND : RED)}66`,
                    background: isProfitReal ? "rgba(102,255,102,0.06)" : "rgba(255,59,59,0.06)",
                  }}
                >
                  {realizedPctLabel}
                </div>
                <div className="text-[10px] tracking-[0.14em]" style={{ color: TXT_40 }}>since Jun 1</div>
              </div>
              <div className="mt-1">
                <Sparkline data={EQUITY_SPARK} color={BRAND} w={300} h={34} strokeW={1.8} />
              </div>
            </div>

            {/* 2-up stats */}
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="TODAY"    value={fmtMoneySigned(stats.todayPnl)} color={isProfitToday ? BRAND : RED} />
              <MiniStat label="WIN RATE" value={`${Math.round(stats.winRate)}%`} color="#fff" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="REALIZED"   value={fmtMoneySigned(stats.realizedPnl)}   color={isProfitReal   ? BRAND : RED} />
              <MiniStat label="UNREALIZED" value={fmtMoneySigned(stats.unrealizedPnl)} color={isProfitUnreal ? BRAND : RED} />
            </div>

            {/* AI AUTOTRADE CONTROL — emotional conversion moment.
             * NOT a generic toggle. Matte black + neon-green LIVE state
             * with subtle pulse. Server-backed via /api/user/ai-trading/*.
             * Free users get a 402 → flash a soft "UPGRADE" hint without
             * exposing live-execution affordances. Customer-portal locked
             * invariant respected (paper-only execution downstream). */}
            <button
              type="button"
              onClick={toggleAi}
              disabled={aiBusy || aiTrading.isLoading}
              className="group relative flex flex-col gap-2 p-3 text-left overflow-hidden"
              style={{
                background: aiTrading.enabled
                  ? `linear-gradient(180deg, rgba(102,255,102,0.10), rgba(102,255,102,0.02)), ${BG_2}`
                  : BG_2,
                border: `1px solid ${aiTrading.enabled ? `${BRAND}66` : HAIR_18}`,
                boxShadow: aiTrading.enabled
                  ? `0 0 22px rgba(102,255,102,0.10) inset`
                  : "none",
                cursor: aiBusy ? "wait" : "pointer",
                animation: aiTrading.enabled ? "aiActivePulse 3.2s ease-in-out infinite" : undefined,
                opacity: aiBusy && !aiArming ? 0.7 : 1,
                transition: "border-color 220ms ease, box-shadow 220ms ease, opacity 180ms ease",
              }}
            >
              {/* WEAPONS-SYSTEM ARMED HAIRLINE — subtle amber top edge that
               *  breathes when live. Reads as power, not panic. */}
              {aiTrading.enabled && (
                <div
                  className="pointer-events-none absolute left-0 right-0 top-0 h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent, #FFC83D 35%, #FFC83D 65%, transparent)`,
                    animation: "aiArmedWarning 2.8s ease-in-out infinite",
                  }}
                />
              )}
              {/* STAGED ACTIVATION SWEEP — fires once during OFF→ON
               *  request. Communicates "system arming", not "spinner". */}
              {aiArming && (
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 z-10"
                  style={{
                    width: "40%",
                    background: `linear-gradient(90deg, transparent, ${BRAND}55, transparent)`,
                    animation: "aiArmingSweep 1100ms ease-out 1",
                    mixBlendMode: "screen",
                  }}
                />
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Bot size={12} style={{ color: aiTrading.enabled ? BRAND : TXT_65 }} />
                  <div
                    className="text-[10px] font-bold tracking-[0.22em]"
                    style={{ color: aiTrading.enabled ? "#fff" : TXT_85 }}
                  >
                    AI AUTOTRADE
                  </div>
                </div>
                <div
                  className="flex items-center gap-1 px-1.5 py-[2px] text-[9px] font-bold tracking-[0.18em]"
                  style={{
                    color: aiTrading.enabled ? BG_0 : TXT_65,
                    background: aiTrading.enabled ? BRAND : "transparent",
                    border: `1px solid ${aiTrading.enabled ? BRAND : HAIR_18}`,
                    boxShadow: aiTrading.enabled ? `0 0 12px ${BRAND}77` : "none",
                  }}
                >
                  {aiTrading.enabled && (
                    <span
                      className="h-1 w-1 rounded-full"
                      style={{ background: BG_0, animation: "livePulse 1.8s ease-in-out infinite" }}
                    />
                  )}
                  {aiArming ? "ARMING…" : aiTrading.enabled ? "ARMED" : "ARM"}
                </div>
              </div>
              <div
                className="text-[10.5px] tracking-[0.04em]"
                style={{ color: aiTrading.enabled ? BRAND : TXT_65 }}
              >
                {aiArming
                  ? "INITIALIZING AI EXECUTION SYSTEM…"
                  : aiTrading.enabled
                  ? "AI EXECUTION ARMED · MANAGING POSITIONS"
                  : "TAP TO ARM AI EXECUTION"}
              </div>
              {/* CONTROL STRIP — values illuminate (brand color + faint glow)
               *  when ARMED to communicate the live risk profile is now
               *  active, not idle config. */}
              <div className="flex items-center gap-3 text-[8.5px] tracking-[0.18em]" style={{ color: TXT_40 }}>
                <span>MAX TRADES <span
                  className="font-bold tabular-nums"
                  style={{
                    color: aiTrading.enabled ? BRAND : TXT_85,
                    textShadow: aiTrading.enabled ? `0 0 6px ${BRAND}66` : "none",
                  }}
                >{aiMaxTrades || "—"}</span></span>
                <span style={{ color: TXT_25 }}>·</span>
                <span>RISK <span
                  className="font-bold"
                  style={{
                    color: aiTrading.enabled ? BRAND : TXT_85,
                    textShadow: aiTrading.enabled ? `0 0 6px ${BRAND}66` : "none",
                  }}
                >BALANCED</span></span>
                <span style={{ color: TXT_25 }}>·</span>
                <span>MODE <span
                  className="font-bold"
                  style={{
                    color: aiTrading.enabled ? BRAND : TXT_85,
                    textShadow: aiTrading.enabled ? `0 0 6px ${BRAND}66` : "none",
                  }}
                >{aiTrading.plan === "pro" ? "AGGRESSIVE" : aiTrading.plan === "starter" ? "BALANCED" : "CONSERVATIVE"}</span></span>
              </div>
              {aiUpgradeFlash && (
                <div
                  className="text-[9.5px] font-bold tracking-[0.14em]"
                  style={{ color: "#FFC83D" }}
                >
                  UPGRADE REQUIRED TO ARM AI EXECUTION
                </div>
              )}
            </button>

            {/* LIVE POSITIONS */}
            <div style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
              <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${HAIR_10}` }}>
                <div className="text-[10px] font-bold tracking-[0.22em]" style={{ color: TXT_85 }}>LIVE POSITIONS</div>
                <div className="text-[9px] tracking-[0.18em]" style={{ color: TXT_40 }}>{positions.length} OPEN</div>
              </div>
              <div className="flex flex-col">
                {positions.map((p, i) => {
                  const isL = p.dir === "LONG";
                  const c = isL ? BRAND : RED;
                  return (
                    <div
                      key={p.sym}
                      className="grid items-center gap-2 px-3 py-2"
                      style={{
                        gridTemplateColumns: "56px 1fr 60px",
                        background: isL ? "rgba(102,255,102,0.03)" : "rgba(255,59,59,0.03)",
                        borderTop: `1px solid ${HAIR_10}`,
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: c, boxShadow: `0 0 6px ${c}`, animation: `livePulse ${1.8 + i * 0.25}s ease-in-out ${i * 0.3}s infinite` }}
                        />
                        <span className="text-[12px] font-bold text-white" style={{ letterSpacing: "-0.02em" }}>{p.sym}</span>
                      </div>
                      <div className="flex flex-col">
                        <div className="text-[9px] tracking-[0.16em]" style={{ color: c }}>{p.dir}</div>
                        <div className="text-[9.5px] tabular-nums" style={{ color: TXT_40 }}>
                          {p.entry} → <span className="text-white">{p.cur}</span>
                        </div>
                      </div>
                      <div className="text-right text-[12px] font-bold tabular-nums" style={{ color: p.pnl >= 0 ? c : RED }}>
                        {p.pnl >= 0 ? "+" : ""}{p.pnl.toFixed(2)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* EXCHANGE BALANCES — real /api/user/exchanges/balances.
             * Honest empty-state: if no broker is linked, surface the
             * "CONNECT BROKER" rail rather than mock data. Subtle flash
             * on each balance update (keyed on connection lastUpdated). */}
            <div style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
              <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${HAIR_10}` }}>
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: liveConn?.ok ? BRAND : TXT_40,
                      boxShadow: liveConn?.ok ? `0 0 6px ${BRAND}` : "none",
                      animation: liveConn?.ok ? "livePulse 2.4s ease-in-out infinite" : undefined,
                    }}
                  />
                  <div className="text-[10px] font-bold tracking-[0.22em]" style={{ color: TXT_85 }}>
                    {liveConn?.ok
                      ? `${liveConn.exchange.toUpperCase()} · CONNECTED`
                      : !balancesData
                        ? "BROKER · LOADING"
                        : (balancesData.connections?.length ?? 0) === 0
                          ? "NO BROKER LINKED"
                          : "BROKER · UNAVAILABLE"}
                  </div>
                </div>
                <div className="text-[9px] tracking-[0.18em]" style={{ color: liveConn?.ok ? BRAND : TXT_40 }}>
                  {liveConn?.ok ? "LIVE" : "—"}
                </div>
              </div>
              {balanceRows.length > 0 ? (
                <div
                  key={balanceFlashKey}
                  className="flex flex-col px-3 py-2 gap-1"
                  style={{ animation: "balanceFlash 900ms ease-out 1" }}
                >
                  {balanceRows.map((b) => (
                    <div
                      key={b.asset}
                      className="flex items-center justify-between text-[10.5px]"
                      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                    >
                      <span style={{ color: TXT_65 }}>{b.asset}</span>
                      <span className="tabular-nums text-white">{fmtBalanceQty(b.qty, b.asset)}</span>
                    </div>
                  ))}
                  {typeof liveConn?.totalEquityUSD === "number" && liveConn.totalEquityUSD > 0 && (
                    <div
                      className="flex items-center justify-between text-[10.5px] mt-1 pt-1.5"
                      style={{
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        borderTop: `1px solid ${HAIR_10}`,
                      }}
                    >
                      <span className="tracking-[0.18em] font-bold" style={{ color: TXT_85 }}>TOTAL</span>
                      <span className="tabular-nums font-bold" style={{ color: BRAND }}>
                        ${liveConn.totalEquityUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col px-3 py-3 gap-1">
                  {(() => {
                    const hasConnections = (balancesData?.connections?.length ?? 0) > 0;
                    const isLoading = !balancesData;
                    return (
                      <>
                        <div className="text-[9.5px] tracking-[0.16em]" style={{ color: TXT_65 }}>
                          {isLoading
                            ? "Fetching account snapshot…"
                            : hasConnections
                              ? "Broker linked but snapshot unavailable. Retrying…"
                              : "Link a broker to see live balances."}
                        </div>
                        {!isLoading && !hasConnections && (
                          <div className="text-[9px] tracking-[0.18em]" style={{ color: TXT_40 }}>
                            Profile → CONNECTED ACCOUNTS
                          </div>
                        )}
                        {!isLoading && hasConnections && (
                          <div className="text-[9px] tracking-[0.18em]" style={{ color: "#FFC83D" }}>
                            CHECK API KEY · 30s POLL
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* AI ACTIVITY FEED */}
            <div style={{ background: BG_2, border: `1px solid ${HAIR_10}` }}>
              <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${HAIR_10}` }}>
                <div className="flex items-center gap-1.5">
                  <Radio size={11} style={{ color: BRAND }} />
                  <div className="text-[10px] font-bold tracking-[0.22em]" style={{ color: TXT_85 }}>AI ACTIVITY</div>
                </div>
                <div className="text-[9px] tracking-[0.18em]" style={{ color: TXT_40 }}>LIVE FEED</div>
              </div>
              <div className="flex flex-col">
                {feedRows.length === 0 ? (
                  <div className="px-3 py-3 text-[9.5px] tracking-[0.16em]" style={{ color: TXT_65 }}>
                    {engine ? "AI engine warming up — first signals incoming…" : "Connecting to AI engine…"}
                  </div>
                ) : feedRows.map((e, i) => {
                  const timeColor = e.fresh ? "rgba(255,255,255,0.65)" : TXT_40;
                  const msgColor  = e.fresh ? "#fff" : TXT_65;
                  const rowBg = i === 0 ? "rgba(102,255,102,0.04)" : i === 1 ? "rgba(102,255,102,0.02)" : "transparent";
                  return (
                    <div
                      key={e.id}
                      className="flex items-center gap-2 px-3 py-1.5"
                      style={{
                        borderTop: i === 0 ? "none" : `1px solid ${HAIR_10}`,
                        background: rowBg,
                        animation: e.fresh ? `feedFadeIn 260ms ease-out ${i * 40}ms both` : undefined,
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                        style={{ background: e.dot, boxShadow: `0 0 6px ${e.dot}`, animation: i === 0 ? "feedDot 1.6s ease-in-out infinite" : undefined }}
                      />
                      <span
                        className="text-[9.5px] tabular-nums flex-shrink-0"
                        style={{ color: timeColor, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                      >
                        {e.t}
                      </span>
                      <span
                        className="text-[9.5px] font-semibold tracking-[0.06em] truncate"
                        style={{ color: msgColor }}
                        title={e.msg}
                      >
                        {e.msg}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* UPGRADE CTA */}
            <button
              className="mt-1 flex items-center justify-center gap-2 px-3 py-3 text-[11px] font-bold tracking-[0.20em]"
              style={{
                color: BG_0,
                background: `linear-gradient(90deg, ${EMERALD}, ${BRAND}, ${LIME})`,
                boxShadow: `0 0 22px ${BRAND}66`,
                border: `1px solid ${BRAND}`,
              }}
            >
              <Zap size={13} strokeWidth={3} />
              UNLOCK 12 CONCURRENT AI TRADES
            </button>
          </div>
        </div>

        {/* BOTTOM TICKER */}
        <div
          className="flex h-[36px] items-center gap-6 px-5 text-[10px] tracking-[0.20em]"
          style={{ background: BG_1, borderTop: `1px solid ${HAIR_10}`, color: TXT_65 }}
        >
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: BRAND, boxShadow: `0 0 6px ${BRAND}`, animation: "pulseOrb 2.4s ease-in-out infinite" }} />
            <span style={{ color: BRAND }} className="font-bold">{huntingFooterLabel}</span>
          </div>
          <span style={{ color: TXT_25 }}>·</span>
          <span>SIGNALS/MIN <span className="font-bold text-white tabular-nums">4.2</span></span>
          <span style={{ color: TXT_25 }}>·</span>
          <span>LAST FILL <span className="font-bold" style={{ color: BRAND }}>BTC LONG +0.42%</span></span>
          <span style={{ color: TXT_25 }}>·</span>
          <span>NEXT SCAN <span className="font-bold text-white tabular-nums">3s</span></span>
          <span className="ml-auto" style={{ color: TXT_40 }}>v2.1 · personal terminal</span>
        </div>
      </div>
    </div>
  );
}

/* Default export — wraps the cinematic terminal in `PaperTradesProvider` so
 * the right-rail account telemetry, LIVE POSITIONS, and queued paper trades
 * resolve against a real store rather than the inert soft-fallback context.
 * Matches the canonical mount pattern used by PortalCustomerShell. */
export default function Terminal() {
  return (
    <PaperTradesProvider>
      <TerminalInner />
    </PaperTradesProvider>
  );
}
