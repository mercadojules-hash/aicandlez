import { getCandles } from "./marketData.js";
import { runAnalysis } from "./indicators.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface JournalIndicators {
  emaFast:  number;
  emaSlow:  number;
  rsi:      number;
  trend:    "BULLISH" | "BEARISH" | "NEUTRAL";
}

export interface ScoreBreakdown {
  base:       number;
  profitable: number;
  rrRatio:    number;
  patience:   number;
  sizing:     number;
  trend:      number;
}

export type CloseReason = "MANUAL" | "TRAILING_STOP" | "RISK_KILL" | "AUTO";

export interface JournalEntry {
  id:               string;
  symbol:           string;
  displayName:      string;
  side:             "BUY" | "SELL";
  entryPrice:       number;
  exitPrice:        number;
  entryTime:        number;
  exitTime:         number;
  sizeUSD:          number;
  realizedPnL:      number;
  realizedPnLPct:   number;
  durationMs:       number;
  indicatorsAtEntry: JournalIndicators;
  reasoning:        string;
  closeReason:      CloseReason;
  score:            number;
  scoreBreakdown:   ScoreBreakdown;
  notes:            string;
  tags:             string[];
}

export interface FeedbackSummary {
  totalTrades:   number;
  wins:          number;
  losses:        number;
  winRate:       number;
  avgScore:      number;
  totalPnL:      number;
  avgHoldHours:  number;
  bestTrade:     JournalEntry | null;
  worstTrade:    JournalEntry | null;
  avgWinPct:     number;
  avgLossPct:    number;
  insights:      string[];
}

// ── Scoring ────────────────────────────────────────────────────────────────────

function scoreEntry(
  pnlPct:        number,
  durationMs:    number,
  sizeUSD:       number,
  trend:         "BULLISH" | "BEARISH" | "NEUTRAL",
  side:          "BUY" | "SELL",
): { score: number; breakdown: ScoreBreakdown } {
  const base = 50;

  const profitable = pnlPct > 0 ? 20 : 0;

  let rrRatio = 0;
  if (pnlPct > 3)       rrRatio = 10;
  else if (pnlPct > 1)  rrRatio = 5;
  else if (pnlPct > 0)  rrRatio = 2;
  else                  rrRatio = -5;

  const holdHours = durationMs / 3_600_000;
  let patience = 0;
  if (pnlPct > 0) {
    if (holdHours > 4)       patience = 10;
    else if (holdHours > 1)  patience = 5;
  } else {
    if (holdHours < 0.25)    patience = -10;
    else if (holdHours < 1)  patience = -5;
  }

  let sizing = 0;
  if (sizeUSD <= 2000)       sizing = 5;
  else if (sizeUSD <= 4000)  sizing = 3;

  let trendScore = 0;
  if (trend === "BULLISH" && side === "BUY")   trendScore = 10;
  else if (trend === "BEARISH" && side === "SELL") trendScore = 10;
  else if (trend !== "NEUTRAL")                trendScore = -5;

  const breakdown: ScoreBreakdown = {
    base, profitable, rrRatio, patience, sizing, trend: trendScore,
  };
  const score = Math.max(0, Math.min(100,
    base + profitable + rrRatio + patience + sizing + trendScore
  ));

  return { score, breakdown };
}

// ── Display name ───────────────────────────────────────────────────────────────

function displayName(symbol: string): string {
  return symbol.replace("USD", "");
}

// ── State ──────────────────────────────────────────────────────────────────────

let journal: JournalEntry[] = [];
let idSeq = 0;
function newId() { return `JRN-${Date.now()}-${++idSeq}`; }

// ── Seed historical trades ────────────────────────────────────────────────────

