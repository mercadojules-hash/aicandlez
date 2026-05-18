/**
 * Top tickers for the institutional dashboard.
 *
 * Heartbeat row = 3 crypto majors + 3 equity bellwethers (Bloomberg-style strip).
 * Signal grids  = Top 20 crypto + Top 20 equities (long/short capable).
 */

export interface TickerSpec {
  symbol:  string;   // API symbol (e.g. BTCUSD, NVDA)
  label:   string;   // Display ticker (e.g. BTC, NVDA)
  display: string;   // Pretty form (e.g. BTC/USD, NVDA)
  color:   string;   // Brand color tint
  kind:    "crypto" | "equity";
  sector?: string;   // For equity rows
}

/* ── Top heartbeat (full-width hero strip) ──────────────────────────────── */
export const HEARTBEAT: TickerSpec[] = [
  { symbol: "BTCUSD", label: "BTC",  display: "BTC/USD", color: "#F7931A", kind: "crypto" },
  { symbol: "ETHUSD", label: "ETH",  display: "ETH/USD", color: "#7CFF00", kind: "crypto" },
  { symbol: "SOLUSD", label: "SOL",  display: "SOL/USD", color: "#66FF66", kind: "crypto" },
  { symbol: "NVDA",   label: "NVDA", display: "NVDA",    color: "#76B900", kind: "equity", sector: "Semis"     },
  { symbol: "TSLA",   label: "TSLA", display: "TSLA",    color: "#E82127", kind: "equity", sector: "Auto/AI"   },
  { symbol: "SPY",    label: "SPY",  display: "SPY",     color: "#A0FFA0", kind: "equity", sector: "Index"     },
];

/* ── Top 20 crypto signals (long + short capable) ───────────────────────── */
export const CRYPTO_20: TickerSpec[] = [
  { symbol: "BTCUSD",   label: "BTC",   display: "BTC/USD",   color: "#F7931A", kind: "crypto" },
  { symbol: "ETHUSD",   label: "ETH",   display: "ETH/USD",   color: "#627EEA", kind: "crypto" },
  { symbol: "SOLUSD",   label: "SOL",   display: "SOL/USD",   color: "#9945FF", kind: "crypto" },
  { symbol: "XRPUSD",   label: "XRP",   display: "XRP/USD",   color: "#00AAE4", kind: "crypto" },
  { symbol: "ADAUSD",   label: "ADA",   display: "ADA/USD",   color: "#0033AD", kind: "crypto" },
  { symbol: "AVAXUSD",  label: "AVAX",  display: "AVAX/USD",  color: "#E84142", kind: "crypto" },
  { symbol: "DOGEUSD",  label: "DOGE",  display: "DOGE/USD",  color: "#C2A633", kind: "crypto" },
  { symbol: "LINKUSD",  label: "LINK",  display: "LINK/USD",  color: "#2A5ADA", kind: "crypto" },
  { symbol: "DOTUSD",   label: "DOT",   display: "DOT/USD",   color: "#E6007A", kind: "crypto" },
  { symbol: "MATICUSD", label: "MATIC", display: "MATIC/USD", color: "#8247E5", kind: "crypto" },
  { symbol: "LTCUSD",   label: "LTC",   display: "LTC/USD",   color: "#345D9D", kind: "crypto" },
  { symbol: "BCHUSD",   label: "BCH",   display: "BCH/USD",   color: "#0AC18E", kind: "crypto" },
  { symbol: "UNIUSD",   label: "UNI",   display: "UNI/USD",   color: "#FF007A", kind: "crypto" },
  { symbol: "ATOMUSD",  label: "ATOM",  display: "ATOM/USD",  color: "#5064FB", kind: "crypto" },
  { symbol: "NEARUSD",  label: "NEAR",  display: "NEAR/USD",  color: "#C5F4E2", kind: "crypto" },
  { symbol: "APTUSD",   label: "APT",   display: "APT/USD",   color: "#00D1B2", kind: "crypto" },
  { symbol: "ARBUSD",   label: "ARB",   display: "ARB/USD",   color: "#28A0F0", kind: "crypto" },
  { symbol: "OPUSD",    label: "OP",    display: "OP/USD",    color: "#FF0420", kind: "crypto" },
  { symbol: "INJUSD",   label: "INJ",   display: "INJ/USD",   color: "#00F2FE", kind: "crypto" },
  { symbol: "SUIUSD",   label: "SUI",   display: "SUI/USD",   color: "#4DA2FF", kind: "crypto" },
];

