import {
  emaArray, rsiArray, simulateOnCandles,
  DEFAULT_PARAMS, type StrategyParams, type SimResult,
} from "./backtestEngine.js";
import { getCandles, type Candle } from "./marketData.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WindowResult {
  windowIndex:   number;
  label:         string;
  candleCount:   number;
  tradeCount:    number;
  winRate:       number;
  totalReturn:   number;     // %
  sharpe:        number;
  maxDrawdown:   number;
  passed:        boolean;
}

export interface OOSResult {
  inSampleReturn:   number;
  outOfSampleReturn: number;
  inSampleWinRate:  number;
  outOfSampleWinRate: number;
  inSampleTrades:   number;
  outOfSampleTrades: number;
  ratio:            number;    // OOS / IS — higher is better
}

export interface OverfitResult {
  score:       number;   // 0–100: lower = more overfit
  grade:       "A" | "B" | "C" | "F";
  degradation: number;   // % drop from IS to OOS
  verdict:     string;
}

export type ValidationGrade = "PASS" | "WARN" | "FAIL";

export interface ValidationResult {
  runAt:        number;
  symbol:       string;
  timeframe:    string;
  totalCandles: number;
  params:       StrategyParams;

  windows:      WindowResult[];
  oos:          OOSResult;
  overfit:      OverfitResult;

  grade:        ValidationGrade;
  gradeScore:   number;    // 0–100
  reasons:      string[];
  liveLocked:   boolean;
}

// ── Live-lock state ────────────────────────────────────────────────────────────

let liveLocked      = false;
let lockReason      = "";
let lastValidation: ValidationResult | null = null;
let running         = false;

export function isLiveLocked(): boolean  { return liveLocked; }
export function getLockReason(): string  { return lockReason; }
export function isValidating(): boolean  { return running;    }

export function getLastValidation(): ValidationResult | null {
  return lastValidation;
}

