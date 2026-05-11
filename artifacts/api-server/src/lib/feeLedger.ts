const PLATFORM_FEE_RATE = 0.03;

export interface FeeEntry {
  id:             string;
  tradeId:        string;
  symbol:         string;
  side:           string;
  tradeAmountUSD: number;
  feeUSD:         number;
  timestamp:      number;
}

const _entries: FeeEntry[] = [];
let   _totalCollected = 0;

export function recordFee(params: {
  tradeId:   string;
  symbol:    string;
  side:      string;
  amountUSD: number;
}): FeeEntry {
  const feeUSD = parseFloat((params.amountUSD * PLATFORM_FEE_RATE).toFixed(4));
  const entry: FeeEntry = {
    id:             `FEE-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    tradeId:        params.tradeId,
    symbol:         params.symbol,
    side:           params.side,
    tradeAmountUSD: params.amountUSD,
    feeUSD,
    timestamp:      Date.now(),
  };
  _entries.push(entry);
  _totalCollected += feeUSD;
  return entry;
}

export function getFeeSummary() {
  return {
    totalFeesCollected: parseFloat(_totalCollected.toFixed(4)),
    tradeCount:         _entries.length,
    feeRatePct:         PLATFORM_FEE_RATE * 100,
    recentFees:         [..._entries].reverse().slice(0, 10),
  };
}

export function getAllFees(): FeeEntry[] {
  return [..._entries].reverse();
}
