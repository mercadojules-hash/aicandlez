// ── Types ──────────────────────────────────────────────────────────────────────

export type SentimentLabel =
  | "EXTREME_FEAR" | "FEAR" | "NEUTRAL" | "GREED" | "EXTREME_GREED";

export interface Headline {
  id:        string;
  title:     string;
  source:    string;
  url:       string;
  symbol:    string | null;   // null = market-wide
  score:     number;          // -100 to +100
  magnitude: "low" | "medium" | "high";
  publishedAt: number;        // unix ms
}

export interface SymbolSentiment {
  symbol:         string;
  displayName:    string;
  score:          number;     // -100 to +100
  label:          SentimentLabel;
  signal:         "BULLISH" | "BEARISH" | "NEUTRAL";
  signalStrength: "STRONG" | "MODERATE" | "WEAK";
  confidenceAdj:  number;     // adjustment to AI confidence (-20 to +20)
  headlines:      Headline[];
  updatedAt:      number;
}

export interface MarketSentiment {
  composite:    number;       // -100 to +100
  label:        SentimentLabel;
  fearGreed:    number;       // 0–100 (remapped)
  description:  string;
  updatedAt:    number;
}

export interface SentimentOverview {
  market:    MarketSentiment;
  assets:    SymbolSentiment[];
  allNews:   Headline[];
  updatedAt: number;
}

// ── Headline pool ──────────────────────────────────────────────────────────────

const HEADLINE_POOL: Array<{
  title:   string;
  source:  string;
  symbol:  string | null;
  score:   number;
}> = [
  // BTC bullish
  { title: "Bitcoin breaks key resistance as ETF inflows hit 3-month high",           source: "CoinDesk",        symbol: "BTCUSD",  score: 72 },
  { title: "MicroStrategy adds 5,000 BTC to treasury amid market rally",              source: "Bloomberg Crypto",symbol: "BTCUSD",  score: 68 },
  { title: "Bitcoin dominance rises to 58% — altcoins lag as institutions rotate",    source: "Decrypt",         symbol: "BTCUSD",  score: 45 },
  { title: "On-chain data: BTC whale accumulation strongest since Q4 2024",           source: "Glassnode",       symbol: "BTCUSD",  score: 80 },
  { title: "U.S. spot Bitcoin ETFs record $620M net inflow — fourth consecutive day", source: "The Block",       symbol: "BTCUSD",  score: 75 },
  { title: "Bitcoin miners' revenues stabilize post-halving — hash rate at ATH",      source: "CoinTelegraph",   symbol: "BTCUSD",  score: 55 },

  // BTC bearish
  { title: "Bitcoin rejects $80K again — bears defend key overhead supply zone",      source: "TradingView News",symbol: "BTCUSD",  score: -55 },
  { title: "Mt. Gox trustee moves $380M BTC — market braces for potential sell",     source: "CryptoSlate",     symbol: "BTCUSD",  score: -70 },
  { title: "U.S. SEC delays decision on spot Bitcoin options — uncertainty lingers",  source: "Reuters",         symbol: "BTCUSD",  score: -42 },
  { title: "Long-term holders begin distribution — LTH-SOPR crosses above 1.05",     source: "Glassnode",       symbol: "BTCUSD",  score: -48 },

  // ETH bullish
  { title: "Ethereum Layer-2 TVL surpasses $50B — ecosystem expansion accelerates",  source: "DeFiLlama",       symbol: "ETHUSD",  score: 65 },
  { title: "Ethereum staking ratio hits 35% — deflationary pressure intensifies",    source: "Beacon Chain",    symbol: "ETHUSD",  score: 58 },
  { title: "BlackRock expands tokenization platform to Ethereum mainnet",             source: "Bloomberg",       symbol: "ETHUSD",  score: 78 },
  { title: "ETH/BTC ratio bounces off 0.028 support — relative strength improving",  source: "Decrypt",         symbol: "ETHUSD",  score: 52 },

  // ETH bearish
  { title: "Ethereum gas fees spike to 80 gwei — DeFi users migrate to L2s",        source: "Etherscan",       symbol: "ETHUSD",  score: -38 },
  { title: "Large ETH unlock from early stakers pressures spot market",              source: "CoinDesk",        symbol: "ETHUSD",  score: -62 },
  { title: "ETH derivatives show elevated put/call ratio — caution signals",         source: "Deribit Insights",symbol: "ETHUSD",  score: -44 },

  // SOL bullish
  { title: "Solana memecoin season reignites — DEX volume surges 280% in 24h",       source: "Decrypt",         symbol: "SOLUSD",  score: 70 },
  { title: "Firedancer client launches on mainnet — SOL throughput doubles",         source: "The Block",       symbol: "SOLUSD",  score: 88 },
  { title: "Solana reclaims $135 — momentum indicators align for continuation",      source: "CoinTelegraph",   symbol: "SOLUSD",  score: 60 },
  { title: "Visa expands Solana USDC settlement program to 25 new banks",            source: "Bloomberg",       symbol: "SOLUSD",  score: 82 },

  // SOL bearish
  { title: "Solana network congestion returns — validators report missed slots",     source: "Solana Status",   symbol: "SOLUSD",  score: -58 },
  { title: "SOL VC unlock worth $240M approaching — sell pressure expected",         source: "Messari",         symbol: "SOLUSD",  score: -72 },
  { title: "Solana DEX volume drops 45% week-over-week — momentum fading",          source: "DeFiLlama",       symbol: "SOLUSD",  score: -40 },

  // Market-wide bullish
  { title: "Fed signals no rate hikes in 2026 — risk assets rally globally",         source: "Reuters",         symbol: null,      score: 75 },
  { title: "Crypto total market cap reclaims $3T — bull market thesis intact",       source: "CoinMarketCap",   symbol: null,      score: 80 },
  { title: "Institutional crypto adoption at all-time high — Q1 2026 report",        source: "Fidelity Digital",symbol: null,      score: 70 },
  { title: "Stablecoin supply reaches $220B — dry powder signals potential buying",  source: "Kaiko",           symbol: null,      score: 55 },

  // Market-wide bearish
  { title: "Regulatory crackdown fears resurface as G7 drafts new crypto tax rules", source: "Financial Times", symbol: null,      score: -65 },
  { title: "Crypto hedge funds report worst month of 2026 — risk-off sentiment",     source: "Bloomberg",       symbol: null,      score: -60 },
  { title: "Global risk appetite drops — equities and crypto sell off in tandem",    source: "Reuters",         symbol: null,      score: -58 },
  { title: "Tether audit controversy reignites — USDT depegs briefly to $0.998",     source: "CoinDesk",        symbol: null,      score: -72 },
];

