// ── AIMemory ──────────────────────────────────────────────────────────────────
//
// Per-user rolling memory of past signal quality and trade outcomes.
//
// The memory system allows the AI to:
//   - Track which signals led to profitable trades (signal quality score)
//   - Identify which regimes the user's strategy performs best in
//   - Maintain a self-evaluation metric (win rate, average edge)
//   - Detect strategy degradation and flag retraining
//   - Feed into ConfidenceScorer as a quality adjustment
//
// In Phase 2 this will be persisted in PostgreSQL with a time-decay model
// that weights recent performance more heavily than distant history.

export interface TradeMemoryEntry {
  id:               string;
  userId:           string;
  symbol:           string;
  decision:         "BUY" | "SELL";
  rawConfidence:    number;
  adjustedConf:     number;
  regime:           string;
  personality:      string;
  entryPrice:       number;
  exitPrice:        number | null;
  pnlPct:           number | null;    // null if still open
  outcome:          "WIN" | "LOSS" | "BREAKEVEN" | "OPEN";
  holdTimeMs:       number | null;
  createdAt:        number;
  closedAt:         number | null;
}

export interface SignalQualityMetrics {
  userId:           string;
  totalSignals:     number;
  totalTrades:      number;
  winRate:          number;           // 0–1
  avgPnlPct:        number;
  avgHoldTimeMs:    number;
  avgConfidence:    number;
  bestRegime:       string | null;
  worstRegime:      string | null;
  strategyScore:    number;           // 0–100 composite
  isDegrading:      boolean;          // true if recent 10 < overall
  lastUpdated:      number;
}

// ── In-memory store (PostgreSQL in Phase 2) ───────────────────────────────────

class AIMemoryStore {
  private memory = new Map<string, TradeMemoryEntry[]>();

  // ── Write ────────────────────────────────────────────────────────────────

  append(entry: TradeMemoryEntry): void {
    const list = this.memory.get(entry.userId) ?? [];
    list.unshift(entry);
    if (list.length > 500) list.pop();     // rolling 500-entry window per user
    this.memory.set(entry.userId, list);
  }

  closeEntry(
    userId: string,
    entryId: string,
    exitPrice: number,
    closedAt:  number,
  ): void {
    const list = this.memory.get(userId);
    if (!list) return;
    const entry = list.find(e => e.id === entryId);
    if (!entry) return;
    entry.exitPrice = exitPrice;
    entry.closedAt  = closedAt;
    entry.holdTimeMs = closedAt - entry.createdAt;
    if (entry.entryPrice > 0) {
      const pct = ((exitPrice - entry.entryPrice) / entry.entryPrice) * 100;
      entry.pnlPct = parseFloat((entry.decision === "BUY" ? pct : -pct).toFixed(3));
    }
    entry.outcome = !entry.pnlPct
      ? "OPEN"
      : entry.pnlPct > 0.05  ? "WIN"
      : entry.pnlPct < -0.05 ? "LOSS"
      : "BREAKEVEN";
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  getHistory(userId: string, limit = 100): TradeMemoryEntry[] {
    return (this.memory.get(userId) ?? []).slice(0, limit);
  }

  getMetrics(userId: string): SignalQualityMetrics {
    const history = this.memory.get(userId) ?? [];
    const closed  = history.filter(e => e.outcome !== "OPEN");

    const wins       = closed.filter(e => e.outcome === "WIN").length;
    const winRate    = closed.length > 0 ? wins / closed.length : 0;
    const avgPnl     = closed.length > 0
      ? closed.reduce((s, e) => s + (e.pnlPct ?? 0), 0) / closed.length
      : 0;
    const avgHold    = closed.filter(e => e.holdTimeMs).length > 0
      ? closed.reduce((s, e) => s + (e.holdTimeMs ?? 0), 0) / closed.length
      : 0;
    const avgConf    = history.length > 0
      ? history.reduce((s, e) => s + e.adjustedConf, 0) / history.length
      : 0;

    // Best/worst regime by win rate
    const regimeMap: Record<string, { wins: number; total: number }> = {};
    for (const e of closed) {
      if (!regimeMap[e.regime]) regimeMap[e.regime] = { wins: 0, total: 0 };
      regimeMap[e.regime]!.total++;
      if (e.outcome === "WIN") regimeMap[e.regime]!.wins++;
    }
    const regimes = Object.entries(regimeMap).map(([r, s]) => ({ r, wr: s.total > 0 ? s.wins / s.total : 0 }));
    const bestRegime  = regimes.sort((a, b) => b.wr - a.wr)[0]?.r ?? null;
    const worstRegime = regimes.sort((a, b) => a.wr - b.wr)[0]?.r ?? null;

    // Strategy score: composite of win rate, avg pnl, confidence calibration
    const strategyScore = Math.max(0, Math.min(100,
      winRate * 50 +
      Math.min(30, Math.max(0, avgPnl * 10)) +
      (avgConf >= 65 ? 20 : avgConf >= 50 ? 10 : 0)
    ));

    // Degradation: compare recent 10 vs all-time
    const recent10    = closed.slice(0, 10);
    const recentWins  = recent10.filter(e => e.outcome === "WIN").length;
    const recentWR    = recent10.length >= 5 ? recentWins / recent10.length : winRate;
    const isDegrading = recent10.length >= 5 && recentWR < winRate * 0.7;

    return {
      userId, totalSignals: history.length, totalTrades: closed.length,
      winRate: parseFloat(winRate.toFixed(4)),
      avgPnlPct: parseFloat(avgPnl.toFixed(3)),
      avgHoldTimeMs: Math.round(avgHold),
      avgConfidence: parseFloat(avgConf.toFixed(1)),
      bestRegime, worstRegime,
      strategyScore: parseFloat(strategyScore.toFixed(1)),
      isDegrading,
      lastUpdated: Date.now(),
    };
  }

  // Per-signal quality boost based on historical confidence calibration
  getConfidenceAdjustment(userId: string, confidence: number): number {
    const metrics = this.getMetrics(userId);
    if (metrics.totalTrades < 10) return 0;   // not enough data
    // If high-confidence trades are consistently profitable, boost
    if (metrics.winRate > 0.65 && confidence >= 70) return +3;
    // If strategy is degrading, penalise
    if (metrics.isDegrading) return -5;
    return 0;
  }

  evict(userId: string): void {
    this.memory.delete(userId);
  }

  userCount(): number {
    return this.memory.size;
  }
}

export const aiMemory = new AIMemoryStore();