function seedJournal() {
  const now = Date.now();
  const hour = 3_600_000;

  const seedData: Array<{
    symbol: string; side: "BUY"|"SELL"; entryPrice: number; exitPrice: number;
    sizeUSD: number; hoursAgo: number; holdHours: number;
    trend: "BULLISH"|"BEARISH"|"NEUTRAL"; closeReason: CloseReason;
    reasoning: string; notes: string; tags: string[];
  }> = [
    {
      symbol: "BTCUSD", side: "BUY", entryPrice: 74200, exitPrice: 76850,
      sizeUSD: 3000, hoursAgo: 72, holdHours: 5.2,
      trend: "BULLISH", closeReason: "MANUAL",
      reasoning: "EMA crossover confirmed with RSI breakout above 65. Strong bullish structure on 1h chart.",
      notes: "Clean setup — held position through minor pullback at $75k.",
      tags: ["EMA-CROSS", "RSI-BREAKOUT", "WINNER"],
    },
    {
      symbol: "ETHUSD", side: "BUY", entryPrice: 2180, exitPrice: 2095,
      sizeUSD: 2500, hoursAgo: 60, holdHours: 0.4,
      trend: "BEARISH", closeReason: "RISK_KILL",
      reasoning: "Attempted counter-trend buy at support. RSI was oversold.",
      notes: "Exited too early due to kill switch. Counter-trend trade — lesson learned.",
      tags: ["COUNTER-TREND", "SUPPORT", "LOSER"],
    },
    {
      symbol: "SOLUSD", side: "BUY", entryPrice: 128.5, exitPrice: 135.2,
      sizeUSD: 1800, hoursAgo: 48, holdHours: 3.1,
      trend: "BULLISH", closeReason: "TRAILING_STOP",
      reasoning: "SOL momentum trade following BTC breakout. RSI 68, EMA aligned.",
      notes: "Trailing stop caught the top — excellent exit timing.",
      tags: ["MOMENTUM", "TRAILING-STOP", "WINNER"],
    },
    {
      symbol: "BTCUSD", side: "BUY", entryPrice: 75100, exitPrice: 77340,
      sizeUSD: 4000, hoursAgo: 36, holdHours: 8.4,
      trend: "BULLISH", closeReason: "MANUAL",
      reasoning: "Held through consolidation zone. EMA fast > EMA slow confirmed on 1h. RSI 62.",
      notes: "Patience paid off — nearly exited at $76k but held for the continuation.",
      tags: ["EMA-CROSS", "PATIENCE", "WINNER"],
    },
    {
      symbol: "ETHUSD", side: "BUY", entryPrice: 2260, exitPrice: 2198,
      sizeUSD: 2000, hoursAgo: 24, holdHours: 1.8,
      trend: "NEUTRAL", closeReason: "MANUAL",
      reasoning: "Entered on neutral signal — RSI 55, no clear trend. Speculative.",
      notes: "Neutral trend entry with no confirmation. Should have waited for clearer signal.",
      tags: ["NO-SIGNAL", "LOSER"],
    },
    {
      symbol: "SOLUSD", side: "BUY", entryPrice: 131.0, exitPrice: 138.6,
      sizeUSD: 1500, hoursAgo: 12, holdHours: 6.5,
      trend: "BULLISH", closeReason: "MANUAL",
      reasoning: "SOL trend continuation — RSI held above 60, EMA spread widening.",
      notes: "Good discipline — sized conservatively and let winner run.",
      tags: ["TREND-FOLLOW", "WINNER"],
    },
  ];

  for (const d of seedData) {
    const entryTime = now - d.hoursAgo * hour;
    const exitTime  = entryTime + d.holdHours * hour;
    const quantity  = parseFloat((d.sizeUSD / d.entryPrice).toFixed(8));
    const realizedPnL    = parseFloat(((d.exitPrice - d.entryPrice) * quantity).toFixed(2));
    const realizedPnLPct = parseFloat(((realizedPnL / d.sizeUSD) * 100).toFixed(3));
    const durationMs = d.holdHours * hour;

    const { score, breakdown } = scoreEntry(realizedPnLPct, durationMs, d.sizeUSD, d.trend, d.side);

    const entry: JournalEntry = {
      id:             newId(),
      symbol:         d.symbol,
      displayName:    displayName(d.symbol),
      side:           d.side,
      entryPrice:     d.entryPrice,
      exitPrice:      d.exitPrice,
      entryTime,
      exitTime,
      sizeUSD:        d.sizeUSD,
      realizedPnL,
      realizedPnLPct,
      durationMs,
      indicatorsAtEntry: {
        emaFast: d.trend === "BULLISH" ? d.entryPrice * 0.998 : d.entryPrice * 1.002,
        emaSlow: d.trend === "BULLISH" ? d.entryPrice * 0.992 : d.entryPrice * 1.008,
        rsi:     d.trend === "BULLISH" ? 64 : d.trend === "BEARISH" ? 38 : 52,
        trend:   d.trend,
      },
      reasoning:   d.reasoning,
      closeReason: d.closeReason,
      score,
      scoreBreakdown: breakdown,
      notes: d.notes,
      tags:  d.tags,
    };

    journal.unshift(entry);
  }

  journal.sort((a, b) => b.exitTime - a.exitTime);
}

seedJournal();

// ── Public API ────────────────────────────────────────────────────────────────

export function getJournal(): JournalEntry[] {
  return [...journal];
}

export async function addJournalEntry(params: {
  symbol:      string;
  displayName: string;
  side:        "BUY" | "SELL";
  entryPrice:  number;
  exitPrice:   number;
  entryTime:   number;
  exitTime:    number;
  sizeUSD:     number;
  realizedPnL: number;
  realizedPnLPct: number;
  durationMs:  number;
  closeReason: CloseReason;
  reasoning?:  string;
  notes?:      string;
  tags?:       string[];
}): Promise<JournalEntry> {
  let trend: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let emaFast = params.entryPrice, emaSlow = params.entryPrice, rsi = 50;
  try {
    const candles = await getCandles(params.symbol, "1h", 50);
    const analysis = runAnalysis(params.symbol, "1h", candles);
    trend   = analysis.indicators.trend.direction.toUpperCase() as "BULLISH" | "BEARISH" | "NEUTRAL";
    emaFast = analysis.indicators.ema.short;
    emaSlow = analysis.indicators.ema.long;
    rsi     = analysis.indicators.rsi.value;
  } catch { /* keep defaults */ }

  const { score, breakdown } = scoreEntry(
    params.realizedPnLPct, params.durationMs, params.sizeUSD, trend, params.side,
  );

  const entry: JournalEntry = {
    id:           newId(),
    symbol:       params.symbol,
    displayName:  params.displayName,
    side:         params.side,
    entryPrice:   params.entryPrice,
    exitPrice:    params.exitPrice,
    entryTime:    params.entryTime,
    exitTime:     params.exitTime,
    sizeUSD:      params.sizeUSD,
    realizedPnL:  params.realizedPnL,
    realizedPnLPct: params.realizedPnLPct,
    durationMs:   params.durationMs,
    indicatorsAtEntry: { emaFast, emaSlow, rsi, trend },
    reasoning:    params.reasoning ?? "No reasoning captured.",
    closeReason:  params.closeReason,
    score,
    scoreBreakdown: breakdown,
    notes:        params.notes ?? "",
    tags:         params.tags ?? [],
  };

  journal.unshift(entry);
  return entry;
}

