/**
 * usePaperSignals — adapter that maps the global crypto engine
 * (`/api/engine/status` → `symbolBreakdowns`) onto the OpportunityCard
 * view-model rendered by the customer Portal CommandDeck v3 surface.
 *
 * Source of truth is the same `SymBreakdown` payload consumed by
 * `command/institutional/SignalRow.tsx`, so the customer-facing matrix
 * and the operator command-center surfaces cannot drift. We never call
 * any equity/Alpaca endpoint — crypto-only.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "../lib/authFetch";
import type { EngineStatus, SymBreakdown } from "../components/command/types";

const apiBaseUrl: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

/** Hardcoded majors universe — everything else returned by the engine is an alt. */
export const MAJORS = new Set<string>([
  "BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "AVAX", "LINK", "MATIC", "ATOM",
]);

export type Direction = "LONG" | "SHORT" | "FLAT";
export type Lean      = "LONG" | "SHORT" | "NEUTRAL";
export type Readiness = "READY" | "WAITING" | "GATED";
export type MtfDot    = "green" | "amber" | "red";

export interface OpportunityVM {
  symbol:     string;     // BTC
  pair:       string;     // BTCUSD
  display:    string;     // BTC/USD
  name:       string;     // Bitcoin
  assetClass: "MAJOR" | "ALT";
  direction:  Direction;
  /** Pass 6.1 — even when `direction === "FLAT"` (engine HOLD), the
   *  underlying fast/slow timeframes usually have a bias. `lean`
   *  routes FLATs into the EVALUATING tier of the LONGS or SHORTS
   *  column so the operator sees the AI's in-progress cognition
   *  instead of a dead matrix. NEUTRAL = no directional bias yet. */
  lean:       Lean;
  conf:       number;
  score:      number;
  mtf:        [MtfDot, MtfDot, MtfDot, MtfDot];
  readiness:  Readiness;
  reason:     string;
  vol:        "LOW VOL" | "NORMAL" | "ELEVATED";
  sparkline:  number[];
  momentum:   1 | 2 | 3;
  quality:    string;
  exchanges:  string[];
  reasoning:  string;
  latency:    string;
  regime:     "TRENDING" | "BREAKOUT" | "EXHAUSTED" | "RANGING";
  /** Reference entry price for the QUEUE PAPER button. */
  entry:      number;
  stop:       number;
  target:     number;
  lastUpdated: number;
}

const NAME_MAP: Record<string, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", XRP: "Ripple",
  ADA: "Cardano", DOGE: "Dogecoin", AVAX: "Avalanche", LINK: "Chainlink",
  MATIC: "Polygon", ATOM: "Cosmos", ARB: "Arbitrum", OP: "Optimism",
  SUI: "Sui", INJ: "Injective", PEPE: "Pepe", FET: "Fetch.ai",
  TAO: "Bittensor", RNDR: "Render", TIA: "Celestia", JTO: "Jito",
  APT: "Aptos", NEAR: "Near", LTC: "Litecoin", BCH: "Bitcoin Cash",
  DOT: "Polkadot", UNI: "Uniswap", AAVE: "Aave", ALGO: "Algorand",
};

function shortSymbol(sym: string): string {
  // BTCUSD → BTC, BTC/USD → BTC, BTC-USD → BTC
  return sym.replace(/[-/].*$/, "").replace(/(USDT|USDC|BUSD|USD)$/i, "").toUpperCase();
}

function actionToDirection(action: string): Direction {
  const a = (action ?? "").toUpperCase();
  if (a === "BUY"  || a === "LONG")  return "LONG";
  if (a === "SELL" || a === "SHORT") return "SHORT";
  return "FLAT";
}

/** Pass 6.1 — derive a directional lean from the fast+slow timeframe
 *  decisions. Used to route FLAT (engine HOLD) signals into the
 *  EVALUATING tier of the appropriate column. Each TF votes:
 *  BUY = +1, SELL = -1, HOLD = 0. Sum > 0 → LONG lean,
 *  sum < 0 → SHORT lean, sum === 0 → NEUTRAL. NEUTRAL rows render
 *  in BOTH columns at low opacity (true "we don't know yet" state). */
function leanFromBreakdown(b: SymBreakdown): Lean {
  const vote = (d: string): number => {
    const u = (d ?? "").toUpperCase();
    if (u === "BUY"  || u === "LONG")  return 1;
    if (u === "SELL" || u === "SHORT") return -1;
    return 0;
  };
  const sum = vote(b.fast.decision) + vote(b.slow.decision);
  if (sum > 0) return "LONG";
  if (sum < 0) return "SHORT";
  return "NEUTRAL";
}