/* ── Top 20 equity signals (long + short capable) ───────────────────────── */
export const EQUITIES_20: TickerSpec[] = [
  { symbol: "NVDA",  label: "NVDA",  display: "NVDA",  color: "#76B900", kind: "equity", sector: "Semis"          },
  { symbol: "TSLA",  label: "TSLA",  display: "TSLA",  color: "#E82127", kind: "equity", sector: "Auto/AI"        },
  { symbol: "AAPL",  label: "AAPL",  display: "AAPL",  color: "#A2AAAD", kind: "equity", sector: "Mega Tech"      },
  { symbol: "MSFT",  label: "MSFT",  display: "MSFT",  color: "#00A4EF", kind: "equity", sector: "Mega Tech"      },
  { symbol: "META",  label: "META",  display: "META",  color: "#0668E1", kind: "equity", sector: "Mega Tech"      },
  { symbol: "AMD",   label: "AMD",   display: "AMD",   color: "#ED1C24", kind: "equity", sector: "Semis"          },
  { symbol: "GOOGL", label: "GOOGL", display: "GOOGL", color: "#4285F4", kind: "equity", sector: "Mega Tech"      },
  { symbol: "AMZN",  label: "AMZN",  display: "AMZN",  color: "#FF9900", kind: "equity", sector: "E-Comm"         },
  { symbol: "PLTR",  label: "PLTR",  display: "PLTR",  color: "#1A1A1A", kind: "equity", sector: "AI Software"    },
  { symbol: "AVGO",  label: "AVGO",  display: "AVGO",  color: "#CC092F", kind: "equity", sector: "Semis"          },
  { symbol: "COIN",  label: "COIN",  display: "COIN",  color: "#0052FF", kind: "equity", sector: "Crypto Equity"  },
  { symbol: "MSTR",  label: "MSTR",  display: "MSTR",  color: "#FF6B00", kind: "equity", sector: "Crypto Equity"  },
  { symbol: "SMCI",  label: "SMCI",  display: "SMCI",  color: "#10B981", kind: "equity", sector: "AI Hardware"    },
  { symbol: "CRWD",  label: "CRWD",  display: "CRWD",  color: "#FA0F00", kind: "equity", sector: "Security"       },
  { symbol: "SHOP",  label: "SHOP",  display: "SHOP",  color: "#95BF47", kind: "equity", sector: "SaaS"           },
  { symbol: "UBER",  label: "UBER",  display: "UBER",  color: "#000000", kind: "equity", sector: "Mobility"       },
  { symbol: "NFLX",  label: "NFLX",  display: "NFLX",  color: "#E50914", kind: "equity", sector: "Media"          },
  { symbol: "DIS",   label: "DIS",   display: "DIS",   color: "#113CCF", kind: "equity", sector: "Media"          },
  { symbol: "BA",    label: "BA",    display: "BA",    color: "#0039A6", kind: "equity", sector: "Industrial"     },
  { symbol: "SPY",   label: "SPY",   display: "SPY",   color: "#A0FFA0", kind: "equity", sector: "Index"          },
];

/* ── Signal types (rotating per row for visual variety) ─────────────────── */
export const SIGNAL_TYPES = ["SCALP", "SWING", "MOMENTUM", "BREAKOUT", "REVERSAL", "TREND"] as const;
export type SignalType = typeof SIGNAL_TYPES[number];
