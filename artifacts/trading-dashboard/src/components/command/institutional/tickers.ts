/**
 * Top tickers for the institutional dashboard.
 *
 * Heartbeat row = 3 crypto majors + 3 equity bellwethers (Bloomberg-style strip).
 * Signal grids  = Top 20 crypto + Top 20 equities (long/short capable).
 */

export interface TickerSpec {
  symbol:   string;   // API symbol (e.g. BTCUSD, NVDA)
  label:    string;   // Display ticker (e.g. BTC, NVDA)
  display:  string;   // Pretty form (e.g. BTC/USD, NVDA)
  color:    string;   // Brand color tint
  kind:     "crypto" | "equity";
  sector?:  string;   // For equity rows
  name?:    string;   // Full name (e.g. "Stellar", "Monero") for search
  aliases?: string[]; // Search aliases (e.g. ["lumens"] for XLM)
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

/* ── Top crypto signals (long + short capable) ──────────────────────────── *
 * The top 20 are rendered by default; the rest are reachable via the in-card
 * search bar (which matches symbol, label, name, and aliases — so "MON"
 * surfaces Monero/XMR, "STELL" surfaces Stellar/XLM, etc.).
 */
export const CRYPTO_20: TickerSpec[] = [
  { symbol: "BTCUSD",   label: "BTC",   display: "BTC/USD",   color: "#F7931A", kind: "crypto", name: "Bitcoin" },
  { symbol: "ETHUSD",   label: "ETH",   display: "ETH/USD",   color: "#627EEA", kind: "crypto", name: "Ethereum", aliases: ["ether"] },
  { symbol: "SOLUSD",   label: "SOL",   display: "SOL/USD",   color: "#9945FF", kind: "crypto", name: "Solana" },
  { symbol: "XRPUSD",   label: "XRP",   display: "XRP/USD",   color: "#00AAE4", kind: "crypto", name: "Ripple" },
  { symbol: "ADAUSD",   label: "ADA",   display: "ADA/USD",   color: "#0033AD", kind: "crypto", name: "Cardano" },
  { symbol: "AVAXUSD",  label: "AVAX",  display: "AVAX/USD",  color: "#E84142", kind: "crypto", name: "Avalanche" },
  { symbol: "DOGEUSD",  label: "DOGE",  display: "DOGE/USD",  color: "#C2A633", kind: "crypto", name: "Dogecoin" },
  { symbol: "LINKUSD",  label: "LINK",  display: "LINK/USD",  color: "#2A5ADA", kind: "crypto", name: "Chainlink" },
  { symbol: "DOTUSD",   label: "DOT",   display: "DOT/USD",   color: "#E6007A", kind: "crypto", name: "Polkadot" },
  { symbol: "MATICUSD", label: "MATIC", display: "MATIC/USD", color: "#8247E5", kind: "crypto", name: "Polygon" },
  { symbol: "LTCUSD",   label: "LTC",   display: "LTC/USD",   color: "#345D9D", kind: "crypto", name: "Litecoin" },
  { symbol: "BCHUSD",   label: "BCH",   display: "BCH/USD",   color: "#0AC18E", kind: "crypto", name: "Bitcoin Cash" },
  { symbol: "UNIUSD",   label: "UNI",   display: "UNI/USD",   color: "#FF007A", kind: "crypto", name: "Uniswap" },
  { symbol: "ATOMUSD",  label: "ATOM",  display: "ATOM/USD",  color: "#5064FB", kind: "crypto", name: "Cosmos" },
  { symbol: "NEARUSD",  label: "NEAR",  display: "NEAR/USD",  color: "#C5F4E2", kind: "crypto", name: "Near Protocol" },
  { symbol: "APTUSD",   label: "APT",   display: "APT/USD",   color: "#00D1B2", kind: "crypto", name: "Aptos" },
  { symbol: "ARBUSD",   label: "ARB",   display: "ARB/USD",   color: "#28A0F0", kind: "crypto", name: "Arbitrum" },
  { symbol: "OPUSD",    label: "OP",    display: "OP/USD",    color: "#FF0420", kind: "crypto", name: "Optimism" },
  { symbol: "INJUSD",   label: "INJ",   display: "INJ/USD",   color: "#00F2FE", kind: "crypto", name: "Injective" },
  { symbol: "SUIUSD",   label: "SUI",   display: "SUI/USD",   color: "#4DA2FF", kind: "crypto", name: "Sui" },

  /* ── Extended universe — reachable via search ───────────────────────── */
  { symbol: "XLMUSD",   label: "XLM",   display: "XLM/USD",   color: "#7D00FF", kind: "crypto", name: "Stellar",       aliases: ["lumens"] },
  { symbol: "XMRUSD",   label: "XMR",   display: "XMR/USD",   color: "#FF6600", kind: "crypto", name: "Monero",        aliases: ["privacy"] },
  { symbol: "HYPEUSD",  label: "HYPE",  display: "HYPE/USD",  color: "#97FCE4", kind: "crypto", name: "Hyperliquid",   aliases: ["hyperliquid"] },
  { symbol: "TONUSD",   label: "TON",   display: "TON/USD",   color: "#0098EA", kind: "crypto", name: "Toncoin",       aliases: ["telegram"] },
  { symbol: "TRXUSD",   label: "TRX",   display: "TRX/USD",   color: "#EF0027", kind: "crypto", name: "Tron" },
  { symbol: "ETCUSD",   label: "ETC",   display: "ETC/USD",   color: "#3AB83A", kind: "crypto", name: "Ethereum Classic" },
  { symbol: "ICPUSD",   label: "ICP",   display: "ICP/USD",   color: "#F15A24", kind: "crypto", name: "Internet Computer" },
  { symbol: "FILUSD",   label: "FIL",   display: "FIL/USD",   color: "#0090FF", kind: "crypto", name: "Filecoin" },
  { symbol: "HBARUSD",  label: "HBAR",  display: "HBAR/USD",  color: "#222222", kind: "crypto", name: "Hedera" },
  { symbol: "AAVEUSD",  label: "AAVE",  display: "AAVE/USD",  color: "#B6509E", kind: "crypto", name: "Aave" },
  { symbol: "MKRUSD",   label: "MKR",   display: "MKR/USD",   color: "#1AAB9B", kind: "crypto", name: "Maker",         aliases: ["dai"] },
  { symbol: "ALGOUSD",  label: "ALGO",  display: "ALGO/USD",  color: "#000000", kind: "crypto", name: "Algorand" },
  { symbol: "SANDUSD",  label: "SAND",  display: "SAND/USD",  color: "#00ADEF", kind: "crypto", name: "The Sandbox" },
  { symbol: "MANAUSD",  label: "MANA",  display: "MANA/USD",  color: "#FF2D55", kind: "crypto", name: "Decentraland" },
  { symbol: "AXSUSD",   label: "AXS",   display: "AXS/USD",   color: "#0055D4", kind: "crypto", name: "Axie Infinity" },
  { symbol: "GRTUSD",   label: "GRT",   display: "GRT/USD",   color: "#6747ED", kind: "crypto", name: "The Graph" },
  { symbol: "SNXUSD",   label: "SNX",   display: "SNX/USD",   color: "#00D1FF", kind: "crypto", name: "Synthetix" },
  { symbol: "CRVUSD",   label: "CRV",   display: "CRV/USD",   color: "#A4131A", kind: "crypto", name: "Curve DAO" },
  { symbol: "COMPUSD",  label: "COMP",  display: "COMP/USD",  color: "#00D395", kind: "crypto", name: "Compound" },
  { symbol: "LDOUSD",   label: "LDO",   display: "LDO/USD",   color: "#F69988", kind: "crypto", name: "Lido DAO",      aliases: ["staking"] },
  { symbol: "RNDRUSD",  label: "RNDR",  display: "RNDR/USD",  color: "#B53AFB", kind: "crypto", name: "Render" },
  { symbol: "FTMUSD",   label: "FTM",   display: "FTM/USD",   color: "#13B5EC", kind: "crypto", name: "Fantom" },
  { symbol: "FETUSD",   label: "FET",   display: "FET/USD",   color: "#003A6A", kind: "crypto", name: "Fetch.ai",      aliases: ["ai"] },
  { symbol: "RUNEUSD",  label: "RUNE",  display: "RUNE/USD",  color: "#33FF99", kind: "crypto", name: "Thorchain" },
  { symbol: "KASUSD",   label: "KAS",   display: "KAS/USD",   color: "#70C7BA", kind: "crypto", name: "Kaspa" },
  { symbol: "PEPEUSD",  label: "PEPE",  display: "PEPE/USD",  color: "#4BA539", kind: "crypto", name: "Pepe",          aliases: ["meme"] },
  { symbol: "WIFUSD",   label: "WIF",   display: "WIF/USD",   color: "#FFB6C1", kind: "crypto", name: "Dogwifhat",     aliases: ["meme"] },
  { symbol: "BONKUSD",  label: "BONK",  display: "BONK/USD",  color: "#FFA500", kind: "crypto", name: "Bonk",          aliases: ["meme"] },
  { symbol: "JUPUSD",   label: "JUP",   display: "JUP/USD",   color: "#FBA43A", kind: "crypto", name: "Jupiter" },
  { symbol: "PYTHUSD",  label: "PYTH",  display: "PYTH/USD",  color: "#E6DAFF", kind: "crypto", name: "Pyth Network",  aliases: ["oracle"] },
  { symbol: "TIAUSD",   label: "TIA",   display: "TIA/USD",   color: "#7B2BF9", kind: "crypto", name: "Celestia" },
  { symbol: "SEIUSD",   label: "SEI",   display: "SEI/USD",   color: "#9E1F19", kind: "crypto", name: "Sei" },
  { symbol: "STXUSD",   label: "STX",   display: "STX/USD",   color: "#5546FF", kind: "crypto", name: "Stacks" },
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
