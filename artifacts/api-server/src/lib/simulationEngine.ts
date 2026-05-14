import { getTicker, SUPPORTED_SYMBOLS } from "./marketData.js";

// Short-form aliases → canonical symbol
const SYMBOL_ALIASES: Record<string, string> = {
  BTC: "BTCUSD", ETH: "ETHUSD", SOL: "SOLUSD",
};
function normalizeSymbol(sym: string): string {
  return SYMBOL_ALIASES[sym.toUpperCase()] ?? sym.toUpperCase();
}
import { validateTrade } from "./riskEngine.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SimPosition {
  id:          string;
  symbol:      string;
  side:        "BUY" | "SELL";
  quantity:    number;       // units of crypto
  entryPrice:  number;       // USD per unit
  entryTime:   number;       // unix ms
  sizeUSD:     number;       // cash committed (always positive)
  // Computed live:
  currentPrice?:     number;
  unrealizedPnL?:    number;
  unrealizedPnLPct?: number;
  marketValue?:      number;
}

export interface SimTrade {
  id:               string;
  symbol:           string;
  side:             "BUY" | "SELL";
  quantity:         number;
  entryPrice:       number;
  exitPrice:        number;
  entryTime:        number;
  exitTime:         number;
  sizeUSD:          number;
  realizedPnL:      number;
  realizedPnLPct:   number;
  durationMs:       number;
}

interface SimAccount {
  startingBalance: number;
  cashBalance:     number;
  totalRealized:   number;
  totalTrades:     number;
}

// ── State ─────────────────────────────────────────────────────────────────────

const STARTING_BALANCE = 100_000;

let account: SimAccount = {
  startingBalance: STARTING_BALANCE,
  cashBalance:     STARTING_BALANCE,
  totalRealized:   0,
  totalTrades:     0,
};

let positions: SimPosition[] = [];
let tradeHistory: SimTrade[] = [];

let idSeq = 0;
function newId() { return `SIM-${Date.now()}-${++idSeq}`; }

// ── Live enrichment ───────────────────────────────────────────────────────────

async function enrichPositions(): Promise<SimPosition[]> {
  return Promise.all(
    positions.map(async (pos) => {
      try {
        const ticker = await getTicker(pos.symbol);
        const currentPrice = ticker.price;
        const unrealizedPnL =
          pos.side === "BUY"
            ? (currentPrice - pos.entryPrice) * pos.quantity
            : (pos.entryPrice - currentPrice) * pos.quantity;
        const marketValue = pos.side === "BUY"
          ? pos.quantity * currentPrice
          : pos.sizeUSD - unrealizedPnL;          // short position value
        const unrealizedPnLPct = (unrealizedPnL / pos.sizeUSD) * 100;
        return { ...pos, currentPrice, unrealizedPnL, unrealizedPnLPct, marketValue };
      } catch {
        return { ...pos };
      }
    })
  );
}

// ── Account summary ───────────────────────────────────────────────────────────

export function clearAllPositions(): number {
  const count = positions.length;
  positions = [];
  account.cashBalance = account.startingBalance;
  return count;
}

export async function getAccountSummary() {
  const enriched = await enrichPositions();
  const unrealizedTotal = enriched.reduce((sum, p) => sum + (p.unrealizedPnL ?? 0), 0);
  const positionValue   = enriched.reduce((sum, p) => sum + (p.marketValue ?? p.sizeUSD), 0);
  const equity          = account.cashBalance + positionValue;
  const totalPnL        = equity - account.startingBalance;
  const totalPnLPct     = (totalPnL / account.startingBalance) * 100;

  return {
    account: { ...account },
    equity:           parseFloat(equity.toFixed(2)),
    totalPnL:         parseFloat(totalPnL.toFixed(2)),
    totalPnLPct:      parseFloat(totalPnLPct.toFixed(4)),
    unrealizedPnL:    parseFloat(unrealizedTotal.toFixed(2)),
    positionCount:    positions.length,
    positions:        enriched.map(p => ({
      ...p,
      unrealizedPnL:    p.unrealizedPnL    != null ? parseFloat(p.unrealizedPnL.toFixed(2))    : undefined,
      unrealizedPnLPct: p.unrealizedPnLPct != null ? parseFloat(p.unrealizedPnLPct.toFixed(3)) : undefined,
      marketValue:      p.marketValue      != null ? parseFloat(p.marketValue.toFixed(2))      : undefined,
    })),
  };
}

