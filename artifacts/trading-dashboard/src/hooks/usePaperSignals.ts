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
import {
  computeConviction,
  percentileRank,
  type ConvictionBreakdown,
  type ConvictionTier,
} from "../lib/conviction";

const apiBaseUrl: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

/** Hardcoded majors universe — everything else returned by the engine is an alt.
 *  CONVICTION_V2 (2026-05-26, density revision): re-expanded to ten
 *  institutional / recognizable / large-cap names. The previous six-symbol
 *  tightening (BTC/ETH/SOL/XRP/LINK/AVAX only) read as "sparse" even after
 *  adaptive-fill kicked in — the left column was load-bearing on too few
 *  symbols to reliably surface ranked conviction. MAJORS is intended to
 *  represent "institutional / recognizable / large-cap opportunities," not
 *  the six undisputed top-of-book names; ADA, DOGE, POL (née MATIC), and
 *  ATOM all meet that bar and route back to MAJORS. LTC is a candidate for
 *  the next expansion once it's added to `KRAKEN_SYMBOLS`/`COINBASE_SYMBOLS`
 *  in `api-server/src/lib/marketData.ts`.
 *
 *  Meme / opportunistic micro-caps (PEPE, WIF, BONK, FLOKI, TURBO) stay in
 *  ALTS where their volatility profile and visual treatment match. Target
 *  steady-state density: ~10–12 MAJORS, ~10–14 ALTS. */
export const MAJORS = new Set<string>([
  "BTC", "ETH", "SOL", "XRP", "LINK", "AVAX",
  "ADA", "DOGE", "POL", "ATOM",
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
  /** RAW engine confidence (MTF mean of fast/slow runAIDecision outputs).
   *  Kept on the VM so the "Why this score?" disclosure can cite it and
   *  any execution-adjacent logic (queue selectors, risk math) can keep
   *  reading the raw engine number. The card body now displays
   *  `convictionScore` instead. */
  conf:       number;
  /** EXECUTION confidence — the number the live-execution gate 0f and
   *  the auto-trade fan-out actually compare against. Equals
   *  `SymBreakdown.avgConfidence` (untouched by display enrichment).
   *  Surfaced on the VM so the card can disclose the display↔exec
   *  delta and never visually imply "87% executable" when the gate
   *  evaluates 79%. */
  execConfidence: number;
  score:      number;
  /** USER-FACING calibrated conviction score (0..100). See
   *  `lib/conviction.ts` for the formula. Real factors only — never
   *  hardcoded. */
  convictionScore:     number;
  convictionTier:      ConvictionTier;
  convictionBreakdown: ConvictionBreakdown;
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
  /** LOW-CONFIDENCE FILTER — separation of signal visibility from execution
   *  eligibility. When `false`, the card renders muted + LOW CONFIDENCE
   *  badge and any TRADE / QUEUE PAPER affordance must be hidden or
   *  disabled. Mirrors `SymBreakdown.executionEligible` from the engine. */
  executionEligible: boolean;
  executionBlockReason: "low_confidence" | "no_mtf_agreement" | "sideways" | "hold_bias" | null;
}

const NAME_MAP: Record<string, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", XRP: "Ripple",
  ADA: "Cardano", DOGE: "Dogecoin", AVAX: "Avalanche", LINK: "Chainlink",
  POL: "Polygon", ATOM: "Cosmos", ARB: "Arbitrum", OP: "Optimism", FIL: "Filecoin",
  SUI: "Sui", INJ: "Injective", PEPE: "Pepe", FET: "Fetch.ai",
  TAO: "Bittensor", RNDR: "Render", TIA: "Celestia", JTO: "Jito",
  APT: "Aptos", NEAR: "Near", LTC: "Litecoin", BCH: "Bitcoin Cash",
  DOT: "Polkadot", UNI: "Uniswap", AAVE: "Aave", ALGO: "Algorand",
  // CONVICTION_V2 (2026-05-26): meme/micro-cap display names matching
  // the new entries in api-server/src/lib/marketData.ts. These flow
  // into the ALTS column (assetClass = "ALT" since none are in MAJORS).
  // BRETT deliberately excluded — not listed on Coinbase or Kraken.
  WIF: "dogwifhat", BONK: "Bonk", FLOKI: "Floki", TURBO: "Turbo",
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
  // POPULATION RESTORE (2026-05-26, Fix A): "LOW VOL" now fires only when
  // the engine EXPLICITLY classifies the regime as low/quiet. The previous
  // `!volumeConfirmed → LOW VOL` mapping was binary-thresholded against the
  // strict 85%-of-20-bar-avg gate, which on a typical tick flipped ~17 of
  // 19 cards to LOW VOL — collapsing visual density AND excluding them
  // from the cohort pool (Fix C). Net effect was a near-empty board even
  // when the engine had real signals. NORMAL is now the institutional
  // default; ELEVATED still requires confirmed volume.
  const cond = (b.marketCondition ?? "").toUpperCase();
  if (cond.includes("HIGH_VOL") || cond.includes("ELEVATED")) return "ELEVATED";
  if (cond.includes("LOW_VOL")  || cond.includes("QUIET"))    return "LOW VOL";
  if (b.volumeConfirmed && b.avgConfidence >= 75) return "ELEVATED";
  return "NORMAL";
}