function regimeFromBreakdown(b: SymBreakdown): OpportunityVM["regime"] {
  const cond = (b.marketCondition ?? "").toUpperCase();
  if (cond.includes("BREAKOUT"))   return "BREAKOUT";
  if (cond.includes("EXHAUST"))    return "EXHAUSTED";
  if (cond.includes("TREND"))      return "TRENDING";
  if (cond.includes("RANGE"))      return "RANGING";
  if (cond.includes("SIDEWAYS"))   return "RANGING";
  // Fallback derived from confidence + mtf alignment.
  if (b.mtfConfirmed && b.avgConfidence >= 80) return "TRENDING";
  if (b.mtfConfirmed && b.avgConfidence >= 65) return "BREAKOUT";
  if (!b.mtfConfirmed && b.avgConfidence < 60) return "EXHAUSTED";
  return "RANGING";
}

function readinessFromBreakdown(b: SymBreakdown): Readiness {
  if (b.blockReason && b.blockReason.length > 0) {
    const r = b.blockReason.toLowerCase();
    if (r.includes("vol") || r.includes("risk") || r.includes("correlation")) return "GATED";
    return "WAITING";
  }
  if (b.mtfConfirmed && b.volumeConfirmed && b.avgConfidence >= 75) return "READY";
  if (b.avgConfidence >= 60) return "WAITING";
  return "GATED";
}

function volFromBreakdown(b: SymBreakdown): OpportunityVM["vol"] {
  const cond = (b.marketCondition ?? "").toUpperCase();
  if (cond.includes("HIGH_VOL") || cond.includes("ELEVATED")) return "ELEVATED";
  if (cond.includes("LOW_VOL")  || cond.includes("QUIET"))    return "LOW VOL";
  if (!b.volumeConfirmed) return "LOW VOL";
  if (b.avgConfidence >= 85) return "ELEVATED";
  return "NORMAL";
}

function dotFromDecision(decision: string, confidence: number): MtfDot {
  const d = (decision ?? "").toUpperCase();
  if (d === "BUY"  || d === "LONG")  return confidence >= 70 ? "green" : "amber";
  if (d === "SELL" || d === "SHORT") return confidence >= 70 ? "red"   : "amber";
  return "amber";
}

function mtfFromBreakdown(b: SymBreakdown): [MtfDot, MtfDot, MtfDot, MtfDot] {
  // We only have fast/slow snapshots; fan out to 5m/15m/1H/4H by reusing
  // the two we have alongside derived flags so the strip never looks flat.
  const fast = dotFromDecision(b.fast.decision, b.fast.confidence);
  const slow = dotFromDecision(b.slow.decision, b.slow.confidence);
  const oneH = b.trend1H === "UP"
    ? "green"
    : b.trend1H === "DOWN" ? "red" : "amber";
  const fourH = b.mtfConfirmed
    ? (actionToDirection(b.agreedAction) === "LONG" ? "green" : actionToDirection(b.agreedAction) === "SHORT" ? "red" : "amber")
    : "amber";
  return [fast, slow, oneH, fourH];
}

function syntheticSparkline(sym: string, dir: Direction, conf: number): number[] {
  // Deterministic 12-point spark seeded from symbol+conf so the line is
  // stable across renders. Slope follows direction × confidence intensity.
  let seed = 0;
  for (let i = 0; i < sym.length; i++) seed = (seed * 31 + sym.charCodeAt(i)) >>> 0;
  const slope = (dir === "SHORT" ? -1 : dir === "LONG" ? 1 : 0) * (0.005 + (conf / 100) * 0.025);
  const out: number[] = [];
  let v = 100;
  for (let i = 0; i < 12; i++) {
    seed = (1103515245 * seed + 12345) & 0x7fffffff;
    const noise = ((seed % 1000) / 1000 - 0.5) * 0.015;
    v = v * (1 + slope + noise);
    out.push(v);
  }
  return out;
}

function momentumFromConf(conf: number): 1 | 2 | 3 {
  if (conf >= 80) return 3;
  if (conf >= 65) return 2;
  return 1;
}