// ── Place order ───────────────────────────────────────────────────────────────

export interface OrderRequest {
  symbol: string;
  side:   "BUY" | "SELL";
  sizeUSD: number;
}

export interface OrderResult {
  success:    boolean;
  position?:  SimPosition;
  error?:     string;
  violations?: string[];
}

export async function placeOrder(req: OrderRequest): Promise<OrderResult> {
  const symbol = normalizeSymbol(req.symbol);
  const { side, sizeUSD } = req;

  // Guard: symbol
  if (!SUPPORTED_SYMBOLS.includes(symbol)) {
    return { success: false, error: `Unsupported symbol: ${symbol}. Supported: ${SUPPORTED_SYMBOLS.join(", ")}` };
  }
  // Guard: size
  if (sizeUSD <= 0) {
    return { success: false, error: "sizeUSD must be positive" };
  }
  // Guard: cash available
  if (sizeUSD > account.cashBalance) {
    return { success: false, error: `Insufficient balance: have $${account.cashBalance.toFixed(2)}, need $${sizeUSD.toFixed(2)}` };
  }
  // Guard: risk engine validation
  const validation = validateTrade(sizeUSD);
  if (!validation.allowed) {
    return { success: false, error: "Risk engine blocked this trade", violations: validation.violations };
  }

  // Fetch live price
  let entryPrice: number;
  try {
    const ticker = await getTicker(symbol);
    entryPrice = ticker.price;
  } catch (e) {
    return { success: false, error: `Failed to fetch price for ${symbol}: ${e instanceof Error ? e.message : String(e)}` };
  }

  const quantity = sizeUSD / entryPrice;

  const position: SimPosition = {
    id:         newId(),
    symbol,
    side,
    quantity:   parseFloat(quantity.toFixed(8)),
    entryPrice: parseFloat(entryPrice.toFixed(2)),
    entryTime:  Date.now(),
    sizeUSD:    parseFloat(sizeUSD.toFixed(2)),
  };

  // Deduct from balance
  account.cashBalance -= sizeUSD;
  positions.push(position);

  return { success: true, position };
}

// ── Close position ────────────────────────────────────────────────────────────

export interface CloseResult {
  success: boolean;
  trade?:  SimTrade;
  error?:  string;
}

export async function closePosition(positionId: string): Promise<CloseResult> {
  const idx = positions.findIndex(p => p.id === positionId);
  if (idx === -1) {
    return { success: false, error: `Position ${positionId} not found` };
  }

  const pos = positions[idx]!;

  // Fetch live exit price
  let exitPrice: number;
  try {
    const ticker = await getTicker(pos.symbol);
    exitPrice = ticker.price;
  } catch (e) {
    return { success: false, error: `Failed to fetch price: ${e instanceof Error ? e.message : String(e)}` };
  }

  const realizedPnL =
    pos.side === "BUY"
      ? (exitPrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - exitPrice) * pos.quantity;

  const realizedPnLPct = (realizedPnL / pos.sizeUSD) * 100;
  const exitTime       = Date.now();

  const trade: SimTrade = {
    id:             newId(),
    symbol:         pos.symbol,
    side:           pos.side,
    quantity:       pos.quantity,
    entryPrice:     pos.entryPrice,
    exitPrice:      parseFloat(exitPrice.toFixed(2)),
    entryTime:      pos.entryTime,
    exitTime,
    sizeUSD:        pos.sizeUSD,
    realizedPnL:    parseFloat(realizedPnL.toFixed(2)),
    realizedPnLPct: parseFloat(realizedPnLPct.toFixed(3)),
    durationMs:     exitTime - pos.entryTime,
  };

  // Return capital + P&L to balance
  account.cashBalance  += pos.sizeUSD + realizedPnL;
  account.totalRealized += realizedPnL;
  account.totalTrades  += 1;

  positions.splice(idx, 1);
  tradeHistory.unshift(trade);   // newest first

  return { success: true, trade };
}

// ── Trade history ─────────────────────────────────────────────────────────────

export function getTradeHistory(): SimTrade[] {
  return [...tradeHistory];
}

// ── Reset ─────────────────────────────────────────────────────────────────────

export function resetSimulation() {
  account = {
    startingBalance: STARTING_BALANCE,
    cashBalance:     STARTING_BALANCE,
    totalRealized:   0,
    totalTrades:     0,
  };
  positions     = [];
  tradeHistory  = [];
}