// ── Seed helpers ───────────────────────────────────────────────────────────────

// Rotate headlines every 5 minutes — bucket = floor(minutes / 5)
function timeBucket(): number {
  return Math.floor(Date.now() / (5 * 60 * 1000));
}

// Seeded pseudo-random (LCG) — deterministic per bucket + seed
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function pickHeadlines(
  pool: typeof HEADLINE_POOL,
  symbolFilter: string | null,
  count: number,
  rand: () => number,
): Headline[] {
  const filtered = symbolFilter === null
    ? pool.filter(h => h.symbol === null)
    : pool.filter(h => h.symbol === symbolFilter || h.symbol === null);

  // Shuffle
  const arr = [...filtered];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }

  const picked = arr.slice(0, Math.min(count, arr.length));
  const now    = Date.now();

  return picked.map((h, i) => ({
    id:          `H-${symbolFilter ?? "MKT"}-${i}-${timeBucket()}-${h.title.length}`,
    title:       h.title,
    source:      h.source,
    url:         "#",
    symbol:      h.symbol,
    score:       scoreJitter(h.score, rand),
    magnitude:   Math.abs(h.score) > 60 ? "high" : Math.abs(h.score) > 30 ? "medium" : "low",
    publishedAt: now - Math.floor(rand() * 4 * 3600 * 1000),   // 0–4h ago
  }));
}

function scoreJitter(base: number, rand: () => number): number {
  const jitter = (rand() - 0.5) * 20;
  return Math.max(-100, Math.min(100, Math.round(base + jitter)));
}

// ── Label helpers ──────────────────────────────────────────────────────────────

function sentimentLabel(score: number): SentimentLabel {
  if (score <= -60) return "EXTREME_FEAR";
  if (score < -20)  return "FEAR";
  if (score <= 20)  return "NEUTRAL";
  if (score < 60)   return "GREED";
  return "EXTREME_GREED";
}

function signalFromScore(score: number): {
  signal: "BULLISH" | "BEARISH" | "NEUTRAL";
  strength: "STRONG" | "MODERATE" | "WEAK";
  adj: number;
} {
  if (score >= 60)  return { signal: "BULLISH",  strength: "STRONG",   adj: 20  };
  if (score >= 25)  return { signal: "BULLISH",  strength: "MODERATE", adj: 10  };
  if (score >= 0)   return { signal: "BULLISH",  strength: "WEAK",     adj: 5   };
  if (score > -25)  return { signal: "BEARISH",  strength: "WEAK",     adj: -5  };
  if (score > -60)  return { signal: "BEARISH",  strength: "MODERATE", adj: -10 };
  return                   { signal: "BEARISH",  strength: "STRONG",   adj: -20 };
}