export function manualOverrideLock(lock: boolean, reason = "Manual override") {
  liveLocked = lock;
  lockReason = lock ? reason : "";
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function closes(candles: Candle[]): number[] {
  return candles.map(c => c.close);
}

function runOnSlice(candles: Candle[], params: StrategyParams, capital = 10_000): SimResult {
  return simulateOnCandles(candles, closes(candles), params, capital);
}

function computeOverfit(isReturn: number, oosReturn: number): OverfitResult {
  // Degradation: how much IS outperforms OOS (0 = no degradation, 1 = total collapse)
  const degradation = isReturn <= 0
    ? (oosReturn >= 0 ? 0 : 50)
    : Math.max(0, (isReturn - oosReturn) / Math.abs(isReturn)) * 100;

  const score = Math.max(0, Math.min(100, 100 - degradation));

  let grade: "A" | "B" | "C" | "F";
  let verdict: string;
  if (score >= 80) {
    grade = "A"; verdict = "Low overfitting — strategy generalizes well.";
  } else if (score >= 60) {
    grade = "B"; verdict = "Moderate overfitting — acceptable performance decay.";
  } else if (score >= 40) {
    grade = "C"; verdict = "High overfitting risk — significant degradation to OOS.";
  } else {
    grade = "F"; verdict = "Severe overfitting — strategy does not generalize.";
  }

  return {
    score:       parseFloat(score.toFixed(1)),
    grade,
    degradation: parseFloat(degradation.toFixed(1)),
    verdict,
  };
}

function windowLabel(idx: number, total: number, candles: Candle[]): string {
  const start = new Date(candles[0]!.time * 1000);
  const end   = new Date(candles[candles.length - 1]!.time * 1000);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `W${idx + 1} of ${total} · ${fmt(start)}–${fmt(end)}`;
}

// ── Main validation runner ────────────────────────────────────────────────────

const VALIDATION_SYMBOL    = "BTCUSD";
const VALIDATION_TIMEFRAME = "1h";
const TOTAL_CANDLES        = 300;
const NUM_WINDOWS          = 4;
const OOS_SPLIT            = 0.70;   // 70% in-sample, 30% OOS

export async function runValidation(
  params: StrategyParams = DEFAULT_PARAMS,
): Promise<ValidationResult> {
  if (running) throw new Error("Validation already in progress");
  running = true;

  try {
    const allCandles = await getCandles(VALIDATION_SYMBOL, VALIDATION_TIMEFRAME, TOTAL_CANDLES);
    const n          = allCandles.length;

    // ── Walk-forward windows ──────────────────────────────────────────────────
    const windowSize = Math.floor(n / NUM_WINDOWS);
    const windows: WindowResult[] = [];

    for (let i = 0; i < NUM_WINDOWS; i++) {
      const start  = i * windowSize;
      const end    = i === NUM_WINDOWS - 1 ? n : start + windowSize;
      const slice  = allCandles.slice(start, end);
      const result = runOnSlice(slice, params);
      const m      = result.metrics;

      const passed =
        m.totalTrades >= 1 &&
        m.winRate     >= 30 &&
        m.totalReturn >= -10;

      windows.push({
        windowIndex: i,
        label:       windowLabel(i, NUM_WINDOWS, slice),
        candleCount: slice.length,
        tradeCount:  m.totalTrades,
        winRate:     parseFloat(m.winRate.toFixed(1)),
        totalReturn: parseFloat(m.totalReturn.toFixed(2)),
        sharpe:      m.sharpeRatio,
        maxDrawdown: m.maxDrawdown,
        passed,
      });
    }

    // ── Out-of-sample split ───────────────────────────────────────────────────
    const splitIdx     = Math.floor(n * OOS_SPLIT);
    const inSample     = allCandles.slice(0, splitIdx);
    const outOfSample  = allCandles.slice(splitIdx);

    const isResult     = runOnSlice(inSample,    params);
    const oosResult    = runOnSlice(outOfSample, params);

    const oos: OOSResult = {
      inSampleReturn:      parseFloat(isResult.metrics.totalReturn.toFixed(2)),
      outOfSampleReturn:   parseFloat(oosResult.metrics.totalReturn.toFixed(2)),
      inSampleWinRate:     parseFloat(isResult.metrics.winRate.toFixed(1)),
      outOfSampleWinRate:  parseFloat(oosResult.metrics.winRate.toFixed(1)),
      inSampleTrades:      isResult.metrics.totalTrades,
      outOfSampleTrades:   oosResult.metrics.totalTrades,
      ratio: isResult.metrics.totalReturn === 0
        ? (oosResult.metrics.totalReturn >= 0 ? 1 : 0)
        : parseFloat(Math.max(-2, Math.min(2,
            oosResult.metrics.totalReturn / Math.abs(isResult.metrics.totalReturn)
          )).toFixed(3)),
    };

    // ── Overfitting ───────────────────────────────────────────────────────────
    const overfit = computeOverfit(oos.inSampleReturn, oos.outOfSampleReturn);

    // ── Overall grade ─────────────────────────────────────────────────────────
    const failingWindows = windows.filter(w => !w.passed).length;
    const winRateOk      = oos.outOfSampleWinRate >= 35;
    const noSevereOverfit = overfit.grade !== "F";
    const oosPositive     = oos.outOfSampleReturn >= -5;
    const oosRatioOk      = oos.ratio >= 0.3;

    const reasons: string[] = [];

    let gradeScore = 60;
    gradeScore += Math.min(20, (NUM_WINDOWS - failingWindows) * 5);
    gradeScore += winRateOk    ? 10 : -10;
    gradeScore += oosPositive  ? 10 : -10;
    gradeScore += oosRatioOk   ? 10 : -15;
    gradeScore += overfit.score * 0.15;
    gradeScore  = Math.max(0, Math.min(100, gradeScore));

    // Hard caps: severe overfit or negative OOS/IS ratio cannot PASS
    if (overfit.grade === "F")  gradeScore = Math.min(gradeScore, 44);
    if (oos.ratio < 0)          gradeScore = Math.min(gradeScore, 49);
    if (failingWindows >= 3)    gradeScore = Math.min(gradeScore, 44);

    let grade: ValidationGrade;
    if (gradeScore >= 70) {
      grade = "PASS";
      reasons.push(`OOS return ${oos.outOfSampleReturn >= 0 ? "+" : ""}${oos.outOfSampleReturn}% with ratio ${oos.ratio.toFixed(2)} — strategy generalizes.`);
    } else if (gradeScore >= 45) {
      grade = "WARN";
      reasons.push(`Marginal performance (score ${Math.round(gradeScore)}/100) — monitor closely before going live.`);
    } else {
      grade = "FAIL";
      reasons.push(`Strategy failed validation (score ${Math.round(gradeScore)}/100) — live trading is locked.`);
    }

    if (failingWindows > 0)
      reasons.push(`${failingWindows} of ${NUM_WINDOWS} walk-forward windows failed quality check.`);
    if (!winRateOk)
      reasons.push(`OOS win rate ${oos.outOfSampleWinRate}% is below the 35% threshold.`);
    if (!oosRatioOk)
      reasons.push(`OOS/IS ratio ${oos.ratio.toFixed(2)} — significant performance decay detected.`);
    if (overfit.grade === "F" || overfit.grade === "C")
      reasons.push(overfit.verdict);
    if (grade === "PASS" && failingWindows === 0)
      reasons.push(`${windows.filter(w => w.passed).length}/${NUM_WINDOWS} walk-forward windows passed.`);

    // ── Update live lock ──────────────────────────────────────────────────────
    liveLocked  = grade === "FAIL";
    lockReason  = grade === "FAIL"
      ? `Validation failed (score ${Math.round(gradeScore)}/100). ${reasons[0] ?? ""}`
      : "";

    const result: ValidationResult = {
      runAt:        Date.now(),
      symbol:       VALIDATION_SYMBOL,
      timeframe:    VALIDATION_TIMEFRAME,
      totalCandles: n,
      params,
      windows,
      oos,
      overfit,
      grade,
      gradeScore:   parseFloat(gradeScore.toFixed(1)),
      reasons,
      liveLocked,
    };

    lastValidation = result;
    return result;

  } finally {
    running = false;
  }
}