function dotFromDecision(decision: string, confidence: number): MtfDot {
  // POPULATION RESTORE (2026-05-26, Fix B): colored-dot threshold lowered
  // 70 → 60 so the MTF strip lights up whenever the engine has a genuine
  // directional read. Previously the 70 floor required `fast.confidence`
  // OR `slow.confidence` to individually clear 70 — extremely rare under
  // CONVICTION_V2 — leaving every card 4-amber even when avgConfidence
  // and mtfConfirmed clearly favored a side. Not inflation: the
  // underlying confidence numbers are unchanged; we're only relaxing the
  // visual classification. HOLD always stays amber.
  const d = (decision ?? "").toUpperCase();
  if (d === "BUY"  || d === "LONG")  return confidence >= 60 ? "green" : "amber";
  if (d === "SELL" || d === "SHORT") return confidence >= 60 ? "red"   : "amber";
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
  const conf = Number(b.avgConfidence);
  return `${b.agreedAction} bias · conf ${(Number.isFinite(conf) ? conf : 0).toFixed(0)}%`;
}

// ── Conviction-input derivations (real engine data, never hardcoded) ────────
//
// These translate raw SymBreakdown fields into the 0..100 inputs that
// `computeConviction()` expects. All of them must derive from observable
// engine telemetry — never invent a value.

/** Trend-strength composite (0..100). Combines fast/slow EMA signals with
 *  the 1H trend the engine publishes. Three "votes" align fully → 100;
 *  fully mixed → 0. */
function trendStrengthFromBreakdown(b: SymBreakdown): number {
  const dirOf = (sig: string | undefined): number => {
    const s = (sig ?? "").toUpperCase();
    if (s.includes("BULL") || s.includes("UP"))   return 1;
    if (s.includes("BEAR") || s.includes("DOWN")) return -1;
    return 0;
  };
  const fastVote = dirOf(b.fast.emaSignal);
  const slowVote = dirOf(b.slow.emaSignal);
  const h1Vote   = dirOf(b.trend1H);
  const aligned  = Math.abs(fastVote + slowVote + h1Vote); // 0..3
  return (aligned / 3) * 100;
}

/** Liquidity / volume confirmation (0..100). The engine already gates on
 *  bar-volume >= 85% of 20-bar avg → `volumeConfirmed`. Unconfirmed
 *  keeps a non-zero floor (35) so a symbol with weak volume but real
 *  signal can still earn moderate conviction from other factors. */
function liquidityScoreFromBreakdown(b: SymBreakdown): number {
  return b.volumeConfirmed ? 100 : 35;
}

/** Market regime quality (0..100). BREAKOUT / TRENDING are the regimes
 *  the AI engine performs best in; EXHAUSTED / RANGING are the regimes
 *  it should be sceptical of. Unknown → 50 (neutral). */
function regimeScoreFromBreakdown(b: SymBreakdown): number {
  const c = (b.marketCondition ?? "").toUpperCase();
  if (c.includes("BREAKOUT"))  return 100;
  if (c.includes("TRENDING"))  return 80;
  if (c.includes("EXHAUST"))   return 40;
  if (c.includes("RANGING") || c.includes("SIDEWAY")) return 20;
  return 50;
}