export function updateJournalNotes(id: string, notes: string): boolean {
  const entry = journal.find(e => e.id === id);
  if (!entry) return false;
  entry.notes = notes;
  return true;
}

export function deleteJournalEntry(id: string): boolean {
  const idx = journal.findIndex(e => e.id === id);
  if (idx === -1) return false;
  journal.splice(idx, 1);
  return true;
}

export function getFeedbackSummary(): FeedbackSummary {
  const total = journal.length;
  if (total === 0) {
    return {
      totalTrades: 0, wins: 0, losses: 0, winRate: 0, avgScore: 0,
      totalPnL: 0, avgHoldHours: 0, bestTrade: null, worstTrade: null,
      avgWinPct: 0, avgLossPct: 0, insights: ["No trades logged yet."],
    };
  }

  const wins   = journal.filter(e => e.realizedPnL > 0);
  const losses = journal.filter(e => e.realizedPnL <= 0);

  const winRate     = parseFloat(((wins.length / total) * 100).toFixed(1));
  const avgScore    = parseFloat((journal.reduce((s, e) => s + e.score, 0) / total).toFixed(1));
  const totalPnL    = parseFloat(journal.reduce((s, e) => s + e.realizedPnL, 0).toFixed(2));
  const avgHoldHours = parseFloat((journal.reduce((s, e) => s + e.durationMs, 0) / total / 3_600_000).toFixed(2));
  const avgWinPct   = wins.length > 0
    ? parseFloat((wins.reduce((s, e) => s + e.realizedPnLPct, 0) / wins.length).toFixed(2)) : 0;
  const avgLossPct  = losses.length > 0
    ? parseFloat((losses.reduce((s, e) => s + e.realizedPnLPct, 0) / losses.length).toFixed(2)) : 0;

  const sorted     = [...journal].sort((a, b) => b.realizedPnL - a.realizedPnL);
  const bestTrade  = sorted[0] ?? null;
  const worstTrade = sorted[sorted.length - 1] ?? null;

  const insights: string[] = [];

  if (winRate >= 60)
    insights.push(`Strong win rate of ${winRate}% — strategy is working well.`);
  else if (winRate < 40)
    insights.push(`Win rate is ${winRate}% — review entry criteria for stronger confirmation signals.`);

  const trailStopWins = wins.filter(e => e.closeReason === "TRAILING_STOP");
  if (trailStopWins.length > 0)
    insights.push(`Trailing stops captured ${trailStopWins.length} winning exit${trailStopWins.length > 1 ? "s" : ""} — keep them enabled.`);

  const counterTrend = journal.filter(e =>
    (e.indicatorsAtEntry.trend === "BEARISH" && e.side === "BUY") ||
    (e.indicatorsAtEntry.trend === "BULLISH" && e.side === "SELL")
  );
  if (counterTrend.length > 0) {
    const ctWins = counterTrend.filter(e => e.realizedPnL > 0).length;
    insights.push(`Counter-trend trades: ${ctWins}/${counterTrend.length} wins — avoid trading against the trend.`);
  }

  const quickLosses = losses.filter(e => e.durationMs < 0.25 * 3_600_000);
  if (quickLosses.length > 0)
    insights.push(`${quickLosses.length} loss${quickLosses.length > 1 ? "es" : ""} closed in <15 min — consider wider stops.`);

  const avgWinHold = wins.length > 0
    ? wins.reduce((s, e) => s + e.durationMs, 0) / wins.length / 3_600_000 : 0;
  if (avgWinHold > 2)
    insights.push(`Winning trades average ${avgWinHold.toFixed(1)}h hold — patience pays off.`);

  if (avgScore >= 70)
    insights.push(`Excellent average trade score of ${avgScore}/100 — disciplined execution.`);
  else if (avgScore < 50)
    insights.push(`Average score ${avgScore}/100 — focus on trend-aligned, well-sized entries.`);

  return {
    totalTrades: total, wins: wins.length, losses: losses.length,
    winRate, avgScore, totalPnL, avgHoldHours,
    bestTrade, worstTrade, avgWinPct, avgLossPct,
    insights,
  };
}
