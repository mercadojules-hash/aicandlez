import { logger } from "../../lib/logger.js";

// ── DrawdownProtection ────────────────────────────────────────────────────────
//
// Real-time drawdown monitoring with automatic protective actions.
//
// Protection levels:
//   GREEN   (< 2% loss)   — normal operation
//   YELLOW  (2%–4% loss)  — reduce position sizes by 50%, warn
//   ORANGE  (4%–6% loss)  — reduce by 75%, block new positions
//   RED     (> 6% loss)   — auto kill switch, halt all new orders
//
// Operates at both user level and global platform level.
// Each user's drawdown is calculated from their session starting balance.
//
// Peak tracking:
//   Uses a rolling high-water mark so drawdown measures the drop from
//   the most recent equity peak — same as institutional max drawdown.

export type ProtectionLevel = "GREEN" | "YELLOW" | "ORANGE" | "RED";

export interface DrawdownState {
  userId:             string;
  startingBalanceUSD: number;
  currentEquityUSD:   number;
  peakEquityUSD:      number;       // high-water mark
  drawdownUSD:        number;       // from peak (always >= 0)
  drawdownPct:        number;       // from peak as %
  sessionPnLUSD:      number;       // vs starting balance (can be +/-)
  sessionPnLPct:      number;
  level:              ProtectionLevel;
  positionSizeMultiplier: number;   // 0–1 — apply to every new trade
  newPositionsBlocked:  boolean;
  killTriggered:        boolean;
  alerts:             string[];
  lastUpdated:        number;
}

export const LEVEL_THRESHOLDS = {
  GREEN:  { maxDrawdownPct: 2.0,  sizeMultiplier: 1.0,  blockNew: false, autoKill: false },
  YELLOW: { maxDrawdownPct: 4.0,  sizeMultiplier: 0.5,  blockNew: false, autoKill: false },
  ORANGE: { maxDrawdownPct: 6.0,  sizeMultiplier: 0.25, blockNew: true,  autoKill: false },
  RED:    { maxDrawdownPct: Infinity, sizeMultiplier: 0, blockNew: true,  autoKill: true  },
};

// ── Store ─────────────────────────────────────────────────────────────────────

class DrawdownProtectionStore {
  private states = new Map<string, DrawdownState>();

  // ── Initialise ────────────────────────────────────────────────────────────

  init(userId: string, startingBalance: number): DrawdownState {
    const state: DrawdownState = {
      userId,
      startingBalanceUSD:   startingBalance,
      currentEquityUSD:     startingBalance,
      peakEquityUSD:        startingBalance,
      drawdownUSD:          0,
      drawdownPct:          0,
      sessionPnLUSD:        0,
      sessionPnLPct:        0,
      level:                "GREEN",
      positionSizeMultiplier: 1.0,
      newPositionsBlocked:  false,
      killTriggered:        false,
      alerts:               [],
      lastUpdated:          Date.now(),
    };
    this.states.set(userId, state);
    return state;
  }

  // ── Update equity ─────────────────────────────────────────────────────────

  update(userId: string, currentEquityUSD: number): DrawdownState {
    let state = this.states.get(userId);
    if (!state) state = this.init(userId, currentEquityUSD);

    // Update peak
    if (currentEquityUSD > state.peakEquityUSD) {
      state.peakEquityUSD = currentEquityUSD;
    }

    state.currentEquityUSD = currentEquityUSD;
    state.drawdownUSD      = Math.max(0, state.peakEquityUSD - currentEquityUSD);
    state.drawdownPct      = state.peakEquityUSD > 0
      ? (state.drawdownUSD / state.peakEquityUSD) * 100
      : 0;
    state.sessionPnLUSD  = currentEquityUSD - state.startingBalanceUSD;
    state.sessionPnLPct  = state.startingBalanceUSD > 0
      ? (state.sessionPnLUSD / state.startingBalanceUSD) * 100
      : 0;
    state.lastUpdated = Date.now();

    // Determine level
    const prev = state.level;
    if (state.drawdownPct >= 6) {
      state.level = "RED";
    } else if (state.drawdownPct >= 4) {
      state.level = "ORANGE";
    } else if (state.drawdownPct >= 2) {
      state.level = "YELLOW";
    } else {
      state.level = "GREEN";
    }

    const cfg = LEVEL_THRESHOLDS[state.level];
    state.positionSizeMultiplier = cfg.sizeMultiplier;
    state.newPositionsBlocked    = cfg.blockNew;

    // Auto-kill on RED (only triggers once)
    if (state.level === "RED" && !state.killTriggered) {
      state.killTriggered = true;
      const msg = `AUTO KILL triggered — drawdown ${state.drawdownPct.toFixed(2)}% from peak`;
      state.alerts.unshift(`[${new Date().toISOString()}] ${msg}`);
      logger.error({ userId, drawdownPct: state.drawdownPct.toFixed(2) }, `DrawdownProtection: ${msg}`);
    }

    // Alert on level escalation
    if (state.level !== prev && state.level !== "GREEN") {
      const msg = `Protection level changed: ${prev} → ${state.level} (drawdown ${state.drawdownPct.toFixed(2)}%)`;
      state.alerts.unshift(`[${new Date().toISOString()}] ${msg}`);
      if (state.alerts.length > 50) state.alerts.pop();
      logger.warn({ userId, prev, next: state.level, drawdownPct: state.drawdownPct.toFixed(2) },
        `DrawdownProtection: ${msg}`);
    }

    this.states.set(userId, state);
    return state;
  }

  // ── Reset peak (e.g. end of session, new capital deposit) ─────────────────

  resetPeak(userId: string): void {
    const state = this.states.get(userId);
    if (state) {
      state.peakEquityUSD = state.currentEquityUSD;
      state.killTriggered = false;
      state.level         = "GREEN";
      state.positionSizeMultiplier = 1.0;
      state.newPositionsBlocked   = false;
    }
  }

  get(userId: string): DrawdownState | undefined {
    return this.states.get(userId);
  }

  all(): DrawdownState[] {
    return [...this.states.values()];
  }

  // Platform-wide stats
  platformSummary(): {
    totalUsers: number;
    usersInRed: number;
    usersInOrange: number;
    usersInYellow: number;
    avgDrawdownPct: number;
  } {
    const all = this.all();
    return {
      totalUsers:    all.length,
      usersInRed:    all.filter(s => s.level === "RED").length,
      usersInOrange: all.filter(s => s.level === "ORANGE").length,
      usersInYellow: all.filter(s => s.level === "YELLOW").length,
      avgDrawdownPct: all.length
        ? parseFloat((all.reduce((s, d) => s + d.drawdownPct, 0) / all.length).toFixed(2))
        : 0,
    };
  }
}

export const drawdownProtection = new DrawdownProtectionStore();
