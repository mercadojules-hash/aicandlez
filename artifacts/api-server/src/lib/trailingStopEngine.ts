import { getAccountSummary, closePosition } from "./simulationEngine.js";

// ── Config ─────────────────────────────────────────────────────────────────────

export interface TrailingStopConfig {
  enabled:           boolean;
  activateAfterPct:  number;   // profit % threshold to arm the stop (default 1.5)
  trailDistancePct:  number;   // how far below the high watermark the stop sits (default 1.5)
}

let config: TrailingStopConfig = {
  enabled:           true,
  activateAfterPct:  1.5,
  trailDistancePct:  1.5,
};

export function getTrailingStopConfig(): TrailingStopConfig { return { ...config }; }

export function updateTrailingStopConfig(patch: Partial<TrailingStopConfig>): TrailingStopConfig {
  config = { ...config, ...patch };
  return { ...config };
}

// ── Internal state per position ───────────────────────────────────────────────

interface StopState {
  positionId:    string;
  symbol:        string;
  entryPrice:    number;
  highWatermark: number;
  stopPrice:     number | null;
  activated:     boolean;
  triggered:     boolean;
  activatedAt:   number | null;
  triggeredAt:   number | null;
}

const states = new Map<string, StopState>();

// ── Public types ──────────────────────────────────────────────────────────────

const NAMES: Record<string, string> = { BTCUSD: "BTC", ETHUSD: "ETH", SOLUSD: "SOL" };

export type StopStatus = "NOT_ACTIVATED" | "ACTIVE" | "TRIGGERED";

export interface TrailingStopView {
  positionId:       string;
  symbol:           string;
  displayName:      string;
  entryPrice:       number;
  currentPrice:     number;
  highWatermark:    number;
  stopPrice:        number | null;
  distanceToStopPct: number | null;  // % gap between current price and stop
  gainFromEntryPct: number;
  activateAt:       number;           // price at which stop arms
  status:           StopStatus;
  activated:        boolean;
  triggered:        boolean;
  activatedAt:      number | null;
  triggeredAt:      number | null;
  // Authoritative close fill (set only on the tick that triggers + closes the
  // position). Sourced from simulationEngine.closePosition's returned trade so
  // any downstream persistence (EXIT_ENGINE_V2 trades-row close) writes the SAME
  // exit price / realized PnL as the in-memory close, instead of re-deriving from
  // the trailing-check snapshot price.
  closeExitPrice?:      number;
  closeRealizedPnL?:    number;
  closeRealizedPnLPct?: number;
}

export interface StopCheckResult {
  statuses:           TrailingStopView[];
  triggeredCount:     number;
  triggeredSymbols:   string[];
  config:             TrailingStopConfig;
}

// ── Core engine ───────────────────────────────────────────────────────────────

export async function checkTrailingStops(): Promise<StopCheckResult> {
  const summary      = await getAccountSummary();
  const openPositions= summary.positions;

  // Prune states for closed positions
  const openIds = new Set(openPositions.map(p => p.id));
  for (const id of states.keys()) {
    if (!openIds.has(id)) states.delete(id);
  }

  const triggeredSymbols: string[] = [];
  const statuses: TrailingStopView[] = [];

  for (const pos of openPositions) {
    // Init state on first sight
    if (!states.has(pos.id)) {
      states.set(pos.id, {
        positionId:    pos.id,
        symbol:        pos.symbol,
        entryPrice:    pos.entryPrice,
        highWatermark: pos.entryPrice,
        stopPrice:     null,
        activated:     false,
        triggered:     false,
        activatedAt:   null,
        triggeredAt:   null,
      });
    }

    const state       = states.get(pos.id)!;
    const curPrice    = pos.currentPrice ?? pos.entryPrice;
    const gainPct     = ((curPrice - state.entryPrice) / state.entryPrice) * 100;
    const activateAt  = state.entryPrice * (1 + config.activateAfterPct / 100);

    let closeExitPrice:      number | undefined;
    let closeRealizedPnL:    number | undefined;
    let closeRealizedPnLPct: number | undefined;

    if (!state.triggered) {
      // Update high watermark
      if (curPrice > state.highWatermark) state.highWatermark = curPrice;

      // Arm stop once profit threshold reached
      if (!state.activated && config.enabled && gainPct >= config.activateAfterPct) {
        state.activated  = true;
        state.activatedAt= Date.now();
      }

      // Update stop price (trail below high watermark)
      if (state.activated) {
        state.stopPrice = state.highWatermark * (1 - config.trailDistancePct / 100);
      }

      // Trigger if current price breaches stop
      if (state.activated && state.stopPrice !== null && curPrice <= state.stopPrice) {
        state.triggered   = true;
        state.triggeredAt = Date.now();
        triggeredSymbols.push(NAMES[pos.symbol] ?? pos.symbol);
        // Auto-close the position via simulation engine. Capture the authoritative
        // fill (exit price + realized PnL) so downstream persistence writes the
        // same numbers as the in-memory close instead of re-deriving them.
        const closeRes = await closePosition(pos.id).catch(() => null);
        if (closeRes?.success && closeRes.trade) {
          closeExitPrice      = closeRes.trade.exitPrice;
          closeRealizedPnL    = closeRes.trade.realizedPnL;
          closeRealizedPnLPct = closeRes.trade.realizedPnLPct;
        }
      }
    }

    const distToStop = state.stopPrice !== null
      ? ((curPrice - state.stopPrice) / curPrice) * 100
      : null;

    const statusStr: StopStatus =
      state.triggered ? "TRIGGERED" :
      state.activated  ? "ACTIVE"    : "NOT_ACTIVATED";

    statuses.push({
      positionId:        state.positionId,
      symbol:            state.symbol,
      displayName:       NAMES[pos.symbol] ?? pos.symbol,
      entryPrice:        parseFloat(state.entryPrice.toFixed(2)),
      currentPrice:      parseFloat(curPrice.toFixed(2)),
      highWatermark:     parseFloat(state.highWatermark.toFixed(2)),
      stopPrice:         state.stopPrice !== null ? parseFloat(state.stopPrice.toFixed(2)) : null,
      distanceToStopPct: distToStop !== null ? parseFloat(distToStop.toFixed(3)) : null,
      gainFromEntryPct:  parseFloat(gainPct.toFixed(3)),
      activateAt:        parseFloat(activateAt.toFixed(2)),
      status:            statusStr,
      activated:         state.activated,
      triggered:         state.triggered,
      activatedAt:       state.activatedAt,
      triggeredAt:       state.triggeredAt,
      closeExitPrice,
      closeRealizedPnL,
      closeRealizedPnLPct,
    });
  }

  return {
    statuses,
    triggeredCount:   triggeredSymbols.length,
    triggeredSymbols,
    config,
  };
}