/** Reward / risk ratio = reward distance / risk distance from entry. */
function computeRRRatio(entry: number, stop: number, target: number): number {
  const risk   = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  if (!Number.isFinite(risk) || risk <= 0) return 0;
  return reward / risk;
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

/**
 * Pass 7e — DEV-ONLY hero preview injector. Gated on `import.meta.env.DEV`
 * AND the `?preview=hero` query flag, so the synthetic cards CANNOT
 * reach production builds:
 *  - `import.meta.env.DEV` is statically `false` in `vite build`, which
 *    lets the rollup tree-shaker drop both this constant and the
 *    synthetic-card construction below from the production bundle.
 *  - The query-flag check is the operational gate within dev builds.
 *
 * Purpose: enable visual QA of the conviction-tier hierarchy
 * (Pass 7c/7d) when the live market is in an evaluation-heavy regime
 * with no real signals at conf >=80. Injects:
 *  - One ELITE (conf 94) LONG  on BTC
 *  - One STRONG (conf 84) SHORT on ETH
 * Distinct synthetic pair keys (`__PREVIEW_ELITE__` /
 * `__PREVIEW_STRONG__`) prevent React key collisions with any real
 * BTCUSD/ETHUSD breakdown returned by the engine.
 *
 * Discipline preserved: real conf thresholds and engine gates are
 * untouched. This injector exists solely so designers/operators can
 * verify hero-tier rendering in any market regime.
 */
const HERO_PREVIEW_ENABLED: boolean =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("preview") === "hero";

function buildHeroPreviewCards(now: number): OpportunityVM[] {
  const mk = (
    sym: string,
    dir: "LONG" | "SHORT",
    conf: number,
    pairKey: string,
    entry: number,
  ): OpportunityVM => {
    const stopPct   = dir === "SHORT" ? +0.02 : -0.02;
    const targetPct = dir === "SHORT" ? -0.04 : +0.04;
    // Hero preview cards are SYNTHETIC and dev-only — mirror raw conf into
    // convictionScore so the elite-tier UI still renders correctly in
    // ?preview=hero, but with an honest breakdown showing the preview
    // numbers came from a fixed scenario, not live engine data.
    const fakeBreakdown: ConvictionBreakdown = {
      raw:       { value: conf, weight: 0.30, contribution: conf * 0.30, label: "Raw engine confidence", verdict: conf >= 80 ? "strong" : "good" },
      rank:      { value: 100, weight: 0.18, contribution: 18,            label: "Rank vs current signal pool", verdict: "strong" },
      mtf:       { value: 100, weight: 0.15, contribution: 15,            label: "Multi-timeframe agreement", verdict: "strong" },
      trend:     { value: 100, weight: 0.12, contribution: 12,            label: "Trend strength (EMA + 1H)", verdict: "strong" },
      liquidity: { value: 100, weight: 0.10, contribution: 10,            label: "Volume / liquidity", verdict: "strong" },
      regime:    { value: 100, weight: 0.10, contribution: 10,            label: "Market regime quality", verdict: "strong" },
      rr:        { value: 50,  weight: 0.05, contribution: 2.5,           label: "Reward-to-risk shape", verdict: "fair" },
    };
    return {
      symbol:     sym,
      pair:       pairKey,
      display:    `${sym}/USD`,
      name:       NAME_MAP[sym] ?? sym,
      assetClass: MAJORS.has(sym) ? "MAJOR" : "ALT",
      direction:  dir,
      lean:       dir,
      conf,
      execConfidence: conf,
      score:      conf,
      convictionScore:     conf,
      convictionTier:      conf >= 90 ? "ELITE" : conf >= 70 ? "HIGH" : "STRONG",
      convictionBreakdown: fakeBreakdown,
      mtf:        dir === "LONG"
        ? ["green", "green", "green", "green"]
        : ["red", "red", "red", "red"],
      readiness:  "READY",
      reason:     "MTF + Volume confirmed",
      vol:        "ELEVATED",
      sparkline:  syntheticSparkline(sym, dir, conf),
      momentum:   3,
      quality:    "MTF + Volume confirmed",
      exchanges:  exchangesForSymbol(sym),
      reasoning:  dir === "LONG"
        ? "Strong bullish EMA alignment · 1H trend up · volume surge confirmed"
        : "Bearish engulfing on 5m+15m · 1H trend down · volume confirmed",
      latency:    "28ms",
      regime:     "BREAKOUT",
      entry,
      stop:       entry * (1 + stopPct),
      target:     entry * (1 + targetPct),
      lastUpdated: now,
      // Hero preview cards are synthetic ELITE/STRONG (conf 94 / 84) so
      // they always exceed the engine baseline and render as EXECUTABLE.
      executionEligible:    true,
      executionBlockReason: null,
    };
  };
  return [
    mk("BTC", "LONG",  94, "__PREVIEW_ELITE__",  67_000),
    mk("ETH", "SHORT", 84, "__PREVIEW_STRONG__", 3_400),
  ];
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
      // Pass E3 — render layer reads displayConfidence (context-enriched).
      // Execution path reads avgConfidence (untouched). Fallback preserves
      // backward compat if backend hasn't shipped the new field yet.
      const conf  = Math.round(b.displayConfidence ?? b.avgConfidence);
      const score = Math.max(0, Math.min(99, Math.round((b.fast.confidence + b.slow.confidence) / 2)));
      const lastPrice = b.fast.ema9 || b.slow.ema9 || 100;
      const stopPct   = dir === "SHORT" ? +0.02 : -0.02;
      const targetPct = dir === "SHORT" ? -0.04 : +0.04;
      const entry  = lastPrice;
      const stop   = lastPrice * (1 + stopPct);
      const target = lastPrice * (1 + targetPct);
      out.push({
        symbol:     sym,
        pair:       rawSym,
        display:    `${sym}/USD`,
        name:       NAME_MAP[sym] ?? sym,
        assetClass: MAJORS.has(sym) ? "MAJOR" : "ALT",
        direction:  dir,
        lean,
        conf,
        execConfidence: Math.round(b.avgConfidence),
        score,
        // Placeholders — overwritten in the conviction pass below once
        // every card's raw conf is known (rank percentile needs the
        // full pool). These default values keep the type system happy
        // and provide a safe fallback if the second pass throws.
        convictionScore:     conf,
        convictionTier:      "MODERATE",
        convictionBreakdown: computeConviction({
          rawConfidence:  conf,
          rankPercentile: 50,
          mtfAgreed:      b.mtfConfirmed,
          rrRatio:        computeRRRatio(entry, stop, target),
          trendStrength:  trendStrengthFromBreakdown(b),
          liquidityScore: liquidityScoreFromBreakdown(b),
          regimeScore:    regimeScoreFromBreakdown(b),
        }).breakdown,
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
        entry:      entry,
        stop:       stop,
        target:     target,
        lastUpdated: b.lastUpdated ?? Date.now(),
        // LOW-CONFIDENCE FILTER — pass the engine's executionEligible flag
        // straight through. Backward-compat fallback for engines that
        // haven't shipped the field yet: synthesize from the same rules
        // the engine uses (avgConfidence >= 60, MTF confirmed, non-HOLD,
        // non-sideways) so the UI never opens a TRADE affordance on a
        // signal that wouldn't pass gate 0f anyway.
        executionEligible:
          typeof b.executionEligible === "boolean"
            ? b.executionEligible
            : (b.mtfConfirmed && b.avgConfidence >= 60 && b.agreedAction !== "HOLD" && b.marketCondition !== "sideways"),
        executionBlockReason:
          (b.executionBlockReason ?? null) as OpportunityVM["executionBlockReason"],
      });
    }
    // Pass 7e — dev-only hero preview injection. Tree-shaken from prod
    // builds via `import.meta.env.DEV` becoming a literal `false`.
    if (HERO_PREVIEW_ENABLED) {
      out.push(...buildHeroPreviewCards(Date.now()));
    }
    // ── Conviction pass ──────────────────────────────────────────────
    // Now that the full pool is built, compute each card's percentile
    // rank vs the COHORT POOL, then run the calibrated conviction
    // formula. This is the ONLY place rank-percentile is computed;
    // we do it client-side so it's always consistent with exactly
    // what the user is currently seeing on screen.
    //
    // Option A — input-quality filtering (LOCKED INVARIANT):
    //   The percentile cohort is restricted to ACTIVE-REGIME assets
    //   that pass the volume floor. RANGING / EXHAUSTED / LOW-VOL
    //   symbols still render in the UI (so the operator sees the
    //   full board) but are EXCLUDED from the ranking pool so they
    //   cannot dilute the percentile model.
    //
    //   Without this filter, a strong breakout on ARB gets ranked
    //   against ATOM-in-sideways inside the same 15-symbol cohort,
    //   collapsing percentile spread and starving the calibrated
    //   conviction layer of the signal it needs to surface ELITE.
    //
    //   This is RENDER-LAYER ONLY. The execution path
    //   (`placeLiveAutoOrderForUser`, `tradingLoop`, riskGate,
    //   Kraken payload, 2% stop, 3-trade cap, 80% live-exec floor)
    //   is untouched — it never reads opp.convictionScore or this
    //   percentile pool. Verified by the launch-risk audit.
    //
    // Cohort qualification (must satisfy ALL — Pass C3 tightened):
    //   1. regime ∈ { TRENDING, BREAKOUT }  (excludes RANGING / EXHAUSTED)
    //   2. vol !== "LOW VOL"                (proxy for volumeConfirmed)
    //   3. mtf has at least one green/red dot AND no full-amber row
    //      (proxy for MTF agreement — institutional-grade cohort only)
    //
    // Adding the MTF requirement to the cohort gate is the
    // institutional-scarcity lever: on a typical tick this drops the
    // ranking pool from ~15 to ~3–6 genuine institutional setups,
    // which makes the top card's percentile-100 actually mean
    // "this is the cleanest opportunity on the board right now"
    // instead of "least bad of fifteen".
    //
    // Non-qualifying opps get rank=0 — combined with the calibrated
    // layer's weighting (rank carries 0.18) plus the new discord
    // penalty (up to -15 when raw is strong but context is broken)
    // this naturally settles them into LOW / DEVELOPING without any
    // tier hardcoding.
    const isActiveCohortMember = (o: OpportunityVM): boolean => {
      const activeRegime = o.regime === "TRENDING" || o.regime === "BREAKOUT";
      const volumePasses = o.vol !== "LOW VOL";
      // MTF qualification: at least one non-amber dot AND not all amber.
      // The mtf tuple is [5m, 15m, 1H, trend] of MtfDot ("green"|"red"|"amber").
      const nonAmber = o.mtf.filter(d => d !== "amber").length;
      const mtfQualifies = nonAmber >= 2;
      return activeRegime && volumePasses && mtfQualifies;
    };
    // POPULATION RESTORE (2026-05-26, Fix C): cohort floor.
    //   The locked invariant above stands when the strict institutional
    //   cohort has >=4 members — in that regime percentile math has
    //   enough signal to separate ELITE from STRONG. When the strict
    //   cohort collapses to <4 (modest-market regime, the new normal
    //   under CONVICTION_V2), percentile math degenerates: every card
    //   maps to ~50, and the entire board flattens into the same
    //   conviction band.
    //
    //   The fallback expands the ranking pool to "anything not
    //   EXHAUSTED and not explicitly LOW VOL" so percentile spread is
    //   preserved. The per-card scaling decision (`isActiveCohortMember`
    //   below at line ~568) is UNCHANGED — strict-cohort members still
    //   get full [0..100] scaling; non-members still get the [0..50]
    //   dampened band. Only the percentile-reference pool widens when
    //   it would otherwise be empty.
    const strictCohort = out.filter(isActiveCohortMember);
    const cohortPool = (strictCohort.length >= 4
      ? strictCohort
      : out.filter(o => o.regime !== "EXHAUSTED" && o.vol !== "LOW VOL")
    ).map(o => o.conf);
    const fullPool   = out.map(o => o.conf);
    for (const o of out) {
      // Pass C4 — non-qualifying opps no longer get a hard rank=0.
      // Hard-zero combined with rank weight 0.18 was shaving ~18 pts
      // off ~13 of 15 cards on a typical tick, dragging the entire
      // distribution into the 20-40 band and making C3 invisible.
      // Instead, non-qualifying opps get their percentile vs the FULL
      // pool, dampened to a [0..50] band — they retain differentiation
      // (so weak setups still rank below merely-mediocre ones) but
      // cannot reach the top of the cohort. Qualifying opps still
      // rank against the clean institutional cohort, scaled [0..100].
      const pct = isActiveCohortMember(o)
        ? percentileRank(o.conf, cohortPool)
        : percentileRank(o.conf, fullPool) * 0.5;
      const rr  = computeRRRatio(o.entry, o.stop, o.target);
      // Re-derive trend/liquidity/regime per card via a synthetic
      // SymBreakdown lookup. The breakdown source is the raw payload
      // from data.symbolBreakdowns; hero-preview cards don't have one,
      // so we honor whatever values were stamped on them above.
      const rawB = data.symbolBreakdowns?.[o.pair];
      if (rawB) {
        const result = computeConviction({
          rawConfidence:  o.conf,
          rankPercentile: pct,
          mtfAgreed:      rawB.mtfConfirmed,
          rrRatio:        rr,
          trendStrength:  trendStrengthFromBreakdown(rawB),
          liquidityScore: liquidityScoreFromBreakdown(rawB),
          regimeScore:    regimeScoreFromBreakdown(rawB),
        });
        o.convictionScore     = result.score;
        o.convictionTier      = result.tier;
        o.convictionBreakdown = result.breakdown;
      } else {
        // Preview / synthetic card — rank still derived from the
        // visible pool but everything else uses the stamped values.
        const result = computeConviction({
          rawConfidence:  o.conf,
          rankPercentile: pct,
          mtfAgreed:      true,
          rrRatio:        rr,
          trendStrength:  100,
          liquidityScore: 100,
          regimeScore:    100,
        });
        o.convictionScore     = result.score;
        o.convictionTier      = result.tier;
        o.convictionBreakdown = result.breakdown;
      }
    }
    return out.sort((a, b) => b.convictionScore - a.convictionScore);
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