function fearGreed(score: number): number {
  return Math.round((score + 100) / 2);
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let cachedBucket = -1;
let cachedOverview: SentimentOverview | null = null;

// ── Public API ─────────────────────────────────────────────────────────────────

export function getSentimentOverview(): SentimentOverview {
  const bucket = timeBucket();
  if (bucket === cachedBucket && cachedOverview) return cachedOverview;

  const rand = seeded(bucket * 31337 + 7919);

  const SYMBOLS = [
    { symbol: "BTCUSD", displayName: "BTC" },
    { symbol: "ETHUSD", displayName: "ETH" },
    { symbol: "SOLUSD", displayName: "SOL" },
  ];

  const assets: SymbolSentiment[] = SYMBOLS.map(({ symbol, displayName }) => {
    const headlines = pickHeadlines(HEADLINE_POOL, symbol, 4, rand);
    const score     = headlines.length > 0
      ? Math.round(headlines.reduce((s, h) => s + h.score, 0) / headlines.length)
      : 0;
    const { signal, strength, adj } = signalFromScore(score);
    return {
      symbol, displayName, score,
      label:          sentimentLabel(score),
      signal, signalStrength: strength,
      confidenceAdj:  adj,
      headlines,
      updatedAt:      Date.now(),
    };
  });

  const marketHeadlines = pickHeadlines(HEADLINE_POOL, null, 4, rand);
  const compositeBase   = assets.reduce((s, a) => s + a.score, 0) / assets.length;
  const marketBoost     = marketHeadlines.length > 0
    ? marketHeadlines.reduce((s, h) => s + h.score, 0) / marketHeadlines.length : 0;
  const composite = Math.round(compositeBase * 0.7 + marketBoost * 0.3);

  const DESCRIPTIONS: Record<SentimentLabel, string> = {
    EXTREME_FEAR:  "Panic selling — historically a contrarian buying opportunity.",
    FEAR:          "Risk-off mood — investors cautious, volatility elevated.",
    NEUTRAL:       "Mixed signals — market lacks clear directional conviction.",
    GREED:         "Positive momentum — buyers in control with moderate risk.",
    EXTREME_GREED: "Euphoria — strong momentum but watch for mean reversion.",
  };

  const label = sentimentLabel(composite);

  const market: MarketSentiment = {
    composite,
    label,
    fearGreed: fearGreed(composite),
    description: DESCRIPTIONS[label],
    updatedAt:   Date.now(),
  };

  const allNews = [...marketHeadlines, ...assets.flatMap(a => a.headlines)]
    .sort((a, b) => b.publishedAt - a.publishedAt);

  const overview: SentimentOverview = {
    market, assets, allNews, updatedAt: Date.now(),
  };

  cachedBucket  = bucket;
  cachedOverview = overview;
  return overview;
}

export function getSymbolSentiment(symbol: string): SymbolSentiment | null {
  const overview = getSentimentOverview();
  return overview.assets.find(a => a.symbol === symbol.toUpperCase()) ?? null;
}

// ── Confidence adjustment (called from AI signal layer) ──────────────────────

export function applySentimentAdjustment(
  baseConfidence: number,
  decision: "BUY" | "SELL" | "HOLD",
  symbol: string,
): { adjustedConfidence: number; sentimentScore: number; sentimentAdj: number; aligned: boolean } {
  const sym = getSymbolSentiment(symbol);
  if (!sym) return { adjustedConfidence: baseConfidence, sentimentScore: 0, sentimentAdj: 0, aligned: false };

  // Sentiment aligns with AI decision?
  const aligned =
    (decision === "BUY"  && sym.signal === "BULLISH") ||
    (decision === "SELL" && sym.signal === "BEARISH") ||
    (decision === "HOLD" && sym.signal === "NEUTRAL");

  // Misaligned: invert the adj (penalize)
  const sentimentAdj = aligned ? sym.confidenceAdj : -Math.abs(sym.confidenceAdj) * 0.5;
  const adjusted = Math.max(5, Math.min(99, Math.round(baseConfidence + sentimentAdj)));

  return {
    adjustedConfidence: adjusted,
    sentimentScore:     sym.score,
    sentimentAdj:       Math.round(sentimentAdj),
    aligned,
  };
}