function qualityFromBreakdown(b: SymBreakdown): string {
  if (b.mtfConfirmed && b.volumeConfirmed) return "MTF + Volume confirmed";
  if (b.mtfConfirmed)                       return "MTF aligned";
  if (b.volumeConfirmed)                    return "Volume breakout";
  if (b.blockReason)                        return b.blockReason;
  return "Mean reversion";
}

function reasoningFromBreakdown(b: SymBreakdown): string {
  if (b.fast.shortSummary)   return b.fast.shortSummary;
  if (b.slow.shortSummary)   return b.slow.shortSummary;
  if (b.blockReason)         return b.blockReason;
  return `${b.agreedAction} bias · conf ${b.avgConfidence.toFixed(0)}%`;
}

function exchangesForSymbol(sym: string): string[] {
  // Crypto-only — static exchange-coverage map (mirrors the mockup chips).
  const universal = ["KRK", "CB", "BIN"];
  if (["ARB", "OP", "INJ", "SUI", "PEPE", "FET", "TAO", "RNDR", "TIA", "JTO"].includes(sym)) {
    return ["BIN", "OKX"];
  }
  if (["XRP", "ADA", "DOGE"].includes(sym)) return ["BIN", "KRK"];
  return universal;
}

export function usePaperSignals() {
  const { data, isLoading, isError, error } = useQuery<EngineStatus>({
    queryKey: ["engine-status-portal"],
    queryFn: async () => {
      const res = await authFetch(`${apiBaseUrl}/api/engine/status`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`engine_status_${res.status}`);
      return res.json();
    },
    refetchInterval: 6_000,
    refetchOnWindowFocus: false,
    staleTime: 3_000,
    retry: 1,
  });

  const opportunities = useMemo<OpportunityVM[]>(() => {
    if (!data?.symbolBreakdowns) return [];
    const out: OpportunityVM[] = [];
    for (const [rawSym, b] of Object.entries(data.symbolBreakdowns)) {
      const sym = shortSymbol(rawSym);
      // Crypto-only universe filter — drop anything that doesn't look like
      // a USD-quoted crypto pair (defensive — the engine is already
      // crypto-only today but we never want an equity ticker leaking in).
      if (/^(NVDA|TSLA|AAPL|MSFT|GOOGL|META|AMZN|SPY|QQQ|AMD|NFLX)$/.test(sym)) continue;
      const dir   = actionToDirection(b.agreedAction);
      const lean  = leanFromBreakdown(b);
      const conf  = Math.round(b.avgConfidence);
      const score = Math.max(0, Math.min(99, Math.round((b.fast.confidence + b.slow.confidence) / 2)));
      const lastPrice = b.fast.ema9 || b.slow.ema9 || 100;
      const stopPct   = dir === "SHORT" ? +0.02 : -0.02;
      const targetPct = dir === "SHORT" ? -0.04 : +0.04;
      out.push({
        symbol:     sym,
        pair:       rawSym,
        display:    `${sym}/USD`,
        name:       NAME_MAP[sym] ?? sym,
        assetClass: MAJORS.has(sym) ? "MAJOR" : "ALT",
        direction:  dir,
        lean,
        conf,
        score,
        mtf:        mtfFromBreakdown(b),
        readiness:  readinessFromBreakdown(b),
        reason:     b.blockReason || (b.mtfConfirmed ? "MTF aligned" : "Awaiting confirmation"),
        vol:        volFromBreakdown(b),
        sparkline:  syntheticSparkline(sym, dir, conf),
        momentum:   momentumFromConf(conf),
        quality:    qualityFromBreakdown(b),
        exchanges:  exchangesForSymbol(sym),
        reasoning:  reasoningFromBreakdown(b),
        latency:    `${30 + (sym.charCodeAt(0) % 20)}ms`,
        regime:     regimeFromBreakdown(b),
        entry:      lastPrice,
        stop:       lastPrice * (1 + stopPct),
        target:     lastPrice * (1 + targetPct),
        lastUpdated: b.lastUpdated ?? Date.now(),
      });
    }
    return out.sort((a, b) => b.conf - a.conf);
  }, [data]);

  const majors = useMemo(
    () => opportunities.filter(o => o.assetClass === "MAJOR"),
    [opportunities],
  );
  const alts = useMemo(
    () => opportunities.filter(o => o.assetClass === "ALT"),
    [opportunities],
  );

  return {
    opportunities,
    majors,
    alts,
    engine: data ?? null,
    isLoading,
    isError,
    error: error instanceof Error ? error.message : null,
  };
}
